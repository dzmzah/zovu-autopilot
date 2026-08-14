// Рисованный рилс: сцена живёт во времени, а не набор картинок подряд.
//
// Всё, что здесь есть, снято замерами с четырёх роликов Захара
// (`Reklama szkolenia`, `Scenariusz 1/2/3`) — покадрово, по звуку, по речи:
//
//   · склейки НЕ главное. Два ролика из четырёх идут одним планом и не
//     выглядят статичными: живёт не монтаж, а сцена внутри кадра;
//   · объекты не копятся, а СМЕНЯЮТСЯ: пришёл, отработал, ушёл, вместо него
//     другой. Накопление до конца — главное, чем наша первая версия
//     отличалась от образца;
//   · кадр всё время едет: медленный наезд с дрейфом, на смысловых точках
//     подрыв. Именно это Захар назвал «иллюзией живой картинки»;
//   · объекты КРУПНЫЕ — треть ширины кадра, а не мелкие иконки;
//   · цвет подписи смысловой: жёлтый на выгоде, красный на потере;
//   · звуковое событие раз в секунду и чаще — на каждое движение;
//   · 50 кадров в секунду, а не 30: влёты заметно глаже.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const W = 1080, H = 1920, FPS = 50;
const OBIEKTY = path.join(DIR, 'grafika', 'obiekty');

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Картинки вшиваем в страницу как data:URI. Иначе Chromium тянет их с диска
// на КАЖДОМ кадре — на восьмистах кадрах это дольше самой отрисовки.
async function wczytajObiekty(nazwy) {
  const out = {};
  for (const n of nazwy) {
    const b = await readFile(path.join(OBIEKTY, `${n}.png`));
    out[n] = `data:image/png;base64,${b.toString('base64')}`;
  }
  return out;
}

/**
 * @param {object} plan
 *   scena:   [{ obiekt, x, y, skala, obrot, skad, start, koniec?, dokad? }]
 *   slowa:   [{ tekst, a, b }]           — подпись по словам, из синтеза
 *   wzor:    [{ tekst, kolor?, a, b, y }] — строки формулы, собираются под голос
 *   kamera:  [{ t, zoom, x, y }]         — ключевые точки движения кадра
 *   akcenty: { zolty: [...], czerwony: [...] }
 */
export function grafikaHtml(plan) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Каждый объект — тень на «полу» плюс сам предмет. Плоский `drop-shadow`
  // объёма не даёт: он висит вместе с предметом и едет с ним. Объём продаёт
  // тень, которая живёт отдельно.
  const obiekty = plan.scena
    .map(
      (o, i) =>
        `<div class="cien" data-i="${i}"></div>\n` +
        `<img class="ob" data-i="${i}" src="${plan.obrazki[o.obiekt]}" style="width:${o.skala || 380}px">`
    )
    .join('\n');

  const wzory = (plan.wzor || [])
    .map((w, i) => `<div class="wiersz ${w.kolor || ''} ${w.maly ? 'maly' : ''}" data-i="${i}">${esc(w.tekst)}</div>`)
    .join('\n');

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; overflow:hidden; }
body { font-family:'Inter',sans-serif; background:transparent; }

/* Вся сцена внутри одного слоя — его и двигает «камера». Наезд применяется
   ко всему разом, поэтому картинка едет целиком, как в съёмке, а не каждый
   предмет отдельно. */
#kamera { position:absolute; inset:0; transform-origin:50% 46%;
  perspective:1500px; perspective-origin:50% 44%; will-change:transform; }

.ob { position:absolute; left:0; top:0; transform-origin:50% 50%;
  transform-style:preserve-3d; will-change:transform,opacity; }

.cien { position:absolute; left:0; top:0; border-radius:50%;
  background:radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,.55), transparent 72%);
  filter:blur(20px); will-change:transform,opacity; opacity:0; }

/* Формула. Ради неё всё и затевалось: объекты не украшают текст, а СЧИТАЮТ
   вместе с диктором — зритель складывает вместе с ним. */
.wiersz { position:absolute; left:60px; right:60px; text-align:center;
  font-family:'Archivo Black','Inter',sans-serif; font-size:118px; line-height:1.05;
  letter-spacing:-3px; text-transform:uppercase; color:#fff; opacity:0;
  -webkit-text-stroke:10px #0b0718; paint-order:stroke fill;
  text-shadow:0 12px 0 rgba(11,7,24,.5), 0 22px 48px rgba(0,0,0,.6); }
.wiersz.zolty { color:#ffd23f; }
.wiersz.czerwony { color:#ff4d4d; }
.wiersz.maly { font-size:76px; }

/* Подпись под голос. Белая по умолчанию, цвет — только по смыслу:
   жёлтый на выгоде, красный на потере. Так у Захара в образцах. */
.slowo { position:absolute; left:50px; right:50px; bottom:250px; text-align:center;
  font-family:'Archivo Black','Inter',sans-serif;
  font-size:112px; line-height:1.02; letter-spacing:-3px; text-transform:uppercase;
  color:#fff; opacity:0; transform-origin:50% 60%;
  -webkit-text-stroke:9px #0b0718; paint-order:stroke fill;
  text-shadow:0 10px 0 rgba(11,7,24,.55), 0 18px 42px rgba(0,0,0,.55); }
.slowo.zolty { color:#ffd23f; }
.slowo.czerwony { color:#ff4d4d; }

.scrim { position:absolute; left:0; right:0; bottom:0; height:660px; pointer-events:none;
  background:linear-gradient(to top, rgba(8,5,18,.62) 0%, rgba(8,5,18,.28) 46%, transparent 100%); }
</style></head><body>
<div id="kamera">
${obiekty}
${wzory}
</div>
<div class="scrim"></div>
<div class="slowo"></div>
<script>
const S = ${JSON.stringify(plan.scena)};
const SLOWA = ${JSON.stringify(plan.slowa || [])};
const WZOR = ${JSON.stringify(plan.wzor || [])};
const KAM = ${JSON.stringify(plan.kamera || [])};
const AKC = ${JSON.stringify(plan.akcenty || { zolty: [], czerwony: [] })};
const W = ${W}, H = ${H};

const kam = document.getElementById('kamera');
const obs = [...document.querySelectorAll('.ob')];
const cienie = [...document.querySelectorAll('.cien')];
const wiersze = [...document.querySelectorAll('.wiersz')];
const elSlowo = document.querySelector('.slowo');

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const backOut = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const KIERUNKI = { lewo: [-1, .25], prawo: [1, .25], gora: [.2, -1], dol: [-.2, 1] };

window.__fit = () => {};
window.setT = (t) => {
  // ── камера ───────────────────────────────────────────────────────
  // Кадр едет всё время: медленный наезд, дрейф, на смысловых точках
  // подрыв. Неподвижная рамка выдаёт рисунок, движущаяся читается как съёмка.
  let zoom = 1, kx = 0, ky = 0;
  if (KAM.length) {
    let a = KAM[0], b = KAM[KAM.length - 1];
    for (let i = 0; i < KAM.length - 1; i++) {
      if (t >= KAM[i].t && t <= KAM[i + 1].t) { a = KAM[i]; b = KAM[i + 1]; break; }
    }
    const p = b.t > a.t ? easeInOut(clamp01((t - a.t) / (b.t - a.t))) : 1;
    zoom = (a.zoom ?? 1) + ((b.zoom ?? 1) - (a.zoom ?? 1)) * p;
    kx = (a.x ?? 0) + ((b.x ?? 0) - (a.x ?? 0)) * p;
    ky = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * p;
  }
  // Дыхание поверх ключей: даже на «стоянке» кадр не замирает.
  zoom += Math.sin(t * 0.42) * 0.006;
  kx += Math.sin(t * 0.31) * 5;
  ky += Math.cos(t * 0.27) * 4;
  kam.style.transform = 'translate(' + kx.toFixed(1) + 'px,' + ky.toFixed(1) + 'px) scale(' + zoom.toFixed(4) + ')';

  // ── объекты ──────────────────────────────────────────────────────
  obs.forEach((el, i) => {
    const o = S[i];
    const cien = cienie[i];
    const wlot = o.wlot ?? 0.40;
    const rozm = o.skala || 380;
    const koniec = o.koniec ?? 1e9;

    if (t < o.start - 0.02 || t > koniec + 0.5) {
      el.style.opacity = 0; if (cien) cien.style.opacity = 0; return;
    }

    const p = clamp01((t - o.start) / wlot);
    const e = backOut(p);
    const skad = KIERUNKI[o.skad || 'lewo'];
    let dx = (1 - e) * skad[0] * W * 0.9;
    let dy = (1 - e) * skad[1] * H * 0.55;
    let widocz = 1, skala = 1;

    // Уход. Объект не гаснет на месте — он уезжает и уменьшается, иначе
    // кадр «мигает» и смена читается как ошибка сборки.
    if (t > koniec) {
      const q = clamp01((t - koniec) / 0.42);
      const dokad = KIERUNKI[o.dokad || 'gora'];
      dx += q * q * dokad[0] * W * 0.7;
      dy += q * q * dokad[1] * H * 0.45;
      widocz = 1 - q;
      skala = 1 - 0.25 * q;
    }

    const v = Math.abs(backOut(clamp01(p + 0.03)) - e) * 30;
    const blur = Math.min(16, v * 26) + (t > koniec ? 8 * clamp01((t - koniec) / 0.42) : 0);

    // Жизнь после посадки: дрейф, покачивание, поворот по двум осям.
    // У каждого своя фаза, иначе сцена пульсирует в такт.
    const faza = i * 1.9;
    const okres = 3.0 + (i % 3) * 0.7;
    const zyje = clamp01((t - o.start - wlot) / 0.5) * (t > koniec ? 0 : 1);
    const plyw = Math.sin((t / okres) * Math.PI * 2 + faza) * 16 * zyje;
    const kolysanie = Math.sin((t / (okres * 1.4)) * Math.PI * 2 + faza) * 2.6 * zyje;
    const ry = Math.sin((t / (okres * 1.15)) * Math.PI * 2 + faza) * 10 * zyje;
    const rx = Math.cos((t / (okres * 1.6)) * Math.PI * 2 + faza) * 5 * zyje;

    const obrot = (o.obrot || 0) + (1 - e) * (o.skad === 'prawo' ? 26 : -26) + kolysanie;
    el.style.opacity = widocz;
    el.style.filter = 'blur(' + blur.toFixed(1) + 'px)';
    el.style.transform =
      'translate3d(' + (o.x + dx - rozm / 2).toFixed(1) + 'px,' +
      (o.y + dy - rozm / 2 + plyw).toFixed(1) + 'px,0)' +
      ' scale(' + skala.toFixed(3) + ')' +
      ' rotateY(' + ry.toFixed(1) + 'deg) rotateX(' + rx.toFixed(1) + 'deg)' +
      ' rotate(' + obrot.toFixed(1) + 'deg)';

    if (cien) {
      const wys = (plyw + 16) / 32;
      const szer = rozm * (0.60 + 0.16 * wys) * skala;
      cien.style.opacity = (0.5 - 0.2 * wys) * e * widocz;
      cien.style.width = szer.toFixed(1) + 'px';
      cien.style.height = (szer * 0.28).toFixed(1) + 'px';
      cien.style.transform =
        'translate(' + (o.x + dx - szer / 2).toFixed(1) + 'px,' +
        (o.y + dy + rozm * 0.42).toFixed(1) + 'px)';
    }
  });

  // ── формула ──────────────────────────────────────────────────────
  wiersze.forEach((el, i) => {
    const w = WZOR[i];
    el.style.top = w.y + 'px';
    if (t < w.a - 0.02 || t > (w.b ?? 1e9)) { el.style.opacity = 0; return; }
    const p = clamp01((t - w.a) / 0.16);
    const e = backOut(p);
    const gasnie = w.b ? clamp01((w.b - t) / 0.3) : 1;
    el.style.opacity = Math.min(1, p * 2.4) * gasnie;
    el.style.transform = 'scale(' + (0.7 + 0.3 * e).toFixed(3) + ')';
  });

  // ── подпись ──────────────────────────────────────────────────────
  const w = SLOWA.find((s) => t >= s.a - 0.06 && t < s.b + 0.16);
  if (w) {
    const czysty = w.tekst.replace(/[.,!?…]+$/, '');
    const male = czysty.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    elSlowo.textContent = czysty;
    elSlowo.classList.toggle('zolty', AKC.zolty.includes(male));
    elSlowo.classList.toggle('czerwony', AKC.czerwony.includes(male));
    const p = clamp01((t - (w.a - 0.06)) / 0.14);
    const e = backOut(p);
    elSlowo.style.opacity = Math.min(1, p * 2.2);
    elSlowo.style.transform =
      'scale(' + (0.82 + 0.18 * e).toFixed(3) + ') rotate(' + ((1 - e) * -3.2).toFixed(2) + 'deg)';
  } else {
    elSlowo.style.opacity = 0;
  }
};
</script></body></html>`;
}

// Снимаем страницу покадрово: время задаём сами через setT, а не ждём
// реального проигрывания — иначе кадры поедут на любой заминке браузера.
export async function renderujKlatki(html, sekundy, outDir) {
  await mkdir(outDir, { recursive: true });
  const plikHtml = path.join(outDir, 'scena.html');
  await writeFile(plikHtml, html, 'utf8');

  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + plikHtml.replace(/\\/g, '/'));
  await page.waitForTimeout(600);

  const klatek = Math.ceil(sekundy * FPS);
  for (let i = 0; i < klatek; i++) {
    await page.evaluate((t) => window.setT(t), i / FPS);
    await page.screenshot({
      path: path.join(outDir, `f${String(i).padStart(5, '0')}.png`),
      omitBackground: true,
    });
  }
  await browser.close();
  return klatek;
}

export { W, H, FPS, wczytajObiekty, ffmpeg };
