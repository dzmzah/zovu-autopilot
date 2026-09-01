// Ролик для выбора музыки: одни и те же первые секунды под разные треки.
//
// Захар: «музыка слишком радостная для начала». История начинается с того,
// что от человека ушла жена, — весёлая подложка тут спорит с кадром. Поэтому
// выбираем на слух и НА НАЧАЛЕ ролика, а не по названию трека.
//
// Голос и картинка одинаковые во всех кусках, отличается только подложка.
//
//   node nootri-wybor-muzyki.mjs
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');
const TMP = path.join(OUT, 'muzyka-tmp');
const MUZ = path.join(DIR, 'muzyka-smutna');
const WIDEO = path.join('C:', 'Users', 'zahar', 'Desktop', 'zovu desktop', 'Nootri-FINAL.mp4');
const GLOS = path.join(OUT, 'nootri', 'nootri-glos.wav');
const WYJ = path.join('C:', 'Users', 'zahar', 'Desktop', 'zovu desktop', 'Nootri-WYBOR-MUZYKI.mp4');
const DL = 13;

await mkdir(TMP, { recursive: true });
const pliki = (await readdir(MUZ)).filter((f) => f.endsWith('.mp3')).sort();

// Подписи с номером трека — тем же способом, что и для голосов.
const HTML = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:transparent;font-family:'Outfit',sans-serif}
.e{width:1080px;height:1920px;display:flex;flex-direction:column;align-items:center;padding-top:120px}
.p{background:rgba(10,14,9,.72);border-radius:999px;padding:20px 48px;display:flex;gap:20px;align-items:baseline}
.n{color:#f6a623;font-size:60px;font-weight:600}.i{color:#fff;font-size:42px;font-weight:200}
.d{margin-top:20px;color:#fff;opacity:.7;font-size:24px;letter-spacing:.3em;text-transform:uppercase}</style>
<div class="e" id="e"><div class="p"><span class="n" id="n">1</span><span class="i" id="i">MUZYKA</span></div>
<div class="d">wybierz numer</div></div>`;
await writeFile(path.join(TMP, 'e.html'), HTML, 'utf8');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file:///' + path.join(TMP, 'e.html').replace(/\\/g, '/'));
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
for (const [i] of pliki.entries()) {
  await p.evaluate((n) => { document.getElementById('n').textContent = n; }, String(i + 1));
  await p.waitForTimeout(80);
  await (await p.$('#e')).screenshot({ path: path.join(TMP, `e${i}.png`), omitBackground: true });
}
await b.close();

async function ffmpeg(a) { return exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { maxBuffer: 64 * 1024 * 1024 }); }

const czesci = [];
for (const [i, m] of pliki.entries()) {
  const plik = path.join(TMP, `m${String(i + 1).padStart(2, '0')}.mp4`);
  // Голос той же громкости, что в ролике; подложка под ним приглушается
  // боковой цепью — иначе сравниваем не музыку, а её громкость.
  await ffmpeg([
    '-i', WIDEO,
    '-i', path.join(TMP, `e${i}.png`),
    '-i', GLOS,
    '-i', path.join(MUZ, m),
    '-filter_complex',
      `[0:v]trim=0:${DL},setpts=PTS-STARTPTS[v0];[1:v]format=rgba[lab];` +
      `[v0][lab]overlay=0:0:format=auto,format=yuv420p[v];` +
      `[2:a]atrim=0:${DL},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,volume=1.0[gl];` +
      `[3:a]atrim=0:${DL},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=48000,volume=0.30,` +
      `afade=t=in:st=0:d=0.4,afade=t=out:st=${DL - 0.6}:d=0.6[mu];` +
      `[mu][gl]sidechaincompress=threshold=0.03:ratio=8:attack=12:release=200[muD];` +
      `[gl][muD]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.97[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(DL), '-r', '30',
    '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', plik,
  ]);
  czesci.push(plik);
  console.log(`[muzyka] ${i + 1}. ${m}`);
}

const lista = path.join(TMP, 'lista.txt');
await writeFile(lista, czesci.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', WYJ]);
console.log(`[muzyka] готово: ${WYJ}`);
console.log(pliki.map((m, i) => `${i + 1} = ${m}`).join('\n'));
