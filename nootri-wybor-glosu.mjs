// Один ролик со всеми голосами — чтобы выбирать ухом на своей картинке.
//
// Каждый голос читает один и тот же кусок сценария поверх одних и тех же
// кадров, сверху номер и имя. Так сравнивается ГОЛОС: и текст, и картинка,
// и подача у всех совпадают, отличается только тембр.
//
// Музыки нет намеренно: подложка маскирует именно то, что мы слушаем.
//
//   node nootri-wybor-glosu.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const DIR = import.meta.dirname;
const KLIPY = path.join('C:', 'Users', 'zahar', 'Desktop', 'zovu desktop', 'zovu flow');
const PROBY = path.join('C:', 'Users', 'zahar', 'Desktop', 'zovu desktop', 'GLOSY-NOOTRI');
const TMP = path.join(DIR, 'out', 'wybor-tmp');
// Папка с пробами задаётся ключом: подача меняется чаще, чем всё остальное,
// и каждая её версия лежит отдельно.
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=').pop();
const KAT = arg('kat', path.join(PROBY, 'gemini'));
const WYJ = path.join('C:', 'Users', 'zahar', 'Desktop', 'zovu desktop', arg('plik', 'Nootri-WYBOR-GLOSU.mp4'));

const GLOSY = [
  { nazwa: 'Enceladus', plik: path.join(KAT, 'Enceladus.mp3') },
  { nazwa: 'Iapetus', plik: path.join(KAT, 'Iapetus.mp3') },
  { nazwa: 'Umbriel', plik: path.join(KAT, 'Umbriel.mp3') },
  { nazwa: 'Rasalgethi', plik: path.join(KAT, 'Rasalgethi.mp3') },
  { nazwa: 'Schedar', plik: path.join(KAT, 'Schedar.mp3') },
  { nazwa: 'Gacrux', plik: path.join(KAT, 'Gacrux.mp3') },
  { nazwa: 'Achird', plik: path.join(KAT, 'Achird.mp3') },
  { nazwa: 'Sadaltager', plik: path.join(KAT, 'Sadaltager.mp3') },
  // Полные дубли обрезаем до той же длины, что и пробы: сравнение честное
  // только на одинаковом куске.
  { nazwa: 'Puck', plik: path.join(PROBY, 'Puck-a.mp3'), przytnij: true },
  { nazwa: 'Alnilam', plik: path.join(PROBY, 'Alnilam-a.mp3'), przytnij: true },
];

// Картинка одна на всех: первые две сцены ролика.
const KADRY = [
  path.join(KLIPY, 'Man_talking_on_phone_in_202608312111.mp4'),
  path.join(KLIPY, 'Man_holding_phone_indoors_202608312111.mp4'),
];

async function ffmpeg(args) {
  return exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 64 * 1024 * 1024 });
}
async function dlugosc(p) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]);
  return parseFloat(stdout.trim());
}

await mkdir(TMP, { recursive: true });

// Общая подложка: две сцены встык, 16 секунд, без звука.
const tlo = path.join(TMP, 'tlo.mp4');
const lista0 = path.join(TMP, 'lista0.txt');
await writeFile(lista0, KADRY.map((k) => `file '${k.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista0, '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', tlo]);
const dlTla = await dlugosc(tlo);

const czesci = [];
for (const [i, g] of GLOSY.entries()) {
  if (!existsSync(g.plik)) {
    console.warn(`[wybor] нет файла ${g.plik} — пропускаю`);
    continue;
  }
  const dl = Math.min(g.przytnij ? 19 : await dlugosc(g.plik), dlTla);
  const etykieta = path.join(DIR, 'out', `etykieta-${g.nazwa}.png`);
  const plik = path.join(TMP, `${String(i + 1).padStart(2, '0')}-${g.nazwa}.mp4`);

  await ffmpeg([
    '-i', tlo,
    '-i', etykieta,
    '-i', g.plik,
    '-filter_complex',
      `[0:v]trim=0:${dl.toFixed(2)},setpts=PTS-STARTPTS[v0];` +
      `[1:v]format=rgba[lab];` +
      `[v0][lab]overlay=0:0:format=auto,format=yuv420p[v];` +
      `[2:a]atrim=0:${dl.toFixed(2)},asetpts=PTS-STARTPTS,` +
      `aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,` +
      `afade=t=out:st=${(dl - 0.25).toFixed(2)}:d=0.25[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-r', '30', plik,
  ]);
  czesci.push(plik);
  console.log(`[wybor] ${i + 1}. ${g.nazwa} — ${dl.toFixed(1)} с`);
}

const lista = path.join(TMP, 'lista.txt');
await writeFile(lista, czesci.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', WYJ]);

console.log(`[wybor] готово: ${WYJ} — ${(await dlugosc(WYJ)).toFixed(1)} с`);
