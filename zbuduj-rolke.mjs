// Одна точка входа для расписания: выбирает ТИП рилса и зовёт его сборщик.
//
// Раньше расписание звало `rolka-auto.mjs` напрямую — поэтому в ленту
// физически не мог попасть никакой другой тип, сколько бы их ни лежало в
// репозитории. Теперь расписание зовёт этот файл, а он смотрит в реестр
// `typy-rolek.mjs`.
//
//   node zbuduj-rolke.mjs                  — следующий тип по кругу
//   node zbuduj-rolke.mjs --typ=grafika    — только рисованный
//   node zbuduj-rolke.mjs --bez-glosu      — проба, голос не тратим
//
// Всё, что этот файл не понимает, он передаёт сборщику как есть: у типов
// свои ключи (`--scenariusz=`, `--plyty`), и знать их тут незачем.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { TYPY, nastepnyTyp } from './typy-rolek.mjs';

const DIR = import.meta.dirname;
const STAN = path.join(DIR, 'rolki', 'stan.json');

const JAWNY = (process.argv.find((a) => a.startsWith('--typ=')) || '').split('=')[1] || '';
const RESZTA = process.argv.slice(2).filter((a) => !a.startsWith('--typ='));

let stan = {};
try {
  stan = JSON.parse(await readFile(STAN, 'utf8'));
} catch {
  stan = {};
}

const { typ, idx, wybrany } = nastepnyTyp(stan, JAWNY);

// Индекс двигаем ДО сборки. Если тип упадёт, завтра пойдёт следующий, а не
// тот же самый: пустой день в ленте дороже, чем нарушенная очерёдность.
if (!JAWNY) {
  stan.typRolki = idx;
  await mkdir(path.dirname(STAN), { recursive: true });
  await writeFile(STAN, JSON.stringify(stan, null, 2) + String.fromCharCode(10), 'utf8');
}

const argi = [...typ.argi(), ...RESZTA];
console.log(
  `[rolka] тип ${idx + 1} из ${TYPY.length} (${wybrany}): «${typ.klucz}» — ${typ.nazwa}` +
    `, ~${typ.minuty} мин`
);
console.log(`[rolka] запускаю: node ${typ.skrypt}${argi.length ? ' ' + argi.join(' ') : ''}`);

const kod = await new Promise((res) => {
  const p = spawn(process.execPath, [path.join(DIR, typ.skrypt), ...argi], {
    stdio: 'inherit',
    cwd: DIR,
  });
  p.on('close', res);
});

if (kod !== 0) {
  console.error(`[rolka] тип «${typ.klucz}» не собрался (код ${kod})`);
  process.exit(kod || 1);
}
