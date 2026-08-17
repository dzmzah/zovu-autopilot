// Банк сценариев рисованных рилсов.
//
// До 18.08 сценарий был один и вшит прямо в rolka-grafika.mjs: чтобы снять
// второй ролик, надо было переписать файл. Пока проверяли саму технологию,
// это было честно; теперь ролики нужны пачкой, и сценарий стал данными.
//
// Каждый сценарий отдаёт ОДНО И ТО ЖЕ: реплики и хореографию под них.
// Хореография — функция от таймингов голоса: `t(i, d)` это начало i-й фразы
// плюс d секунд. Поэтому один и тот же сценарий одинаково работает и на
// пробе по слогам, и на живом дубле ElevenLabs, который всегда длиннее.
//
// Правила, снятые с эталонов Захара и повторяющиеся во всех трёх:
//   · объект приходит под свою фразу и УХОДИТ, когда мысль сменилась;
//   · цифра никогда не появляется готовой — она накручивается на экране;
//   · крупный объект обрезается краем кадра, иначе читается как наклейка;
//   · камера едет весь ролик, на смысловых точках — подрыв;
//   · цвет по смыслу: жёлтый — выгода, красный — потеря.

// ── 1. Сколько времени съедает Instagram ─────────────────────────
// Построен как ВЫЧИСЛЕНИЕ, а не «три пункта»: голос считает вслух, картинка
// складывает вместе с ним. Арифметика честная: 20 минут × 30 дней = 10 часов.
const CZAS = {
  klucz: 'czas',
  nazwa: 'Ile czasu zjada Instagram',
  frazy: [
    // Замер первого дубля: хук шёл 6,1 слог/с при планке 5,0 — тараторил.
    // Лечится не растяжкой, а точкой внутри фразы: на точке модель делает
    // настоящую паузу, темп падает сам, и ролик открывается одним словом.
    { rola: 'hak', tekst: 'Instagram. Ile czasu ci zjada?', pauza: 0.34 },
    { rola: 'hak', tekst: 'Policzmy.', pauza: 0.42 },
    { rola: 'tresc', tekst: 'Jeden post to dwadzieścia minut.', pauza: 0.30 },
    { rola: 'tresc', tekst: 'Razy trzydzieści dni.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Dziesięć godzin miesięcznie. Twoich.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Te dziesięć godzin możesz oddać.', pauza: 0.34 },
    { rola: 'zaplata', tekst: 'Komuś, kto robi to codziennie.', pauza: 0.30 },
    { rola: 'cta', tekst: 'Napisz CZAS, a policzymy twoje.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      // Размеры сняты с эталонов: объект занимает половину кадра и обрезается
      // краем. У эмодзи Fluent прозрачные поля по краям PNG, поэтому числа
      // заметно больше тех, что кажутся нужными.
      { obiekt: 'mobile_phone_3d', x: 520, y: 560, skala: 760, obrot: -6, skad: 'gora',
        start: t(0, 0.05), koniec: t(1, 0.10), dokad: 'lewo' },
      // Часы и календарь — пара слагаемых. Разводим к краям и даём вылезти за
      // рамку: два предмета, вписанные целиком, читаются как иконки в списке.
      { obiekt: 'alarm_clock_3d', x: 250, y: 470, skala: 700, obrot: -10, skad: 'lewo',
        start: t(2, 0.02), koniec: t(4, 0.55), dokad: 'lewo' },
      { obiekt: 'calendar_3d', x: 830, y: 560, skala: 640, obrot: 9, skad: 'prawo',
        start: t(3, 0.02), koniec: t(4, 0.55), dokad: 'prawo' },
      // Расплата — самый крупный кадр ролика: одна вещь во весь экран.
      { obiekt: 'money_with_wings_3d', x: 540, y: 540, skala: 820, obrot: -5, skad: 'gora',
        start: t(4, 0.35), koniec: t(5, 0.15), dokad: 'gora' },
      // Три карточки с ЖИВЫМ видео — то, чего в рисованном ролике не было.
      // Голос говорит «отдать тому, кто делает это каждый день», карточки
      // показывают, ЧТО он делает: барбер, мода, красота — наши же нишы.
      // Середина крупнее боковых: тройка одинаковых читается как таблица.
      { film: 'barber', x: 235, y: 830, skala: 340, wys: 540, obrot: -7, skad: 'dol',
        start: t(5, 0.05), koniec: t(7, 0.05), dokad: 'lewo' },
      { film: 'moda', x: 552, y: 760, skala: 390, wys: 620, obrot: 1, skad: 'dol',
        start: t(5, 0.20), koniec: t(7, 0.05), dokad: 'dol' },
      { film: 'uroda', x: 870, y: 830, skala: 340, wys: 540, obrot: 7, skad: 'dol',
        start: t(5, 0.35), koniec: t(7, 0.05), dokad: 'prawo' },
      // Конверт уходит наверх и уменьшается: под ним ценник, и два крупных
      // предмета в одном кадре дерутся за взгляд.
      { obiekt: 'envelope_3d', x: 540, y: 430, skala: 480, obrot: 0, skad: 'gora',
        start: t(7, 0.02) },
    ];

    // Ценник: число падает, шкала уезжает, на посадке вспышка. Держит не
    // цифра, а ПАДЕНИЕ — глаз следит за полосой и ждёт, где она встанет.
    // Считаем честно: те самые десять часов уходят в ноль. Придумывать сюда
    // злотые нельзя — мы не знаем ни ставки зрителя, ни своего ценника.
    const metki = [
      { x: 540, y: 1010, szer: 400, wys: 540, od: 10, do: 0, jednostka: 'H',
        odProc: 100, doProc: 0, opis: 'TWOJE GODZINY', a: t(7, 0.10), b: total, czas: 1.1 },
    ];

    // Ответ приходит ПОСЛЕ того, как слагаемые ушли, и на их место.
    const wzor = [
      { tekst: '20 MIN × 30 DNI', y: 940, maly: true, a: t(2, 0.35), b: t(4, 0.55) },
      { tekst: '= 10 GODZIN', y: 1080, kolor: 'czerwony', a: t(4, 0.68), b: t(5, 0.10) },
    ];

    // Умножение не пишется, а СЧИТАЕТСЯ. В хуке цифра дразнит (быстро),
    // в середине выводится (медленнее). Повтор намеренный: в двадцати
    // секундах ключевую цифру запоминают со второго раза.
    const liczniki = [
      { od: 0, do: 600, jednostka: 'MIN', y: 1120, a: t(0, 0.30), b: t(1, 0.55),
        czas: 0.85, zPodpisem: true },
      { od: 0, do: 600, jednostka: 'MIN', y: 1120, a: t(3, 0.05), b: t(4, 0.55), czas: 1.25 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.05, x: -18, y: 10 },
      { t: t(2), zoom: 1.02, x: 20, y: -12 },
      { t: t(4, 0.25), zoom: 1.12, x: 0, y: 24 },
      { t: t(4, 0.90), zoom: 1.04, x: 0, y: 0 },
      { t: t(5, 0.20), zoom: 1.08, x: 14, y: -16 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    const akcenty = {
      zolty: ['policzmy', 'oddać', 'codziennie', 'czas', 'policzymy'],
      czerwony: ['zjada', 'dziesięć', 'godzin', 'twoich'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

// ── 2. Клиент написал, а ответ идёт сутки ────────────────────────
// Тот же приём вычисления, но считаем не время работы, а время ОЖИДАНИЯ.
// Ни одной выдуманной статистики: цифра 18 часов — это пересказ собственной
// же посылки «отвечаешь завтра», а не замер рынка. Всё, что мы утверждаем о
// клиенте, проверяемо на себе: человек спрашивает несколько фирм и выбирает
// ту, что ответила.
const ODPOWIEDZ = {
  klucz: 'odpowiedz',
  nazwa: 'Klient napisał, odpowiadasz jutro',
  frazy: [
    // Первая версия была набрана нарочито короткими фразами: «Klient
    // napisał.» (четыре слога), «Tylko spóźniona.» (пять). Замер дубля:
    // четыре фразы из восьми торопливых, до 6,2 слог/с при планке 5,6 —
    // ровно та грабля, что уже ловили: КОРОТКУЮ фразу модель гонит даже на
    // speed 0.94, потому что паузу внутри неё делать негде.
    //
    // Лечится не растяжкой (от неё слышно ИИ), а длиной и точкой внутри:
    // девять-четырнадцать слогов, у хука разрыв на две мысли. Проверка —
    // повторный замер, а не слух.
    { rola: 'hak', tekst: 'Klient napisał wieczorem. Pyta o cenę.', pauza: 0.40 },
    { rola: 'hak', tekst: 'Odpowiadasz dopiero jutro rano.', pauza: 0.38 },
    { rola: 'tresc', tekst: 'On w tym czasie pyta trzy inne firmy.', pauza: 0.32 },
    { rola: 'tresc', tekst: 'Żadna z nich nie czeka do jutra.', pauza: 0.36 },
    { rola: 'tresc', tekst: 'Wybiera tę, która odpisała pierwsza.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Twoja oferta była lepsza. Naprawdę.', pauza: 0.32 },
    { rola: 'zaplata', tekst: 'Tylko przyszła o dzień za późno.', pauza: 0.40 },
    { rola: 'cta', tekst: 'Napisz SZYBKO, a ustawimy odpowiedzi.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      // Конверт в хуке — само событие «написал». Крупно и с обрезкой краем.
      { obiekt: 'envelope_3d', x: 520, y: 540, skala: 780, obrot: -5, skad: 'gora',
        start: t(0, 0.05), koniec: t(1, 0.55), dokad: 'lewo' },
      // Песочные часы вместо будильника: будильник говорит о времени, часы —
      // об ОЖИДАНИИ. На фразе «отвечаешь завтра» это ровно та разница.
      { obiekt: 'hourglass_not_done_3d', x: 560, y: 520, skala: 700, obrot: 7, skad: 'prawo',
        start: t(1, 0.60), koniec: t(2, 0.35), dokad: 'gora' },

      // Три карточки = три фирмы, которых он спросил. Приходят по одной под
      // счёт голоса: одновременный влёт тройки читается как таблица, а
      // по одной — как перебор вариантов, чем это и является.
      { film: 'barber', x: 235, y: 820, skala: 340, wys: 540, obrot: -8, skad: 'dol',
        start: t(2, 0.10), koniec: t(4, 0.85), dokad: 'lewo' },
      { film: 'ekrany', x: 552, y: 750, skala: 390, wys: 620, obrot: 2, skad: 'dol',
        start: t(2, 0.45), koniec: t(4, 0.85), dokad: 'gora' },
      // Не `marka`: там кроссовок на ярко-синем, и карточка читается как чужая
      // реклама обуви, а не как «третья фирма, которую он спросил».
      { film: 'wnetrza', x: 870, y: 820, skala: 340, wys: 540, obrot: 8, skad: 'dol',
        start: t(2, 0.80), koniec: t(4, 0.85), dokad: 'prawo' },

      // Галочка — выбор, сделанный без тебя. Один предмет во весь экран:
      // это самый крупный кадр ролика, как деньги в первом сценарии.
      { obiekt: 'check_mark_button_3d', x: 540, y: 560, skala: 800, obrot: -4, skad: 'prawo',
        start: t(4, 0.55), koniec: t(5, 0.55), dokad: 'gora' },
      // Крестик на «tylko spóźniona» — расплата. Красный предмет под красную
      // строку: цвет объекта и цвет текста должны говорить одно и то же.
      { obiekt: 'cross_mark_3d', x: 540, y: 500, skala: 560, obrot: 6, skad: 'dol',
        start: t(6, 0.02), koniec: t(7, 0.02), dokad: 'dol' },
      // Телефон на призыве: действие, которое мы просим, происходит в нём.
      { obiekt: 'mobile_phone_3d', x: 540, y: 430, skala: 470, obrot: 0, skad: 'gora',
        start: t(7, 0.05) },
    ];

    // Ценник считает ЧУЖОЙ выигрыш, а не твой: у той фирмы ожидание было
    // одна минута. Падение с 18 часов до минуты — вся мысль ролика одним
    // движением, и цифры обе взяты из собственной посылки.
    const metki = [
      // Цвет к зелёному: падение с восемнадцати часов до одного — это то, что
      // мы предлагаем, а не то, чем пугаем. Штатный оранжевый финал сказал бы
      // «тревога» ровно там, где должно читаться «так лучше».
      { x: 540, y: 1010, szer: 400, wys: 540, od: 18, do: 1, jednostka: 'H',
        barwaOd: 32, barwaDo: 158,
        odProc: 100, doProc: 6, opis: 'CZAS ODPOWIEDZI', a: t(7, 0.12), b: total, czas: 1.2 },
    ];

    const wzor = [
      // Строка ПОД карточками, а не на них. На 940 она садилась ровно посреди
      // трёх окон с видео и читалась как надпись поверх картинки — проверка
      // наложений этого не поймала бы, она следит только за текстом.
      { tekst: '3 FIRMY, 1 ODPOWIEDŹ', y: 1290, maly: true, a: t(2, 0.40), b: t(4, 0.85) },
      { tekst: '= NIE TWOJA', y: 1080, kolor: 'czerwony', a: t(4, 0.95), b: t(5, 0.60) },
    ];

    // Счётчик часов ожидания. В хуке докручивается до восемнадцати — столько
    // и есть «до завтра». Второй раз тот же счёт на фразе «nie czeka»:
    // цифру запоминают со второго показа.
    const liczniki = [
      { od: 0, do: 18, jednostka: 'H', y: 1120, a: t(1, 0.10), b: t(2, 0.30),
        czas: 0.85, zPodpisem: true },
      { od: 0, do: 18, jednostka: 'H', y: 1120, a: t(3, 0.05), b: t(4, 0.30), czas: 1.15 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.06, x: 16, y: 12 },
      { t: t(2), zoom: 1.01, x: -20, y: -10 },
      { t: t(4, 0.20), zoom: 1.10, x: 0, y: 20 },
      { t: t(5, 0.05), zoom: 1.03, x: 0, y: 0 },
      { t: t(6, 0.05), zoom: 1.09, x: -14, y: -18 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    // Слова сверены с новым текстом дословно: подсветка ищет точную форму, и
    // «spóźniona» из первой версии просто никогда бы не сработала — молча.
    const akcenty = {
      zolty: ['pierwsza', 'szybko', 'odpowiedzi', 'ustawimy'],
      czerwony: ['jutro', 'jutra', 'późno', 'trzy', 'żadna'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

// ── 3. Ритм против рывка ─────────────────────────────────────────
// Единственный из трёх, где расплата не потеря, а ВЫГОДА, — поэтому ответ
// набран жёлтым, а не красным. Держать все ролики на одной ноте страха
// нельзя: лента из одних «ты теряешь» перестаёт работать к третьему разу.
// Арифметика опять своя: 2 поста × 4 недели = 8 в месяц.
const RYTM = {
  klucz: 'rytm',
  nazwa: 'Rytm bije zryw',
  frazy: [
    { rola: 'hak', tekst: 'Dziesięć postów w jeden dzień.', pauza: 0.36 },
    { rola: 'hak', tekst: 'Potem cisza na miesiąc.', pauza: 0.40 },
    { rola: 'tresc', tekst: 'Zrób inaczej. Dwa razy w tygodniu.', pauza: 0.32 },
    { rola: 'tresc', tekst: 'Razy cztery tygodnie.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Osiem postów miesięcznie. Bez zrywu.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Ten sam wysiłek co wcześniej.', pauza: 0.32 },
    { rola: 'zaplata', tekst: 'Ludzie zapamiętują rytm.', pauza: 0.40 },
    { rola: 'cta', tekst: 'Napisz RYTM, a ułożymy plan.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      // Столбики в хуке — «десять за день»: одна высокая колонна и пусто
      // дальше. Предмет въезжает снизу и уходит вниз же: рывок начинается
      // и заканчивается на том же месте, ничего после себя не оставляя.
      { obiekt: 'bar_chart_3d', x: 520, y: 560, skala: 760, obrot: -7, skad: 'dol',
        start: t(0, 0.05), koniec: t(1, 0.55), dokad: 'dol' },
      // Песочные часы на «potem cisza na miesiąc». Без них между рывком и
      // новым счётом оставалось две секунды пустого кадра — по смыслу это и
      // была тишина, но в первые пять секунд пустота читается не как приём,
      // а как «ролик кончился», и палец идёт дальше.
      { obiekt: 'hourglass_not_done_3d', x: 560, y: 540, skala: 620, obrot: 8, skad: 'prawo',
        start: t(1, 0.70), koniec: t(2, 0.30), dokad: 'gora' },
      // Календарь и галочка — пара слагаемых нового счёта.
      { obiekt: 'calendar_3d', x: 250, y: 480, skala: 700, obrot: -9, skad: 'lewo',
        start: t(2, 0.05), koniec: t(4, 0.60), dokad: 'lewo' },
      { obiekt: 'check_mark_button_3d', x: 840, y: 570, skala: 600, obrot: 10, skad: 'prawo',
        start: t(3, 0.02), koniec: t(4, 0.60), dokad: 'prawo' },
      // Растущий график во весь кадр — единственный предмет на выигрыше.
      { obiekt: 'chart_increasing_3d', x: 540, y: 540, skala: 820, obrot: -5, skad: 'dol',
        start: t(4, 0.40), koniec: t(5, 0.20), dokad: 'gora' },

      // Карточки живут через обе фразы расплаты: «тот же труд — люди
      // запоминают ритм». Показываем ленты, которые ведутся ровно.
      { film: 'marka2', x: 235, y: 820, skala: 340, wys: 540, obrot: -7, skad: 'dol',
        start: t(5, 0.10), koniec: t(7, 0.05), dokad: 'lewo' },
      { film: 'kawa', x: 552, y: 750, skala: 390, wys: 620, obrot: 1, skad: 'dol',
        start: t(5, 0.30), koniec: t(7, 0.05), dokad: 'dol' },
      { film: 'nowoczesne', x: 870, y: 820, skala: 340, wys: 540, obrot: 7, skad: 'dol',
        start: t(5, 0.50), koniec: t(7, 0.05), dokad: 'prawo' },

      { obiekt: 'envelope_3d', x: 540, y: 430, skala: 470, obrot: 0, skad: 'gora',
        start: t(7, 0.05) },
    ];

    // Ценник растёт, а не падает — единственный такой из трёх. Ноль постов
    // в «тихом» месяце против восьми в ровном: обе цифры из нашего же счёта.
    const metki = [
      // Цвет ведём НАОБОРОТ остальных: штатно бирка идёт от спокойного к
      // горячему, потому что там число падает. Здесь оно растёт, и оранжевый
      // финал сказал бы «тревога» о том, что мы предлагаем как выигрыш.
      { x: 540, y: 1010, szer: 400, wys: 540, od: 0, do: 8, jednostka: '',
        barwaOd: 32, barwaDo: 158,
        odProc: 0, doProc: 100, opis: 'POSTÓW W MIESIĄCU', a: t(7, 0.12), b: total, czas: 1.2 },
    ];

    const wzor = [
      { tekst: '2 × 4 TYGODNIE', y: 940, maly: true, a: t(2, 0.60), b: t(4, 0.60) },
      { tekst: '= 8 POSTÓW', y: 1080, kolor: 'zolty', a: t(4, 0.72), b: t(5, 0.15) },
    ];

    const liczniki = [
      // Хук: десять постов за день. Крутится быстро — это рывок.
      { od: 0, do: 10, jednostka: '', y: 1120, a: t(0, 0.30), b: t(1, 0.60),
        czas: 0.70, zPodpisem: true },
      // Середина: тот же счёт, но уже про ровный месяц.
      { od: 0, do: 8, jednostka: '', y: 1120, a: t(3, 0.05), b: t(4, 0.60), czas: 1.15 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.05, x: -16, y: 14 },
      { t: t(2), zoom: 1.01, x: 20, y: -12 },
      { t: t(4, 0.30), zoom: 1.11, x: 0, y: 22 },
      { t: t(4, 0.95), zoom: 1.03, x: 0, y: 0 },
      { t: t(5, 0.25), zoom: 1.08, x: 14, y: -16 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    const akcenty = {
      zolty: ['osiem', 'rytm', 'zapamiętują', 'ułożymy'],
      czerwony: ['cisza', 'dziesięć', 'zrywu'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

export const SCENARIUSZE = [CZAS, ODPOWIEDZ, RYTM];

// Выбор сценария: по ключу из аргумента или по кругу из состояния. Круг, а не
// случайность: лента должна перебирать все, а не тыкать в один и тот же.
export function wybierzScenariusz(klucz, stan = {}) {
  if (klucz) {
    const s = SCENARIUSZE.find((x) => x.klucz === klucz);
    if (!s) {
      throw new Error(
        `[grafika] нет сценария «${klucz}». Есть: ${SCENARIUSZE.map((x) => x.klucz).join(', ')}`
      );
    }
    return { scenariusz: s, idx: SCENARIUSZE.indexOf(s) };
  }
  const idx = ((stan.grafikaScen ?? -1) + 1) % SCENARIUSZE.length;
  return { scenariusz: SCENARIUSZE[idx], idx };
}
