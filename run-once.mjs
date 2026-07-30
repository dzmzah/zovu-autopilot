// Один запуск автопилота БЕЗ n8n и без локального сервера.
// Именно это выполняется на серверах GitHub Actions по расписанию.
//
//   node run-once.mjs            — сделать и опубликовать
//   node run-once.mjs --dry      — только сделать, без публикации
//
// Секреты берутся из переменных окружения (на ПК — из файла .env):
//   INSTAGRAM_TOKEN  — обязательный
//   GEMINI_API_KEY   — текст (бесплатный тир). Без него на сервере работать нечему
import { readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makePost } from './content-engine.mjs';
import { renderPost, renderCarousel } from './render.mjs';

const execFileAsync = promisify(execFile);
const DRY = process.argv.includes('--dry');

const IG_API = 'https://graph.instagram.com/v23.0';
// На сервере GitHub Actions картинки кладём в этот же репозиторий (он публичный),
// поэтому отдельный токен доступа не нужен. Локально — в zovu-cdn.
const CDN_REPO = process.env.CDN_REPO || path.join(import.meta.dirname, '..', 'zovu-cdn');
const CDN_SUBDIR = 'posts';
const RAW_BASE =
  process.env.RAW_BASE || 'https://raw.githubusercontent.com/dzmzah/zovu-cdn/main';

async function env(key) {
  if (process.env[key]) return process.env[key].trim();
  try {
    const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8');
    const m = raw.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.+)\\s*$', 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function git(args, cwd = CDN_REPO) {
  // Имя автора задаём прямо в команде: на серверах GitHub Actions
  // глобальной настройки git нет, и коммит падает с «Author identity unknown».
  const ident = ['-c', 'user.name=zovu-autopilot', '-c', 'user.email=zovu.pl@gmail.com'];
  const { stdout, stderr } = await execFileAsync('git', ['-C', cwd, ...ident, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return (stdout || '') + (stderr || '');
}

async function waitPublic(url) {
  for (let i = 0; i < 25; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return url;
    } catch {
      /* сеть моргнула */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`${url} не отдаётся публично`);
}

async function pushToCdn(files) {
  const dir = path.join(CDN_REPO, CDN_SUBDIR);
  await mkdir(dir, { recursive: true });
  for (const f of files) await copyFile(f.file, path.join(dir, f.name));

  await git(['add', '--all']);
  try {
    await git(['commit', '-m', `post: ${files[0].name}`]);
  } catch (e) {
    if (!/nothing to commit/i.test(String(e.stdout || e.message))) throw e;
  }
  await git(['push', 'origin', 'HEAD:main']);

  const urls = files.map((f) => `${RAW_BASE}/${CDN_SUBDIR}/${f.name}`);
  await Promise.all(urls.map(waitPublic));
  return urls;
}

async function igPost(endpoint, body) {
  const r = await fetch(`${IG_API}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok || !j.id) throw new Error(`${endpoint}: ` + JSON.stringify(j));
  return j;
}

// Instagram обрабатывает загруженную картинку не мгновенно.
// Если публиковать сразу, прилетает «Media ID is not available» (код 9007).
// Ждём, пока контейнер перейдёт в FINISHED.
async function waitReady(containerId, token, label = '') {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(
        `${IG_API}/${containerId}?fields=status_code,status&access_token=${token}`
      ).then((x) => x.json());
      if (r.status_code === 'FINISHED') return true;
      if (r.status_code === 'ERROR') throw new Error(`kontener ${label} w błędzie: ${r.status || ''}`);
    } catch (e) {
      if (String(e.message).includes('w błędzie')) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`kontener ${label} nie zdążył się przetworzyć`);
}

async function publish(urls, caption) {
  const token = await env('INSTAGRAM_TOKEN');
  if (!token) throw new Error('нет INSTAGRAM_TOKEN');

  let container;
  if (urls.length === 1) {
    container = await igPost('me/media', { image_url: urls[0], caption, access_token: token });
  } else {
    const children = [];
    for (const [i, url] of urls.entries()) {
      const c = await igPost('me/media', { image_url: url, is_carousel_item: true, access_token: token });
      await waitReady(c.id, token, `slajd ${i + 1}`);
      children.push(c.id);
    }
    container = await igPost('me/media', {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
      access_token: token,
    });
  }

  await waitReady(container.id, token, 'główny');

  // даже после FINISHED Instagram иногда просит подождать — пробуем несколько раз
  let published = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      published = await igPost('me/media_publish', { creation_id: container.id, access_token: token });
      break;
    } catch (e) {
      if (attempt === 5 || !/9007|not ready|not available/i.test(e.message)) throw e;
      console.log(`[autopilot] Instagram jeszcze nie gotowy, próba ${attempt + 1} za 5s`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  let permalink = null;
  try {
    const info = await fetch(`${IG_API}/${published.id}?fields=permalink&access_token=${token}`).then((r) => r.json());
    permalink = info.permalink || null;
  } catch {
    /* не критично */
  }
  return { mediaId: published.id, permalink };
}

// ── поехали ───────────────────────────────────────────────────────
const started = Date.now();
console.log(`[autopilot] start ${new Date().toISOString()}${DRY ? ' (dry run)' : ''}`);

const post = await makePost({ trends: true });
console.log(`[autopilot] #${post.meta.counter} ${post.kind} | ${post.meta.format} | ${post.meta.provider}`);
console.log(`[autopilot] ${post.data.title}`);

const files = post.kind === 'carousel' ? await renderCarousel(post.data) : [await renderPost(post.data)];
console.log(`[autopilot] obrazki: ${files.length}`);

if (DRY) {
  console.log('[autopilot] dry run — nie publikuję');
  console.log(files.map((f) => f.file).join('\n'));
  process.exit(0);
}

const urls = await pushToCdn(files);
const result = await publish(urls, post.caption);
console.log(`[autopilot] Instagram: ${result.permalink || result.mediaId}`);

// Facebook — тем же контентом. Если токена нет, шаг пропускается,
// и это не ломает публикацию в Instagram.
try {
  const { publishToFacebook } = await import('./fb-publish.mjs');
  const fb = await publishToFacebook({ imageUrls: urls, caption: post.caption });
  console.log(fb.skipped ? `[autopilot] Facebook: pominięty (${fb.reason})` : `[autopilot] Facebook: ${fb.postId}`);
} catch (e) {
  console.warn(`[autopilot] Facebook nie wyszedł: ${e.message}`);
}

// состояние ротации возвращаем в репозиторий, чтобы следующий запуск его увидел
try {
  const stateFile = path.join(import.meta.dirname, 'state.json');
  const state = await readFile(stateFile, 'utf8');
  await writeFile(stateFile, state, 'utf8');
} catch {
  /* нечего сохранять */
}

console.log(`[autopilot] gotowe w ${Math.round((Date.now() - started) / 1000)}s`);
