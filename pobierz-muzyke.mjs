// Забирает бесплатные треки для рилсов.
//
// Pixabay отдаёт список через JS и режет прямые запросы curl (403). Идём
// браузером — но и там ссылки на mp3 в разметке не лежат: плеер подгружает
// файл только по нажатию. Поэтому жмём play на каждой карточке и перехватываем
// сетевой запрос.
//
// Лицензия Pixabay Content License: коммерческое использование разрешено,
// указание автора не требуется.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, 'muzyka');
// Прошлый набор был corporate/upbeat/inspiring/technology — четыре имени одного
// жанра. Ротация честно перебирала пять файлов, а на слух это был один трек.
const ZAPYTANIA = ['lofi', 'hip hop', 'cinematic', 'ambient', 'funk', 'phonk', 'acoustic guitar', 'drum and bass'];
const ILE = 10;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const linki = new Set();
page.on('request', (r) => {
  if (/cdn\.pixabay\.com\/audio\/.*\.mp3/i.test(r.url())) linki.add(r.url().split('?')[0]);
});

for (const q of ZAPYTANIA) {
  if (linki.size >= ILE) break;
  console.log(`[muzyka] szukam: ${q}`);
  await page
    .goto(`https://pixabay.com/music/search/${q}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    .catch(() => {});
  await page.waitForTimeout(2500);

  // Жмём play на нескольких карточках подряд: каждая тянет свой файл.
  const guziki = await page.$$('button[class*="play" i]');
  for (const g of guziki.slice(0, 3)) {
    await g.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2200);
    if (linki.size >= ILE) break;
  }
  console.log(`[muzyka]   linków: ${linki.size}`);
}

let i = 0;
for (const u of linki) {
  if (i >= ILE) break;
  try {
    const r = await ctx.request.get(u, { timeout: 90000 });
    if (!r.ok()) {
      console.log(`[muzyka] ${r.status()} — pomijam`);
      continue;
    }
    const buf = Buffer.from(await r.body());
    // короткий файл — это превью, а не трек
    if (buf.length < 400000) {
      console.log(`[muzyka] za krótki (${Math.round(buf.length / 1024)} KB) — pomijam`);
      continue;
    }
    const nazwa = 'pixabay-' + (u.split('/').pop() || `utwor-${i}.mp3`);
    await writeFile(path.join(OUT, nazwa), buf);
    console.log(`[muzyka] pobrano: ${nazwa} (${(buf.length / 1048576).toFixed(1)} MB)`);
    i++;
  } catch (e) {
    console.log(`[muzyka] błąd: ${e.message.slice(0, 90)}`);
  }
}

await browser.close();
console.log(`[muzyka] gotowe, plików: ${i}`);
