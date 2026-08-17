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

// Слова, которые есть почти в каждом названии и потому ничего не значат.
// Без этого списка «video of a man» совпадает с «video of a cake».
const PUSTE = new Set([
  'video', 'footage', 'clip', 'free', 'stock', 'of', 'the', 'a', 'an', 'in', 'on',
  'at', 'with', 'and', 'to', 'for', 'from', 'by', 'his', 'her', 'their', 'it',
  'is', 'are', 'while', 'over', 'up', 'down', 'out', 'into', 'shot', 'view',
]);

// Название клипа лежит в адресе страницы: .../video/woman-applying-cream-12345/
function opisZeStrony(url) {
  const m = String(url || '').match(/\/video\/([^/]+)\//);
  if (!m) return '';
  return m[1].replace(/-\d+$/, '').replace(/-/g, ' ');
}

// Попадание в запрос: сколько значимых слов запроса нашлось в названии.
// Считаем долей, а не числом: запрос из двух слов и запрос из пяти иначе
// несравнимы, и длинный запрос всегда проигрывал бы короткому.
//
// Сравниваем по началу слова, а не целиком: «photography» и «photo»,
// «furniture» и «furnitures» — одно и то же для нашей задачи.
export function trafnosc(zapytanie, opis) {
  const slowa = (s) =>
    String(s).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !PUSTE.has(w));
  const q = slowa(zapytanie);
  const o = slowa(opis);
  if (!q.length || !o.length) return 0;
  const trafione = q.filter((w) =>
    o.some((x) => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))
  );
  return +(trafione.length / q.length).toFixed(3);
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
        // Название клипа сток отдаёт только внутри ссылки на страницу:
        // .../video/woman-applying-face-cream-12345/. Другого текстового
        // описания в ответе нет, а нам оно нужно — по нему и проверяем,
        // про то ли вообще кадр.
        opis: opisZeStrony(v.url),
        file: bestFile(v),
      }))
      .filter((v) => v.file)
      .map((v) => ({ ...v, trafnosc: trafnosc(query, v.opis) }))
      // Сначала те, что про запрошенное. Сток ранжирует по своему, и на
      // «furniture product photography studio» первым выдал салон красоты —
      // этот клип уехал в ролик под подпись «фото мебели» и был бы показан
      // людям. Своя сортировка дешевле любой ручной проверки.
      .sort((a, b) => b.trafnosc - a.trafnosc);
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
