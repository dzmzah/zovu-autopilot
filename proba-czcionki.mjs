// Сетка вариантов подписи внутри шкалы.
//
// Захар сказал про нынешнюю: «не аппетитный, не сочненький». Спорить тут
// нечем и незачем — такие вещи решаются глазами, а не доводами. Рисуем
// варианты рядом, в настоящем размере кадра, и он выбирает.
//
//   node proba-czcionki.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const OUT = path.join(import.meta.dirname, 'out', 'czcionki');
await mkdir(OUT, { recursive: true });

const TEKST = 'POSTÓW W MIESIĄCU';

// Каждый вариант — не только гарнитура. «Сочность» делают вместе жир,
// разрядка, кегль и цвет: тонкий Archivo с разрядкой 3px будет таким же
// сухим, как нынешний Inter.
const WARIANTY = [
  { nr: 1, opis: 'Inter 800 · rozstrzelony (TERAZ)',
    css: `font-family:'Inter';font-weight:800;letter-spacing:2.5px;color:#1a1230` },
  { nr: 2, opis: 'Archivo Black · ciasno',
    css: `font-family:'Archivo Black';font-weight:400;letter-spacing:0.5px;color:#141024` },
  { nr: 3, opis: 'Poppins 800 · geometryczny',
    css: `font-family:'Poppins';font-weight:800;letter-spacing:0.8px;color:#171229` },
  { nr: 4, opis: 'Nunito 900 · zaokrąglone końcówki',
    css: `font-family:'Nunito';font-weight:900;letter-spacing:0.6px;color:#171229` },
  { nr: 5, opis: 'Baloo 2 800 · miękki, „soczysty”',
    css: `font-family:'Baloo 2';font-weight:800;letter-spacing:0.4px;color:#171229` },
  { nr: 6, opis: 'Archivo Black · w kolorze metki',
    css: `font-family:'Archivo Black';font-weight:400;letter-spacing:0.5px;color:#1f8f57` },
];

const html = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@800;900&family=Poppins:wght@800&family=Nunito:wght@900&family=Baloo+2:wght@800&display=swap" rel="stylesheet">
<style>
  body{margin:0;background:#e9eae6;width:1080px;font-family:'Inter',sans-serif}
  .rzad{position:relative;height:250px;display:flex;align-items:center;justify-content:center}
  .metka{position:absolute;top:16px;left:50%;transform:translateX(-50%);
    width:400px;height:150px;border-radius:56px;background:linear-gradient(160deg,#3ec27c,#22a35f);
    box-shadow:0 26px 60px rgba(0,0,0,.22)}
  .metka b{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#fff;
    font-family:'Archivo Black';font-size:96px;line-height:1;
    text-shadow:0 6px 0 rgba(0,0,0,.16)}
  .pasek{position:absolute;top:186px;left:50%;transform:translateX(-50%);width:400px;height:74px;display:flex;align-items:center;justify-content:center}
  .tor{position:absolute;left:0;right:0;top:6px;height:62px;border-radius:31px;
    background:rgba(255,255,255,.42);box-shadow:inset 0 2px 6px rgba(0,0,0,.14)}
  .wype{position:absolute;left:0;top:6px;width:400px;height:62px;border-radius:31px;
    background:#fff;box-shadow:0 8px 22px rgba(0,0,0,.22)}
  .opis{position:relative;z-index:2;white-space:nowrap;line-height:1.3;padding-bottom:2px}
  .etykieta{position:absolute;left:20px;top:110px;width:290px;font-size:21px;font-weight:700;color:#5d5a70}
</style>
${WARIANTY.map(
  (w) => `<div class="rzad">
    <div class="etykieta">${w.nr}. ${w.opis}</div>
    <div class="metka"><b>8</b></div>
    <div class="pasek"><div class="tor"></div><div class="wype"></div>
      <div class="opis" data-nr="${w.nr}" style="${w.css}">${TEKST}</div></div>
  </div>`
).join('')}
<script>
  // Тот же подбор кегля замером, что и в сборщике: иначе сравнение врёт —
  // один шрифт окажется мельче просто потому, что он шире.
  for (const el of document.querySelectorAll('.opis')) {
    let k = 46;
    el.style.fontSize = k + 'px';
    while (k > 16 && el.scrollWidth > 400 - 40) { k -= 1; el.style.fontSize = k + 'px'; }
    el.dataset.kegl = k;
  }
</script>`;

const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1080, height: 250 * WARIANTY.length } });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const kegle = await p.$$eval('.opis', (els) => els.map((e) => e.dataset.kegl));
await p.screenshot({ path: path.join(OUT, 'warianty.png') });
await br.close();
console.log('кегли по вариантам:', kegle.join(', '));
console.log('готово:', path.join(OUT, 'warianty.png'));
