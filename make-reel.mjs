// Вертикальный рилс 1080x1920 на ЖИВОМ футаже.
//
// Устройство. Кадр собирается из двух слоёв:
//   1. видеоподложка — реальные съёмки из папки broll/, склеенные по сценам
//   2. текстовый слой — html-страница, снятая покадрово с прозрачным фоном
// Дальше ffmpeg накладывает второе на первое. Разделение важное: видео умеет
// ffmpeg, а типографику и анимацию — браузер, и каждый делает своё.
//
// Анимация — чистая функция времени `setT(t)`: прогоняем время по кадрам и
// снимаем скриншот каждого. Точнее и повторяемее, чем запись видео браузером.
//
//   node make-reel.mjs           — собрать пример из тестовых данных
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const OUT_DIR = path.join(import.meta.dirname, 'out');
const MUSIC_DIR = path.join(import.meta.dirname, 'music');
const BROLL_DIR = path.join(import.meta.dirname, 'broll');
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

async function faceUri(file) {
  try {
    const buf = await sharp(file)
      .resize(460, 460, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 88 })
      .toBuffer();
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
// бочкой это работает надёжно; не нашли — смонтируем по фиксированным секундам.
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

// ── живой футаж ───────────────────────────────────────────────────
async function brollLibrary() {
  try {
    const files = (await readdir(BROLL_DIR)).filter((f) => f.endsWith('.mp4'));
    return new Map(files.map((f) => [f.replace(/\.mp4$/, ''), path.join(BROLL_DIR, f)]));
  } catch {
    return new Map();
  }
}

// ── сцены ─────────────────────────────────────────────────────────
// Раскладка меняется от сцены к сцене, способ появления текста тоже,
// ритм рваный. Одинаковая сетка шесть раз подряд читается как слайдшоу.
const LAYOUTS = ['bottom', 'top', 'center'];
const ANIMS = ['stack', 'wipe', 'pop'];
const PACE = [2.6, 2.2, 2.6];
// В карусель идут пять пунктов, в рилс — три. Пять штук за десять секунд
// физически не прочитать: выходит не пост, а бегущая строка.
const REEL_ITEMS = 3;

function buildScenes(data, beat) {
  const beatsFor = (seconds) => Math.max(2, Math.round(seconds / beat));
  const items = (data.items || []).slice(0, REEL_ITEMS);

  // Холодное открытие: два-три слова во весь экран и жёсткий переход.
  // Смотреть дальше или нет зритель решает за первые полсекунды — за это время
  // обычная заставка успевает только проявиться.
  const cold = (data.hook || '').trim() || data.title.split(/\s+/).slice(0, 3).join(' ').toUpperCase();

  const scenes = [
    { kind: 'cold', layout: 'cold', anim: 'slam', title: cold, broll: data.broll, beats: beatsFor(1.1) },
    {
      kind: 'hook',
      layout: 'bottom',
      anim: 'slam',
      eyebrow: data.eyebrow,
      title: data.title,
      broll: data.broll,
      beats: beatsFor(3.0),
    },
    ...items.map((it, i) => ({
      kind: 'item',
      layout: LAYOUTS[i % LAYOUTS.length],
      anim: ANIMS[i % ANIMS.length],
      inv: i === 2, // последний пункт выбивается из ряда — глазу нужен толчок
      index: i + 1,
      total: items.length,
      heading: it.heading,
      broll: it.broll,
      beats: beatsFor(PACE[i % PACE.length]),
    })),
    {
      kind: 'cta',
      layout: 'face',
      anim: 'stack',
      headline: (data.cta && data.cta.headline) || 'Zrobimy to za Ciebie',
      line: (data.cta && data.cta.line) || 'zovu.pl',
      broll: 'marka2',
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

// ── текстовый слой ────────────────────────────────────────────────
function pageHtml(scenes, beat, logo, site, person) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Последнее слово заголовка красим в акцент: глазу нужна точка, за которую
  // зацепиться, иначе сцены читаются как одна стена букв.
  const words = (s) => {
    const list = esc(s).split(/\s+/).filter(Boolean);
    return list
      .map(
        (w, i) =>
          `<span class="w${i === list.length - 1 && list.length > 1 ? ' key' : ''}">${w}</span>`
      )
      .join(' ');
  };

  const sections = scenes
    .map((s, i) => {
      // На экране только то, что читается за секунду. Пояснения к пунктам
      // ушли в подпись под постом: на видео их всё равно не успевают прочесть.
      const head = `<div class="body">
        <h1 class="big">${words(s.kind === 'item' ? s.heading : s.kind === 'cta' ? s.headline : s.title)}</h1>
        ${s.kind === 'cold' ? '' : '<div class="rule"></div>'}
        ${s.kind === 'cta' ? `<p class="sub">${esc(s.line)}</p>` : ''}
      </div>`;

      const chip = s.kind === 'hook' ? `<div class="chip"><i></i>${esc(s.eyebrow || 'ZOVU')}</div>` : '';
      const num =
        s.kind === 'item' ? `<div class="num">${String(s.index).padStart(2, '0')}</div>` : '';
      const count =
        s.kind === 'item' ? `<div class="count">${s.index}<span>/${s.total}</span></div>` : '';
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

      return `<section class="sc l-${s.layout}${s.inv ? ' inv' : ''}" data-anim="${s.anim}" data-i="${i}">
        <div class="scrim"></div>
        ${chip}${num}${count}${face}${head}${mark}
      </section>`;
    })
    .join('\n');

  const meta = JSON.stringify(
    scenes.map((s) => ({ start: s.start, dur: s.dur, kind: s.kind, layout: s.layout, anim: s.anim }))
  );

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
/* фон прозрачный: под этим слоем идёт живое видео */
body { background:transparent; color:#fff; overflow:hidden; position:relative;
  font-family:'JetBrains Mono', monospace; }

#stage { position:absolute; inset:0; }
.sc { position:absolute; inset:0; visibility:hidden; }
/* Затемнение поверх съёмки. Без него белый текст на светлом кадре пропадает,
   а с ним видео всё ещё видно — в этом вся разница с плашкой. */
.scrim { position:absolute; inset:0; }
.body { position:absolute; left:88px; right:88px; display:flex; flex-direction:column; }

.l-cold .scrim { background:radial-gradient(ellipse 72% 46% at 50% 50%, rgba(6,4,14,.42) 0%, rgba(6,4,14,.86) 100%); }
.l-cold .body { top:0; bottom:0; justify-content:center; align-items:center; text-align:center; }
.l-cold h1.big { letter-spacing:-3px; }

/* текст внизу кадра, съёмка дышит сверху */
.l-bottom .scrim { background:linear-gradient(180deg, rgba(6,4,14,.34) 0%, rgba(6,4,14,0) 24%, rgba(6,4,14,.42) 56%, rgba(6,4,14,.88) 100%); }
.l-bottom .body { left:88px; right:88px; bottom:380px; }

/* текст вверху кадра: съёмка работает в нижних двух третях */
.l-top .scrim { background:linear-gradient(180deg, rgba(6,4,14,.88) 0%, rgba(6,4,14,.55) 34%, rgba(6,4,14,.08) 58%, rgba(6,4,14,.55) 100%); }
/* ниже номера и счётчика: они живут на 250px, иначе заголовок налезает на них */
.l-top .body { left:88px; right:88px; top:400px; }

/* крупно по центру, съёмка работает фоном целиком */
.l-center .scrim { background:linear-gradient(180deg, rgba(6,4,14,.44) 0%, rgba(6,4,14,.30) 45%, rgba(6,4,14,.62) 100%); }
.l-center .body { top:0; bottom:0; justify-content:center; }

/* финал: лицо и предложение */
.l-face .scrim { background:linear-gradient(180deg, rgba(6,4,14,.42) 0%, rgba(6,4,14,.18) 18%, rgba(6,4,14,.72) 58%, rgba(6,4,14,.95) 100%); }
.l-face .body { left:88px; right:88px; bottom:420px; }
.face { position:absolute; left:88px; top:340px; display:flex; align-items:center; gap:28px; }
.face img { width:220px; height:220px; border-radius:42px; object-fit:cover;
  border:2px solid rgba(167,139,250,.6);
  box-shadow:0 30px 90px rgba(0,0,0,.7), 0 0 70px 12px rgba(124,58,237,.4); }
.face .who { display:flex; flex-direction:column; gap:10px; }
.face .nm { font-family:'Oswald', sans-serif; font-weight:700; font-size:54px; letter-spacing:.06em;
  text-transform:uppercase; }
.face .rl { font-size:23px; color:#c4b5fd; letter-spacing:.14em; text-transform:uppercase; }

/* сцена-перебивка: фиолетовая заливка поверх съёмки */
/* Шесть тёмных кадров подряд глаз перестаёт различать. Один цветной в
   середине работает как удар и делит ролик пополам. */
.sc.inv .scrim { background:linear-gradient(165deg, rgba(124,58,237,.62) 0%, rgba(76,29,149,.68) 55%, rgba(45,14,96,.76) 100%); }
.sc.inv h1.big .w { background-image:linear-gradient(180deg,#ffffff 0%,#ffffff 100%); }
.sc.inv h1.big .w.key { background-image:linear-gradient(180deg,#0b0418 0%,#140829 100%); }
.sc.inv .rule { background:linear-gradient(90deg,#ffffff,rgba(255,255,255,0)); }
.sc.inv .num { background:#0f0722; color:#e9dcff; }

.chip { position:absolute; left:88px; top:250px; display:inline-flex; align-items:center; gap:14px;
  border:1px solid rgba(167,139,250,.5); border-radius:999px; padding:14px 30px;
  font-size:24px; letter-spacing:.22em; text-transform:uppercase; color:#c4b5fd;
  background:rgba(124,58,237,.24); }
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
  filter:drop-shadow(0 4px 12px rgba(0,0,0,.95)) drop-shadow(0 8px 44px rgba(0,0,0,.8)); }
h1.big .w.key { background-image:linear-gradient(180deg,#c9a6ff 0%,#a78bfa 100%); }
.rule { height:5px; width:0; margin:34px 0 28px; border-radius:4px;
  background:linear-gradient(90deg,#a78bfa,rgba(167,139,250,0)); }
.sub { font-size:40px; line-height:1.42; color:#efeafd; max-width:92%;
  text-shadow:0 4px 24px rgba(0,0,0,.85); }

.num { position:absolute; left:88px; top:250px; font-family:'Oswald', sans-serif;
  font-weight:700; font-size:60px; letter-spacing:.08em; color:#0b0b0f;
  background:#a78bfa; border-radius:20px; padding:8px 26px;
  box-shadow:0 0 50px rgba(124,58,237,.75); }
/* счётчик пунктов — видно, сколько осталось, и это удерживает до конца */
.count { position:absolute; right:88px; top:258px; font-family:'Oswald', sans-serif;
  font-weight:700; font-size:52px; letter-spacing:.04em; color:#fff;
  text-shadow:0 4px 22px rgba(0,0,0,.9); }
.count span { font-size:30px; color:rgba(255,255,255,.62); }
.mark { position:absolute; left:88px; bottom:290px; display:flex; align-items:center; gap:22px; }
.mark img { width:88px; height:88px; object-fit:contain;
  filter:drop-shadow(0 0 26px rgba(167,139,250,.7)); }
.mark span { font-family:'Oswald', sans-serif; font-weight:700; font-size:62px; letter-spacing:.2em; }

/* подвал держим выше зоны, где Instagram рисует подпись и кнопки */
#foot { position:absolute; left:88px; right:88px; bottom:250px; z-index:3;
  padding-top:34px; border-top:1px solid rgba(255,255,255,.18);
  display:flex; align-items:center; justify-content:space-between; }
#foot .brand { display:flex; align-items:center; gap:18px; }
#foot img { width:56px; height:56px; object-fit:contain;
  filter:drop-shadow(0 0 18px rgba(167,139,250,.55)); }
#foot .wm { font-family:'Oswald', sans-serif; font-weight:700; font-size:38px; letter-spacing:.18em;
  text-shadow:0 4px 20px rgba(0,0,0,.9); }
#foot .site { font-size:26px; color:#c4b5fd; letter-spacing:.06em;
  text-shadow:0 4px 20px rgba(0,0,0,.9); }
#prog { position:absolute; left:0; top:0; height:6px; z-index:5;
  background:linear-gradient(90deg,#a78bfa,#e9d5ff); box-shadow:0 0 20px rgba(167,139,250,.8); }
#fade { position:absolute; inset:0; z-index:6; background:#050308; opacity:0; }
</style></head><body>
<div id="stage">${sections}</div>
<div id="foot">
  <div class="brand">${logo ? `<img src="${logo}" alt="">` : ''}<span class="wm">ZOVU</span></div>
  <span class="site">${esc(site || 'zovu.pl')}</span>
</div>
<div id="prog"></div>
<div id="fade"></div>
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
    if (cls.includes('l-cold')) fit(h, 240, 80, 1000);
    else if (cls.includes('l-center')) fit(h, 180, 56, 900);
    else if (cls.includes('l-top')) fit(h, 148, 56, 540);
    else fit(h, 152, 56, 560);
  });
};

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

window.setT = (t) => {
  document.getElementById('prog').style.width = (100 * clamp01(t / TOTAL)) + '%';

  // Чистая петля: Instagram крутит рилс по кругу. Хвост уводим в чёрное —
  // ровно то, с чего начинается холодное открытие, и стык не бросается в глаза.
  const tail = clamp01((t - (TOTAL - 0.34)) / 0.34);
  document.getElementById('fade').style.opacity = tail;

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
    const fast = s.kind === 'cold' || s.kind === 'hook';

    // затемнение въезжает быстро — иначе первые кадры сцены нечитаемы
    const scrim = el.querySelector('.scrim');
    if (scrim) scrim.style.opacity = easeOut(clamp01(local / 0.22));

    // Толчок на склейке: содержимое входит чуть крупнее и осаживается.
    // Срабатывает шесть раз за ролик, ровно в момент монтажной склейки, —
    // это не тот пульс в каждую долю, который читался как дрожание.
    const body = el.querySelector('.body');
    if (body) {
      const punch = 1 + 0.045 * (1 - easeOut(clamp01(local / 0.22)));
      body.style.transform = 'scale(' + punch.toFixed(4) + ')';
    }

    // Способ появления текста меняется от сцены к сцене. Одинаковый вылет
    // шесть раз подряд и есть та самая однотипность.
    const ws = el.querySelectorAll('h1.big .w');
    const anim = s.anim || 'stack';
    const step = anim === 'slam' ? BEAT / 5 : BEAT / (fast ? 3.4 : 2.2);
    ws.forEach((w, k) => {
      const delay = 0.04 + k * step;
      if (anim === 'wipe') {
        const p = easeOut(clamp01((local - delay) / 0.34));
        w.style.opacity = 1;
        w.style.clipPath = 'inset(-10% ' + (100 - 100 * p).toFixed(1) + '% -10% 0)';
        w.style.transform = 'none';
      } else if (anim === 'pop') {
        const raw = clamp01((local - delay) / 0.3);
        const p = easeOut(raw);
        const over = 1 + 0.16 * Math.sin(Math.PI * raw);
        w.style.opacity = p;
        w.style.clipPath = 'none';
        // скобки обязательны: без них строка склеивается раньше умножения
        w.style.transform = 'scale(' + ((0.55 + 0.45 * p) * over).toFixed(3) + ')';
      } else if (anim === 'slam') {
        const p = easeOut(clamp01((local - delay) / 0.2));
        w.style.opacity = p;
        w.style.clipPath = 'none';
        w.style.transform = 'translateY(' + (28 * (1 - p)) + 'px) scale(' + (1.1 - 0.1 * p) + ')';
      } else {
        const p = easeOut(clamp01((local - delay) / (fast ? 0.26 : 0.34)));
        w.style.opacity = p;
        w.style.clipPath = 'none';
        w.style.transform = 'translateY(' + (62 * (1 - p)) + 'px) scale(' + (0.96 + 0.04 * p) + ')';
      }
    });

    const after = 0.04 + ws.length * step;
    const count = el.querySelector('.count');
    if (count) {
      const p = easeOut(clamp01(local / 0.34));
      count.style.opacity = p;
      count.style.transform = 'translateY(' + Math.round(-30 * (1 - p)) + 'px)';
    }
    const chip = el.querySelector('.chip');
    if (chip) {
      const p = easeOut(clamp01(local / 0.26));
      chip.style.opacity = p;
      chip.style.transform = 'translateX(' + Math.round(-40 * (1 - p)) + 'px)';
    }
    const rule = el.querySelector('.rule');
    if (rule) rule.style.width = 46 * easeOut(clamp01((local - after) / 0.42)) + '%';
    const sub = el.querySelector('.sub');
    if (sub) {
      const p = easeOut(clamp01((local - after - 0.1) / 0.4));
      sub.style.opacity = p;
      sub.style.transform = 'translateY(' + Math.round(24 * (1 - p)) + 'px)';
    }
    const num = el.querySelector('.num');
    if (num) {
      const p = easeOut(clamp01(local / 0.3));
      num.style.opacity = p;
      num.style.transform = 'scale(' + (0.7 + 0.3 * p) + ')';
    }
    const face = el.querySelector('.face');
    if (face) {
      const p = easeOut(clamp01(local / 0.42));
      face.style.opacity = p;
      face.style.transform = 'translateY(' + Math.round(40 * (1 - p)) + 'px)';
    }
    const mark = el.querySelector('.mark');
    if (mark) {
      const p = easeOut(clamp01((local - after - 0.2) / 0.38));
      mark.style.opacity = p;
      mark.style.transform = 'translateY(' + Math.round(30 * (1 - p)) + 'px)';
    }
  });

  // на финальной сцене логотип уже стоит крупно — подвал прячем
  document.getElementById('foot').style.opacity = SCENES[cur].kind === 'cta' ? 0 : 1;
};
</script></body></html>`;
}

// ── видеоподложка ─────────────────────────────────────────────────
// Каждой сцене — свой клип. Тег приходит от модели, чего нет в библиотеке,
// добираем по кругу, чтобы соседние сцены не оказались одинаковыми.
async function buildBed(scenes, base) {
  const lib = await brollLibrary();
  if (!lib.size) return null;
  const all = [...lib.keys()];
  const parts = [];
  let spare = 0;
  const used = new Set();

  for (const [i, s] of scenes.entries()) {
    let tag = s.broll && lib.has(s.broll) ? s.broll : null;
    while (!tag || used.has(tag)) {
      tag = all[spare++ % all.length];
      if (spare > all.length * 2) break;
    }
    used.add(tag);
    const clip = path.join(OUT_DIR, `${base}-bed${i}.mp4`);
    await ffmpeg([
      '-stream_loop', '-1', // клип короче сцены — крутим по кругу
      '-i', lib.get(tag),
      '-t', s.dur.toFixed(3),
      // Лёгкая общая коррекция: съёмки из разных источников надо свести к
      // одному характеру. Но именно лёгкая — сильная превращает живой кадр
      // в тёмное пятно, и тогда незачем было брать живой.
      '-vf',
      `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
        `eq=brightness=-0.03:saturation=0.96:contrast=1.04,` +
        `colorbalance=bs=0.05:bm=0.04,fps=${FPS},setsar=1`,
      '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
      clip,
    ]);
    parts.push(clip);
    s.brollUsed = tag;
  }

  const list = path.join(OUT_DIR, `${base}-bed.txt`);
  await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const bed = path.join(OUT_DIR, `${base}-bed.mp4`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', bed]);
  for (const p of [...parts, list]) await rm(p, { force: true });
  return bed;
}

// ── сборка ────────────────────────────────────────────────────────
export async function makeReel({ data, name, photo = 'mat' }) {
  if (!data || !data.title) throw new Error('nie ma z czego zrobić rolki');

  await mkdir(OUT_DIR, { recursive: true });
  const base = String(name || `reel-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
  const framesDir = path.join(OUT_DIR, `${base}-frames`);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const music = await pickMusic();
  const tempo = music ? await detectTempo(music) : null;
  const beat = tempo ? tempo.beat : 0.5;

  const { scenes, total } = buildScenes(data, beat);
  const bed = await buildBed(scenes, base);

  const who = PEOPLE[String(photo).toLowerCase()];
  const person = who ? { ...who, uri: await faceUri(who.file) } : null;

  const html = pageHtml(scenes, beat, await logoUri(), data.footer, person && person.uri ? person : null);
  const htmlPath = path.join(OUT_DIR, `${base}.html`);
  await writeFile(htmlPath, html, 'utf8');

  // Текстовый слой снимаем с прозрачным фоном (omitBackground) — иначе он
  // закрыл бы видео сплошной заливкой.
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
        path: path.join(framesDir, `f${String(i).padStart(5, '0')}.png`),
        type: 'png',
        omitBackground: true,
      });
    }
  } finally {
    await browser.close();
  }

  const silent = path.join(OUT_DIR, `${base}-mute.mp4`);
  if (bed) {
    await ffmpeg([
      '-i', bed,
      '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png'),
      '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
      '-map', '[v]',
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20',
      '-r', String(FPS), '-shortest',
      silent,
    ]);
  } else {
    // библиотеки футажа нет — собираем хотя бы текст на чёрном
    await ffmpeg([
      '-f', 'lavfi', '-i', `color=c=#050308:s=${W}x${H}:r=${FPS}:d=${total.toFixed(2)}`,
      '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png'),
      '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
      '-map', '[v]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
      '-r', String(FPS), '-shortest',
      silent,
    ]);
  }

  const final = path.join(OUT_DIR, `${base}.mp4`);
  const cuts = scenes.slice(1).map((s) => s.start);

  if (music) {
    // loudnorm приводит любую дорожку к -14 LUFS — уровню, под который
    // Instagram и так пересчитывает звук. Иначе один трек орёт, другой шепчет.
    const fadeOut = Math.max(0, total - 2).toFixed(2);
    const chain = [
      `[1:a]atrim=0:${total.toFixed(2)},asetpts=N/SR/TB,loudnorm=I=-14:TP=-1.5:LRA=11,` +
        `afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOut}:d=2[mus]`,
      `[2:a]asplit=${cuts.length}` + cuts.map((_, i) => `[hs${i}]`).join(''),
      ...cuts.map(
        (s, i) => `[hs${i}]adelay=${Math.round(s * 1000)}|${Math.round(s * 1000)},volume=0.8[h${i}]`
      ),
      cuts.map((_, i) => `[h${i}]`).join('') + `amix=inputs=${cuts.length}:normalize=0[hits]`,
      `[mus][hits]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`,
    ].join(';');

    await ffmpeg([
      '-i', silent,
      '-i', music,
      // Удар на склейке синтезируем прямо здесь: низкий «тумк» плюс короткий
      // шумовой всплеск. Ни чужого файла, ни лицензии.
      '-f', 'lavfi',
      '-i',
      `aevalsrc='0.55*exp(-t*20)*sin(2*PI*68*t)+0.22*(random(0)*2-1)*exp(-t*46)':d=0.6:s=44100:c=stereo`,
      '-filter_complex', chain,
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
  if (bed) await rm(bed, { force: true });
  const bytes = (await readFile(final)).length;
  return {
    file: final,
    name: `${base}.mp4`,
    bytes,
    seconds: total,
    bpm: tempo ? Math.round(tempo.bpm) : null,
    clips: scenes.map((s) => s.brollUsed).filter(Boolean),
    withMusic: Boolean(music),
  };
}

// ── CLI ───────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('make-reel.mjs')) {
  const demo = {
    eyebrow: 'ZOVU · WIDEO DLA FIRMY',
    title: 'Płacisz za studio zamiast nagrać telefonem',
    hook: 'PRZEPALASZ BUDŻET',
    broll: 'fotostudio',
    items: [
      { heading: 'Nagrywaj przy oknie', broll: 'kawa' },
      { heading: 'Mów do jednej osoby', broll: 'barber' },
      { heading: 'Pierwsze trzy sekundy', broll: 'czas' },
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
        klipy: r.clips,
        czas: Math.round((Date.now() - t0) / 1000) + 's',
      },
      null,
      1
    )
  );
}
