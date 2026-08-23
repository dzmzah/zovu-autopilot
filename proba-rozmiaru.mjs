// Один и тот же кадр при разном размере объектов.
//
// Захару показалось, что предметы стали огромными. По числам они не менялись
// с 17.08 и совпадают с роликом, который ему нравится, — но «кажется» тут не
// аргумент против: 820 px при кадре 1080 это три четверти ширины, и вопрос
// законный. Спорить нечем, надо показать.
//
//   node proba-rozmiaru.mjs                 — 100 / 85 / 70 %
//   node proba-rozmiaru.mjs --scenariusz=sesja --sekunda=6
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { grafikaHtml, wczytajObiekty, W, H } from './grafika.mjs';
import { SCENARIUSZE } from './scenariusze-grafika.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith('--' + n + '=')) || '').split('=')[1] || d;
const KLUCZ = arg('scenariusz', 'rytm');
const SEKUNDA = Number(arg('sekunda', '2'));
const MNOZNIKI = [1, 0.85, 0.7];

const scen = SCENARIUSZE.find((s) => s.klucz === KLUCZ);
if (!scen) throw new Error('нет сценария ' + KLUCZ);

// Раскладка по фразам как в сборщике на пробе: длительность по слогам.
// Точные тайминги тут не нужны — нужен один кадр в сравнимом месте.
const dl = scen.frazy.map((f) => Math.max(1.2, (f.tekst.length / 14) + (f.pauza || 0.3)));
const start = dl.reduce((a, d, i) => (a.push(i ? a[i - 1] + dl[i - 1] : 0), a), []);
const total = start.at(-1) + dl.at(-1);
const t = (i, u = 0) => start[i] + dl[i] * u;

const OUT = path.join(import.meta.dirname, 'out', 'rozmiary');
await mkdir(OUT, { recursive: true });

const br = await chromium.launch({ args: ['--force-device-scale-factor=1'] });

for (const m of MNOZNIKI) {
  const plan = scen.buduj({ t, total });
  const scena = (plan.scena || plan)
    .filter((o) => o.obiekt)
    .map((o) => ({ ...o, skala: Math.round((o.skala || 380) * m) }));
  const obrazki = await wczytajObiekty([...new Set(scena.map((o) => o.obiekt))]);

  const html = grafikaHtml({ scena, wzor: [], liczniki: [], metki: [], kamera: [], akcenty: [], slowa: [], obrazki });
  const plik = path.join(OUT, `scena-${m}.html`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(plik, html, 'utf8');

  const p = await br.newPage({ viewport: { width: W, height: H } });
  await p.goto('file://' + plik.replace(/\\/g, '/'));
  await p.waitForTimeout(700);
  await p.evaluate((s) => window.setT(s), SEKUNDA);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, `${Math.round(m * 100)}.png`) });
  await p.close();
  console.log(`${Math.round(m * 100)} % — największy obiekt ${Math.round(820 * m)} px na ${W}`);
}

await br.close();
console.log('готово:', OUT);
