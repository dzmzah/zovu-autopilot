// Один запуск автопилота БЕЗ n8n и без локального сервера.
// Именно это выполняется на серверах GitHub Actions по расписанию.
//
//   node run-once.mjs            — сделать и опубликовать
//   node run-once.mjs --dry      — только сделать, без публикации
//
// Секреты берутся из переменных окружения (на ПК — из файла .env):
//   INSTAGRAM_TOKEN  — обязательный
//   GEMINI_API_KEY   — текст (бесплатный тир). Без него на сервере работать нечему
import { readFile, copyFile, mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makePost } from './content-engine.mjs';
import { renderPost, renderCarousel } from './render.mjs';

const execFileAsync = promisify(execFile);
const DRY = process.argv.includes('--dry');
// --kind=reel|carousel|single — принудительно задать тип поста (для проверок).
// Без него тип выбирает ротация в движке.
const KIND = (process.argv.find((a) => a.startsWith('--kind=')) || '').split('=')[1] || undefined;

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

// Старые слайды и видео из posts/ убираем: Instagram их уже забрал себе,
// а репозиторий иначе пухнет и каждый запуск дольше выкачивается.
async function prunePosts(dir, days = 30) {
  const limit = Date.now() - days * 86400_000;
  let removed = 0;
  for (const name of await readdir(dir).catch(() => [])) {
    const p = path.join(dir, name);
    const s = await stat(p).catch(() => null);
    if (s?.isFile() && s.mtimeMs < limit) {
      await unlink(p).catch(() => {});
      removed++;
    }
  }
  if (removed) console.log(`[autopilot] sprzątanie: usunięto ${removed} starych plików`);
}

async function pushToCdn(files, caption) {
  const dir = path.join(CDN_REPO, CDN_SUBDIR);
  await mkdir(dir, { recursive: true });
  await prunePosts(dir);
  for (const f of files) await copyFile(f.file, path.join(dir, f.name));

  // Подпись кладём рядом с картинкой. Если публикация не пройдёт, пост уже
  // готов к выкладке руками: файл и текст лежат вместе, ничего не потеряно.
  if (caption) {
    const txt = files[0].name.replace(/\.[^.]+$/, '') + '.txt';
    await writeFile(path.join(dir, txt), caption, 'utf8');
  }

  await git(['add', '--all']);
  try {
    await git(['commit', '-m', `post: ${files[0].name}`]);
  } catch (e) {
    if (!/nothing to commit/i.test(String(e.stdout || e.message))) throw e;
  }

  // Пуш с догоном. Прогон выкачивает репозиторий в начале, а к этому месту
  // проходит минута-другая: за это время в main может лечь чужой коммит —
  // правка руками или предыдущий прогон, который ещё дописывал состояние.
  // Тогда push отлетает как non-fast-forward, а вместе с ним умирает весь
  // прогон: картинки уже сделаны, текст написан, а поста нет. Ради этого
  // терять день нельзя — догоняем и пробуем снова.
  for (let proba = 1; ; proba++) {
    try {
      await git(['push', 'origin', 'HEAD:main']);
      break;
    } catch (e) {
      if (proba >= 3) throw e;
      console.warn(`[autopilot] push odbity (próba ${proba}) — dociągam main i próbuję znowu`);
      // actions/checkout выкачивает ОДИН коммит. На такой истории rebase не
      // находит общего предка и падает, поэтому сначала углубляем. На полной
      // копии (локально) --deepen не применим — там достаточно обычного fetch.
      try {
        await git(['fetch', '--deepen=50', 'origin', 'main']);
      } catch {
        await git(['fetch', 'origin', 'main']);
      }
      // --autostash не нужен: рабочее дерево уже закоммичено выше
      await git(['rebase', 'origin/main']);
    }
  }

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
  for (let i = 0; i < 90; i++) {
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

// Токен Instagram берём из самообновляющегося хранилища и по дороге продлеваем,
// чтобы он не умер через 60 дней и автопилот не замолчал.
async function instagramToken() {
  try {
    const store = await import('./token-store.mjs');
    const { token, refreshedAt } = await store.loadInstagramToken();
    if (store.needsRefresh(refreshedAt)) {
      try {
        const fresh = await store.refreshInstagramToken(token);
        await store.saveInstagramToken(fresh.token);
        const days = Math.round((fresh.expiresIn || 0) / 86400);
        console.log(`[autopilot] token Instagrama przedłużony o ${days} dni`);
        return fresh.token;
      } catch (e) {
        console.warn(`[autopilot] nie udało się przedłużyć tokenu: ${e.message}`);
      }
    }
    return token;
  } catch {
    return env('INSTAGRAM_TOKEN');
  }
}

async function publish(urls, caption, kind) {
  const token = await instagramToken();
  if (!token) throw new Error('нет INSTAGRAM_TOKEN');

  let container;
  if (kind === 'reel') {
    // рилс — отдельный тип медиа, отдаём ссылку на mp4
    container = await igPost('me/media', {
      media_type: 'REELS',
      video_url: urls[0],
      caption,
      share_to_feed: true,
      access_token: token,
    });
  } else if (urls.length === 1) {
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

// ── защита от повторной публикации ────────────────────────────────
// Планировщик GitHub умеет задержать и уронить запуск, поэтому в расписании
// стоит несколько попыток на слот. Чтобы они не превратились в три поста
// подряд, помечаем выполненный слот в state.json и на повторе выходим.
const STATE_FILE = path.join(import.meta.dirname, 'state.json');

function slotId(d = new Date()) {
  // до полудня UTC — утренний слот, после — вечерний
  return `${d.toISOString().slice(0, 10)}-${d.getUTCHours() < 12 ? 'am' : 'pm'}`;
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function markSlot(id) {
  const s = await readState();
  s.posted = id;
  // Первая удачная публикация после блокировки запускает отсчёт щадящей недели.
  if (!s.wznowiono) {
    s.wznowiono = new Date().toISOString();
    console.log('[autopilot] dostęp wrócił — włączam tryb łagodny na 7 dni');
  }
  // Пост вышел — значит доступ есть, счётчик блокировки обнуляем.
  delete s.blokadaOd;
  delete s.alarmDnia;
  await writeFile(STATE_FILE, JSON.stringify(s, null, 1) + '\n', 'utf8');
}

// Тревога о блокировке — раз в сутки, начиная с ПЕРВОГО дня.
// Раньше ран оставался зелёным, пока очередь не набьётся до потолка: блокировку
// 31.07 заметили только через девять дней. Теперь письмо от GitHub приходит в тот
// же день, а дальше по одному в сутки, пока доступ не вернётся.
async function alarmBlokady(dlugoscKolejki) {
  const dzis = new Date().toISOString().slice(0, 10);
  const s = await readState();
  if (!s.blokadaOd) s.blokadaOd = dzis;
  const pierwszyRazDzis = s.alarmDnia !== dzis;
  s.alarmDnia = dzis;
  await writeFile(STATE_FILE, JSON.stringify(s, null, 1) + '\n', 'utf8');
  if (!pierwszyRazDzis) return false;
  const dni = Math.round((Date.parse(dzis) - Date.parse(s.blokadaOd)) / 86400_000) + 1;
  console.log(
    `::error::Meta blokuje dostęp do API — dzień ${dni}, w kolejce ${dlugoscKolejki} postów. ` +
      'Publikacja stoi. Wejdź na developers.facebook.com i przejdź weryfikację konta.'
  );
  return true;
}

// ── очередь неопубликованного ─────────────────────────────────────
// Когда Meta закрывает доступ, посты не пропадают: они встают в очередь и
// ждут. Как только доступ вернётся, очередь расходится сама — по одному за
// запуск, в обычном ритме. Разом их выкладывать нельзя: десять постов подряд
// это ровно та «необычная активность», из-за которой нас и заблокировали.
const QUEUE_FILE = path.join(import.meta.dirname, 'pending.json');
// Сколько постов держим про запас при блокировке. Десять — это пять дней
// нормального ритма; дольше копить бессмысленно, темы протухают.
const LIMIT_KOLEJKI = 10;

async function readQueue() {
  try {
    const q = JSON.parse(await readFile(QUEUE_FILE, 'utf8'));
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

async function writeQueue(q) {
  await writeFile(QUEUE_FILE, JSON.stringify(q, null, 1) + '\n', 'utf8');
}

async function pushQueue(entry) {
  const q = await readQueue();
  if (q.some((x) => x.urls[0] === entry.urls[0])) return q.length;
  q.push(entry);
  await writeQueue(q);
  return q.length;
}

async function shiftQueue() {
  const q = await readQueue();
  q.shift();
  await writeQueue(q);
  return q.length;
}

// Состояние ротации возвращается в репозиторий, иначе каждый запуск
// начинал бы темы и форматы с нуля.
async function zapiszStan() {
  try {
    const state = await readFile(STATE_FILE, 'utf8');
    await writeFile(STATE_FILE, state, 'utf8');
  } catch {
    /* нечего сохранять */
  }
}

// ── поехали ───────────────────────────────────────────────────────
const started = Date.now();
// Крикнули ли сегодня про блокировку — от этого зависит код выхода в самом конце.
let zablokowane = false;
console.log(`[autopilot] start ${new Date().toISOString()}${DRY ? ' (dry run)' : ''}`);

const slot = slotId();
if (!DRY && !KIND) {
  const s = await readState();
  if (s.posted === slot) {
    console.log(`[autopilot] slot ${slot} już opublikowany — kończę bez postu`);
    process.exit(0);
  }

  // ── щадящий режим после блокировки ──
  // Meta закрыла доступ 31.07 именно за резкий старт. Поэтому первую неделю
  // после восстановления идём по одному посту в день — вечерний слот
  // пропускаем. Дата первой удачной публикации ставится сама, решать ничего
  // не нужно; через семь дней режим отключается тоже сам.
  if (s.wznowiono && slot.endsWith('-pm')) {
    const dni = (Date.now() - Date.parse(s.wznowiono)) / 86400_000;
    if (dni < 7) {
      console.log(
        `[autopilot] tryb łagodny: ${dni.toFixed(1)} dnia od wznowienia, ` +
          'wieczorny slot pomijam (jeden post dziennie przez tydzień)'
      );
      process.exit(0);
    }
  }
}

// Есть накопленное — выкладываем его, а не делаем новое. Так лента идёт
// по порядку и в прежнем ритме, а очередь потихоньку рассасывается.
const ZABLOKOWANE_RE = /API access blocked|Cannot call API for app|OAuthException/i;

if (!DRY && !KIND) {
  const kolejka = await readQueue();
  if (kolejka.length) {
    const czeka = kolejka[0];
    console.log(`[autopilot] w kolejce: ${kolejka.length}. Próbuję najstarszy: ${czeka.name}`);
    try {
      const r = await publish(czeka.urls, czeka.caption, czeka.kind);
      console.log(`[autopilot] Instagram: ${r.permalink || r.mediaId}`);
      try {
        const { publishToFacebook } = await import('./fb-publish.mjs');
        const fb = await publishToFacebook({ imageUrls: czeka.urls, caption: czeka.caption, kind: czeka.kind });
        console.log(fb.skipped ? `[autopilot] Facebook: pominięty (${fb.reason})` : `[autopilot] Facebook: ${fb.postId}`);
      } catch (e) {
        console.warn(`[autopilot] Facebook nie wyszedł: ${e.message}`);
      }
      const zostalo = await shiftQueue();
      await markSlot(slot);
      await zapiszStan();
      console.log(`[autopilot] kolejka: zostało ${zostalo}`);
      console.log(`[autopilot] gotowe w ${Math.round((Date.now() - started) / 1000)}s`);
      process.exit(0);
    } catch (e) {
      if (!ZABLOKOWANE_RE.test(e.message)) throw e;
      // Доступа по-прежнему нет. Не выходим: делаем новый пост в запас, чтобы
      // на странице готовых было что публиковать руками. Но не бесконечно —
      // при длинной блокировке смысла копить сотню постов нет.
      console.log(`[autopilot] dostęp wciąż zablokowany (w kolejce ${kolejka.length})`);
      zablokowane = await alarmBlokady(kolejka.length);
      if (kolejka.length >= LIMIT_KOLEJKI) {
        console.log(`[autopilot] kolejka pełna (${LIMIT_KOLEJKI}) — nie robię nowego postu`);
        console.log(`[autopilot] gotowe w ${Math.round((Date.now() - started) / 1000)}s`);
        // Красный ран = письмо от GitHub. Без человека блокировка не снимется.
        process.exit(zablokowane ? 1 : 0);
      }
      console.log('[autopilot] robię nowy post do zapasu');
    }
  }
}

const post = await makePost({ trends: true, kind: KIND });
console.log(`[autopilot] #${post.meta.counter} ${post.kind} | ${post.meta.format} | ${post.meta.provider}`);
console.log(`[autopilot] ${post.data.title}`);

// У рилса свой вертикальный макет — слайды карусели ему не нужны вовсе.
let files;
if (post.kind === 'reel') {
  const { makeReel } = await import('./make-reel.mjs');
  const reel = await makeReel({ data: post.data, name: post.data.name, photo: post.data.photoCta || 'mat' });
  console.log(
    `[autopilot] rolka: ${reel.seconds.toFixed(1)}s, ${(reel.bytes / 1048576).toFixed(1)} MB` +
      `, ${reel.clips.length} ujęć` + (reel.withMusic ? `, montaż pod ${reel.bpm} BPM` : ', bez muzyki')
  );
  files = [{ file: reel.file, name: reel.name }];
} else {
  const slides = post.kind === 'single' ? [await renderPost(post.data)] : await renderCarousel(post.data);
  console.log(`[autopilot] obrazki: ${slides.length}`);
  files = slides;
}

if (DRY) {
  console.log('[autopilot] dry run — nie publikuję');
  console.log(files.map((f) => f.file).join('\n'));
  process.exit(0);
}

const urls = await pushToCdn(files, post.caption);

// Meta умеет закрыть доступ к API целиком — так было 31.07, когда аккаунт
// разработчика попал на проверку личности. Пост в этом случае НЕ теряется:
// он встаёт в очередь и уйдёт сам, как только доступ вернётся.
let result = null;
try {
  result = await publish(urls, post.caption, post.kind);
  console.log(`[autopilot] Instagram: ${result.permalink || result.mediaId}`);
} catch (e) {
  if (!ZABLOKOWANE_RE.test(e.message)) throw e;
  const dlugosc = await pushQueue({
    name: files[0].name,
    urls,
    caption: post.caption,
    kind: post.kind,
    dodano: new Date().toISOString(),
  });
  console.log('[autopilot] ──────────────────────────────────────────────');
  console.log('[autopilot] Meta zablokowała dostęp — post trafił do kolejki.');
  console.log(`[autopilot] W kolejce czeka: ${dlugosc}`);
  console.log('[autopilot] Wyjdzie sam, gdy dostęp wróci. Nic nie ginie.');
  console.log(`[autopilot]   ${urls[0]}`);
  console.log('[autopilot] ──────────────────────────────────────────────');
  zablokowane = (await alarmBlokady(dlugosc)) || zablokowane;
}

// Facebook — тем же контентом. Если токена нет или доступ закрыт, шаг
// пропускается, и это не ломает остальное.
if (result) {
  try {
    const { publishToFacebook } = await import('./fb-publish.mjs');
    const fb = await publishToFacebook({ imageUrls: urls, caption: post.caption, kind: post.kind });
    console.log(fb.skipped ? `[autopilot] Facebook: pominięty (${fb.reason})` : `[autopilot] Facebook: ${fb.postId}`);
  } catch (e) {
    console.warn(`[autopilot] Facebook nie wyszedł: ${e.message}`);
  }
}

// Слот закрываем ТОЛЬКО если пост реально вышел. Иначе после снятия
// блокировки следующая попытка решила бы, что за сегодня уже отработано.
if (result) try {
  await markSlot(slot);
  console.log(`[autopilot] slot ${slot} zamknięty`);
} catch (e) {
  console.warn(`[autopilot] nie zapisałem slotu: ${e.message}`);
}

await zapiszStan();

// Ран красный только когда сегодня уже крикнули: одно письмо в сутки, не шесть.
if (zablokowane) process.exit(1);

console.log(`[autopilot] gotowe w ${Math.round((Date.now() - started) / 1000)}s`);
