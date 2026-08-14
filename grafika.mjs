// Рисованный рилс: объекты влетают в кадр, цифра крутится барабаном,
// подпись меняется по слову. Ни одного кадра стока — всё рисуется кодом.
//
// Зачем отдельно от `awatar-reel.mjs`. Тот собирает ролик ИЗ ВИДЕО: клипы,
// склейки, подписи поверх. Здесь видео нет вообще, есть сцена, которая живёт
// во времени. Это разные задачи, и мешать их в одном файле — значит получить
// третий, который не делает толком ни того ни другого.
//
// Язык анимации снят с первого рилса ZOVU покадрово:
//   · объекты влетают ПО ОДНОМУ, очередью с шагом ~0.13 с, а не разом;
//   · каждый летит из-за своего края по диагонали, в движении смазан;
//   · садится с ПЕРЕЛЁТОМ и лёгким разворотом — не по линейке;
//   · на каждое появление свой щелчок или свист (в оригинале 31 звук на 22 с);
//   · подпись внизу — одно слово капсом, меняется под голос.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const W = 1080, H = 1920, FPS = 30;
const OBIEKTY = path.join(DIR, 'grafika', 'obiekty');

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Картинки вшиваем в страницу как data:URI. Иначе Chromium тянет их с диска
// на КАЖДОМ кадре — на шестистах кадрах это заметно дольше самой отрисовки.
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
 *   scena: [{ obiekt, x, y, skala, obrot, skad: 'lewo'|'prawo'|'gora'|'dol', wlot }]
 *   slowa: [{ tekst, a, b }]    — подпись по словам, из синтеза
 *   licznik: { od, do, a, b, sufiks }
 */
export function grafikaHtml(plan, obrazki, total) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const obiekty = plan.scena
    .map(
      (o, i) =>
        `<img class="ob" data-i="${i}" src="${obrazki[o.obiekt]}" style="width:${o.skala || 300}px">`
    )
    .join('\n');

  const meta = JSON.stringify(plan.scena);
  const slowa = JSON.stringify(plan.slowa || []);
  const licznik = JSON.stringify(plan.licznik || null);

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; overflow:hidden; }
/* Фон один на весь ролик — именно он и связывает сцену в целое. У образца
   мягкий топографический узор; у нас фирменный тёмный с фиолетовым ядром. */
body { font-family:'Inter',sans-serif; background:
  radial-gradient(ellipse 900px 700px at 50% 38%, #2a1e5c 0%, transparent 62%),
  radial-gradient(ellipse 700px 900px at 82% 88%, #1d1442 0%, transparent 58%),
  linear-gradient(180deg,#0d0a1c 0%,#080614 100%); }

.ob { position:absolute; left:0; top:0; transform-origin:50% 50%;
  filter:drop-shadow(0 24px 48px rgba(0,0,0,.55)); will-change:transform,opacity; }

/* Подпись: одно слово, капсом, крупно. Читается на бегу, не мешает объектам. */
.slowo { position:absolute; left:60px; right:60px; bottom:300px; text-align:center;
  font-weight:900; font-size:104px; letter-spacing:-2px; text-transform:uppercase;
  color:#fff; text-shadow:0 8px 34px rgba(0,0,0,.6); opacity:0; }

/* Барабан: цифра меняется со смазом, как одометр. */
.licznik { position:absolute; left:0; right:0; top:640px; text-align:center;
  font-weight:900; font-size:190px; letter-spacing:-8px; color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.5); opacity:0; }
.licznik .suf { font-size:88px; letter-spacing:-2px; opacity:.85; margin-left:14px; }
</style></head><body>
${obiekty}
<div class="licznik"><span class="cyf">0</span><span class="suf"></span></div>
<div class="slowo"></div>
<script>
const S = ${meta}, SLOWA = ${slowa}, LIC = ${licznik};
const W = ${W}, H = ${H};
const obs = [...document.querySelectorAll('.ob')];
const elSlowo = document.querySelector('.slowo');
const elLic = document.querySelector('.licznik');
const elCyf = elLic.querySelector('.cyf');
const elSuf = elLic.querySelector('.suf');

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Перелёт: объект проскакивает своё место и возвращается. Это и читается
// как «прилетел», а не «проявился». Классический back-out.
const backOut = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

window.__fit = () => {};
window.setT = (t) => {
  obs.forEach((el, i) => {
    const o = S[i];
    const wlot = o.wlot ?? 0.42;          // сколько длится влёт
    const p = clamp01((t - o.start) / wlot);
    if (t < o.start - 0.02) { el.style.opacity = 0; return; }
    el.style.opacity = 1;

    const e = backOut(p);
    // Откуда летит: из-за своего края, по диагонали к месту.
    const daleko = { lewo: [-1, .25], prawo: [1, .25], gora: [.2, -1], dol: [-.2, 1] }[o.skad || 'lewo'];
    const dx = (1 - e) * daleko[0] * W * 0.9;
    const dy = (1 - e) * daleko[1] * H * 0.55;

    // Смаз по скорости: чем быстрее движется, тем сильнее размыт. Без него
    // влёт выглядит дёрганым — глаз ждёт следа за быстрым предметом.
    const v = Math.abs(backOut(clamp01(p + 0.03)) - e) * 30;
    const blur = Math.min(14, v * 26);

    const obrot = (o.obrot || 0) + (1 - e) * (o.skad === 'prawo' ? 26 : -26);
    el.style.filter = 'drop-shadow(0 24px 48px rgba(0,0,0,.55)) blur(' + blur.toFixed(1) + 'px)';
    el.style.transform =
      'translate(' + (o.x + dx - (o.skala || 300) / 2).toFixed(1) + 'px,' +
      (o.y + dy - (o.skala || 300) / 2).toFixed(1) + 'px) rotate(' + obrot.toFixed(1) + 'deg)';
  });

  // Подпись по словам — берём слово, которое звучит прямо сейчас.
  const w = SLOWA.find((s) => t >= s.a - 0.06 && t < s.b + 0.16);
  if (w) {
    elSlowo.textContent = w.tekst.replace(/[.,!?…]+$/, '');
    const p = clamp01((t - (w.a - 0.06)) / 0.12);
    elSlowo.style.opacity = 1;
    elSlowo.style.transform = 'scale(' + (0.9 + 0.1 * p).toFixed(3) + ')';
  } else {
    elSlowo.style.opacity = 0;
  }

  // Барабан: докручиваем разряды справа налево, последние цифры дольше.
  if (LIC) {
    const p = clamp01((t - LIC.a) / (LIC.b - LIC.a));
    if (t < LIC.a - 0.02 || t > LIC.b + 2.2) { elLic.style.opacity = 0; return; }
    elLic.style.opacity = 1;
    elSuf.textContent = LIC.sufiks || '';
    const cel = LIC.do;
    if (p >= 1) { elCyf.textContent = String(cel); elCyf.style.filter = 'none'; return; }
    // пока крутится — показываем случайное число рядом с целью и мажем
    const rozrzut = (LIC.od - cel) * (1 - p);
    const szum = Math.sin(t * 47) * rozrzut * 0.35;
    elCyf.textContent = String(Math.max(0, Math.round(cel + rozrzut + szum)));
    elCyf.style.filter = 'blur(' + (2 + 7 * (1 - p)).toFixed(1) + 'px)';
  }
};
</script></body></html>`;
}

// Снимаем страницу покадрово. Тот же приём, что в движке рилсов: время
// задаём сами через setT, а не ждём реального проигрывания — иначе кадры
// поедут на любой заминке браузера.
export async function renderujKlatki(html, sekundy, outDir) {
  await mkdir(outDir, { recursive: true });
  const plikHtml = path.join(outDir, 'scena.html');
  await writeFile(plikHtml, html, 'utf8');

  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + plikHtml.replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__fit && window.__fit());

  const klatek = Math.ceil(sekundy * FPS);
  for (let i = 0; i < klatek; i++) {
    await page.evaluate((t) => window.setT(t), i / FPS);
    await page.screenshot({ path: path.join(outDir, `f${String(i).padStart(5, '0')}.png`) });
  }
  await browser.close();
  return klatek;
}

export { W, H, FPS, wczytajObiekty, ffmpeg };
