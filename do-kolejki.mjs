// Переносит собранные рилсы из `out/` в очередь на выкладку.
//
// Отдельный шаг, а не часть сборки, специально: рилс, который не прошёл
// проверку замерами, до этого шага не доходит. Значит в очередь физически
// не может попасть ролик с рывком или провалом звука.
//
// Время публикации считается с запасом в два дня — если сборка сломается,
// лента не опустеет: к моменту выкладки ролик уже двое суток как готов.
//
// Час выхода подбирается сам: пока цифр мало — перебор кандидатов, дальше
// лучший по охвату (см. `wybierzGodziny`). Руками перебивается `--sloty`.
//
//   node do-kolejki.mjs --za-dni=2
//   node do-kolejki.mjs --za-dni=2 --sloty=13,19        — поставить жёстко
//   node do-kolejki.mjs --godziny=11,13,18,20           — что перебирать
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
// Заданные руками слоты выигрывают у подбора: ручная вставка — это всегда
// осознанное решение человека, и перебивать его автоматикой нельзя.
const SLOTY_JAWNE = arg('sloty', '') === '' ? null
  : String(arg('sloty', '')).split(',').map((s) => +s.trim());
// Часы, которые проверяем. Пять роликов подряд вышли в 13:00, и сводка
// «средний охват по часу выхода» показывала ровно одну строку — сравнивать
// было не с чем. Час выхода при охвате 11 решает больше, чем монтаж:
// попасть в момент, когда владелец фирмы держит телефон, важнее лишней
// склейки. Поэтому час перебираем сознательно, пока не наберутся цифры.
const KANDYDACI = String(arg('godziny', '11,13,18,20')).split(',').map((s) => +s.trim());
// Сколько зрелых роликов в часе нужно, чтобы верить его среднему.
const PROG_UFNOSCI = 3;
// Возраст, с которого охват можно сравнивать. Инстаграм досыпает показы
// вторые сутки: ролик, замеренный через 20 часов, всегда выглядит хуже
// недельного — и тянет свой час вниз ни за что.
const DOJRZALOSC_H = 36;
// Час, который набрал меньше этой доли от лучшего, выбывает из перебора.
// Разница 26 против 3 — это не шум, продолжать её проверять значит жечь
// ролики на слоте, про который уже всё понятно.
const PROG_SMIERCI = 0.4;
// Одна разведка на столько постановок в очередь.
const CO_ILE_ROZPOZNANIE = 5;

await mkdir(ROLKI, { recursive: true });

let kolejka = [];
try {
  kolejka = JSON.parse(await readFile(KOLEJKA, 'utf8'));
} catch {
  kolejka = [];
}

// ── выбор часа выхода ─────────────────────────────────────────────
// Правило простое и намеренно неполное: пока про час ничего не известно,
// перебираем кандидатов по кругу; как только у какого-то часа набралось
// достаточно роликов и он лучший — ставим туда два раза из трёх, а треть
// оставляем на разведку.
//
// Треть на разведку — не перестраховка. Аккаунт растёт, аудитория меняется,
// и «лучший час», выбранный на пяти роликах, через месяц может оказаться
// вчерашним. Полностью прекратить проверку — значит закрепить случайность
// первых замеров навсегда.
async function wybierzGodziny(kolejka) {
  let wyniki = [];
  try {
    wyniki = JSON.parse(await readFile(path.join(ROLKI, 'wyniki.json'), 'utf8'));
  } catch {
    wyniki = [];
  }

  const poGodzinie = new Map();
  let mlodych = 0;
  for (const w of wyniki) {
    const g = w.godzina;
    const z = w.dane?.reach;
    if (g == null || z == null) continue;
    const wiek = (new Date(w.zebrane) - new Date(w.opublikowano)) / 36e5;
    if (!Number.isFinite(wiek) || wiek < DOJRZALOSC_H) { mlodych++; continue; }
    if (!poGodzinie.has(g)) poGodzinie.set(g, []);
    poGodzinie.get(g).push(z);
  }
  if (mlodych) console.log(`[kolejka] ${mlodych} роликов моложе ${DOJRZALOSC_H} ч — в сравнение не беру`);

  const srednie = [...poGodzinie.entries()]
    .map(([g, xs]) => [+g, xs.reduce((a, b) => a + b, 0) / xs.length, xs.length])
    .sort((a, b) => b[1] - a[1]);

  // Лучший — первый час, который набрал достаточно зрелых роликов. Требовать
  // при этом ДВА таких часа нельзя: второй час набирает цифры только если
  // туда ставить ролики, а ставить их некуда, пока нет лучшего. Круг
  // замыкался, и перебор шёл вслепую бесконечно.
  const najlepszy = srednie.find((s) => s[2] >= PROG_UFNOSCI) || null;

  // Часы, по которым уже видно, что там пусто, из перебора выбывают.
  let krag = [...KANDYDACI];
  if (najlepszy) {
    const martwe = srednie
      .filter((s) => s[0] !== najlepszy[0] && s[2] >= 2 && s[1] < najlepszy[1] * PROG_SMIERCI)
      .map((s) => s[0]);
    if (martwe.length) {
      console.log(`[kolejka] выбывают из перебора: ${martwe.map((g) => g + ':00').join(', ')} — охват ниже ${Math.round(PROG_SMIERCI * 100)}% от лучшего`);
      krag = krag.filter((g) => !martwe.includes(g));
    }
  }

  const licznik = kolejka.length;
  if (najlepszy && licznik % CO_ILE_ROZPOZNANIE !== CO_ILE_ROZPOZNANIE - 1) {
    console.log(
      `[kolejka] лучший час ${najlepszy[0]}:00 — охват ${Math.round(najlepszy[1])} на ${najlepszy[2]} зрелых роликах`
    );
    return [najlepszy[0], ...krag.filter((g) => g !== najlepszy[0])];
  }

  // Разведка. Проверяем не «следующий по кругу», а САМЫЙ непроверенный час:
  // круг раздавал слоты поровну и тем, про кого уже всё ясно.
  const ile = (g) => (poGodzinie.get(g) || []).length;
  const reszta = krag.filter((g) => !najlepszy || g !== najlepszy[0]);
  reszta.sort((a, b) => ile(a) - ile(b) || a - b);
  const kolejnosc = reszta.length ? [...reszta, ...krag.filter((g) => !reszta.includes(g))]
    : [...krag.slice(licznik % krag.length), ...krag.slice(0, licznik % krag.length)];
  console.log(
    najlepszy
      ? `[kolejka] разведка: беру ${kolejnosc[0]}:00 вместо лучшего ${najlepszy[0]}:00 (зрелых роликов там ${ile(kolejnosc[0])})`
      : `[kolejka] зрелых цифр по часам мало — перебираю: ${kolejnosc.join(', ')}`
  );
  return kolejnosc;
}

const GODZINY = SLOTY_JAWNE || (await wybierzGodziny(kolejka));

const juzWKolejce = new Set(kolejka.map((p) => p.plik));
// Какие сценарии уже ждут выкладки. Повтор ловим по ИСТОЧНИКУ, а не по имени
// файла в очереди: имя всегда новое, а мысль в ролике та же самая, и два дня
// подряд одно и то же — это ровно то, за что Захар зацепился на первом же
// автоматическом ролике.
const juzCzeka = new Set(kolejka.filter((p) => !p.opublikowano && p.zrodlo).map((p) => p.zrodlo));

// Берём только автоматические сборки и только те, что ещё не в очереди.
//
// Две вещи маска `auto-*` захватывала зря, и обе выложились бы в ленту сами:
//
//   · `-proba` — пробы картинки БЕЗ ОЗВУЧКИ. Они лежат в той же папке, и
//     ролик без голоса в ленте это брак, который никакая проверка замерами
//     не поймает: длина, громкость музыки и склейки у него в норме;
//   · `auto-grafika-*` — рисованные ролики. Они пока эксперимент и попадают
//     в ленту только после того, как Захар их посмотрит. Показать их можно
//     флагом `--z-grafika`, то есть осознанным решением, а не тем, что файл
//     случайно оказался в out/.
const Z_GRAFIKA = process.argv.includes('--z-grafika');
const pliki = (await readdir(OUT).catch(() => []))
  .filter((f) => /^auto-.*\.mp4$/.test(f))
  .filter((f) => !/-proba\.mp4$/.test(f))
  .filter((f) => Z_GRAFIKA || !/^auto-grafika-/.test(f))
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
  const godz = GODZINY[i % GODZINY.length];
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
    // Ютуб с 22.08: тот же ролик, третья площадка. Shorts отдельным типом
    // помечать не нужно — ютуб сам считает шортсом всё вертикальное короче
    // трёх минут.
    sieci: ['ig', 'fb', 'yt', 'tt'],
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
