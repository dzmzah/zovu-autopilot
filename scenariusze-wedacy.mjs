// Сценарии для формата «человек в кадре + врезки».
//
// Отличий от рисованных два, и оба жёсткие.
//
// ПЕРВОЕ — МЕСТО. Под сценой лицо, а не полотно. Значит центр кадра занят:
// врезки идут В ПРАВУЮ ТРЕТЬ и НИЖЕ подбородка, подписи внизу. Объект по
// центру закроет лицо — а лицо и есть причина, по которой этот формат
// вообще делается.
//
// ВТОРОЕ — ДЛИНА. Разбор 24.08 показал: нас смотрят 4,5 секунды, а ролики
// мы делали по 20,5. Досмотр 22 % это не качество, это арифметика. Здесь
// целимся в 12-15 секунд: те же секунды внимания дают вдвое лучший досмотр
// и до 1,8× больше повторов.
//
// Пять фраз, не девять. Каждая фраза — своя мысль, лишних нет.
export const NIE_POTRZEBUJESZ = {
  klucz: 'nie-potrzebujesz',
  nazwa: 'Nie potrzebujesz agencji',
  frazy: [
    // Первая фраза — ставка, а не приветствие. Отрицательная формулировка:
    // по замерам рынка она держит в 1,3-1,8 раза лучше положительной.
    { rola: 'hak', tekst: 'Powiem coś, na czym mogę stracić klienta.', pauza: 0.34 },
    { rola: 'hak', tekst: 'Większość małych firm nie potrzebuje agencji.', pauza: 0.40 },
    { rola: 'tresc', tekst: 'Potrzebuje trzech rzeczy. Zrobisz je sam.', pauza: 0.32 },
    { rola: 'zaplata', tekst: 'Opis profilu. Zdjęcia. Szybka odpowiedź.', pauza: 0.36 },
    // Финал — вывод, а не просьба подписаться. Просьба о ПЕРЕСЫЛКЕ: она
    // весит втрое-впятеро больше лайка, и у нас её ноль за тринадцать роликов.
    { rola: 'cta', tekst: 'Wyślij to komuś, kto prowadzi firmę sam.', pauza: 0.20 },
  ],

  buduj({ t, total }) {
    // Правая треть кадра: x около 800 при ширине 1080. Ниже подбородка:
    // y от 1150. Всё, что выше 1000, ляжет на лицо.
    const PRAWA = 810;
    const NIZEJ = 1240;

    const scena = [
      // Хук идёт на чистом лице. Первые две секунды в кадре только человек —
      // всё остальное отнимает внимание у самой сильной фразы.
      { obiekt: 'cross_mark_3d', x: PRAWA, y: NIZEJ, skala: 300, obrot: -8, skad: 'prawo',
        start: t(1, 0.10), koniec: t(2, 0.20), dokad: 'prawo' },

      { obiekt: 'thinking_face_3d', x: PRAWA, y: NIZEJ - 40, skala: 320, obrot: 6, skad: 'dol',
        start: t(2, 0.15), koniec: t(3, 0.05), dokad: 'dol' },

      // Три предмета на перечисление — приходят по одному под свои слова,
      // не кучей. Кучей это витрина, по одному — счёт.
      { obiekt: 'mobile_phone_3d', x: PRAWA - 30, y: NIZEJ - 40, skala: 290, obrot: -7, skad: 'prawo',
        start: t(3, 0.05), koniec: t(4, 0.02), dokad: 'gora' },
      { obiekt: 'hundred_points_3d', x: PRAWA + 20, y: NIZEJ + 90, skala: 300, obrot: 9, skad: 'dol',
        start: t(3, 0.38), koniec: t(4, 0.02), dokad: 'dol' },
      { obiekt: 'alarm_clock_3d', x: PRAWA - 10, y: NIZEJ - 90, skala: 280, obrot: -5, skad: 'gora',
        start: t(3, 0.68), koniec: t(4, 0.02), dokad: 'gora' },

      // На призыве — конверт. Он про пересылку, а не про подписку.
      { obiekt: 'envelope_3d', x: PRAWA, y: NIZEJ - 30, skala: 330, obrot: 0, skad: 'prawo',
        start: t(4, 0.05) },
    ];

    // Счётчик на второй фразе: сколько времени уходит на то, чего можно не
    // делать. Цифра крутится, а не появляется готовой.
    const liczniki = [
      { x: PRAWA, y: NIZEJ + 210, od: 0, do: 3, jednostka: '', opis: 'RZECZY',
        a: t(2, 0.25), b: t(4, 0.0), czas: 0.9, zPodpisem: true },
    ];

    // Камера едет весь ролик: статичный кадр с говорящей головой мёртв.
    const kamera = [
      { a: 0, b: total, od: 1.0, do: 1.06 },
    ];

    // Цвет по смыслу: жёлтым выгода, красным потеря. Формат тут не мой,
    // а движка: два списка слов в нижнем регистре, а не список пар.
    // Ошибся один раз — страница падала на подсветке и не рисовала ничего.
    const akcenty = {
      zolty: ['trzech', 'sam', 'wyślij'],
      czerwony: ['stracić', 'nie'],
    };

    return { scena, metki: [], wzor: [], liczniki, kamera, akcenty };
  },
};

export const SCENARIUSZE_WEDACY = [NIE_POTRZEBUJESZ];

export function wybierzWedacego(klucz) {
  const s = klucz
    ? SCENARIUSZE_WEDACY.find((x) => x.klucz === klucz)
    : SCENARIUSZE_WEDACY[0];
  if (!s) {
    throw new Error(
      `нет сценария «${klucz}». Есть: ${SCENARIUSZE_WEDACY.map((x) => x.klucz).join(', ')}`
    );
  }
  return s;
}
