// Голос с ДУГОЙ ЭМОЦИЙ — лекарство от «везде одинаковая тональность».
//
// Захар, дословно: «голос везде однотипный… а я хочу, чтобы когда он говорит
// „позвонил жене" — был грустный, а потом становился живым». Он прав: подача
// в Gemini-TTS задаётся ОДНОЙ строкой на весь дубль, поэтому ролик и звучит
// ровно от первой секунды до последней. Ровность на 50 секундах = скука.
//
// Два способа получить перепады, и оба здесь:
//
//   --tryb=jeden — ОДИН дубль, но инструкция описывает весь путь: где убито,
//     где с горькой усмешкой, где твёрдо, где с улыбкой. Швов нет вообще.
//
//   --tryb=bloki — ЧЕТЫРЕ куска, у каждого своя эмоция, склейка с паузой.
//     Перепад резче, но на стыке слышен вдох. Здесь это не брак: смена эмоции
//     и должна совпадать со сменой сцены.
//
//   node nootri-glos-luk.mjs --tryb=jeden --glos=Iapetus
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FRAZY } from './nootri-frazy.mjs';

const exec = promisify(execFile);
const DIR = import.meta.dirname;
const WYJ = path.join(DIR, 'out', 'nootri');
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=').pop();

const GLOS = arg('glos', 'Iapetus');
const TRYB = arg('tryb', 'jeden');

// Дуга одной строкой. Ключевое отличие от прошлых попыток: инструкция говорит
// не «каким быть», а «как МЕНЯТЬСЯ».
const LUK_JEDEN =
  'Prowadź wyraźny łuk emocji przez całą wypowiedź, nie mów jednym tonem. ' +
  'Pierwsze zdania: zgaszony, cicho, jak ktoś, komu właśnie zawalił się dom. ' +
  'O dwudziestosiedmiolatku: z gorzką ironią, przez zaciśnięte zęby. ' +
  'O kuchni: prawie szeptem, pusto. ' +
  'Od słów o trenerze: rzeczowo i twardo, jak ktoś, kto wreszcie zrozumiał mechanizm. ' +
  'Od kawy: z rosnącą energią. Ostatnie zdania: pewnie, z lekkim uśmiechem w głosie. ' +
  'Zmieniaj tempo i głośność razem z emocją.';

// Блоки: границы совпадают со сменой сцены в ролике.
const BLOKI = [
  { od: 0, do: 3, podanie: 'Mów zgaszony i cicho, jak ktoś pobity przez sytuację; na ostatnim zdaniu wejdź z gorzką ironią, przez zaciśnięte zęby.' },
  { od: 3, do: 5, podanie: 'Mów prawie szeptem, zmęczony i pusty, jakbyś to mówił do siebie w ciemnej kuchni.' },
  { od: 5, do: 9, podanie: 'Mów rzeczowo i twardo, jak człowiek, który wreszcie zrozumiał, o co chodzi. Bez żalu, konkretnie.' },
  { od: 9, do: 13, podanie: 'Mów z rosnącą energią i pewnością siebie, na końcu lekki uśmiech w głosie. To zwycięstwo, nie chwalenie się.' },
];

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GCP_CLIENT_ID,
      client_secret: process.env.GCP_CLIENT_SECRET,
      refresh_token: process.env.GCP_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}`);
  return (await r.json()).access_token;
}

async function powiedz(t, tekst, podanie, plik) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${t}`,
        'x-goog-user-project': process.env.GCP_PROJECT || 'zovu-autopilot',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: tekst, prompt: podanie },
        voice: { languageCode: 'pl-PL', name: GLOS, modelName: 'gemini-2.5-flash-tts' },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000 },
      }),
    });
    if (r.status === 429) { console.warn('[luk] 429 — жду 20 с'); await new Promise((x) => setTimeout(x, 20000)); continue; }
    if (!r.ok) throw new Error(`Cloud TTS ${r.status}: ${(await r.text()).slice(0, 250)}`);
    await writeFile(plik, Buffer.from((await r.json()).audioContent, 'base64'));
    return plik;
  }
  throw new Error('[luk] не дождался TTS');
}

async function ffmpeg(a) { return exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { maxBuffer: 64 * 1024 * 1024 }); }
async function dl(p) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]);
  return parseFloat(stdout.trim());
}

await mkdir(WYJ, { recursive: true });
const t = await token();
const wav = path.join(WYJ, 'nootri-glos.wav');

if (TRYB === 'jeden') {
  const tekst = FRAZY.map((f) => (f.mowa || f.tekst).trim()).join(' ');
  console.log(`[luk] один дубль с дугой, ${tekst.length} знаков, голос ${GLOS}`);
  await powiedz(t, tekst, LUK_JEDEN, wav);
} else {
  const czesci = [];
  for (const [i, b] of BLOKI.entries()) {
    const tekst = FRAZY.slice(b.od, b.do).map((f) => (f.mowa || f.tekst).trim()).join(' ');
    const plik = path.join(WYJ, `blok${i}.wav`);
    await powiedz(t, tekst, b.podanie, plik);
    console.log(`[luk] блок ${i + 1}: ${(await dl(plik)).toFixed(1)} с — ${b.podanie.slice(0, 42)}…`);
    czesci.push(plik);
  }
  // Пауза между блоками — это и есть смена сцены. 0.42 с: короче звучит как
  // обрыв, длиннее — как дыра.
  const lista = path.join(WYJ, 'bloki.txt');
  const cisza = path.join(WYJ, 'cisza.wav');
  await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=0.42', '-c:a', 'pcm_s16le', cisza]);
  const seq = [];
  czesci.forEach((c, i) => { seq.push(c); if (i < czesci.length - 1) seq.push(cisza); });
  await writeFile(lista, seq.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c:a', 'pcm_s16le', '-ar', '48000', wav]);
  console.log(`[luk] склеено ${czesci.length} блоков`);
}

console.log(`[luk] дубль: ${(await dl(wav)).toFixed(2)} с`);

// Разметку слов берём у Groq — тем же способом, что и в основном синтезе.
const bez = (w) => String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const mp3 = path.join(WYJ, 'do-rozpoznania.mp3');
await ffmpeg(['-i', wav, '-ar', '16000', '-ac', '1', '-b:a', '64k', mp3]);
const dane = new FormData();
dane.append('file', new Blob([await (await import('node:fs/promises')).readFile(mp3)]), 'glos.mp3');
dane.append('model', 'whisper-large-v3-turbo');
dane.append('language', 'pl');
dane.append('response_format', 'verbose_json');
dane.append('timestamp_granularities[]', 'word');
const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
  method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_KEY }, body: dane,
});
if (!r.ok) throw new Error(`Groq ${r.status}`);
const slowaR = ((await r.json()).words || []).filter((w) => bez(w.word));
console.log(`[luk] расшифровка: ${slowaR.length} слов`);

const granice = [];
let idx = 0;
for (const [n, f] of FRAZY.entries()) {
  const ile = (f.mowa || f.tekst).split(/\s+/).filter(Boolean).length;
  const od = slowaR[Math.min(idx, slowaR.length - 1)];
  const ostatni = n === FRAZY.length - 1 ? slowaR.length - 1 : Math.min(idx + ile - 1, slowaR.length - 1);
  const doo = slowaR[ostatni];
  granice.push({
    tekst: f.tekst, rola: f.rola,
    a: +Number(od.start).toFixed(3),
    b: +Math.max(Number(od.start) + 0.2, Number(doo.end)).toFixed(3),
  });
  idx = ostatni + 1;
}
const slowa = granice.flatMap((f) => {
  const ws = f.tekst.split(/\s+/).filter(Boolean);
  const suma = ws.reduce((s, w) => s + w.length, 0) || 1;
  let x = f.a;
  return ws.map((w) => {
    const d = ((f.b - f.a) * w.length) / suma;
    const s = { tekst: w, a: +x.toFixed(3), b: +(x + d).toFixed(3) };
    x += d;
    return s;
  });
});
await writeFile(
  path.join(WYJ, 'nootri-glos.json'),
  JSON.stringify({ dlugosc: +(granice[granice.length - 1].b + 0.35).toFixed(3), frazy: granice, slowa }, null, 2),
  'utf8'
);
console.log('[luk] готово');
