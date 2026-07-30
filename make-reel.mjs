// Вертикальный рилс 1080x1920 — собственный макет, а не карусель в рамке.
//
// Как устроено. Открываем ОДНУ html-страницу, где вся анимация — чистая функция
// времени: `setT(t)` расставляет элементы для момента t. Дальше прогоняем время
// по кадрам и снимаем скриншот каждого. Так кадры получаются точные и
// повторяемые — в отличие от записи видео браузером, где тайминг «плывёт».
//
// Что делает картинку не «текстом на градиенте»:
//   • под каждую сцену генерится свой вертикальный кадр (Pollinations, бесплатно)
//   • макеты чередуются: полный кадр, карточка, раскол, крупный текст
//   • на финале — лицо из команды, а не очередная надпись
//   • монтаж привязан к темпу дорожки, на склейках звучит удар
//
//   node make-reel.mjs --demo      — собрать пример из тестовых данных
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const OUT_DIR = path.join(import.meta.dirname, 'out');
const MUSIC_DIR = path.join(import.meta.dirname, 'music');
const LOGO_FILE = path.join(import.meta.dirname, 'logo-white.b64');
const W = 1080;
const H = 1920;
const FPS = 30;

const PEOPLE = {
  zah: { file: 'C:\\Users\\zahar\\zovu-pl\\захар.jpg', name: 'Zah', role: 'Content & AI' },
  mat: { file: 'C:\\Users\\zahar\\zovu-pl\\Митя.jpg', name: 'Mat', role: 'Founder & CEO' },
  alex: { file: 'C:\\Users\\zahar\\zovu-pl\\саша.jpg', name: 'Alex', role: 'Creative' },
};

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function logoUri() {
  try {
    return 'data:image/png;base64,' + (await readFile(LOGO_FILE, 'utf8')).trim();
  } catch {
    return '';
  }
}

async function fileUri(file, { width, height } = {}) {
  if (!file) return '';
  try {
    let img = sharp(file);
    if (width) img = img.resize(width, height, { fit: 'cover', position: sharp.strategy.attention });
    const buf = await img.jpeg({ quality: 86 }).toBuffer();
    return 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch {
    return '';
  }
}

async function pickMusic() {
  try {
    const files = (await readdir(MUSIC_DIR)).filter((f) => /\.(mp3|m4a|aac|wav)$/i.test(f));
    if (!files.length) return null;
    return path.join(MUSIC_DIR, files[Math.floor(Math.random() * files.length)]);
  } catch {
    return null;
  }
}

// ── темп дорожки ──────────────────────────────────────────────────
// Раскладываем звук на огибающую громкости и ищем период, на котором она
// повторяется чаще всего (автокорреляция). Для электронной музыки с ровной
// бочкой это работает надёжно; если не нашли — вернём null и смонтируем
// по фиксированным секундам.
export async function detectTempo(file) {
  const SR = 11025;
  const HOP = 256; // ~43 значения огибающей в секунду
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-t', '60', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'],
      { maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' }
    );
    const pcm = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
    const frames = Math.floor(pcm.length / HOP);
    if (frames < 200) return null;

    const energy = new Float64Array(frames);
    for (let i = 0; i < frames; i++) {
      let s = 0;
      for (let j = 0; j < HOP; j++) s += Math.abs(pcm[i * HOP + j]);
      energy[i] = s / HOP;
    }
    // огибающая атак: нас интересует только рост громкости
    const onset = new Float64Array(frames);
    for (let i = 1; i < frames; i++) onset[i] = Math.max(0, energy[i] - energy[i - 1]);

    let mean = 0;
    for (const v of onset) mean += v;
    mean /= frames;
    for (let i = 0; i < frames; i++) onset[i] -= mean;

    const rate = SR / HOP;
    const lagMin = Math.floor((60 / 180) * rate);
    const lagMax = Math.ceil((60 / 70) * rate);
    let bestLag = 0;
    let best = -Infinity;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < frames; i++) sum += onset[i] * onset[i + lag];
      const score = sum / (frames - lag); // нормируем: короткие лаги иначе всегда выигрывают
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
    if (!bestLag) return null;
    let bpm = (60 * rate) / bestLag;
    while (bpm < 85) bpm *= 2; // 75 BPM для монтажа то же самое, что 150
    while (bpm > 170) bpm /= 2;
    return { bpm, beat: 60 / bpm };
  } catch {
    return null;
  }
}

// ── сцены ─────────────────────────────────────────────────────────
// Макеты чередуются: одинаковая сетка семь раз подряд читается как слайдшоу.
const LAYOUTS = ['full', 'card', 'split', 'huge'];

function buildScenes(data, beat) {
  const beatsFor = (seconds) => Math.max(2, Math.round(seconds / beat));
  const items = (data.items || []).slice(0, 5);

  const scenes = [
    {
      kind: 'hook',
      layout: 'full',
      eyebrow: data.eyebrow,
      title: data.title,
      sub: data.subtitle,
      beats: beatsFor(3.4),
    },
    ...items.map((it, i) => ({
      kind: 'item',
      layout: LAYOUTS[i % LAYOUTS.length],
      index: i + 1,
      heading: it.heading,
      text: it.text,
      beats: beatsFor(2.4),
    })),
    {
      kind: 'cta',
      layout: 'face',
      headline: (data.cta && data.cta.headline) || 'Zrobimy to za Ciebie',
      line: (data.cta && data.cta.line) || 'zovu.pl',
      beats: beatsFor(3.2),
    },
  ];

  let t = 0;
  for (const s of scenes) {
    s.start = t;
    s.dur = s.beats * beat;
    t += s.dur;
  }
  return { scenes, total: t };
}

// ── страница ──────────────────────────────────────────────────────
function pageHtml(scenes, beat, logo, site, person) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = (s) =>
    esc(s)
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `<span class="w">${w}</span>`)
      .join(' ');

  const media = (s) =>
    s.image
      ? `<div class="media"><img src="${s.image}" alt=""></div><div class="scrim"></div>`
      : '<div class="scrim soft"></div>';

  const sections = scenes
    .map((s, i) => {
      const head = `<div class="body">
        <h1 class="big">${words(s.kind === 'item' ? s.heading : s.kind === 'cta' ? s.headline : s.title)}</h1>
        <div class="rule"></div>
        ${s.kind === 'item' ? `<p class="sub">${esc(s.text)}</p>` : ''}
        ${s.kind === 'hook' && s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}
        ${s.kind === 'cta' ? `<p class="sub">${esc(s.line)}</p>` : ''}
      </div>`;

      const chip = s.kind === 'hook' ? `<div class="chip"><i></i>${esc(s.eyebrow || 'ZOVU')}</div>` : '';
      const num =
        s.kind === 'item'
          ? `<div class="num">${String(s.index).padStart(2, '0')}</div>
             <div class="ghost">${String(s.index).padStart(2, '0')}</div>`
          : '';
      const face =
        s.kind === 'cta' && person
          ? `<div class="face"><img src="${person.uri}" alt="">
               <div class="who"><span class="nm">${esc(person.name)}</span>
               <span class="rl">${esc(person.role)}</span></div></div>`
          : '';
      const mark =
        s.kind === 'cta'
          ? `<div class="mark">${logo ? `<img src="${logo}" alt="">` : ''}<span>ZOVU</span></div>`
          : '';

      return `<section class="sc l-${s.layout}" data-i="${i}">
        ${media(s)}${chip}${num}${face}${head}${mark}
      </section>`;
    })
    .join('\n');

  const meta = JSON.stringify(
    scenes.map((s) => ({ start: s.start, dur: s.dur, kind: s.kind, layout: s.layout }))
  );

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:#050505; color:#fff; overflow:hidden; position:relative;
  font-family:'JetBrains Mono', monospace; }

/* ── постоянный фон под всем: он виден там, где картинка не закрывает кадр ── */
#bg { position:absolute; inset:0; overflow:hidden; z-index:0; }
#glowA, #glowB { position:absolute; border-radius:50%; }
#glowA { width:1500px; height:1500px;
  background:radial-gradient(circle at center, rgba(124,58,237,.50), rgba(124,58,237,0) 62%); }
#glowB { width:1200px; height:1200px;
  background:radial-gradient(circle at center, rgba(167,139,250,.30), rgba(167,139,250,0) 60%); }
#grid { position:absolute; left:-200px; right:-200px; top:-400px; height:3000px; opacity:.18;
  background-image:
    linear-gradient(to right, rgba(167,139,250,.18) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(167,139,250,.18) 1px, transparent 1px);
  background-size:110px 110px;
  mask-image:radial-gradient(ellipse 70% 45% at 50% 42%, #000 15%, transparent 80%);
  -webkit-mask-image:radial-gradient(ellipse 70% 45% at 50% 42%, #000 15%, transparent 80%); }
#noise { position:absolute; inset:0; opacity:.06; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E"); }

/* ── сцена ── */
#stage { position:absolute; inset:0; z-index:2; transform-origin:50% 46%; }
.sc { position:absolute; inset:0; visibility:hidden; }
.media { position:absolute; overflow:hidden; will-change:transform; }
.media img { width:100%; height:100%; object-fit:cover; }
.scrim { position:absolute; inset:0; }
.body { position:absolute; left:90px; right:90px; display:flex; flex-direction:column; }

/* макет «во весь кадр»: картинка на весь экран, текст внизу */
.l-full .media { inset:0; }
.l-full .scrim { background:
  linear-gradient(180deg, rgba(5,5,5,.55) 0%, rgba(5,5,5,.10) 26%, rgba(5,5,5,.72) 62%, rgba(5,5,5,.96) 100%); }
.l-full .body { left:90px; right:90px; bottom:400px; }

/* макет «карточка»: картинка в скруглённой рамке сверху, текст под ней */
.l-card .media { left:90px; right:90px; top:170px; height:800px; border-radius:40px;
  box-shadow:0 40px 120px rgba(0,0,0,.6), 0 0 0 1px rgba(167,139,250,.28); }
.l-card .scrim { background:linear-gradient(180deg, rgba(5,5,5,0) 55%, rgba(5,5,5,.55) 100%); }
.l-card .body { top:1000px; bottom:400px; justify-content:center; }

/* макет «раскол»: картинка в правой половине, текст в левой */
.l-split .media { left:520px; right:0; top:0; bottom:0;
  mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,.4) 22%, #000 52%);
  -webkit-mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,.4) 22%, #000 52%); }
.l-split .scrim { background:linear-gradient(180deg, rgba(5,5,5,.35) 0%, rgba(5,5,5,0) 40%, rgba(5,5,5,.85) 100%); }
.l-split .body { left:90px; right:420px; top:0; bottom:0; justify-content:center; }

/* макет «крупный текст»: картинка уходит в размытое свечение позади слов */
.l-huge .media { inset:0; filter:saturate(1.3) contrast(1.06); opacity:.52; }
.l-huge .scrim { background:linear-gradient(180deg, rgba(5,5,5,.62) 0%, rgba(5,5,5,.34) 38%, rgba(5,5,5,.92) 100%); }
.l-huge .body { left:90px; right:90px; top:0; bottom:0; justify-content:center; }

/* финал: лицо крупно, под ним обещание */
.l-face .media { inset:0; }
.l-face .scrim { background:linear-gradient(180deg, rgba(5,5,5,.5) 0%, rgba(5,5,5,.2) 20%, rgba(5,5,5,.9) 60%, rgba(5,5,5,.99) 100%); }
.l-face .body { left:90px; right:90px; bottom:430px; }
.face { position:absolute; left:90px; top:330px; display:flex; align-items:center; gap:28px; }
.face img { width:230px; height:230px; border-radius:44px; object-fit:cover;
  border:2px solid rgba(167,139,250,.6);
  box-shadow:0 30px 90px rgba(0,0,0,.7), 0 0 70px 12px rgba(124,58,237,.4); }
.face .who { display:flex; flex-direction:column; gap:10px; }
.face .nm { font-family:'Oswald', sans-serif; font-weight:700; font-size:56px; letter-spacing:.06em;
  text-transform:uppercase; }
.face .rl { font-size:24px; color:#c4b5fd; letter-spacing:.14em; text-transform:uppercase; }

.chip { position:absolute; left:90px; top:250px; display:inline-flex; align-items:center; gap:14px;
  border:1px solid rgba(167,139,250,.5); border-radius:999px; padding:14px 30px;
  font-size:24px; letter-spacing:.22em; text-transform:uppercase; color:#c4b5fd;
  background:rgba(124,58,237,.16); backdrop-filter:blur(6px); }
.chip i { width:11px; height:11px; border-radius:50%; background:#a78bfa;
  box-shadow:0 0 16px 4px rgba(167,139,250,.9); }

h1.big { font-family:'Oswald', sans-serif; font-weight:700; text-transform:uppercase;
  line-height:1.06; letter-spacing:-2px; font-size:150px; padding-bottom:.06em; }
/* Градиент задаём КАЖДОМУ слову, а не заголовку целиком: слова анимируются
   через opacity, а прозрачность на потомке ломает background-clip родителя —
   текст просто пропадает. Градиент вертикальный, поэтому по словам одинаковый. */
h1.big .w { display:inline-block; will-change:transform,opacity;
  background-image:linear-gradient(180deg,#ffffff 0%,#ffffff 46%,#c9bcff 100%);
  -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; color:transparent;
  filter:drop-shadow(0 6px 30px rgba(0,0,0,.75)); }
.rule { height:5px; width:0; margin:38px 0 32px; border-radius:4px;
  background:linear-gradient(90deg,#a78bfa,rgba(167,139,250,0)); }
.sub { font-size:42px; line-height:1.42; color:#efeafd; max-width:92%;
  text-shadow:0 4px 24px rgba(0,0,0,.8); }

.num { position:absolute; left:90px; top:250px; font-family:'Oswald', sans-serif;
  font-weight:700; font-size:60px; letter-spacing:.08em; color:#0b0b0f;
  background:#a78bfa; border-radius:20px; padding:8px 26px;
  box-shadow:0 0 50px rgba(124,58,237,.75); }
.ghost { position:absolute; right:-30px; top:120px; font-family:'Oswald', sans-serif;
  font-weight:700; font-size:520px; line-height:.8; color:rgba(255,255,255,.07); }
.l-split .ghost, .l-card .ghost { display:none; }
.mark { position:absolute; left:90px; bottom:290px; display:flex; align-items:center; gap:22px; }
.mark img { width:88px; height:88px; object-fit:contain;
  filter:drop-shadow(0 0 26px rgba(167,139,250,.7)); }
.mark span { font-family:'Oswald', sans-serif; font-weight:700; font-size:62px; letter-spacing:.2em; }

/* подвал держим выше зоны, где Instagram рисует подпись и кнопки */
#foot { position:absolute; left:90px; right:90px; bottom:250px; z-index:3;
  padding-top:34px; border-top:1px solid rgba(255,255,255,.16);
  display:flex; align-items:center; justify-content:space-between; }
#foot .brand { display:flex; align-items:center; gap:18px; }
#foot img { width:56px; height:56px; object-fit:contain;
  filter:drop-shadow(0 0 18px rgba(167,139,250,.55)); }
#foot .wm { font-family:'Oswald', sans-serif; font-weight:700; font-size:38px; letter-spacing:.18em; }
#foot .site { font-size:26px; color:#a78bfa; letter-spacing:.06em; }
/* полоска прогресса — глазами видно, сколько осталось, и это удерживает */
#prog { position:absolute; left:0; top:0; height:6px; z-index:5;
  background:linear-gradient(90deg,#a78bfa,#e9d5ff); box-shadow:0 0 20px rgba(167,139,250,.8); }
#flash { position:absolute; inset:0; z-index:4; background:#e9e2ff; opacity:0; }
</style></head><body>
<div id="bg">
  <div id="glowA"></div><div id="glowB"></div>
  <div id="grid"></div><div id="noise"></div>
</div>
<div id="stage">${sections}</div>
<div id="foot">
  <div class="brand">${logo ? `<img src="${logo}" alt="">` : ''}<span class="wm">ZOVU</span></div>
  <span class="site">${esc(site || 'zovu.pl')}</span>
</div>
<div id="prog"></div>
<div id="flash"></div>
<script>
const SCENES = ${meta};
const BEAT = ${beat};
const TOTAL = ${scenes.reduce((s, x) => s + x.dur, 0)};
const secs = document.querySelectorAll('.sc');

// Подгоняем кегль под колонку: польские слова длинные, фиксированный размер
// либо вылезает за край, либо оставляет пустоту.
function fit(el, max, min, limit) {
  const box = el.parentElement;
  let size = max;
  el.style.fontSize = size + 'px';
  while (size > min && (el.scrollWidth > box.clientWidth || el.scrollHeight > limit)) {
    size -= 4;
    el.style.fontSize = size + 'px';
  }
}
window.__fitAll = () => {
  secs.forEach((s) => {
    const h = s.querySelector('h1.big');
    if (!h) return;
    const cls = s.className;
    if (cls.includes('l-huge')) fit(h, 190, 56, 900);
    else if (cls.includes('l-split')) fit(h, 120, 52, 780);
    else if (cls.includes('l-card')) fit(h, 130, 48, 320);
    else fit(h, 156, 56, 620);
  });
};

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

window.setT = (t) => {
  document.getElementById('glowA').style.transform =
    'translate(' + Math.round(-320 + Math.sin(t * 0.32) * 70) + 'px,' +
    Math.round(-380 + Math.cos(t * 0.24) * 90) + 'px)';
  document.getElementById('glowB').style.transform =
    'translate(' + Math.round(420 + Math.cos(t * 0.28) * 80) + 'px,' +
    Math.round(1080 + Math.sin(t * 0.21) * 70) + 'px)';
  document.getElementById('grid').style.transform =
    'translateY(' + (Math.round(t * 8) % 110) + 'px)';
  document.getElementById('prog').style.width = (100 * clamp01(t / TOTAL)) + '%';

  let cur = 0;
  for (let i = 0; i < SCENES.length; i++) if (t >= SCENES[i].start) cur = i;

  secs.forEach((el, i) => {
    if (i !== cur) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = 'visible';
    const s = SCENES[i];
    const local = t - s.start;
    const hook = s.kind === 'hook';

    // картинка живёт: медленный наезд плюс сдвиг, чтобы кадр не стоял
    const media = el.querySelector('.media');
    if (media) {
      const p = clamp01(local / s.dur);
      const enter = easeOut(clamp01(local / 0.5));
      media.style.transform = 'scale(' + (1.05 + 0.06 * p).toFixed(4) + ')';
      media.style.opacity = enter;
    }

    // слова вылетают по одному; на хуке быстрее — первую секунду нельзя тянуть
    const ws = el.querySelectorAll('h1.big .w');
    const step = BEAT / (hook ? 3.4 : 2.2);
    ws.forEach((w, k) => {
      const p = easeOut(clamp01((local - 0.04 - k * step) / (hook ? 0.26 : 0.34)));
      w.style.opacity = p;
      w.style.transform = 'translateY(' + (62 * (1 - p)) + 'px) scale(' + (0.96 + 0.04 * p) + ')';
    });

    const after = 0.04 + ws.length * step;
    const chip = el.querySelector('.chip');
    if (chip) {
      const p = easeOut(clamp01(local / 0.26));
      chip.style.opacity = p;
      chip.style.transform = 'translateX(' + (-40 * (1 - p)) + 'px)';
    }
    const rule = el.querySelector('.rule');
    if (rule) rule.style.width = 46 * easeOut(clamp01((local - after) / 0.42)) + '%';
    const sub = el.querySelector('.sub');
    if (sub) {
      const p = easeOut(clamp01((local - after - 0.1) / 0.4));
      sub.style.opacity = p;
      sub.style.transform = 'translateY(' + (26 * (1 - p)) + 'px)';
    }
    const num = el.querySelector('.num');
    if (num) {
      const p = easeOut(clamp01(local / 0.3));
      num.style.opacity = p;
      num.style.transform = 'scale(' + (0.7 + 0.3 * p) + ')';
    }
    const ghost = el.querySelector('.ghost');
    if (ghost) {
      const p = easeOut(clamp01(local / 0.9));
      ghost.style.opacity = p;
      ghost.style.transform = 'translateX(' + (70 * (1 - p)) + 'px)';
    }
    const face = el.querySelector('.face');
    if (face) {
      const p = easeOut(clamp01(local / 0.42));
      face.style.opacity = p;
      face.style.transform = 'translateY(' + (40 * (1 - p)) + 'px) scale(' + (0.94 + 0.06 * p) + ')';
    }
    const mark = el.querySelector('.mark');
    if (mark) {
      const p = easeOut(clamp01((local - after - 0.2) / 0.38));
      mark.style.opacity = p;
      mark.style.transform = 'translateY(' + (30 * (1 - p)) + 'px)';
    }
  });

  // На финальной сцене логотип уже стоит крупно — подвал прячем.
  document.getElementById('foot').style.opacity = SCENES[cur].kind === 'cta' ? 0 : 1;

  // вспышка на стыке сцен — «склейка», без неё смена читается как подвисание
  const since = t - SCENES[cur].start;
  document.getElementById('flash').style.opacity =
    cur === 0 ? 0 : String(0.2 * Math.max(0, 1 - since / 0.13));
};
</script></body></html>`;
}

// ── звук склеек ───────────────────────────────────────────────────
// Синтезируем удар сами: низкий «тумк» плюс короткий шумовой всплеск.
// Так не нужен ни чужой файл, ни его лицензия.
function hitFilters(starts, total) {
  // источник удара один, размножаем его задержками и складываем с музыкой
  const parts = starts.map(
    (s, i) => `[hit]adelay=${Math.round(s * 1000)}|${Math.round(s * 1000)},volume=0.9[h${i}]`
  );
  const mix = starts.map((_, i) => `[h${i}]`).join('') + `amix=inputs=${starts.length}:normalize=0[hits]`;
  return { parts, mix, total };
}

// ── сборка ────────────────────────────────────────────────────────
// data — те же поля, что у карусели: eyebrow, title, subtitle, items[], cta, footer
export async function makeReel({ data, name, photo = 'mat' }) {
  if (!data || !data.title) throw new Error('nie ma z czego zrobić rolki');

  await mkdir(OUT_DIR, { recursive: true });
  const base = String(name || `reel-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
  const framesDir = path.join(OUT_DIR, `${base}-frames`);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const music = await pickMusic();
  const tempo = music ? await detectTempo(music) : null;
  const beat = tempo ? tempo.beat : 0.55;

  const { scenes, total } = buildScenes(data, beat);

  // Картинки: своя под каждую сцену. Просим по смыслу пункта, а не «что-нибудь».
  const prompts = scenes.map((s) => {
    if (s.kind === 'hook') return data.bgIdea || `floating violet glass shapes about ${data.title}`;
    if (s.kind === 'item') {
      const it = (data.items || [])[s.index - 1] || {};
      return it.bgIdea || `floating violet glass objects about ${it.heading || ''}`;
    }
    return 'floating violet glass studio lights and camera lens';
  });
  let images = [];
  try {
    const { generateVerticals, GEN_DIR } = await import('./image-gen.mjs');
    // ZOVU_REUSE_BG=1 — брать уже сгенерированные кадры. Нужно, когда правим
    // вёрстку: иначе каждая правка это пять минут ожидания картинок.
    if (process.env.ZOVU_REUSE_BG === '1') {
      const have = await readdir(GEN_DIR).catch(() => []);
      images = prompts.map((_, i) => {
        const f = have.find((x) => x === `${base}-v${i + 1}.jpg`);
        return f ? path.join(GEN_DIR, f) : null;
      });
      if (images.every((x) => !x)) images = await generateVerticals(prompts, base);
    } else {
      images = await generateVerticals(prompts, base);
    }
  } catch {
    images = [];
  }
  for (const [i, s] of scenes.entries()) s.image = await fileUri(images[i], { width: 1080, height: 1920 });

  const who = PEOPLE[String(photo).toLowerCase()];
  const person = who
    ? { ...who, uri: await fileUri(who.file, { width: 460, height: 460 }) }
    : null;

  const html = pageHtml(scenes, beat, await logoUri(), data.footer, person && person.uri ? person : null);
  const htmlPath = path.join(OUT_DIR, `${base}.html`);
  await writeFile(htmlPath, html, 'utf8');

  const frames = Math.round(total * FPS);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.__fitAll());
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.setT(t), i / FPS);
      await page.screenshot({
        path: path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 94,
      });
    }
  } finally {
    await browser.close();
  }

  const silent = path.join(OUT_DIR, `${base}-mute.mp4`);
  await ffmpeg([
    '-framerate', String(FPS),
    '-i', path.join(framesDir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-preset', 'veryfast', '-crf', '19', '-r', String(FPS),
    silent,
  ]);

  const final = path.join(OUT_DIR, `${base}.mp4`);
  const cuts = scenes.slice(1).map((s) => s.start);
  const { parts, mix } = hitFilters(cuts, total);

  if (music) {
    // loudnorm приводит любую дорожку к -14 LUFS — уровню, под который
    // Instagram и так пересчитывает звук. Иначе один трек орёт, другой шепчет.
    const fadeOut = Math.max(0, total - 2).toFixed(2);
    const filter = [
      `[1:a]atrim=0:${total.toFixed(2)},asetpts=N/SR/TB,loudnorm=I=-14:TP=-1.5:LRA=11,` +
        `afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=2[mus]`,
      `[2:a]asplit=${cuts.length}` + cuts.map((_, i) => `[hs${i}]`).join(''),
      ...cuts.map(
        (s, i) => `[hs${i}]adelay=${Math.round(s * 1000)}|${Math.round(s * 1000)},volume=0.85[h${i}]`
      ),
      cuts.map((_, i) => `[h${i}]`).join('') + `amix=inputs=${cuts.length}:normalize=0[hits]`,
      `[mus][hits]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`,
    ].join(';');

    await ffmpeg([
      '-i', silent,
      '-i', music,
      '-f', 'lavfi',
      '-i',
      `aevalsrc='0.55*exp(-t*20)*sin(2*PI*68*t)+0.22*(random(0)*2-1)*exp(-t*46)':d=0.6:s=44100:c=stereo`,
      '-filter_complex', filter,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      final,
    ]);
  } else {
    await ffmpeg([
      '-i', silent,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest',
      final,
    ]);
  }

  await rm(framesDir, { recursive: true, force: true });
  await rm(silent, { force: true });
  const bytes = (await readFile(final)).length;
  return {
    file: final,
    name: `${base}.mp4`,
    bytes,
    seconds: total,
    bpm: tempo ? Math.round(tempo.bpm) : null,
    images: images.filter(Boolean).length,
    withMusic: Boolean(music),
  };
}

// ── CLI ───────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('make-reel.mjs')) {
  const demo = {
    eyebrow: 'ZOVU · WIDEO DLA FIRMY',
    title: 'Płacisz za studio zamiast nagrać telefonem',
    subtitle: 'Sprawdź prostą zamianę, która oszczędzi Twój budżet.',
    bgIdea: 'floating violet glass smartphone on a tripod and studio light',
    items: [
      { heading: 'Nagrywaj przy oknie', text: 'Światło dzienne robi za cały sprzęt oświetleniowy.', bgIdea: 'floating violet glass window frame and sunbeam' },
      { heading: 'Mów do jednej osoby', text: 'Wtedy widz czuje, że mówisz do niego.', bgIdea: 'floating chrome speech bubble and violet glass microphone' },
      { heading: 'Pierwsze trzy sekundy', text: 'Tu decyduje się, czy ktoś zostanie.', bgIdea: 'floating violet glass stopwatch and neon countdown rings' },
      { heading: 'Jeden temat na film', text: 'Dwa tematy w jednym nagraniu gubią oba.', bgIdea: 'floating violet glass film clapperboard' },
      { heading: 'Napisy zawsze', text: 'Większość ogląda bez dźwięku.', bgIdea: 'floating chrome speech lines and violet glass phone' },
    ],
    cta: { headline: 'Nagramy wideo dla Ciebie', line: 'Robimy rolki, które przyciągają klientów.' },
    footer: 'zovu.pl',
  };
  const t0 = Date.now();
  const r = await makeReel({ data: demo, name: 'demo-reel' });
  console.log(
    JSON.stringify(
      {
        file: r.file,
        mb: (r.bytes / 1048576).toFixed(1),
        sek: r.seconds.toFixed(1),
        bpm: r.bpm,
        obrazki: r.images,
        muzyka: r.withMusic,
        czas: Math.round((Date.now() - t0) / 1000) + 's',
      },
      null,
      1
    )
  );
}
