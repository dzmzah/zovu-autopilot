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
// Локальные. Клиент ZOVU — фирма, до которой можно доехать. Город в теге
// сужает выдачу в тысячи раз и одновременно отсекает случайных зрителей из
// другой страны, которые портят досмотр и ничего не покупают.
const LOKALNE = [
  'katowice', 'slask', 'katowicebiznes', 'biznesslask', 'firmakatowice',
  'gornyslask', 'slaskiefirmy', 'katowicefirmy', 'gliwice', 'chorzow',
  'sosnowiec', 'zabrze', 'tychy', 'dabrowagornicza', 'bytom',
];

// Нишевые: кто именно нас читает. Не «бизнес», а форма и размер дела.
const NISZOWE = [
  'malafirma', 'lokalnybiznes', 'wlasnafirma', 'mikrofirma', 'jdg',
  'jednoosobowadzialalnosc', 'uslugilokalne', 'rzemioslo', 'mojafirma',
  'przedsiebiorcy', 'malybiznes', 'firmarodzinna',
];

// Отраслевые — под живой сток и под тех, кому мы реально продаём.
const BRANZOWE = [
  'salonurody', 'gastronomiapl', 'warsztatsamochodowy', 'sklepinternetowy',
  'fryzjerstwo', 'kosmetyczka', 'restauracja', 'kawiarnia', 'barbershop',
  'nieruchomosci', 'fotografslubny', 'trenerpersonalny',
];

// Тематические: подбираются по смыслу конкретного ролика. Ключ — то, что
// ищем в теме и в форме; значение — теги, которые описывают ЭТУ мысль.
const TEMATYCZNE = [
  { klucz: /profil|bio|opis/i, tagi: ['profilfirmowy', 'opisprofilu', 'wizytowkafirmy'] },
  { klucz: /wiadomo|klient|sprzeda|zapyta/i, tagi: ['pozyskiwanieklientow', 'zapytaniaofertowe', 'obslugaklienta'] },
  { klucz: /strona|www|sklep/i, tagi: ['stronadlafirmy', 'stronainternetowa', 'wizytowkawgoogle'] },
  { klucz: /rolk|reels|wideo|film/i, tagi: ['wideodlafirm', 'rolkidlafirm', 'wideomarketing'] },
  { klucz: /\bai\b|sztuczn/i, tagi: ['aiwbiznesie', 'sztucznainteligencja', 'automatyzacja'] },
  { klucz: /post|tre[śs]c|publik|codzien/i, tagi: ['tresciwsocialmediach', 'postydlafirm', 'plantresci'] },
  { klucz: /zasi[ęe]g|algorytm/i, tagi: ['zasiegiorganiczne', 'algorytminstagrama', 'instagramdlafirm'] },
  { klucz: /czas|uwag|zatrzyma|sekund/i, tagi: ['uwagaodbiorcy', 'pierwszesekundy', 'hakwideo'] },
  { klucz: /cena|budzet|kosztuj|pieni/i, tagi: ['budzetreklamowy', 'kosztymarketingu', 'oplacalnosc'] },
];

// Запасной тематический — когда тема не легла ни на один ключ.
const ZAPASOWE = ['marketingdlafirm', 'instagramdlafirm', 'socialmediadlafirm'];

// Общие слова, которые в набор не попадают ни при каких условиях. Список
// нужен не для генерации, а для проверки: если такой тег появился, значит
// кто-то опять вписал его руками мимо этого файла.
export const ZAKAZANE = new Set([
  'marketing', 'biznes', 'reklama', 'sukces', 'motywacja', 'socialmedia',
  'reels', 'instagram', 'contentmarketing', 'agencjamarketingowa',
  'przedsiebiorca', 'praca', 'polska',
]);

// Берём `ile` штук из банка со сдвигом. Сдвиг, а не случайность: прогон
// должен повторяться байт в байт, иначе перезапуск сборки даёт другой файл
// и очередь начинает расходиться сама с собой.
// Шаг перебора зависит от размера банка: на маленьком банке шаг 3 попадает
// в ту же ячейку (3 % 3 = 0) и две метки схлопываются в одну — набор молча
// выходит короче задуманного.
function wybierz(bank, ile, przesun) {
  const krok = bank.length > 6 ? 3 : 1;
  const out = [];
  for (let i = 0; i < ile; i++) out.push(bank[(przesun + i * krok) % bank.length]);
  return [...new Set(out)];
}

/**
 * Набор хэштегов под одну публикацию.
 * @param {object} o
 * @param {string} [o.temat]  тема ролика — по ней подбирается тематический тег
 * @param {string} [o.forma]  форма ролика, тоже участвует в подборе
 * @param {number} [o.nr]     номер публикации: сдвигает банки, чтобы наборы не повторялись
 * @param {boolean} [o.marka] добавлять ли #zovu (по умолчанию да)
 * @returns {string} строка вида `#katowice #slask #malafirma ...`
 */
export function hasztagi({ temat = '', forma = '', nr = 0, branza = '', marka = true } = {}) {
  const p = Math.abs(Math.trunc(nr));
  const opis = `${temat} ${forma}`;

  // Тематические — по смыслу ролика, и их ДВА. Раньше здесь стоял один
  // тематический плюс отраслевой наугад, и под роликом про описание профиля
  // оказывался #warsztatsamochodowy. Нерелевантный тег хуже отсутствующего:
  // площадка сверяет теги с содержимым и режет показы за несовпадение, а
  // человек по такому тегу приходит не за нами и уходит через секунду —
  // портит досмотр, ради которого всё и делается.
  const trafione = TEMATYCZNE.filter((t) => t.klucz.test(opis)).flatMap((t) => t.tagi);
  const pula = trafione.length ? trafione : ZAPASOWE;
  const tematyczne = wybierz(pula, 2, p);

  // Две локальные метки: столица региона и один соседний город. Держать
  // «katowice» постоянно — осознанно: это единственный тег, по которому нас
  // ищут те, кто уже решил искать подрядчика рядом.
  const lokalne = ['katowice', wybierz(LOKALNE.slice(1), 1, p)[0]];
  const niszowe = wybierz(NISZOWE, 2, p);

  // Отрасль — только если её назвали явно. Сам угадать её по теме ролика
  // нельзя: ролики у нас про маркетинг вообще, а не про чью-то мастерскую.
  const branzowe = branza
    ? [String(branza).replace(/^#/, '').toLowerCase()].filter((b) => BRANZOWE.includes(b))
    : [];

  const zestaw = [...lokalne, ...niszowe, ...branzowe, ...tematyczne, ...(marka ? ['zovu'] : [])];

  // Чистка на выходе. Дубли и запрещённые слова тут появиться не должны, но
  // банки правятся руками, и молча выпустить #marketing нельзя.
  const gotowe = [...new Set(zestaw.map((t) => String(t).replace(/^#/, '').toLowerCase()))]
    .filter((t) => t && !ZAKAZANE.has(t));

  // Ровно пять. Instagram сам ограничил пост пятью тегами, а всё сверх того
  // мы отправляли в никуда. Порядок в наборе не случайный: сначала местные
  // (там мы реально можем быть заметны при охвате в две сотни), потом
  // нишевые, потом тематические, и бренд последним — если место осталось.
  const PIEC = 5;
  return gotowe.slice(0, PIEC).map((t) => `#${t}`).join(' ');
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
