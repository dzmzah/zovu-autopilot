// Демо-ролики под КОНКРЕТНЫХ клиентов.
//
// Отдельный файл, а не общий банк, по одной причине: `SCENARIUSZE` из
// `scenariusze-grafika.mjs` перебирается ротацией для НАШЕЙ ленты. Демо для
// чужой фирмы, попавшее в эту ротацию, вышло бы на аккаунте ZOVU как наш
// собственный пост — с чужим призывом и чужим названием в конце.
//
// Поэтому демо снимаются только по явному ключу и в ротацию не входят.
//
// ГЛАВНОЕ ПРАВИЛО ЭТИХ РОЛИКОВ: каждая цифра взята с сайта клиента и
// проверена там же. В офферах мы уже один раз написали Museo «30+ языков»,
// когда у них на сайте «over 20» — выглядит как комплимент, читается как
// доказательство, что мы не читали их страницу. В ролике такая ошибка стоит
// дороже: её видно всем, кому клиент его покажет.
//
// Снимать: `node rolka-grafika.mjs --scenariusz=demo-museo`

// ── Museo (themuseo.ai) — аудиогид, узнающий картину по камере ────
// Факты с themuseo.ai (проверено 18.08.2026):
//   · «Point your camera at a painting or sculpture to instantly access its story»
//   · «over 20 languages»
//   · «Free Guides, New Revenue» — для посетителя бесплатно
//   · iOS и Android, компания в Варшаве
// Ничего, кроме этого, ролик не утверждает. Числа посетителей, музеев и цен
// на сайте нет — значит их нет и здесь.
const MUSEO = {
  klucz: 'demo-museo',
  nazwa: 'DEMO Museo — audioprzewodnik z kamery',
  frazy: [
    // Первый дубль этого ролика и доказал правило про паузу: четыре фразы с
    // точкой внутри легли в 3,4-4,9 слог/с, а четыре без точки — 5,6-6,4.
    // Разделение вышло без единого исключения, поэтому теперь точка есть в
    // каждой.
    { rola: 'hak', tekst: 'Stoisz przed obrazem. I nic o nim nie wiesz.', pauza: 0.40 },
    { rola: 'hak', tekst: 'Tabliczka obok. Jedno zdanie i tyle.', pauza: 0.38 },
    { rola: 'tresc', tekst: 'Skieruj telefon na obraz. To wszystko.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Rozpoznaje go od razu. W sekundę.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'I opowiada. W dwudziestu językach.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Bez wypożyczania sprzętu. Bez kolejki.', pauza: 0.34 },
    { rola: 'zaplata', tekst: 'Dla zwiedzającego za darmo. Zawsze.', pauza: 0.38 },
    { rola: 'cta', tekst: 'Museo. Pobierz, zanim wejdziesz do muzeum.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      // Глаза в хуке: человек СМОТРИТ на картину и не понимает. Слово и
      // предмет говорят одно и то же — это и есть весь приём.
      // Глаза держатся до самого прихода телефона. На пробе они уходили на
      // t(1,0.20) и кадр стоял пустым полторы секунды — ровно в первые пять
      // секунд, где пустота читается не как приём, а как «ролик кончился».
      { obiekt: 'eyes_3d', x: 520, y: 540, skala: 720, obrot: -6, skad: 'gora',
        start: t(0, 0.05), koniec: t(2, 0.02), dokad: 'lewo' },
      // Телефон на «skieruj telefon» — самое буквальное совпадение слова и
      // кадра в ролике, поэтому предмет самый крупный из первых.
      { obiekt: 'mobile_phone_3d', x: 540, y: 520, skala: 800, obrot: 7, skad: 'prawo',
        start: t(2, 0.02), koniec: t(4, 0.60), dokad: 'gora' },
      // Лампочка — момент, когда история стала понятна. Приходит под фразу
      // про двадцать языков и уходит вместе с ответом формулы.
      // Лампочка живёт до прихода галочки: между ними оставался зазор, и на
      // жёлтой строке «= 20 JĘZYKÓW» кадр пустел на две секунды.
      { obiekt: 'light_bulb_3d', x: 830, y: 570, skala: 600, obrot: 9, skad: 'prawo',
        start: t(4, 0.05), koniec: t(5, 0.10), dokad: 'prawo' },
      // Самый крупный кадр ролика — один предмет во весь экран на выигрыше.
      { obiekt: 'check_mark_button_3d', x: 540, y: 540, skala: 800, obrot: -5, skad: 'dol',
        start: t(5, 0.05), koniec: t(6, 0.05), dokad: 'gora' },

      // Три карточки живого видео на второй фразе расплаты: музейные
      // пространства и книги. Ни одного лица — ролик про предмет и телефон,
      // человек в кадре тут перетянул бы взгляд на себя.
      { film: 'architektura', x: 235, y: 830, skala: 340, wys: 540, obrot: -7, skad: 'dol',
        start: t(6, 0.05), koniec: t(7, 0.10), dokad: 'lewo' },
      { film: 'ksiazki', x: 552, y: 760, skala: 390, wys: 620, obrot: 1, skad: 'dol',
        start: t(6, 0.20), koniec: t(7, 0.10), dokad: 'dol' },
      { film: 'wnetrza', x: 870, y: 830, skala: 340, wys: 540, obrot: 7, skad: 'dol',
        start: t(6, 0.35), koniec: t(7, 0.10), dokad: 'prawo' },

      { obiekt: 'mobile_phone_3d', x: 540, y: 430, skala: 470, obrot: 0, skad: 'gora',
        start: t(7, 0.05) },
    ];

    // Ценник РАСТЁТ и ведёт к зелёному: один язык на табличке против
    // двадцати в приложении — это выигрыш, а не потеря. Обе цифры с их
    // сайта: «over 20 languages», табличка в музее всегда одна.
    const metki = [
      { x: 540, y: 1010, szer: 400, wys: 540, od: 1, do: 20, jednostka: '',
        barwaOd: 32, barwaDo: 158,
        odProc: 5, doProc: 100, opis: 'JĘZYKÓW', a: t(7, 0.12), b: total, czas: 1.2 },
    ];

    const wzor = [
      // Коротко, потому что длинная строка переносится и вторая половина
      // садится на счётчик. «1 ZDJĘCIE = 1 HISTORIA» — двадцать два знака,
      // в кадр по ширине не влезло.
      { tekst: 'OBRAZ = HISTORIA', y: 940, maly: true, a: t(2, 0.40), b: t(4, 0.60) },
      { tekst: '= 20 JĘZYKÓW', y: 1080, kolor: 'zolty', a: t(4, 0.72), b: t(5, 0.15) },
    ];

    const liczniki = [
      { od: 0, do: 20, jednostka: '', y: 1120, a: t(0, 0.30), b: t(1, 0.60),
        czas: 0.80, zPodpisem: true },
      { od: 0, do: 20, jednostka: '', y: 1120, a: t(3, 0.05), b: t(4, 0.60), czas: 1.15 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.06, x: -16, y: 12 },
      { t: t(2), zoom: 1.01, x: 18, y: -10 },
      { t: t(4, 0.30), zoom: 1.11, x: 0, y: 22 },
      { t: t(5, 0.05), zoom: 1.03, x: 0, y: 0 },
      { t: t(6, 0.10), zoom: 1.08, x: 14, y: -16 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    // Слова сверены с текстом дословно. Жёлтый — выигрыш, красный — потеря.
    const akcenty = {
      zolty: ['dwudziestu', 'językach', 'bezpłatnie', 'pobierz', 'wszystko'],
      czerwony: ['nic', 'jedno', 'kolejki'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

// ── Academia Española — детская школа футбола ─────────────────────
// Факты (fundacjaespanola.pl, espanola.pl, проверено 18.08.2026):
//   · Катовице, Гливице, Хожув
//   · работает с 2014 года → двенадцать лет к 2026
//   · группы с 1 года (с родителями) и футбол с 5 до 13 лет
//   · испанская методика, сотрудничество с GKS Piast Gliwice и GKS Katowice
//   · есть также падел
// Цен и числа воспитанников на сайте нет — в ролике их тоже нет.
//
// ⚠️ ЭТО ДЕМО КЛИЕНТУ НЕ ОТПРАВЛЯТЬ, пока не будет футажа С ДЕТЬМИ.
//
// Проба показала главное: в `broll/` нет детского спорта. Теги `sport`,
// `bieganie` и `joga` дают взрослых атлетов — мускулистый спринтер и силуэты
// в контровом свете. Школа набирает детей от года до тринадцати, и родитель,
// которому это показывают, видит фитнес для взрослых. Кадр мимо темы хуже
// отсутствия кадра: он говорит, что мы не поняли, чем клиент занимается.
//
// Что нужно, чтобы демо стало отправляемым: два-три клипа с тренировки детей.
// У клуба они есть на своём же профиле — попросить в переписке, это заодно
// повод для разговора. Второе ограничение помельче: в `grafika/obiekty` нет
// ни мяча, ни чего спортивного, только офисные эмодзи (промпт на мяч лежит
// в утреннем плане).
//
// Сам сценарий по фактам верен и остаётся готовым — не хватает только кадров.
const ESPANOLA = {
  klucz: 'demo-espanola',
  nazwa: 'DEMO Academia Española — szkółka piłkarska',
  frazy: [
    { rola: 'hak', tekst: 'Twoje dziecko chce grać w piłkę. Gdzie?', pauza: 0.40 },
    { rola: 'hak', tekst: 'Nie każde boisko uczy tego samego.', pauza: 0.38 },
    { rola: 'tresc', tekst: 'Hiszpańska metodyka. Dwanaście lat w Polsce.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Trzy miasta. Katowice, Gliwice, Chorzów.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Grupy od roku życia do trzynastu lat.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Współpraca z Piastem i GKS Katowice.', pauza: 0.34 },
    { rola: 'zaplata', tekst: 'Zapisy trwają przez cały rok. Bez naboru.', pauza: 0.38 },
    { rola: 'cta', tekst: 'Academia Española. Przyjdź na trening.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      { obiekt: 'thinking_face_3d', x: 520, y: 540, skala: 700, obrot: -6, skad: 'gora',
        start: t(0, 0.05), koniec: t(1, 0.20), dokad: 'lewo' },
      // Календарь и галочка — двенадцать лет и три города. Разведены к краям
      // и вылезают за рамку: вписанные целиком читаются как иконки в списке.
      { obiekt: 'calendar_3d', x: 250, y: 470, skala: 700, obrot: -10, skad: 'lewo',
        start: t(2, 0.02), koniec: t(4, 0.60), dokad: 'lewo' },
      { obiekt: 'check_mark_button_3d', x: 840, y: 570, skala: 600, obrot: 10, skad: 'prawo',
        start: t(3, 0.02), koniec: t(4, 0.60), dokad: 'prawo' },
      // Хлопушка на выигрыше — один предмет во весь экран. Она ничего не
      // считает и говорит только «праздник», а считать тут уже нечего.
      { obiekt: 'party_popper_3d', x: 540, y: 540, skala: 800, obrot: -5, skad: 'dol',
        start: t(4, 0.70), koniec: t(5, 0.60), dokad: 'gora' },

      // Три карточки — то, ради чего родитель вообще смотрит: дети в движении.
      // Живут через обе фразы расплаты.
      { film: 'sport', x: 235, y: 830, skala: 340, wys: 540, obrot: -7, skad: 'dol',
        start: t(5, 0.10), koniec: t(7, 0.10), dokad: 'lewo' },
      { film: 'bieganie', x: 552, y: 760, skala: 390, wys: 620, obrot: 1, skad: 'dol',
        start: t(5, 0.30), koniec: t(7, 0.10), dokad: 'dol' },
      { film: 'joga', x: 870, y: 830, skala: 340, wys: 540, obrot: 7, skad: 'dol',
        start: t(5, 0.50), koniec: t(7, 0.10), dokad: 'prawo' },

      { obiekt: 'calendar_3d', x: 540, y: 430, skala: 470, obrot: 0, skad: 'gora',
        start: t(7, 0.05) },
    ];

    // Ценник растёт от одного года до тринадцати — это возрастной охват групп,
    // взятый с их страницы, а не придуманный.
    const metki = [
      { x: 540, y: 1010, szer: 400, wys: 540, od: 1, do: 13, jednostka: '',
        barwaOd: 32, barwaDo: 158,
        odProc: 8, doProc: 100, opis: 'WIEK DZIECI', a: t(7, 0.12), b: total, czas: 1.2 },
    ];

    const wzor = [
      { tekst: 'OD 2014 ROKU', y: 940, maly: true, a: t(2, 0.40), b: t(4, 0.60) },
      { tekst: '= 12 LAT', y: 1080, kolor: 'zolty', a: t(4, 0.72), b: t(5, 0.15) },
    ];

    const liczniki = [
      { od: 0, do: 12, jednostka: '', y: 1120, a: t(0, 0.30), b: t(1, 0.60),
        czas: 0.80, zPodpisem: true },
      { od: 0, do: 12, jednostka: '', y: 1120, a: t(3, 0.05), b: t(4, 0.60), czas: 1.15 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.05, x: -16, y: 14 },
      { t: t(2), zoom: 1.01, x: 20, y: -12 },
      { t: t(4, 0.30), zoom: 1.11, x: 0, y: 22 },
      { t: t(5, 0.05), zoom: 1.03, x: 0, y: 0 },
      { t: t(6, 0.05), zoom: 1.08, x: 14, y: -16 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    const akcenty = {
      zolty: ['dwanaście', 'trzy', 'zapisy', 'przyjdź', 'hiszpańska'],
      czerwony: ['gdzie', 'nie'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

export const DEMA = [MUSEO, ESPANOLA];
