// Забирает фон-петлю из набора и кладёт в `tlo/` пригодной для репозитория.
//
// Исходники из пака весят 9-217 МБ на файл: класть такое в репозиторий
// нельзя, а качать на прогоне неоткуда. Поэтому режем до петли в 12 секунд,
// ужимаем и складываем рядом с остальными — на выходе 1-2 МБ, ровно как у
// тех четырёх, что уже лежат.
//
// Фон в кадре размыт движением и накрыт объектами, поэтому сжатие по нему
// не читается. А вот ЯРКОСТЬ читается: тень мы рисуем чёрной, и на тёмном
// полотне её не видно вообще. Светлые фоны — не вкусовщина, а условие того,
// чтобы объём был виден.
//
//   node import-tlo.mjs "D:\путь\Топография 1.mp4" topografia-jasna
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;

const [zrodlo, nazwa] = process.argv.slice(2);
if (!zrodlo || !nazwa) {
  console.log('использование: node import-tlo.mjs <файл> <имя-без-расширения>');
  process.exit(1);
}

const cel = path.join(DIR, 'tlo', `${nazwa}.mp4`);

await execFileAsync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-t', '12', '-i', zrodlo,
  '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=25',
  '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p',
  cel,
]);

// Яркость сразу и говорим вслух: фон темнее ~120 не годится под наши тени,
// и узнать это лучше здесь, чем через собранный ролик.
const { stdout } = await execFileAsync('ffmpeg', [
  '-v', 'error', '-ss', '1', '-i', cel, '-frames:v', '1',
  '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', '-',
], { encoding: 'buffer' });
const jasnosc = stdout[0] ?? 0;

const st = await stat(cel);
console.log(
  `[tlo] ${path.basename(cel)} · ${(st.size / 1048576).toFixed(2)} МБ · яркость ${jasnosc}` +
    (jasnosc < 120 ? '  ← ТЁМНЫЙ, тень на нём не видна' : '')
);
