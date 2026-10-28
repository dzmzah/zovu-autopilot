// Правила первой фразы рилса (28.10.2026, решение Mat + Zahar).
//
// Аудит 86 рилсов: средний просмотр 0,9–3,4 с, досмотр 13–17 %. Хуже всех
// шли «эссе» — вступление длинным предложением («Sztuczna inteligencja kusi
// obietnicą gotowych tekstów. Czasem warto…», досмотр 4 %). Лучше всех —
// короткий удар: «Trzy sekundy. Tyle masz…», «Nie obiecujemy zasięgów.»
//
// Поэтому правило жёсткое и проверяется машиной, а не просьбой к модели:
//   1. первое предложение — не больше 10 слов;
//   2. оно на экране с 0,0 с (движок и скины держат первую фразу с нулевого
//      кадра — см. karaokeHtml в awatar-reel.mjs и klatkaHaka в skory.mjs);
//   3. это один из пяти типов хука ниже;
//   4. без «эссе»-зачинов: подводка, придаточное, «czy wiesz».
//
//   import { sprawdzHak, HAKI_TYPY } from './haki.mjs';

export const MAX_SLOW_HAKA = 10;

// Пять типов хука. Описание идёт в промпт генератора, ключ — в сценарий
// (`hak_typ`), чтобы по wyniki.json потом было видно, какой тип держит.
export const HAKI_TYPY = {
  wynik: 'wynik z liczbą — nasz prawdziwy wynik albo liczba z samej rady („86 rolek. Zero zapisów.”)',
  zakaz: 'zakaz albo błąd — „Nie rób X.”, „Ten błąd zabija rolkę.”',
  bol: 'ból klienta jego słowami — „Wrzucasz, a nikt nie pisze?”',
  historia: 'początek historii z konkretnym szczegółem — „Klientka napisała o 23:40.”',
  mit: 'spór z popularnym mitem — „Hasztagi nic ci nie dadzą.”',
};

// Зачины, после которых зритель уже ушёл. Сравнение по началу фразы, без
// регистра. Список короткий намеренно: он ловит форму «эссе», а не слова.
export const ESEJ_ZACZYNY = [
  'w dzisiejszych', 'w dzisiejszym', 'dzisiaj porozmawiamy', 'dziś porozmawiamy', 'dziś opowiem',
  'cześć', 'hej', 'witaj', 'czy wiesz', 'czy wiedziałeś', 'czy zastanawiałeś', 'zastanawiałeś się',
  'wiele osób', 'większość ludzi', 'większość firm', 'każdy z nas', 'każdy przedsiębiorca',
  'w świecie', 'w erze', 'w czasach', 'kiedy myślisz', 'jeśli zastanawiasz', 'sztuczna inteligencja kusi',
  'social media to', 'marketing to', 'w tym filmie', 'w tej rolce', 'pozwól, że',
];

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const slowa = (s) =>
  String(s || '')
    .replace(/[„”"«»()]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));

// Первое предложение: до первой точки / ? / ! / многоточия. Цифры с
// запятой («4,5») не режем.
export function pierwszeZdanie(tekst) {
  const t = String(tekst || '').trim();
  const m = t.match(/^.*?[.?!…](?=\s|$)/s);
  return (m ? m[0] : t).trim();
}

/**
 * Проверка хука сценария. Возвращает список претензий (пусто = годен).
 * @param {object} s сценарий банка ({czesci:[{rola,tekst}], hak_typ?})
 * @param {{wymagajTypu?: boolean}} o — для новых сценариев тип обязателен
 */
export function sprawdzHak(s, { wymagajTypu = false } = {}) {
  const bledy = [];
  const pierwsza = s?.czesci?.[0];
  if (!pierwsza?.tekst) return ['нет первой фразы'];
  if (pierwsza.rola !== 'hak') bledy.push('первая фраза не хук');
  const zd = pierwszeZdanie(pierwsza.tekst);
  const n = slowa(zd).length;
  if (n > MAX_SLOW_HAKA) bledy.push(`первое предложение ${n} слов (> ${MAX_SLOW_HAKA}): «${zd}»`);
  // Хук целиком — то, что висит на экране с нулевого кадра. Даже из двух
  // коротких предложений он не должен становиться абзацем.
  const nCala = slowa(pierwsza.tekst).length;
  if (nCala > 14) bledy.push(`первая фраза ${nCala} слов — это уже абзац`);
  const start = norm(pierwsza.tekst);
  const esej = ESEJ_ZACZYNY.find((z) => start.startsWith(z));
  if (esej) bledy.push(`эссе-зачин «${esej}…»`);
  if (wymagajTypu && !HAKI_TYPY[s.hak_typ]) bledy.push(`нет типа хука (hak_typ: ${Object.keys(HAKI_TYPY).join('|')})`);
  return bledy;
}

// Кодовое слово призыва и запрет на местные упоминания — общие для
// генератора и подписей (podpisy.mjs реэкспортирует). Живут здесь, чтобы
// generator-scenariuszy.mjs и podpisy.mjs не импортировали друг друга.
export const SLOWO = 'ROLKA';
const LOKALNE = /katowic|śląsk|slask|gliwic|sosnowc|chorzów|chorzow|zabrz|tych(y|ach)\b|bytom/i;
export const bezLokalnych = (s) => !LOKALNE.test(String(s || ''));
