// Тестовый ролик для nootripolska (Useme) — собирается из клипов Google Flow.
//
// Отличие от `rolka-auto.mjs` одно: подложка не из стока, а девять клипов Veo,
// снятых под раскадровку (`Sprzedaz/nootri-test/RASKADROWKA.md`). Голос уже
// синтезирован на сервере (`nootri-glos.yml`) и лежит рядом с разметкой — здесь
// он только читается, потому что ключ ElevenLabs живёт в секретах GitHub.
//
// Клипы Flow немые и ровно по 8 секунд. Каждый кусок ставится под свои фразы,
// длина куска считается ПО РАЗМЕТКЕ ГОЛОСА, а не на глаз — тогда картинка
// меняется вместе со смыслом, а не в случайном месте.
//
//   node rolka-nootri.mjs
//   node rolka-nootri.mjs --bez-kontroli
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { zbuduj } from './awatar-reel.mjs';
import { sprawdzRolke } from './kontrola.mjs';

const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');
const KLIPY = path.join('C:', 'Users', 'zahar', 'Desktop', 'zovu desktop', 'zovu flow');
// Три кадра пересняты через Vertex со СТАРТОВЫМ КАДРОМ героя и настоящей
// упаковкой: во Flow лицо в сценах «после» уплывало в другого человека, а
// пакет генератор рисовал свой. Эти лежат отдельно, рядом со скриптом.
const KLIPY_VEO = path.join(DIR, 'out', 'veo');
const GLOS = path.join(OUT, 'nootri', 'nootri-glos');
const BEZ_KONTROLI = process.argv.includes('--bez-kontroli');

const glos = JSON.parse(await readFile(`${GLOS}.json`, 'utf8'));

// Раскладка: какие фразы под каким кадром. Индексы — это фразы из разметки.
//
// Кухня (сцена «дно») просит 8,7 с, а клип ровно 8,0 — поэтому она обрывается
// на последней фразе, и зал входит ПОД слова «piętnaście kilo». Резать по
// середине фразы здесь правильно: смена смысла происходит именно там.
const SCENY = [
  { plik: 'Man_talking_on_phone_in_202608312111.mp4',        frazy: [0, 1],     od: 0 },
  { plik: 'Man_holding_phone_indoors_202608312111.mp4',      frazy: [2],        od: 1.2 },
  { plik: 'Man_sitting_at_kitchen_table_202608312111.mp4',   frazy: [3, 4, 5],  od: 0, max: 8.0 },
  { plik: 'Trainer_talking_to_man_in_202608312111.mp4',      frazy: [6, 7],     od: 0 },
  { plik: 'Torso_model_showing_hormone_acti…_202608312111.mp4', frazy: [8],     od: 1.0 },
  { plik: 'nootri-produkt.mp4', katalog: KLIPY_VEO,             frazy: [9, 10],    od: 0 },
  { plik: 'nootri-lustro.mp4', katalog: KLIPY_VEO,              frazy: [11, 12],   od: 0.6 },
  { plik: 'nootri-drzwi2.mp4', katalog: KLIPY_VEO,              frazy: [13, 14],   od: 0.6 },
  { plik: 'Man_picking_up_coffee_mug_202608312111.mp4',      frazy: [15, 16, 17], od: 0 },
];

// Длина куска — от начала его первой фразы до начала первой фразы следующего
// куска. Последний доигрывает до конца речи плюс воздух.
const klipy = [];
let poczatek = 0;
for (const [i, s] of SCENY.entries()) {
  const plik = path.join(s.katalog || KLIPY, s.plik);
  if (!existsSync(plik)) throw new Error(`[nootri] нет клипа: ${plik}`);

  const nast = SCENY[i + 1];
  const koniec = nast ? glos.frazy[nast.frazy[0]].a : glos.dlugosc;
  let dl = +(koniec - poczatek).toFixed(3);
  if (s.max && dl > s.max) dl = s.max;
  klipy.push({ plik, dlugosc: dl, od: s.od ?? 0, tekst: glos.frazy[s.frazy[0]].tekst });
  console.log(`[nootri] ${String(i + 1).padStart(2)}  ${dl.toFixed(2)} с  ${s.plik.slice(0, 34)}`);
  poczatek = koniec;
}

const suma = klipy.reduce((s, k) => s + k.dlugosc, 0);
console.log(`[nootri] картинка ${suma.toFixed(2)} с, речь ${glos.dlugosc.toFixed(2)} с, слов ${glos.slowa.length}`);

// Титры недель: тот случай, когда цифра на экране работает лучше подписи —
// зритель видит шкалу прогресса, а не слушает её.
const tytuly = [
  { start: +(glos.frazy[11].a - 0.1).toFixed(2), dlugosc: 1.6, numer: '2', tekst: 'TYDZIEŃ' },
  { start: +(glos.frazy[12].a - 0.1).toFixed(2), dlugosc: 1.6, numer: '6', tekst: 'TYDZIEŃ' },
];

const plan = {
  nazwa: 'nootri-test',
  muzyka: path.join(DIR, 'music', 'pixabay-audio_8e10e01af1.mp3'),
  muzykaOd: 0,
  podkladGlosnosc: 0.11,
  podkladOgon: 0.17,
  powietrzeTlo: 0.02,
  stukiGlosnosc: 0.5,
  najazd: 1.1,
  // Между разными сценами рез — норма: это не два дубля одного лица.
  przejscie: 0,
  wjazdWstawki: 0.3,
  ogonPrzejscie: 0.4,
  akcent: '#f6a623',
  akcentPas: '#e4572e',
  dryf: true,
  karaoke: true,
  glos: { plik: `${GLOS}.wav`, slowa: glos.slowa },
  klipy,
  tytuly,
  stemple: [],
  wstawki: [],
  naklejki: [],
  // Ролик уходит клиенту как ЕГО реклама, поэтому фирменного аутро ZOVU здесь
  // нет — вместо него закрывающий кадр с гарантией.
  ogon: {
    marka: false,
    dlugosc: 2.6,
    adres: 'nootri.pl',
    linie: [
      { tekst: '30 dni gwarancji', maly: false },
      { tekst: 'link poniżej', maly: true },
    ],
  },
};

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, `${plan.nazwa}-plan.json`), JSON.stringify(plan, null, 2), 'utf8');

const wynik = await zbuduj(plan);
console.log('[nootri] собрано:', JSON.stringify(wynik));

if (!BEZ_KONTROLI) {
  const raport = await sprawdzRolke(wynik.plik ?? wynik.file ?? wynik);
  console.log('[nootri] контроль:', JSON.stringify(raport, null, 1));
}
