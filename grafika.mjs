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

  // Каждый объект — это ТРИ элемента: тень на «полу», сам предмет и его
  // собственная тень-подсветка. Плоский `drop-shadow` объёма не даёт: он
  // висит вместе с предметом. Объём продаёт именно тень, которая живёт
  // отдельно — сжимается, когда предмет опускается, и растекается, когда
  // поднимается.
  const obiekty = plan.scena
    .map(
      (o, i) =>
        `<div class="cien" data-i="${i}"></div>\n` +
        `<img class="ob" data-i="${i}" src="${obrazki[o.obiekt]}" style="width:${o.skala || 300}px">`
    )
    .join('\n');

  const meta = JSON.stringify(plan.scena);
  const slowa = JSON.stringify(plan.slowa || []);
  const licznik = JSON.stringify(plan.licznik || null);

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; overflow:hidden; }
/* Фон один на весь ролик — именно он и связывает сцену в целое. У образца
   мягкий топографический узор; у нас фирменный тёмный с фиолетовым ядром. */
/* Фон — не заливка, а СРЕДА. Плоский градиент читается как обои, и на нём
   любой предмет выглядит наклейкой. Глубина набирается слоями: далёкие
   пятна двигаются медленно, ближние быстрее — это и есть параллакс, из
   которого глаз собирает объём. Сверху зерно: чистый цифровой градиент
   всегда выглядит плоско, шум даёт ему поверхность. */
/* Фон страницы ПРОЗРАЧНЫЙ: под него подкладывается настоящее видео из
   набора абстрактных фонов Захара. Рисовать среду самому, когда рядом
   лежат полсотни готовых анимированных — значит делать хуже и дольше. */
body { font-family:'Inter',sans-serif; background:transparent;
  perspective:1400px; perspective-origin:50% 42%; }

.plama { position:absolute; border-radius:50%; filter:blur(90px); opacity:.55;
  will-change:transform; }
.p1 { width:1200px; height:1000px; background:#3a2a86; left:-180px; top:180px; }
.p2 { width:900px; height:900px; background:#5b2f9e; right:-220px; top:620px; opacity:.42; }
.p3 { width:1100px; height:800px; background:#1d3a7a; left:120px; bottom:-120px; opacity:.38; }

/* «Пол»: широкое мягкое пятно света снизу. Даёт сцене низ и верх — без него
   предметы висят в пустоте, а не стоят в пространстве. */
.podloga { position:absolute; left:-10%; right:-10%; bottom:-6%; height:52%;
  background:radial-gradient(ellipse 60% 100% at 50% 100%, rgba(150,120,255,.22), transparent 70%); }

/* Виньетка собирает взгляд к центру и добавляет глубины по краям. */
.winieta { position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse 78% 62% at 50% 44%, transparent 40%, rgba(0,0,0,.55) 100%); }

/* Зерно поверх всего — 2% шума. Именно оно убирает ощущение «нарисовано
   в браузере»: у чистого градиента нет поверхности, у зерна есть. */
.ziarno { position:absolute; inset:0; pointer-events:none; opacity:.16;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/></filter><rect width='180' height='180' filter='url(%23n)' opacity='0.5'/></svg>");
  mix-blend-mode:overlay; }

.ob { position:absolute; left:0; top:0; transform-origin:50% 50%;
  transform-style:preserve-3d; will-change:transform,opacity; }

/* Контактная тень: отдельный эллипс под предметом. Живёт своей жизнью —
   сжимается и темнеет, когда предмет опускается, растекается и бледнеет,
   когда поднимается. */
.cien { position:absolute; left:0; top:0; border-radius:50%;
  background:radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,.62), transparent 72%);
  filter:blur(18px); will-change:transform,opacity; opacity:0; }

/* Подпись: одно слово, капсом, крупно. Читается на бегу, не мешает объектам. */
/* Подпись. Просто жирный белый текст — это «есть субтитры», а не приём.
   Работает связка из четырёх вещей: толстая тёмная обводка (читается на
   любом фоне), плотный узкий шрифт, лёгкий наклон и подскок на появлении.
   Ключевое слово подсвечивается цветом — глаз цепляется за него, а не
   читает строку целиком. */
.slowo { position:absolute; left:50px; right:50px; bottom:300px; text-align:center;
  font-family:'Archivo Black','Inter',sans-serif; font-weight:900;
  font-size:112px; line-height:1.02; letter-spacing:-3px; text-transform:uppercase;
  color:#fff; opacity:0; transform-origin:50% 60%;
  -webkit-text-stroke:9px #0b0718; paint-order:stroke fill;
  text-shadow:0 10px 0 rgba(11,7,24,.55), 0 18px 42px rgba(0,0,0,.55); }
.slowo.akcent { color:#d4ff3f; }

/* Барабан: цифра меняется со смазом, как одометр. */
.licznik { position:absolute; left:0; right:0; top:640px; text-align:center;
  font-weight:900; font-size:190px; letter-spacing:-8px; color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.5); opacity:0; }
.licznik .suf { font-size:88px; letter-spacing:-2px; opacity:.85; margin-left:14px; }
</style></head><body>
<div class="podloga"></div>
${obiekty}
<div class="licznik"><span class="cyf">0</span><span class="suf"></span></div>
<div class="slowo"></div>
<div class="winieta"></div>
<div class="ziarno"></div>
<script>
const S = ${meta}, SLOWA = ${slowa}, LIC = ${licznik};
const W = ${W}, H = ${H};
const obs = [...document.querySelectorAll('.ob')];
const cienie = [...document.querySelectorAll('.cien')];
const plamy = [...document.querySelectorAll('.plama')];
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
  // Фон дышит: дальние пятна ползут медленно, ближние быстрее. Разница
  // скоростей и есть то, из чего глаз собирает глубину.
  plamy.forEach((el, i) => {
    const sz = [0.5, 0.8, 1.15][i] || 1;
    el.style.transform =
      'translate(' + (Math.sin(t * 0.16 * sz + i) * 46 * sz).toFixed(1) + 'px,' +
      (Math.cos(t * 0.13 * sz + i * 1.7) * 38 * sz).toFixed(1) + 'px)';
  });

  obs.forEach((el, i) => {
    const o = S[i];
    const cien = cienie[i];
    const wlot = o.wlot ?? 0.42;          // сколько длится влёт
    const p = clamp01((t - o.start) / wlot);
    const rozm = o.skala || 300;
    if (t < o.start - 0.02) { el.style.opacity = 0; if (cien) cien.style.opacity = 0; return; }
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

    // ── жизнь ПОСЛЕ посадки ──────────────────────────────────────
    // Прилетевший и застывший предмет читается как наклейка. Поэтому он
    // продолжает плавать: у каждого своя фаза и свой период, иначе сцена
    // начинает пульсировать в такт и выглядит механической.
    const faza = i * 1.9;
    const okres = 3.0 + (i % 3) * 0.7;
    const zyje = clamp01((t - o.start - wlot) / 0.5);   // вступает плавно
    const plyw = Math.sin((t / okres) * Math.PI * 2 + faza) * 15 * zyje;
    const kolysanie = Math.sin((t / (okres * 1.4)) * Math.PI * 2 + faza) * 2.6 * zyje;

    // Поворот в 3D. Плоский PNG, повёрнутый по Y и X с перспективой, глаз
    // читает как объёмную модель — именно этого не хватало.
    const ry = Math.sin((t / (okres * 1.15)) * Math.PI * 2 + faza) * 9 * zyje;
    const rx = Math.cos((t / (okres * 1.6)) * Math.PI * 2 + faza) * 5 * zyje;

    const obrot = (o.obrot || 0) + (1 - e) * (o.skad === 'prawo' ? 26 : -26) + kolysanie;
    el.style.filter = 'blur(' + blur.toFixed(1) + 'px)';
    el.style.transform =
      'translate3d(' + (o.x + dx - rozm / 2).toFixed(1) + 'px,' +
      (o.y + dy - rozm / 2 + plyw).toFixed(1) + 'px,0)' +
      ' rotateY(' + ry.toFixed(1) + 'deg) rotateX(' + rx.toFixed(1) + 'deg)' +
      ' rotate(' + obrot.toFixed(1) + 'deg)';

    // Тень под предметом. Чем выше он поднялся, тем шире и бледнее пятно —
    // это и есть ощущение, что предмет НАД поверхностью, а не наклеен на неё.
    if (cien) {
      const wys = (plyw + 15) / 30;                    // 0 внизу, 1 вверху
      const szer = rozm * (0.62 + 0.16 * wys);
      const wys2 = szer * 0.30;
      cien.style.opacity = (0.55 - 0.22 * wys) * e * zyje;
      cien.style.width = szer.toFixed(1) + 'px';
      cien.style.height = wys2.toFixed(1) + 'px';
      cien.style.transform =
        'translate(' + (o.x + dx - szer / 2).toFixed(1) + 'px,' +
        (o.y + dy + rozm * 0.42).toFixed(1) + 'px)';
    }
  });

  // Подпись по словам — берём слово, которое звучит прямо сейчас.
  const w = SLOWA.find((s) => t >= s.a - 0.06 && t < s.b + 0.16);
  if (w) {
    const czysty = w.tekst.replace(/[.,!?…]+$/, '');
    elSlowo.textContent = czysty;
    // Длинные слова — важные: на них цвет. Служебные проскакивают белыми,
    // и глаз не дёргается на каждом «и», «за», «то».
    elSlowo.classList.toggle('akcent', czysty.replace(/[^\\p{L}]/gu, '').length >= 7);

    // Подскок: слово выходит с перелётом и лёгким наклоном, а не проявляется.
    const p = clamp01((t - (w.a - 0.06)) / 0.14);
    const e = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
    elSlowo.style.opacity = Math.min(1, p * 2.2);
    elSlowo.style.transform =
      'scale(' + (0.82 + 0.18 * e).toFixed(3) + ') rotate(' + ((1 - e) * -3.2).toFixed(2) + 'deg)';
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
    await page.screenshot({ path: path.join(outDir, `f${String(i).padStart(5, '0')}.png`), omitBackground: true });
  }
  await browser.close();
  return klatek;
}

export { W, H, FPS, wczytajObiekty, ffmpeg };
