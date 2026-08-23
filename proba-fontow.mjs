// Сетка шрифтов для рилсов автошкол.
//
// Захар про текущий набор: «шрифт какой-то не аппетитный, не сочненький».
// Он прав по существу: Inter — шрифт интерфейсов, у него намеренно нет
// характера, чтобы не мешать. В рилсе всё наоборот: буква работает картинкой,
// и «не мешать» здесь равно «не запомниться».
//
// Показываем ОДНУ И ТУ ЖЕ сцену шестью наборами, а не описываем словами.
//   node proba-fontow.mjs
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out', 'fonty');
const W = 1080, H = 1920;

const KOLOR = {
  ciemny: '#0d0820', ciemny2: '#180f3d',
  jasny: '#a78bfa', akcent: '#7c3aed', zolty: '#ffd23f', cichy: '#b7b0d6',
};

// Наборы. Везде один принцип: ТЯЖЁЛЫЙ титульный + спокойный мелкий.
// Разница между ними — характер титульного, потому что именно он в кадре
// занимает половину площади.
const ZESTAWY = [
  {
    id: '1-inter', nazwa: 'INTER (teraz)',
    link: 'Inter:wght@600;700;800;900&family=Playfair+Display:ital,wght@1,400;1,500',
    tyt: "'Inter'", tekst: "'Inter'", kursywa: "'Playfair Display'",
    wagaTyt: 900, trackTyt: '-2px',
    opis: 'font interfejsow - czysty, ale bez charakteru',
  },
  {
    id: '2-anton', nazwa: 'ANTON',
    link: 'Anton&family=Inter:wght@600;700;800&family=Playfair+Display:ital,wght@1,400',
    tyt: "'Anton'", tekst: "'Inter'", kursywa: "'Playfair Display'",
    wagaTyt: 400, trackTyt: '0px',
    opis: 'waski i bardzo gesty - klasyka rolek, miesci wiecej liter',
  },
  {
    id: '3-archivo', nazwa: 'ARCHIVO EXPANDED',
    link: 'Archivo:wdth,wght@112,600;112,800;112,900&family=Playfair+Display:ital,wght@1,400',
    tyt: "'Archivo'", tekst: "'Archivo'", kursywa: "'Playfair Display'",
    wagaTyt: 900, trackTyt: '-1px', rozciag: 'font-stretch:112%;',
    opis: 'szeroki grotesk plakatowy - masa bez krzyku',
  },
  {
    id: '4-unbounded', nazwa: 'UNBOUNDED',
    link: 'Unbounded:wght@700;800;900&family=Inter:wght@600;700&family=Playfair+Display:ital,wght@1,400',
    tyt: "'Unbounded'", tekst: "'Inter'", kursywa: "'Playfair Display'",
    wagaTyt: 800, trackTyt: '-3px',
    opis: 'geometryczny, okragly - najbardziej soczysty z calej szostki',
  },
  {
    id: '5-kanit', nazwa: 'KANIT',
    link: 'Kanit:ital,wght@0,600;0,800;0,900;1,500',
    tyt: "'Kanit'", tekst: "'Kanit'", kursywa: "'Kanit'", kursywaStyl: 'italic',
    wagaTyt: 800, trackTyt: '-1px',
    opis: 'lekko pochylony, sportowy - pasuje do tempa i do samochodu',
  },
  {
    id: '6-bricolage', nazwa: 'BRICOLAGE GROTESQUE',
    link: 'Bricolage+Grotesque:opsz,wght@96,700;96,800&family=Playfair+Display:ital,wght@1,400',
    tyt: "'Bricolage Grotesque'", tekst: "'Bricolage Grotesque'", kursywa: "'Playfair Display'",
    wagaTyt: 800, trackTyt: '-2px',
    opis: 'wspolczesny, z charakterem w detalach liter',
  },
];

const RZEDY = [
  { nr: '02', tyt: 'TEORIA', sub: 'godzin lekcyjnych', prawo: '30', jedn: ' h' },
  { nr: '03', tyt: 'JAZDY',  sub: 'godzin zegarowych', prawo: '30', jedn: ' h' },
  { nr: '04', tyt: 'EGZAMINY WEWNĘTRZNE', sub: 'teoria i praktyka', zolty: '0 zł' },
];

const html = (z) => `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=${z.link}&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{background:${KOLOR.ciemny};overflow:hidden;font-family:${z.tekst},sans-serif;
  -webkit-font-smoothing:antialiased}
#tlo{position:absolute;inset:0;
  background:linear-gradient(175deg,${KOLOR.ciemny2} 0%,${KOLOR.ciemny} 62%,#08051a 100%)}
#lampa{position:absolute;left:-10%;top:-14%;width:120%;height:90%;
  background:radial-gradient(ellipse 46% 42% at 50% 45%, rgba(124,58,237,.55), rgba(124,58,237,0) 68%)}
.pas{position:absolute;top:-260px;height:${H + 520}px;width:16px;border-radius:8px;
  background:repeating-linear-gradient(to bottom, rgba(255,255,255,.16) 0 96px, rgba(255,255,255,0) 96px 216px)}
#pas1{left:82px}
#pas2{right:96px;width:10px;opacity:.6}

.tytul{position:absolute;left:70px;right:70px;top:150px;text-align:center;
  font-family:${z.tyt},sans-serif;font-weight:${z.wagaTyt};${z.rozciag || ''}
  font-size:104px;letter-spacing:${z.trackTyt};color:#fff;line-height:1.0;
  text-shadow:0 8px 30px rgba(0,0,0,.5)}
#szyna{position:absolute;left:132px;top:392px;width:8px;border-radius:6px;height:640px;
  background:linear-gradient(180deg,${KOLOR.jasny},${KOLOR.akcent})}
.rzad{position:absolute;left:0;right:0;height:250px}
.rzad .kropka{position:absolute;left:118px;top:96px;width:36px;height:36px;border-radius:50%;
  background:${KOLOR.ciemny};border:8px solid ${KOLOR.jasny};box-shadow:0 0 24px rgba(167,139,250,.6)}
.rzad .karta{position:absolute;left:214px;right:56px;top:34px;min-height:168px;
  border-radius:26px;padding:26px 30px;
  background:linear-gradient(140deg, rgba(255,255,255,.11), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 26px 60px rgba(0,0,0,.42)}
.tresc{display:flex;align-items:center;gap:22px}
.lewo{flex:1;min-width:0}
.nr{font-weight:800;font-size:30px;letter-spacing:4px;color:${KOLOR.jasny};margin-bottom:6px}
.tyt{font-family:${z.tyt},sans-serif;font-weight:${z.wagaTyt};${z.rozciag || ''}
  font-size:58px;line-height:1.0;letter-spacing:${z.trackTyt};color:#fff;white-space:nowrap;
  text-shadow:0 4px 18px rgba(0,0,0,.45)}
.sub{margin-top:10px;font-family:${z.kursywa},serif;font-style:${z.kursywaStyl || 'italic'};
  font-size:38px;color:${KOLOR.cichy}}
.prawo{flex:0 0 auto;text-align:right;font-family:${z.tyt},sans-serif;
  font-weight:${z.wagaTyt};${z.rozciag || ''}
  font-size:88px;letter-spacing:${z.trackTyt};color:#fff;white-space:nowrap;
  text-shadow:0 6px 22px rgba(0,0,0,.5)}
.prawo .jedn{font-size:52px;color:${KOLOR.jasny}}
.hl{position:relative;display:inline-block;padding:12px 18px 14px;border-radius:18px;
  background:${KOLOR.zolty};color:#150e33;font-size:66px;
  box-shadow:0 14px 34px rgba(255,210,63,.28)}

#stopka{position:absolute;left:0;right:0;bottom:0;height:250px;
  background:rgba(0,0,0,.55);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:14px;padding:0 60px;text-align:center}
#stopka .nz{font-family:${z.tyt},sans-serif;font-weight:${z.wagaTyt};${z.rozciag || ''}
  font-size:64px;letter-spacing:${z.trackTyt};color:${KOLOR.zolty}}
#stopka .op{font-size:34px;color:#fff;opacity:.85;line-height:1.25}
</style></head><body>
<div id="tlo"></div><div id="lampa"></div>
<div class="pas" id="pas1"></div><div class="pas" id="pas2"></div>
<div class="tytul">WRZESIEŃ<br>CZY MARZEC?</div>
<div id="szyna"></div>
${RZEDY.map((r, i) => `
<div class="rzad" style="top:${392 + i * 216}px">
  <div class="kropka"></div>
  <div class="karta"><div class="tresc">
    <div class="lewo">
      <div class="nr">${r.nr}</div>
      <div class="tyt">${r.tyt}</div>
      <div class="sub">${r.sub}</div>
    </div>
    <div class="prawo">${r.zolty
      ? `<span class="hl">${r.zolty}</span>`
      : `${r.prawo}<span class="jedn">${r.jedn}</span>`}</div>
  </div></div>
</div>`).join('')}
<div id="stopka"><div class="nz">${z.nazwa}</div><div class="op">${z.opis}</div></div>
</body></html>`;

await mkdir(OUT, { recursive: true });
const br = await chromium.launch();
const str = await br.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

const pliki = [];
for (const z of ZESTAWY) {
  await str.setContent(html(z), { waitUntil: 'networkidle' });
  await str.evaluate(() => document.fonts.ready);
  await str.waitForTimeout(400);
  const plik = path.join(OUT, `${z.id}.png`);
  await str.screenshot({ path: plik });
  pliki.push(plik);
  console.log(`[fonty] ${z.nazwa}`);
}
await br.close();

// Сетка 3×2. Смотреть надо рядом — по одному кадру шрифт всегда «нормальный».
const kw = 520, kh = Math.round((kw / W) * H);
const male = await Promise.all(pliki.map((p) => sharp(p).resize(kw, kh).toBuffer()));
const siatka = path.join(OUT, 'porownanie.png');
await sharp({
  create: { width: kw * 3 + 48, height: kh * 2 + 36, channels: 3, background: '#000' },
})
  .composite(male.map((b, i) => ({
    input: b,
    left: 12 + (i % 3) * (kw + 12),
    top: 12 + Math.floor(i / 3) * (kh + 12),
  })))
  .png()
  .toFile(siatka);

console.log(`[fonty] сетка: ${siatka}`);
