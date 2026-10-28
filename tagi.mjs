// Хэштеги для рилсов и постов — по одному правилу на весь аккаунт.
//
// Зачем отдельный файл. У постов правила тегов живут в промпте Gemini и
// работают: два локальных, два нишевых, один тематический, без общих слов.
// У рилсов теги были зашиты руками в каждый сценарий — и там стояло ровно
// то, что промпт постам запрещает: #marketing, #socialmedia, #reels.
//
// Разница не косметическая. #marketing — десятки миллионов публикаций.
// Лента по такому тегу обновляется быстрее, чем человек доскроллит: ролик
// аккаунта с охватом 11 не показывается там НИКОМУ. Смысл тега для малого
// аккаунта один — попасть в узкую выдачу, где мало претендентов и где сидит
// тот, кто может заплатить. Это «katowice» и «warsztatsamochodowy», а не
// «biznes».
//
// Второе, ради чего это здесь: набор обязан МЕНЯТЬСЯ. Один и тот же список
// под каждой публикацией площадка читает как шаблон и режет показы сама.
// Раньше повтор был неизбежен — теги лежали в сценарии, а сценарии крутятся
// по кругу. Поэтому банки перебираются со сдвигом от номера публикации.
//
//   import { hasztagi } from './tagi.mjs';
//   hasztagi({ temat: 'dlaczego profil nie generuje wiadomości', nr: 7 })

// ── банки ─────────────────────────────────────────────────────────
// 28.10.2026 (Mat + Zahar): ZOVU больше не «студия из Катовице». Мы в
// Варшаве, работаем по всей Польше и за границей, и продаём весь маркетинг:
// ведение соцсетей, рекламу Meta/Google/TikTok, контент и монтаж, съёмки,
// сайты, рассылки, автоматизацию. Городские теги (#katowice,
// #firmakatowice…) сужали ленту до одного региона — сняты совсем и стоят в
// запрещённых, чтобы не вернулись руками.
//
// Набор теперь 3–5 тематических: два общих (о чём аккаунт вообще) и два
// по смыслу ролика, плюс #zovu.
const OGOLNE = ['marketing', 'rolki', 'reklama', 'socialmedia', 'malafirma', 'marketingdlafirm', 'wlasnafirma'];

// Тематические: подбираются по смыслу конкретного ролика.
const TEMATYCZNE = [
  { klucz: /rolk|reels|wideo|film|monta|shorts/i, tagi: ['rolkidlafirm', 'wideomarketing', 'montazwideo'] },
  { klucz: /reklam|ads|kampani|promuj|budzet|budżet/i, tagi: ['reklamanafacebooku', 'metaads', 'kampaniareklamowa'] },
  { klucz: /tiktok/i, tagi: ['tiktokdlafirm', 'tiktokmarketing'] },
  { klucz: /google|opini|wizyt/i, tagi: ['wizytowkagoogle', 'googleads', 'opiniegoogle'] },
  { klucz: /strona|www|sklep/i, tagi: ['stronainternetowa', 'stronadlafirmy'] },
  { klucz: /newsletter|mail/i, tagi: ['newsletter', 'emailmarketing'] },
  { klucz: /\bai\b|sztuczn|automaty|robot|autopilot|kulisy/i, tagi: ['automatyzacja', 'aiwmarketingu', 'kulisypracy'] },
  { klucz: /profil|bio|opis|post|tre[śs]c|publik|codzien|instagram|facebook/i, tagi: ['instagramdlafirm', 'tresci', 'prowadzeniesocialmedia'] },
  { klucz: /wiadomo|klient|sprzeda|zapyta|cena|wycen/i, tagi: ['pozyskiwanieklientow', 'sprzedaz', 'obslugaklienta'] },
  { klucz: /zasi[ęe]g|algorytm|sekund|uwag|hak|zdanie/i, tagi: ['zasiegi', 'algorytminstagrama', 'pierwszesekundy'] },
  { klucz: /fight|gala|tvn|amork|orchard|klient|kejs|case/i, tagi: ['casestudy', 'kampaniareklamowa', 'prowadzeniesocialmedia'] },
];

// Запасной тематический — когда тема не легла ни на один ключ.
const ZAPASOWE = ['marketingdlafirm', 'instagramdlafirm', 'prowadzeniesocialmedia'];

// Теги, которые в набор не попадают ни при каких условиях. Местные — по
// решению 28.10; общие пустышки — потому что ничего не описывают.
export const ZAKAZANE = new Set([
  'katowice', 'firmakatowice', 'katowicebiznes', 'katowicefirmy', 'slask', 'biznesslask', 'gornyslask',
  'slaskiefirmy', 'gliwice', 'chorzow', 'sosnowiec', 'zabrze', 'tychy', 'dabrowagornicza', 'bytom',
  'sukces', 'motywacja', 'praca', 'polska', 'biznes', 'reels', 'instagram',
]);

// Берём `ile` штук из банка со сдвигом. Сдвиг, а не случайность: прогон
// должен повторяться байт в байт.
function wybierz(bank, ile, przesun) {
  const krok = bank.length > 6 ? 3 : 1;
  const out = [];
  for (let i = 0; i < ile; i++) out.push(bank[(przesun + i * krok) % bank.length]);
  return [...new Set(out)];
}

/**
 * Набор хэштегов под одну публикацию: 4–5 штук, без городов.
 * @param {object} o
 * @param {string} [o.temat]  тема ролика — по ней подбираются тематические
 * @param {string} [o.forma]  форма ролика, тоже участвует в подборе
 * @param {number} [o.nr]     номер публикации: сдвигает банки
 * @param {boolean} [o.marka] добавлять ли #zovu (по умолчанию да)
 * @returns {string} строка вида `#marketing #rolkidlafirm ...`
 */
export function hasztagi({ temat = '', forma = '', nr = 0, marka = true } = {}) {
  const p = Math.abs(Math.trunc(nr));
  const opis = `${temat} ${forma}`;
  const trafione = TEMATYCZNE.filter((t) => t.klucz.test(opis)).flatMap((t) => t.tagi);
  const tematyczne = wybierz([...new Set(trafione.length ? trafione : ZAPASOWE)], 2, p);
  const ogolne = wybierz(OGOLNE, 2, p);
  const zestaw = [...ogolne, ...tematyczne, ...(marka ? ['zovu'] : [])];
  const gotowe = [...new Set(zestaw.map((t) => String(t).replace(/^#/, '').toLowerCase()))]
    .filter((t) => t && !ZAKAZANE.has(t));
  return gotowe.slice(0, 5).map((t) => `#${t}`).join(' ');
}

/**
 * Заменяет хвостовую строку с тегами в готовом описании.
 * Описания сценариев несут свои теги отдельной последней строкой — её и
 * подменяем. Если строки нет, добавляем в конец.
 */
export function podmienHasztagi(opis, o = {}) {
  const nowe = hasztagi(o);
  const linie = String(opis).split('\n');
  const i = linie.findIndex((l) => /^\s*#\S/.test(l));
  if (i === -1) return `${String(opis).trimEnd()}\n\n${nowe}\n`;
  linie[i] = nowe;
  return linie.join('\n');
}

/**
 * Подпись под ТикТок из инстаграмной.
 *
 * Это разные площадки, и одинаковая подпись работает только на одной из них.
 * В Instagram описание читают под роликом, оно может быть в три абзаца.
 * В ТикТоке видно две строки, остальное прячется за «ещё», а простыня
 * хештегов внизу выглядит как спам и ничего не даёт: там ищут словами.
 *
 * Поэтому берём ровно два куска — крючок и призыв — и четыре тега вместо
 * семи. Адрес сайта выкидываем: в ТикТоке ссылка в описании некликабельна,
 * а место занимает.
 */
export function podpisTikToka(opis, o = {}) {
  const akapity = String(opis)
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean)
    .filter((a) => !/^#\S/.test(a))
    .filter((a) => !/^https?:|^[a-z0-9-]+\.(pl|com)$/i.test(a));

  const hak = akapity[0] || '';
  // Призыв ищем по глаголу, а не по месту: он не всегда последний абзац.
  const cta = akapity.slice(1).find((a) => /napisz|wyślij|zapisz|skomentuj|oceń/i.test(a)) || '';

  const tagi = hasztagi({ ...o, marka: true })
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');

  return [hak, cta, tagi].filter(Boolean).join('\n\n');
}
