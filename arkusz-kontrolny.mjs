// Лист для проверки ГЛАЗАМИ — но в натуральную величину.
//
// Ошибку с подписью шкалы («DNI TREŚCI» белым по белой полосе) я пропустил
// не потому, что не смотрел, а потому что смотрел сетку кадров шириной
// 260 пикселей: подпись там была тридцать пикселей и выглядела просто
// «мелким текстом». Захар открыл ролик на весь экран и увидел кашу сразу.
//
// Отсюда правило: текст в ролике проверяется ТОЛЬКО в масштабе 1:1. Этот
// скрипт режет из кадров полосы во всю ширину — те, где живут счётчик,
// бирка со шкалой и подпись, — и складывает их одна под другой без
// уменьшения.
//
//   node arkusz-kontrolny.mjs out/rolka.mp4 [сек,сек,сек]
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DIR = import.meta.dirname;

const plik = process.argv[2];
if (!plik) {
  console.error('нужен путь к ролику');
  process.exit(1);
}

const dl = parseFloat(
  (await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', plik]))
    .stdout.trim()
);

// Моменты: либо заданы руками, либо восемь равных по ролику.
const czasy = process.argv[3]
  ? process.argv[3].split(',').map((s) => parseFloat(s.trim()))
  : Array.from({ length: 8 }, (_, i) => +((dl * (i + 0.5)) / 8).toFixed(2));

// Полосы во всю ширину кадра: где обычно стоит текст.
const PASY = [
  { nazwa: 'licznik', y: 880, h: 420 },   // счётчик и формула
  { nazwa: 'metka', y: 1180, h: 420 },    // бирка, шкала и её подпись
  { nazwa: 'podpis', y: 1440, h: 400 },   // подпись под голос
];

const OUT = path.join(DIR, 'out', 'arkusz');
await mkdir(OUT, { recursive: true });

const zrobione = [];
for (const pas of PASY) {
  const kawalki = [];
  for (const [i, t] of czasy.entries()) {
    const cel = path.join(OUT, `${pas.nazwa}-${i}.png`);
    await run('ffmpeg', [
      '-v', 'error', '-ss', String(t), '-i', plik,
      '-vf', `crop=1080:${pas.h}:0:${pas.y}`,
      '-frames:v', '1', cel, '-y',
    ]);
    kawalki.push(cel);
  }
  const arkusz = path.join(OUT, `arkusz-${pas.nazwa}.png`);
  await run('ffmpeg', [
    '-v', 'error',
    ...kawalki.flatMap((k) => ['-i', k]),
    '-filter_complex', `${kawalki.map((_, i) => `[${i}]`).join('')}vstack=inputs=${kawalki.length}[v]`,
    '-map', '[v]', '-frames:v', '1', arkusz, '-y',
  ]);
  zrobione.push(arkusz);
  console.log(`${pas.nazwa}: ${arkusz}`);
}

console.log(`\nмоменты: ${czasy.join(', ')} с`);
console.log('смотреть в 100%, не уменьшая — иначе смысла нет');
