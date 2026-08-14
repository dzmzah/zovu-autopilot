// Собирает рисованный рилс целиком: голос, сцена, звуки появлений, музыка.
//
//   node rolka-grafika.mjs           — собрать пробу
//
// Отличие от `rolka-auto.mjs` одно, но принципиальное: там подложка ищется
// на стоке, здесь её нет вообще. Из-за этого уходит и главное, что выдаёт
// автоматическую сборку, — разнобой чужих кадров: разный свет, разный цвет,
// разные люди. Тут каждый пиксель наш.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { zbudujGlos } from './glos.mjs';
import { sprawdzRolke } from './kontrola.mjs';
import { grafikaHtml, renderujKlatki, wczytajObiekty, W, H, FPS } from './grafika.mjs';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ── сценарий пробы ────────────────────────────────────────────────
// Тот же текст, что и в обычном рилсе про три секунды: сравнивать формы
// честно только на одинаковых словах.
const FRAZY = [
  { rola: 'hak', tekst: 'Trzy sekundy.', pauza: 0.40 },
  { rola: 'hak', tekst: 'Tyle masz, zanim palec pojedzie dalej.', pauza: 0.46 },
  { rola: 'tresc', tekst: 'Widz nie ocenia wtedy jakości.', pauza: 0.30 },
  { rola: 'tresc', tekst: 'Sprawdza jedno: czy to o nim.', pauza: 0.30 },
  { rola: 'zaplata', tekst: 'Dlatego pierwsze zdanie mówi o widzu, nie o tobie.', pauza: 0.30 },
  { rola: 'cta', tekst: 'Włącz swoją ostatnią rolkę i posłuchaj pierwszego zdania.', pauza: 0.20 },
];

const glos = await zbudujGlos(FRAZY, { tmp: path.join(OUT, 'grafika-glos'), przedPierwsza: 0.45 });
console.log(`[grafika] голос ${glos.dlugosc.toFixed(2)} с, слов ${glos.slowa.length}`);

const F = glos.frazy;
const total = +(glos.dlugosc + 0.6).toFixed(2);

// ── сцена ─────────────────────────────────────────────────────────
// Объекты привязаны к фразам: появляются ровно тогда, когда о них говорят.
// Влёт очередью с шагом 0.14 с — так же, как в образце: кадр наполняется,
// а не переключается.
const scena = [
  { obiekt: 'stopwatch_3d',        x: 540, y: 470, skala: 460, obrot: -8,  skad: 'gora',  start: +(F[0].a + 0.05).toFixed(2) },
  { obiekt: 'mobile_phone_3d',     x: 300, y: 980, skala: 300, obrot: -14, skad: 'lewo',  start: +(F[1].a + 0.02).toFixed(2) },
  { obiekt: 'eyes_3d',             x: 790, y: 980, skala: 300, obrot: 10,  skad: 'prawo', start: +(F[1].a + 0.16).toFixed(2) },
  { obiekt: 'cross_mark_3d',       x: 300, y: 1290, skala: 250, obrot: -6, skad: 'dol',   start: +(F[2].a + 0.04).toFixed(2) },
  { obiekt: 'check_mark_button_3d',x: 790, y: 1290, skala: 250, obrot: 8,  skad: 'prawo', start: +(F[3].a + 0.04).toFixed(2) },
  { obiekt: 'light_bulb_3d',       x: 540, y: 1560, skala: 260, obrot: 0,  skad: 'dol',   start: +(F[4].a + 0.06).toFixed(2) },
];

const plan = {
  scena,
  slowa: glos.slowa,
  // Барабан на хуке: три секунды, которые утекают. Цифра — это и есть тема.
  licznik: { od: 9, do: 3, a: +F[0].a.toFixed(2), b: +(F[0].b + 0.1).toFixed(2), sufiks: 'sek' },
};

const obrazki = await wczytajObiekty([...new Set(scena.map((o) => o.obiekt))]);
const katKlatek = path.join(OUT, 'grafika-klatki');
await rm(katKlatek, { recursive: true, force: true });
const klatek = await renderujKlatki(grafikaHtml(plan, obrazki, total), total, katKlatek);
console.log(`[grafika] отрисовано кадров: ${klatek}`);

const wideo = path.join(OUT, 'grafika-nieme.mp4');
await ffmpeg([
  '-framerate', String(FPS), '-i', path.join(katKlatek, 'f%05d.png'),
  '-vf', `format=yuv420p,fps=${FPS},setsar=1`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-t', String(total),
  wideo,
]);

// ── звук: свист на каждое появление ───────────────────────────────
// В образце 31 всплеск на 22 секунды — по звуку на каждое движение. Без
// этого влёт выглядит немой картинкой: глаз ждёт удара, ухо его не слышит.
const swist = path.join(OUT, 'grafika-swist.wav');
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.26:c=white:a=0.7:r=48000',
  '-af', 'highpass=f=380,lowpass=f=4600,afade=t=in:st=0:d=0.05,afade=t=out:st=0.06:d=0.19,' +
    'volume=0.55,aformat=channel_layouts=stereo',
  '-ac', '2', '-ar', '48000', swist,
]);

const zdarzenia = scena.map((o) => +o.start);
const wejscia = [];
const czesci = [];
zdarzenia.forEach((t, i) => {
  wejscia.push('-i', swist);
  const ms = Math.max(0, Math.round(t * 1000));
  czesci.push(`[${i}:a]adelay=${ms}|${ms}[s${i}]`);
});
const stuki = path.join(OUT, 'grafika-stuki.wav');
await ffmpeg([
  ...wejscia,
  '-filter_complex',
  czesci.join(';') + ';' + zdarzenia.map((_, i) => `[s${i}]`).join('') +
    `amix=inputs=${zdarzenia.length}:normalize=0,apad=whole_dur=${total}[a]`,
  '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', stuki,
]);

// ── сведение ──────────────────────────────────────────────────────
const muzyka = path.join(DIR, 'music', 'pixabay-creative-technology-showreel.mp3');
const gotowy = path.join(OUT, 'auto-grafika-trzy-sekundy.mp4');
await ffmpeg([
  '-i', wideo, '-i', glos.plik, '-i', muzyka, '-i', stuki,
  '-f', 'lavfi', '-i', `anoisesrc=c=brown:a=0.02:r=48000:d=${total}`,
  '-filter_complex',
  `[1:a]highpass=f=80,loudnorm=I=-15:TP=-1.5:LRA=7[voice];` +
    `[2:a]atrim=0:${total},asetpts=N/SR/TB,volume=0.12,afade=t=in:st=0:d=0.12,` +
    `afade=t=out:st=${Math.max(0, total - 1.4).toFixed(2)}:d=1.4[bed];` +
    `[voice]asplit=2[v1][kluczDuck];` +
    `[bed][kluczDuck]sidechaincompress=threshold=0.02:ratio=11:attack=10:release=170:makeup=1:level_sc=1[bedDuck];` +
    `[v1][bedDuck][3:a][4:a]amix=inputs=4:normalize=0:duration=longest,` +
    `alimiter=limit=0.95,aformat=channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-t', String(total),
  gotowy,
]);

const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', gotowy,
]);
const inf = JSON.parse(stdout).format;
console.log(`[grafika] собрано: ${gotowy} · ${(+inf.duration).toFixed(2)} с · ${(inf.size / 1048576).toFixed(2)} МБ`);

const kontrola = await sprawdzRolke(gotowy, { oczekiwanePrzejscia: zdarzenia });
console.log('[grafika] проверка:', JSON.stringify(kontrola, null, 1));
