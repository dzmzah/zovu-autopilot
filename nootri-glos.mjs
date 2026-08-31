// Закадровый голос для тестового ролика Nootri (Useme, постоянка 280 zł/ролик).
//
// Живёт на сервере: ключ ElevenLabs лежит в секретах GitHub, локально его нет,
// и glos.mjs нарочно падает вместо тихой подмены на Piper.
//
// Отдаём НАРУЖУ две вещи: дорожку одним куском и разметку (границы фраз и слов).
// По разметке режется картинка и рисуются подписи — поэтому сам звук не трогаем.
//
//   node nootri-glos.mjs
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { zbudujGlos } from './glos.mjs';

const DIR = import.meta.dirname;
const WYJ = path.join(DIR, 'out', 'nootri');

// Восемь сцен по 8 секунд. Голос НЕ читает подписи вслух — он ведёт историю,
// а реплики второго героя остаются текстом на экране.
//
// Точка внутри фразы — единственное, что лечит торопливость дубля (проверено
// тремя дублями подряд). Поэтому короткие предложения, а не длинные периоды.
const FRAZY = [
  // 1 · крючок
  { tekst: 'Zadzwoniłem do żony o dwudziestej trzeciej.', rola: 'hak', pauza: 0.35 },
  { tekst: 'Telefon odebrał dwudziestosiedmiolatek.', rola: 'hak', pauza: 0.55 },
  // 2 · унижение
  { tekst: 'Zapytał, czy to ja jestem tym dziadkiem.', rola: 'tresc', pauza: 0.5 },
  // 3 · дно
  { tekst: 'Nie krzyczałem. Usiadłem w kuchni.', rola: 'tresc', pauza: 0.4 },
  { tekst: 'Dwadzieścia lat byłem facetem, na którym wszyscy się opierali.', rola: 'tresc', pauza: 0.4 },
  { tekst: 'A dziś. Piętnaście kilo więcej niż w dniu ślubu.', rola: 'tresc', pauza: 0.55 },
  // 4 · объяснение
  { tekst: 'Trener powiedział jedno zdanie.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Po czterdziestce kortyzol idzie w górę. Testosteron w dół.', rola: 'tresc', pauza: 0.4 },
  { tekst: 'To nie jest brak silnej woli. To hormony.', rola: 'tresc', pauza: 0.55 },
  // 5 · продукт
  { tekst: 'Jedna filiżanka kawy grzybowej zamiast zwykłej.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Ashwagandha łagodzi kortyzol. Lion’s mane rozgania mgłę.', rola: 'tresc', pauza: 0.55 },
  // 6 · прогресс
  { tekst: 'Drugi tydzień. Ciężar w ciele znika.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Szósty tydzień. Koszula sprzed pięciu lat.', rola: 'tresc', pauza: 0.55 },
  // 7 · возврат
  { tekst: 'Wróciła po swoje pudła.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Zapytała, co ja ze sobą zrobiłem.', rola: 'tresc', pauza: 0.55 },
  // 8 · призыв
  { tekst: 'Odeszła nie dlatego, że się zestarzałem.', rola: 'cta', pauza: 0.35 },
  { tekst: 'Odeszła, bo przez dwadzieścia lat stres mnie wykańczał.', rola: 'cta', pauza: 0.4 },
  { tekst: 'Jeden kubek każdego ranka.', rola: 'cta' },
];

const znakow = FRAZY.reduce((s, f) => s + f.tekst.length, 0);
console.log(`[nootri] фраз: ${FRAZY.length}, символов: ${znakow} (лимит ElevenLabs — 10 000 в месяц)`);

await mkdir(WYJ, { recursive: true });

const glos = await zbudujGlos(FRAZY, { tmp: path.join(WYJ, 'tmp') });

await copyFile(glos.plik, path.join(WYJ, 'nootri-glos.wav'));
await writeFile(
  path.join(WYJ, 'nootri-glos.json'),
  JSON.stringify({ dlugosc: glos.dlugosc, frazy: glos.frazy, slowa: glos.slowa }, null, 2),
  'utf8'
);

console.log(`[nootri] готово: ${glos.dlugosc.toFixed(2)} с речи, слов размечено ${glos.slowa.length}`);
