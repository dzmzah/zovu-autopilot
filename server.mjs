#!/usr/bin/env node
// Локальный мостик для n8n.
//   POST http://127.0.0.1:8899/make-post
//   body: {"eyebrow":"...","title":"...","bullets":["..."],"footer":"zovu.pl","name":"opcjonalnie"}
//   ответ: {"ok":true,"url":"https://raw.githubusercontent.com/.../post-x.jpg","file":"C:\\..."}
//
// Что делает: рисует картинку → кладёт в репо zovu-cdn → пушит на GitHub →
// проверяет, что публичный URL реально отдаёт 200 → возвращает URL.
// Публичный URL нужен потому, что Instagram Graph API забирает картинку сам, по ссылке.

import http from 'node:http';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { renderPost, renderCarousel, BG_DIR } from './render.mjs';
import { makePost } from './content-engine.mjs';

// ── Токен Instagram ──────────────────────────────────────────────
// Лежит в локальном файле .env рядом со скриптом, в git не попадает.
// Обновить: сгенерировать новый токен в приложении Meta и заменить строку в .env
const ENV_FILE = path.join(import.meta.dirname, '.env');
const IG_API = 'https://graph.instagram.com/v23.0';

async function igToken() {
  const raw = await readFile(ENV_FILE, 'utf8');
  const m = raw.match(/^\s*INSTAGRAM_TOKEN\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error('в .env нет строки INSTAGRAM_TOKEN=...');
  const t = m[1].trim();
  if (!t || t === 'WKLEJ_TU_TOKEN') throw new Error('в .env лежит заглушка, а не токен');
  return t;
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

// Публикация в Instagram: два шага по документации Meta —
// сначала создаём «контейнер» с картинкой и подписью, потом публикуем его.
// Для карусели: контейнер на каждый слайд → один контейнер-карусель → публикация.
async function publishToInstagram({ imageUrl, imageUrls, caption }) {
  const token = await igToken();
  const list = Array.isArray(imageUrls) && imageUrls.length ? imageUrls : [imageUrl];

  let created;
  if (list.length === 1) {
    created = await igPost('me/media', { image_url: list[0], caption, access_token: token });
  } else {
    if (list.length > 10) throw new Error('Instagram przyjmuje maksymalnie 10 slajdow');
    // слайды карусели: is_carousel_item, без подписи
    const children = [];
    for (const url of list) {
      const child = await igPost('me/media', {
        image_url: url,
        is_carousel_item: true,
        access_token: token,
      });
      children.push(child.id);
    }
    created = await igPost('me/media', {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
      access_token: token,
    });
  }

  const publish = await fetch(`${IG_API}/me/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: token }),
  });
  const published = await publish.json();
  if (!publish.ok || !published.id) {
    throw new Error('kontener gotowy, ale publikacja padla: ' + JSON.stringify(published));
  }

  // дотягиваем ссылку на пост, чтобы сразу можно было открыть
  let permalink = null;
  try {
    const info = await fetch(
      `${IG_API}/${published.id}?fields=permalink,timestamp&access_token=${token}`
    ).then((r) => r.json());
    permalink = info.permalink || null;
  } catch {
    /* не критично */
  }

  return { containerId: created.id, mediaId: published.id, permalink };
}

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8899);
const CDN_REPO = process.env.CDN_REPO || 'C:\\Users\\zahar\\zovu-cdn';
// Готовые посты дублируем в папку проекта на диске D, чтобы всё лежало в одном месте
const READY_DIR =
  process.env.ZOVU_READY_DIR || 'D:\\My AI\\Zovu.pl\\Автоматизация\\Посты\\Готовые';
const CDN_SUBDIR = 'posts';
const RAW_BASE = 'https://raw.githubusercontent.com/dzmzah/zovu-cdn/main';

async function git(args) {
  const { stdout, stderr } = await execFileAsync('git', ['-C', CDN_REPO, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return (stdout || '') + (stderr || '');
}

async function waitPublic(url) {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (r.ok) return url;
    } catch {
      /* сеть моргнула — пробуем снова */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`файл запушен, но ${url} пока не отдаётся публично`);
}

// Кладёт файлы в репо ОДНИМ коммитом и ждёт, пока они станут публичными.
async function publishManyToCdn(files) {
  const destDir = path.join(CDN_REPO, CDN_SUBDIR);
  await mkdir(destDir, { recursive: true });
  for (const f of files) await copyFile(f.file, path.join(destDir, f.name));

  // копия для Захара, в папку проекта на D
  try {
    await mkdir(READY_DIR, { recursive: true });
    for (const f of files) await copyFile(f.file, path.join(READY_DIR, f.name));
  } catch (e) {
    console.warn('[cdn] nie udalo sie skopiowac do', READY_DIR, e.message);
  }

  await git(['add', '--all']);
  try {
    const label = files.length === 1 ? files[0].name : `${files.length} plikow (${files[0].name}...)`;
    await git(['commit', '-m', `post: ${label}`]);
  } catch (e) {
    // "nothing to commit" — не ошибка
    if (!/nothing to commit/i.test(String(e.stdout || e.message))) throw e;
  }
  await git(['push', 'origin', 'HEAD:main']);

  const urls = files.map((f) => `${RAW_BASE}/${CDN_SUBDIR}/${f.name}`);
  await Promise.all(urls.map(waitPublic));
  return urls;
}

async function publishToCdn(localFile, fileName) {
  const [url] = await publishManyToCdn([{ file: localFile, name: fileName }]);
  return url;
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  // разрешаем обращаться со страниц (нужно, чтобы забирать сгенерированные картинки)
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, port: PORT, cdn: CDN_REPO });
  }

  // Приём фона из браузера: {"name":"automatyzacja-1","dataBase64":"..."}
  // Сохраняет в библиотеку фонов (папка на диске D).
  if (req.method === 'POST' && req.url === '/save-bg') {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const { name, dataBase64 } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!name || !dataBase64) throw new Error('trzeba name i dataBase64');

      const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.[^.]+$/, '');
      await mkdir(BG_DIR, { recursive: true });
      const file = path.join(BG_DIR, `${safe}.jpg`);
      // приводим к нашему формату сразу при приёме
      await sharp(Buffer.from(dataBase64, 'base64'))
        .resize(1080, 1350, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 90 })
        .toFile(file);

      console.log(`[save-bg] ${file}`);
      return json(res, 200, { ok: true, file });
    } catch (e) {
      console.error('[save-bg] błąd:', e.message);
      return json(res, 500, { ok: false, error: String(e.message || e) });
    }
  }

  // Отдаём готовые картинки из папки out (чтобы можно было смотреть в браузере)
  if (req.method === 'GET' && req.url.startsWith('/out/')) {
    try {
      const name = path.basename(decodeURIComponent(req.url.slice('/out/'.length).split('?')[0]));
      const buf = await readFile(path.join(import.meta.dirname, 'out', name));
      const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/jpeg';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      return res.end(buf);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('nie ma takiego pliku');
    }
  }

  // Галерея слайдов: /galeria?name=karuzela-bledy-social&count=7
  if (req.method === 'GET' && req.url.startsWith('/galeria')) {
    const q = new URL(req.url, 'http://127.0.0.1').searchParams;
    const base = q.get('name') || 'karuzela-bledy-social';
    const count = Number(q.get('count') || 7);
    const title = q.get('title') || 'ZOVU — karuzela';
    const cards = Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      const label = i === 0 ? 'okładka' : i === count - 1 ? 'CTA' : `punkt ${String(i).padStart(2, '0')}`;
      return `<figure><img src="/out/${base}-${n}.jpg" alt="">
        <figcaption><span class="n">${i + 1}/${count}</span><span>${label}</span></figcaption></figure>`;
    }).join('');

    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<title>${title}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0c;color:#fff;font-family:system-ui,sans-serif;padding:32px}
h1{font-size:22px;font-weight:600}
.hint{margin-top:8px;color:#a78bfa;font-size:14px}
.grid{margin-top:28px;display:grid;gap:22px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
figure{background:#111114;border:1px solid #26262d;border-radius:14px;overflow:hidden}
figure img{display:block;width:100%;height:auto}
figcaption{padding:12px 14px;font-size:13px;color:#b9b6c6;display:flex;justify-content:space-between}
.n{color:#a78bfa;font-weight:600}
</style></head><body>
<h1>${title}</h1>
<div class="hint">${count} slajdów · 1080×1350 · gotowe do publikacji</div>
<div class="grid">${cards}</div>
</body></html>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(html);
  }

  // Диагностика: показывает, какие заголовки/параметры реально доходят.
  // Значения секретов НЕ раскрываем — только длину и префикс.
  if (req.url.startsWith('/echo-auth')) {
    const auth = req.headers['authorization'];
    const q = new URL(req.url, 'http://127.0.0.1').searchParams;
    const tok = q.get('access_token');
    return json(res, 200, {
      headerNames: Object.keys(req.headers),
      authorization: auth
        ? { present: true, length: auth.length, prefix: auth.slice(0, 11) }
        : { present: false },
      queryAccessToken: tok
        ? { present: true, length: tok.length, prefix: tok.slice(0, 4) }
        : { present: false },
      queryKeys: [...q.keys()],
    });
  }

  // ПОЛНЫЙ АВТОМАТ: тема и формат по кругу → текст → проверка → слайды → публикация.
  // POST /auto-post            — сделать и опубликовать
  // POST /auto-post?publish=0  — только сделать, без публикации (для проверки)
  if (req.method === 'POST' && req.url.startsWith('/auto-post')) {
    try {
      const q = new URL(req.url, 'http://127.0.0.1').searchParams;
      const doPublish = q.get('publish') !== '0';

      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};

      console.log('[auto] piszę tekst...');
      const post = await makePost(body);
      console.log(`[auto] #${post.meta.counter} ${post.kind} | ${post.meta.format} | ${post.data.title}`);

      // карусель — семь слайдов, зwykły post — jeden obrazek
      const slides = post.kind === 'carousel'
        ? await renderCarousel(post.data)
        : [await renderPost(post.data)];
      const urls = await publishManyToCdn(slides);
      console.log(`[auto] obrazki gotowe: ${urls.length}`);

      let published = null;
      if (doPublish) {
        published = urls.length > 1
          ? await publishToInstagram({ imageUrls: urls, caption: post.caption })
          : await publishToInstagram({ imageUrl: urls[0], caption: post.caption });
        console.log(`[auto] opublikowano: ${published.permalink || published.mediaId}`);
      }

      return json(res, 200, {
        ok: true,
        kind: post.kind,
        counter: post.meta.counter,
        published: Boolean(published),
        permalink: published?.permalink || null,
        title: post.data.title,
        format: post.meta.format,
        topic: post.meta.topic,
        provider: post.meta.provider,
        name: post.data.name,
        slides: urls.length,
        caption: post.caption,
      });
    } catch (e) {
      console.error('[auto] błąd:', e.message);
      return json(res, 500, { ok: false, error: String(e.message || e), attempts: e.attempts || null });
    }
  }

  // Карусель: {"eyebrow","title","subtitle","items":[{heading,text}],"cta":{headline,line},"name"}
  // Отдаёт массив публичных URL по порядку слайдов.
  if (req.method === 'POST' && req.url === '/make-carousel') {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));

      console.log(`[carousel] ${data.title} (${(data.items || []).length} punktow)`);
      const slides = await renderCarousel(data);
      const urls = await publishManyToCdn(slides); // один коммит на всю карусель
      console.log(`[carousel] gotowe: ${urls.length} slajdow`);

      return json(res, 200, { ok: true, count: urls.length, urls, files: slides.map((s) => s.file) });
    } catch (e) {
      console.error('[carousel] błąd:', e.message);
      return json(res, 500, { ok: false, error: String(e.message || e) });
    }
  }

  // Публикация: {"imageUrl":"..."} или карусель {"imageUrls":["...","..."]} + caption
  if (req.method === 'POST' && req.url === '/publish-instagram') {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const { imageUrl, imageUrls, caption } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!imageUrl && !(imageUrls && imageUrls.length)) throw new Error('brak imageUrl / imageUrls');

      console.log(`[publish] ${imageUrls ? imageUrls.length + ' slajdow' : imageUrl}`);
      const result = await publishToInstagram({ imageUrl, imageUrls, caption: caption || '' });
      console.log(`[publish] opublikowano: ${result.permalink || result.mediaId}`);
      return json(res, 200, { ok: true, ...result });
    } catch (e) {
      console.error('[publish] błąd:', e.message);
      return json(res, 500, { ok: false, error: String(e.message || e) });
    }
  }

  if (req.method !== 'POST' || req.url !== '/make-post') {
    return json(res, 404, { ok: false, error: 'używaj POST /make-post albo POST /publish-instagram' });
  }

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    console.log(`[make-post] ${data.title}`);
    const rendered = await renderPost(data);
    const url = await publishToCdn(rendered.file, rendered.name);
    console.log(`[make-post] gotowe: ${url}`);

    return json(res, 200, { ok: true, url, file: rendered.file, name: rendered.name });
  } catch (e) {
    console.error('[make-post] błąd:', e);
    return json(res, 500, { ok: false, error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ZOVU content bridge: http://127.0.0.1:${PORT}`);
  console.log(`  POST /make-post          — одиночная картинка + публичный URL`);
  console.log(`  POST /make-carousel      — карусель слайдов + публичные URL`);
  console.log(`  POST /publish-instagram  — публикация в @zovu.pl (пост или карусель)`);
  console.log(`  GET  /health             — проверка`);
});
