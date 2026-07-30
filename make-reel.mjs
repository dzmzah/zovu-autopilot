// Вертикальный рилс 1080x1920 — собственный макет, а не карусель в рамке.
//
// Как устроено. Открываем ОДНУ html-страницу, где вся анимация — чистая функция
// времени: `setT(t)` расставляет элементы для момента t. Дальше прогоняем время
// по кадрам и снимаем скриншот каждого. Так кадры получаются точные и
// повторяемые — в отличие от записи видео браузером, где таймінг «плывёт».
//
// Монтаж привязан к музыке: темп дорожки определяем сами (см. detectTempo),
// и длительности сцен считаем в долях, а не в секундах.
//
//   node make-reel.mjs --demo      — собрать пример из тестовых данных
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OUT_DIR = path.join(import.meta.dirname, 'out');
const MUSIC_DIR = path.join(import.meta.dirname, 'music');
const LOGO_FILE = path.join(import.meta.dirname, 'logo-white.b64');
const W = 1080;
const H = 1920;
const FPS = 30;

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

    // энергия в окне
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
    const lagMin = Math.floor((60 / 180) * rate); // 180 BPM
    const lagMax = Math.ceil((60 / 70) * rate); // 70 BPM
    let bestLag = 0;
    let best = -Infinity;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let sum = 0;
      for (let i = 0; i + lag < frames; i++) sum += onset[i] * onset[i + lag];
      // короткие лаги выигрывают за счёт числа слагаемых — нормируем
      const score = sum / (frames - lag);
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
    if (!bestLag) return null;
    let bpm = (60 * rate) / bestLag;
    // приводим к привычному диапазону: 75 BPM для монтажа то же самое, что 150
    while (bpm < 85) bpm *= 2;
    while (bpm > 170) bpm /= 2;
    return { bpm, beat: 60 / bpm };
  } catch {
    return null;
  }
}

// ── сцены ─────────────────────────────────────────────────────────
// Длительности считаем в долях такта, чтобы смена кадра попадала в бит.
function buildScenes(data, beat) {
  const beatsFor = (seconds) => Math.max(2, Math.round(seconds / beat));
  const items = (data.items || []).slice(0, 5);

  const scenes = [
    { kind: 'hook', eyebrow: data.eyebrow, title: data.title, sub: data.subtitle, beats: beatsFor(3.4) },
    ...items.map((it, i) => ({
      kind: 'item',
      index: i + 1,
      total: items.length,
      heading: it.heading,
      text: it.text,
      beats: beatsFor(2.3),
    })),
    {
      kind: 'cta',
      headline: (data.cta && data.cta.headline) || 'Zrobimy to za Ciebie',
      line: (data.cta && data.cta.line) || 'zovu.pl',
      beats: beatsFor(3.0),
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
function pageHtml(scenes, beat, logo, site) {
  const esc = (s) =>
    String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const words = (s) =>
    esc(s)
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `<span class="w">${w}</span>`)
      .join(' ');

  const sections = scenes
    .map((s, i) => {
      if (s.kind === 'hook') {
        return `<section class="sc" data-i="${i}">
          <div class="chip"><i></i>${esc(s.eyebrow || 'ZOVU')}</div>
          <h1 class="big">${words(s.title)}</h1>
          <div class="rule"></div>
          ${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}
        </section>`;
      }
      if (s.kind === 'item') {
        return `<section class="sc" data-i="${i}">
          <div class="num">${String(s.index).padStart(2, '0')}</div>
          <div class="ghost">${String(s.index).padStart(2, '0')}</div>
          <h1 class="big">${words(s.heading)}</h1>
          <div class="rule"></div>
          <p class="sub">${esc(s.text)}</p>
        </section>`;
      }
      return `<section class="sc cta" data-i="${i}">
        <h1 class="big">${words(s.headline)}</h1>
        <div class="rule"></div>
        <p class="sub">${esc(s.line)}</p>
        <div class="mark">${logo ? `<img src="${logo}" alt="">` : ''}<span>ZOVU</span></div>
      </section>`;
    })
    .join('\n');

  const meta = JSON.stringify(scenes.map((s) => ({ start: s.start, dur: s.dur, kind: s.kind })));

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:#050505; color:#fff; overflow:hidden; position:relative;
  font-family:'JetBrains Mono', monospace; }

/* ── фон: он же живой, поэтому все слои двигаются от времени ── */
#bg { position:absolute; inset:0; overflow:hidden; }
#glowA, #glowB { position:absolute; border-radius:50%; }
#glowA { width:1500px; height:1500px;
  background:radial-gradient(circle at center, rgba(124,58,237,.55), rgba(124,58,237,0) 62%); }
#glowB { width:1200px; height:1200px;
  background:radial-gradient(circle at center, rgba(167,139,250,.34), rgba(167,139,250,0) 60%); }
#grid { position:absolute; left:-200px; right:-200px; top:-400px; height:3000px; opacity:.20;
  background-image:
    linear-gradient(to right, rgba(167,139,250,.18) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(167,139,250,.18) 1px, transparent 1px);
  background-size:110px 110px;
  mask-image:radial-gradient(ellipse 70% 45% at 50% 42%, #000 15%, transparent 80%);
  -webkit-mask-image:radial-gradient(ellipse 70% 45% at 50% 42%, #000 15%, transparent 80%); }
#streak { position:absolute; width:2200px; height:420px; left:-560px;
  transform:rotate(-30deg); filter:blur(46px);
  background:linear-gradient(90deg, rgba(167,139,250,0) 0%, rgba(214,203,255,.20) 48%, rgba(167,139,250,0) 100%); }
#noise { position:absolute; inset:0; opacity:.06; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E"); }
#vignette { position:absolute; inset:0;
  background:radial-gradient(ellipse 85% 62% at 50% 46%, transparent 45%, rgba(0,0,0,.62) 100%); }

/* ── сцены ── */
#stage { position:absolute; inset:0; z-index:2; transform-origin:50% 46%; }
.sc { position:absolute; left:90px; right:90px; top:250px; bottom:340px;
  display:flex; flex-direction:column; justify-content:center; visibility:hidden; }
.chip { display:inline-flex; align-self:flex-start; align-items:center; gap:14px;
  border:1px solid rgba(167,139,250,.5); border-radius:999px; padding:14px 30px;
  font-size:24px; letter-spacing:.22em; text-transform:uppercase; color:#c4b5fd;
  background:rgba(124,58,237,.14); margin-bottom:46px; }
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
  -webkit-text-fill-color:transparent; color:transparent; }
.rule { height:5px; width:0; margin:44px 0 40px; border-radius:4px;
  background:linear-gradient(90deg,#a78bfa,rgba(167,139,250,0)); }
.sub { font-size:42px; line-height:1.42; color:#e6e1f7; max-width:88%; }
.num { position:absolute; top:-140px; left:0; font-family:'Oswald', sans-serif;
  font-weight:700; font-size:64px; letter-spacing:.08em; color:#0b0b0f;
  background:#a78bfa; border-radius:20px; padding:8px 26px;
  box-shadow:0 0 50px rgba(124,58,237,.75); }
.ghost { position:absolute; right:-40px; top:-210px; font-family:'Oswald', sans-serif;
  font-weight:700; font-size:560px; line-height:.8; color:rgba(167,139,250,.09); }
.cta .mark { display:flex; align-items:center; gap:22px; margin-top:70px; }
.cta .mark img { width:92px; height:92px; object-fit:contain;
  filter:drop-shadow(0 0 26px rgba(167,139,250,.7)); }
.cta .mark span { font-family:'Oswald', sans-serif; font-weight:700; font-size:64px;
  letter-spacing:.2em; }

/* подвал держим выше зоны, где Instagram рисует подпись и кнопки */
#foot { position:absolute; left:90px; right:90px; bottom:250px; z-index:3;
  padding-top:34px; border-top:1px solid rgba(255,255,255,.14);
  display:flex; align-items:center; justify-content:space-between; }
#foot .brand { display:flex; align-items:center; gap:18px; }
#foot img { width:56px; height:56px; object-fit:contain;
  filter:drop-shadow(0 0 18px rgba(167,139,250,.55)); }
#foot .wm { font-family:'Oswald', sans-serif; font-weight:700; font-size:38px; letter-spacing:.18em; }
#foot .site { font-size:26px; color:#a78bfa; letter-spacing:.06em; }
#flash { position:absolute; inset:0; z-index:4; background:#c4b5fd; opacity:0; }
</style></head><body>
<div id="bg">
  <div id="glowA"></div><div id="glowB"></div>
  <div id="grid"></div><div id="streak"></div>
  <div id="noise"></div><div id="vignette"></div>
</div>
<div id="stage">${sections}</div>
<div id="foot">
  <div class="brand">${logo ? `<img src="${logo}" alt="">` : ''}<span class="wm">ZOVU</span></div>
  <span class="site">${esc(site || 'zovu.pl')}</span>
</div>
<div id="flash"></div>
<script>
const SCENES = ${meta};
const BEAT = ${beat};
const secs = document.querySelectorAll('.sc');

// Подгоняем кегль под колонку: польские слова длинные, фиксированный размер
// либо вылезает за край, либо оставляет пустоту.
function fit(el, max, min) {
  const box = el.parentElement;
  const limit = box.clientHeight * 0.62;
  let size = max;
  el.style.fontSize = size + 'px';
  while (size > min && (el.scrollWidth > box.clientWidth || el.scrollHeight > limit)) {
    size -= 4;
    el.style.fontSize = size + 'px';
  }
  return size;
}
window.__fitAll = () => {
  secs.forEach((s) => {
    const h = s.querySelector('h1.big');
    if (h) fit(h, s.classList.contains('cta') ? 140 : 156, 62);
  });
};

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

window.setT = (t) => {
  // фон живёт непрерывно, поэтому считается от общего времени
  document.getElementById('glowA').style.transform =
    'translate(' + (-320 + Math.sin(t * 0.32) * 70) + 'px,' + (-380 + Math.cos(t * 0.24) * 90) + 'px)';
  document.getElementById('glowB').style.transform =
    'translate(' + (420 + Math.cos(t * 0.28) * 80) + 'px,' + (1080 + Math.sin(t * 0.21) * 70) + 'px)';
  document.getElementById('grid').style.transform =
    'translateY(' + ((t * 16) % 110) + 'px)';
  document.getElementById('streak').style.top = (-260 + ((t * 150) % 2400)) + 'px';

  // лёгкий пульс всей сцены в долю — то, что делает картинку «музыкальной»
  const ph = (t % BEAT) / BEAT;
  document.getElementById('stage').style.transform = 'scale(' + (1 + 0.006 * Math.pow(1 - ph, 4)) + ')';

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

    // слова вылетают по одному, шаг — половина доли
    const ws = el.querySelectorAll('h1.big .w');
    const step = BEAT / 2.2;
    ws.forEach((w, k) => {
      const p = easeOut(clamp01((local - 0.06 - k * step) / 0.36));
      w.style.opacity = p;
      w.style.transform = 'translateY(' + (58 * (1 - p)) + 'px)';
    });

    const after = 0.06 + ws.length * step;
    const chip = el.querySelector('.chip');
    if (chip) {
      const p = easeOut(clamp01(local / 0.3));
      chip.style.opacity = p;
      chip.style.transform = 'translateX(' + (-40 * (1 - p)) + 'px)';
    }
    const rule = el.querySelector('.rule');
    if (rule) rule.style.width = 46 * easeOut(clamp01((local - after) / 0.45)) + '%';
    const sub = el.querySelector('.sub');
    if (sub) {
      const p = easeOut(clamp01((local - after - 0.12) / 0.42));
      sub.style.opacity = p;
      sub.style.transform = 'translateY(' + (26 * (1 - p)) + 'px)';
    }
    const num = el.querySelector('.num');
    if (num) {
      const p = easeOut(clamp01(local / 0.32));
      num.style.opacity = p;
      num.style.transform = 'scale(' + (0.7 + 0.3 * p) + ')';
    }
    const ghost = el.querySelector('.ghost');
    if (ghost) {
      const p = easeOut(clamp01(local / 0.9));
      ghost.style.opacity = p;
      ghost.style.transform = 'translateX(' + (70 * (1 - p)) + 'px)';
    }
    const mark = el.querySelector('.mark');
    if (mark) {
      const p = easeOut(clamp01((local - after - 0.25) / 0.4));
      mark.style.opacity = p;
      mark.style.transform = 'translateY(' + (30 * (1 - p)) + 'px)';
    }
  });

  // На финальной сцене логотип уже стоит крупно — подвал прячем, иначе ZOVU
  // оказывается в кадре дважды.
  document.getElementById('foot').style.opacity = SCENES[cur].kind === 'cta' ? 0 : 1;

  // вспышка на стыке сцен — «склейка», без неё смена читается как подвисание
  const s = SCENES[cur];
  const since = t - s.start;
  document.getElementById('flash').style.opacity =
    cur === 0 ? 0 : String(0.16 * Math.max(0, 1 - since / 0.14));
};
</script></body></html>`;
}

// ── сборка ────────────────────────────────────────────────────────
// data — те же поля, что у карусели: eyebrow, title, subtitle, items[], cta, footer
export async function makeReel({ data, name, images }) {
  if (!data && images) throw new Error('rolka potrzebuje danych postu, nie gotowych slajdow');
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
  const html = pageHtml(scenes, beat, await logoUri(), data.footer);
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
  if (music) {
    // loudnorm приводит любую дорожку к -14 LUFS — уровню, под который
    // Instagram и так пересчитывает звук. Иначе один трек орёт, другой шепчет.
    const fadeOut = Math.max(0, total - 2).toFixed(2);
    await ffmpeg([
      '-i', silent, '-i', music,
      '-filter_complex',
      `[1:a]atrim=0:${total.toFixed(2)},asetpts=N/SR/TB,` +
        `loudnorm=I=-14:TP=-1.5:LRA=11,` +
        `afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=2[a]`,
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
    withMusic: Boolean(music),
  };
}

// ── CLI ───────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('make-reel.mjs')) {
  const demo = {
    eyebrow: 'ZOVU · WIDEO DLA FIRMY',
    title: 'Płacisz za studio zamiast nagrać telefonem',
    subtitle: 'Sprawdź prostą zamianę, która oszczędzi Twój budżet.',
    items: [
      { heading: 'Nagrywaj przy oknie', text: 'Światło dzienne robi za cały sprzęt oświetleniowy.' },
      { heading: 'Mów do jednej osoby', text: 'Wtedy widz czuje, że mówisz do niego.' },
      { heading: 'Pierwsze trzy sekundy', text: 'Tu decyduje się, czy ktoś zostanie.' },
      { heading: 'Jeden temat na film', text: 'Dwa tematy w jednym nagraniu gubią oba.' },
      { heading: 'Napisy zawsze', text: 'Większość ogląda bez dźwięku.' },
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
        muzyka: r.withMusic,
        czas: Math.round((Date.now() - t0) / 1000) + 's',
      },
      null,
      1
    )
  );
}
