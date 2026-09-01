// Голос с ТЕГАМИ ВНУТРИ ТЕКСТА — то, чего нам не хватало.
//
// Что мы делали не так. Подача уходила одной строкой в поле `prompt`, а она
// задаёт ОДИН характер на весь дубль. Отсюда «везде одинаковая тональность»,
// и на пятидесяти секундах это и есть скука.
//
// Gemini TTS умеет иначе: прямо в тексте ставятся метки вроде `[whispers]`,
// `[sarcastically]`, `[excited]`, и они меняют подачу с этого места. Плюс сам
// prompt строится не одной фразой, а по схеме из документации:
//   кто говорит → где это происходит → режиссёрские заметки.
//
// Проверка встроена: после синтеза расшифровываем дубль и смотрим, не
// прочитала ли модель сами метки вслух. Так когда-то опозорился ElevenLabs v2,
// и ловить это ухом на польском — лотерея.
//
//   node nootri-glos-tagi.mjs --glos=Iapetus
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

// Схема из документации: профиль → сцена → режиссёрские заметки.
// Заметки говорят, КАК меняться, а сами перепады стоят метками в тексте.
const PROMPT =
  'Audio profile: forty-nine year old Polish man, warm low voice, telling his own story. ' +
  'Scene: he sits alone at a kitchen table, late evening, talking to one friend. ' +
  "Director's notes: this is a confession that turns into a comeback. " +
  'Start defeated, end confident. Follow the bracketed cues exactly and let tone, ' +
  'pace and volume change with them. Never read the cues aloud. Speak natural Polish.';

// Метки английские — так они описаны в документации, и модель их узнаёт
// надёжнее, чем самодельные польские.
const KWESTIE = [
  '[defeated, quietly] Zadzwoniłem do żony o dwudziestej trzeciej,',
  'a telefon odebrał jakiś... dwudziestosiedmiolatek.',
  '[bitterly sarcastic] Zapytał, czy to ja jestem tym dziadkiem, o którym mówiła.',
  '[whispers] Nie krzyczałem, po prostu usiadłem w kuchni,',
  '[flat, tired] bo dziś mam piętnaście kilo więcej niż w dniu ślubu.',
  '[matter-of-fact, firm] Trener wytłumaczył mi, że po czterdziestce kortyzol idzie w górę, a testosteron w dół,',
  '[with emphasis] więc to nie jest brak silnej woli, tylko hormony.',
  '[calm] Zamiast zwykłej kawy piję teraz jedną filiżankę kawy grzybowej:',
  'ashwagandha na kortyzol, lion’s mane na mgłę w głowie.',
  '[brightening] W szóstym tygodniu założyłem koszulę sprzed pięciu lat.',
  '[warmly] Wróciła po swoje pudła',
  '[amused] i zapytała, co ja ze sobą zrobiłem.',
  '[confident, smiling] Jeden kubek każdego ranka.',
];
if (KWESTIE.length !== FRAZY.length) throw new Error('[tagi] реплик и фраз должно быть поровну');

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
async function ffmpeg(a) { return exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { maxBuffer: 64 * 1024 * 1024 }); }
async function dl(p) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]);
  return parseFloat(stdout.trim());
}

await mkdir(WYJ, { recursive: true });
const tekst = KWESTIE.join(' ');
console.log(`[tagi] ${KWESTIE.length} реплик, ${tekst.length} знаков, голос ${GLOS}`);

const t = await token();
const wav = path.join(WYJ, 'nootri-glos.wav');
let audio = null;
for (let i = 0; i < 6 && !audio; i++) {
  const r = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${t}`,
      'x-goog-user-project': process.env.GCP_PROJECT || 'zovu-autopilot',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      input: { text: tekst, prompt: PROMPT },
      voice: { languageCode: 'pl-PL', name: GLOS, modelName: 'gemini-2.5-flash-tts' },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000 },
    }),
  });
  if (r.status === 429) { console.warn('[tagi] 429 — жду 20 с'); await new Promise((x) => setTimeout(x, 20000)); continue; }
  if (!r.ok) throw new Error(`Cloud TTS ${r.status}: ${(await r.text()).slice(0, 250)}`);
  audio = (await r.json()).audioContent;
}
await writeFile(wav, Buffer.from(audio, 'base64'));
console.log(`[tagi] дубль ${(await dl(wav)).toFixed(2)} с`);

// ── расшифровка: и разметка слов, и проверка на прочитанные метки ──
const mp3 = path.join(WYJ, 'do-rozpoznania.mp3');
await ffmpeg(['-i', wav, '-ar', '16000', '-ac', '1', '-b:a', '64k', mp3]);
const dane = new FormData();
dane.append('file', new Blob([await (await import('node:fs/promises')).readFile(mp3)]), 'glos.mp3');
dane.append('model', 'whisper-large-v3-turbo');
dane.append('language', 'pl');
dane.append('response_format', 'verbose_json');
dane.append('timestamp_granularities[]', 'word');
const rr = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
  method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_KEY }, body: dane,
});
if (!rr.ok) throw new Error(`Groq ${rr.status}`);
const odp = await rr.json();
const slowaR = (odp.words || []).filter((w) => String(w.word).trim());

const PODEJRZANE = ['defeated', 'sarcastic', 'whisper', 'flat', 'tired', 'matter', 'emphasis',
  'calm', 'brighten', 'warmly', 'amused', 'confident', 'smiling', 'quietly'];
const wpadki = PODEJRZANE.filter((p) => (odp.text || '').toLowerCase().includes(p));
if (wpadki.length) console.warn(`[tagi] ВНИМАНИЕ: модель прочитала метки вслух — ${wpadki.join(', ')}`);
else console.log('[tagi] метки не прозвучали — в тексте их нет');

const granice = [];
let idx = 0;
for (const [n, f] of FRAZY.entries()) {
  // Слова считаем по реплике БЕЗ метки: вслух её нет, значит и в разметке быть не должно.
  const ile = KWESTIE[n].replace(/\[[^\]]*\]/g, '').split(/\s+/).filter(Boolean).length;
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
console.log(`[tagi] размечено ${slowa.length} слов, речь ${granice[granice.length - 1].b.toFixed(1)} с`);
