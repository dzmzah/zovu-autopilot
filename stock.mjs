// Поиск живого футажа на любую тему. Pexels: бесплатно, коммерческое
// использование разрешено, автора указывать не обязано — но мы указываем,
// потому что правила сервиса просят об этом, когда это возможно.
//
// Своя библиотека broll/ покрывает отрасли (кофейня, барбер, спа). Здесь —
// всё остальное: космос, деньги, города, наука, спорт, что угодно.
//
//   node stock.mjs "city night traffic"   — найти и скачать один клип
import { mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CACHE_DIR = path.join(import.meta.dirname, 'out', 'stock');
const API = 'https://api.pexels.com/videos/search';

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

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

// Из всех вариантов файла берём самый мелкий, который всё ещё не хуже 1080
// по ширине: 4K-исходник весит десятки мегабайт, а в кадре 1080x1920 разницы
// не видно — зато скачивание и перекодирование быстрее в разы.
function bestFile(video) {
  const vertical = (video.video_files || []).filter((f) => f.height > f.width && f.width >= 1080);
  if (!vertical.length) return null;
  vertical.sort((a, b) => a.width - b.width);
  return vertical[0];
}

// Ищем несколько кандидатов и возвращаем их описания — выбор оставляем
// вызывающему коду, он знает про длительность сцены и что уже занято.
export async function searchStock(query, { perPage = 12, minSeconds = 4 } = {}) {
  const key = await env('PEXELS_KEY');
  if (!key) return [];
  const url =
    `${API}?query=${encodeURIComponent(query)}` +
    `&orientation=portrait&size=medium&per_page=${perPage}`;
  try {
    const r = await fetch(url, { headers: { Authorization: key } });
    if (!r.ok) throw new Error(`Pexels ${r.status}`);
    const j = await r.json();
    return (j.videos || [])
      .filter((v) => v.duration >= minSeconds)
      .map((v) => ({
        id: v.id,
        seconds: v.duration,
        author: (v.user || {}).name || '',
        page: v.url,
        file: bestFile(v),
      }))
      .filter((v) => v.file);
  } catch (e) {
    console.warn(`[stock] „${query}": ${e.message}`);
    return [];
  }
}

// Скачивает клип и нормализует под наш кадр. Повторный запрос за тем же
// клипом отдаётся из кэша: за прогон одна тема может встретиться дважды.
export async function fetchClip(candidate, { seconds = 4.5, name } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const out = path.join(CACHE_DIR, `${name || 'px-' + candidate.id}.mp4`);
  const cached = await stat(out).catch(() => null);
  if (cached && cached.size > 50000) return { ...candidate, file: out };

  const raw = path.join(CACHE_DIR, `raw-${candidate.id}.mp4`);
  const r = await fetch(candidate.file.link);
  if (!r.ok) throw new Error(`pobieranie ${r.status}`);
  await writeFile(raw, Buffer.from(await r.arrayBuffer()));

  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', raw,
    '-t', String(seconds),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1',
    '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '22',
    out,
  ]);
  await rm(raw, { force: true });
  return { ...candidate, file: out };
}

// Удобная обёртка: запрос → готовый файл. skip — id, уже занятые в этом ролике,
// чтобы соседние сцены не оказались одинаковыми.
export async function getFootage(query, { seconds = 4.5, skip = new Set(), name } = {}) {
  const list = await searchStock(query);
  const pick = list.find((c) => !skip.has(c.id));
  if (!pick) return null;
  try {
    return await fetchClip(pick, { seconds, name: name || `px-${slug(query)}-${pick.id}` });
  } catch (e) {
    console.warn(`[stock] „${query}" nie pobrał się: ${e.message}`);
    return null;
  }
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('stock.mjs')) {
  const q = process.argv[2] || 'city night traffic';
  const list = await searchStock(q);
  console.log(`znaleziono: ${list.length}`);
  list.slice(0, 5).forEach((v) => console.log(` ${v.id} | ${v.seconds}s | ${v.file.width}x${v.file.height} | ${v.author}`));
  if (list.length) {
    const got = await fetchClip(list[0], { name: `cli-${slug(q)}` });
    const s = await stat(got.file);
    console.log(`pobrane: ${got.file} (${(s.size / 1048576).toFixed(1)} MB), autor: ${got.author}`);
  }
}
