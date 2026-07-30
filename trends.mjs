// Детектор тем: тянет заголовки из десятка новостных лент разных стран,
// ищет сюжеты, которые повторяются минимум в N источниках, и отдаёт самый сильный.
// Ключи не нужны — везде обычный RSS.

// Ленты подобраны деловые и технологические. Общеновостные (BBC World и т.п.)
// намеренно НЕ используем: там доминируют война, политика и катастрофы —
// темы, на которых агентству строить посты нельзя.
export const FEEDS = [
  // бизнес и технологии
  { id: 'bbc-business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'guardian-business', url: 'https://www.theguardian.com/uk/business/rss' },
  { id: 'guardian-tech', url: 'https://www.theguardian.com/uk/technology/rss' },
  { id: 'dw-business', url: 'https://rss.dw.com/rdf/rss-en-bus' },
  { id: 'cnbc', url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html' },
  { id: 'techcrunch', url: 'https://techcrunch.com/feed/' },
  { id: 'verge', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'arstechnica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'engadget', url: 'https://www.engadget.com/rss.xml' },
  { id: 'marketingweek', url: 'https://www.marketingweek.com/feed/' },
  // Польша
  { id: 'businessinsider-pl', url: 'https://businessinsider.com.pl/.feed' },
  { id: 'google-pl-biznes', url: 'https://news.google.com/rss/search?q=biznes+firmy&hl=pl&gl=PL&ceid=PL:pl' },
  { id: 'google-pl-marketing', url: 'https://news.google.com/rss/search?q=marketing+reklama&hl=pl&gl=PL&ceid=PL:pl' },
  // русскоязычные, деловые
  { id: 'google-ru-biznes', url: 'https://news.google.com/rss/search?q=%D0%B1%D0%B8%D0%B7%D0%BD%D0%B5%D1%81+%D0%BC%D0%B0%D1%80%D0%BA%D0%B5%D1%82%D0%B8%D0%BD%D0%B3&hl=ru&gl=RU&ceid=RU:ru' },
];

// слова, которые ничего не значат для сравнения заголовков
const STOP = new Set(`
a an the and or but for with from into over after before about as at by in of on to
is are was were be been being will would can could should may might do does did not no
new news says say said report reports first last year years day days time
i w z na do nie się jest są to od po pod nad przez oraz jak co czy dla przy już tylko
и в на с по за от до для что как это так не но или же бы был была были есть
`.trim().split(/\s+/));

function tokens(title) {
  return [...new Set(
    String(title)
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
  )];
}

function parseTitles(xml, limit = 12) {
  const out = [];
  const re = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
  let m;
  while ((m = re.exec(xml)) && out.length < limit + 1) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && t.length > 20) out.push(t);
  }
  return out.slice(1); // первый <title> — название самой ленты
}

async function fetchFeed(feed, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const xml = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ZOVU-bot)' },
    }).then((r) => r.text());
    return { id: feed.id, titles: parseTitles(xml) };
  } catch {
    return { id: feed.id, titles: [] };
  } finally {
    clearTimeout(timer);
  }
}

// Сюжет засчитывается, если о нём пишут минимум minSources разных изданий.
// Совпадением считаем пересечение минимум по двум значимым словам.
export async function detectStory({ minSources = 3, businessOnly = true } = {}) {
  const feeds = await Promise.all(FEEDS.map((f) => fetchFeed(f)));
  const alive = feeds.filter((f) => f.titles.length);

  const items = [];
  for (const f of alive) {
    for (const t of f.titles) items.push({ source: f.id, title: t, tk: tokens(t) });
  }

  // жадная кластеризация: берём заголовок, собираем к нему похожие из ДРУГИХ изданий
  const used = new Set();
  const clusters = [];
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const base = items[i];
    const group = [base];
    const sources = new Set([base.source]);
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      const other = items[j];
      const shared = other.tk.filter((w) => base.tk.includes(w));
      if (shared.length >= 2) {
        group.push(other);
        sources.add(other.source);
        used.add(j);
      }
    }
    used.add(i);
    if (sources.size >= minSources) {
      const shared = base.tk.filter((w) => group.filter((g) => g.tk.includes(w)).length >= 2);
      clusters.push({ sources: [...sources], count: sources.size, titles: group.map((g) => g.title), keywords: shared.slice(0, 6) });
    }
  }

  // ЖЁСТКИЙ СТОП-ЛИСТ. Агентству нельзя строить пост на войне, смертях,
  // политике, катастрофах и криминале — это репутационный ущерб, а не контент.
  const BLOCK = new RegExp(
    [
      'missile', 'war\\b', 'attack', 'strike', 'killed', 'death', 'dead', 'wounded',
      'troops', 'army', 'military', 'bomb', 'shooting', 'terror', 'hostage',
      'election', 'president', 'minister', 'parliament', 'court', 'trial', 'arrest',
      'protest', 'crash', 'earthquake', 'flood', 'fire\\b', 'victim', 'refugee',
      'rakiet', 'wojn', 'atak', 'zabit', 'śmier', 'wybory', 'prezydent', 'sąd',
      'ракет', 'войн', 'атак', 'убит', 'смерт', 'выбор', 'президент', 'суд',
    ].join('|'),
    'i'
  );

  // допускаем только явно деловые и технологические сюжеты
  const BUSINESS = new RegExp(
    [
      '\\bai\\b', 'artificial intelligence', 'business', 'market\\w*', 'marketing',
      'econom\\w*', 'startup', 'technolog\\w*', 'compan\\w+', 'brand', 'sales',
      'advertis\\w*', 'social media', 'google', 'openai', 'revenue', 'e-commerce',
      'biznes', 'firm\\w*', 'rynek', 'reklam\\w*', 'sprzeda\\w*', 'technolog\\w*',
      'бизнес', 'рынок', 'компан\\w*', 'технолог\\w*', 'реклам\\w*',
    ].join('|'),
    'i'
  );

  const ranked = clusters
    .filter((c) => !c.titles.some((t) => BLOCK.test(t)))
    .filter((c) => !businessOnly || c.titles.some((t) => BUSINESS.test(t)))
    .sort((a, b) => b.count - a.count);

  return {
    checked: FEEDS.length,
    alive: alive.length,
    clusters: ranked.length,
    story: ranked[0] || null,
  };
}

// CLI: node trends.mjs
if (process.argv[1] && process.argv[1].endsWith('trends.mjs')) {
  const r = await detectStory({ minSources: Number(process.argv[2] || 3) });
  console.log(`лент опрошено: ${r.checked}, ответили: ${r.alive}, сюжетов найдено: ${r.clusters}`);
  if (r.story) {
    console.log(`\nСЮЖЕТ (${r.story.count} источника): ${r.story.sources.join(', ')}`);
    console.log(`ключевые слова: ${r.story.keywords.join(', ')}`);
    r.story.titles.slice(0, 5).forEach((t) => console.log('  · ' + t));
  } else {
    console.log('\nсовпадений выше порога нет');
  }
}
