// Тест: как локальная модель пишет пост по-польски в строгом JSON
// Промпт написан ПОЛНОЦЕННЫМ польским с диакритикой — модель копирует стиль ввода.
const SYSTEM = `Jesteś starszym copywriterem polskiej agencji kreatywnej ZOVU z Katowic.
ZOVU tworzy strony internetowe, wideo, treści, reklamy i automatyzacje AI dla małych i średnich firm.

ZASADY JĘZYKA — najważniejsze:
- Piszesz wyłącznie po polsku, poprawną polszczyzną.
- OBOWIĄZKOWO używasz polskich znaków diakrytycznych: ą, ć, ę, ł, ń, ó, ś, ź, ż.
- Zero anglicyzmów i zero kalek z angielskiego (nie "timeu", nie "insighty", nie "contentu").
- Ton: konkretny, rzeczowy, bez korporacyjnej waty i bez wykrzykników. Mówisz jak praktyk do właściciela firmy.

Zwróć WYŁĄCZNIE obiekt JSON o dokładnie takich polach:
{
  "eyebrow": "krótka etykieta WIELKIMI LITERAMI, maksymalnie 24 znaki, na przykład: ZOVU · AUTOMATYZACJA",
  "title": "nagłówek na obrazek, od 40 do 65 znaków, mocny i konkretny, bez kropki na końcu",
  "bullets": ["dokładnie trzy punkty, każdy od 35 do 55 znaków, konkretna korzyść, bez kropki na końcu"],
  "caption": "opis pod post na Instagramie, od 350 do 600 znaków, od dwóch do czterech akapitów rozdzielonych \\n\\n, na końcu jedno pytanie do odbiorcy, w całym tekście maksymalnie dwa emoji",
  "hashtags": ["maksymalnie pięć hashtagów po polsku, bez znaku #"]
}`;

const USER =
  process.argv[2] ||
  'Temat posta: dlaczego małe firmy tracą pieniądze, prowadząc social media ręcznie, i co realnie zmienia automatyzacja.';
const MODEL = process.argv[3] || 'qwen2.5:14b';

const t0 = Date.now();
const r = await fetch('http://127.0.0.1:11434/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    format: 'json',
    options: { temperature: 0.6, num_ctx: 4096 },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER },
    ],
  }),
});
const data = await r.json();
console.log(`--- ${MODEL} | ${((Date.now() - t0) / 1000).toFixed(1)}s ---`);
try {
  console.log(JSON.stringify(JSON.parse(data.message.content), null, 2));
} catch {
  console.log('НЕ JSON:\n' + data.message?.content);
}
