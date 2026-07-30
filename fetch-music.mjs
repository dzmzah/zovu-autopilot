// Ищет музыку под рилсы на Freesound и складывает в папку music/.
//
// Берём ТОЛЬКО CC0 (Creative Commons Zero) — это отказ от прав, полное
// общественное достояние: можно коммерчески, на любой площадке, без указания
// автора. Именно поэтому не годятся ни CC-BY (требует подписи под каждым
// постом), ни фонотека YouTube (Google прямо пишет, что за пределами YouTube
// ничего не гарантирует).
//
//   node fetch-music.mjs            — искать и качать
//   node fetch-music.mjs --list     — только показать, что нашлось
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MUSIC_DIR = path.join(import.meta.dirname, 'music');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LIST_ONLY = process.argv.includes('--list');

const QUERIES = [
  'corporate motivational background music',
  'electronic background music loop',
  'lofi chill beat music',
  'inspiring uplifting music',
  'technology ambient music',
  'modern upbeat music',
];

// отсекаем то, что музыкой не является: голос, шумы, удары, поле
const NOT_MUSIC =
  /(voice|speech|talking|scream|whisper|dog|cat|bird|rain|thunder|wind|door|engine|footstep|crowd|explosion|siren|alarm|whoosh|riser|impact|glitch|static|noise|drone\b|field recording|pronunc)/i;

async function html(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function search(query) {
  const f = 'license:"Creative Commons 0" duration:[40 TO 240]';
  const url =
    'https://freesound.org/search/?q=' +
    encodeURIComponent(query) +
    '&f=' +
    encodeURIComponent(f) +
    '&s=score+desc';
  const t = await html(url);
  return [...new Set(t.match(/\/people\/[^/"]+\/sounds\/\d+/g) || [])];
}

async function details(soundPath) {
  const t = await html(`https://freesound.org${soundPath}/`);
  if (!/creativecommons\.org\/publicdomain\/zero/.test(t)) return null; // не CC0 — мимо
  const mp3 = (t.match(/https:\/\/cdn\.freesound\.org\/previews\/[^"\\ ]+-hq\.mp3/) || [])[0];
  if (!mp3) return null;
  const title = ((t.match(/<title>Freesound - ([^<]+)<\/title>/) || [])[1] || '').trim();
  return { title, mp3, page: `https://freesound.org${soundPath}/` };
}

async function probe(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=channels,sample_rate',
    '-of', 'json', file,
  ]);
  const j = JSON.parse(stdout);
  return { seconds: Number(j.format?.duration || 0), channels: j.streams?.[0]?.channels || 0 };
}

// Насколько дорожка ровная по громкости. У музыки размах умеренный,
// у случайного шума и одиночных ударов — рваный.
async function loudness(file) {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      ['-hide_banner', '-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
      { maxBuffer: 8 * 1024 * 1024 }
    ).catch((e) => ({ stderr: e.stderr || '' }));
    const I = Number((stderr.match(/I:\s*(-?\d+\.?\d*)\s*LUFS/) || [])[1]);
    const LRA = Number((stderr.match(/LRA:\s*(-?\d+\.?\d*)\s*LU/) || [])[1]);
    return { I, LRA };
  } catch {
    return { I: NaN, LRA: NaN };
  }
}

function slug(s) {
  return (
    s
      .replace(/\.(mp3|wav|aiff?|flac)$/i, '')
      .replace(/\s+by\s+.*$/i, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'track'
  );
}

await mkdir(MUSIC_DIR, { recursive: true });

const found = new Map();
for (const q of QUERIES) {
  const paths = await search(q).catch((e) => {
    console.log(`  ${q}: ${e.message}`);
    return [];
  });
  for (const p of paths.slice(0, 12)) if (!found.has(p)) found.set(p, q);
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`найдено записей: ${found.size}`);

const good = [];
for (const [p, q] of found) {
  const d = await details(p).catch(() => null);
  await new Promise((r) => setTimeout(r, 400));
  if (!d) continue;
  if (NOT_MUSIC.test(d.title)) continue;
  good.push({ ...d, query: q });
}
console.log(`из них CC0 и похоже на музыку: ${good.length}`);

if (LIST_ONLY) {
  good.forEach((g, i) => console.log(`${i}. ${g.title}\n   ${g.page}`));
  process.exit(0);
}

const kept = [];
for (const g of good) {
  const name = slug(g.title) + '.mp3';
  const file = path.join(MUSIC_DIR, name);
  try {
    const buf = Buffer.from(await fetch(g.mp3, { headers: { 'User-Agent': UA } }).then((r) => r.arrayBuffer()));
    await writeFile(file, buf);
    const { seconds, channels } = await probe(file);
    const { I, LRA } = await loudness(file);
    // короткие и «рваные» отсеиваем: рилс длится 16-18 секунд,
    // а бешеный разброс громкости выдаёт не музыку, а звуковой эффект
    const ok = seconds >= 30 && channels >= 1 && (!Number.isFinite(LRA) || LRA < 22);
    console.log(
      `${ok ? '+' : '-'} ${name} | ${seconds.toFixed(0)}s | ${channels}ch | ${I}LUFS | LRA ${LRA} | ${g.page}`
    );
    if (ok) kept.push({ name, seconds, I, LRA, page: g.page, title: g.title });
    else await unlink(file).catch(() => {});
  } catch (e) {
    console.log(`! ${name}: ${e.message}`);
  }
}

console.log(`\nв папке music/: ${(await readdir(MUSIC_DIR)).filter((f) => f.endsWith('.mp3')).length} дорожек`);
await writeFile(path.join(MUSIC_DIR, 'zrodla.json'), JSON.stringify(kept, null, 1), 'utf8');
