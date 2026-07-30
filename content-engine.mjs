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
  { key: 'mity', label: 'Mity', brief: 'Pięć przekonań, które są nieprawdziwe. Każdy punkt to mit i jedna linia z faktem.' },
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

const DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return { topic: -1, format: -1, bg: -1 };
  }
}

async function saveState(s) {
  await writeFile(STATE_FILE, JSON.stringify(s, null, 1), 'utf8');
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
async function buildSystemPrompt(format) {
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

${format.single ? EXAMPLE_SINGLE : EXAMPLE_CAROUSEL}

Zwróć uwagę: żadnego „nowe możliwości", „bądź na bieżąco", „przyszłość".
Każdy punkt da się zobaczyć oczami. „Numer telefonu ukryty w stopce" — to widać.
„Wykorzystaj potencjał AI" — tego nie widać, więc tak NIE piszemy.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORMAT TEGO POSTU: ${format.label}. ${format.brief}

TWARDE ZASADY TECHNICZNE:
- Piszesz po polsku z pełną diakrytyką: ą ć ę ł ń ó ś ź ż
- ZERO wykrzykników w całym tekście
- ZERO wymyślonych liczb i statystyk
- Zdanie do 12 słów
- Język zrozumiały i dla 25-latka, i dla 55-latka

${format.single ? `TO JEST POJEDYNCZY POST (jeden obrazek), nie karuzela.
Zwróć WYŁĄCZNIE obiekt JSON:
{
  "eyebrow": "etykieta WIELKIMI LITERAMI, max 26 znaków, zaczyna się od: ZOVU ·",
  "title": "nagłówek, 30-62 znaki, mocny, bez kropki na końcu",
  "bullets": ["dokładnie trzy punkty, każdy 25-48 znaków, konkretna korzyść lub fakt, bez kropki"],
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
{
  "eyebrow": "etykieta WIELKIMI LITERAMI, max 26 znaków, zaczyna się od: ZOVU ·",
  "title": "nagłówek okładki, 30-62 znaki, mocny, bez kropki na końcu",
  "subtitle": "jedno zdanie pod nagłówkiem, 40-80 znaków, bez wymyślonych liczb",
  "items": [
    {
      "heading": "nagłówek punktu, 18-42 znaki, bez kropki",
      "text": "jedno zdanie, 40-62 znaki",
      "bgIdea": "PO ANGIELSKU, 4-8 słów: KONKRETNE PRZEDMIOTY do zilustrowania tego punktu. Zawsze zaczynaj od słowa floating i dodaj materiał: violet glass, chrome, neon. Przykłady: „floating violet glass smartphone with app icons", „floating chrome shopping cart and glowing coins", „floating glass calendar pages and clock", „floating neon bar charts and arrow". Bez ludzi, bez zwierząt, bez napisów, bez abstrakcji"
    }
  ],
  "cta": { "headline": "wezwanie, 18-32 znaki", "line": "jedno zdanie, 45-75 znaków" },
  "caption": "opis pod post, 300-550 znaków, trzy krótkie akapity rozdzielone podwójną nową linią, maksymalnie dwa emoji",
  "hashtags": ["maksymalnie pięć hashtagów po polsku, bez znaku #"]
}
Pole items musi mieć DOKŁADNIE pięć elementów.`;
}

// ── вызов модели ──────────────────────────────────────────────────
// Порядок: Claude (если есть ключ) → Gemini Flash (бесплатный тир) → локальная Ollama.
// В GitHub Actions Ollama нет, поэтому там работает Gemini.
async function askModel(system, user) {
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
    if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
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
function validate(out, single = false) {
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

  if (single) {
    const b = out.bullets;
    if (!Array.isArray(b) || b.length !== 3) problems.push('bullets musi mieć 3 elementy');
    else b.forEach((t, i) => { if (!t || t.length > 56) problems.push(`punkt ${i + 1}: za długi`); });
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
  out.items = (out.items || []).slice(0, 5).map((i) => ({
    heading: shorten(strip(i.heading), 44).replace(/[.\s]+$/, ''),
    text: shorten(strip(i.text), 86),
    bgIdea: strip(i.bgIdea).slice(0, 90),
  }));
  if (Array.isArray(out.bullets)) {
    out.bullets = out.bullets.slice(0, 3).map((b) => shorten(strip(b), 52).replace(/[.\s]+$/, ''));
  }
  if (out.bgIdea) out.bgIdea = strip(out.bgIdea).slice(0, 90);
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

// ── главное: собрать готовый пост ────────────────────────────────
export async function makePost({ topic, format, kind, trends = false, genImages = true, photo = 'zah', photoCta = 'mat' } = {}) {
  const state = await readState();

  const topicIdx = topic ? -1 : (state.topic + 1) % TOPICS.length;
  const formatIdx = (state.format + 1) % FORMATS.length;

  // Ротация типов на цикл из шести постов:
  //   №6 — карусель, №3 — рилс, остальные четыре — обычные посты.
  // Рилс и карусель делаются из одних и тех же данных (обложка + 5 пунктов + финал),
  // разница только в том, чем это станет на выходе: слайдами или видео.
  const counter = (state.counter || 0) + 1;
  const isReel = kind === 'reel' || (!kind && counter % 6 === 3);
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
  const chosenFormat = multiSlide
    ? (format ? FORMATS.find((f) => f.key === format) || FORMATS[0] : FORMATS[formatIdx])
    : { key: 'single', label: 'Pojedynczy post', single: true,
        brief: 'Jedna myśl, trzy krótkie punkty. Bez rozwlekania — post ma działać w dwie sekundy.' };

  const system = await buildSystemPrompt(chosenFormat);
  const user = `Temat postu: ${chosenTopic}`;

  let out = null;
  let provider = null;
  const attempts = [];

  for (let i = 0; i < 3; i++) {
    try {
      const res = await askModel(system, user);
      provider = res.provider;
      const parsed = clean(parseJson(res.raw));
      const problems = validate(parsed, !multiSlide);
      attempts.push({ attempt: i + 1, problems });
      if (!problems.length) {
        out = parsed;
        break;
      }
    } catch (e) {
      attempts.push({ attempt: i + 1, problems: [String(e.message).slice(0, 160)] });
    }
  }

  if (!out) {
    const err = new Error('tekst nie przeszedł kontroli po trzech próbach');
    err.attempts = attempts;
    throw err;
  }

  // Фоны. Сначала пробуем сгенерировать свои (бесплатно, Flux).
  // Что не вышло — подставляем из библиотеки готовых.
  const bgStart = (state.bg + 1) % BG_TAGS.length;
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `auto-${stamp}-${counter}-${chosenFormat.key}`;

  let generated = [];
  if (genImages) {
    try {
      const { generateForItems } = await import('./image-gen.mjs');
      const list = multiSlide ? out.items : [{ bgIdea: out.bgIdea, heading: out.title }];
      generated = await generateForItems(list, baseName);
    } catch {
      generated = [];
    }
  }

  if (multiSlide) {
    out.items = out.items.map((it, i) => ({
      ...it,
      bg: generated[i] || BG_TAGS[(bgStart + i) % BG_TAGS.length],
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
        items: out.items,
        cta: out.cta,
        photo,
        photoCta,
        footer: 'zovu.pl',
      }
    : {
        name: baseName,
        eyebrow: out.eyebrow || 'ZOVU · SOCIAL MEDIA',
        title: out.title,
        bullets: out.bullets,
        bg: generated[0] || BG_TAGS[bgStart],
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
      format: chosenFormat.label,
      provider,
      attempts,
    },
  };
}

export { TOPICS, FORMATS, BG_TAGS };
