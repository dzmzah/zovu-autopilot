// Первый шаг ролика с ведущим: голос и подложка из банка лиц.
//
// Разделено на два шага не от хорошей жизни. Пересборка губ — это python и
// полчаса счёта на процессоре; держать её внутри сборщика значит каждый раз
// тянуть за собой всё окружение. Поэтому:
//
//   1. сюда  — голос и склеенная подложка (узел этот, быстрый);
//   2. потом — пересборка губ (python, отдельный шаг воркфлоу);
//   3. потом — `rolka-grafika.mjs --podklad=<готовый файл>` соберёт ролик.
//
// Времена резов между клипами кладутся рядом файлом: сборщику они нужны,
// чтобы поставить на них врезки, иначе склейка лица видна.
//
//   node przygotuj-wedacego.mjs --scenariusz=nie-potrzebujesz
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { zbudujGlos } from './glos.mjs';
import { zbudujPodklad } from './wedacy.mjs';
import { wybierzWedacego } from './scenariusze-wedacy.mjs';

const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out', 'wedacy');
const KLUCZ = (process.argv.find((a) => a.startsWith('--scenariusz=')) || '').split('=')[1] || '';
const FPS = 25; // столько ждёт пересборка губ

const scen = wybierzWedacego(KLUCZ);
console.log(`[wedacy] сценарий «${scen.klucz}»: ${scen.nazwa}`);

await mkdir(OUT, { recursive: true });

const glos = await zbudujGlos(scen.frazy, {
  tmp: path.join(OUT, 'glos'),
  przedPierwsza: 0.45,
});
console.log(`[wedacy] голос ${glos.dlugosc.toFixed(2)} с, слов ${glos.slowa.length}`);

// Ролик чуть длиннее речи: полсекунды на то, чтобы последнее слово не
// обрывалось монтажным стыком.
const total = +(glos.dlugosc + 0.5).toFixed(2);

// Длина под подложку берётся с запасом: пересборка губ иногда отдаёт файл
// на кадр-другой короче, и если подложка ровно по длине речи, хвост
// оказывается чёрным.
const podklad = await zbudujPodklad(total + 0.5, { klatki: FPS });

const glosPlik = path.join(OUT, 'glos.wav');
await writeFile(path.join(OUT, 'podklad-ciecia.json'), JSON.stringify(podklad.ciecia), 'utf8');
// Голос сохраняем ЦЕЛИКОМ: фразы, слова, длительность. Иначе сборщик
// синтезирует новый дубль — а он всегда чуть другой, и губы, собранные под
// первый, разойдутся со звуком. Плюс второй дубль это второй расход лимита.
await writeFile(
  path.join(OUT, 'glos.json'),
  JSON.stringify({ frazy: glos.frazy, slowa: glos.slowa, dlugosc: glos.dlugosc }, null, 2),
  'utf8'
);
await writeFile(
  path.join(OUT, 'plan.json'),
  JSON.stringify(
    { scenariusz: scen.klucz, total, dlugoscGlosu: glos.dlugosc, ciecia: podklad.ciecia },
    null,
    2
  ),
  'utf8'
);

// Голос кладём рядом под понятным именем: следующему шагу нужен он и подложка.
const { copyFile } = await import('node:fs/promises');
await copyFile(glos.plik, glosPlik);

console.log(`[wedacy] готово: ${path.basename(podklad.plik)} + ${path.basename(glosPlik)}`);
console.log(`[wedacy] ролик будет ${total} с, резов ${podklad.ciecia.length}`);
