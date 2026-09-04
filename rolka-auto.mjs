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
import {
  historiaScenariuszy,
  wybierzNajdawniejszy,
  opiszWybor,
  sredniZasiegPoFormie,
  ostatniaForma,
} from './historia-scenariuszy.mjs';

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
    forma: 'lista',
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
    forma: 'lista',
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
    forma: 'lista',
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
    forma: 'pytanie',
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
  // Единственный сценарий, который держится не на словах, а на доказательстве:
  // подложка — проезд по НАШИМ живым сайтам, снятый `witryny.mjs`. Сток тут
  // запрещён по смыслу: показывать чужой ноутбук там, где обещаны наши работы,
  // — это ровно та подмена, из-за которой ролики перестают верить.
  //
  // Призыв — переслать, а не написать. Пересылка в личку весит у Instagram
  // больше всего, а у нас её за всё время ноль: ни один сценарий о ней не
  // просил, кроме «komentarze».
  {
    nazwa: 'nasze-strony',
    plyta: { linie: ['CZTERY STRONY', 'KTÓRE ZROBILIŚMY'], plaszka: 'NASZE PRACE' },
    forma: 'lista',
    temat: 'nasze prawdziwe realizacje',
    opis: [
      'Strona za 500 zł wygląda jak strona za 500 zł. I klient to widzi pierwszy.',
      '',
      'Cztery nasze realizacje, każda działa dziś w internecie — nie na makiecie w Figmie.',
      '',
      'Wyślij to komuś, kto właśnie wybiera wykonawcę strony.',
      '',
      'zovu.pl',
      '',
      '#stronainternetowa #webdesign #portfolio #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Strona za 500 złotych. Widać to od razu.', witryna: 'rolki', pauza: 0.34 },
      { rola: 'hak', tekst: 'Cztery nasze. Oceń sam.', witryna: 'zah', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'serwis auto', tekst: 'Serwis auto. Czarne ze złotem.', witryna: '4k', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'willa', tekst: 'Willa na sprzedaż. Zdjęcia na cały ekran.', witryna: 'rezydencja', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'złoto', tekst: 'Sklep ze złotem. Wszystko w trzy sekundy.', witryna: 'maya', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'Każda z nich działa dziś. Nie na makiecie.', witryna: 'zovu', pauza: 0.32 },
      { rola: 'cta', tekst: 'Wyślij to komuś, kto wybiera wykonawcę.', witryna: 'zah', pauza: 0.20 },
    ],
  },

  // ── дописано 31.08: банк был короче месяца ──────────────────────
  // Двенадцати сценариев хватало ровно до конца августа: круг замкнулся, и
  // лента пошла по второму разу. Эти десять берут темы, которых у нас не
  // было ни разу, — не вариации прежних, иначе повтор просто переоденется.
  // Правила те же: хук с точкой внутри, три пункта, расплата, призыв. Ни
  // одной цифры, которой мы не можем доказать: всё, что тут утверждается,
  // проверяемо на себе.
  {
    nazwa: 'zdjecia-z-telefonu',
    plyta: { linie: ['NIE POTRZEBUJESZ', 'KAMERY'], plaszka: 'TELEFON WYSTARCZY' },
    forma: 'mit',
    temat: 'sprzęt nie jest problemem',
    opis: [
      'Nie potrzebujesz kamery. Potrzebujesz okna i dwóch minut.',
      '',
      'Trzy rzeczy, które zmieniają nagranie z telefonu bardziej niż jakikolwiek sprzęt za kilka tysięcy.',
      '',
      'Zapisz to sobie przed następnym nagraniem — wracaj do tego za każdym razem.',
      '',
      'zovu.pl',
      '',
      '#reels #wideo #marketing #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Nie potrzebujesz kamery. Serio.', szukaj: 'person holding smartphone filming', pauza: 0.36 },
      { rola: 'hak', tekst: 'Potrzebujesz okna. I dwóch minut.', szukaj: 'daylight window room interior', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'światło', tekst: 'Stań twarzą do okna. Nie plecami.', szukaj: 'woman standing by window natural light', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'jedno ujęcie', tekst: 'Nagraj jedno ujęcie. Nie dziesięć.', szukaj: 'hand recording video phone tripod', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'pionowo', tekst: 'Trzymaj pionowo. Tak to oglądają.', szukaj: 'vertical phone screen social media', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Sprzęt nie jest twoim problemem. Nigdy nie był.', szukaj: 'professional camera on shelf unused', pauza: 0.32 },
      { rola: 'cta', tekst: 'Zapisz to. Przed następnym nagraniem.', szukaj: 'person saving post phone screen', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'pierwsza-odpowiedz',
    plyta: { linie: ['KLIENT PYTA', 'O CENĘ'], plaszka: '3 ZDANIA' },
    forma: 'lista',
    temat: 'jak odpisać na pierwsze zapytanie',
    opis: [
      'Klient pyta o cenę. Odpisujesz kwotą i rozmowa się kończy.',
      '',
      'Trzy zdania, po których rozmowa idzie dalej — używamy ich u siebie przy każdym pierwszym zapytaniu.',
      '',
      'Zapisz je sobie na jutro, przydadzą się szybciej niż myślisz.',
      '',
      'zovu.pl',
      '',
      '#sprzedaz #marketing #malafirma #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Klient pyta o cenę. Odpisujesz kwotą.', szukaj: 'smartphone message notification hand', pauza: 0.34 },
      { rola: 'hak', tekst: 'I tyle. Rozmowa się kończy.', szukaj: 'person disappointed looking at phone', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'najpierw cel', tekst: 'Najpierw pytanie. O cel.', szukaj: 'two people talking business meeting', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'widełki', tekst: 'Potem widełki. Nie cisza.', szukaj: 'calculator price numbers desk', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'termin', tekst: 'Na koniec termin. Konkretny.', szukaj: 'calendar appointment phone hand', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Cena bez rozmowy to zgadywanka. Dla obu stron.', szukaj: 'handshake business deal office', pauza: 0.32 },
      { rola: 'cta', tekst: 'Zapisz te trzy zdania. Na jutro.', szukaj: 'hands writing notebook desk', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'wizytowka-google',
    plyta: { linie: ['DARMOWY KANAŁ', 'STOI PUSTY'], plaszka: 'WIZYTÓWKA' },
    forma: 'lista',
    temat: 'wizytówka Google dla małej firmy',
    opis: [
      'Masz kanał, który nic nie kosztuje. I pewnie stoi pusty.',
      '',
      'Wizytówka Google decyduje o tym, czy ktoś do ciebie zadzwoni, zanim w ogóle zobaczy twój profil.',
      '',
      'Sprawdź swoją teraz — zajmie minutę. Napisz w komentarzu, czego brakowało.',
      '',
      'zovu.pl',
      '',
      '#google #lokalnybiznes #marketing #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Masz kanał, który nic nie kosztuje.', szukaj: 'google search on phone screen', pauza: 0.34 },
      { rola: 'hak', tekst: 'I pewnie stoi pusty.', szukaj: 'empty shop counter interior', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'godziny', tekst: 'Aktualne godziny. To pierwsze.', szukaj: 'open sign shop door hours', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'zdjęcia', tekst: 'Dziesięć zdjęć. Z tego miesiąca.', szukaj: 'person photographing shop interior phone', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'opinie', tekst: 'Odpowiedz na każdą opinię. Nawet dobrą.', szukaj: 'five star rating review phone', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Szukają w Google. Zanim wejdą na Instagram.', szukaj: 'person searching phone street city', pauza: 0.32 },
      { rola: 'cta', tekst: 'Sprawdź swoją wizytówkę teraz. Minuta.', szukaj: 'hand tapping smartphone screen closeup', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'jak-prosic-o-opinie',
    plyta: { linie: ['OPINIE SAME', 'NIE PRZYCHODZĄ'], plaszka: 'OPINIE' },
    forma: 'lista',
    temat: 'jak prosić klientów o opinie',
    opis: [
      'Zrobiłeś dobrą robotę, a opinii brak. Bo nikt o nią nie poprosił.',
      '',
      'Sprawdziliśmy to na sobie: klient przyjmuje pracę i na tym koniec. Opinia pojawia się dopiero wtedy, gdy poprosisz wprost i powiesz po co.',
      '',
      'Wyślij to komuś, kto ma zero opinii przy dobrej robocie.',
      '',
      'zovu.pl',
      '',
      '#opinie #malafirma #sprzedaz #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Dobra robota. Opinii zero.', szukaj: 'craftsman finished work workshop', pauza: 0.36 },
      { rola: 'hak', tekst: 'Bo nikt o nią nie poprosił.', szukaj: 'person shrugging office desk', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'kiedy', tekst: 'Proś od razu. Po odbiorze.', szukaj: 'handing package to customer shop', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'po co', tekst: 'Powiedz po co. Wprost.', szukaj: 'two people conversation cafe honest', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'gdzie', tekst: 'Wyślij gotowy link. Jeden.', szukaj: 'sending message link smartphone', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Klienta kosztuje minutę. Ciebie jedno pytanie.', szukaj: 'five stars review screen phone', pauza: 0.32 },
      { rola: 'cta', tekst: 'Wyślij to dalej. Komuś bez opinii.', szukaj: 'friends sharing phone screen laughing', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'strona-czy-instagram',
    plyta: { linie: ['STRONA CZY', 'INSTAGRAM'], plaszka: 'CO PIERWSZE' },
    forma: 'pytanie',
    temat: 'od czego zacząć: strona czy profil',
    opis: [
      'Strona czy Instagram? To źle postawione pytanie.',
      '',
      'Odpowiedź zależy wyłącznie od tego, gdzie klient cię szuka. Rozbieramy to w 20 sekund.',
      '',
      'Napisz w komentarzu, gdzie klienci znajdują ciebie — odpiszemy, od czego zacząć.',
      '',
      'zovu.pl',
      '',
      '#stronainternetowa #instagram #marketing #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Strona czy Instagram. Złe pytanie.', szukaj: 'laptop and phone on desk together', pauza: 0.36 },
      { rola: 'hak', tekst: 'Liczy się jedno. Gdzie klient cię szuka.', szukaj: 'person searching on laptop cafe', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'szuka w Google', tekst: 'Szuka w Google? Potrzebujesz strony.', szukaj: 'search bar typing laptop screen', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'z polecenia', tekst: 'Przychodzi z polecenia. Wystarczy profil.', szukaj: 'friends recommending phone conversation', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'zwykle oba', tekst: 'Zwykle jedno i drugie. Po kolei.', szukaj: 'business owner laptop phone shop', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Instagram wynajmujesz. Stronę masz.', szukaj: 'keys handing over apartment door', pauza: 0.34 },
      { rola: 'cta', tekst: 'Napisz w komentarzu. Gdzie cię znajdują.', szukaj: 'woman typing comment phone street', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'jedzenie-na-zdjeciach',
    plyta: { linie: ['TO SAMO DANIE', 'DWA ZDJĘCIA'], plaszka: 'JEDZENIE' },
    forma: 'przed-po',
    temat: 'zdjęcia jedzenia telefonem',
    opis: [
      'To samo danie, dwa zdjęcia. Jedno sprzedaje, drugie nie.',
      '',
      'Trzy rzeczy do zrobienia telefonem, zanim wrzucisz zdjęcie z lokalu. Bez sprzętu i bez fotografa.',
      '',
      'Zapisz i zrób tak przy następnym daniu — zobaczysz różnicę na pierwszym zdjęciu.',
      '',
      'zovu.pl',
      '',
      '#gastronomia #restauracja #foodphoto #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'To samo danie. Dwa zdjęcia.', szukaj: 'restaurant dish plate table closeup', pauza: 0.36 },
      { rola: 'hak', tekst: 'Jedno sprzedaje, drugie nie.', szukaj: 'phone photographing food restaurant', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'światło', tekst: 'Zabierz talerz do okna.', szukaj: 'food plate by window daylight', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'kąt', tekst: 'Zejdź niżej. Na wysokość stołu.', szukaj: 'low angle food photography table', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'tło', tekst: 'Zabierz ze stołu resztę. Wszystko inne.', szukaj: 'clean table setting minimal restaurant', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Menu je się oczami. Najpierw w telefonie.', szukaj: 'people ordering food looking at phone', pauza: 0.32 },
      { rola: 'cta', tekst: 'Zapisz to. Zrób tak przy następnym daniu.', szukaj: 'chef plating dish kitchen', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'dziesiec-minut-w-warsztacie',
    plyta: { linie: ['DZIESIĘĆ MINUT', 'MATERIAŁ NA TYDZIEŃ'], plaszka: '10 MINUT' },
    forma: 'kulisy',
    temat: 'co nagrać w warsztacie w dziesięć minut',
    opis: [
      'Dziesięć minut w warsztacie to materiał na cały tydzień.',
      '',
      'Trzy ujęcia, które ma u siebie każdy — mechanik, fryzjer, stolarz, cukiernik. Nagrywasz telefonem, między jedną robotą a drugą.',
      '',
      'Wyślij to komuś, kto mówi, że nie ma o czym nagrywać.',
      '',
      'zovu.pl',
      '',
      '#warsztat #rzemioslo #wideo #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Dziesięć minut w warsztacie.', szukaj: 'mechanic workshop working hands', pauza: 0.36 },
      { rola: 'hak', tekst: 'Materiał na cały tydzień.', szukaj: 'craftsman workshop tools closeup', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'ręce', tekst: 'Nagraj ręce przy pracy. Z bliska.', szukaj: 'close up hands craftsman working detail', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'przed i po', tekst: 'Jeden kadr przed. Jeden po.', szukaj: 'before after repair workshop object', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'jedno zdanie', tekst: 'Powiedz jedno zdanie. Do kamery.', szukaj: 'worker talking to camera workshop', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Kupujemy u ludzi. Tych, których widzieliśmy przy robocie.', szukaj: 'customer shaking hands with mechanic', pauza: 0.32 },
      { rola: 'cta', tekst: 'Wyślij dalej. Komuś, kto nie ma o czym nagrywać.', szukaj: 'person sharing video phone workshop', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'co-robi-ai-a-czego-nie',
    plyta: { linie: ['TA ROLKA', 'BEZ KAMERY'], plaszka: 'AI U NAS' },
    forma: 'pod-prad',
    temat: 'co robi AI w naszej pracy, a czego nie',
    opis: [
      'Tę rolkę zrobiliśmy bez kamery. Ale nie zrobiła się sama.',
      '',
      'Mówimy wprost, co u nas robi AI, a czego nie zrobi za nikogo. Obietnica „wszystko zrobi sztuczna inteligencja" kończy się rozczarowaniem po pierwszym miesiącu.',
      '',
      'Napisz w komentarzu, co chcesz zobaczyć w następnej.',
      '',
      'zovu.pl',
      '',
      '#ai #marketing #wideo #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Ta rolka powstała bez kamery.', szukaj: 'empty film studio no people', pauza: 0.36 },
      { rola: 'hak', tekst: 'Ale nie powstała sama.', szukaj: 'person working laptop night desk', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'co robi', tekst: 'AI robi głos, montaż i tło.', szukaj: 'audio waveform editing screen', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'czego nie', tekst: 'Nie zna twoich klientów.', szukaj: 'shop owner talking with customer', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'kto decyduje', tekst: 'Scenariusz pisze człowiek. Zawsze.', szukaj: 'person writing notes storyboard desk', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Narzędzie skraca robotę. Nie zastępuje myślenia.', szukaj: 'hands typing keyboard focused work', pauza: 0.32 },
      { rola: 'cta', tekst: 'Napisz w komentarzu. Co pokazać w następnej.', szukaj: 'person commenting phone evening', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'rabat-nie-sprzedaje',
    plyta: { linie: ['RABAT', 'NIE SPRZEDAJE'], plaszka: 'POWÓD' },
    forma: 'mit',
    temat: 'dlaczego sama promocja nie działa',
    opis: [
      'Rabat nie sprzedaje. Powód sprzedaje.',
      '',
      'Minus dwadzieścia procent — od czego i dla kogo? Bez tych trzech rzeczy promocja czyta się jak desperacja.',
      '',
      'Zapisz przed następną promocją, zajmie ci minutę.',
      '',
      'zovu.pl',
      '',
      '#promocja #sprzedaz #marketing #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Rabat nie sprzedaje. Powód sprzedaje.', szukaj: 'sale sign shop window discount', pauza: 0.36 },
      { rola: 'hak', tekst: 'Minus dwadzieścia procent. Od czego?', szukaj: 'price tag discount closeup store', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'dlaczego teraz', tekst: 'Napisz dlaczego. Akurat teraz.', szukaj: 'calendar date circled marker', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'dla kogo', tekst: 'Napisz dla kogo. Konkretnie.', szukaj: 'target customer group people street', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'do kiedy', tekst: 'Daj termin. Konkretną datę.', szukaj: 'hourglass time running out desk', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Bez tego rabat czyta się inaczej. Jak desperacja.', szukaj: 'empty store no customers sale', pauza: 0.32 },
      { rola: 'cta', tekst: 'Zapisz to. Przed następną promocją.', szukaj: 'hand saving note phone screen', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'ile-trwa-strona',
    plyta: { linie: ['ILE TRWA', 'STRONA'], plaszka: 'TERMIN' },
    forma: 'jedna-liczba',
    temat: 'od czego zależy termin zrobienia strony',
    opis: [
      'Ile trwa strona? Pytanie brzmi inaczej: ile trwa u ciebie.',
      '',
      'Kod jest najkrótszą częścią tej roboty. Termin robią trzy rzeczy po stronie klienta — i o nich nikt nie mówi na początku.',
      '',
      'Napisz w komentarzu, na czym stoi twoja strona. Powiemy, jak to odblokować.',
      '',
      'zovu.pl',
      '',
      '#stronainternetowa #webdesign #malafirma #katowice #zovu',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Ile trwa strona? Inaczej.', szukaj: 'clock on office wall time', pauza: 0.36 },
      { rola: 'hak', tekst: 'Ile trwa u ciebie.', szukaj: 'person waiting laptop desk thinking', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'teksty', tekst: 'Teksty. Zwykle stoją najdłużej.', szukaj: 'writing text document laptop screen', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'zdjęcia', tekst: 'Zdjęcia. Albo je masz, albo czekamy.', szukaj: 'photographer shooting product studio', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'decyzje', tekst: 'Decyzje. Jedna osoba, nie pięć.', szukaj: 'business meeting people discussing table', pauza: 0.28 },
      { rola: 'zaplata', tekst: 'Kod to najkrótsza część. Naprawdę.', szukaj: 'developer coding screen fast typing', pauza: 0.32 },
      { rola: 'cta', tekst: 'Napisz w komentarzu. Na czym stoi twoja strona.', szukaj: 'hands typing comment phone office', pauza: 0.20 },
    ],
  },
  // ── Дописано 02.09.2026 по замерам 26 роликов ──────────────────────
  // Форма `kulisy` дала средний охват 75 при 7,7 у рисованных и 12,4
  // у списков — разрыв в шесть-десять раз на двух роликах подряд. При этом
  // сохранений за весь месяц ноль: ни один ролик не содержал того, к чему
  // возвращаются. Отсюда четыре новых сценария: три изнанки работы и один
  // с настройками, которые зритель захочет сохранить.
  {
    nazwa: 'ile-kosztuje-ta-rolka',
    plyta: { linie: ['TA ROLKA', 'ZERO ZŁOTYCH'], plaszka: 'ZERO' },
    forma: 'kulisy',
    temat: 'ile kosztuje zrobienie jednej rolki',
    opis: [
      'Ta rolka nie kosztowała ani złotówki.',
      '',
      'Materiał, głos, montaż i publikacja — wszystko poszło z darmowych narzędzi, na cudzym serwerze, o szóstej rano. Płacisz nie za render. Płacisz za to, że ktoś wcześniej wymyślił, co ma być na ekranie i w jakiej kolejności.',
      '',
      'Dlatego drogie agencje nie są drogie przez sprzęt.',
      '',
      'Napisz KOSZT, a rozpiszemy, ile realnie kosztuje miesiąc treści u ciebie.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Ta rolka kosztowała zero złotych.', szukaj: 'empty wallet coins table', pauza: 0.36 },
      { rola: 'hak', tekst: 'Materiał, głos, montaż. Wszystko.', szukaj: 'laptop screen editing timeline', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Renderuje serwer. Za darmo, w nocy.', szukaj: 'server room lights night', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Kosztowało co innego. Dwadzieścia minut myślenia.', szukaj: 'person thinking notebook desk', pauza: 0.32 },
      { rola: 'zaplata', tekst: 'Drogie jest to, co przed nagraniem. Nie po.', szukaj: 'storyboard sketch planning paper', pauza: 0.30 },
    ],
  },
  {
    nazwa: 'co-sie-psuje',
    plyta: { linie: ['LEKTOR', 'PRZECZYTAŁ TO ŹLE'], plaszka: 'BŁĄD' },
    forma: 'kulisy',
    temat: 'co się psuje, kiedy rolkę składa automat',
    opis: [
      'Automat przeczytał słowo NIC jako skrót. Litera po literze.',
      '',
      'Takich rzeczy w miesiąc uzbierało się kilka: muzyka urywała się dokładnie tam, gdzie kończył się głos, a napisy wchodziły po jednym słowie, więc na całym ekranie stało samotne NA.',
      '',
      'Żadnego z tych błędów nie widać w logach. Widać dopiero, jak się obejrzy i posłucha.',
      '',
      'Dlatego automat składa, a człowiek zawsze odsłuchuje przed publikacją.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Lektor przeczytał słowo NIC jako skrót.', szukaj: 'microphone studio recording closeup', pauza: 0.38 },
      { rola: 'hak', tekst: 'Litera po literze. En, i, ce.', szukaj: 'sound wave screen audio editing', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Muzyka urywała się razem z głosem.', szukaj: 'audio mixer faders studio', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Napisy wchodziły po jednym słowie.', szukaj: 'video editing captions screen', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'W logach tego nie widać. Trzeba obejrzeć.', szukaj: 'person watching phone screen close', pauza: 0.32 },
    ],
  },
  {
    nazwa: 'ustawienia-telefonu',
    plyta: { linie: ['TRZY USTAWIENIA', 'ZANIM NAGRASZ'], plaszka: '3' },
    forma: 'kulisy',
    temat: 'jak ustawić telefon, żeby nagranie nie wyglądało amatorsko',
    opis: [
      'Trzy ustawienia w telefonie. Zajmują minutę, a robią więcej niż montaż.',
      '',
      'Po pierwsze: 25 klatek, nie 30. Świetlówki i lampy w Polsce migają w rytmie 50 Hz i przy 30 klatkach na materiale pojawiają się pasy.',
      '',
      'Po drugie: zablokuj ekspozycję na twarzy, nie na tle. Inaczej przy każdym ruchu obraz sam sobie zmienia jasność.',
      '',
      'Po trzecie: nie przybliżaj zoomem. Podejdź. Zoom w telefonie to wycinanie pikseli, nie obiektyw.',
      '',
      'Zapisz to sobie przed następnym nagraniem.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Trzy ustawienia w telefonie.', szukaj: 'person filming with smartphone tripod', pauza: 0.36 },
      { rola: 'hak', tekst: 'Zajmują minutę. Robią więcej niż montaż.', szukaj: 'smartphone camera settings screen', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'klatki', tekst: '25 klatek, nie 30. Lampy migają.', szukaj: 'fluorescent lights ceiling office', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'ekspozycja', tekst: 'Zablokuj jasność na twarzy, nie na tle.', szukaj: 'portrait face lighting indoor', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'zoom', tekst: 'Nie przybliżaj. Podejdź bliżej.', szukaj: 'person walking closer with camera', pauza: 0.28 },
      { rola: 'cta', tekst: 'Zapisz to. Przyda się przy następnym nagraniu.', szukaj: 'hand saving post on phone', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'lezala-cztery-dni',
    plyta: { linie: ['GOTOWA', 'OD CZTERECH DNI'], plaszka: '4 DNI' },
    forma: 'kulisy',
    temat: 'dlaczego treść robi się z wyprzedzeniem',
    opis: [
      'Ta rolka leżała gotowa cztery dni.',
      '',
      'Nie dlatego, że nie było czasu jej wrzucić. Dlatego, że treść robiona na dziś jest treścią robioną w pośpiechu — a widz to czuje szybciej niż my.',
      '',
      'Zapas kilku dni robi jedną rzecz: zepsuty plik albo padający serwer nie zostawia profilu pustego. Regularność to nie charakter. To zapas.',
      '',
      'Napisz PLAN, a pokażemy, jak zrobić taki zapas u siebie.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Ta rolka leżała gotowa cztery dni.', szukaj: 'calendar planning desk week', pauza: 0.38 },
      { rola: 'hak', tekst: 'Czekała na swój dzień.', szukaj: 'hourglass time waiting table', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Treść na dziś to treść w pośpiechu.', szukaj: 'stressed person laptop deadline', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Zapas ratuje, gdy coś padnie.', szukaj: 'backup storage drives shelf', pauza: 0.30 },
      { rola: 'zaplata', tekst: 'Regularność to nie charakter. To zapas.', szukaj: 'organized workspace calm morning', pauza: 0.32 },
    ],
  },
  // ── Дописано 04.09.2026, когда рисованные вышли из расписания ──────
  // Круг стоковых сценариев стал единственным, поэтому банк обязан быть
  // длиннее MIN_DNI: двадцать шесть сценариев давали повтор на 26-й день.
  // Шесть новых добавлены не «чтобы было тридцать», а по замерам форм: три
  // kulisy (75-114 охвата), pytanie, mit и jedna-liczba — то есть всё, что
  // стоит выше списков. Два сценария написаны ПОД СОХРАНЕНИЕ: за месяц их
  // в ленте ноль, а площадка разносит именно по ним.
  {
    nazwa: 'przejrzelismy-swoje-rolki',
    plyta: { linie: ['26 WŁASNYCH', 'ROLEK'], plaszka: '26' },
    forma: 'kulisy',
    temat: 'co pokazał przegląd własnych statystyk',
    opis: [
      'Przejrzeliśmy dwadzieścia sześć swoich rolek. Wyszło coś, czego nie chcieliśmy zobaczyć.',
      '',
      'Najlepsza miała dziesięć razy większy zasięg niż najsłabsza. Ten sam montaż, ten sam głos, ten sam profil, te same godziny. Różnica była w tym, O CZYM była rolka — nie w tym, jak została zmontowana.',
      '',
      'Przez cały poprzedni tydzień robiliśmy akurat tę formę, która wypadała najgorzej. Bez policzenia nie dało się tego zauważyć: każda z osobna wyglądała normalnie.',
      '',
      'Wejdź w swoje statystyki i wypisz trzy najlepsze rolki. Nie po lajkach — po zasięgu. Potem zobacz, co je łączy.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Przejrzeliśmy dwadzieścia sześć swoich rolek.', szukaj: 'analytics dashboard screen laptop', pauza: 0.36 },
      { rola: 'hak', tekst: 'Wyszło coś, czego nie chcieliśmy zobaczyć.', szukaj: 'person looking at phone serious face', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Najlepsza miała dziesięć razy większy zasięg.', szukaj: 'rising graph chart growth screen', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Ten sam montaż. Ten sam głos. Ta sama godzina.', szukaj: 'video editing timeline closeup', pauza: 0.32 },
      { rola: 'zaplata', tekst: 'Różnica była w temacie. Nie w cięciach.', szukaj: 'storyboard sketch planning desk', pauza: 0.30 },
      { rola: 'cta', tekst: 'Wypisz swoje trzy najlepsze. Zobacz, co je łączy.', szukaj: 'hands writing notes notebook', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'jeden-plik-cztery-serwisy',
    plyta: { linie: ['JEDNA ROLKA', 'CZTERY SERWISY'], plaszka: '4' },
    forma: 'kulisy',
    temat: 'dlaczego ten sam plik wygląda inaczej na każdej platformie',
    opis: [
      'Jedna rolka idzie u nas na cztery serwisy. Każdy psuje ją inaczej.',
      '',
      'Napisy przy samym dole zasłania interfejs — inny na każdej platformie. Bezpieczne pole to środek kadru, a nie krawędź.',
      '',
      'Okładka: na YouTube pionowy kadr zostaje przycięty, więc twarz i tekst muszą siedzieć w środku, nie przy górnej krawędzi.',
      '',
      'Głośność: każdy serwis wyrównuje ją po swojemu, więc materiał zmiksowany za głośno i tak zostanie ściszony, tylko już bez oddechu.',
      '',
      'Zapisz to sobie przed następnym eksportem — po publikacji poprawki już nie ma.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Jedna rolka. Cztery serwisy.', szukaj: 'smartphone social media apps screen', pauza: 0.36 },
      { rola: 'hak', tekst: 'Każdy psuje ją inaczej.', szukaj: 'glitch broken screen digital', pauza: 0.44 },
      { rola: 'punkt', numer: 1, tytul: 'napisy', tekst: 'Napisy przy dole. Zasłania je interfejs.', szukaj: 'phone screen video subtitles closeup', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'okładka', tekst: 'Okładkę YouTube przytnie po swojemu.', szukaj: 'youtube thumbnail editing screen', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'głośność', tekst: 'Głośność każdy serwis wyrówna sam.', szukaj: 'audio mixer faders studio closeup', pauza: 0.28 },
      { rola: 'cta', tekst: 'Zapisz to. Przyda się przy następnym eksporcie.', szukaj: 'hand saving post on phone screen', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'kropka-w-srodku-zdania',
    plyta: { linie: ['JEDNA KROPKA', 'ZMIENIA GŁOS'], plaszka: 'KROPKA' },
    forma: 'kulisy',
    temat: 'jak pisać tekst, który ma przeczytać automat',
    opis: [
      'Automat czyta tekst inaczej niż człowiek. Jedna kropka zmienia wszystko.',
      '',
      'Zdanie bez kropki leci jednym ciągiem, na jednym oddechu, i po trzech sekundach brzmi jak zapowiedź na dworcu. Kropka postawiona w środku myśli daje oddech i nacisk dokładnie tam, gdzie chcesz.',
      '',
      'Sprawdziliśmy to na kilkudziesięciu dublach własnym głosem: ten sam tekst z kropką w środku brzmi spokojniej i jest zrozumiały przy pierwszym przesłuchaniu.',
      '',
      'Pauzy pisze się znakami, nie nadzieją. Przeczytaj swój tekst na głos — tam, gdzie brakuje ci powietrza, postaw kropkę.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Automat czyta tekst inaczej niż człowiek.', szukaj: 'microphone studio recording closeup', pauza: 0.36 },
      { rola: 'hak', tekst: 'Jedna kropka zmienia wszystko.', szukaj: 'typing keyboard text screen closeup', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Zdanie bez kropki leci jednym ciągiem.', szukaj: 'sound wave audio editing screen', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Kropka w środku daje oddech. I nacisk.', szukaj: 'person speaking microphone calm', pauza: 0.32 },
      { rola: 'zaplata', tekst: 'Pauzy pisze się znakami. Nie nadzieją.', szukaj: 'writer editing text on paper', pauza: 0.30 },
      { rola: 'cta', tekst: 'Przeczytaj tekst na głos. Gdzie brakuje powietrza, tam kropka.', szukaj: 'person reading aloud notes desk', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'reklama-czy-najpierw-tresci',
    plyta: { linie: ['REKLAMA', 'CZY TREŚCI?'], plaszka: 'CO PIERWSZE' },
    forma: 'pytanie',
    temat: 'czy warto puszczać reklamę przy pustym profilu',
    opis: [
      'Klient pyta: puścić reklamę czy najpierw zrobić treści? Odpowiedź nie jest miła.',
      '',
      'Reklama przyprowadza ludzi na profil. Pusty profil odsyła ich z powrotem — i to jest wszystko, co się dzieje z budżetem, kiedy po kliknięciu nie ma czego oglądać.',
      '',
      'Reklama wzmacnia to, co już działa. Nie tworzy tego.',
      '',
      'Kolejność, która u nas wychodzi taniej: kilkanaście publikacji, potem sprawdzenie, które z nich ludzie oglądają do końca, i dopiero za tym budżet — na materiał, który obronił się bez pieniędzy.',
      '',
      'Napisz w komentarzu, na czym stoisz dzisiaj: reklama, treści, czy jedno i drugie po trochu.',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Reklama czy najpierw treści?', szukaj: 'two paths choice decision road', pauza: 0.36 },
      { rola: 'hak', tekst: 'Odpowiedź nie jest miła.', szukaj: 'person thinking serious office', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Reklama przyprowadza ludzi na profil.', szukaj: 'phone advertising social media screen', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Pusty profil odsyła ich z powrotem.', szukaj: 'empty phone screen scrolling hand', pauza: 0.32 },
      { rola: 'zaplata', tekst: 'Reklama wzmacnia to, co działa. Nie tworzy tego.', szukaj: 'marketing growth chart screen', pauza: 0.30 },
      { rola: 'cta', tekst: 'Napisz w komentarzu, na czym stoisz dzisiaj.', szukaj: 'hands typing comment phone office', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'mit-hasztagow',
    plyta: { linie: ['HASZTAGI', 'NIE DAJĄ ZASIĘGU'], plaszka: 'MIT' },
    forma: 'mit',
    temat: 'jak naprawdę działają hasztagi',
    opis: [
      'Hasztagi nie dają zasięgu. Ale ich brak potrafi go zabrać.',
      '',
      'Popularny tag to kilkanaście milionów publikacji. Konto o zasięgu kilkudziesięciu osób nie pojawi się tam nigdy — to jak zostawić wizytówkę na stadionie.',
      '',
      'Wąski i lokalny robi więcej, bo jest tam mniej tłumu, a ludzie szukają konkretnie tego. Nasza zasada po miesiącu prób: dwa lokalne, dwa branżowe, dwa o tym, o czym naprawdę jest materiał.',
      '',
      'I rzecz, która psuje najbardziej: tag nietrafiony jest gorszy niż jego brak. Sprawdź swój ostatni post — ile z tych tagów jest naprawdę o tobie?',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Hasztagi nie dają zasięgu.', szukaj: 'phone social media post screen', pauza: 0.36 },
      { rola: 'hak', tekst: 'Ale ich brak potrafi go zabrać.', szukaj: 'crowd stadium many people', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Popularny tag to miliony publikacji.', szukaj: 'busy crowd street people walking', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Wąski i lokalny robi więcej. Mniej tłumu.', szukaj: 'small local shop street sign', pauza: 0.32 },
      { rola: 'zaplata', tekst: 'Dwa lokalne, dwa branżowe. Reszta to ozdoba.', szukaj: 'notebook checklist writing hand', pauza: 0.30 },
      { rola: 'cta', tekst: 'Sprawdź ostatni post. Ile tagów jest o tobie?', szukaj: 'person checking phone screen closeup', pauza: 0.20 },
    ],
  },
  {
    nazwa: 'cztery-sekundy-uwagi',
    plyta: { linie: ['4,5 SEKUNDY', 'TYLE MASZ'], plaszka: '4,5 s' },
    forma: 'jedna-liczba',
    temat: 'ile realnie trwa uwaga widza na rolce',
    opis: [
      'Cztery i pół sekundy. Tyle średnio trwa uwaga na naszych rolkach — to nasze własne statystyki, nie cudza prezentacja.',
      '',
      'To znaczy jedno: nie masz wstępu. Masz jedno zdanie.',
      '',
      'Jeśli pierwsze zdanie nie dotyka czegoś, co widza uwiera, reszta materiału nie istnieje. Można ją zmontować idealnie i nikt jej nie zobaczy.',
      '',
      'Dlatego pierwsze zdanie piszemy zawsze na końcu — kiedy już wiadomo, co w materiale jest najmocniejsze.',
      '',
      'Włącz swoją ostatnią rolkę i zatrzymaj ją po czterech sekundach. Wiadomo, o czym jest?',
      '',
      'zovu.pl',
    ].join(String.fromCharCode(10)),
    czesci: [
      { rola: 'hak', tekst: 'Cztery i pół sekundy.', szukaj: 'stopwatch timer closeup hand', pauza: 0.36 },
      { rola: 'hak', tekst: 'Tyle trwa uwaga na twojej rolce.', szukaj: 'person scrolling phone fast', pauza: 0.44 },
      { rola: 'tresc', tekst: 'Nie masz wstępu. Masz jedno zdanie.', szukaj: 'typing text on screen closeup', pauza: 0.30 },
      { rola: 'tresc', tekst: 'Jeśli ono nie uwiera, dalej nikt nie dojdzie.', szukaj: 'thumb swiping phone screen', pauza: 0.32 },
      { rola: 'zaplata', tekst: 'Dlatego pierwsze zdanie piszemy ostatnie.', szukaj: 'writer notebook pen desk thinking', pauza: 0.30 },
      { rola: 'cta', tekst: 'Zatrzymaj swoją rolkę po czterech sekundach. Wiadomo, o czym jest?', szukaj: 'hand pausing video on phone', pauza: 0.20 },
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

// Досъёмка витрины по требованию.
//
// Сами проезды по сайтам (.mp4) в репозитории не лежат — только кадры-обложки:
// видео весит десятки мегабайт и в git ему не место. Из-за этого сценарий
// «nasze-strony» на сервере не собирался НИ РАЗУ: ротация до него дошла
// только 31.08, и сборка легла на первом же куске с сообщением «запусти
// witryny.mjs» — которое некому прочитать в три часа ночи.
//
// Поэтому сборщик снимает недостающее сам. Браузер на сервере уже стоит:
// им же снимаются рисованные ролики. Пробуем каждый ключ один раз за прогон:
// если съёмка не удалась, второй заход её не спасёт, а время слота съест.
const dosnieteWitryny = new Set();
async function dosnimijWitryne(klucz) {
  if (dosnieteWitryny.has(klucz)) return false;
  dosnieteWitryny.add(klucz);
  console.log(`[rolka-auto] витрины «${klucz}» нет на диске — снимаю сам`);
  try {
    await execFileAsync(process.execPath, [path.join(DIR, 'witryny.mjs'), `--tylko=${klucz}`], {
      cwd: DIR,
      maxBuffer: 64 * 1024 * 1024,
    });
    return true;
  } catch (e) {
    console.warn(`[rolka-auto] съёмка витрины «${klucz}» не удалась: ${e.message}`);
    return false;
  }
}

// `uzyte` — id клипов, уже занятых В ЭТОМ ролике. Без этого списка два
// куска с похожими запросами («calculator money desk» и «calculator money
// budget desk») брали ОДИН файл, и он стоял в ролике дважды. Смещение по
// `i` от этого не спасало: оно двигает позицию внутри выдачи, а выдача у
// похожих запросов одна и та же.
async function podklad(czesc, i, scenNazwa, uzyte = new Set()) {
  // Свои витрины идут вперёд стока. Сток может собрать кто угодно за вечер,
  // а снятый проездом живой сайт клиента подделать нельзя — это и есть
  // единственное доказательство, которое у нас есть. Снимает `witryny.mjs`.
  //
  // Если кадра нет на диске (съёмку не гоняли), молча на сток НЕ падаем:
  // подмена доказательства стоковым ноутбуком — ровно та подмена, из-за
  // которой в ленту однажды ушёл чужой салон красоты под нашей подписью.
  if (czesc.witryna) {
    const swoja = path.join(DIR, 'broll', 'witryny', `${czesc.witryna}.mp4`);
    try {
      await readFile(swoja);
      return swoja;
    } catch {
      if (await dosnimijWitryne(czesc.witryna)) {
        try {
          await readFile(swoja);
          return swoja;
        } catch {
          // Съёмка отработала, а файла нет — значит упала внутри. Идём дальше
          // по общим правилам: сток вместо доказательства не подставляем.
        }
      }
      console.warn(
        `[rolka-auto] нет съёмки витрины «${czesc.witryna}» — ` +
          `запусти: node witryny.mjs --tylko=${czesc.witryna}`
      );
      if (!czesc.szukaj) return null;
    }
  }

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
  // Имя работает наравне с номером. Номера сдвигаются каждый раз, когда в
  // банк добавляется сценарий, и «пересобери третий» назавтра означает уже
  // другой ролик — на это легко наступить и трудно заметить.
  if (JAWNY !== '' && !/^\d+$/.test(JAWNY)) {
    const i = SCENARIUSZE.findIndex((s) => s.nazwa === JAWNY);
    if (i < 0) {
      throw new Error(
        `нет сценария «${JAWNY}». Есть: ${SCENARIUSZE.map((s) => s.nazwa).join(', ')}`
      );
    }
    return { scen: SCENARIUSZE[i], idx: i, wydanie: i };
  }
  if (JAWNY !== '') return { scen: SCENARIUSZE[NR] || SCENARIUSZE[0], idx: NR, wydanie: NR };
  let stan = {};
  try { stan = JSON.parse(await readFile(STAN, 'utf8')); } catch { stan = {}; }
  const zajete = await czekajaceScenariusze();

  // Берём не следующий по кругу, а тот, что не выходил дольше всех. Круг
  // замыкался молча: банк из двенадцати мыслей при выкладке каждый день
  // возвращался к началу за полторы недели, и лента повторяла текст слово
  // в слово — новым дублем голоса, то есть незаметно для нас и заметно для
  // зрителя. Разбор — в historia-scenariuszy.mjs.
  const historia = await historiaScenariuszy(DIR);
  // Веса по форме. Когда в банке полтора десятка сценариев с одинаковым
  // «ни разу не выходил», выбор между ними делал порядок в массиве — то есть
  // случайность, хотя замер 26 роликов показал разброс охвата в десять раз.
  // Теперь при равном возрасте вперёд идёт форма с лучшими цифрами.
  const wagiForm = await sredniZasiegPoFormie(DIR);
  const poprzedniaForma = await ostatniaForma(DIR);
  const wybor = wybierzNajdawniejszy(
    SCENARIUSZE.map((s, i) => ({ id: s.nazwa, idx: i, forma: s.forma })),
    historia,
    zajete,
    wagiForm,
    poprzedniaForma
  );
  const idx = wybor.idx;
  console.log(`[rolka-auto] ${opiszWybor(wybor)}; не выходило больше месяца: ${wybor.swiezych}`);
  if (wybor.powtorka) {
    console.log(
      '::warning::Банк сценариев кончился — лента идёт по второму кругу. ' +
        'Нужны новые сценарии, иначе зритель видит один и тот же ролик.'
    );
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
    bezGlosu: BEZ_GLOSU,
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
