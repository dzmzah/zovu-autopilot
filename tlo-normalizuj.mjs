// Приведение полотен к одному виду. Запускается РУКАМИ, не при каждой сборке.
//
// Зачем. Полотна пришли из разных мест и ведут себя по-разному: у одних ход
// ровный, у других дёрганье вшито в сам файл — там уже лежат повторяющиеся
// кадры, до всякой нашей обработки. Полотно выбирается по кругу, поэтому
// ролик получался «то нормально, то лагает», и починить это фильтром при
// сборке нельзя: нечего чинить, кадров просто нет.
//
// Что делает:
//   1. меряет каждое полотно — ровность хода, скорость, долю повторов;
//   2. отбраковывает то, что не проходит порог;
//   3. остальное перегоняет в 50 к/с с достройкой промежуточных кадров и
//      кладёт в `tlo/gotowe/`. Сборка потом берёт готовое как есть, без
//      замеров и множителей.
//
//   node tlo-normalizuj.mjs            — отчёт и перегон
//   node tlo-normalizuj.mjs --tylko-raport
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ff = promisify(execFile);
const DIR = import.meta.dirname;
const ZRODLA = path.join(DIR, 'tlo');
const GOTOWE = path.join(ZRODLA, 'gotowe');
const TYLKO_RAPORT = process.argv.includes('--tylko-raport');

// Пороги. Взяты не с потолка: «topografia-3» — полотно, на котором собран
// «Scenariusz 1» Захара и к которому претензий не было, у неё 0.50 и 19 %.
// Ставим чуть свободнее, чтобы она проходила с запасом.
const PROG_NIEROWNOSCI = 0.60;
const PROG_POWTOROW = 25;
// Скорость, к которой приводим. Слишком медленное полотно Захар сразу
// назвал неестественным, слишком быстрое — «лагающим»; 1.9 это та же
// «topografia-3».
const CEL_RUCHU = 1.9;
// Полотна должны идти ОДИНАКОВО, иначе разнобой между роликами возвращается
// с другой стороны: «topografia-2» при скорости 0.77 выглядит стоячей рядом
// с «kropki-jasne» на 1.93. Полоса узкая нарочно — лучше два ровных полотна,
// чем пять разных.
const PASMO_RUCHU = [1.2, 3.5];

const FPS = 50;
const SZER = 1210, WYS = 2150; // с запасом на дрейф, как в сборщике

/** Ровность хода, скорость и доля повторов. Одним проходом. */
async function zmierz(plik) {
  const { stdout } = await ff('ffmpeg', [
    '-hide_banner', '-nostats', '-i', plik, '-t', '8',
    '-vf', 'scale=320:-2,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
    '-f', 'null', '-',
  ], { maxBuffer: 64 * 1024 * 1024 });
  const v = [...stdout.matchAll(/YAVG=([\d.]+)/g)].map((m) => +m[1]);
  if (!v.length) throw new Error('замер пустой');
  const sr = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - sr) ** 2, 0) / v.length);
  const powt = (v.filter((x) => x < sr * 0.15).length * 100) / v.length;
  return { nierownosc: sr ? sd / sr : 0, ruch: sr, powtorow: powt };
}

const pliki = (await readdir(ZRODLA)).filter((f) => f.endsWith('.mp4'));
const raport = [];

for (const f of pliki) {
  const p = path.join(ZRODLA, f);
  let m;
  try {
    m = await zmierz(p);
  } catch (e) {
    raport.push({ plik: f, wynik: 'не замерилось: ' + e.message });
    continue;
  }
  const zle = [];
  if (m.nierownosc > PROG_NIEROWNOSCI) zle.push(`ход неровный ${m.nierownosc.toFixed(2)}`);
  if (m.powtorow > PROG_POWTOROW) zle.push(`повторов ${Math.round(m.powtorow)} %`);
  if (m.ruch < PASMO_RUCHU[0]) zle.push(`почти стоит ${m.ruch.toFixed(2)}`);
  if (m.ruch > PASMO_RUCHU[1]) zle.push(`слишком быстрое ${m.ruch.toFixed(2)}`);

  if (zle.length) {
    raport.push({ plik: f, ...m, wynik: 'ОТБРАКОВАНО: ' + zle.join(', ') });
    continue;
  }

  // Замедление целым числом и только когда полотно заметно быстрее цели.
  const mnoznik = Math.min(3, Math.max(1, Math.round(m.ruch / CEL_RUCHU)));
  raport.push({ plik: f, ...m, mnoznik, wynik: 'взято' });

  if (TYLKO_RAPORT) continue;
  await mkdir(GOTOWE, { recursive: true });
  await ff('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', p,
    '-vf',
    `setpts=${mnoznik}*PTS,minterpolate=fps=${FPS}:mi_mode=blend,` +
      `scale=${SZER}:${WYS}:force_original_aspect_ratio=increase,crop=${SZER}:${WYS}`,
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    path.join(GOTOWE, f),
  ], { maxBuffer: 64 * 1024 * 1024 });
}

console.log('\nПОЛОТНА\n');
for (const r of raport) {
  const cyfry = r.ruch !== undefined
    ? `ход ${r.nierownosc.toFixed(2)} · скорость ${r.ruch.toFixed(2)} · повторов ${Math.round(r.powtorow)} %`
    : '';
  console.log(`  ${r.plik.padEnd(24)} ${cyfry.padEnd(48)} ${r.wynik}${r.mnoznik > 1 ? ` (замедлено ×${r.mnoznik})` : ''}`);
}
const wziete = raport.filter((r) => r.wynik === 'взято');
console.log(`\nвзято ${wziete.length} из ${raport.length}`);

if (!TYLKO_RAPORT && wziete.length) {
  console.log('\nпроверяю, что вышло:');
  for (const r of wziete) {
    const m = await zmierz(path.join(GOTOWE, r.plik));
    console.log(
      `  ${r.plik.padEnd(24)} ход ${m.nierownosc.toFixed(2)} · скорость ${m.ruch.toFixed(2)} · повторов ${Math.round(m.powtorow)} %`
    );
  }
  await writeFile(
    path.join(GOTOWE, 'SKAD.md'),
    '# Готовые полотна\n\nСобраны `tlo-normalizuj.mjs` из `tlo/*.mp4`: отбор по ровности хода и\n' +
      'доле повторяющихся кадров, приведение к 50 к/с с достройкой промежуточных.\n' +
      'Сборщик берёт их как есть — никаких замеров и множителей при сборке.\n\n' +
      'Пересобрать: `node tlo-normalizuj.mjs`\n',
    'utf8'
  );
}
