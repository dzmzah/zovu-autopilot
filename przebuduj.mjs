// Пересборка роликов, которые уже ждут в очереди, — с тем же сценарием,
// тем же временем выхода и тем же текстом поста, но новым монтажом.
//
// 20.10.2026: режиссёр включён, а в очереди на три дня вперёд лежали ролики
// старого монтажа. Без пересборки новый стиль пошёл бы только через четыре дня.
//
//   node przebuduj.mjs auto-2026-10-19-1.mp4 auto-2026-10-19-1-2.mp4
//
// Опубликованное не трогаем. Не вышло за три попытки — старый файл остаётся.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const DIR = import.meta.dirname;
const KOLEJKA = path.join(DIR, 'rolki', 'kolejka.json');
let zmienione = 0;

for (const plik of process.argv.slice(2)) {
  const kolejka = JSON.parse(await readFile(KOLEJKA, 'utf8'));
  const poz = kolejka.find((p) => p.plik === plik);
  if (!poz) { console.log(`::warning::${plik}: нет в очереди`); continue; }
  if (poz.opublikowano) { console.log(`::warning::${plik}: уже вышел — не трогаю`); continue; }
  if (!poz.scenariusz) { console.log(`::warning::${plik}: в очереди нет имени сценария`); continue; }

  let ok = false;
  for (let proba = 1; proba <= 3 && !ok; proba++) {
    console.log(`::group::${plik} ← ${poz.scenariusz}, попытка ${proba}`);
    const r = spawnSync(process.execPath, [path.join(DIR, 'rolka-auto.mjs'), `--scenariusz=${poz.scenariusz}`], {
      stdio: 'inherit',
      cwd: DIR,
    });
    console.log('::endgroup::');
    ok = r.status === 0;
  }
  if (!ok) { console.log(`::warning::${plik}: не собрался — остаётся старый`); continue; }

  const baza = path.join(DIR, 'out', `auto-${poz.scenariusz}`);
  await copyFile(baza + '.mp4', path.join(DIR, 'rolki', plik));
  const meta = JSON.parse(await readFile(baza + '-meta.json', 'utf8'));
  // Перечитываем очередь: сборка могла в ней что-то поменять.
  const swieza = JSON.parse(await readFile(KOLEJKA, 'utf8'));
  const p = swieza.find((x) => x.plik === plik);
  Object.assign(p, { dlugosc: meta.dlugosc, planow: meta.planow, tempo: meta.tempo, montaz: meta.montaz });
  await writeFile(KOLEJKA, JSON.stringify(swieza, null, 2) + '\n', 'utf8');
  zmienione++;
  console.log(`[przebuduj] ${plik}: ${JSON.stringify(meta.montaz)}`);
}
console.log(`[przebuduj] заменено: ${zmienione}`);
