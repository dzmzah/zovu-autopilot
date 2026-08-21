// Автоматический рилс ZOVU без ведущего.
//
// Собирается целиком из кусков, которые уже проверены на ролике с Kuba:
// караоке-подписи, титры с номерами, дрейф кадра, наезды, врезки, фирменный
// аутро, воздух и щелчки. Разница одна — вместо снятого человека подложка из
// живого стока, а речь синтезируется локально.
//
// Почему без лица. Клип Veo делается руками в браузере и стоит бонусов
// (50 в сутки на 5 клипов). Всё остальное — код, значит повторяется без нас.
// Лицо вернём, когда заработает локальная пересборка губ.
//
// Строение ролика — то, что реально держит досмотр:
//   ХУК (до 3 с) → три пункта → расплата → призыв
// Первая секунда решает всё: сразу боль зрителя, без «cześć» и разогрева.
//
//   node rolka-auto.mjs                  — собрать по сценарию из банка
//   node rolka-auto.mjs --scenariusz=2   — взять другой сценарий
//   node rolka-auto.mjs --bez-kontroli   — не проверять результат замерами
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { zbudujGlos } from './glos.mjs';
import { zbuduj } from './awatar-reel.mjs';
import { searchStock, fetchClip } from './stock.mjs';
import { sprawdzRolke } from './kontrola.mjs';
import { podmienHasztagi } from './tagi.mjs';
import { rozlozNaklejki } from './naklejki.mjs';
import { zeSpizarni, SPIZARNIA } from './spizarnia.mjs';

const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');
const JAWNY = ((process.argv.find((a) => a.startsWith('--scenariusz=')) || '').split('=')[1] || '').trim();
const NR = +JAWNY;
const BEZ_KONTROLI = process.argv.includes('--bez-kontroli');
// Плиты (хук с нулевого кадра и сводка перед аутро) — ПОКА ПО ФЛАГУ.
// Они меняют вид каждого ролика, а вид ленты решает Захар, не я. Пока он не
// посмотрел сравнение, ежедневная сборка идёт как раньше.
const PLYTY = process.argv.includes('--plyty');

// ── банк сценариев ────────────────────────────────────────────────
// Пока их пишем сами. Когда встанет генерация — сюда будет класть Gemini,
// а рамки останутся те же: хук до трёх секунд, три пункта, расплата, призыв.
// `szukaj` — чем искать подложку под этот кусок: смысл фразы, а не её слова.
const SCENARIUSZE = [
  {
    nazwa: 'trzy-bledy-w-postach',
    plyta: { linie: ['3 BŁĘDY', 'W TWOICH POSTACH'], plaszka: '3 BŁĘDY' },
    forma: 'lista',
    temat: 'dlaczego posty nie sprzedają',
    wykres: {
      dni: 14,
      tytul: 'przerwa między postami',
      jednostka: 'dni',
      podpis: 'a algorytm liczy każdy z nich',
    },
    opis: [
      'Ładny feed nie znaczy nic, jeśli nikt z niego nie kupuje.',
      '',
      'Zwykle to nie kwestia pomysłów ani budżetu. To trzy rzeczy, które robi prawie każdy — i każda z nich po cichu kosztuje klientów.',
      '',
      'Masz je w 20 sekund. Bez lania wody.',
      '',
      'Który z tych trzech robisz u siebie? Napisz w komentarzu — odpiszemy każdemu, co z tym zrobić.',
      '',
      'zovu.pl',
      '',
      '#marketing #socialmedia #reels #agencjamarketingowa #contentmarketing #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      // «Napisała zero» — ошибка в польском, и она вышла в ленту: при «sto
      // osób» нужен средний род, «napisało». Заодно фраза шла на пяти слогах
      // без паузы внутри — тот самый случай, который замер признаёт
      // скороговоркой. Переписана целиком, а не подправлена.
      { rola: 'hak', tekst: 'Ładny feed. Klientów zero.', szukaj: 'phone screen scrolling social media', pauza: 0.34 },
      { rola: 'hak', tekst: 'Trzy powody. Sprawdź, który jest twój.', szukaj: 'person thinking phone hand', pauza: 0.46 },
      { rola: 'punkt', numer: 1, tytul: 'mówisz o sobie', tekst: 'Piszesz o sobie, a nie o kliencie.', szukaj: 'person filming himself phone', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'brak powodu', tekst: 'Nie dajesz powodu, żeby odpisać.', szukaj: 'bored person scrolling phone', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'znikasz', tekst: 'Znikasz na dwa tygodnie.', szukaj: 'calendar time passing clock', pauza: 0.26 },
      { rola: 'zaplata', tekst: 'Algorytm liczy każdy z tych dni.', szukaj: 'analytics graph screen data', pauza: 0.30 },
      { rola: 'cta', tekst: 'Który z tych trzech robisz? Napisz w komentarzu.', szukaj: 'woman texting smartphone street evening', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'ile-kosztuje-strona',
    plyta: { linie: ['CENA STRONY', 'TO 3 RZECZY'], plaszka: '3 RZECZY' },
    temat: 'z czego składa się cena strony',
    opis: [
      'Pytanie „ile kosztuje strona?" jest jak „ile kosztuje samochód".',
      '',
      'Odpowiedź zależy od trzech rzeczy, a nie od liczby podstron. Rozbieramy je w 20 sekund.',
      '',
      'Zapisz sobie te trzy pytania i zadaj je przed pierwszą rozmową o cenie — oszczędzą ci więcej niż negocjacje.',
      '',
      'zovu.pl',
      '',
      '#stronainternetowa #webdesign #marketing #agencjamarketingowa #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      // Вопрос заменён утверждением: на вопрос зритель мысленно отвечает и
      // уходит, а утверждение «злой вопрос» — это конфликт, который держит.
      { rola: 'hak', tekst: 'To złe pytanie.', szukaj: 'laptop website design desk', pauza: 0.34 },
      { rola: 'hak', tekst: 'Cena zależy od trzech rzeczy. Nie od podstron.', szukaj: 'calculator money desk business', pauza: 0.46 },
      { rola: 'punkt', numer: 1, tytul: 'co ma robić', tekst: 'Po pierwsze — co ta strona ma robić.', szukaj: 'business meeting planning notes', pauza: 0.28 },
      { rola: 'punkt', numer: 2, tytul: 'czyje treści', tekst: 'Po drugie — kto pisze teksty i robi zdjęcia.', szukaj: 'photographer camera studio product', pauza: 0.28 },
      { rola: 'punkt', numer: 3, tytul: 'co potem', tekst: 'Po trzecie — kto się nią zajmie za pół roku.', szukaj: 'developer working code screen', pauza: 0.26 },
      { rola: 'zaplata', tekst: 'Bez tych odpowiedzi cena to ZGADYWANKA.', szukaj: 'calculator money budget desk', pauza: 0.28 },
      { rola: 'cta', tekst: 'Zapisz to przed pierwszą rozmową o cenie.', szukaj: 'hands typing laptop cafe table', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'pierwsze-trzy-sekundy',
    plyta: { linie: ['ROLKA PADA', 'W 3 SEKUNDY'], plaszka: '3 SEKUNDY' },
    temat: 'dlaczego nikt nie ogląda twoich rolek',
    opis: [
      'Nagrałeś dobry materiał, a obejrzało go pięć osób.',
      '',
      'Problem prawie nigdy nie leży w treści. Leży w pierwszych trzech sekundach — i to jest do naprawienia w jeden wieczór.',
      '',
      'Wyślij to komuś, kto właśnie nagrywa rolki — pierwsze trzy sekundy decydują o całej reszcie.',
      '',
      'zovu.pl',
      '',
      '#reels #socialmedia #marketing #contentmarketing #agencjamarketingowa #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      // Худший ролик из шести по досмотру — 14,8%. Две причины видны на кадрах.
      // Первая: «obejrzało PIĘĆ osób» — цифра о зрителе, которой мы не знаем.
      // Вторая: под неё стоял кадр пустого тёмного зала (яркость 25 против
      // 44-128 у остальных) — смотреть не на что и читать нечего. Теперь
      // сначала соглашаемся со зрителем, потом ломаем, а в кадре живое лицо,
      // подсвеченное экраном.
      { rola: 'hak', tekst: 'Materiał dobry. Rolka padła.', szukaj: 'woman face phone screen glow', pauza: 0.34 },
      { rola: 'hak', tekst: 'Winne są trzy sekundy. Te pierwsze.', szukaj: 'camera filming behind scenes', pauza: 0.46 },
      { rola: 'punkt', numer: 1, tytul: 'zaczynasz od siebie', tekst: 'Po pierwsze — zaczynasz od przywitania.', szukaj: 'person waving hello camera', pauza: 0.28 },
      { rola: 'punkt', numer: 2, tytul: 'brak obietnicy', tekst: 'Po drugie — nie mówisz, co widz dostanie.', szukaj: 'person shrugging uncertain', pauza: 0.28 },
      { rola: 'punkt', numer: 3, tytul: 'cisza na starcie', tekst: 'Po trzecie — pierwsza sekunda jest pusta.', szukaj: 'silent empty room minimal', pauza: 0.26 },
      { rola: 'zaplata', tekst: 'Widz decyduje, ZANIM zdążysz zacząć.', szukaj: 'fast scrolling thumb phone', pauza: 0.28 },
      { rola: 'cta', tekst: 'Wyślij to komuś, kto właśnie nagrywa rolki.', szukaj: 'stopwatch timer hand desk', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'dlaczego-nikt-nie-pisze',
    plyta: { linie: ['WIADOMOŚCI ZERO?', '3 POWODY'], plaszka: '3 POWODY' },
    temat: 'dlaczego profil nie generuje wiadomości',
    opis: [
      'Masz zasięgi, masz polubienia, a wiadomości zero.',
      '',
      'To nie przypadek i nie algorytm. To trzy rzeczy w twoim profilu, które mówią „nie pisz do mnie".',
      '',
      'Wyślij to komuś, kogo profil wygląda tak samo — trzy rzeczy, przez które ludzie nie piszą.',
      '',
      'zovu.pl',
      '',
      '#instagram #socialmedia #marketing #malafirma #agencjamarketingowa #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      // Второй худший — 14,3%. Запрос «empty inbox» выдал телефон с ПОГАШЕННЫМ
      // экраном: полторы секунды кадр держит выключенную вещь. Ставим сам
      // предмет разговора — профиль на светящемся экране.
      { rola: 'hak', tekst: 'Lajki są. Klientów nie ma.', szukaj: 'phone screen instagram profile', pauza: 0.34 },
      { rola: 'hak', tekst: 'To nie algorytm. To trzy rzeczy w profilu.', szukaj: 'person thinking phone confused', pauza: 0.46 },
      { rola: 'punkt', numer: 1, tytul: 'nie wiadomo co robisz', tekst: 'Po pierwsze — z opisu nie wiadomo, co robisz.', szukaj: 'blurry unclear sign street', pauza: 0.28 },
      { rola: 'punkt', numer: 2, tytul: 'brak dowodu', tekst: 'Po drugie — nie pokazujesz efektów pracy.', szukaj: 'before after work result', pauza: 0.28 },
      { rola: 'punkt', numer: 3, tytul: 'nie ma dokąd', tekst: 'Po trzecie — nie mówisz, gdzie napisać.', szukaj: 'closed door sign shop', pauza: 0.26 },
      { rola: 'zaplata', tekst: 'Ludzie nie piszą tam, gdzie muszą ZGADYWAĆ.', szukaj: 'crowd walking past street', pauza: 0.28 },
      { rola: 'cta', tekst: 'Wyślij to komuś, kogo profil wygląda tak samo.', szukaj: 'finger scrolling phone screen closeup', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'rolka-czy-post',
    temat: 'kiedy rolka, a kiedy zwykły post',
    opis: [
      'Rolka nie jest lepsza od posta. Robi coś innego.',
      '',
      'Rolka przynosi nowych ludzi. Post rozmawia z tymi, których już masz. Kto robi tylko jedno z dwóch, stoi w miejscu.',
      '',
      'Nie wiesz, co u ciebie kuleje? Napisz PLAN, a odeślemy prosty rozkład na miesiąc.',
      '',
      'zovu.pl',
      '',
      '#reels #socialmedia #contentmarketing #marketing #agencjamarketingowa #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Rolka nie bije posta.', szukaj: 'two paths choice road', pauza: 0.34 },
      { rola: 'hak', tekst: 'Robi coś innego. Zupełnie.', szukaj: 'phone social media feed scroll', pauza: 0.46 },
      { rola: 'punkt', numer: 1, tytul: 'rolka przyprowadza', tekst: 'Rolka przyprowadza NOWYCH ludzi.', szukaj: 'crowd people city walking', pauza: 0.28 },
      { rola: 'punkt', numer: 2, tytul: 'post rozmawia', tekst: 'Post rozmawia z tymi, których już masz.', szukaj: 'two people talking coffee', pauza: 0.28 },
      { rola: 'punkt', numer: 3, tytul: 'jedno bez drugiego', tekst: 'Samo jedno z dwóch nie działa.', szukaj: 'broken chain link metal', pauza: 0.26 },
      { rola: 'zaplata', tekst: 'Zasięg bez rozmowy to ruch, który NIE kupuje.', szukaj: 'analytics graph screen data', pauza: 0.28 },
      { rola: 'cta', tekst: 'Rozkład na miesiąc mamy w opisie profilu.', szukaj: 'hand writing notebook plan desk', pauza: 0.20 },
    ],
  },

  // ── дальше ФОРМЫ, а не темы ───────────────────────────────────
  // Первые пять — одна и та же конструкция: хук, три пронумерованных
  // пункта, расплата, призыв. Разные слова, одинаковый скелет. Захар
  // поймал это на третьем ролике: «надо всегда разные темы иметь».
  //
  // Поэтому дальше идут другие ФОРМЫ. Пронумерованных пунктов в них нет
  // вовсе, длина другая, ритм другой: одна цифра, один миф, до и после,
  // вопрос из директа, позиция против течения, изнанка работы. Лента не
  // должна выглядеть как один шаблон с подменёнными словами.
  {
    nazwa: 'kulisy-bez-kamery',
    plyta: { linie: ['TEJ ROLKI', 'NIKT NIE NAGRAŁ'], plaszka: 'NIKT' },
    forma: 'kulisy',
    temat: 'jak powstaje ta rolka',
    // Единственный сценарий, который рассказывает правду о самом себе.
    // Сильнее любого обещания: зритель смотрит доказательство.
    opis: [
      'Tej rolki nikt nie nagrywał.',
      '',
      'Nie było kamery, planu zdjęciowego ani człowieka przed obiektywem. Scenariusz, głos, materiał i montaż złożyły się rano, same.',
      '',
      'Nie zastąpi to prawdziwych zdjęć twojego miejsca. Ale gdy termin był na wczoraj — robi robotę.',
      '',
      'Napisz TEMPO, a pokażemy, jak ustawić to u siebie.',
      '',
      'zovu.pl',
      '',
      '#ai #contentmarketing #socialmedia #reels #agencjamarketingowa #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      // Этот ролик и так лучший по кадру (живой бэкстейдж с людьми) — правим
      // только метрику: вторая фраза шла без паузы внутри.
      { rola: 'hak', tekst: 'Tej rolki nikt nie nagrał.', szukaj: 'empty film studio equipment', pauza: 0.34 },
      { rola: 'hak', tekst: 'Ani człowieka przed nią. Powstała sama.', szukaj: 'camera tripod empty room', pauza: 0.46 },
      { rola: 'tresc', tekst: 'Scenariusz, głos, materiał, montaż.', szukaj: 'code screen developer night', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Wszystko składa się samo, o szóstej rano.', szukaj: 'sunrise city morning window', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'Tak robimy treści, kiedy termin był na wczoraj.', szukaj: 'clock deadline office desk', pauza: 0.30 },
    ],
  },
  {
    nazwa: 'trzy-sekundy',
    forma: 'jedna-liczba',
    temat: 'ile masz czasu na zatrzymanie widza',
    opis: [
      'Trzy sekundy. Tyle masz, zanim palec pojedzie dalej.',
      '',
      'W tym czasie widz nie ocenia jakości montażu ani światła. Sprawdza jedną rzecz: czy to o nim.',
      '',
      'Dlatego pierwsze zdanie mówi o widzu, a nie o tobie. Reszta rolki dopiero po tym ma sens.',
      '',
      'Napisz START, a przejrzymy pierwsze zdanie twojej ostatniej rolki.',
      '',
      'zovu.pl',
      '',
      '#reels #socialmedia #marketing #contentmarketing #agencjamarketingowa #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Trzy sekundy.', stempel: { numer: '3', podpis: 'sekundy' }, szukaj: 'stopwatch timer close up', pauza: 0.40 },
      { rola: 'hak', tekst: 'Tyle masz. Potem palec jedzie dalej.', szukaj: 'thumb scrolling phone fast', pauza: 0.46 },
      { rola: 'tresc', tekst: 'Widz nie ocenia wtedy jakości.', szukaj: 'person watching phone bored', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Sprawdza jedno: czy to o nim.', szukaj: 'person pointing at himself', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'Dlatego pierwsze zdanie mówi o widzu, nie o tobie.', szukaj: 'conversation two people listening', pauza: 0.30 },
      { rola: 'cta', tekst: 'Włącz swoją ostatnią rolkę i posłuchaj pierwszego zdania.', szukaj: 'person watching phone thinking', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'mit-codziennie',
    forma: 'mit',
    temat: 'czy trzeba publikować codziennie',
    opis: [
      'Musisz postować codziennie — to najdroższy mit w tej branży.',
      '',
      'Codziennie znaczy w pośpiechu. W pośpiechu znaczy o niczym. Dwa przemyślane posty biją siedem byle jakich, bo algorytm liczy, ile osób zostało — a nie ile razy coś wrzuciłeś.',
      '',
      'Napisz RYTM, a ułożymy plan pod twoje realne tempo, nie pod cudzy kalendarz.',
      '',
      'zovu.pl',
      '',
      '#socialmedia #marketing #malafirma #contentmarketing #agencjamarketingowa #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Codziennie? Nieprawda.', szukaj: 'calendar days planning wall', pauza: 0.34 },
      { rola: 'hak', tekst: 'To mit. I najdroższy w tej branży.', stempel: { numer: 'MIT', podpis: 'a nie zasada' }, szukaj: 'tired person laptop late', pauza: 0.46 },
      { rola: 'tresc', tekst: 'Codziennie znaczy w pośpiechu.', szukaj: 'rushing hands typing fast', pauza: 0.28 },
      { rola: 'tresc', tekst: 'A w pośpiechu znaczy o niczym.', szukaj: 'empty blank paper desk', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'Algorytm liczy, ile osób zostało. Nie ile razy wrzuciłeś.', szukaj: 'analytics graph screen data', pauza: 0.30 },
      { rola: 'cta', tekst: 'A ty ile razy w tygodniu publikujesz? Napisz w komentarzu.', szukaj: 'people commenting phone social', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'opis-profilu-przed-po',
    forma: 'przed-po',
    temat: 'jak przepisać opis profilu',
    opis: [
      '„Pasja, jakość, doświadczenie" — ten opis pasuje do każdej firmy w Polsce.',
      '',
      'I dokładnie dlatego nie mówi nic. Zamień go na jedno zdanie: co robisz i dla kogo. Nagle wiadomo, po co do ciebie pisać.',
      '',
      'Napisz OPIS, a przepiszemy twój — za darmo, jedno zdanie.',
      '',
      'zovu.pl',
      '',
      '#instagram #socialmedia #malafirma #marketing #agencjamarketingowa #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Brzmi znajomo?', szukaj: 'generic business office stock', pauza: 0.40 },
      { rola: 'hak', tekst: 'Taki opis ma pół Polski. Dosłownie.', szukaj: 'crowd identical people street', pauza: 0.46 },
      { rola: 'tresc', tekst: 'A teraz to samo, tylko konkretnie.', szukaj: 'sharp focus lens adjust', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Zdjęcia mebli, które sprzedają się w sieci.', szukaj: 'furniture product photography studio', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'Różnica jedna: druga wersja mówi, dla kogo jesteś.', szukaj: 'person reading phone smiling', pauza: 0.30 },
      { rola: 'cta', tekst: 'Zapisz i przepisz swój dziś wieczorem.', szukaj: 'person writing notebook evening', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'pytanie-z-dm',
    forma: 'pytanie',
    temat: 'ile postów trzeba, żeby ruszyło',
    opis: [
      'Najczęstsze pytanie w naszym DM: „ile postów muszę mieć, żeby ruszyło?".',
      '',
      'To zła liczba. Dobre pytanie brzmi: ile osób wie, co konkretnie u ciebie kupić. Bez tego każdy kolejny post to tylko ruch.',
      '',
      'Napisz PYTANIE, a odpiszemy konkretnie na twój przypadek.',
      '',
      'zovu.pl',
      '',
      '#marketing #socialmedia #malafirma #agencjamarketingowa #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Wraca co tydzień.', szukaj: 'phone message notification hand', pauza: 0.36 },
      { rola: 'hak', tekst: 'Ile postów muszę mieć? Żeby w ogóle ruszyło.', szukaj: 'person waiting phone anxious', pauza: 0.46 },
      { rola: 'tresc', tekst: 'To zła liczba i złe pytanie.', szukaj: 'question mark thinking person', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Dobre brzmi: ile osób wie, co u ciebie kupić.', szukaj: 'shop window products display', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'Bez tego każdy kolejny post to tylko ruch.', szukaj: 'busy street people passing', pauza: 0.30 },
      { rola: 'cta', tekst: 'Napisz PYTANIE, a odpiszemy konkretnie.', szukaj: 'person holding phone reading message', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'nie-obiecujemy-zasiegow',
    forma: 'pod-prad',
    temat: 'czego nie obiecujemy',
    opis: [
      'Nie obiecujemy zasięgów. I to jest dobra wiadomość.',
      '',
      'Zasięg kupisz reklamą w dziesięć minut. Klienta — nie. Płacisz nam za to, żeby ludzie w końcu wiedzieli, po co do ciebie napisać.',
      '',
      'Napisz KONKRET, a powiemy wprost, co zrobimy i czego nie.',
      '',
      'zovu.pl',
      '',
      '#marketing #agencjamarketingowa #malafirma #socialmedia #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Zasięgów nie obiecujemy.', szukaj: 'handshake business honest meeting', pauza: 0.36 },
      { rola: 'hak', tekst: 'I to jest dobra wiadomość. Dla ciebie.', szukaj: 'person smiling relief office', pauza: 0.46 },
      { rola: 'tresc', tekst: 'Zasięg kupisz reklamą w dziesięć minut.', szukaj: 'credit card online payment', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Klienta nie kupisz wcale.', szukaj: 'empty shop counter waiting', pauza: 0.32 },
      { rola: 'zaplata', tekst: 'Płacisz za to, żeby wiedzieli, po co do ciebie pisać.', szukaj: 'customer talking seller shop', pauza: 0.30 },
      { rola: 'cta', tekst: 'Nie zgadzasz się? Napisz w komentarzu.', szukaj: 'two people talking office window', pauza: 0.20 },
    ],
  },
];

// ── отбраковка хромакея ───────────────────────────────────────────
// На стоке полно клипов с зелёным экраном в телефоне — их снимают, чтобы
// заказчик подставил свою картинку. В готовом ролике такой кадр выглядит
// как незаконченная работа. Замерами это ловится однозначно:
//   зелёный экран — HUEAVG около 110 при SATAVG выше 18
//   живой кадр    — HUEAVG 209…270 при SATAVG 3…9
// Разница на порядок, ошибиться негде.
async function czyChromakey(plik) {
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      ['-v', 'error', '-ss', '1', '-i', plik, '-vf',
        'signalstats,metadata=print:key=lavfi.signalstats.HUEAVG:file=-',
        '-frames:v', '1', '-f', 'null', '-'],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    const { stdout: s2 } = await execFileAsync(
      'ffmpeg',
      ['-v', 'error', '-ss', '1', '-i', plik, '-vf',
        'signalstats,metadata=print:key=lavfi.signalstats.SATAVG:file=-',
        '-frames:v', '1', '-f', 'null', '-'],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    const hue = +(stdout.match(/HUEAVG=([0-9.-]+)/) || [])[1];
    const sat = +(s2.match(/SATAVG=([0-9.-]+)/) || [])[1];
    if (!Number.isFinite(hue) || !Number.isFinite(sat)) return false;
    return sat > 18 && hue > 80 && hue < 160;
  } catch {
    return false;
  }
}

// `uzyte` — id клипов, уже занятых В ЭТОМ ролике. Без этого списка два
// куска с похожими запросами («calculator money desk» и «calculator money
// budget desk») брали ОДИН файл, и он стоял в ролике дважды. Смещение по
// `i` от этого не спасало: оно двигает позицию внутри выдачи, а выдача у
// похожих запросов одна и та же.
async function podklad(czesc, i, scenNazwa, uzyte = new Set()) {
  const kandydaci = await searchStock(czesc.szukaj, { perPage: 10, minSeconds: 4 });
  if (!kandydaci.length) return null;

  // Кадры не про то, что просили, отбрасываем. В ролике 20.08 под подписью
  // «фото мебели» стоял салон красоты с чужой косметикой на переднем плане:
  // запрос был правильный, сток отдал мимо, а проверить было нечем. Ролик
  // прошёл сборку, лёг в очередь и вышел бы к людям.
  //
  // Если по названию не подошло НИЧЕГО — берём как есть, но говорим вслух:
  // пустой кусок хуже неточного, а молчаливая подмена хуже обоих.
  const pasujace = kandydaci.filter((k) => k.trafnosc > 0);
  const pula = pasujace.length ? pasujace : kandydaci;
  if (!pasujace.length) {
    console.warn(
      `[rolka-auto] «${czesc.szukaj}»: ни один кадр не совпал с запросом по названию — ` +
        `беру первый попавшийся, проверь глазами`
    );
  }

  // Идём по списку, пока не попадётся кадр без хромакея. Смещение по `i`
  // нужно, чтобы два соседних куска не взяли один и тот же клип.
  // Проходим всю выдачу, а не первые четыре: занятые клипы съедают начало
  // списка, и на коротком проходе кусок оставался вообще без картинки.
  for (let k = 0; k < pula.length; k++) {
    const kand = pula[(i + k) % pula.length];
    if (uzyte.has(kand.id)) continue;
    // Имя КЭША обязано содержать сценарий: без этого второй сценарий
    // подтягивал клипы первого — на «co ma robić» стоял парень, снимающий
    // себя на телефон, потому что файл `auto-punkt-2-0` уже лежал с прошлого
    // раза. Кэш ключуется по имени файла, а не по поисковому запросу.
    const c = await fetchClip(kand, {
      seconds: 6,
      name: `auto-${scenNazwa}-${czesc.rola}-${i}-${k}`,
    });
    if (await czyChromakey(c.file)) {
      console.log(`[rolka-auto] пропускаю ${path.basename(c.file)} — зелёный экран`);
      continue;
    }
    uzyte.add(kand.id);
    return c.file;
  }
  return null;
}

// ── ротация сценариев ─────────────────────────────────────────────
// Без неё каждый день выходит одна и та же мысль — Захар поймал это на
// первом же автоматическом ролике: «идея точно такая же». Номер прошлого
// сценария храним рядом с очередью, чтобы он пережил перезапуск сервера.
const STAN = path.join(DIR, 'rolki', 'stan.json');

// Что уже лежит в очереди неопубликованным. Внеплановая сборка идёт следом
// за плановой в тот же день, и по кругу ей выпадает ТОТ ЖЕ сценарий, что уже
// ждёт выкладки. Два одинаковых ролика подряд лента не переживёт, поэтому
// занятые сценарии пропускаем.
async function czekajaceScenariusze() {
  try {
    const k = JSON.parse(await readFile(path.join(DIR, 'rolki', 'kolejka.json'), 'utf8'));
    return new Set(
      k.filter((p) => !p.opublikowano && p.zrodlo).map((p) => String(p.zrodlo).replace(/^auto-|\.mp4$/g, ''))
    );
  } catch {
    return new Set();
  }
}

async function nastepnyScenariusz() {
  // Пустой аргумент — идём по кругу; любое число — берём именно его. Раньше
  // ноль считался «не задано», и первый сценарий нельзя было пересобрать
  // явно вообще: приходилось выковыривать его из очереди, чтобы до него
  // добрался круг.
  if (JAWNY !== '') return { scen: SCENARIUSZE[NR] || SCENARIUSZE[0], idx: NR, wydanie: NR };
  let stan = {};
  try { stan = JSON.parse(await readFile(STAN, 'utf8')); } catch { stan = {}; }
  const zajete = await czekajaceScenariusze();

  let idx = ((stan.scenariusz ?? -1) + 1) % SCENARIUSZE.length;
  // Круг проходим целиком: если заняты все, берём как есть — пусть лучше
  // повтор, чем пустой день.
  for (let i = 0; i < SCENARIUSZE.length && zajete.has(SCENARIUSZE[idx].nazwa); i++) {
    console.log(`[rolka-auto] «${SCENARIUSZE[idx].nazwa}» уже ждёт выкладки — беру следующий`);
    idx = (idx + 1) % SCENARIUSZE.length;
  }
  stan.scenariusz = idx;
  // Сквозной номер выпуска. Номер сценария для хэштегов не годится: он ходит
  // по кругу, значит на втором круге тот же сценарий получил бы тот же набор
  // тегов — ровно тот повтор, от которого площадка режет показы. Счётчик
  // растёт всегда и делает набор новым даже при повторе сценария.
  stan.wydanie = (stan.wydanie ?? 0) + 1;
  stan.kiedy = new Date().toISOString();
  await mkdir(path.dirname(STAN), { recursive: true });
  await writeFile(STAN, JSON.stringify(stan, null, 2) + String.fromCharCode(10), 'utf8');
  return { scen: SCENARIUSZE[idx], idx, wydanie: stan.wydanie };
}

// ── музыка по кругу ───────────────────────────────────────────────
// Трек был зашит один на все ролики. Захар услышал это раньше, чем я успел
// заметить: «почему везде одна и та же музыка». Однообразие на слух ловится
// быстрее, чем однообразие текста, — лента начинает звучать как рассылка,
// даже если каждый ролик про своё.
//
// Идём по кругу и помним прошлый: два дня подряд один трек — это ровно то,
// что слышно.
async function nastepnaMuzyka() {
  const kat = path.join(DIR, 'music');
  const pliki = (await readdir(kat).catch(() => []))
    .filter((f) => /\.mp3$/i.test(f))
    .sort();
  if (!pliki.length) return null;

  let stan = {};
  try { stan = JSON.parse(await readFile(STAN, 'utf8')); } catch { stan = {}; }
  const idx = ((stan.muzyka ?? -1) + 1) % pliki.length;
  stan.muzyka = idx;
  await mkdir(path.dirname(STAN), { recursive: true });
  await writeFile(STAN, JSON.stringify(stan, null, 2) + String.fromCharCode(10), 'utf8');

  console.log(`[rolka-auto] музыка ${idx + 1} из ${pliki.length}: ${pliki[idx]}`);
  return path.join(kat, pliki[idx]);
}

const { scen, idx: scenIdx, wydanie } = await nastepnyScenariusz();
console.log(`[rolka-auto] сценарий ${scenIdx + 1} из ${SCENARIUSZE.length}: ${scen.nazwa}`);

// 1. Голос. Фразы озвучиваются по одной — так границы каждой известны точно.
//
// `--bez-glosu` считает тайминги по слогам и дубль не тратит. Точно так же
// это сделано у рисованных роликов, и там оно окупилось за одну ночь: правок
// по картинке нужны десятки, а платить голосом за то, что видно глазами,
// бессмысленно. Проба годится только для картинки и ритма — как ЗВУЧИТ,
// по ней судить нельзя.
const BEZ_GLOSU = process.argv.includes('--bez-glosu');

function udawanyGlos(frazy, przedPierwsza = 0.45) {
  const TEMPO = 4.6; // слогов в секунду — середина здоровой полосы 3,9-5,6
  const sylaby = (s) => (String(s).toLowerCase().match(/[aeiouyąęó]/g) || []).length || 1;
  const meta = [];
  let czas = przedPierwsza;
  for (const f of frazy) {
    const d = sylaby(f.tekst) / TEMPO;
    meta.push({ tekst: f.tekst, a: +czas.toFixed(3), b: +(czas + d).toFixed(3) });
    czas += d + (f.pauza ?? 0.3);
  }
  const slowa = meta.flatMap((m) => {
    const ws = m.tekst.split(/\s+/).filter(Boolean);
    const suma = ws.reduce((s, w) => s + w.length, 0) || 1;
    let t = m.a;
    return ws.map((w) => {
      const d = ((m.b - m.a) * w.length) / suma;
      const s = { tekst: w, a: +t.toFixed(3), b: +(t + d).toFixed(3) };
      t += d;
      return s;
    });
  });
  return { plik: null, frazy: meta, slowa, dlugosc: +(czas + 0.35).toFixed(3) };
}

const czesciGlosu = scen.czesci.map((c) => ({ tekst: c.tekst, mowa: c.mowa, pauza: c.pauza, rola: c.rola }));
const glos = BEZ_GLOSU
  ? udawanyGlos(czesciGlosu)
  : await zbudujGlos(
      czesciGlosu,
      // Пол-секунды тишины на старте. Замер показал, что речь начиналась на
      // 0,04 с — зритель попадал в середину фразы раньше, чем успевал понять,
      // что смотрит. Первый кадр должен успеть дойти.
      { tmp: path.join(OUT, `${scen.nazwa}-glos`), przedPierwsza: 0.45 }
    );
if (BEZ_GLOSU) {
  // Движку нужен ФАЙЛ дорожки: он подкладывает его как отдельный вход ffmpeg.
  // Подсовываем тишину нужной длины — тогда весь остальной путь (караоке по
  // словам, сведение, аутро) работает ровно так же, как на живом дубле, и
  // проба проверяет именно то, что пойдёт в эфир. Трогать ради пробы сам
  // движок было бы хуже: тогда проба проверяла бы не тот код.
  await mkdir(OUT, { recursive: true });
  const cisza = path.join(OUT, 'proba-cisza.wav');
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${(glos.dlugosc + 0.5).toFixed(2)}`,
    '-c:a', 'pcm_s16le', cisza,
  ]);
  glos.plik = cisza;
  console.log('[rolka-auto] ПРОБА без озвучки: тайминги по слогам, голос не тратим');
}
console.log(`[rolka-auto] голос: ${glos.dlugosc.toFixed(2)} с, слов ${glos.slowa.length}`);

// 2. Подложка. Один кусок стока на одну фразу, длиной ровно в эту фразу
//    вместе с паузой после неё — чтобы картинка менялась вместе со смыслом.
const klipy = [];
// Один список на весь ролик: и основной запрос, и запасные берут из него.
const uzyteKlipy = new Set();
// Что уже взято из кладовой и какого рода был предыдущий кусок. Род нужен,
// чтобы два соседних плана не оказались одинаковыми по типу материала:
// разнообразие — это смена рода, а не смена файла.
const zSpizarni = new Set();
let poprzedniRodzaj = null;
for (const [i, c] of scen.czesci.entries()) {
  // СНАЧАЛА своя кладовая. Наш кадр с реального проекта стоит дороже любого
  // покупного стока: он единственный, чего у конкурентов нет, и именно из
  // такого материала собран тот ролик, который Захар назвал образцом.
  // Только если сценарий САМ назвал, что здесь показывать. Автоподбор по
  // словам даёт кадр, который к фразе не относится, и ролик рассыпается.
  const swoje = scen.swoje
    ? zeSpizarni(`${c.tytul || ''} ${c.tekst || ''}`, zSpizarni, poprzedniRodzaj)
    : null;
  if (swoje) {
    zSpizarni.add(swoje.nazwa);
    poprzedniRodzaj = swoje.rodzaj;
    const f0 = glos.frazy[i];
    const nast0 = glos.frazy[i + 1];
    const dl0 = (nast0 ? nast0.a : glos.dlugosc) - (i === 0 ? 0 : f0.a);
    klipy.push({ plik: swoje.plik, dlugosc: +dl0.toFixed(3), tekst: c.tekst, od: 0.2 });
    console.log(`[rolka-auto] ${c.rola}: СВОЁ ${swoje.nazwa}  ${dl0.toFixed(2)} с`);
    continue;
  }
  poprzedniRodzaj = 'stok';

  let plik = await podklad(c, i, scen.nazwa, uzyteKlipy);

  // Запасной запрос. Узкая формулировка иногда не находит на стоке ничего —
  // и тогда падал ВЕСЬ день, из-за одной фразы. Кадр по смыслу лучше
  // точного, но кадр вообще лучше пустой ленты, поэтому пробуем шире:
  // сначала два первых слова запроса, потом нейтральный план.
  if (!plik) {
    const szersze = [c.szukaj.split(' ').slice(0, 2).join(' '), 'modern office work desk'];
    for (const zapas of szersze) {
      console.warn(`[rolka-auto] под «${c.szukaj}» ничего нет — пробую «${zapas}»`);
      plik = await podklad({ ...c, szukaj: zapas }, i, scen.nazwa, uzyteKlipy);
      if (plik) break;
    }
  }
  if (!plik) throw new Error(`не нашёл подложку под «${c.szukaj}» даже запасными запросами`);
  const f = glos.frazy[i];
  const nastepna = glos.frazy[i + 1];
  const dlugosc = (nastepna ? nastepna.a : glos.dlugosc) - (i === 0 ? 0 : f.a);
  klipy.push({ plik, dlugosc: +dlugosc.toFixed(3), tekst: c.tekst, od: 0.4 });
  console.log(`[rolka-auto] ${c.rola}: ${path.basename(plik)}  ${dlugosc.toFixed(2)} с`);
}

// 2б. Длинные планы режем надвое.
//
// Порог 3,2 с выбран по образцу: там средний план 1,6 с, и ни один кусок не
// висит дольше трёх секунд. Второй кадр берём из кладовой, а не из того же
// файла: смена ракурса внутри одного клипа читается как склейка по браку, а
// не как приём.
{
  const DLUGI = 3.2;
  // Резать план надвое имеет смысл, только когда есть ЧЕМ закрыть вторую
  // половину по смыслу. Иначе это ещё один случайный кадр посреди фразы.
  const wolne = scen.swoje
    ? SPIZARNIA.map((x) => x.plik).filter((p) => !zSpizarni.has(p))
    : [];
  const nowe = [];
  let podzielone = 0;
  for (const k of klipy) {
    if (k.dlugosc <= DLUGI || !wolne.length) {
      nowe.push(k);
      continue;
    }
    const polowa = +(k.dlugosc / 2).toFixed(3);
    const drugi = wolne.shift();
    nowe.push({ ...k, dlugosc: polowa });
    nowe.push({
      plik: path.join(DIR, 'wlasne', drugi),
      dlugosc: +(k.dlugosc - polowa).toFixed(3),
      tekst: k.tekst,
      od: 0.2,
    });
    zSpizarni.add(drugi);
    podzielone++;
  }
  if (podzielone) {
    klipy.length = 0;
    klipy.push(...nowe);
    console.log(`[rolka-auto] длинных планов разрезано: ${podzielone}, планов стало ${klipy.length}`);
  }
}

// 3. Титры пунктов — на начало фразы, где пункт называется.
const tytuly = scen.czesci
  .map((c, i) => (c.numer ? { start: +(glos.frazy[i].a - 0.10).toFixed(2), dlugosc: 1.45, numer: String(c.numer), tekst: c.tytul } : null))
  .filter(Boolean);

// 3.5 Штампы: огромная цифра или слово во весь кадр под фразу. Движок это
//     умел с ролика про Kuba, а конвейер ни разу не просил — все рилсы шли
//     на одних караоке-подписях. Это и есть «прибавить монтажа»: приём
//     ставится там, где он и есть смысл фразы, а не для украшения.
//     Пока штамп на экране, караоке прячется — два текста кадр не держат.
const stemple = scen.czesci
  .map((c, i) =>
    c.stempel
      ? {
          start: +(glos.frazy[i].a - 0.08).toFixed(2),
          dlugosc: +((glos.frazy[i].b - glos.frazy[i].a) + 0.55).toFixed(2),
          numer: c.stempel.numer,
          podpis: c.stempel.podpis || '',
        }
      : null
  )
  .filter(Boolean);
if (stemple.length) console.log(`[rolka-auto] штампов: ${stemple.length}`);

// 4. График вместо стока на «расплате»: цифра, которая растёт, смотрится,
//    а готовая пролистывается.
// График ставится ТОЛЬКО если сценарий его просит. Раньше он был зашит
// жёстко, и в ролике про цену сайта показывался «перерыв между постами» —
// врезка не по теме бьёт сильнее, чем её отсутствие.
const zaplataIdx = scen.wykres ? scen.czesci.findIndex((c) => c.rola === 'zaplata') : -1;
const wstawki = zaplataIdx >= 0
  ? [{
      start: +(glos.frazy[zaplataIdx].a - 0.12).toFixed(2),
      dlugosc: +((glos.frazy[zaplataIdx + 1]?.a ?? glos.dlugosc) - glos.frazy[zaplataIdx].a + 0.35).toFixed(2),
      typ: 'wykres',
      dni: scen.wykres.dni,
      tytul: scen.wykres.tytul,
      jednostka: scen.wykres.jednostka || 'dni',
      podpis: scen.wykres.podpis,
    }]
  : [];

const plan = {
  nazwa: `auto-${scen.nazwa}`,
  muzyka: (await nastepnaMuzyka()) || path.join(DIR, 'music', 'pixabay-creative-technology-showreel.mp3'),
  // Кусок трека тоже по кругу: четыре точки входа на выпуск. Трек вернётся
  // через полторы недели, и вернётся другой своей частью.
  muzykaOd: [0, 27, 54, 81][wydanie % 4],
  podkladGlosnosc: 0.11,
  podkladOgon: 0.17,
  powietrzeTlo: 0.02,
  stukiGlosnosc: 0.5,
  najazd: 1.1,
  // Между разными сценами стока рез — норма, растворение тут не нужно:
  // это не два дубля одного лица, а смена кадра по смыслу.
  przejscie: 0,
  wjazdWstawki: 0.3,
  ogonPrzejscie: 0.4,
  akcent: '#a78bfa',
  akcentPas: '#7c3aed',
  dryf: true,
  karaoke: true,
  glos: { plik: glos.plik, slowa: glos.slowa },
  // Плита хука и кадр-сводка. Пункты для сводки НЕ пишем заново — они уже
  // есть в сценарии как заголовки титров, и брать их оттуда значит, что
  // сводка не сможет разойтись с роликом.
  // Плиту ХУКА не ставим. Движок уже показывает первую фразу целиком с
  // нулевого кадра (см. karaokeHtml, ветка `i === 0`) — это было сделано
  // раньше и ровно от той же беды. Плита поверх неё дублировала решение, а
  // из-за глушения караоке под плитой на нулевой кадр выдёргивалась ЧУЖАЯ
  // фраза: в пробе на первых двух секундах висело «CENA ZALEŻY OD» вместо
  // хука. Механизм плиты в движке остаётся — он нужен сводке.
  ...(PLYTY && scen.czesci.some((c) => c.numer)
    ? {
        podsumowanie: {
          punkty: scen.czesci.filter((c) => c.numer).map((c) => c.tytul),
          zapisz: 'Zapisz na potem',
          dlugosc: 3.0,
        },
      }
    : {}),
  klipy,
  tytuly,
  stemple,
  wstawki,
  // Стикеры поверх кадра. Не больше двух на ролик и только там, где для
  // фразы нашёлся предмет по смыслу — грань между «разбавили» и «мультик
  // поверх съёмки» проходит именно здесь.
  // Стикеры тоже по разрешению: подобранный по слову предмет читается как
  // случайная картинка сбоку, а не как приём. Захар: «что за стикеры
  // какие-то вообще непонятные».
  naklejki: scen.naklejki ? rozlozNaklejki(scen.czesci, glos.frazy, 2) : [],
  ogon: {
    marka: true,
    dlugosc: 3.8,
    adres: 'zovu.pl',
    linie: [
      { tekst: 'robimy treści', maly: false },
      { tekst: 'które sprzedają', maly: true },
    ],
  },
};

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, `${plan.nazwa}-plan.json`), JSON.stringify(plan, null, 2), 'utf8');

const wynik = await zbuduj(plan);
console.log('[rolka-auto] собрано:', JSON.stringify(wynik));

// Описание кладём рядом с роликом: очередь заберёт его вместе с файлом.
// Хук в описании ДРУГОЙ, чем в ролике — кто видео не досмотрел, цепляется
// за текст. Призыв — одно слово в директ: на такое отвечают чаще, и сразу
// видно, сколько людей пришло именно с этого рилса.
// Хэштеги в тексте сценария — заглушка: их подменяет общий генератор.
// Держать теги в сценарии нельзя по двум причинам. Первая: там годами
// стояли общие слова (#marketing, #socialmedia), по которым аккаунт с
// охватом 11 не показывается никому. Вторая: сценарии крутятся по кругу,
// значит один и тот же набор повторяется под каждым третьим роликом, а
// повтор площадка читает как шаблон и режет показы сама.
if (scen.opis) {
  const opis = podmienHasztagi(scen.opis, {
    temat: scen.temat,
    forma: scen.forma,
    nr: wydanie,
  });
  await writeFile(path.join(OUT, `${plan.nazwa}-opis.txt`), opis, 'utf8');
}

// ── паспорт ролика ────────────────────────────────────────────────
// Цифры сами по себе ничего не говорят: «охват 800» — это много или мало
// для ЭТОГО ролика? Ответ виден, только если рядом лежит, ЧЕМ он был:
// какой сценарий, какой формы, какой длины, в каком темпе говорит.
//
// Пишем это рядом с файлом, очередь заберёт вместе с ним, а сбор цифр
// сложит с показателями. Без паспорта выбор сценария по результатам —
// то, ради чего всё и строится, — опирался бы на одно имя файла.
await writeFile(
  path.join(OUT, `${plan.nazwa}-meta.json`),
  JSON.stringify(
    {
      scenariusz: scen.nazwa,
      forma: scen.forma || 'lista',
      temat: scen.temat,
      dlugosc: wynik.sekundy,
      planow: wynik.planow,
      sredniPlan: wynik.sredniPlan,
      frazy: glos.frazy.length,
      tempo: glos.frazy.map((f) => +(((f.tekst.toLowerCase().match(/[aeiouyąęó]+/g) || []).length) / Math.max(0.2, f.b - f.a)).toFixed(1)),
      hak: scen.czesci[0]?.tekst || null,
    },
    null,
    2
  ),
  'utf8'
);

if (!BEZ_KONTROLI) {
  const kontrola = await sprawdzRolke(wynik.plik, {
    oczekiwanePrzejscia: [
      ...tytuly.map((t) => t.start),
      ...wstawki.map((w) => w.start),
      ...wstawki.map((w) => w.start + w.dlugosc),
      ...klipy.reduce((acc, k) => { acc.push((acc.at(-1) ?? 0) + k.dlugosc); return acc; }, []),
    ],
    // Куски из кладовой — это НАШИ съёмки, и в них есть настоящее движение:
    // облако пудры у барбера, руки, вода. Отдаём их границы, чтобы проверка
    // не принимала жизнь в кадре за склейку по браку.
    zakresyRuchu: klipy.reduce(
      (acc, k) => {
        const od = acc.czas;
        acc.czas += k.dlugosc;
        if (String(k.plik).includes('wlasne')) acc.zakresy.push([od, acc.czas]);
        return acc;
      },
      { czas: 0, zakresy: [] }
    ).zakresy,
  });
  console.log('[rolka-auto] проверка:', JSON.stringify(kontrola, null, 1));
  if (!kontrola.zdal) {
    console.error('::error::рилс не прошёл проверку — публиковать нельзя');
    process.exitCode = 1;
  }
}
