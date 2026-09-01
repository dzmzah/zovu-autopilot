// Короткий вертикальный ролик для New Orchard: 1080×1920, ~9 секунд.
//
// Устройство. Четыре сцены жёсткими резами: осень → обувь крупно → предложение
// → фирменная плашка. Движение даёт НЕ наезд на фото (он читается как глюк, и
// это уже оплаченная нами ошибка), а вертикальный дрейф кадра и появление
// типографики. Текст лежит отдельными прозрачными слоями — правка надписи не
// требует пересборки всего.
//
//   node orchard-wideo.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const BAZA = path.join('C:', 'Users', 'zahar', 'Desktop', 'zovu desktop', 'NEW-ORCHARD');
const MAT = path.join(BAZA, 'materialy');
const MAK = path.join(BAZA, 'makieta');
const OUT = path.join(BAZA, 'gotowe');
const TMP = path.join(BAZA, 'tmp');

const FPS = 30;
const W = 1080;
const H = 1920;

// Сцена: фото + слой текста. `dryf` — на сколько пикселей уезжает кадр за сцену.
const SCENY = [
  { foto: 'hero-autumn.jpg', napis: 't1.png', dl: 2.6, dryf: -60, poz: 0.42 },
  { foto: 'boots-green.jpg', napis: 't2.png', dl: 2.3, dryf: 55, poz: 0.55 },
  { foto: 'boots-white.jpg', napis: 't3.png', dl: 2.3, dryf: -50, poz: 0.5 },
];
const KONIEC = { napis: 'koniec.png', dl: 1.9 };

async function ffmpeg(args) {
  return exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 64 * 1024 * 1024 });
}

await mkdir(TMP, { recursive: true });
await mkdir(OUT, { recursive: true });

const czesci = [];
for (const [i, s] of SCENY.entries()) {
  const plik = path.join(TMP, `scena${i}.mp4`);
  const wys = H + Math.abs(s.dryf) * 2;
  // Кадр берём с запасом по высоте и плавно ведём его — это оживляет план,
  // не трогая масштаб. Текст всплывает первые 0.5 с и стоит намертво.
  await ffmpeg([
    '-loop', '1', '-t', String(s.dl), '-i', path.join(MAT, s.foto),
    '-loop', '1', '-t', String(s.dl), '-i', path.join(MAK, s.napis),
    '-filter_complex',
    `[0:v]scale=${W}:${wys}:force_original_aspect_ratio=increase,crop=${W}:${wys},` +
      `crop=${W}:${H}:0:'${Math.abs(s.dryf)}+${s.dryf}*t/${s.dl}',format=yuv420p,setsar=1[bg];` +
      `[1:v]format=rgba,fade=t=in:st=0.15:d=0.5:alpha=1[tx];` +
      `[bg][tx]overlay=0:0:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', plik,
  ]);
  czesci.push(plik);
  console.log(`[orchard] сцена ${i + 1}: ${s.dl} с`);
}

const koniec = path.join(TMP, 'koniec.mp4');
await ffmpeg([
  '-loop', '1', '-t', String(KONIEC.dl), '-i', path.join(MAK, KONIEC.napis),
  '-vf', `scale=${W}:${H},fade=t=in:st=0:d=0.35,format=yuv420p,setsar=1`,
  '-r', String(FPS), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', koniec,
]);
czesci.push(koniec);

// Склейка только concat: xfade и tpad на разных сборках ffmpeg считают длину
// по-разному, и ролик выходит короче задуманного. Здесь длина предсказуема.
const lista = path.join(TMP, 'lista.txt');
await (await import('node:fs/promises')).writeFile(
  lista,
  czesci.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'),
  'utf8'
);

const wyjscie = path.join(OUT, 'NewOrchard_FALL20_reel_1080x1920.mp4');
await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', wyjscie]);

const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wyjscie]);
console.log(`[orchard] готово: ${wyjscie} — ${(+stdout.trim()).toFixed(2)} с`);
