// Раскладка кадра до сборки: сцена поверх настоящего лица.
//
// Нужен, чтобы не ждать полтора часа ради ответа на вопрос «а не закроет ли
// врезка подбородок». Считает тайминги по слогам, рисует три кадра сцены и
// кладёт их поверх кадров из банка лиц.
//
//   node podglad-wedacego.mjs [--scenariusz=ключ]
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { grafikaHtml, wczytajObiekty, W, H } from './grafika.mjs';
import { wybierzWedacego } from './scenariusze-wedacy.mjs';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out', 'podglad-wedacego');
const KLUCZ = (process.argv.find((a) => a.startsWith('--scenariusz=')) || '').split('=')[1] || '';

const scen = wybierzWedacego(KLUCZ);
const F = scen.frazy;
// Тайминги по слогам — как в пробе без озвучки. Точность тут не нужна:
// вопрос не «когда», а «где».
const dl = F.map((f) => Math.max(1.2, f.tekst.length / 14 + (f.pauza || 0.3)));
const start = dl.reduce((a, d, i) => (a.push(i ? a[i - 1] + dl[i - 1] : 0), a), []);
const total = start.at(-1) + dl.at(-1);
const t = (i, u = 0) => start[i] + u * dl[i];

const plan = scen.buduj({ t, total });
const obrazki = await wczytajObiekty([...new Set(plan.scena.map((o) => o.obiekt).filter(Boolean))]);

const slowa = [];
F.forEach((f, i) => {
  const w = f.tekst.split(/\s+/);
  w.forEach((x, k) =>
    slowa.push({
      // Движок ждёт поле tekst, а не slowo — иначе подпись рисует UNDEFINED.
      tekst: x,
      a: start[i] + (dl[i] * k) / w.length,
      b: start[i] + (dl[i] * (k + 1)) / w.length,
    })
  );
});

await mkdir(OUT, { recursive: true });
const plikHtml = path.join(OUT, 'scena.html');
await writeFile(plikHtml, grafikaHtml({ ...plan, slowa, obrazki }), 'utf8');

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: W, height: H } });
await pg.goto('file:///' + plikHtml.split(path.sep).join('/'));
await pg.waitForTimeout(800);

const czasy = [t(0, 0.5), t(1, 0.6), t(3, 0.6), t(4, 0.4)];
for (let i = 0; i < czasy.length; i++) {
  await pg.evaluate((s) => window.setT(s), czasy[i]);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: path.join(OUT, `scena${i}.png`), omitBackground: true });
}
await br.close();

// Кадры лица из банка — по одному на каждый момент, чтобы было видно, что
// врезки не садятся на подбородок при разных наклонах головы.
const kat = path.join(DIR, 'wedacy', 'kuba');
const klipy = (await readdir(kat)).filter((f) => f.endsWith('.mp4')).sort();
for (let i = 0; i < czasy.length; i++) {
  const klip = path.join(kat, klipy[i % klipy.length]);
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(1.5 + i), '-i', klip, '-frames:v', '1',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
    path.join(OUT, `twarz${i}.png`),
  ]);
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', path.join(OUT, `twarz${i}.png`), '-i', path.join(OUT, `scena${i}.png`),
    '-filter_complex', 'overlay=0:0',
    path.join(OUT, `kadr${i}.png`),
  ]);
}

console.log(`[подгляд] ролик ${total.toFixed(1)} с, кадры на ${czasy.map((x) => x.toFixed(1)).join(', ')}`);
console.log(`[подгляд] готово: ${OUT}`);
