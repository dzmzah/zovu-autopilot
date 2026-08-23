// Подложка с ведущим: из банка коротких клипов собирается дорожка нужной длины.
//
// Зачем. Генератор отдаёт клипы по 8 секунд, а разговор идёт 30-40. Значит
// подложку надо склеивать. Два правила, оба выстраданы:
//
//   1. Растворение между двумя дублями ОДНОГО лица даёт двойное изображение —
//      два носа и четыре глаза на полсекунды. Только жёсткий рез.
//   2. Жёсткий рез на говорящей голове виден как дёрганье. Значит каждый рез
//      обязан быть чем-то закрыт: врезкой, которая в этот момент влетает.
//
// Поэтому модуль не просто склеивает, а ВОЗВРАЩАЕТ времена резов — сборщик
// обязан поставить на них врезки. Если не поставит, проверка заругается.
//
//   import { zbudujPodklad } from './wedacy.mjs'
//   const { plik, ciecia } = await zbudujPodklad(34.5, { kat: 'wedacy/kuba' })
import { readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function dlugosc(plik) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', plik,
  ]);
  return Number(stdout.trim());
}

/**
 * Собирает подложку не короче `sekundy`.
 *
 * @param {number} sekundy — сколько нужно
 * @param {{kat?:string, out?:string, klatki?:number}} o
 * @returns {Promise<{plik:string, ciecia:number[], zapas:number}>}
 *   `ciecia` — секунды, на которых меняется клип. На каждой обязана быть врезка.
 */
export async function zbudujPodklad(sekundy, o = {}) {
  const kat = o.kat || path.join(DIR, 'wedacy', 'kuba');
  const out = o.out || path.join(DIR, 'out', 'wedacy');
  const FPS = o.klatki || 25; // столько ждёт пересборка губ
  if (!existsSync(kat)) throw new Error(`нет банка лиц: ${kat}`);

  const pliki = (await readdir(kat)).filter((f) => f.endsWith('.mp4')).sort();
  if (!pliki.length) throw new Error(`банк лиц пуст: ${kat}`);

  await mkdir(out, { recursive: true });
  const dlugosci = [];
  for (const f of pliki) dlugosci.push(await dlugosc(path.join(kat, f)));

  // Порядок клипов: по кругу, но НЕ подряд один и тот же — иначе на резе
  // человек дёрнется в ту же позу, и это читается как заедание плёнки.
  const kolejka = [];
  let suma = 0;
  let i = 0;
  while (suma < sekundy) {
    kolejka.push(i % pliki.length);
    suma += dlugosci[i % pliki.length];
    i++;
  }
  if (kolejka.length > 1 && pliki.length === 1) {
    console.warn('[wedacy] в банке один клип — резы будут заметны, нужен второй');
  }

  // Времена резов считаем ДО склейки: сборщику они нужны, чтобы поставить
  // туда врезки.
  const ciecia = [];
  let t = 0;
  for (let k = 0; k < kolejka.length - 1; k++) {
    t += dlugosci[kolejka[k]];
    ciecia.push(+t.toFixed(3));
  }

  // Приводим к одной сетке до склейки. Разные к/с в concat дают рассинхрон,
  // который вылезает не сразу, а к третьему клипу.
  const czesci = [];
  for (let k = 0; k < kolejka.length; k++) {
    const zrodlo = path.join(kat, pliki[kolejka[k]]);
    const cel = path.join(out, `cz${String(k).padStart(2, '0')}.mp4`);
    await ffmpeg([
      '-i', zrodlo,
      '-vf', `fps=${FPS},scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280`,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', cel,
    ]);
    czesci.push(cel);
  }

  const lista = path.join(out, 'lista.txt');
  await writeFile(lista, czesci.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');

  const plik = path.join(out, 'podklad.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-t', String(sekundy), '-c', 'copy', plik]);

  for (const c of czesci) await rm(c, { force: true });
  await rm(lista, { force: true });

  const realna = await dlugosc(plik);
  console.log(
    `[wedacy] подложка ${realna.toFixed(2)} с из ${kolejka.length} клипов, ` +
      `резы на ${ciecia.map((x) => x.toFixed(1)).join(', ') || '—'}`
  );

  return { plik, ciecia: ciecia.filter((x) => x < sekundy), zapas: +(realna - sekundy).toFixed(2) };
}

/**
 * Проверка: на каждом резе стоит врезка. Без неё склейка лица видна.
 * Допуск — половина секунды в обе стороны: врезка должна прикрывать рез,
 * а не совпадать с ним до кадра.
 */
export function czyCieciaZakryte(ciecia, wstawki, dopusk = 0.5) {
  const gole = ciecia.filter(
    (c) => !wstawki.some((w) => c >= w.start - dopusk && c <= (w.koniec ?? w.start + 1) + dopusk)
  );
  return { dobrze: gole.length === 0, gole };
}
