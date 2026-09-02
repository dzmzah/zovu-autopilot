// Движок контента ZOVU: сам выбирает тему и формат, пишет текст, проверяет его
// и отдаёт готовые данные для карусели. Правила берутся из KONTENT.md.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_DIR = 'D:\\My AI\\Zovu.pl\\Автоматизация\\Посты';
const KONTENT_FILE = path.join(PROJECT_DIR, 'KONTENT.md');
const STATE_FILE = path.join(import.meta.dirname, 'state.json');
const ENV_FILE = path.join(import.meta.dirname, '.env');

// ── темы и форматы: по кругу, чтобы лента не повторялась ──────────
const TOPICS = [
  'Błędy w prowadzeniu social mediów przez małe firmy',
  'Dlaczego ładna strona nie sprzedaje',
  'Szybkość ładowania strony i traceni klienci',
  'Regularność publikacji kontra „gdy znajdę czas"',
  'Jak pisać opisy usług, żeby ludzie kupowali',
  'Reels kontra zwykłe posty w lokalnym biznesie',
  'Co zautomatyzować w małej firmie w pierwszej kolejności',
  'Szybkość odpowiedzi na wiadomości od klientów',
  'Opinie klientów jako narzędzie sprzedaży',
  'Wizytówka Google, której nikt nie uzupełnia',
  'Dlaczego tania strona wychodzi drożej',
  'Jeden brief, trzydzieści postów — jak to działa',
  'Wideo z telefonu kontra studio: co naprawdę potrzebne',
  'Reklama bez fundamentów to przepalony budżet',
  'Jak wygląda dobry profil lokalnej firmy',
  'Błędy w zdjęciach produktów',
  'Co pisać, kiedy nie ma o czym pisać',
  'Relacje, których nikt nie ogląda — dlaczego',
  'Menu i cennik na stronie: pokazywać czy nie',
  'Jak mierzyć, czy content działa',
  'Strona na kreatorze kontra robiona pod zadanie',
  'AI w marketingu: gdzie pomaga, a gdzie przeszkadza',
  'Jak nie stracić klienta po pierwszym kontakcie',
  'Lokalne SEO dla małej firmy',
  'Dlaczego konkurent z gorszym produktem sprzedaje więcej',
  'Co zrobić z negatywną opinią',
  'Ile godzin kosztuje prowadzenie social mediów samemu',
  'Wygląd profilu: bio, link, wyróżnione relacje',
  'Content, który pracuje latami',
  'Kiedy warto zatrudnić agencję, a kiedy jeszcze za wcześnie',
  // ── branże, pod które piszemy konkretnie ──
  'Profil restauracji, który przyciąga gości z okolicy',
  'Salon urody: jak pokazywać efekty pracy, żeby zapisywali się sami',
  'Warsztat samochodowy w internecie: czego szuka klient',
  'Sklep internetowy: opisy produktów, które sprzedają',
  'Gabinet i klinika: zaufanie zanim pacjent zadzwoni',
  'Fryzjer i barber: portfolio zamiast cennika',
  'Firma budowlana: zdjęcia z placu zamiast sloganów',
  'Kwiaciarnia i mała gastronomia: sezonowość w treściach',
  'Trener i fizjoterapeuta: jak nie wyglądać jak wszyscy',
  'Sklep stacjonarny: jak internet przyprowadza ludzi do drzwi',
  // ── konkretne problemy dnia codziennego ──
  'Nie odpisujesz na wiadomości w weekend. Ile to kosztuje',
  'Zdjęcia z telefonu kontra zdjęcia z sesji: kiedy co',
  'Cennik na stronie: argumenty za i przeciw',
  'Klient pyta o cenę w komentarzu. Co odpisać',
  'Konkurencja skopiowała Twój post. I co teraz',
  'Ile postów trzeba, zanim coś się zacznie dziać',
  'Dlaczego posty mają zasięg, a telefon milczy',
  'Jak wygląda dobre zdjęcie profilowe firmy',
  'Bio na Instagramie: trzy linijki, które muszą sprzedać',
  'Wyróżnione relacje: co tam trzymać',
  'Kiedy usunąć stary post, a kiedy zostawić',
  'Jak pisać o podwyżce cen, żeby klienci zostali',
  'Post z okazji święta: kiedy ma sens, a kiedy to zapychacz',
  'Jak zbierać opinie, żeby ludzie faktycznie je pisali',
  'Odpowiedzi na komentarze: szablon czy własnymi słowami',
  'Współpraca z lokalnym twórcą: na co uważać',
  'Reels bez pokazywania twarzy: czy da się',
  'Jak zaplanować content na miesiąc w dwie godziny',
  'Statystyki Instagrama: na które trzy liczby patrzeć',
  'Kiedy przestać publikować i naprawić fundamenty',
  // ── AI i automatyzacja, praktycznie ──
  'AI napisze post, ale nie wie, co u Ciebie w firmie',
  'Co AI robi lepiej od człowieka w małej firmie',
  'Gdzie AI szkodzi treściom marki',
  'Automatyczne odpowiedzi: pomagają czy irytują',
  'Jak wygląda dzień firmy, która zautomatyzowała powtarzalne zadania',
  'Ile realnie kosztuje wdrożenie automatyzacji w małej firmie',
  'Chatbot na stronie: kiedy ma sens',
  'Czy warto generować zdjęcia produktów przez AI',
  'AI w obsłudze klienta: gdzie postawić granicę',
  'Jeden system zamiast pięciu narzędzi',
];

const FORMATS = [
  { key: 'bledy', label: '5 błędów', brief: 'Pięć konkretnych błędów, które odbiorca prawdopodobnie popełnia. Każdy punkt to błąd i jedna linia, dlaczego kosztuje.' },
  { key: 'checklista', label: 'Checklista', brief: 'Pięć rzeczy do sprawdzenia u siebie. Odbiorca ma móc zrobić to sam, bez agencji.' },
  // Заголовок пункта ОБЯЗАН начинаться с «MIT:». Без пометки миф читается как
  // утверждение агентства: слайд «Zmiany na rynku dotyczą tylko gigantów»
  // выглядит ровно как то, что ZOVU и заявляет, — а это противоположность
  // смысла поста. Человек листает быстро и подпись под заголовком не читает.
  { key: 'mity', label: 'Mity', brief: 'Pięć przekonań, które są nieprawdziwe. Każdy punkt to mit i jedna linia z faktem. KAŻDY nagłówek punktu MUSI zaczynać się od „MIT: " — bez tego czytelnik bierze mit za nasze twierdzenie.' },
  { key: 'porownanie', label: 'Tak kontra nie tak', brief: 'Pięć par: co działa, a co nie. Każdy punkt pokazuje różnicę na konkrecie.' },
  { key: 'kroki', label: 'Kroki', brief: 'Pięć kroków po kolei, od pierwszego do ostatniego. Konkretne działania, nie ogólniki.' },
  { key: 'kosztuje', label: 'Ile to kosztuje', brief: 'Pięć rzeczy, które odbiorca traci przez zaniedbanie: czas, klientów, pieniądze. Konkretnie, bez wymyślonych liczb.' },
  { key: 'sygnaly', label: 'Sygnały ostrzegawcze', brief: 'Pięć znaków, że coś jest nie tak. Każdy punkt to obserwacja, którą odbiorca rozpozna u siebie.' },
  { key: 'zamiast', label: 'Zamiast tego zrób tak', brief: 'Pięć par: zamiast złego nawyku — konkretna zamiana. Każdy punkt to prosta podmiana.' },
];

// теги фонов, которые есть в библиотеке
const BG_TAGS = ['automatyzacja', 'social', 'pieniadze', 'czas', 'analityka'];

// ── запрещённые обороты: вода и корпоративщина ───────────────────
const BANNED = [
  'w dzisiejszych czasach', 'każda firma marzy', 'świat się zmienia',
  'kompleksowe rozwiązania', 'synergia', 'dedykowany zespół',
  'gwarantujemy sukces', 'w zakresie', 'celem realizacji',
  'engagement', 'lejek konwersji', 'zasięgi organiczne',
  // вода, которую модель любит подсовывать
  'w nowym świecie', 'nie zostawaj w tyle', 'nie zostań w tyle',
  'rewolucja', 'era ai', 'przyszłość marketingu', 'to nie hype',
  'klucz do sukcesu', 'nowe możliwości', 'bądź na bieżąco',
  'wykorzystaj potencjał', 'zmieniający się świat',
  'przyszłość', 'to trend', 'nadąż', 'wyprzedź konkurencję',
  'w erze', 'nowoczesne technologie', 'cyfrowy świat',
];

// ── эталонные примеры: модель копирует уровень, а не только правила ──
const EXAMPLE_CAROUSEL = `{
  "eyebrow": "ZOVU · SOCIAL MEDIA",
  "title": "5 błędów, które kosztują Cię klientów",
  "subtitle": "Sprawdź, czy któregoś nie robisz u siebie.",
  "items": [
    { "heading": "Publikujesz nieregularnie", "text": "Algorytm nagradza rytm, nie zrywy raz na miesiąc.", "bgIdea": "floating violet glass calendar pages and clock" },
    { "heading": "Mówisz o sobie, nie o kliencie", "text": "Zamień „oferujemy” na „zyskasz”. Od razu widać różnicę.", "bgIdea": "floating chrome speech bubbles and violet glass megaphone" },
    { "heading": "Brak jednego stylu", "text": "Profil ma wyglądać jak jedna marka, nie zbiór przypadkowych postów.", "bgIdea": "floating violet glass color swatches and grid panels" },
    { "heading": "Zero wezwania do działania", "text": "Post bez CTA to ładny obrazek, który nic nie sprzedaje.", "bgIdea": "floating neon glass button and cursor arrow" },
    { "heading": "Nie mierzysz efektów", "text": "Bez liczb nie wiesz, co powtórzyć, a co wyrzucić.", "bgIdea": "floating neon bar charts and rising arrow" }
  ],
  "cta": { "headline": "Zrobimy to za Ciebie", "line": "Prowadzimy social media firm, które nie mają na to czasu." }
}`;

const EXAMPLE_SINGLE = `{
  "eyebrow": "ZOVU · STRONY WWW",
  "title": "Ładna strona to nie to samo co strona, która sprzedaje",
  "bullets": [
    "Klient szuka ceny, a znajduje slider",
    "Numer telefonu ukryty w stopce",
    "Formularz na osiem pól, nikt go nie wypełni"
  ],
  "bgIdea": "floating violet glass smartphone and chrome cursor arrow",
  "caption": "..."
}`;

// Пример под макеты без списка. Отдельный нужен потому, что образец сильнее
// правил: показав пост с тремя пунктами, мы получим три пункта, сколько ни
// пиши «списка не будет». Здесь показываем ровно то, что ждём — заголовок и
// одну строку под ним.
const EXAMPLE_FOTO = `{
  "eyebrow": "ZOVU · WARSZTAT",
  "title": "Klient dzwoni tam, gdzie widzi cennik",
  "subtitle": "Wymiana oleju: 180 zł. Tyle wystarczy, żeby telefon zadzwonił.",
  "photoQuery": "local mechanic car workshop",
  "caption": "..."
}`;

const DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return { topic: -1, format: -1, bg: -1 };
  }
}

// ДОПИСЫВАЕТ, а не заменяет. Раньше писалось как есть, и вызов из makePost —
// он передаёт только ротацию (тема, формат, фон, счётчик, день тренда) —
// сносил всё остальное: отметку слота `posted`, дату снятия блокировки
// `wznowiono`, счётчики тревоги `blokadaOd`/`alarmDnia`.
//
// Заметно это стало по логу 11.08: строчка «dostęp wrócił — włączam tryb
// łagodny» напечаталась второй раз, хотя доступ вернулся ещё 09.08. То есть
// щадящая неделя начиналась заново КАЖДЫЙ день, вечерний слот пропускался
// всегда, и автопилот навсегда остался бы на одном посте в сутки вместо двух.
// Ровно та тихая деградация, которую никто не замечает: посты идут, просто
// вдвое реже, чем задумано.
async function saveState(s) {
  const teraz = await readState();
  await writeFile(STATE_FILE, JSON.stringify({ ...teraz, ...s }, null, 1), 'utf8');
}

// Сначала переменные окружения (так работает на сервере GitHub Actions),
// потом локальный файл .env (так работает на ПК).
async function env(key) {
  if (process.env[key]) return process.env[key].trim();
  try {
    const raw = await readFile(ENV_FILE, 'utf8');
    const m = raw.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.+)\\s*$', 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// ── свежая идея из трендов ───────────────────────────────────────
// Берём заголовки польских новостей про бизнес и маркетинг и превращаем
// один из них в тему поста. Без ключей: обычный RSS Google News.
const TREND_FEEDS = [
  'https://news.google.com/rss/search?q=marketing+ma%C5%82ych+firm&hl=pl&gl=PL&ceid=PL:pl',
  'https://news.google.com/rss/search?q=social+media+biznes&hl=pl&gl=PL&ceid=PL:pl',
  'https://news.google.com/rss/search?q=sztuczna+inteligencja+firmy&hl=pl&gl=PL&ceid=PL:pl',
];

// Основной путь: сюжет, который подтвердился минимум в трёх изданиях.
// Если совпадений нет — откатываемся на одну ленту, потом на список тем.
async function freshIdea() {
  try {
    const { detectStory } = await import('./trends.mjs');
    const r = await detectStory({ minSources: 3, businessOnly: true });
    if (r.story) {
      return { title: r.story.titles[0], sources: r.story.count, keywords: r.story.keywords };
    }
  } catch {
    /* детектор недоступен — идём дальше */
  }
  const one = await singleFeedIdea();
  return one ? { title: one, sources: 1, keywords: [] } : null;
}

async function singleFeedIdea() {
  const feed = TREND_FEEDS[Math.floor(Date.now() / 86400000) % TREND_FEEDS.length];
  try {
    const xml = await fetch(feed, { headers: { 'user-agent': 'Mozilla/5.0' } }).then((r) => r.text());
    const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g)]
      .map((m) => (m[1] || m[2] || '').trim())
      .filter((t) => t && t.length > 25 && !/^Google News/i.test(t))
      .slice(1, 12);
    if (!titles.length) return null;
    // берём заголовок дня — стабильно, но меняется каждые сутки
    return titles[Math.floor(Date.now() / 86400000) % titles.length];
  } catch {
    return null;
  }
}

// ── системный промпт собирается из KONTENT.md ────────────────────
// layout — макет одиночного поста: 'lista' (заголовок + три пункта),
// 'foto' (фото главное, текста минимум), 'cytat' (одна крупная фраза).
// От макета зависит, какие поля мы вообще просим у модели: у фото-поста
// списка нет, и требовать его — значит гарантированно получить брак.
async function buildSystemPrompt(format, reel = false, layout = 'lista') {
  let rules = '';
  try {
    const md = await readFile(KONTENT_FILE, 'utf8');
    // берём разделы «Кому пишем», «Что продаём» и «Тон» — это ядро
    const cut = md.split('## 4. Форматы постов')[0];
    rules = cut.replace(/^#.*$/gm, '').trim();
  } catch {
    rules = 'Agencja ZOVU. Ton konkretny, bez waty i bez wykrzykników.';
  }

  return `Jesteś starszym copywriterem polskiej agencji ZOVU z Katowic.

Poniżej zasady marki. Trzymaj się ich bezwzględnie:
${rules}

━━━ WZÓR, DO KTÓREGO MASZ RÓWNAĆ ━━━
Tak wygląda tekst na naszym poziomie. Skopiuj ten sposób myślenia:
konkret zamiast ogólnika, obraz zamiast pojęcia, krótkie zdanie.

${!format.single ? EXAMPLE_CAROUSEL : layout === 'lista' ? EXAMPLE_SINGLE : EXAMPLE_FOTO}

Zwróć uwagę: żadnego „nowe możliwości", „bądź na bieżąco", „przyszłość".
Każdy punkt da się zobaczyć oczami. „Numer telefonu ukryty w stopce" — to widać.
„Wykorzystaj potencjał AI" — tego nie widać, więc tak NIE piszemy.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORMAT TEGO POSTU: ${format.label}. ${format.brief}${reel ? `

TO BĘDZIE ROLKA: pionowe wideo, w którym slajdy zmieniają się same co niecałe trzy sekundy. Widz nic nie przesuwa, tylko patrzy. Dlatego każdy punkt musi być czytelny od razu, bez wracania. W opisie pod rolką nie pisz „przesuń" ani „sprawdź slajdy".` : ''}

TWARDE ZASADY TECHNICZNE:
- Piszesz po polsku z pełną diakrytyką: ą ć ę ł ń ó ś ź ż
- ZERO wykrzykników w całym tekście
- ZERO wymyślonych liczb i statystyk
- Zdanie do 12 słów
- Język zrozumiały i dla 25-latka, i dla 55-latka

${format.single && layout !== 'lista' ? `TO JEST POJEDYNCZY POST (jeden obrazek), nie karuzela.
${layout === 'foto'
  ? `UKŁAD: ZDJĘCIE GRA PIERWSZE SKRZYPCE. Na obrazku będzie duża fotografia,
a tekstu bardzo mało — jeden nagłówek i jedno zdanie. Nie ma listy punktów.
Dlatego nagłówek musi unieść post sam, a zdjęcie ma być mocną, konkretną sceną.`
  : `UKŁAD: JEDNO ZDANIE NA CAŁY KADR. Bez listy punktów: jedna myśl, napisana
tak, żeby działała jak zdanie wypowiedziane na głos. Krótko i dosadnie.`}
Zwróć WYŁĄCZNIE obiekt JSON:
{
  "eyebrow": "etykieta WIELKIMI LITERAMI, max 26 znaków, zaczyna się od: ZOVU ·",
  "title": "${layout === 'foto' ? 'nagłówek, 26-52 znaki' : 'jedno zdanie, 30-58 znaków'}, mocny, bez kropki na końcu",
  "subtitle": "jedno zdanie pod nagłówkiem, 45-85 znaków, konkret, bez wymyślonych liczb",
  "photoQuery": "PO ANGIELSKU, 2-4 słowa: PRAWDZIWA SCENA na zdjęcie stockowe — żywi ludzie przy pracy albo prawdziwe przedmioty. Kadr ma wyglądać jak polski mały biznes, więc dorzuć słowo miejsca: european, polish, local. To zdjęcie jest najważniejszym elementem posta, więc scena ma być wyrazista. Bez grafik 3D, bez abstrakcji, bez napisów",
  "bgIdea": "PO ANGIELSKU, 4-8 słów: KONKRETNE PRZEDMIOTY do tła. Zacznij od floating i dodaj materiał: violet glass, chrome, neon. Bez ludzi i bez napisów",
  "caption": "opis pod post, 300-550 znaków, trzy krótkie akapity rozdzielone podwójną nową linią, maksymalnie dwa emoji",
  "hashtags": ["pięć hashtagów wg zasad poniżej, bez znaku #"]
}` : format.single ? `TO JEST POJEDYNCZY POST (jeden obrazek), nie karuzela.
Zwróć WYŁĄCZNIE obiekt JSON:
{
  "eyebrow": "etykieta WIELKIMI LITERAMI, max 26 znaków, zaczyna się od: ZOVU ·",
  "title": "nagłówek, 30-62 znaki, mocny, bez kropki na końcu",
  "bullets": ["dokładnie trzy punkty, każdy 25-48 znaków, konkretna korzyść lub fakt, bez kropki"],
  "photoQuery": "PO ANGIELSKU, 2-4 słowa: PRAWDZIWA SCENA na zdjęcie stockowe — żywi ludzie przy pracy albo prawdziwe przedmioty. Kadr ma wyglądać jak polski mały biznes, więc dorzuć słowo miejsca: european, polish, local. Przykłady: „european barista coffee shop", „polish small shop owner", „local mechanic car workshop", „european florist arranging flowers". Bez grafik 3D, bez abstrakcji, bez napisów",
  "bgIdea": "PO ANGIELSKU, 4-8 słów: KONKRETNE PRZEDMIOTY do tła. Zacznij od floating i dodaj materiał: violet glass, chrome, neon. Bez ludzi i bez napisów",
  "caption": "opis pod post, 300-550 znaków, trzy krótkie akapity rozdzielone podwójną nową linią, maksymalnie dwa emoji",
  "hashtags": ["pięć hashtagów wg zasad poniżej, bez znaku #"]
}` : `Zwróć WYŁĄCZNIE obiekt JSON:`}

━━━ ZASADY HASHTAGÓW ━━━
Ogólne tagi (#marketing, #biznes, #reklama) mają miliony postów — mała firma
nigdy się przez nie nie przebije. Dlatego mieszamy:
- DWA lokalne: katowice, slask, firmakatowice, biznesslask, katowicebiznes
- DWA niszowe i konkretne: mala firma + branża, np. malafirma, lokalnybiznes,
  salonurody, gastronomiapl, warsztatsamochodowy, sklepinternetowy
- JEDEN tematyczny, pasujący do treści posta
Bez ogólników typu marketing, biznes, sukces, motywacja.

━━━ ZASADY NAGŁÓWKA ━━━
Nagłówek decyduje, czy ktoś się zatrzyma. Musi:
- mówić o STRACIE albo o konkretnej sytuacji, nie o korzyści ogólnej
- dać się zobaczyć oczami: „Numer telefonu ukryty w stopce" — tak.
  „Zadbaj o wizerunek" — nie
- działać bez czytania reszty
Nie zaczynaj od „Czy wiesz, że", „W dzisiejszych czasach", „Jak zwiększyć".
${format.single ? '' : `{
  "eyebrow": "etykieta WIELKIMI LITERAMI, max 26 znaków, zaczyna się od: ZOVU ·",
  "title": "nagłówek okładki, 30-62 znaki, mocny, bez kropki na końcu",
  "hook": "DWA DO CZTERECH SŁÓW wielkimi literami. To pierwsze, co widz zobaczy na ekranie — ma zatrzymać kciuk. Nazwij stratę albo błąd, nie zapowiadaj tematu. Dobrze: „TRACISZ KLIENTÓW", „TO KOSZTUJE CIĘ TYSIĄCE". Źle: „O CZYM DZIŚ MÓWIMY"",
  "broll": "JEDEN tag z listy, pasujący do tematu całego postu (użyjemy go jako tła wideo)",
  "subtitle": "jedno zdanie pod nagłówkiem, 40-80 znaków, bez wymyślonych liczb",
  "photoQuery": "PO ANGIELSKU, 2-4 słowa: PRAWDZIWA SCENA na OKŁADKĘ — o temacie całego postu, nie o pojedynczym punkcie. To jedyny kadr, który widać w feedzie. Żywi ludzie przy pracy albo prawdziwe przedmioty. Kadr ma wyglądać jak polski mały biznes, więc dorzuć słowo miejsca: european, polish, local. Przykłady: „european small business owner", „polish shop counter", „european cafe smartphone". Bez grafik 3D, bez abstrakcji, bez napisów",
  "items": [
    {
      "heading": "nagłówek punktu, 18-42 znaki, bez kropki",
      "text": "jedno zdanie, 40-62 znaki",
      "photoQuery": "PO ANGIELSKU, 2-4 słowa: PRAWDZIWA SCENA na zdjęcie stockowe pasująca do tego punktu — żywi ludzie przy pracy albo prawdziwe przedmioty. Kadr ma wyglądać jak polski mały biznes, więc dorzuć słowo miejsca: european, polish, local. Przykłady: „european barista coffee shop", „local mechanic car workshop", „european office laptop". Bez grafik 3D, bez abstrakcji, bez napisów",
      "bgIdea": "PO ANGIELSKU, 4-8 słów: KONKRETNE PRZEDMIOTY do zilustrowania tego punktu. Zawsze zaczynaj od słowa floating i dodaj materiał: violet glass, chrome, neon. Przykłady: „floating violet glass smartphone with app icons", „floating chrome shopping cart and glowing coins", „floating glass calendar pages and clock", „floating neon bar charts and arrow". Bez ludzi, bez zwierząt, bez napisów, bez abstrakcji"
    }
  ],
  "cta": { "headline": "wezwanie, 18-32 znaki", "line": "jedno zdanie, 45-75 znaków" },
  "caption": "opis pod post, 300-550 znaków, trzy krótkie akapity rozdzielone podwójną nową linią, maksymalnie dwa emoji",
  "hashtags": ["maksymalnie pięć hashtagów po polsku, bez znaku #"]
}
Pole items musi mieć DOKŁADNIE pięć elementów.
Każdy punkt ma też pole "broll" — JEDEN tag z tej listy, najbliższy treści punktu:
${BROLL_TAGS.join(', ')}
To nazwa gotowego nagrania, które puścimy w tle. Wybieraj po sensie: punkt o
zdjęciach jedzenia — "jedzenie", o salonie — "uroda", o czasie — "czas",
o pieniądzach — "finanse", o technologii — "ekrany" albo "ai".
WAŻNE: jeśli punkt nie dotyczy konkretnej branży, weź tag neutralny —
"ekrany", "ai", "nowoczesne", "gadzety", "czas" albo "architektura".
Nagranie z barberem pod punktem o częstotliwości publikacji wygląda przypadkowo.`}`;
}

// Обрыв сети — это тоже «модель не ответила».
//
// 02.09 все четыре попытки упали с «fetch failed»: до Gemini просто не
// дошёл запрос. Метки не было ни у квоты, ни у сервера — ошибка приходит
// БЕЗ HTTP-ответа, а обе метки ставятся по его статусу. Резерв не включился,
// автопилот упал с подписью «tekst nie przeszedł kontroli», хотя текста не
// было вовсе, и день остался без поста. Ровно та же подмена причины, из-за
// которой 17.08 пропал вечерний пост, только другой дорогой.
const SIEC_RE = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|terminated|network/i;

// Второй бесплатный провайдер — запасной аэродром между моделью и заготовками.
//
// 02.09 Gemini выбрал суточную квоту, и день пришлось закрывать текстом из
// rezerwa.json. Заготовка лучше пустой ленты, но хуже свежего текста, а
// ключ Groq у нас уже лежит в секретах ради распознавания речи. Пятьдесят
// строк кода превращают «день на консервах» в «день на живом тексте».
//
// Порядок именно такой: Gemini первый, потому что на нём написаны и вылизаны
// все промпты. Groq подхватывает, только когда первый молчит.

// Имя модели у Groq спрашиваем у самого Groq, а не помним наизусть.
//
// Первая версия жёстко звала llama-3.3-70b-versatile и получала 404: модели
// с таким именем на нашем ключе нет. Провайдеры переименовывают и снимают
// модели без предупреждения, и запасной путь, который ломается от чужого
// решения, запасным не является. Тот же приём, что со схемой Buffer:
// спросить API, а не угадывать.
let _modelGroq = null;
async function modelGroq(klucz) {
  if (_modelGroq) return _modelGroq;
  const r = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { authorization: `Bearer ${klucz}` },
  });
  if (!r.ok) throw new Error('Groq: nie mogę pobrać listy modeli (' + r.status + ')');
  const j = await r.json();
  const wszystkie = (j?.data || [])
    .map((m) => m.id)
    .filter((id) => id && !/whisper|tts|guard|embed|vision|prompt/i.test(id));
  if (!wszystkie.length) throw new Error('Groq: brak modeli tekstowych na tym kluczu');
  // Порядок предпочтения — от более сильных к более быстрым. Если ни одно
  // не совпало, берём первое текстовое: работающая слабая модель лучше,
  // чем консервы.
  const chetnie = [/llama-3\.3-70b/i, /gpt-oss/i, /llama-4/i, /qwen/i, /llama-3\.1-8b/i];
  for (const wzor of chetnie) {
    const trafiony = wszystkie.find((id) => wzor.test(id));
    if (trafiony) { _modelGroq = trafiony; break; }
  }
  if (!_modelGroq) _modelGroq = wszystkie[0];
  console.log('[engine] Groq: biorę model ' + _modelGroq + ' (dostępnych ' + wszystkie.length + ')');
  return _modelGroq;
}

async function askGroq(system, user) {
  const klucz = await env('GROQ_KEY');
  if (!klucz) throw new Error('GROQ_KEY nie ustawiony');
  const model = await modelGroq(klucz);
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${klucz}` },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error('Groq ' + r.status + ': ' + JSON.stringify(j).slice(0, 200));
    err.kwota = r.status === 429;
    err.serwer = r.status >= 500;
    throw err;
  }
  const raw = j?.choices?.[0]?.message?.content || '';
  if (!raw) throw new Error('Groq: pusta odpowiedź');
  return { raw, provider: 'groq/' + model };
}

async function askModel(system, user) {
  try {
    return await askModelSiec(system, user);
  } catch (e) {
    if (!e.kwota && !e.serwer && SIEC_RE.test(String(e.message))) {
      e.serwer = true;
      e.message = `sieć: ${e.message}`;
    }
    // Модель молчит по любой причине — пробуем второго бесплатного провайдера,
    // прежде чем уходить на консервы. Если и он молчит, ошибку отдаём ПЕРВУЮ:
    // причина дня — это то, что легло основное, а не то, что не спас запасной.
    if (e.kwota || e.serwer) {
      try {
        const zapas = await askGroq(system, user);
        console.warn('[engine] Gemini nie odpowiada (' + e.message.slice(0, 80) + ') — tekst pisze Groq');
        return zapas;
      } catch (g) {
        console.warn('[engine] Groq też nie odpowiada: ' + g.message.slice(0, 120));
      }
    }
    throw e;
  }
}

// ── вызов модели ──────────────────────────────────────────────────
// Порядок: Claude (если есть ключ) → Gemini Flash (бесплатный тир) → локальная Ollama.
// В GitHub Actions Ollama нет, поэтому там работает Gemini.
async function askModelSiec(system, user) {
  // Проверочный выключатель модели. Запасной путь включается раз в несколько
  // недель — в тот самый день, когда всё остальное сломалось, — и проверить
  // его иначе нечем: подсунуть настоящий 429 нельзя, а битый ключ даёт 400.
  // Непроверенный аварийный путь аварийным не является.
  if (process.env.ZOVU_UDAWAJ_BRAK_MODELU) {
    // "503" — второй режим проверки: сервер модели лежит. Он идёт другой
    // дорогой (все четыре попытки, потом резерв), и без отдельного
    // выключателя эту дорогу нечем пройти.
    // «siec» — третий режим: до модели вообще не дошёл запрос. Он идёт ещё
    // одной дорогой: ошибка без HTTP-ответа, то есть без статуса, по которому
    // ставятся метки квоты и сервера. Именно на ней 02.09 пропал пост.
    if (process.env.ZOVU_UDAWAJ_BRAK_MODELU === 'siec') {
      throw new TypeError('fetch failed');
    }
    if (process.env.ZOVU_UDAWAJ_BRAK_MODELU === '503') {
      const err = new Error('Gemini 503: udawany padnięty serwer do testu rezerwy');
      err.serwer = true;
      throw err;
    }
    const err = new Error('Gemini 429 (limit wyczerpany): udawany brak modelu do testu rezerwy');
    err.kwota = true;
    throw err;
  }

  const anthropicKey = await env('ANTHROPIC_API_KEY');
  const geminiKey = await env('GEMINI_API_KEY');

  if (anthropicKey) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user + '\n\nOdpowiedz samym obiektem JSON.' }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
    const text = (j.content || []).map((c) => c.text || '').join('');
    return { raw: text, provider: 'claude-haiku' };
  }

  if (geminiKey) {
    // «latest» — псевдоним на текущую Flash. Конкретные версии Google
    // закрывает для новых ключей (gemini-2.5-flash уже отдаёт 404).
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
        }),
      }
    );
    const j = await r.json();
    if (r.status === 429) {
      // У бесплатного тира два потолка: в минуту и в сутки. Минутный ловится
      // паузой — и ловится часто, когда прогоны идут подряд. Суточный паузой не
      // лечится, поэтому ждём один раз и с внятной подписью в логе: по ней
      // видно, что упёрлись в квоту, а не в поломку.
      const info = JSON.stringify(j).slice(0, 200);
      console.warn(`[engine] Gemini 429 (limit) — czekam 30 s i próbuję raz jeszcze: ${info}`);
      await new Promise((res) => setTimeout(res, 30000));
      const r2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: user }] }],
            generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
          }),
        }
      );
      const j2 = await r2.json();
      if (!r2.ok) {
        const err = new Error(
          'Gemini ' + r2.status + ' (limit wyczerpany): ' + JSON.stringify(j2).slice(0, 200)
        );
        // Кончившаяся квота — не брак текста. Без этой метки цикл попыток
        // ловил ошибку в общий catch, молотил мёртвый ключ ещё три раза и
        // падал с подписью «tekst nie przeszedł kontroli». 17.08 из-за этой
        // подмены причины пропал вечерний пост, а в логе искали виноватым
        // текст, которого модель вообще не написала.
        err.kwota = r2.status === 429;
        // 5xx — сервер модели лежит, текст тут ни при чём. Метка отличает
        // «модель молчит» от «модель написала плохо»: во втором случае есть
        // смысл переспросить, в первом — брать запас.
        err.serwer = r2.status >= 500;
        throw err;
      }
      const t2 = (j2?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return { raw: t2, provider: model };
    }
    if (!r.ok) {
      const err = new Error('Gemini ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
      err.serwer = r.status >= 500;
      throw err;
    }
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return { raw: text, provider: model };
  }

  const r = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma2:9b',
      stream: false,
      format: 'json',
      options: { temperature: 0.6, num_ctx: 8192 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const j = await r.json();
  return { raw: j?.message?.content || '', provider: 'gemma2:9b' };
}

function parseJson(raw) {
  const s = String(raw).trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('w odpowiedzi nie ma JSON');
  return JSON.parse(s.slice(start, end + 1));
}

// ── проверка: то, что не прошло, не публикуется ──────────────────
// po = проверка ПОСЛЕ аварийной починки. От модели по-прежнему требуем ровно
// три пункта, но чинёный текст пропускаем и с двумя: раньше недостающий пункт
// добирался из заголовка, и в ленту уходил дубль того, что человек уже видит.
// Два честных пункта лучше и подделки, и упавшего прогона без поста.
function validate(out, single = false, po = false, layout = 'lista') {
  const problems = [];
  const all = [
    out.eyebrow, out.title, out.subtitle, out.caption,
    ...(out.bullets || []),
    ...(out.items || []).flatMap((i) => [i.heading, i.text]),
    out.cta?.headline, out.cta?.line,
  ].filter(Boolean).join(' ');

  if (all.includes('!')) problems.push('są wykrzykniki');
  if (!DIACRITICS.test(all)) problems.push('brak polskiej diakrytyki');

  const low = all.toLowerCase();
  for (const b of BANNED) if (low.includes(b)) problems.push(`zakazany zwrot: ${b}`);

  if (!out.title || out.title.length < 24 || out.title.length > 70) problems.push('zły nagłówek');

  // Макеты «фото главное» и «крупная фраза» списка не имеют вовсе — там
  // заголовок и одна строка. Требовать от них пункты значит браковать
  // правильный текст.
  if (single && (layout === 'foto' || layout === 'cytat')) {
    if (!out.subtitle || out.subtitle.length < 30) problems.push('brakuje zdania pod nagłówkiem');
    return problems;
  }

  if (single) {
    const b = out.bullets;
    const min = po ? 2 : 3;
    if (!Array.isArray(b) || b.length < min || b.length > 3) {
      problems.push(po ? 'bullets musi mieć 2-3 elementy' : 'bullets musi mieć 3 elementy');
    } else {
      b.forEach((t, i) => { if (!t || t.length > 56) problems.push(`punkt ${i + 1}: za długi`); });
      // Пункт, повторяющий заголовок или плашку, — это дубль того, что человек
      // уже прочитал сверху. Ловим здесь, чтобы модель переписала сама; если
      // не выйдет, лишний пункт выбросит аварийная починка.
      const inne = [out.title, out.subtitle, out.eyebrow].filter(Boolean).map((x) => x.toLowerCase());
      b.forEach((t, i) => {
        const low = String(t || '').toLowerCase();
        if (low && inne.some((x) => x.includes(low) || low.includes(x))) {
          problems.push(`punkt ${i + 1}: powtarza nagłówek`);
        }
      });
    }
    return problems;
  }

  if (!Array.isArray(out.items) || out.items.length !== 5) problems.push('items musi mieć 5 elementów');
  else {
    out.items.forEach((it, i) => {
      if (!it.heading || it.heading.length > 46) problems.push(`punkt ${i + 1}: nagłówek za długi`);
      if (!it.text || it.text.length > 110) problems.push(`punkt ${i + 1}: tekst za długi`);
    });
  }
  if (!out.cta?.headline || !out.cta?.line) problems.push('brak CTA');

  const cap = String(out.caption || '');
  if (cap.length < 150) problems.push('opis za krótki');
  const emoji = (cap.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emoji > 2) problems.push('za dużo emoji');

  return problems;
}

// Подрезает строку до лимита ПО ГРАНИЦЕ ФРАЗЫ — никогда посреди слова.
// Сначала пробуем оборвать на точке, потом на запятой, в крайнем случае на пробеле.
function shorten(s, limit) {
  const t = String(s || '').trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  // режем ТОЛЬКО по знаку препинания. Обрыв на полуслове выглядит как брак,
  // поэтому если подходящей границы нет — оставляем текст как есть,
  // а вёрстка перенесёт его на вторую строку.
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (dot > limit * 0.45) return cut.slice(0, dot + 1).trim();
  const comma = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' — '), cut.lastIndexOf('; '));
  if (comma > limit * 0.45) return cut.slice(0, comma).trim() + '.';
  return t;
}

// вычищаем то, что можно починить кодом, без перезапроса
function clean(out) {
  const strip = (s) => String(s || '').replace(/!/g, '').replace(/\s+/g, ' ').trim();
  out.eyebrow = strip(out.eyebrow).slice(0, 28).toUpperCase();
  out.title = shorten(strip(out.title), 66).replace(/[.\s]+$/, '');
  out.subtitle = shorten(strip(out.subtitle), 88);
  // Хук нужен только рилсу. Модель его иногда не отдаёт — тогда берём первые
  // слова заголовка: это всё равно живее, чем пустой первый кадр.
  out.hook = strip(out.hook || '')
    .replace(/[.,;:!?]+$/, '')
    .slice(0, 34)
    .toUpperCase();
  if (out.hook.split(/\s+/).filter(Boolean).length > 5) out.hook = '';

  // Тег живого футажа. Модель иногда выдумывает своё название — тогда тег
  // просто отбрасываем, и движок возьмёт клип по кругу.
  const okTag = (v) => (BROLL_TAGS.includes(String(v || '').trim().toLowerCase()) ? String(v).trim().toLowerCase() : '');
  out.broll = okTag(out.broll);
  if (Array.isArray(out.items)) out.items = out.items.map((i) => ({ ...i, broll: okTag(i.broll) }));
  // Пересобираем пункт поля за полем — поэтому всё, что нужно дальше, надо
  // перечислить здесь явно. broll так и терялся: строкой выше его проверяли,
  // а тут отбрасывали, и рилс оставался без тега подложки.
  out.items = (out.items || []).slice(0, 5).map((i) => ({
    heading: shorten(strip(i.heading), 44).replace(/[.\s]+$/, ''),
    text: shorten(strip(i.text), 86),
    bgIdea: strip(i.bgIdea).slice(0, 90),
    photoQuery: strip(i.photoQuery).slice(0, 60),
    broll: i.broll || '',
  }));
  if (Array.isArray(out.bullets)) {
    out.bullets = out.bullets.slice(0, 3).map((b) => shorten(strip(b), 52).replace(/[.\s]+$/, ''));
  }
  if (out.bgIdea) out.bgIdea = strip(out.bgIdea).slice(0, 90);
  if (out.photoQuery) out.photoQuery = strip(out.photoQuery).slice(0, 60);
  if (out.cta) {
    out.cta.headline = shorten(strip(out.cta.headline), 32).replace(/[.\s]+$/, '');
    out.cta.line = shorten(strip(out.cta.line), 80);
  }
  out.caption = String(out.caption || '').replace(/!/g, '.').replace(/\.{2,}/g, '.').trim();
  out.hashtags = [...new Set((out.hashtags || [])
    .map((h) => String(h).replace(/^#/, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
    .filter((h) => h.length >= 4 && h.length <= 24))].slice(0, 5);
  return out;
}

// ── запас на день без модели ─────────────────────────────────────
const REZERWA_FILE = path.join(import.meta.dirname, 'rezerwa.json');

async function czytajRezerwe() {
  try {
    return JSON.parse(await readFile(REZERWA_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Берём следующую заготовку по кругу и прогоняем её через ТОТ ЖЕ contro­l, что и
// машинный текст. Своя проверка тут была бы самообманом: запас должен падать
// на моей проверке, а не в ленте.
async function zRezerwy(multiSlide, layout, state) {
  const bank = await czytajRezerwe();
  const lista = (multiSlide ? bank?.karuzele : bank?.pojedyncze) || [];
  if (!lista.length) {
    console.warn('[engine] rezerwa pusta — nie ma czym zastąpić modelu');
    return null;
  }
  // Отдельный счётчик на каждую форму: иначе одиночные посты и карусели
  // сдвигали бы друг другу очередь и запас повторялся бы раньше времени.
  const klucz = multiSlide ? 'rezerwaK' : 'rezerwaP';
  const start = (Number(state?.[klucz] ?? -1) + 1) % lista.length;
  for (let k = 0; k < lista.length; k++) {
    const nr = (start + k) % lista.length;
    const kandydat = clean(JSON.parse(JSON.stringify(lista[nr])), layout);
    const problemy = validate(kandydat, !multiSlide, false, layout);
    if (!problemy.length) {
      await saveState({ [klucz]: nr });
      return { tekst: kandydat, nr: nr + 1 };
    }
    console.warn(`[engine] rezerwa #${nr + 1} nie przechodzi kontroli: ${problemy.join('; ')}`);
  }
  return null;
}

// Проверка запаса без публикации — её вызывает сторож (doktor.mjs).
// Битую заготовку надо ловить в спокойный день, а не в тот, когда она
// осталась единственным способом выпустить пост.
export async function sprawdzRezerwe() {
  const bank = await czytajRezerwe();
  if (!bank) return [{ gdzie: 'rezerwa.json', problemy: ['pliku nie ma albo nie jest poprawnym JSON'] }];
  const zle = [];
  for (const [pole, multi, uklady] of [
    ['pojedyncze', false, ['lista', 'foto', 'cytat']],
    ['karuzele', true, [null]],
  ]) {
    const lista = bank[pole] || [];
    if (!lista.length) zle.push({ gdzie: pole, problemy: ['zapas jest pusty'] });
    lista.forEach((wpis, i) => {
      for (const uklad of uklady) {
        const problemy = validate(clean(JSON.parse(JSON.stringify(wpis)), uklad), !multi, false, uklad);
        if (problemy.length) zle.push({ gdzie: `${pole} #${i + 1}${uklad ? ' / ' + uklad : ''}`, problemy });
      }
    });
  }
  return zle;
}

// ── главное: собрать готовый пост ────────────────────────────────
// Теги живого футажа из папки broll/. Держим списком здесь, чтобы промпт и
// подстановка запасного клипа не разъезжались.
const BROLL_TAGS = ['ai','architektura','auto','auto2','auto3','barber','bieganie','bizuteria','czas','czekolada','deser','detailing','ekrany','finanse','fotostudio','gadzety','gaming','jedzenie','joga','kawa','koktajl','kosmetyki','ksiazki','kwiaty','marka','marka2','marka3','moda','muzyka','nieruchomosci','nowoczesne','perfumy','podroze','rosliny','spa','sport','swiece','swieta','uroda','wnetrza','wyprzedaz'];

// Вырезает запрещённый оборот из строки, забирая с ним всё предложение.
// Просто удалить два слова нельзя: «zwiększamy zasięgi organiczne w social»
// без них превращается в «zwiększamy w social» — мусор вместо фразы.
// Предложение целиком выкидывается вместе с проблемой; если предложение в
// строке одно, возвращаем пустоту, и наверху решают, что с этим делать.
function bezZakazanych(s) {
  let t = String(s || '');
  if (!t) return t;
  if (!BANNED.some((b) => t.toLowerCase().includes(b))) return t;
  // абзацы описания держим отдельно, иначе чистка склеит текст в один кусок
  return t
    .split(/\n{2,}/)
    .map((akapit) => akapit
      // делим по концу предложения, сохраняя знак: (?<=[.?…])\s+
      .split(/(?<=[.?…])\s+/)
      .filter((zd) => !BANNED.some((b) => zd.toLowerCase().includes(b)))
      .join(' ')
      .trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

// Правит то, что чинится механически: число пунктов, длину строк, хвосты.
// Смысл текста не трогаем — если модель написала ерунду, ерунда и останется,
// поэтому после починки текст всё равно проходит через validate().
function napraw(out, single, layout = 'lista') {
  const o = JSON.parse(JSON.stringify(out));

  // Запрещённые обороты. Раньше починка их не трогала: 09.08 модель четыре
  // раза подряд написала «zasięgi organiczne», и весь прогон упал красным,
  // хотя фраза сидела в одном предложении описания. Чистим по полям — там,
  // где предложение выкидывается без потери смысла (описание, пункты, CTA).
  // Заголовок не чиним: он короткий, вырезать из него нечего — такой текст
  // честнее забраковать целиком.
  o.caption = bezZakazanych(o.caption);
  o.subtitle = bezZakazanych(o.subtitle);
  if (Array.isArray(o.bullets)) {
    o.bullets = o.bullets.filter((t) => !BANNED.some((b) => String(t).toLowerCase().includes(b)));
  }
  if (Array.isArray(o.items)) {
    o.items = o.items.map((it) => ({
      ...it,
      text: it && BANNED.some((b) => String(it.text).toLowerCase().includes(b))
        ? bezZakazanych(it.text) : it?.text,
    }));
  }
  if (o.cta) {
    o.cta = { ...o.cta, line: bezZakazanych(o.cta.line) };
  }
  // свой strip: тот, что в clean(), объявлен внутри неё и сюда не виден
  const oczysc = (s) => String(s || '').replace(/!/g, '').replace(/\s+/g, ' ').trim();
  // shorten намеренно не режет посреди слова и возвращает строку как есть,
  // если знака препинания не нашлось. В обычном пути это правильно, но здесь
  // мы уже спасаем прогон — поэтому дорезаем по границе слова.
  const przytnij = (s, n) => {
    const t = shorten(oczysc(s), n);
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    const sp = cut.lastIndexOf(' ');
    return (sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:—-]+$/, '');
  };

  if (single) {
    let b = Array.isArray(o.bullets) ? o.bullets.filter(Boolean) : [];
    b = b.map((t) => przytnij(t, 56)).filter((t) => t.length > 8);
    if (b.length > 3) b = b.slice(0, 3);
    // Раньше недостающие пункты добирались из subtitle, title и eyebrow — и в
    // ленту ушёл пост, где пункт 2 слово в слово повторял заголовок, а пункт 3
    // был служебной плашką «ZOVU · AI W MARKETINGU», уже стоящей сверху.
    // Дубль того, что человек и так видит, хуже короткого списка: он кричит
    // «сгенерировано автоматом». Лучше два честных пункта, чем три с подделкой.
    o.bullets = b.filter((t) => {
      const inne = [o.title, o.subtitle, o.eyebrow].filter(Boolean).map((x) => x.toLowerCase());
      return !inne.some((x) => x.includes(t.toLowerCase()) || t.toLowerCase().includes(x));
    });
  } else if (Array.isArray(o.items)) {
    o.items = o.items.filter((i) => i && i.heading).slice(0, 5);
  }

  if (o.title) o.title = przytnij(o.title, 70);
  if (o.subtitle) o.subtitle = przytnij(o.subtitle, 88);
  return o;
}

export async function makePost({ topic, format, kind, uklad, trends = false, genImages = true, photo = 'zah', photoCta = 'mat' } = {}) {
  const state = await readState();

  const topicIdx = topic ? -1 : (state.topic + 1) % TOPICS.length;
  const formatIdx = (state.format + 1) % FORMATS.length;

  // Ротация типов на цикл из шести постов:
  //   №6 — карусель, №3 — рилс, остальные четыре — обычные посты.
  // Рилс и карусель делаются из одних и тех же данных (обложка + 5 пунктов + финал),
  // разница только в том, чем это станет на выходе: слайдами или видео.
  const counter = (state.counter || 0) + 1;
  // Рилсы ВЫКЛЮЧЕНЫ из автоматической ротации (31.07.2026). Движок работает и
  // вызывается через --kind=reel, но сам по расписанию больше не срабатывает:
  // автособранный рилс не дотягивает до уровня, который агентство может
  // показывать у себя в ленте. Вернуть — дописать `|| (!kind && counter % 6 === 3)`.
  const isReel = kind === 'reel';
  const isCarousel = kind === 'carousel' || (!kind && counter % 6 === 0);
  const multiSlide = isReel || isCarousel;

  // Тренд берём ОДИН РАЗ В СУТКИ. Иначе три поста за день выйдут про одно и то же.
  // Остальные запуски идут по списку тем — так лента остаётся разной.
  let trendSeed = null;
  const today = new Date().toISOString().slice(0, 10);
  if (trends && !topic && state.trendDay !== today) {
    trendSeed = await freshIdea();
  }
  const chosenTopic = topic
    || (trendSeed
      ? `Gorący temat, o którym pisze dziś ${trendSeed.sources} niezależnych redakcji: „${trendSeed.title}".\n`
        + `Nie streszczaj newsa. Zrób z niego praktyczny post dla właściciela małej firmy w Polsce: `
        + `co ta zmiana oznacza dla jego marketingu i co ma zrobić w tym tygodniu.`
      : TOPICS[topicIdx]);
  // Макет одиночного поста. Три штуки по кругу, чтобы лента не превращалась в
  // обои: один и тот же макет каждый день человек перестаёт замечать — он
  // заранее знает, что увидит, и листает мимо. Порядок: список → фото →
  // список → фраза. Список чаще, он несёт больше пользы; фото и фраза сбивают
  // ритм и держат внимание.
  const UKLADY = ['lista', 'foto', 'lista', 'cytat'];
  const chosenLayout = multiSlide ? null : (uklad || UKLADY[counter % UKLADY.length]);

  const chosenFormat = multiSlide
    ? (format ? FORMATS.find((f) => f.key === format) || FORMATS[0] : FORMATS[formatIdx])
    : { key: 'single', label: 'Pojedynczy post', single: true,
        brief: chosenLayout === 'foto'
          ? 'Zdjęcie gra pierwsze skrzypce, tekstu minimum: nagłówek i jedno zdanie.'
          : chosenLayout === 'cytat'
            ? 'Jedna myśl na cały kadr. Bez listy — zdanie, które działa wypowiedziane na głos.'
            : 'Jedna myśl, trzy krótkie punkty. Bez rozwlekania — post ma działać w dwie sekundy.' };

  const system = await buildSystemPrompt(chosenFormat, isReel, chosenLayout);
  const user = `Temat postu: ${chosenTopic}`;

  let out = null;
  let provider = null;
  let brakModelu = null;
  let padlSerwer = null;
  let zRezerwyNr = null;
  const attempts = [];
  let ostatniKandydat = null;
  let najlepszeProblemy = Infinity;

  for (let i = 0; i < 4; i++) {
    try {
      const res = await askModel(system, user);
      provider = res.provider;
      const surowy = parseJson(res.raw);
      const parsed = clean(surowy, chosenLayout);
      const problems = validate(parsed, !multiSlide, false, chosenLayout);
      attempts.push({ attempt: i + 1, problems });
      // Что именно пришло от модели — иначе по одной строке «bullets musi mieć
      // 3 elementy» не понять, чего не хватило: модель их не написала, или
      // наша же чистка выбросила. Разница решает, что чинить.
      if (problems.length) {
        console.warn(
          `[engine] próba ${i + 1}: ${problems.join('; ')} | od modelu: ` +
            JSON.stringify(surowy.bullets ?? surowy.items?.length ?? null).slice(0, 200) +
            ` | po czyszczeniu: ${JSON.stringify(parsed.bullets ?? parsed.items?.length ?? null).slice(0, 200)}`
        );
      }
      if (!problems.length) {
        out = parsed;
        break;
      }
      // Держим лучшее из неудачных — по нему потом чиним. Сравниваем с уже
      // посчитанным числом проблем, а не перепроверяем кандидата заново:
      // прежняя строка на нуле проблем давала `|| 99` и путала сравнение.
      // При равенстве берём более поздний ответ — он свежее и обычно чище.
      if (!ostatniKandydat || problems.length <= najlepszeProblemy) {
        ostatniKandydat = parsed;
        najlepszeProblemy = problems.length;
      }
    } catch (e) {
      attempts.push({ attempt: i + 1, problems: [String(e.message).slice(0, 160)] });
      // Квота кончилась — переспрашивать нечем. Выходим сразу: три оставшиеся
      // попытки ушли бы в ту же стену, а каждая из них стучит по API дважды.
      if (e.kwota) {
        brakModelu = e;
        console.warn('[engine] model nie odpowiada (limit) — przechodzę na rezerwę: ' + e.message);
        break;
      }
      // 503 «high demand» лечится ожиданием, поэтому попытки не бросаем. Но
      // если ВСЕ четыре ушли в стену сервера — текста нет и чинить нечего:
      // запас лучше пустой ленты. 22.08 утренний пост упал именно так, а
      // резерв не включился, потому что смотрел только на квоту.
      if (e.serwer) padlSerwer = e;
    }
  }

  // Последняя попытка починить, а не упасть. Полностью автоматическая система
  // не имеет права умирать из-за того, что модель вернула четыре пункта вместо
  // трёх: это правится кодом за одну строку. Падаем только если чинить нечего.
  if (!out) {
    const kandydat = ostatniKandydat;
    if (kandydat) {
      const naprawiony = napraw(kandydat, !multiSlide, chosenLayout);
      const zostalo = validate(naprawiony, !multiSlide, true, chosenLayout);
      if (!zostalo.length) {
        console.warn('[engine] tekst naprawiony po nieudanych próbach: ' + attempts.at(-1).problems.join('; '));
        out = naprawiony;
      }
    }
  }

  // Модель недоступна (кончилась квота, лежит API) — берём заготовку из
  // rezerwa.json. Пост из запаса хуже свежего, но день без поста хуже обоих:
  // ради ровной ленты весь автопилот и построен, а бесплатный тир Gemini
  // упирается в суточный потолок предсказуемо.
  if (!out && !brakModelu && padlSerwer && !ostatniKandydat) {
    brakModelu = padlSerwer;
    console.warn('[engine] model leży (5xx) na wszystkich próbach — przechodzę na rezerwę');
  }

  if (!out && brakModelu) {
    const zapas = await zRezerwy(multiSlide, chosenLayout, state);
    if (zapas) {
      out = zapas.tekst;
      zRezerwyNr = zapas.nr;
      console.warn(`[engine] REZERWA #${zapas.nr}: model padł, publikuję gotowy tekst z zapasu`);
    }
  }

  if (!out) {
    const err = brakModelu
      ? new Error('model nie odpowiada i rezerwa nie zadziałała: ' + brakModelu.message)
      : new Error('tekst nie przeszedł kontroli po czterech próbach i naprawie');
    err.attempts = attempts;
    err.kwota = Boolean(brakModelu);
    throw err;
  }

  // Пометка «MIT:» — не просьба к модели, а требование к посту. Модель ставит
  // её через раз, и слайд без пометки заявляет миф от имени ZOVU. Просить
  // вежливо тут нельзя: это единственное, что отличает разоблачение от лжи.
  //
  // К тексту из запаса это НЕ применяется: запас заменяет формат целиком, он
  // не «мифы». Проверка запаса на живом прогоне поймала ровно это — ротация
  // стояла на мифах, и каждый пункт запасной карусели получил «MIT:»,
  // превратившись во вранье: «MIT: Co dokładnie oferujesz».
  if (!zRezerwyNr && chosenFormat.key === 'mity' && Array.isArray(out.items)) {
    out.items = out.items.map((it) => {
      const h = String(it.heading || '').trim();
      if (/^mit\b/i.test(h)) return it;
      // 46 — потолок заголовка пункта; «MIT: » занимает пять знаков
      const reszta = h.length > 41 ? h.slice(0, 41).replace(/[\s,;:—-]+$/, '') : h;
      return { ...it, heading: `MIT: ${reszta}` };
    });
  }

  // Фоны. Сначала пробуем сгенерировать свои (бесплатно, Flux).
  // Что не вышло — подставляем из библиотеки готовых.
  const bgStart = (state.bg + 1) % BG_TAGS.length;
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `auto-${stamp}-${counter}-${chosenFormat.key}`;

  let generated = [];
  let zdjecie = null;
  let fotoSlajdow = [];
  if (genImages) {
    // Сначала живое фото. Митя про наши посты: «ещё бы настоящих фоток с
    // реальными телефонами или людьми и топово будет» — тот же фидбek, что
    // он давал по сайтам. Рендер 3D-объекта читается как заглушка.
    try {
      const { findPhoto } = await import('./photo.mjs');
      if (multiSlide) {
        // Карусель: своё фото на каждый слайд, по одному запросу за слайд.
        // Ищем последовательно, а не пачкой: Pexels даёт 200 запросов в час,
        // семь слайдов в это укладываются с большим запасом.
        fotoSlajdow = [];
        for (const [i, it] of out.items.entries()) {
          const f = it.photoQuery ? await findPhoto(it.photoQuery, { name: `${baseName}-${i}` }) : null;
          fotoSlajdow.push(f?.file || null);
        }
        // Либо живые фото на всех слайдах, либо ни на одном: карусель, где
        // половина кадров съёмка, а половина 3D-рендер, выглядит как сборная
        // солянка. Единый стиль важнее того, чтобы протащить пару фото.
        const ile = fotoSlajdow.filter(Boolean).length;
        if (ile < out.items.length) {
          if (ile) console.log(`[engine] zdjęcia tylko na ${ile}/${out.items.length} slajdów — biorę spójny komplet renderów`);
          fotoSlajdow = [];
        } else {
          // Кадр на обложку. Она одна попадает в ленту, и до 11.08 была
          // единственной без съёмки — карусель показывала себя ровно тем
          // градиентом, от которого мы уходили. Отдельный запрос, а не
          // повтор первого пункта: обложка про тему целиком, пункт про частность.
          zdjecie = out.photoQuery ? await findPhoto(out.photoQuery, { name: `${baseName}-cover` }) : null;
          console.log(
            `[engine] zdjęcia do karuzeli: ${ile}/${out.items.length}` +
              (zdjecie ? ` + okładka (${out.photoQuery})` : ' — okładka bez zdjęcia, wezmę kadr z pierwszego punktu')
          );
        }
      } else if (out.photoQuery) {
        zdjecie = await findPhoto(out.photoQuery, { name: baseName });
        if (zdjecie) console.log(`[engine] zdjęcie: ${out.photoQuery} (fot. ${zdjecie.autor})`);
      }
    } catch {
      zdjecie = null;
    }
    // Фото не нашлось — откатываемся на генерацию, пост важнее источника кадра.
    if (!zdjecie && !fotoSlajdow.some(Boolean)) {
      try {
        const { generateForItems } = await import('./image-gen.mjs');
        const list = multiSlide ? out.items : [{ bgIdea: out.bgIdea, heading: out.title }];
        generated = await generateForItems(list, baseName);
      } catch {
        generated = [];
      }
    }
  }

  if (multiSlide) {
    out.items = out.items.map((it, i) => ({
      ...it,
      bg: fotoSlajdow[i] || generated[i] || BG_TAGS[(bgStart + i) % BG_TAGS.length],
    }));
  }

  await saveState({
    topic: topic ? state.topic : topicIdx,
    format: format ? state.format : formatIdx,
    bg: bgStart,
    counter,
    trendDay: trendSeed ? today : state.trendDay,
  });

  const data = multiSlide
    ? {
        name: baseName,
        eyebrow: out.eyebrow || 'ZOVU · SOCIAL MEDIA',
        title: out.title,
        subtitle: out.subtitle,
        hook: out.hook,
        broll: out.broll,
        items: out.items,
        cta: out.cta,
        photo,
        photoCta,
        // кадр на обложку; нет — renderCarousel возьмёт кадр первого пункта
        coverBg: zdjecie?.file || null,
        // живым кадрам шаблон даёт мягкую вуаль вместо штатной. Слайды карусели
        // её не получали: фото гасилось дважды, и осветлять его было бессмысленно —
        // ровно та же грабля, что уже ловили на одиночных постах.
        foto: fotoSlajdow.some(Boolean),
        footer: 'zovu.pl',
      }
    : {
        name: baseName,
        eyebrow: out.eyebrow || 'ZOVU · SOCIAL MEDIA',
        title: out.title,
        subtitle: out.subtitle,
        bullets: out.bullets,
        // какой из трёх макетов рисовать — решено выше, ротацией
        layout: chosenLayout,
        bg: zdjecie?.file || generated[0] || BG_TAGS[bgStart],
        // живому кадру шаблон даёт мягкую вуаль вместо штатной, иначе фото
        // гасится дважды и осветлять его бессмысленно
        foto: Boolean(zdjecie),
        footer: 'zovu.pl',
      };

  return {
    kind: isReel ? 'reel' : isCarousel ? 'carousel' : 'single',
    data,
    caption: out.caption + (out.hashtags.length ? '\n\n' + out.hashtags.map((h) => '#' + h).join(' ') : ''),
    meta: {
      counter,
      topic: chosenTopic,
      trend: trendSeed ? { title: trendSeed.title, sources: trendSeed.sources } : null,
      // Формат называем честно: запас не следует ротации, и записать его под
      // ярлыком «Мифы» значит испортить сводку охвата по форме — потом будем
      // сравнивать несравнимое.
      format: zRezerwyNr ? `Rezerwa #${zRezerwyNr}` : chosenFormat.label,
      provider: provider || (zRezerwyNr ? `rezerwa #${zRezerwyNr}` : null),
      zRezerwy: zRezerwyNr,
      attempts,
    },
  };
}

export { TOPICS, FORMATS, BG_TAGS };
