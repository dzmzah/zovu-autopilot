// Синтез речи для рилсов без ведущего — локально, бесплатно, офлайн.
//
// Устройство. Фразы озвучиваются ПО ОДНОЙ и склеиваются с паузами. Это даёт
// две вещи разом:
//   1. точные границы каждой фразы — мы их не угадываем, а задаём;
//   2. управляемый ритм — пауза между фразами это и есть темп ролика.
//
// Почему не расшифровывать собственный синтез. Пробовали: whisper на польском
// слышит «czy powody» вместо «Trzy powody», а на серверах GitHub большой
// модели нет вовсе — маленькая ломает текст сильнее. Мы САМИ произнесли эти
// слова, знать их со стороны незачем.
//
// Слова внутри фразы раскладываются по длине с поправкой на то, что пробелы
// и знаки препинания времени почти не занимают. Фраза короткая (2–4 слова),
// поэтому ошибка внутри неё — сотые доли секунды, глазом не ловится. Ровно
// эта раскладка на ЦЕЛОМ клипе давала «огрызки», а на короткой фразе она
// точна, потому что границы фразы жёсткие.
//
//   node glos.mjs "Pierwsza fraza." "Druga fraza." — проверка
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;

// На сервере модель кладётся в кэш и путь приходит переменной; на машине
// лежит рядом с проектом. Хардкод одного пути ломал бы то или другое.
export const MODEL_PL =
  process.env.PIPER_MODEL ||
  path.join('D:', 'My AI', 'Zovu.pl', 'Awatar', '09_Glos', 'modele', 'pl_PL-darkman-medium.onnx');

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

// Piper зовём через python: пакет ставится одной строкой и одинаково работает
// на машине и на сервере GitHub, в отличие от сборок под конкретную ОС.
async function powiedz(tekst, wyjscie, model) {
  const skrypt = `
import sys, wave
from piper import PiperVoice
v = PiperVoice.load(sys.argv[1])
with wave.open(sys.argv[3], 'wb') as w:
    v.synthesize_wav(sys.argv[2], w)
`;
  await execFileAsync('python', ['-c', skrypt, model, tekst, wyjscie], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

// Где во фразе начинается и кончается речь. Нужно, чтобы обрезать тишину,
// которую Piper оставляет по краям, и не растянуть паузы между фразами.
async function granicaMowy(plik) {
  const calosc = await trwanie(plik);
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', plik, '-af', 'silencedetect=n=-45dB:d=0.06', '-f', 'null', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const starty = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => +m[1]);
  const konce = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => +m[1]);

  // Тишина в самом начале — только если она начинается с нуля.
  let od = 0;
  if (starty.length && starty[0] < 0.02 && konce.length) od = Math.max(0, konce[0] - 0.03);
  // Тишина в конце — та, у которой нет пары `silence_end`.
  let doo = calosc;
  if (starty.length > konce.length) doo = Math.min(calosc, starty[starty.length - 1] + 0.06);
  else if (starty.length && starty[starty.length - 1] > doo - 0.5 && konce.length < starty.length)
    doo = Math.min(calosc, starty[starty.length - 1] + 0.06);

  if (doo - od < 0.15) return [0, calosc];
  return [od, doo];
}

// Слова фразы по времени. Веса — длина слова в буквах: короткие служебные
// («o», «a», «to») звучат заметно быстрее знаменательных, и равномерная
// сетка уводила бы подпись вперёд на них.
function rozlozSlowa(tekst, od, doo) {
  const slowa = String(tekst).trim().split(/\s+/).filter(Boolean);
  if (!slowa.length) return [];
  const wagi = slowa.map((s) => Math.max(1.6, s.replace(/[^\p{L}\p{N}]/gu, '').length));
  const suma = wagi.reduce((a, b) => a + b, 0);
  const dlugosc = doo - od;
  let t = od;
  return slowa.map((s, i) => {
    const d = (dlugosc * wagi[i]) / suma;
    const w = { tekst: s, a: +t.toFixed(3), b: +(t + d).toFixed(3) };
    t += d;
    return w;
  });
}

/**
 * Озвучивает список фраз и отдаёт готовую дорожку с таймингами.
 * @param {Array<{tekst:string, pauza?:number}>} frazy — pauza в секундах ПОСЛЕ фразы
 */
export async function zbudujGlos(frazy, { model = MODEL_PL, tmp, przedPierwsza = 0.25 } = {}) {
  const kat = tmp || path.join(DIR, 'out', 'glos-tmp');
  await mkdir(kat, { recursive: true });

  const czesci = [];
  const meta = [];
  let czas = przedPierwsza;

  for (let i = 0; i < frazy.length; i++) {
    const f = frazy[i];
    const surowy = path.join(kat, `f${i}-raw.wav`);
    const gotowy = path.join(kat, `f${i}.wav`);
    await powiedz(f.tekst, surowy, model);

    // Края подрезаем ПО ЗАМЕРУ, а не фильтром `silenceremove`: тот убирает
    // тишину и внутри фразы тоже — «Twoje posty nie sprzedają?» усыхало с
    // 1.58 до 0.60 секунды, речь превращалась в скороговорку.
    const [poczatek, koniec] = await granicaMowy(surowy);
    await ffmpeg([
      '-ss', poczatek.toFixed(3), '-to', koniec.toFixed(3), '-i', surowy,
      '-af', 'aformat=channel_layouts=stereo,aresample=48000',
      '-c:a', 'pcm_s16le', gotowy,
    ]);

    const d = await trwanie(gotowy);
    meta.push({ tekst: f.tekst, a: +czas.toFixed(3), b: +(czas + d).toFixed(3), rola: f.rola || null });
    czesci.push({ plik: gotowy, dlugosc: d, pauza: f.pauza ?? 0.22 });
    czas += d + (f.pauza ?? 0.22);
  }

  // Собираем одной командой: каждая фраза сдвигается на своё посчитанное
  // начало, дальше всё смешивается. Так тайминги в метаданных и в звуке —
  // одни и те же числа, разъехаться нечему.
  const wejscia = [];
  czesci.forEach((c) => wejscia.push('-i', c.plik));

  const filtry2 = czesci.map((c, i) => {
    const ms = Math.round(meta[i].a * 1000);
    return `[${i}:a]adelay=${ms}|${ms}[s${i}]`;
  });
  const mix =
    czesci.map((_, i) => `[s${i}]`).join('') +
    `amix=inputs=${czesci.length}:normalize=0:duration=longest[a]`;

  const plik = path.join(kat, 'glos.wav');
  await ffmpeg([
    ...wejscia,
    '-filter_complex', filtry2.join(';') + ';' + mix,
    '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    plik,
  ]);

  const slowa = meta.flatMap((m) => rozlozSlowa(m.tekst, m.a, m.b));
  const dlugoscCala = +(await trwanie(plik)).toFixed(3);

  return { plik, frazy: meta, slowa, dlugosc: dlugoscCala };
}

if (process.argv[1] && process.argv[1].endsWith('glos.mjs')) {
  const teksty = process.argv.slice(2);
  if (!teksty.length) {
    console.error('node glos.mjs "Fraza pierwsza." "Fraza druga."');
    process.exit(1);
  }
  const r = await zbudujGlos(teksty.map((t) => ({ tekst: t })));
  console.log(JSON.stringify({ plik: r.plik, dlugosc: r.dlugosc, frazy: r.frazy, slow: r.slowa.length }, null, 1));
}
