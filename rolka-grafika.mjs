// Собирает рисованный рилс целиком: голос, сцены, камера, звуки, музыка.
//
//   node rolka-grafika.mjs
//
// Сценарий построен как у Захара в `Scenariusz 2`: не «три пункта», а
// ВЫЧИСЛЕНИЕ. Голос считает вслух, картинка складывает вместе с ним, в конце
// цифра потери красным. Объекты при этом не украшают текст — они и есть
// слагаемые. Именно этого не хватало первой версии: там иконки просто
// иллюстрировали слова, и получалось «не та тема».
//
// Арифметика честная: 20 минут × 30 дней = 10 часов. Ничего не выдумано.
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

const FRAZY = [
  { rola: 'hak', tekst: 'Ile kosztuje cię milczenie w sieci?', pauza: 0.34 },
  { rola: 'hak', tekst: 'Policzmy.', pauza: 0.42 },
  { rola: 'tresc', tekst: 'Jeden post to dwadzieścia minut.', pauza: 0.30 },
  { rola: 'tresc', tekst: 'Razy trzydzieści dni.', pauza: 0.34 },
  { rola: 'tresc', tekst: 'Dziesięć godzin miesięcznie. Twoich.', pauza: 0.38 },
  { rola: 'zaplata', tekst: 'Tyle samo kosztuje ktoś, kto zrobi to za ciebie.', pauza: 0.30 },
  { rola: 'cta', tekst: 'Napisz CZAS, a policzymy twoje.', pauza: 0.20 },
];

const glos = await zbudujGlos(FRAZY, { tmp: path.join(OUT, 'grafika-glos'), przedPierwsza: 0.45 });
console.log(`[grafika] голос ${glos.dlugosc.toFixed(2)} с, слов ${glos.slowa.length}`);

const F = glos.frazy;
const total = +(glos.dlugosc + 0.5).toFixed(2);
const t = (i, d = 0) => +(F[i].a + d).toFixed(2);

// ── сцены ─────────────────────────────────────────────────────────
// Объект приходит под свою фразу и УХОДИТ, когда мысль сменилась. Это
// главное отличие от первой версии, где всё копилось до конца и кадр к
// финалу стоял неподвижной кучей.
const scena = [
  { obiekt: 'mobile_phone_3d', x: 540, y: 620, skala: 500, obrot: -6, skad: 'gora',
    start: t(0, 0.05), koniec: t(1, 0.10), dokad: 'lewo' },
  { obiekt: 'thinking_face_3d', x: 800, y: 1080, skala: 300, obrot: 8, skad: 'prawo',
    start: t(0, 0.42), koniec: t(1, 0.10), dokad: 'prawo' },

  { obiekt: 'alarm_clock_3d', x: 330, y: 500, skala: 470, obrot: -10, skad: 'lewo',
    start: t(2, 0.02), koniec: t(4, 0.55), dokad: 'lewo' },
  { obiekt: 'calendar_3d', x: 760, y: 560, skala: 430, obrot: 9, skad: 'prawo',
    start: t(3, 0.02), koniec: t(4, 0.55), dokad: 'prawo' },

  { obiekt: 'money_with_wings_3d', x: 540, y: 560, skala: 540, obrot: -5, skad: 'gora',
    start: t(4, 0.35), koniec: t(5, 0.15), dokad: 'gora' },

  { obiekt: 'rocket_3d', x: 350, y: 620, skala: 440, obrot: -12, skad: 'dol',
    start: t(5, 0.05), koniec: t(6, 0.50), dokad: 'lewo' },
  { obiekt: 'chart_increasing_3d', x: 760, y: 980, skala: 420, obrot: 8, skad: 'prawo',
    start: t(5, 0.30), koniec: t(6, 0.50), dokad: 'prawo' },

  { obiekt: 'envelope_3d', x: 540, y: 700, skala: 470, obrot: 0, skad: 'dol',
    start: t(6, 0.02) },
];

// ── формула ───────────────────────────────────────────────────────
// Собирается под голос: строка появляется ровно тогда, когда её произносят.
const wzor = [
  { tekst: '20 MIN', y: 980, a: t(2, 0.35), b: t(4, 0.60) },
  { tekst: '×', y: 1120, maly: true, a: t(3, 0.05), b: t(4, 0.60) },
  { tekst: '30 DNI', y: 1210, a: t(3, 0.30), b: t(4, 0.60) },
  { tekst: '= 10 GODZIN', y: 1020, kolor: 'czerwony', a: t(4, 0.30), b: t(5, 0.10) },
];

// ── камера ────────────────────────────────────────────────────────
// Медленный наезд через весь ролик и подрывы на смысловых точках: на
// результате вычисления и на призыве. Неподвижная рамка выдаёт рисунок,
// движущаяся читается как съёмка.
const kamera = [
  { t: 0, zoom: 1.00, x: 0, y: 0 },
  { t: t(1), zoom: 1.05, x: -18, y: 10 },
  { t: t(2), zoom: 1.02, x: 20, y: -12 },
  { t: t(4, 0.25), zoom: 1.12, x: 0, y: 24 },
  { t: t(4, 0.90), zoom: 1.04, x: 0, y: 0 },
  { t: t(5, 0.20), zoom: 1.08, x: 14, y: -16 },
  { t: t(6), zoom: 1.02, x: 0, y: 0 },
  { t: total, zoom: 1.10, x: 0, y: 8 },
];

// Цвет по СМЫСЛУ, а не по длине слова: жёлтый — выгода, красный — потеря.
const akcenty = {
  zolty: ['policzmy', 'zrobi', 'ciebie', 'czas', 'policzymy'],
  czerwony: ['milczenie', 'dziesięć', 'godzin', 'twoich'],
};

const obrazki = await wczytajObiekty([...new Set(scena.map((o) => o.obiekt))]);
const katKlatek = path.join(OUT, 'grafika-klatki');
await rm(katKlatek, { recursive: true, force: true });
const klatek = await renderujKlatki(
  grafikaHtml({ scena, wzor, kamera, akcenty, slowa: glos.slowa, obrazki }),
  total,
  katKlatek
);
console.log(`[grafika] отрисовано кадров: ${klatek} (${FPS} к/с)`);

// ── подложка ──────────────────────────────────────────────────────
const TLA = ['topografia-2.mp4', 'topografia-3.mp4', 'abstrakcja-3.mp4', 'gradient-2.mp4'];
const stanPlik = path.join(DIR, 'rolki', 'stan.json');
let stan = {};
try { stan = JSON.parse(await readFile(stanPlik, 'utf8')); } catch { stan = {}; }
const idxTla = ((stan.tloGrafika ?? -1) + 1) % TLA.length;
stan.tloGrafika = idxTla;

const TLO = process.env.TLO_WIDEO || path.join(DIR, 'tlo', TLA[idxTla]);
const jestTlo = existsSync(TLO);
console.log(`[grafika] фон: ${jestTlo ? path.basename(TLO) : 'нет, будет чёрный'}`);

const wideo = path.join(OUT, 'grafika-nieme.mp4');
await ffmpeg(
  jestTlo
    ? [
        '-stream_loop', '-1', '-i', TLO,
        '-framerate', String(FPS), '-i', path.join(katKlatek, 'f%05d.png'),
        '-filter_complex',
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
          `fps=${FPS},eq=brightness=-0.04:saturation=1.15[tlo];` +
          `[tlo][1:v]overlay=0:0:format=auto,format=yuv420p,setsar=1[v]`,
        '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
        '-t', String(total), wideo,
      ]
    : [
        '-framerate', String(FPS), '-i', path.join(katKlatek, 'f%05d.png'),
        '-vf', `format=yuv420p,fps=${FPS},setsar=1`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-t', String(total), wideo,
      ]
);

// ── звук движения ─────────────────────────────────────────────────
// У Захара звуковое событие раз в секунду и чаще — на каждое движение, а не
// только на влёт. Поэтому озвучиваем и приходы, и уходы, и строки формулы.
const swist = path.join(OUT, 'g-swist.wav');
const puk = path.join(OUT, 'g-puk.wav');
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.26:c=white:a=0.7:r=48000',
  '-af', 'highpass=f=380,lowpass=f=4600,afade=t=in:st=0:d=0.05,afade=t=out:st=0.06:d=0.19,' +
    'volume=0.5,aformat=channel_layouts=stereo',
  '-ac', '2', '-ar', '48000', swist,
]);
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.07:c=white:a=0.8:r=48000',
  '-f', 'lavfi', '-i', 'sine=f=180:d=0.07:r=48000',
  '-filter_complex',
  '[0:a]highpass=f=900,lowpass=f=6000,afade=t=out:st=0.004:d=0.05[s];' +
    '[1:a]volume=0.35,afade=t=out:st=0:d=0.06[t];' +
    '[s][t]amix=inputs=2:normalize=0,volume=0.42,aformat=channel_layouts=stereo[a]',
  '-map', '[a]', '-ac', '2', '-ar', '48000', puk,
]);

const zdarzenia = [
  ...scena.map((o) => ({ t: +o.start, typ: 'swist' })),
  ...scena.filter((o) => o.koniec).map((o) => ({ t: +o.koniec, typ: 'puk' })),
  ...wzor.map((w) => ({ t: +w.a, typ: 'puk' })),
].sort((a, b) => a.t - b.t);
console.log(`[grafika] звуковых событий: ${zdarzenia.length} (${(zdarzenia.length / total).toFixed(1)} на секунду)`);

const wejscia = [];
const czesci = [];
zdarzenia.forEach((z, i) => {
  wejscia.push('-i', z.typ === 'swist' ? swist : puk);
  const ms = Math.max(0, Math.round(z.t * 1000));
  czesci.push(`[${i}:a]adelay=${ms}|${ms}[s${i}]`);
});
const stuki = path.join(OUT, 'g-stuki.wav');
await ffmpeg([
  ...wejscia,
  '-filter_complex',
  czesci.join(';') + ';' + zdarzenia.map((_, i) => `[s${i}]`).join('') +
    `amix=inputs=${zdarzenia.length}:normalize=0,apad=whole_dur=${total}[a]`,
  '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', stuki,
]);

// ── музыка по кругу ───────────────────────────────────────────────
const utwory = (await readdir(path.join(DIR, 'music')).catch(() => []))
  .filter((f) => /\.mp3$/i.test(f))
  .sort();
const idxMuz = utwory.length ? ((stan.muzykaGrafika ?? -1) + 1) % utwory.length : 0;
if (utwory.length) {
  stan.muzykaGrafika = idxMuz;
  console.log(`[grafika] музыка ${idxMuz + 1} из ${utwory.length}: ${utwory[idxMuz]}`);
}
await mkdir(path.dirname(stanPlik), { recursive: true });
await writeFile(stanPlik, JSON.stringify(stan, null, 2) + String.fromCharCode(10), 'utf8');
const muzyka = path.join(DIR, 'music', utwory[idxMuz] || 'pixabay-creative-technology-showreel.mp3');

// ── сведение ──────────────────────────────────────────────────────
// Голос жмём плотнее, чем раньше. Замер по роликам Захара: у него дорожка
// идёт с динамикой LRA 2.5-3.5, у нас было 4.8. Именно эта плотность и
// читается как «дикторский» звук: ровный, близкий, без провалов.
const gotowy = path.join(OUT, 'auto-grafika-milczenie.mp4');
await ffmpeg([
  '-i', wideo, '-i', glos.plik, '-i', muzyka, '-i', stuki,
  '-f', 'lavfi', '-i', `anoisesrc=c=brown:a=0.02:r=48000:d=${total}`,
  '-filter_complex',
  `[1:a]highpass=f=85,equalizer=f=2400:t=q:w=1.2:g=2,` +
    `acompressor=threshold=-20dB:ratio=4:attack=6:release=140:makeup=3,` +
    `loudnorm=I=-15:TP=-1.5:LRA=3[voice];` +
    `[2:a]atrim=0:${total},asetpts=N/SR/TB,volume=0.11,afade=t=in:st=0:d=0.12,` +
    `afade=t=out:st=${Math.max(0, total - 1.4).toFixed(2)}:d=1.4[bed];` +
    `[voice]asplit=2[v1][duck];` +
    `[bed][duck]sidechaincompress=threshold=0.02:ratio=11:attack=10:release=170:makeup=1:level_sc=1[bedDuck];` +
    `[v1][bedDuck][3:a][4:a]amix=inputs=4:normalize=0:duration=longest,` +
    `alimiter=limit=0.95,aformat=channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-t', String(total), gotowy,
]);

const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', gotowy,
]);
const inf = JSON.parse(stdout).format;
console.log(`[grafika] собрано: ${gotowy} · ${(+inf.duration).toFixed(2)} с · ${(inf.size / 1048576).toFixed(2)} МБ`);

const kontrola = await sprawdzRolke(gotowy, { oczekiwanePrzejscia: zdarzenia.map((z) => z.t) });
console.log('[grafika] проверка:', JSON.stringify(kontrola, null, 1));
