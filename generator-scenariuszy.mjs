// Генератор сценариев для стоковых рилсов.
//
// 20.10.2026: банк из 32 сценариев, написанных руками, кончился — лента пошла
// по второму кругу. Захар хочет ленту без своего участия, значит пополнять
// банк должен автомат.
//
// Как работает:
//   1. Модель пишет пачку сценариев строго в форме банка (роли, длина фраз,
//      запросы к стоку, текст поста, призывы под каждую концовку).
//   2. Тот же ответ уходит второму проходу — «корректору»: польский язык,
//      естественность, запрещённые штампы. Groq сюда не берём: 31.08 он
//      написал «przepisyje», а опечатка у студии, продающей тексты, дороже
//      пустого дня.
//   3. Механическая проверка: форма, длина, штампы, цифры, похожесть на всё,
//      что уже было (банк руками + сгенерированные + очередь). Что не прошло —
//      выбрасываем, а не чиним.
//   4. Прошедшие дописываются в rolki/scenariusze-generowane.json — rolka-auto
//      берёт их наравне с ручными.
//
// Чего генератор НЕ пишет: «kulisy» и «jedna liczba». Эти формы держатся на
// настоящих фактах про ZOVU (наши цифры, наши ролики), а выдуманный факт в
// ленте студии — хуже повтора.
//
//   node generator-scenariuszy.mjs            — дописать, если свежих мало
//   node generator-scenariuszy.mjs --ile=6    — дописать 6 в любом случае
//   node generator-scenariuszy.mjs --proba    — написать и показать, не сохраняя
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { historiaScenariuszy, MIN_DNI } from './historia-scenariuszy.mjs';

const DIR = import.meta.dirname;
export const PLIK = path.join(DIR, 'rolki', 'scenariusze-generowane.json');

const FORMY = {
  lista: 'trzy konkretne rzeczy (punkt 1, 2, 3), każda do zrobienia od razu',
  mit: 'popularne przekonanie → dlaczego nie działa → co działa naprawdę',
  'pod-prad': 'rada wbrew temu, co wszyscy powtarzają, z jasnym uzasadnieniem',
  'przed-po': 'jedna zmiana: jak było przed, jak jest po, czemu to działa',
  pytanie: 'pytanie, które właściciel firmy zadaje sobie sam, i krótka uczciwa odpowiedź',
  blad: 'jeden częsty błąd, po czym go poznać i jak naprawić w 5 minut',
};

const TEMATY = [
  'Instagram i Facebook małej firmy', 'rolki i krótkie wideo', 'zdjęcia produktów i usług telefonem',
  'strona internetowa małej firmy', 'wizytówka Google i opinie', 'odpisywanie klientom i wiadomości',
  'cena i wycena w rozmowie z klientem', 'teksty postów i pierwsze zdanie', 'reklama na Facebooku za małe pieniądze',
  'lokalny biznes: kawiarnia, barber, salon, warsztat', 'TikTok dla firmy', 'stały rytm publikacji bez wypalenia',
  'AI w treściach: co robi dobrze, a czego nie', 'oferta, która jest jasna w 5 sekund', 'polecenia i powracający klienci',
];

// Штампы: общий список контент-движка + свои для рилсов.
const ZAKAZANE = [
  'w dzisiejszych czasach', 'każda firma marzy', 'świat się zmienia', 'kompleksowe rozwiązania', 'synergia',
  'dedykowany zespół', 'gwarantujemy', 'w zakresie', 'engagement', 'lejek konwersji', 'zasięgi organiczne',
  'nie zostawaj w tyle', 'nie zostań w tyle', 'rewolucja', 'era ai', 'przyszłość', 'to nie hype', 'klucz do sukcesu',
  'nowe możliwości', 'bądź na bieżąco', 'wykorzystaj potencjał', 'wyprzedź konkurencję', 'w erze', 'cyfrowy świat',
  'game changer', 'sekret', 'hack', 'magia', 'magiczny', 'nikt ci nie powie', 'musisz to wiedzieć', 'szok',
  'nasi klienci', 'naszym klientom', 'u naszych klientów', 'sprawdziliśmy', 'nasze statystyki', 'nasze dane',
];

const ZASADY = `Piszesz scenariusze krótkich pionowych filmów (rolki, 15–22 sekundy) dla ZOVU — małego studia z Katowic, które robi treści, rolki i strony dla małych firm. Widz: właściciel małej firmy lub JDG ze Śląska, nie marketingowiec.

Głos: zwykły człowiek mówi do znajomego. Krótkie zdania. Konkret zamiast ogólników. Zwracasz się na „ty”. Zero słów z korporacji i marketingowego żargonu. Bez emoji w czesci.

ZAKAZ wymyślania faktów: żadnych liczb, procentów, badań, statystyk ani historii o „naszych klientach” czy „naszych wynikach”. Wolno liczyć tylko rzeczy z samej rady („trzy zdania”, „pięć minut”).

Każdy scenariusz to obiekt JSON:
{
 "nazwa": "slug-po-polsku-bez-ogonkow",
 "forma": jedna z: ${Object.keys(FORMY).join(', ')},
 "temat": "o czym, 3–7 słów",
 "plyta": {"linie": ["2–3 SŁOWA", "2–4 SŁOWA"], "plaszka": "1–2 SŁOWA"},   // okładka, WIELKIE LITERY
 "opis": "tekst posta pod rolką: 3–5 krótkich akapitów rozdzielonych \\n\\n, ostatni akapit 'zovu.pl', potem \\n\\n i 4–6 hashtagów po polsku",
 "czesci": [   // 6–8 fraz, cały tekst czytany na głos to 30–48 słów
   {"rola": "hak", "tekst": "...", "szukaj": "..."},        // 1–2 frazy: zatrzymuje kciuk, konkretna sytuacja widza
   {"rola": "punkt", "numer": 1, "tytul": "1–2 słowa", "tekst": "...", "szukaj": "..."},  // przy formie lista: dokładnie 3 punkty; przy innych formach rola "tresc" bez numeru
   {"rola": "zaplata", "tekst": "...", "szukaj": "..."},    // 1 fraza: puenta, którą chce się zapamiętać
   {"rola": "cta", "tekst": "...", "szukaj": "..."}         // 1 fraza: zapisz / sprawdź u siebie / napisz w komentarzu
 ],
 "zakonczenia": {
   "pytanie": {"cta": "pytanie do widza zamiast cta", "karta": {"tekst": "to samo pytanie krócej, max 6 słów", "odpowiedz": "przykładowa odpowiedź widza, max 4 słowa…"}},
   "wyslij": {"cta": "Wyślij to komuś, kto ... (konkretna osoba)", "karta": {"tekst": "Komuś, kto ... max 5 słów"}}
 }
}

Fraza ("tekst"): 3–9 słów, jedna myśl, da się powiedzieć na jednym oddechu. Mogą być dwa bardzo krótkie zdania („Najpierw pytanie. O cel.”). Poprawna polszczyzna — sprawdź rodzaj, przypadki, ogonki.
"szukaj": zapytanie PO ANGIELSKU do stocku wideo, 3–5 słów, konkretny obraz z życia (ręce, telefon, sklep, warsztat), bez abstrakcji typu "success" czy "growth".
Odpowiadasz samym JSON: {"scenariusze": [ ... ]}.`;

const ZASADY_KOREKTY = `Jesteś korektorem i redaktorem polskich tekstów do krótkich filmów. Dostajesz JSON ze scenariuszami.
Popraw: błędy językowe (rodzaj, przypadki, ogonki, interpunkcja), zdania nienaturalne lub „przetłumaczone”, frazy dłuższe niż 9 słów, ogólniki, marketingowy żargon.
Usuń każdą wymyśloną liczbę, statystykę lub historię o klientach — zamień na zwykłą radę.
Nie zmieniaj struktury, kluczy, ról, liczby fraz ani pól "szukaj" i "nazwa". Zwróć ten sam JSON: {"scenariusze": [ ... ]}.`;

async function klucz() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const raw = await readFile(path.join(DIR, '.env'), 'utf8');
    return raw.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m)?.[1].trim() || null;
  } catch {
    return null;
  }
}

// Сильная модель первой: сценарий пишется раз в неделю, а не на каждый ролик,
// и экономить тут не на чем. Flash — запасная на случай лимита.
// Первым — Gemini Pro через Google Cloud (Vertex) теми же ключами, что и голос.
// 20.10 бесплатная квота ключа Gemini кончилась к обеду: её съедает отбор
// кадров. У облака дневного потолка нет, платится из пробного кредита
// (до 30.11), пачка сценариев — центы.
async function zapytajVertex(system, user, temperatura) {
  const { GCP_CLIENT_ID: id, GCP_CLIENT_SECRET: sekret, GCP_REFRESH_TOKEN: odswiez } = process.env;
  const projekt = process.env.GCP_PROJECT;
  if (!id || !sekret || !odswiez || !projekt) throw new Error('нет ключей Google Cloud');
  const t = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: sekret, refresh_token: odswiez, grant_type: 'refresh_token' }),
  }).then((r) => r.json());
  if (!t.access_token) throw new Error('токен Google: ' + JSON.stringify(t).slice(0, 160));
  const model = process.env.VERTEX_MODEL || 'gemini-2.5-pro';
  const r = await fetch(
    `https://aiplatform.googleapis.com/v1/projects/${projekt}/locations/global/publishers/google/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t.access_token}`, 'x-goog-user-project': projekt },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: temperatura, responseMimeType: 'application/json' },
      }),
    }
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Vertex ${model} ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  console.log(`[generator] ответила ${model} (Google Cloud)`);
  return JSON.parse((j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
}

async function zapytaj(system, user, temperatura) {
  try {
    return await zapytajVertex(system, user, temperatura);
  } catch (e) {
    console.warn(`[generator] Google Cloud не ответил (${e.message}) — пробую ключ Gemini`);
  }
  const key = await klucz();
  if (!key) throw new Error('нет GEMINI_API_KEY');
  let blad;
  for (const model of ['gemini-pro-latest', 'gemini-flash-latest']) {
    for (let proba = 0; proba < 2; proba++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { temperature: temperatura, responseMimeType: 'application/json' },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const tekst = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        console.log(`[generator] ответила ${model}`);
        return JSON.parse(tekst);
      }
      blad = `${model} ${r.status}: ${JSON.stringify(j).slice(0, 160)}`;
      if (r.status !== 503) break;
      await new Promise((res) => setTimeout(res, 8000));
    }
  }
  throw new Error(blad);
}

const norm = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/[^a-z0-9 ]+/g, ' ').trim();
const slowaW = (s) => norm(s).split(/\s+/).filter(Boolean);
function trojki(s) {
  const w = slowaW(s).filter((x) => x.length > 2);
  const out = new Set(w);
  for (let i = 0; i + 1 < w.length; i++) out.add(w[i] + ' ' + w[i + 1]);
  return out;
}
const jaccard = (a, b) => {
  let w = 0;
  for (const x of a) if (b.has(x)) w++;
  return w / Math.max(1, a.size + b.size - w);
};
const tekstScen = (s) => [s.temat, ...(s.czesci || []).map((c) => c.tekst)].join(' ');

// Что уже было: ручной банк вытаскиваем из исходника регуляркой (rolka-auto
// при импорте сразу собирает ролик, импортировать его нельзя), плюс
// сгенерированные раньше.
export async function znaneScenariusze() {
  const zrodlo = await readFile(path.join(DIR, 'rolka-auto.mjs'), 'utf8');
  const reczne = [];
  for (const blok of zrodlo.split(/\n  \{\n    nazwa: /).slice(1)) {
    const nazwa = blok.match(/^'([^']+)'/)?.[1];
    const temat = blok.match(/temat: '([^']+)'/)?.[1] || '';
    const teksty = [...blok.matchAll(/tekst: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
    if (nazwa) reczne.push({ nazwa, temat, czesci: teksty.map((t) => ({ tekst: t })) });
  }
  const generowane = await wczytajGenerowane();
  return [...reczne, ...generowane];
}

export async function wczytajGenerowane() {
  try {
    return JSON.parse(await readFile(PLIK, 'utf8'));
  } catch {
    return [];
  }
}

// Механическая проверка одного сценария. Возвращает список претензий.
export function sprawdz(s, znane) {
  const bledy = [];
  if (!s || typeof s !== 'object') return ['не объект'];
  if (!/^[a-z0-9-]{4,60}$/.test(s.nazwa || '')) bledy.push(`плохое имя «${s.nazwa}»`);
  if (znane.some((z) => z.nazwa === s.nazwa)) bledy.push(`имя «${s.nazwa}» уже занято`);
  if (!FORMY[s.forma]) bledy.push(`форма «${s.forma}»`);
  const cz = Array.isArray(s.czesci) ? s.czesci : [];
  if (cz.length < 6 || cz.length > 8) bledy.push(`фраз ${cz.length}`);
  const role = cz.map((c) => c.rola);
  if (role[0] !== 'hak') bledy.push('первая фраза не хук');
  if (role.at(-1) !== 'cta') bledy.push('последняя не призыв');
  if (role.at(-2) !== 'zaplata') bledy.push('перед призывом нет вывода');
  if (role.some((r) => !['hak', 'punkt', 'tresc', 'zaplata', 'cta'].includes(r))) bledy.push('чужая роль');
  if (s.forma === 'lista' && role.filter((r) => r === 'punkt').length !== 3) bledy.push('в списке не три пункта');
  let razem = 0;
  for (const c of cz) {
    const n = slowaW(c.tekst || '').length;
    razem += n;
    if (n < 2 || n > 10) bledy.push(`фраза на ${n} слов: «${c.tekst}»`);
    if (!c.szukaj || slowaW(c.szukaj).length < 2) bledy.push(`нет запроса к стоку у «${c.tekst}»`);
    if (/[^\x00-\x7f]/.test(c.szukaj || '')) bledy.push(`запрос не по-английски: «${c.szukaj}»`);
    if (/\p{Extended_Pictographic}/u.test(c.tekst || '')) bledy.push('эмодзи во фразе');
  }
  if (razem < 26 || razem > 52) bledy.push(`всего слов ${razem}`);
  const wszystko = [tekstScen(s), s.opis, JSON.stringify(s.zakonczenia || {})].join(' ').toLowerCase();
  for (const z of ZAKAZANE) if (wszystko.includes(z)) bledy.push(`штамп «${z}»`);
  // Цифры с процентами или «x razy» почти всегда выдуманная статистика.
  if (/\d+\s*(%|proc|razy)/i.test(wszystko)) bledy.push('похоже на выдуманную статистику');
  if (!/zovu\.pl/.test(s.opis || '')) bledy.push('в посте нет zovu.pl');
  if (!s.zakonczenia?.pytanie?.cta || !s.zakonczenia?.wyslij?.cta) bledy.push('нет призывов под концовки');
  if (!s.plyta?.linie?.length) bledy.push('нет обложки');
  // Похожесть на то, что уже было.
  const ja = trojki(tekstScen(s));
  for (const z of znane) {
    const p = jaccard(ja, trojki(tekstScen(z)));
    // Порог по замеру ручного банка: пара-дубль «trzy-sekundy» /
    // «cztery-sekundy-uwagi» давала 0,12, разные темы — до 0,09.
    if (p > 0.11) { bledy.push(`похож на «${z.nazwa}» (${p.toFixed(2)})`); break; }
    if (z.temat && norm(z.temat) === norm(s.temat)) { bledy.push(`тема как у «${z.nazwa}»`); break; }
  }
  return bledy;
}

// Приводим к виду банка: паузы между фразами — как у ручных сценариев.
function doBanku(s) {
  const PAUZY = { hak: 0.38, punkt: 0.3, tresc: 0.3, zaplata: 0.32, cta: 0.2 };
  return {
    nazwa: s.nazwa,
    plyta: s.plyta,
    forma: s.forma,
    temat: s.temat,
    opis: s.opis,
    czesci: s.czesci.map((c) => ({
      rola: c.rola,
      ...(c.rola === 'punkt' ? { numer: c.numer, tytul: c.tytul } : {}),
      tekst: c.tekst.trim(),
      szukaj: c.szukaj.trim(),
      pauza: PAUZY[c.rola] ?? 0.3,
    })),
    zakonczenia: { pytanie: s.zakonczenia.pytanie, wyslij: s.zakonczenia.wyslij },
    zrodlo: 'generator',
    utworzono: new Date().toISOString().slice(0, 10),
  };
}

export async function generuj(ile, { zapisz = true } = {}) {
  const znane = await znaneScenariusze();
  // Разнообразие задаём сами, а не просим модель «будь разнообразной»:
  // каждому сценарию — своя форма и своя тема.
  const formy = Object.keys(FORMY);
  const start = Math.floor(Math.random() * 100);
  const zadania = Array.from({ length: ile + 2 }, (_, i) => ({
    forma: formy[(start + i) % formy.length],
    temat: TEMATY[(start * 7 + i * 5) % TEMATY.length],
  }));
  const juzBylo = znane.map((z) => `- ${z.temat}`).join('\n');
  const prosba =
    `Napisz ${zadania.length} scenariuszy:\n` +
    zadania.map((z, i) => `${i + 1}. forma „${z.forma}” (${FORMY[z.forma]}), obszar: ${z.temat}`).join('\n') +
    `\n\nTe tematy już były — nie powtarzaj ich ani ich puent:\n${juzBylo}`;

  const surowe = await zapytaj(ZASADY, prosba, 0.9);
  const poprawione = await zapytaj(ZASADY_KOREKTY, JSON.stringify(surowe), 0.2).catch((e) => {
    console.warn(`[generator] корректор не ответил (${e.message}) — беру без корректуры`);
    return surowe;
  });
  const lista = poprawione.scenariusze || [];
  if (process.argv.includes('--proba')) console.log('[generator] пример ответа: ' + JSON.stringify(lista[0]).slice(0, 2500));

  const przyjete = [];
  for (const s of lista) {
    const bledy = sprawdz(s, [...znane, ...przyjete]);
    if (bledy.length) {
      console.log(`[generator] ✗ ${s?.nazwa}: ${bledy.join('; ')}`);
      continue;
    }
    przyjete.push(doBanku(s));
    console.log(`[generator] ✓ ${s.nazwa} (${s.forma}): ${s.czesci.map((c) => c.tekst).join(' | ')}`);
    if (przyjete.length >= ile) break;
  }
  if (zapisz && przyjete.length) {
    const generowane = await wczytajGenerowane();
    await writeFile(PLIK, JSON.stringify([...generowane, ...przyjete], null, 2) + '\n', 'utf8');
  }
  return przyjete;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generator-scenariuszy.mjs')) {
  const ile = Number((process.argv.find((a) => a.startsWith('--ile=')) || '').split('=')[1]) || 0;
  const proba = process.argv.includes('--proba');
  let dopisz = ile;
  // Без числа — режим расписания: дописываем, только когда свежих (не
  // выходивших месяц) меньше двух недель ленты.
  if (!dopisz && !proba) {
    const znane = await znaneScenariusze();
    const hist = await historiaScenariuszy(DIR);
    const granica = Date.now() - MIN_DNI * 86400000;
    const swieze = znane.filter((z) => !hist.has(z.nazwa) || hist.get(z.nazwa) < granica).length;
    console.log(`[generator] свежих сценариев: ${swieze} из ${znane.length}`);
    dopisz = swieze < 14 ? 7 : 0;
  }
  if (dopisz || proba) {
    const p = await generuj(dopisz || 3, { zapisz: !proba });
    console.log(`[generator] принято: ${p.length}`);
    if (!p.length) process.exitCode = 1;
  } else {
    console.log('[generator] свежих хватает — ничего не пишу');
  }
}
