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

// ТРИНАДЦАТЬ фраз, а не восемнадцать. Голос Google Puck читает медленнее
// ElevenLabs: те же восемнадцать давали 73 секунды речи, а девять клипов по
// восемь секунд покрывают максимум 72 — картинка начинала зацикливаться, и
// замеры ловили рывки силой 106. Сокращаем текст, а не растягиваем кадры.
//
// Восемь сцен по 8 секунд. Голос НЕ читает подписи вслух — он ведёт историю,
// а реплики второго героя остаются текстом на экране.
//
// Точка внутри фразы — единственное, что лечит торопливость дубля (проверено
// тремя дублями подряд). Поэтому короткие предложения, а не длинные периоды.
const FRAZY = [
  // 1 · крючок
  { tekst: 'Zadzwoniłem do żony. O dwudziestej trzeciej.', rola: 'hak', pauza: 0.3 },
  { tekst: 'Telefon odebrał. Dwudziestosiedmiolatek.', rola: 'hak', pauza: 0.45 },
  // 2 · унижение
  { tekst: 'Zapytał, czy to ja jestem tym dziadkiem.', rola: 'tresc', pauza: 0.4 },
  // 3 · дно
  { tekst: 'Nie krzyczałem. Usiadłem w kuchni.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'A dziś. Piętnaście kilo więcej niż w dniu ślubu.', rola: 'tresc', pauza: 0.45 },
  // 4 · объяснение
  { tekst: 'Po czterdziestce kortyzol idzie w górę. Testosteron w dół.', rola: 'tresc', pauza: 0.35 },
  { tekst: 'To nie brak silnej woli. To hormony.', rola: 'tresc', pauza: 0.45 },
  // 5 · продукт
  { tekst: 'Jedna filiżanka kawy grzybowej. Zamiast zwykłej.', rola: 'tresc', pauza: 0.3 },
  { tekst: 'Ashwagandha na kortyzol. Lion’s mane na mgłę.', rola: 'tresc', pauza: 0.45 },
  // 6 · прогресс
  { tekst: 'Szósty tydzień. Koszula sprzed pięciu lat.', rola: 'tresc', pauza: 0.45 },
  // 7 · возврат
  { tekst: 'Wróciła. Po swoje pudła.', rola: 'tresc', pauza: 0.3 },
  { tekst: 'Zapytała. Co ja ze sobą zrobiłem.', rola: 'tresc', pauza: 0.45 },
  // 8 · призыв
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
// Читать чужой голос ПРЯМО по публичному идентификатору бесплатный тариф не даёт:
// «You need to be on the creator tier or above to use this voice». Зато его можно
// добавить к себе в библиотеку — тогда голос становится своим и синтез разрешён.
// Это не обход ограничения, а штатный путь: ровно эту кнопку жмут в интерфейсе.
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

  // Уже добавленный не добавляем второй раз — иначе в библиотеке заведётся копия
  // на каждый прогон, и через неделю там будет двадцать Адрианов.
  const moje = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': klucz } });
  if (moje.ok) {
    const lista = (await moje.json()).voices || [];
    const swoj = lista.find((v) => /adrian/i.test(v.name || ''));
    if (swoj) {
      console.log(`[nootri] голос уже в библиотеке аккаунта: ${swoj.voice_id}`);
      return swoj.voice_id;
    }
  }

  const dodaj = await fetch(
    `https://api.elevenlabs.io/v1/voices/add/${g.public_owner_id}/${g.voice_id}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': klucz, 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: 'Adrian ZOVU' }),
    }
  );
  if (!dodaj.ok) {
    console.warn(`[nootri] в библиотеку не добавился (${dodaj.status}) — пробую публичный идентификатор`);
    return g.voice_id;
  }
  const dodany = (await dodaj.json()).voice_id;
  console.log(`[nootri] голос добавлен в аккаунт: ${dodany}`);
  return dodany;
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

// Квоту спрашиваем ДО синтеза. Прошлый прогон купил хороший дубль, полез за
// вторым «на всякий случай» и упал на 401 — а в логе это выглядело как поломка
// кода. Пусть лучше скрипт сразу скажет, сколько символов осталось и когда сброс.
async function limit(klucz) {
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': klucz },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const zostalo = (j.character_limit ?? 0) - (j.character_count ?? 0);
  const reset = j.next_character_count_reset_unix
    ? new Date(j.next_character_count_reset_unix * 1000).toISOString().slice(0, 16).replace('T', ' ')
    : 'nieznany';
  console.log(`[nootri] квота ElevenLabs: осталось ${zostalo} из ${j.character_limit}, сброс ${reset} UTC`);
  return zostalo;
}

const zostalo = (process.env.GLOS_DOSTAWCA || 'google').trim() !== 'eleven'
  ? null
  : await limit(process.env.ELEVENLABS_KEY);
// Дубль стоит примерно как весь текст. Меньше — синтез не начнётся, и падать
// на середине незачем: понятное сообщение полезнее стектрейса.
if (zostalo !== null && zostalo < znakow) {
  console.error(`[nootri] символов не хватает: нужно ${znakow}, осталось ${zostalo}. Ждём сброса квоты.`);
  process.exit(2);
}

await mkdir(WYJ, { recursive: true });

// Поставщика выбираем снаружи. На бесплатном ElevenLabs библиотечные голоса
// через API закрыты вообще («Free users cannot use library voices via the API»),
// и добавление их в свой аккаунт этого не меняет — проверено на десяти голосах.
// Остаётся либо платный тариф, либо Gemini: там польский родной, а подача
// задаётся словами.
const DOSTAWCA = (process.env.GLOS_DOSTAWCA || 'google').trim();
const GEMINI = DOSTAWCA === 'gemini';
const GOOGLE = DOSTAWCA === 'google';

const glos = await zbudujGlos(FRAZY, {
  tmp: path.join(WYJ, 'tmp'),
  // Google Cloud TTS — бесплатный миллион знаков в месяц и коммерческая лицензия,
  // то есть единственный бесплатный путь, которым МОЖНО отдавать работу клиенту.
  // Голос выбрал Захар на слух: Puck, «самый живой» из восемнадцати польских.
  ...(GOOGLE
    ? { dostawca: 'google', glosId: process.env.GOOGLE_VOICE || 'pl-PL-Chirp3-HD-Puck' }
    : GEMINI
      ? { dostawca: 'gemini' }
      : { glosId: await idAdriana(process.env.ELEVENLABS_KEY), ustawienia: USTAWIENIA }),
});

await copyFile(glos.plik, path.join(WYJ, 'nootri-glos.wav'));
await writeFile(
  path.join(WYJ, 'nootri-glos.json'),
  JSON.stringify({ dlugosc: glos.dlugosc, frazy: glos.frazy, slowa: glos.slowa }, null, 2),
  'utf8'
);

console.log(`[nootri] готово: ${glos.dlugosc.toFixed(2)} с речи, слов размечено ${glos.slowa.length}`);
