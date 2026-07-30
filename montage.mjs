// Монтажный движок: рилс как последовательность КОРОТКИХ планов, а не
// слайд-шоу «один кадр на одну мысль».
//
// Разница, из-за которой всё и переделано. В слайд-шоу на мысль приходится
// один план в 2.5 секунды — глазу не за что цепляться. В нормальном монтаже
// на ту же мысль идёт 2-4 плана по 0.6-1.4 секунды, и между ними приёмы:
// наезд, сплит, врезка, зеркало. Плотность склеек и есть то, что читается
// как «хороший монтаж».
//
// Слои те же, что и раньше: видео режет ffmpeg, подписи рисует браузер
// прозрачным слоем, дальше overlay.
//
//   node montage.mjs        — собрать пример
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OUT_DIR = path.join(import.meta.dirname, 'out');
const MUSIC_DIR = path.join(import.meta.dirname, 'music');
const BROLL_DIR = path.join(import.meta.dirname, 'broll');
const LOGO_FILE = path.join(import.meta.dirname, 'logo-white.b64');
const W = 1080;
const H = 1920;
const FPS = 30;

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function pickMusic() {
  try {
    const files = (await readdir(MUSIC_DIR)).filter((f) => /\.(mp3|m4a|aac|wav)$/i.test(f));
    return files.length ? path.join(MUSIC_DIR, files[0]) : null;
  } catch {
    return null;
  }
}

export async function detectTempo(file) {
  const SR = 11025;
  const HOP = 256;
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-t', '60', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'],
      { maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' }
    );
    const pcm = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2));
    const n = Math.floor(pcm.length / HOP);
    if (n < 200) return null;
    const en = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < HOP; j++) s += Math.abs(pcm[i * HOP + j]);
      en[i] = s / HOP;
    }
    const on = new Float64Array(n);
    for (let i = 1; i < n; i++) on[i] = Math.max(0, en[i] - en[i - 1]);
    let mean = 0;
    for (const v of on) mean += v;
    mean /= n;
    for (let i = 0; i < n; i++) on[i] -= mean;
    const rate = SR / HOP;
    let bestLag = 0, best = -Infinity;
    for (let lag = Math.floor((60 / 180) * rate); lag <= Math.ceil((60 / 70) * rate); lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += on[i] * on[i + lag];
      const sc = s / (n - lag);
      if (sc > best) { best = sc; bestLag = lag; }
    }
    if (!bestLag) return null;
    let bpm = (60 * rate) / bestLag;
    while (bpm < 85) bpm *= 2;
    while (bpm > 170) bpm /= 2;
    return { bpm, beat: 60 / bpm };
  } catch {
    return null;
  }
}

// ── источники планов ──────────────────────────────────────────────
async function brollLibrary() {
  try {
    const files = (await readdir(BROLL_DIR)).filter((f) => f.endsWith('.mp4'));
    return new Map(files.map((f) => [f.replace(/\.mp4$/, ''), path.join(BROLL_DIR, f)]));
  } catch {
    return new Map();
  }
}

// Один план: берём кусок исходника и применяем приём.
// Приёмы намеренно простые — их ценность в чередовании, а не в сложности.
const DEVICES = ['full', 'punch', 'split', 'mirror', 'slow'];

function deviceFilter(device, seconds) {
  const base = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`;
  switch (device) {
    case 'punch':
      // наезд: тот же план, но крупнее — классическая склейка «сам в себя»
      return `${base},crop=760:1352,scale=1080:1920`;
    case 'mirror':
      return `${base},hflip`;
    case 'slow':
      // замедление: короткий кусок растягиваем, движение становится вязким
      return `${base},setpts=1.45*PTS`;
    default:
      return base;
  }
}

async function renderShot(src, offset, seconds, device, out) {
  if (device === 'split') {
    // сплит: тот же материал сверху и снизу, нижняя половина зеркальная —
    // дешёвый, но заметный приём, глаз читает его как смену плана
    await ffmpeg([
      '-ss', offset.toFixed(2), '-t', seconds.toFixed(2), '-i', src,
      '-filter_complex',
      `[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,split[a][b];` +
        `[b]hflip[bb];[a][bb]vstack=inputs=2,fps=${FPS},setsar=1[v]`,
      '-map', '[v]', '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
      out,
    ]);
    return;
  }
  const extra = device === 'slow' ? seconds / 1.45 : seconds;
  await ffmpeg([
    '-ss', offset.toFixed(2), '-t', extra.toFixed(2), '-i', src,
    '-vf', `${deviceFilter(device, seconds)},fps=${FPS},setsar=1`,
    '-t', seconds.toFixed(2), '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
    out,
  ]);
}

// ── раскадровка ───────────────────────────────────────────────────
// На каждую реплику 2-4 плана. Длину берём долями такта: 2, 3 или 4
// половинки доли — так склейки ложатся в ритм, но не становятся метрономом.
function buildShots(lines, beat, sources) {
  // Длину плана считаем в ЦЕЛЫХ долях. В половинах при 152 BPM выходило по
  // 0.55 секунды на план — это уже не монтаж, а мельтешение.
  const unit = beat;
  const shots = [];
  let t = 0;
  let srcIdx = 0;
  let devIdx = 0;

  lines.forEach((line, li) => {
    // хук держим дольше — его читают; дальше режем чаще
    const perLine = li === 0 ? 3 : 2 + (li % 2);
    const units = li === 0 ? [4, 3, 3] : [3, 2, 3];
    const lineStart = t;
    for (let k = 0; k < perLine; k++) {
      const seconds = +(units[k % units.length] * unit).toFixed(3);
      const src = sources[srcIdx++ % sources.length];
      // первый план реплики всегда «чистый», приём идёт со второго —
      // иначе слово появляется одновременно с трюком и оба теряются
      const device = k === 0 ? 'full' : DEVICES[++devIdx % DEVICES.length];
      shots.push({ start: t, seconds, src, device, line: li });
      t += seconds;
    }
    line.start = lineStart;
    line.end = t;
  });
  return { shots, total: t };
}

// ── слой подписей ─────────────────────────────────────────────────
// Стиль как в референсах: крупный жирный шрифт, чёрная обводка,
// ключевое слово цветом. Не наш градиентный заголовок — на живом кадре
// читается именно обводка.
function captionHtml(lines, total, logo) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = lines
    .map((l, i) => {
      const words = esc(l.text).split(/\s+/).filter(Boolean);
      const keyAt = l.key != null ? l.key : words.length - 1;
      return `<div class="cap" data-i="${i}">${words
        .map((w, k) => `<span class="w${k === keyAt ? ' key' : ''}">${w}</span>`)
        .join(' ')}</div>`;
    })
    .join('\n');

  const meta = JSON.stringify(lines.map((l) => ({ start: l.start, end: l.end })));

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:transparent; overflow:hidden; font-family:'Montserrat', sans-serif; }
.cap { position:absolute; left:70px; right:70px; bottom:430px; text-align:center;
  font-weight:900; font-size:96px; line-height:1.1; text-transform:uppercase;
  letter-spacing:-1px; visibility:hidden; }
.cap .w { display:inline-block; color:#fff;
  -webkit-text-stroke:12px #000; paint-order:stroke fill;
  text-shadow:0 8px 30px rgba(0,0,0,.6); }
.cap .w.key { color:#e9ff4b; }
#foot { position:absolute; left:0; right:0; bottom:270px; text-align:center; }
#foot img { width:56px; height:56px; object-fit:contain; opacity:.9;
  filter:drop-shadow(0 0 18px rgba(0,0,0,.8)); }
#prog { position:absolute; left:0; top:0; height:6px; background:#e9ff4b; }
</style></head><body>
${blocks}
<div id="foot">${logo ? `<img src="${logo}" alt="">` : ''}</div>
<div id="prog"></div>
<script>
const L = ${meta};
const TOTAL = ${total};
const caps = document.querySelectorAll('.cap');
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

// Кегль подгоняем: реплики разной длины, фиксированный размер либо режется,
// либо оставляет строку в одно слово посреди экрана.
window.__fitAll = () => {
  caps.forEach((c) => {
    let size = 104;
    c.style.fontSize = size + 'px';
    while (size > 44 && (c.scrollHeight > 420 || c.scrollWidth > c.clientWidth)) {
      size -= 4;
      c.style.fontSize = size + 'px';
    }
  });
};

window.setT = (t) => {
  document.getElementById('prog').style.width = (100 * clamp01(t / TOTAL)) + '%';
  caps.forEach((c, i) => {
    const l = L[i];
    if (t < l.start || t >= l.end) { c.style.visibility = 'hidden'; return; }
    c.style.visibility = 'visible';
    const local = t - l.start;
    // слова появляются быстро, одно за другим — подпись живёт в ритме склеек
    c.querySelectorAll('.w').forEach((w, k) => {
      const p = easeOut(clamp01((local - 0.02 - k * 0.07) / 0.16));
      w.style.opacity = p;
      w.style.transform = 'scale(' + (0.82 + 0.18 * p).toFixed(3) + ')';
    });
  });
};
</script></body></html>`;
}

// ── сборка ────────────────────────────────────────────────────────
export async function makeMontage({ lines, name, tags = [] }) {
  if (!lines || !lines.length) throw new Error('nie ma tekstu');
  await mkdir(OUT_DIR, { recursive: true });
  const base = String(name || `montage-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
  const shotsDir = path.join(OUT_DIR, `${base}-shots`);
  const framesDir = path.join(OUT_DIR, `${base}-frames`);
  await rm(shotsDir, { recursive: true, force: true });
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(shotsDir, { recursive: true });
  await mkdir(framesDir, { recursive: true });

  const music = await pickMusic();
  const tempo = music ? await detectTempo(music) : null;
  const beat = tempo ? tempo.beat : 0.5;

  // источники: сначала свои теги, потом остальная библиотека
  const lib = await brollLibrary();
  const wanted = tags.filter((t) => lib.has(t)).map((t) => lib.get(t));
  const rest = [...lib.entries()].filter(([k]) => !tags.includes(k)).map(([, v]) => v);
  const sources = [...wanted, ...rest];
  if (!sources.length) throw new Error('pusta biblioteka broll/');

  const { shots, total } = buildShots(lines, beat, sources);

  // режем планы
  const parts = [];
  for (const [i, s] of shots.entries()) {
    const out = path.join(shotsDir, `s${String(i).padStart(3, '0')}.mp4`);
    // смещение внутри исходника разное, иначе повторный клип даст тот же кадр
    const offset = 0.3 + ((i * 1.7) % 2.6);
    await renderShot(s.src, offset, s.seconds, s.device, out);
    parts.push(out);
  }
  const list = path.join(OUT_DIR, `${base}-list.txt`);
  await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const bed = path.join(OUT_DIR, `${base}-bed.mp4`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', bed]);

  // слой подписей
  let logo = '';
  try {
    logo = 'data:image/png;base64,' + (await readFile(LOGO_FILE, 'utf8')).trim();
  } catch {
    /* без лого тоже соберётся */
  }
  const htmlPath = path.join(OUT_DIR, `${base}.html`);
  await writeFile(htmlPath, captionHtml(lines, total, logo), 'utf8');

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
  await ffmpeg([
    '-i', bed,
    '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png'),
    '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20',
    '-r', String(FPS), '-shortest',
    silent,
  ]);

  const final = path.join(OUT_DIR, `${base}.mp4`);
  const cuts = shots.slice(1).map((s) => s.start);
  if (music) {
    const fadeOut = Math.max(0, total - 1.6).toFixed(2);
    const chain = [
      `[1:a]atrim=0:${total.toFixed(2)},asetpts=N/SR/TB,loudnorm=I=-14:TP=-1.5:LRA=11,` +
        `afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOut}:d=1.6[mus]`,
      `[2:a]asplit=${cuts.length}` + cuts.map((_, i) => `[hs${i}]`).join(''),
      ...cuts.map(
        (s, i) => `[hs${i}]adelay=${Math.round(s * 1000)}|${Math.round(s * 1000)},volume=0.5[h${i}]`
      ),
      cuts.map((_, i) => `[h${i}]`).join('') + `amix=inputs=${cuts.length}:normalize=0[hits]`,
      `[mus][hits]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`,
    ].join(';');
    await ffmpeg([
      '-i', silent, '-i', music,
      '-f', 'lavfi',
      '-i', `aevalsrc='0.4*exp(-t*24)*sin(2*PI*72*t)+0.16*(random(0)*2-1)*exp(-t*60)':d=0.5:s=44100:c=stereo`,
      '-filter_complex', chain,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      final,
    ]);
  } else {
    await ffmpeg([
      '-i', silent,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest',
      final,
    ]);
  }

  await rm(shotsDir, { recursive: true, force: true });
  await rm(framesDir, { recursive: true, force: true });
  await rm(bed, { force: true });
  await rm(silent, { force: true });
  await rm(list, { force: true });

  const bytes = (await readFile(final)).length;
  return {
    file: final,
    name: `${base}.mp4`,
    bytes,
    seconds: total,
    shots: shots.length,
    avgShot: +(total / shots.length).toFixed(2),
    bpm: tempo ? Math.round(tempo.bpm) : null,
  };
}

// ── CLI ───────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('montage.mjs')) {
  const demo = {
    name: 'demo-montage',
    tags: ['ekrany', 'kawa', 'barber', 'nowoczesne', 'czas', 'moda', 'ai', 'uroda'],
    lines: [
      { text: 'Twój profil wygląda martwo' },
      { text: 'Zdjęcia bez światła' },
      { text: 'Opisy o sobie, nie o kliencie' },
      { text: 'Zero powodu, żeby napisać' },
      { text: 'Naprawiamy to w tydzień' },
    ],
  };
  const t0 = Date.now();
  const r = await makeMontage(demo);
  console.log(
    JSON.stringify(
      {
        file: r.file,
        mb: (r.bytes / 1048576).toFixed(1),
        sek: r.seconds.toFixed(1),
        ujec: r.shots,
        sredniePlan: r.avgShot + 's',
        bpm: r.bpm,
        czas: Math.round((Date.now() - t0) / 1000) + 's',
      },
      null,
      1
    )
  );
}
