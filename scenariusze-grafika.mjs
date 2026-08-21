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
    { rola: 'cta', tekst: 'Ile godzin wychodzi tobie? Napisz w komentarzu.', pauza: 0.20 },
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
    // Лечится не растяжкой (от неё слышно ИИ), а точкой внутри фразы.
    //
    // Второй замер это доказал: одной ДЛИНЫ мало. Фразы стали на 10-14 слогов,
    // и всё равно четыре из восьми ушли за планку, а две — до 7,1 и 6,8. Зато
    // в соседнем сценарии «rytm» дубль лёг с первого раза (2,8-5,1) — и там
    // почти в каждой фразе есть точка ВНУТРИ либо числительное. Модель делает
    // настоящую паузу на точке и притормаживает на числительном; ровный поток
    // слов без знаков препинания она проговаривает скороговоркой независимо
    // от того, четыре в нём слога или четырнадцать.
    //
    // Поэтому здесь у КАЖДОЙ фразы есть внутренняя точка. Проверка — замер,
    // а не слух.
    { rola: 'hak', tekst: 'Klient pyta o cenę.', pauza: 0.40 },
    { rola: 'hak', tekst: 'Napisał wieczorem. Ty odpowiadasz rano.', pauza: 0.38 },
    { rola: 'tresc', tekst: 'On w tym czasie pyta trzy inne firmy.', pauza: 0.32 },
    { rola: 'tresc', tekst: 'Żadna z nich nie czeka. Ani jedna.', pauza: 0.36 },
    { rola: 'tresc', tekst: 'Wybiera pierwszą odpowiedź. Nie najlepszą.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Twoja oferta była lepsza. Naprawdę.', pauza: 0.32 },
    { rola: 'zaplata', tekst: 'Tylko przyszła za późno. O jeden dzień.', pauza: 0.40 },
    { rola: 'cta', tekst: 'Wyślij to wspólnikowi, jeśli odpisujecie na zmianę.', pauza: 0.20 },
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
      zolty: ['pierwszą', 'szybko', 'odpowiedzi', 'ustawimy'],
      czerwony: ['jutro', 'późno', 'trzy', 'żadna', 'najlepszą'],
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
    { rola: 'cta', tekst: 'Zapisz sobie ten rachunek na poniedziałek.', pauza: 0.20 },
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

// ── 4. Godzina zdjęć na cały miesiąc ─────────────────────────────
// Ролик про ВЫГОДУ, а не про потерю: ответ жёлтый, ценник растёт и ведёт к
// зелёному. Двух «ты теряешь» подряд лента не прощает.
// Арифметика своя и делится ровно: 12 кадров с одной съёмки, по 3 в неделю —
// это 4 недели, то есть 28 дней. Ни одной цифры «с рынка»: и 12, и 3 — наша
// собственная посылка, а 28 получается из них умножением.
const SESJA = {
  klucz: 'sesja',
  nazwa: 'Godzina zdjęć na cały miesiąc',
  frazy: [
    // Длина каждой фразы 9-14 слогов и точка внутри хука. Короткую фразу
    // ElevenLabs гонит: замер давал 6,2 слог/с при планке 5,6, и растяжкой
    // это не лечится — от неё слышно ИИ. Лечится длиной и настоящей паузой.
    { rola: 'hak', tekst: 'Godzina zdjęć.', pauza: 0.40 },
    { rola: 'hak', tekst: 'I masz spokój na miesiąc. To zwykły rachunek.', pauza: 0.38 },
    { rola: 'tresc', tekst: 'Jedna sesja to dwanaście kadrów.', pauza: 0.32 },
    { rola: 'tresc', tekst: 'Wystawiasz trzy kadry na tydzień.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Cztery tygodnie z jednej godziny.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Nic nie wymyślasz w niedzielę.', pauza: 0.34 },
    { rola: 'zaplata', tekst: 'Zdjęcia czekają gotowe w folderze.', pauza: 0.38 },
    { rola: 'cta', tekst: 'Napisz SESJA, a zaplanujemy zdjęcia.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      // Телефон в хуке — то, чем эта «сессия» и снимается. Крупно и с
      // обрезкой краем кадра: вписанный целиком предмет читается наклейкой.
      { obiekt: 'mobile_phone_3d', x: 520, y: 560, skala: 780, obrot: -6, skad: 'gora',
        start: t(0, 0.05), koniec: t(1, 0.15), dokad: 'lewo' },
      // «Brzmi dziwnie» — вопрос в кадре, а не пустое место: без предмета
      // вторая фраза хука провисает, а провис в первые пять секунд читается
      // как «ролик кончился».
      { obiekt: 'thinking_face_3d', x: 560, y: 520, skala: 660, obrot: 8, skad: 'prawo',
        start: t(1, 0.20), koniec: t(2, 0.30), dokad: 'gora' },
      // Пара слагаемых: секундомер — час съёмки, календарь — недели.
      // Разведены к краям и вылезают за рамку.
      { obiekt: 'stopwatch_3d', x: 250, y: 470, skala: 700, obrot: -10, skad: 'lewo',
        start: t(2, 0.02), koniec: t(4, 0.60), dokad: 'lewo' },
      { obiekt: 'calendar_3d', x: 830, y: 560, skala: 640, obrot: 9, skad: 'prawo',
        start: t(3, 0.02), koniec: t(4, 0.60), dokad: 'prawo' },
      // Самый крупный кадр ролика — одна вещь во весь экран. Часы «готово»,
      // а не «песочные с песком»: разница между «время идёт» и «уже сделано».
      { obiekt: 'hourglass_done_3d', x: 540, y: 540, skala: 820, obrot: -5, skad: 'dol',
        start: t(4, 0.40), koniec: t(5, 0.20), dokad: 'gora' },

      // Три карточки с живым видео на расплате: это и есть тот отснятый
      // материал, который лежит готовым. Середина крупнее и выше боковых —
      // тройка одинаковых читается как таблица.
      // Не `kosmetyki`: там на флаконах читаются «Luxury Serum» и «Premium
      // Skincare», и карточка выглядит рекламой чужого бренда.
      { film: 'fotostudio', x: 235, y: 830, skala: 340, wys: 540, obrot: -7, skad: 'dol',
        start: t(5, 0.18), koniec: t(7, 0.05), dokad: 'lewo' },
      { film: 'moda', x: 552, y: 755, skala: 390, wys: 620, obrot: 1, skad: 'dol',
        start: t(5, 0.36), koniec: t(7, 0.05), dokad: 'dol' },
      { film: 'kwiaty', x: 870, y: 830, skala: 340, wys: 540, obrot: 7, skad: 'dol',
        start: t(5, 0.54), koniec: t(7, 0.05), dokad: 'prawo' },

      { obiekt: 'envelope_3d', x: 540, y: 430, skala: 470, obrot: 0, skad: 'gora',
        start: t(7, 0.05) },
    ];

    // Ценник РАСТЁТ и ведёт к зелёному: один час превращается в 28 дней
    // контента. Обе цифры из нашего же счёта — 4 недели это 28 дней.
    const metki = [
      { x: 540, y: 1010, szer: 400, wys: 540, od: 1, do: 28, jednostka: '',
        barwaOd: 32, barwaDo: 158,
        odProc: 4, doProc: 100, opis: 'DNI TREŚCI', a: t(7, 0.12), b: total, czas: 1.2 },
    ];

    const wzor = [
      { tekst: '12 KADRÓW ÷ 3', y: 940, maly: true, a: t(2, 0.55), b: t(4, 0.60) },
      // Ответ жёлтый: это выигрыш, а не потеря. Красный сказал бы «тревога»
      // ровно там, где должно читаться «так лучше».
      { tekst: '= 4 TYGODNIE', y: 1080, kolor: 'zolty', a: t(4, 0.72), b: t(5, 0.08) },
    ];

    // Ключевая цифра показывается дважды: в хуке быстро — она дразнит, в
    // середине медленнее — она выводится. Со второго раза её запоминают.
    const liczniki = [
      { od: 0, do: 12, jednostka: '', y: 1120, a: t(0, 0.30), b: t(1, 0.55),
        czas: 0.75, zPodpisem: true },
      { od: 0, do: 12, jednostka: '', y: 1120, a: t(3, 0.05), b: t(4, 0.55), czas: 1.15 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.06, x: -16, y: 12 },
      { t: t(2), zoom: 1.01, x: 20, y: -12 },
      { t: t(4, 0.30), zoom: 1.12, x: 0, y: 22 },
      { t: t(4, 0.95), zoom: 1.03, x: 0, y: 0 },
      { t: t(5, 0.30), zoom: 1.08, x: 14, y: -16 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    // Каждое слово сверено с текстом дословно: подсветка ищет точную форму и
    // на непопавшемся слове молча не работает.
    const akcenty = {
      zolty: ['spokój', 'cztery', 'gotowe', 'sesja', 'zaplanujemy'],
      czerwony: ['wymyślasz', 'niedzielę'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

// ── 5. Pierwsze sześć kadrów profilu ─────────────────────────────
// Арифметика не про время, а про то, что физически видно на экране: сетка
// профиля это три кадра в ряд, а на первый экран влезает два ряда — шесть.
// Это проверяемая правда об интерфейсе, а не статистика рынка. Про зрителя
// мы ничего не утверждаем: просим посмотреть на свои шесть и ответить самому.
const PROFIL = {
  klucz: 'profil',
  nazwa: 'Pierwsze sześć kadrów profilu',
  frazy: [
    { rola: 'hak', tekst: 'Ktoś wchodzi na twój profil.', pauza: 0.40 },
    { rola: 'hak', tekst: 'Pierwszy raz. Widzi sześć kadrów i nic więcej.', pauza: 0.38 },
    { rola: 'tresc', tekst: 'Trzy w rzędzie, dwa rzędy. Tyle widać.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Sześć zdjęć decyduje o tobie.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Zobacz swoje. Co z nich rozumiesz?', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Dalej nikt nie schodzi. Zamyka i wychodzi.', pauza: 0.36 },
    { rola: 'zaplata', tekst: 'Sześć kadrów, jedna myśl. Tyle wystarczy.', pauza: 0.38 },
    { rola: 'cta', tekst: 'Napisz PROFIL, a przejrzymy twoje kadry.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      // Глаза в хуке — тот, кто зашёл. Крупно, с обрезкой краем.
      { obiekt: 'eyes_3d', x: 520, y: 540, skala: 780, obrot: -5, skad: 'gora',
        start: t(0, 0.05), koniec: t(1, 0.10), dokad: 'lewo' },
      // Телефон — то, в чём он это листает.
      { obiekt: 'mobile_phone_3d', x: 560, y: 540, skala: 700, obrot: 7, skad: 'prawo',
        start: t(1, 0.15), koniec: t(2, 0.30), dokad: 'gora' },
      // Календарь взят не за смысл «дни», а за форму: это единственная в
      // наборе СЕТКА из клеток, а считаем мы ровно сетку профиля.
      { obiekt: 'calendar_3d', x: 250, y: 480, skala: 700, obrot: -9, skad: 'lewo',
        start: t(2, 0.02), koniec: t(4, 0.55), dokad: 'lewo' },
      { obiekt: 'thinking_face_3d', x: 840, y: 570, skala: 620, obrot: 10, skad: 'prawo',
        start: t(3, 0.05), koniec: t(4, 0.55), dokad: 'prawo' },
      // Крестик во весь экран — самый крупный кадр ролика. Красный предмет
      // под красную строку: цвет объекта и цвет текста говорят одно и то же.
      { obiekt: 'cross_mark_3d', x: 540, y: 540, skala: 820, obrot: -5, skad: 'dol',
        start: t(4, 0.60), koniec: t(5, 0.10), dokad: 'gora' },

      // Три карточки = те самые кадры на виду. Живут через обе расплаты:
      // сначала «дальше никто не идёт», потом «шести хватит, если они об
      // одном». Середина крупнее и выше боковых.
      { film: 'kawa', x: 235, y: 820, skala: 340, wys: 540, obrot: -8, skad: 'dol',
        start: t(5, 0.20), koniec: t(7, 0.05), dokad: 'lewo' },
      { film: 'uroda', x: 552, y: 750, skala: 390, wys: 620, obrot: 2, skad: 'dol',
        start: t(5, 0.40), koniec: t(7, 0.05), dokad: 'dol' },
      { film: 'spa', x: 870, y: 820, skala: 340, wys: 540, obrot: 8, skad: 'dol',
        start: t(5, 0.60), koniec: t(7, 0.05), dokad: 'prawo' },

      // Лампочка приходит на поворот «jedna myśl»: у второй расплаты должен
      // быть свой такт, иначе кадр к финалу стоит неподвижной кучей.
      // Держим её ВЫШЕ верхнего края средней карточки (её верх на 440): на
      // первой пробе лампочка легла на фото и читалась наклейкой на кадре.
      { obiekt: 'light_bulb_3d', x: 540, y: 310, skala: 390, obrot: -4, skad: 'gora',
        start: t(6, 0.05), koniec: t(7, 0.02), dokad: 'gora' },

      { obiekt: 'envelope_3d', x: 540, y: 430, skala: 470, obrot: 0, skad: 'gora',
        start: t(7, 0.05) },
    ];

    // Падение с шести до одного — это не потеря, а то, что мы предлагаем:
    // свести шесть кадров к одной мысли. Поэтому цвет ведём к зелёному.
    const metki = [
      { x: 540, y: 1010, szer: 400, wys: 540, od: 6, do: 1, jednostka: '',
        barwaOd: 32, barwaDo: 158,
        odProc: 100, doProc: 17, opis: 'JEDNA MYŚL', a: t(7, 0.12), b: total, czas: 1.2 },
    ];

    const wzor = [
      { tekst: '3 W RZĘDZIE × 2', y: 940, maly: true, a: t(2, 0.45), b: t(4, 0.55) },
      { tekst: '= 6 KADRÓW', y: 1080, kolor: 'czerwony', a: t(4, 0.68), b: t(5, 0.12) },
    ];

    const liczniki = [
      { od: 0, do: 6, jednostka: '', y: 1120, a: t(0, 0.30), b: t(1, 0.55),
        czas: 0.70, zPodpisem: true },
      { od: 0, do: 6, jednostka: '', y: 1120, a: t(3, 0.05), b: t(4, 0.50), czas: 1.10 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.05, x: 16, y: 14 },
      { t: t(2), zoom: 1.01, x: -20, y: -10 },
      { t: t(4, 0.25), zoom: 1.11, x: 0, y: 20 },
      { t: t(5, 0.05), zoom: 1.03, x: 0, y: 0 },
      { t: t(6, 0.05), zoom: 1.09, x: -14, y: -18 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    const akcenty = {
      zolty: ['myśl', 'wystarczy', 'profil', 'przejrzymy'],
      czerwony: ['sześć', 'zamyka', 'wychodzi', 'nich'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

// ── 6. Kwadrans dziennie w komentarzach ──────────────────────────
// Второй ролик про ВЫГОДУ: ответ жёлтый, ценник растёт к зелёному.
// Арифметика точная, без округлений в свою пользу: 15 минут × 7 дней = 105
// минут. Именно 105, а не «прawie dwie godziny» — округление уже было бы
// цифрой, которой мы не считали.
const KOMENTARZE = {
  klucz: 'komentarze',
  nazwa: 'Kwadrans dziennie w komentarzach',
  frazy: [
    { rola: 'hak', tekst: 'Kwadrans dziennie.', pauza: 0.40 },
    { rola: 'hak', tekst: 'Tylko na komentarze. Zobacz, ile daje w tygodniu.', pauza: 0.38 },
    { rola: 'tresc', tekst: 'Piętnaście minut razy siedem dni.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'To sto pięć minut rozmów z klientami.', pauza: 0.34 },
    { rola: 'tresc', tekst: 'Prawdziwych rozmów. Nie samych lajków.', pauza: 0.38 },
    { rola: 'zaplata', tekst: 'Ludzie pamiętają, kto im odpisał.', pauza: 0.34 },
    { rola: 'zaplata', tekst: 'Kwadrans dziennie robi tę różnicę.', pauza: 0.38 },
    { rola: 'cta', tekst: 'Kwadrans dziennie. Zapisz i sprawdź przez tydzień.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    const scena = [
      { obiekt: 'mobile_phone_3d', x: 520, y: 550, skala: 780, obrot: -6, skad: 'dol',
        start: t(0, 0.05), koniec: t(1, 0.15), dokad: 'lewo' },
      // «Zobacz» — глаза: слово и предмет говорят одно и то же.
      { obiekt: 'eyes_3d', x: 560, y: 530, skala: 640, obrot: 8, skad: 'prawo',
        start: t(1, 0.20), koniec: t(2, 0.30), dokad: 'gora' },
      // Слагаемые: будильник — четверть часа, календарь — семь дней.
      { obiekt: 'alarm_clock_3d', x: 250, y: 470, skala: 700, obrot: -10, skad: 'lewo',
        start: t(2, 0.02), koniec: t(4, 0.60), dokad: 'lewo' },
      { obiekt: 'calendar_3d', x: 830, y: 560, skala: 640, obrot: 9, skad: 'prawo',
        start: t(3, 0.02), koniec: t(4, 0.60), dokad: 'prawo' },
      // Самый крупный кадр ролика — один предмет во весь экран.
      // Не `hundred_points_3d`: на пробе эмодзи «100» стояло вплотную к
      // ответу «= 105 MINUT», и два разных числа в одном кадре читались как
      // ошибка в счёте. Хлопушка ничего не считает и говорит только «выигрыш».
      { obiekt: 'party_popper_3d', x: 540, y: 540, skala: 820, obrot: -5, skad: 'dol',
        start: t(4, 0.40), koniec: t(5, 0.20), dokad: 'gora' },

      // Карточки — ниши, где клиент пишет в комментарии и ждёт ответа.
      // Справа не `wnetrza`: там пустое кресло на белом, и рядом с двумя
      // живыми кадрами оно читается как выключенная карточка.
      { film: 'kawa', x: 235, y: 830, skala: 340, wys: 540, obrot: -7, skad: 'dol',
        start: t(5, 0.18), koniec: t(7, 0.05), dokad: 'lewo' },
      { film: 'barber', x: 552, y: 755, skala: 390, wys: 620, obrot: 1, skad: 'dol',
        start: t(5, 0.36), koniec: t(7, 0.05), dokad: 'dol' },
      { film: 'jedzenie', x: 870, y: 830, skala: 340, wys: 540, obrot: 7, skad: 'dol',
        start: t(5, 0.54), koniec: t(7, 0.05), dokad: 'prawo' },

      { obiekt: 'envelope_3d', x: 540, y: 430, skala: 470, obrot: 0, skad: 'gora',
        start: t(7, 0.05) },
    ];

    // Ценник растёт: пятнадцать минут в день — это сто пять в неделю. Обе
    // цифры из собственного счёта, ни одной со стороны.
    const metki = [
      { x: 540, y: 1010, szer: 400, wys: 540, od: 15, do: 105, jednostka: 'MIN',
        barwaOd: 32, barwaDo: 158,
        odProc: 14, doProc: 100, opis: 'MINUT W TYGODNIU', a: t(7, 0.12), b: total, czas: 1.2 },
    ];

    const wzor = [
      { tekst: '15 MIN × 7 DNI', y: 940, maly: true, a: t(2, 0.55), b: t(4, 0.60) },
      { tekst: '= 105 MINUT', y: 1080, kolor: 'zolty', a: t(4, 0.72), b: t(5, 0.08) },
    ];

    const liczniki = [
      { od: 0, do: 105, jednostka: 'MIN', y: 1120, a: t(0, 0.30), b: t(1, 0.55),
        czas: 0.80, zPodpisem: true },
      { od: 0, do: 105, jednostka: 'MIN', y: 1120, a: t(3, 0.05), b: t(4, 0.55), czas: 1.20 },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(1), zoom: 1.05, x: -18, y: 10 },
      { t: t(2), zoom: 1.02, x: 20, y: -12 },
      { t: t(4, 0.25), zoom: 1.12, x: 0, y: 24 },
      { t: t(4, 0.90), zoom: 1.04, x: 0, y: 0 },
      { t: t(5, 0.25), zoom: 1.08, x: 14, y: -16 },
      { t: t(7), zoom: 1.02, x: 0, y: 0 },
      { t: total, zoom: 1.10, x: 0, y: 8 },
    ];

    const akcenty = {
      zolty: ['rozmów', 'pamiętają', 'odpisał', 'kwadrans', 'pokażemy'],
      czerwony: ['lajków'],
    };

    return { scena, metki, wzor, liczniki, kamera, akcenty };
  },
};

// ── 7. Пять пунктов, которые ОСТАЮТСЯ на экране ──────────────────
// Первый сценарий с другой грамматикой, а не с другой темой.
//
// Во всех предыдущих объекты СМЕНЯЮТСЯ: пришёл, отработал, ушёл. Это верно
// для рассказа и ровно поэтому у нас ноль сохранений: к моменту призыва на
// экране не осталось ничего, что стоило бы забрать себе. Здесь наоборот —
// строки КОПЯТСЯ, и последние секунды ролика это готовый список, который
// имеет смысл снять скриншотом.
//
// Правило «объекты не копятся» не нарушено, а вывернуто сознательно:
// копится ТЕКСТ, предметов в кадре по-прежнему один за раз.
//
// Ничего не выдумано: это то, что мы сами просим у клиента перед съёмкой.
const LISTA = {
  klucz: 'lista',
  nazwa: 'Pięć rzeczy przed sesją zdjęciową',
  frazy: [
    // Один хук, а не два: проба вышла 29 секунд при планке 20-24. Точка
    // внутри фразы держит темп не хуже разрыва на две реплики.
    { rola: 'hak', tekst: 'Sesja? Pół godziny czekania.', pauza: 0.42 },
    { rola: 'tresc', tekst: 'Chyba że przygotujesz pięć rzeczy. Lista ujęć na kartce.', pauza: 0.30 },
    { rola: 'tresc', tekst: 'Produkty odpakowane i czyste.', pauza: 0.30 },
    { rola: 'tresc', tekst: 'Jedno tło. Nie cztery.', pauza: 0.30 },
    { rola: 'tresc', tekst: 'Ubrania bez wielkich logo.', pauza: 0.30 },
    { rola: 'tresc', tekst: 'Decydent na miejscu.', pauza: 0.36 },
    { rola: 'zaplata', tekst: 'Bez tego fotograf czeka, a płacisz ty.', pauza: 0.34 },
    { rola: 'cta', tekst: 'Wyślij to komuś, kto właśnie umawia sesję.', pauza: 0.20 },
  ],
  buduj({ t, total }) {
    // Предметов мало и они мелкие: главное здесь — список, и спорить с ним
    // нечему. Камера в конце отъезжает, чтобы список читался целиком.
    const scena = [
      { obiekt: 'stopwatch_3d', x: 540, y: 430, skala: 620, obrot: -6, skad: 'gora',
        start: t(0, 0.05), koniec: t(0, 0.90), dokad: 'gora' },
      { obiekt: 'check_mark_button_3d', x: 880, y: 380, skala: 300, obrot: 8, skad: 'prawo',
        start: t(6, 0.05), koniec: t(7, 0.10), dokad: 'prawo' },
    ];

    // Каждая строка приходит под свою фразу и ОСТАЁТСЯ до конца ролика.
    const wzor = [
      { tekst: '1. LISTA UJĘĆ', y: 620, maly: true, a: t(1, 0.10), b: total },
      { tekst: '2. PRODUKTY GOTOWE', y: 760, maly: true, a: t(2, 0.10), b: total },
      { tekst: '3. JEDNO TŁO', y: 900, maly: true, a: t(3, 0.10), b: total },
      { tekst: '4. BEZ WIELKICH LOGO', y: 1040, maly: true, a: t(4, 0.10), b: total },
      // Короче остальных нарочно: в две строки пункт ломает ровный шаг
      // списка, а список тут — главное, что зритель забирает себе.
      { tekst: '5. DECYDENT OBECNY', y: 1180, maly: true, a: t(5, 0.10), b: total },
    ];

    const kamera = [
      { t: 0, zoom: 1.00, x: 0, y: 0 },
      { t: t(0, 0.80), zoom: 1.06, x: 0, y: -14 },
      { t: t(1), zoom: 1.04, x: 0, y: 10 },
      { t: t(3), zoom: 1.02, x: 0, y: 4 },
      { t: t(5, 0.40), zoom: 1.00, x: 0, y: 0 },
      { t: t(6, 0.20), zoom: 1.03, x: 0, y: -8 },
      { t: total, zoom: 1.00, x: 0, y: 0 },
    ];

    const akcenty = {
      zolty: ['pięć', 'przygotujesz', 'zapisz', 'piątkę'],
      czerwony: ['czekanie', 'czeka', 'płacisz'],
    };

    return { scena, wzor, kamera, akcenty, metki: [], liczniki: [] };
  },
};

export const SCENARIUSZE = [CZAS, ODPOWIEDZ, RYTM, SESJA, PROFIL, KOMENTARZE, LISTA];

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
