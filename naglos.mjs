// Наложение закадрового голоса на ГОТОВЫЙ ролик — версия для сравнения.
//
// Зачем отдельный скрипт, а не флаг в сборщике. Ролики автошкол уже собраны,
// проверены замерами и отданы клиентам. Пересобирать их ради пробы голоса
// значит рисковать картинкой, которую Захар уже принял («анимация текста —
// прям очень заходит»). Здесь картинка не трогается вообще: `-c:v copy`.
//
// Голос синтезируется только ElevenLabs — ключ живёт в секретах GitHub, на
// машине его нет. Локальный запуск упадёт с понятной ошибкой, и это нарочно:
// тихая подмена на Piper уже один раз стоила нам часа правки не той причины.
//
//   node naglos.mjs --wideo=OSK100_wrzesien.mp4 --wyjscie=OSK100_glos.mp4
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { zbudujGlos } from './glos.mjs';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.slice(n.length + 3) : d;
};

const WIDEO = path.resolve(arg('wideo', path.join(DIR, 'proba-glosu', 'OSK100_wrzesien.mp4')));
const WYJSCIE = path.resolve(arg('wyjscie', path.join(DIR, 'out', 'OSK100_z_glosem.mp4')));

// Текст под хореографию ролика (rolka-autoszkola.mjs, объект T):
//   0.10-1.92 крючок · 1.98-8.78 ось · 9.06-11.62 пакет · 11.98-15.0 финал
//
// Голос НЕ читает подписи вслух — на экране и так всё написано, дубляж усыпляет.
// Он добавляет то, чего в кадре нет: смысл цифр и причину торопиться.
//
// Точка внутри фразы — единственное, что лечит торопливость дубля (проверено
// тремя дублями подряд). Поэтому короткие предложения, а не длинные периоды.
const FRAZY = [
  { tekst: 'Wrzesień. Czy marzec?',                      rola: 'hak',     pauza: 0.30 },
  { tekst: 'Kiedy zaczniesz, wtedy zdasz.',              rola: 'hak',     pauza: 0.45 },
  { tekst: 'Trzydzieści godzin teorii. Trzydzieści jazd.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Egzaminy wewnętrzne. Bez dopłaty.',          rola: 'tresc',   pauza: 0.45 },
  { tekst: 'W pakiecie symulator i pierwsza pomoc.',     rola: 'tresc',   pauza: 0.40 },
  { tekst: 'Kursy startują we wrześniu.',                rola: 'cta' },
];

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function trwanie(plik) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', plik,
  ]);
  return parseFloat(stdout.trim());
}

const tmp = path.join(DIR, 'out', 'naglos-tmp');
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await mkdir(path.dirname(WYJSCIE), { recursive: true });

const T = await trwanie(WIDEO);
console.log(`[naglos] ролик: ${path.basename(WIDEO)} · ${T.toFixed(2)} с`);

const glos = await zbudujGlos(FRAZY, { tmp, przedPierwsza: 0.25 });
console.log(`[naglos] речь до ${glos.dlugosc.toFixed(2)} с из ${T.toFixed(2)}`);
for (const f of glos.frazy) console.log(`   ${f.a.toFixed(2)}-${f.b.toFixed(2)}  ${f.tekst}`);
if (glos.dlugosc > T - 0.15) {
  console.warn('[naglos] ВНИМАНИЕ: речь не помещается в ролик — последняя фраза обрежется');
}

// Сведение. Подложка здесь — не музыка, а ГОТОВАЯ дорожка ролика: музыка плюс
// щелчки на посадку элементов. Под голосом её убирает боковая цепь.
//
// `apad` на ключе обязателен: sidechaincompress выдаёт столько, сколько идёт
// КОРОЧЕ из двух входов, и без padding музыка обрывалась ровно там, где
// кончается речь. Этот мёртвый хвост уже был во всех наших роликах.
await ffmpeg([
  '-i', WIDEO, '-i', glos.plik,
  '-filter_complex',
  `[1:a]aresample=48000,asplit=2[v0][k0];` +
    // −14.5 LUFS — уровень речи, который Захар слушал и утвердил.
    `[v0]loudnorm=I=-14.5:TP=-1.5:LRA=9,apad=whole_dur=${T.toFixed(3)}[voice];` +
    `[k0]apad=whole_dur=${T.toFixed(3)}[duck];` +
    // 0.62 вместо исходной единицы: дорожка ролика собиралась под НЕМОЙ
    // формат, где музыка держит весь ритм. Под голосом ей столько не нужно.
    `[0:a]volume=0.62,apad=whole_dur=${T.toFixed(3)}[bed];` +
    `[bed][duck]sidechaincompress=threshold=0.08:ratio=6:attack=12:` +
    `release=350:makeup=1:level_sc=1[bedDuck];` +
    `[voice][bedDuck]amix=inputs=2:normalize=0:duration=longest,` +
    `alimiter=limit=0.9,aformat=channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-t', String(T), WYJSCIE,
]);

const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', WYJSCIE,
]);
const inf = JSON.parse(stdout).format;
console.log(
  `[naglos] готово: ${WYJSCIE} · ${(+inf.duration).toFixed(2)} с · ` +
    `${(inf.size / 1048576).toFixed(2)} МБ`
);
