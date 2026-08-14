// Переносит собранные рилсы из `out/` в очередь на выкладку.
//
// Отдельный шаг, а не часть сборки, специально: рилс, который не прошёл
// проверку замерами, до этого шага не доходит. Значит в очередь физически
// не может попасть ролик с рывком или провалом звука.
//
// Время публикации считается с запасом в два дня — если сборка сломается,
// лента не опустеет: к моменту выкладки ролик уже двое суток как готов.
//
//   node do-kolejki.mjs --za-dni=2
//   node do-kolejki.mjs --za-dni=2 --godzina=13
import { readFile, writeFile, readdir, copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');
const ROLKI = path.join(DIR, 'rolki');
const KOLEJKA = path.join(ROLKI, 'kolejka.json');

const arg = (n, d) => {
  const v = (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
  return v === undefined || v === '' ? d : v;
};

const ZA_DNI = +arg('za-dni', 2);
// Слоты выкладки. Первый рилс дня идёт в первый слот, второй — во второй.
const SLOTY = String(arg('sloty', '13,19')).split(',').map((s) => +s.trim());

await mkdir(ROLKI, { recursive: true });

let kolejka = [];
try {
  kolejka = JSON.parse(await readFile(KOLEJKA, 'utf8'));
} catch {
  kolejka = [];
}

const juzWKolejce = new Set(kolejka.map((p) => p.plik));
// Какие сценарии уже ждут выкладки. Повтор ловим по ИСТОЧНИКУ, а не по имени
// файла в очереди: имя всегда новое, а мысль в ролике та же самая, и два дня
// подряд одно и то же — это ровно то, за что Захар зацепился на первом же
// автоматическом ролике.
const juzCzeka = new Set(kolejka.filter((p) => !p.opublikowano && p.zrodlo).map((p) => p.zrodlo));

// Берём только автоматические сборки и только те, что ещё не в очереди.
const pliki = (await readdir(OUT).catch(() => []))
  .filter((f) => /^auto-.*\.mp4$/.test(f))
  .sort();

if (!pliki.length) {
  console.log('[kolejka] в out/ нет собранных рилсов');
  process.exit(0);
}

// Считаем, на какие сутки ставим: берём максимум уже занятого и идём дальше,
// чтобы повторный прогон не положил два ролика на одно время.
const zajete = new Set(kolejka.filter((p) => !p.opublikowano).map((p) => p.kiedy));

let dodane = 0;
for (const [i, f] of pliki.entries()) {
  // Имя должно быть свободным, а не «сегодняшним». Раньше вторая сборка за
  // сутки получала имя первой, натыкалась на занятое и МОЛЧА выбрасывалась:
  // ролик собран, проверку прошёл, а в очередь не попал. Именно на этом
  // сломалось самовосстановление — сторож честно запускал сборку, а её
  // результат исчезал без единой строчки в логе.
  const baza = `auto-${new Date().toISOString().slice(0, 10)}-${i + 1}`;
  let nazwa = `${baza}.mp4`;
  for (let n = 2; juzWKolejce.has(nazwa); n++) nazwa = `${baza}-${n}.mp4`;

  // А вот повтор СМЫСЛА пропускаем осознанно и вслух.
  if (juzCzeka.has(f)) {
    console.log(`[kolejka] ${f} уже ждёт выкладки — второй раз ту же мысль не ставлю`);
    continue;
  }

  // Ищем ПЕРВЫЙ СВОБОДНЫЙ слот начиная с целевого дня, а не проверяем один.
  // Раньше занятый слот означал «пропускаю»: 14.08 сборка сделала ролик,
  // упёрлась в 16.08 (там уже стоял поставленный руками) и молча его
  // выбросила. Ролик собран, проверку прошёл, озвучка оплачена — и в мусор,
  // без единой строчки тревоги. Очередь на два дня вперёд по определению
  // сталкивается с ручными вставками, значит она обязана уметь подвинуться.
  //
  // Слот у ролика СВОЙ по счёту в этой сборке: первый ролик дня идёт в
  // первый слот, второй во второй. Перебирать все слоты одного дня нельзя —
  // тогда один ролик, наткнувшись на занятый день, вставал бы вторым в тот
  // же день вместо свободного следующего. Ищем тот же час, но дальше.
  const godz = SLOTY[i % SLOTY.length];
  let kiedy = null;
  for (let plus = 0; plus < 10 && !kiedy; plus++) {
    const d = new Date();
    d.setDate(d.getDate() + ZA_DNI + plus);
    const kandydat = `${d.toISOString().slice(0, 10)}T${String(godz).padStart(2, '0')}:00:00+02:00`;
    if (!zajete.has(kandydat)) kiedy = kandydat;
  }
  if (!kiedy) {
    console.log(`[kolejka] свободного слота на десять дней вперёд нет — ${nazwa} оставляю в out/`);
    continue;
  }

  await copyFile(path.join(OUT, f), path.join(ROLKI, nazwa));

  const opis = await readFile(path.join(OUT, f.replace(/\.mp4$/, '-opis.txt')), 'utf8').catch(
    () => null
  );

  // Паспорт ролика кладём в очередь вместе с ним. Сбор цифр потом сложит
  // показатели с тем, ЧЕМ ролик был: цифра без этого не отвечает ни на один
  // вопрос — «охват 800» много или мало зависит от формы, длины и темы.
  const meta = await readFile(path.join(OUT, f.replace(/\.mp4$/, '-meta.json')), 'utf8')
    .then((t) => JSON.parse(t))
    .catch(() => null);

  kolejka.push({
    plik: nazwa,
    kiedy,
    sieci: ['ig', 'fb'],
    tekst: opis || 'Robimy treści, które sprzedają.\n\nzovu.pl',
    opublikowano: null,
    zrodlo: f,
    ...(meta
      ? {
          scenariusz: meta.scenariusz,
          forma: meta.forma,
          temat: meta.temat,
          dlugosc: meta.dlugosc,
          planow: meta.planow,
          tempo: meta.tempo,
        }
      : {}),
  });
  zajete.add(kiedy);
  dodane++;
  console.log(`[kolejka] ${nazwa} → ${kiedy}`);
}

if (!dodane) {
  console.log('[kolejka] нечего добавлять');
  process.exit(0);
}

await writeFile(KOLEJKA, JSON.stringify(kolejka, null, 2) + '\n', 'utf8');
console.log(`[kolejka] добавлено: ${dodane}`);
