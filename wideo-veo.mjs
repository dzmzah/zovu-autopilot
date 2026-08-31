// Видео через Veo по API — вместо ручной работы в Google Flow.
//
// Зачем. В интерфейсе Flow два потолка, и оба не про качество: 50 бонусов в
// сутки (это пять клипов) и невозможность скачать файл — песочница расширения
// режет любое скачивание, инициированное страницей, поэтому клипы каждый раз
// вытаскивал Захар руками. По API файл приходит на диск сам, и сборка идёт
// без человека в середине.
//
// Ключ — тот же `GEMINI_API_KEY`, что уже лежит в секретах GitHub. Никаких
// сервисных аккаунтов Vertex: у Gemini API тот же Veo, но по обычному ключу.
//
// ДЕНЬГИ. Это платный вызов, а не бонусы Flow: секунда видео стоит денег и
// списывается с кредитов Google Cloud. Поэтому скрипт СНАЧАЛА печатает счёт
// и требует явного `--potwierdzam`, иначе только считает и выходит. Молча
// потратить чужие деньги нельзя.
//
//   node wideo-veo.mjs --prompt="..." --plik=out/veo/kadr.mp4 --potwierdzam
//   node wideo-veo.mjs --plan=nootri-poprawki.json --potwierdzam
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = import.meta.dirname;
const API = 'https://generativelanguage.googleapis.com/v1beta';

// ── две двери к одной модели ──────────────────────────────────────
// Gemini API (ключ) и Vertex AI (проект + токен) отдают ОДНУ И ТУ ЖЕ Veo, но
// платят из разных карманов. Триальные 300 $ на Gemini API НЕ распространяются —
// это написано прямо в окне привязки: «excludes Gemini API», и Google предлагает
// вместо них докупить отдельный кошелёк. На Vertex те же кредиты работают.
//
// Поэтому по умолчанию идём через Vertex: счёт уходит в кредиты, карта не
// трогается. Токен берём у gcloud — своего ключа нигде не храним.
const PRZEZ_VERTEX = !process.argv.includes('--gemini-api');
const PROJEKT = process.env.GCP_PROJECT || 'zovu-autopilot';
const REGION = process.env.GCP_REGION || 'us-central1';
const KLUCZ = process.env.GEMINI_API_KEY;
if (!PRZEZ_VERTEX && !KLUCZ) throw new Error('[veo] нет GEMINI_API_KEY — ключ живёт в секретах GitHub');

async function tokenVertex() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  if (process.env.GCP_TOKEN) return process.env.GCP_TOKEN.trim();
  const { stdout } = await exec('gcloud', ['auth', 'print-access-token'], { shell: true });
  return stdout.trim();
}

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.slice(n.length + 3) : d;
};
const POTWIERDZAM = process.argv.includes('--potwierdzam');

// Lite дешевле и для нашей задачи достаточен: рисованная сцена без сложной
// камеры. Fast и полный Veo оставляем на случай, когда решает движение.
// У Vertex и Gemini API РАЗНЫЕ имена одной модели: там `-001`, тут `-preview`.
// На это ушло три холостых запроса: 404 «Publisher model not found» выглядит как
// отсутствие доступа, а на деле это опечатка в имени. Список доступных моделей
// смотреть так: GET /v1beta1/publishers/google/models?pageSize=200.
const MODEL = arg('model', PRZEZ_VERTEX ? 'veo-3.1-lite-generate-001' : 'veo-3.1-lite-generate-preview');
const SEKUNDY = +arg('sekundy', '8');
const FORMAT = arg('format', '9:16');
const ROZDZIELCZOSC = arg('rozdzielczosc', '720p');
// Цена за секунду по прайсу Gemini API. Держим её здесь, чтобы счёт был виден
// ДО траты, а не в конце месяца.
// Прайс Gemini API за секунду 720p на 31.08.2026. Lite ровно та же модель,
// которой мы уже рисовали во Flow, — то есть вид не изменится, изменится
// только то, что файл приходит сам.
const CENA = {
  'veo-3.1-generate-preview': 0.4, 'veo-3.1-generate-001': 0.4,
  'veo-3.1-fast-generate-preview': 0.1, 'veo-3.1-fast-generate-001': 0.1,
  'veo-3.1-lite-generate-preview': 0.05, 'veo-3.1-lite-generate-001': 0.05,
};

async function api(sciezka, opcje = {}) {
  const r = await fetch(`${API}${sciezka}`, {
    ...opcje,
    headers: { 'x-goog-api-key': KLUCZ, 'Content-Type': 'application/json', ...(opcje.headers || {}) },
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

const parametry = () => ({
  aspectRatio: FORMAT,
  resolution: ROZDZIELCZOSC,
  durationSeconds: SEKUNDY,
  // `generateAudio` тут НЕ передаём: Lite его не принимает и отвечает
  // 400 INVALID_ARGUMENT. Звук Veo нам всё равно не нужен — голос свой,
  // музыка своя, — и он отбрасывается при сборке одной строкой ffmpeg.
});

// ── через Vertex AI (кредиты) ─────────────────────────────────────
// Отличий от Gemini API три: адрес с регионом, заголовок Bearer вместо ключа
// и опрос задания отдельным вызовом `fetchPredictOperation`, а не GET по имени.
// Видео возвращается base64 прямо в ответе, скачивать отдельно не нужно.
async function przezVertex({ prompt, plik, obraz }) {
  const token = await tokenVertex();
  const baza = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJEKT}/locations/${REGION}/publishers/google/models/${MODEL}`;
  // Квота считается на проект, и при входе обычным пользователем его надо назвать
// явно — иначе 403 «requires a quota project».
  const naglowki = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-goog-user-project': PROJEKT,
  };

  const start = await fetch(`${baza}:predictLongRunning`, {
    method: 'POST',
    headers: naglowki,
    body: JSON.stringify({
      instances: [obraz ? { prompt, image: { bytesBase64Encoded: obraz, mimeType: 'image/jpeg' } } : { prompt }],
      parameters: parametry(),
    }),
  });
  if (!start.ok) throw new Error(`Vertex ${start.status}: ${(await start.text()).slice(0, 300)}`);
  const { name } = await start.json();
  console.log(`[veo] задание ${String(name).split('/').pop()}`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const r = await fetch(`${baza}:fetchPredictOperation`, {
      method: 'POST',
      headers: naglowki,
      body: JSON.stringify({ operationName: name }),
    });
    if (!r.ok) throw new Error(`Vertex ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const stan = await r.json();
    if (!stan.done) continue;
    if (stan.error) throw new Error(`[veo] ${JSON.stringify(stan.error).slice(0, 300)}`);

    const wideo = stan.response?.videos?.[0] || stan.response?.generatedSamples?.[0]?.video;
    const b64 = wideo?.bytesBase64Encoded;
    if (!b64) throw new Error(`[veo] ответ без файла: ${JSON.stringify(stan.response).slice(0, 300)}`);
    await mkdir(path.dirname(plik), { recursive: true });
    await writeFile(plik, Buffer.from(b64, 'base64'));
    console.log(`[veo] готово: ${plik}`);
    return plik;
  }
  throw new Error('[veo] задание не закончилось за 10 минут');
}

// Одна генерация: запрос → ожидание → файл на диске.
export async function zrobKlip({ prompt, plik, obraz = null }) {
  if (PRZEZ_VERTEX) return przezVertex({ prompt, plik, obraz });

  const body = {
    instances: [obraz ? { prompt, image: { bytesBase64Encoded: obraz, mimeType: 'image/jpeg' } } : { prompt }],
    parameters: parametry(),
  };

  const start = await api(`/models/${MODEL}:predictLongRunning`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const { name } = await start.json();
  console.log(`[veo] задание ${name.split('/').pop()}`);

  // Ожидание: Veo считает минуту-полторы. Спрашиваем раз в 10 секунд, потолок
  // 10 минут — дальше это уже не задержка, а поломка, и молчать о ней нельзя.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const stan = await (await api(`/${name}`)).json();
    if (!stan.done) continue;
    if (stan.error) throw new Error(`[veo] ${JSON.stringify(stan.error).slice(0, 300)}`);

    const uri =
      stan.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
      stan.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) throw new Error(`[veo] ответ без файла: ${JSON.stringify(stan.response).slice(0, 300)}`);

    const plikR = await fetch(uri, { headers: { 'x-goog-api-key': KLUCZ } });
    if (!plikR.ok) throw new Error(`[veo] скачивание ${plikR.status}`);
    await mkdir(path.dirname(plik), { recursive: true });
    await writeFile(plik, Buffer.from(await plikR.arrayBuffer()));
    console.log(`[veo] готово: ${plik}`);
    return plik;
  }
  throw new Error('[veo] задание не закончилось за 10 минут');
}

// ── что генерируем ────────────────────────────────────────────────
// Либо одна сцена ключами, либо план из файла: [{ prompt, plik }, ...].
const PLAN = arg('plan', null);
const zadania = PLAN
  ? JSON.parse(await readFile(path.resolve(PLAN), 'utf8'))
  : [{ prompt: arg('prompt', ''), plik: path.resolve(arg('plik', path.join(DIR, 'out', 'veo', 'klip.mp4'))) }];

if (!zadania.length || !zadania[0].prompt) throw new Error('[veo] нечего генерировать: нужен --prompt или --plan');

const zaSekunde = CENA[MODEL] ?? 0.4;
const koszt = zadania.length * SEKUNDY * zaSekunde;
console.log(
  `[veo] ${zadania.length} клип(ов) по ${SEKUNDY} с, модель ${MODEL}, ${FORMAT} ${ROZDZIELCZOSC}` +
    ` — счёт примерно ${koszt.toFixed(2)} $ (из кредитов Google Cloud)`
);
if (!POTWIERDZAM) {
  console.log('[veo] это только смета. Для генерации добавь --potwierdzam');
  process.exit(0);
}

for (const [i, z] of zadania.entries()) {
  console.log(`[veo] ${i + 1}/${zadania.length}: ${z.prompt.slice(0, 70)}…`);
  // Стартовый кадр — это лекарство от «уплывшего» героя. Текстом одну и ту же
  // внешность выдержать нельзя: в ролике Nootri мужчина в сценах «после»
  // превратился в другого человека. С кадром лицо приходит из файла, а не
  // из описания.
  const obraz = z.obraz ? (await readFile(path.resolve(z.obraz))).toString('base64') : null;
  await zrobKlip({ prompt: z.prompt, plik: path.resolve(z.plik), obraz });
}
console.log('[veo] всё готово');
