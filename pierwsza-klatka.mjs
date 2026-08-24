// Первый кадр — крупный текст на весь экран.
//
// Из ночного разбора рынка: решение смотреть или смахнуть принимается за 1,7
// секунды, и первый кадр обязан работать сам по себе. У нас там был просто
// первый кадр видео — то есть ничего.
//
// Карточка держится 1,2 секунды с лёгким наездом, потом ролик как есть.
// Дольше держать нельзя: это не заставка, а обещание, которое надо сразу
// начать выполнять.
//
//   node pierwsza-klatka.mjs --plik=<mp4> --gora="START 3 WRZEŚNIA" \
//     --dol="OSK SILESIA" [--wyjscie=<mp4>]
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const W = 1080, H = 1920, FPS = 50, TRWA = 1.2;

const arg = (n, d = '') => {
  const a = process.argv.find((x) => x.startsWith('--' + n + '='));
  return a ? a.slice(n.length + 3) : d;
};

const PLIK = arg('plik');
if (!PLIK) throw new Error('нужен --plik=<mp4>');
const GORA = arg('gora', '');
const DOL = arg('dol', '');
const WYJSCIE = arg('wyjscie', PLIK.replace(/\.mp4$/i, '-hak.mp4'));
const TLO = arg('tlo', '#0f0b1e');
// Наложением, а не приставкой. Приставка добавляет 1,2 секунды тишины перед
// речью, а хук обязан начаться в первые 1,7 секунды — мы бы съели больше
// половины этого окна заставкой. Наложение оставляет звук на месте.
const NAKLADKA = process.argv.includes('--nakladka');
const AKCENT = arg('akcent', '#ffd23f');

const OUT = path.join(DIR, 'out', 'pierwsza-klatka');
await mkdir(OUT, { recursive: true });

// Кегль подбираем замером, а не на глаз: длинная строка иначе вылезает за
// поля, и это ровно та ошибка, которую Захар поймал на подписи под биркой.
const html = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${W}px;height:${H}px;background:${NAKLADKA ? "transparent" : TLO};overflow:hidden}
  ${NAKLADKA ? ".zaslona{position:absolute;inset:0;background:rgba(9,6,20,.72)}" : ""}
  .srodek{position:absolute;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:34px;padding:0 90px;text-align:center}
  .gora{font-family:'Archivo Black',sans-serif;color:#fff;line-height:.98;
    letter-spacing:-.02em;text-shadow:0 12px 40px rgba(0,0,0,.5);white-space:pre-line}
  .dol{font-family:'Inter',sans-serif;font-weight:800;color:${AKCENT};
    letter-spacing:.12em;text-transform:uppercase}
  .pasek{position:absolute;left:50%;transform:translateX(-50%);bottom:16%;
    width:190px;height:9px;border-radius:5px;background:${AKCENT}}
</style>
${NAKLADKA ? '<div class="zaslona"></div>' : ""}
<div class="srodek">
  <div class="gora" id="g">${GORA.replace(/</g, '&lt;')}</div>
  <div class="dol" id="d">${DOL.replace(/</g, '&lt;')}</div>
</div>
<div class="pasek"></div>
<script>
  const g = document.getElementById('g');
  let k = 190;
  g.style.fontSize = k + 'px';
  while (k > 60 && (g.scrollWidth > ${W} - 180 || g.scrollHeight > ${H} * 0.42)) {
    k -= 4; g.style.fontSize = k + 'px';
  }
  document.getElementById('d').style.fontSize = Math.max(30, Math.round(k * 0.24)) + 'px';
</script>`;

const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: W, height: H } });
await pg.setContent(html, { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);
const karta = path.join(OUT, 'karta.png');
await pg.screenshot({ path: karta, omitBackground: NAKLADKA });
await br.close();

if (NAKLADKA) {
  // Карточка лежит поверх первых секунд и уходит растворением: резкое
  // исчезновение читается как сбой, плавное — как приём.
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', PLIK, '-loop', '1', '-i', karta,
    '-filter_complex',
    `[1:v]format=rgba,fade=t=out:st=${(TRWA - 0.35).toFixed(2)}:d=0.35:alpha=1,` +
      `scale=${W}:${H}[k];[0:v][k]overlay=0:0:enable='lt(t,${TRWA})':format=auto,format=yuv420p[v]`,
    // Без ограничителя картинка с -loop 1 бесконечна, и склейка гонит файл
    // до упора: первый прогон выдал 68 МБ и не остановился.
    '-shortest',
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-c:a', 'copy', WYJSCIE,
  ]);
  console.log(`[хук] наложение ${TRWA} с → ${WYJSCIE}`);
  process.exit(0);
}

// Наезд делаем зумом на самой карточке: статичная заставка читается как
// заглушка, а движение — как начало ролика.
const kartaMp4 = path.join(OUT, 'karta.mp4');
await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-loop', '1', '-i', karta, '-t', String(TRWA),
  '-vf', `zoompan=z='1+0.05*on/${Math.round(FPS * TRWA)}':d=1:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':s=${W}x${H}:fps=${FPS},format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', kartaMp4,
]);

// Звук карточки — тишина ровно её длины, иначе склейка сдвинет дорожку.
const cisza = path.join(OUT, 'cisza.wav');
await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(TRWA), cisza,
]);
const kartaZeSc = path.join(OUT, 'karta-ze-sciezka.mp4');
await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', kartaMp4, '-i', cisza, '-c:v', 'copy', '-c:a', 'aac', '-shortest', kartaZeSc,
]);

// Ролик приводим к той же сетке: concat склеивает только одинаковое.
const rolkaNorm = path.join(OUT, 'rolka.mp4');
await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error', '-i', PLIK,
  '-vf', `fps=${FPS},scale=${W}:${H},format=yuv420p,setsar=1`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
  '-c:a', 'aac', '-ar', '48000', '-ac', '2', rolkaNorm,
]);

const lista = path.join(OUT, 'lista.txt');
const { writeFile } = await import('node:fs/promises');
await writeFile(
  lista,
  [kartaZeSc, rolkaNorm].map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
  'utf8'
);
await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', WYJSCIE,
]);

for (const p of [kartaMp4, cisza, kartaZeSc, rolkaNorm, lista]) await rm(p, { force: true });
console.log(`[хук] карточка ${TRWA} с + ролик → ${WYJSCIE}`);
