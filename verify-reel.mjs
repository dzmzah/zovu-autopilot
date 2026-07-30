// Проверка рилса БЕЗ публикации в ленту.
//
//   node verify-reel.mjs out/nazwa.mp4
//
// Что делает:
//   1. кладёт видео в публичный CDN и ждёт, пока оно реально отдаётся
//   2. Instagram — создаёт контейнер REELS и ждёт FINISHED. Публикацию НЕ вызывает,
//      контейнер сам протухнет через сутки. Это доказывает, что формат и ссылка приняты
//   3. Facebook — прогоняет все три шага загрузки рилса, но на последнем ставит
//      video_state=DRAFT: рилс попадает в черновики страницы, в ленте его нет
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolvePage } from './fb-publish.mjs';

const execFileAsync = promisify(execFile);
const IG_API = 'https://graph.instagram.com/v23.0';
const GRAPH = 'https://graph.facebook.com/v23.0';
const CDN_REPO = process.env.CDN_REPO || path.join(import.meta.dirname, '..', 'zovu-cdn');
const RAW_BASE = process.env.RAW_BASE || 'https://raw.githubusercontent.com/dzmzah/zovu-cdn/main';

async function env(key) {
  if (process.env[key]) return process.env[key].trim();
  const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8').catch(() => '');
  const m = raw.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.+)\\s*$', 'm'));
  return m ? m[1].trim() : null;
}

const file = process.argv[2];
if (!file) {
  console.log('podaj plik: node verify-reel.mjs out/nazwa.mp4');
  process.exit(1);
}
const name = 'verify-' + path.basename(file);

// ── 1. в CDN ──────────────────────────────────────────────────────
await mkdir(path.join(CDN_REPO, 'posts'), { recursive: true });
await copyFile(file, path.join(CDN_REPO, 'posts', name));
const git = (args) =>
  execFileAsync('git', ['-C', CDN_REPO, '-c', 'user.name=zovu-autopilot', '-c', 'user.email=zovu.pl@gmail.com', ...args], { maxBuffer: 1e7 });
await git(['add', '--all']);
await git(['commit', '-m', `verify: ${name}`]).catch(() => {});
await git(['push', 'origin', 'HEAD:main']);

const url = `${RAW_BASE}/posts/${name}`;
let ok = false;
for (let i = 0; i < 30 && !ok; i++) {
  ok = await fetch(url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
console.log(`CDN: ${ok ? 'OK' : 'NIE ODDAJE'} ${url}`);
if (!ok) process.exit(1);

// ── 2. Instagram: контейнер без публикации ────────────────────────
const igToken = await env('INSTAGRAM_TOKEN');
try {
  const r = await fetch(`${IG_API}/me/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: url,
      caption: 'test techniczny',
      share_to_feed: true,
      access_token: igToken,
    }),
  });
  const j = await r.json();
  if (!j.id) throw new Error(JSON.stringify(j).slice(0, 300));

  let status = '';
  for (let i = 0; i < 90; i++) {
    const s = await fetch(`${IG_API}/${j.id}?fields=status_code,status&access_token=${igToken}`).then((x) => x.json());
    status = s.status_code || '';
    if (status === 'FINISHED' || status === 'ERROR') {
      if (status === 'ERROR') console.log('  status:', s.status);
      break;
    }
    await new Promise((x) => setTimeout(x, 2000));
  }
  console.log(`Instagram: kontener ${j.id} → ${status} (NIE publikuję)`);
} catch (e) {
  console.log('Instagram: BŁĄD ' + e.message);
}

// ── 3. Facebook: рилс в черновики ─────────────────────────────────
try {
  const page = await resolvePage(await env('FACEBOOK_PAGE_TOKEN'));
  const token = page.token;
  const start = await fetch(`${GRAPH}/${page.id}/video_reels`, {
    method: 'POST',
    body: new URLSearchParams({ upload_phase: 'start', access_token: token }),
  }).then((r) => r.json());
  if (!start.video_id) throw new Error('start: ' + JSON.stringify(start).slice(0, 300));

  const uploadUrl = start.upload_url || `https://rupload.facebook.com/video-upload/v23.0/${start.video_id}`;
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: url },
  });
  const upJson = await up.json().catch(() => ({}));
  console.log(`Facebook: upload ${up.status} ${JSON.stringify(upJson).slice(0, 160)}`);

  let fin = null;
  for (let i = 1; i <= 8; i++) {
    fin = await fetch(`${GRAPH}/${page.id}/video_reels`, {
      method: 'POST',
      body: new URLSearchParams({
        video_id: start.video_id,
        upload_phase: 'finish',
        video_state: 'DRAFT',
        description: 'test techniczny',
        access_token: token,
      }),
    }).then((r) => r.json());
    if (fin.success || fin.post_id) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`Facebook: finish(DRAFT) ${JSON.stringify(fin).slice(0, 200)}`);
} catch (e) {
  console.log('Facebook: BŁĄD ' + e.message);
}
