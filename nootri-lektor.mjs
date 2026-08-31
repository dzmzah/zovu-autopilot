// Закадровый голос для тестового ролика Nootri (Useme, постоянка 280 zł/ролик).
//
// Живёт на сервере: ключ ElevenLabs лежит в секретах GitHub, локально его нет,
// и glos.mjs нарочно падает вместо тихой подмены на Piper.
//
// Отдаём НАРУЖУ две вещи: дорожку одним куском и разметку (границы фраз и слов).
// По разметке режется картинка и рисуются подписи — поэтому сам звук не трогаем.
//
//   node nootri-lektor.mjs
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
  { tekst: 'Zadzwoniłem do żony. O dwudziestej trzeciej.', rola: 'hak', pauza: 0.35 },
  { tekst: 'Telefon odebrał. Dwudziestosiedmiolatek.', rola: 'hak', pauza: 0.55 },
  // 2 · унижение
  { tekst: 'Zapytał, czy to ja jestem tym dziadkiem.', rola: 'tresc', pauza: 0.5 },
  // 3 · дно
  { tekst: 'Nie krzyczałem. Usiadłem w kuchni.', rola: 'tresc', pauza: 0.4 },
  { tekst: 'Dwadzieścia lat byłem facetem. Na którym wszyscy się opierali.', rola: 'tresc', pauza: 0.4 },
  { tekst: 'A dziś. Piętnaście kilo więcej niż w dniu ślubu.', rola: 'tresc', pauza: 0.55 },
  // 4 · объяснение
  { tekst: 'Trener powiedział jedno zdanie.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Po czterdziestce kortyzol idzie w górę. Testosteron w dół.', rola: 'tresc', pauza: 0.4 },
  { tekst: 'To nie jest brak silnej woli. To hormony.', rola: 'tresc', pauza: 0.55 },
  // 5 · продукт
  { tekst: 'Jedna filiżanka kawy grzybowej. Zamiast zwykłej.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Ashwagandha łagodzi kortyzol. Lion’s mane rozgania mgłę.', rola: 'tresc', pauza: 0.55 },
  // 6 · прогресс
  { tekst: 'Drugi tydzień. Ciężar w ciele znika.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Szósty tydzień. Koszula sprzed pięciu lat.', rola: 'tresc', pauza: 0.55 },
  // 7 · возврат
  { tekst: 'Wróciła. Po swoje pudła.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'Zapytała. Co ja ze sobą zrobiłem.', rola: 'tresc', pauza: 0.55 },
  // 8 · призыв
  { tekst: 'Odeszła nie dlatego. Że się zestarzałem.', rola: 'cta', pauza: 0.35 },
  { tekst: 'Odeszła, bo przez dwadzieścia lat stres mnie wykańczał.', rola: 'cta', pauza: 0.4 },
  { tekst: 'Jeden kubek każdego ranka.', rola: 'cta' },
];

const znakow = FRAZY.reduce((s, f) => s + f.tekst.length, 0);
console.log(`[nootri] фраз: ${FRAZY.length}, символов: ${znakow} (лимит ElevenLabs — 10 000 в месяц)`);

// ── голос ролика ──────────────────────────────────────────────────
// Захар выбрал на слух `Adrian - Soft Breezy Casual` из библиотеки: под ИИ-картинку
// он ложится, а наш студийный Jan Gajos звучит как реклама. Голос студии не трогаем —
// он остаётся в секретах и в лентах ZOVU, а этот живёт только здесь.
//
// Идентификатор достаём из библиотеки по имени: захардкодить его вслепую нельзя,
// а ключ живёт в секретах и локально его нет.
async function idAdriana(klucz) {
  const r = await fetch(
    'https://api.elevenlabs.io/v1/shared-voices?page_size=30&language=pl&gender=male',
    { headers: { 'xi-api-key': klucz } }
  );
  if (!r.ok) throw new Error(`ElevenLabs biblioteka ${r.status}`);
  const j = await r.json();
  const g = (j.voices || []).find((v) => /^adrian/i.test(v.name || ''));
  if (!g) throw new Error('[nootri] в библиотеке нет голоса Adrian — пробы надо гонять заново');
  console.log(`[nootri] голос: ${g.name} (${g.voice_id})`);
  return g.voice_id;
}

// Настройки под Adriana, а не общие. Он самый быстрый из десяти проб —
// 6,4 слога в секунду на той же фразе, где норма 3,5–4,8. Поэтому speed ниже
// единицы, а style срезан вдвое: высокий style у него добавляет игры, а нам
// нужен человек, который рассказывает про себя, а не диктор.
const USTAWIENIA = {
  stability: 0.5,
  similarity_boost: 0.85,
  style: 0.2,
  use_speaker_boost: true,
  speed: 0.9,
};

await mkdir(WYJ, { recursive: true });

const glos = await zbudujGlos(FRAZY, {
  tmp: path.join(WYJ, 'tmp'),
  glosId: await idAdriana(process.env.ELEVENLABS_KEY),
  ustawienia: USTAWIENIA,
});

await copyFile(glos.plik, path.join(WYJ, 'nootri-glos.wav'));
await writeFile(
  path.join(WYJ, 'nootri-glos.json'),
  JSON.stringify({ dlugosc: glos.dlugosc, frazy: glos.frazy, slowa: glos.slowa }, null, 2),
  'utf8'
);

console.log(`[nootri] готово: ${glos.dlugosc.toFixed(2)} с речи, слов размечено ${glos.slowa.length}`);
