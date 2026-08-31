// Один дубль голоса для клиентского ролика — режим Gemini-TTS в Cloud TTS.
//
// Почему не общий путь из glos.mjs. Там обычный Chirp3-HD, и Захар его
// забраковал («полная хуйня») ровно в том виде, в каком я собрал: пофразно и
// без подачи. Разница не в тембре — в двух вещах: ОДИН дубль вместо склейки
// восьми и текст, написанный как речь, а не как подписи.
//
// Рецепт проверен соседней сессией на ролике, который Захар принял на слух
// («реально круто, очень хорошие эмоции») — тем же голосом Puck.
//
// Грабли, оплаченные её пробами:
//   • endpoint именно v1beta1, иначе `prompt` игнорируется;
//   • имя голоса БЕЗ префикса — `pl-PL-Chirp3-HD-Puck` вместе с modelName даёт
//     400 «Gemini models cannot be used with non-Gemini voices»;
//   • speakingRate/pitch не передавать вообще: темп задаётся словами, ползунок
//     поверх ломает подачу;
//   • mp3 не брать — у Google это 24 кГц/32 кбит/с, звучит как телефон.
//
//   node nootri-glos-jeden.mjs --podanie=a|b
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FRAZY } from './nootri-frazy.mjs';

const exec = promisify(execFile);
const DIR = import.meta.dirname;
const WYJ = path.join(DIR, 'out', 'nootri');
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=').pop();

// Подача меняет ХАРАКТЕР, а не темп. Просьба «wolniej, wyraźne pauzy» растянула
// у соседней сессии двухсекундную фразу до 7,7 — темп задаётся смыслом.
const PODANIA = {
  a: 'Mów cicho i szczerze, jakbyś opowiadał to jednej osobie późnym wieczorem. Bez patosu i bez aktorstwa, naturalne oddechy, miejscami zawahanie.',
  b: 'Mów spokojnie, jak człowiek, który już to przepracował: bez żalu w głosie, prosto i rzeczowo, ale ciepło.',
};
const PODANIE = PODANIA[arg('podanie', 'a')] || PODANIA.a;
const GLOS = arg('glos', 'Puck');

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
  if (!r.ok) throw new Error(`OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token;
}

// Текст для уха: связки написаны руками в поле `mowa`. Механическая замена
// точек на запятые даёт четырнадцать запятых подряд и звучит хуже оригинала.
const mowa = FRAZY.map((f) => (f.mowa || f.tekst).trim()).join(' ');
console.log(`[glos1] ${FRAZY.length} фраз, ${mowa.length} знаков, голос ${GLOS}`);

const wav = path.join(WYJ, 'nootri-glos.wav');
await mkdir(WYJ, { recursive: true });

const t = await token();
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
      input: { text: mowa, prompt: PODANIE },
      voice: { languageCode: 'pl-PL', name: GLOS, modelName: 'gemini-2.5-flash-tts' },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000 },
    }),
  });
  if (r.status === 429) { console.warn('[glos1] 429 — жду 20 с'); await new Promise((x) => setTimeout(x, 20000)); continue; }
  if (!r.ok) throw new Error(`Cloud TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  audio = (await r.json()).audioContent;
}
if (!audio) throw new Error('[glos1] не дождался ответа TTS');
await writeFile(wav, Buffer.from(audio, 'base64'));

// Границы фраз — по тишине в самом дубле. Внутрь дубля не лезем: любая резка
// и склейка добавляет ту самую «слышно ИИ», из-за которой всё и затевалось.
const { stderr } = await exec(
  'ffmpeg', ['-v', 'info', '-i', wav, '-af', 'silencedetect=n=-40dB:d=0.18', '-f', 'null', '-'],
  { maxBuffer: 32 * 1024 * 1024 }
);
const { stdout: dur } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]);
const calosc = parseFloat(dur.trim());
const starty = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => +m[1]);
const konce = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => +m[1]);
const ciszy = starty
  .map((s, n) => ({ od: s, doo: konce[n] ?? calosc, dl: (konce[n] ?? calosc) - s }))
  .filter((c) => c.doo < calosc - 0.05);

// ── где кончается каждая фраза ────────────────────────────────────
// Сначала пробуем ТОЧНЫЙ путь: расшифровка дубля с таймингами каждого слова.
// Паузы ненадёжны — модель читает каждый раз чуть иначе, и в одном дубле их
// вышло девять на тринадцать фраз. Слова же произнесены ровно наши, их порядок
// известен заранее, поэтому границы считаются, а не угадываются.
//
// Расшифровка бесплатная: Groq, whisper-large-v3-turbo, 8 часов аудио в сутки.
const bezOgonkow = (w) =>
  String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

async function slowaZGroq() {
  const klucz = process.env.GROQ_KEY;
  if (!klucz) return null;
  const mp3 = path.join(WYJ, 'do-rozpoznania.mp3');
  await exec('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-ar', '16000', '-ac', '1', '-b:a', '64k', mp3]);
  const dane = new FormData();
  dane.append('file', new Blob([await (await import('node:fs/promises')).readFile(mp3)]), 'glos.mp3');
  dane.append('model', 'whisper-large-v3-turbo');
  dane.append('language', 'pl');
  dane.append('response_format', 'verbose_json');
  dane.append('timestamp_granularities[]', 'word');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + klucz },
    body: dane,
  });
  if (!r.ok) {
    console.warn('[glos1] Groq ' + r.status + ' — падаю на разрез по тишине');
    return null;
  }
  const j = await r.json();
  const ws = (j.words || []).filter((w) => bezOgonkow(w.word));
  console.log('[glos1] расшифровка: ' + ws.length + ' слов');
  return ws.length ? ws : null;
}

const rozpoznane = await slowaZGroq();
if (rozpoznane) {
  // Раздаём распознанные слова по фразам ПО ПОРЯДКУ: сколько слов в `mowa`,
  // столько и берём. Слово могло склеиться или разбиться, поэтому последнюю
  // фразу добираем остатком, а не жёстким счётом.
  const granice = [];
  let i = 0;
  for (const [n, f] of FRAZY.entries()) {
    const ile = (f.mowa || f.tekst).split(/\s+/).filter(Boolean).length;
    const od2 = rozpoznane[Math.min(i, rozpoznane.length - 1)];
    const ostatni = n === FRAZY.length - 1 ? rozpoznane.length - 1 : Math.min(i + ile - 1, rozpoznane.length - 1);
    const doo2 = rozpoznane[ostatni];
    granice.push({
      tekst: f.tekst,
      rola: f.rola,
      a: +Number(od2.start).toFixed(3),
      b: +Math.max(Number(od2.start) + 0.2, Number(doo2.end)).toFixed(3),
    });
    i = ostatni + 1;
  }
  const slowaP = granice.flatMap((f) => {
    const ws = f.tekst.split(/\s+/).filter(Boolean);
    const suma2 = ws.reduce((a2, w) => a2 + w.length, 0) || 1;
    let t3 = f.a;
    return ws.map((w) => {
      const d = ((f.b - f.a) * w.length) / suma2;
      const s3 = { tekst: w, a: +t3.toFixed(3), b: +(t3 + d).toFixed(3) };
      t3 += d;
      return s3;
    });
  });
  const syl = (s4) => (String(s4).toLowerCase().match(/[aeiouyąęó]/g) || []).length || 1;
  console.log('[glos1] темп по фразам: ' + granice.map((f) => (syl(f.tekst) / Math.max(0.2, f.b - f.a)).toFixed(1)).join(' '));
  await writeFile(
    path.join(WYJ, 'nootri-glos.json'),
    JSON.stringify({ dlugosc: +(granice[granice.length - 1].b + 0.35).toFixed(3), frazy: granice, slowa: slowaP }, null, 2),
    'utf8'
  );
  console.log('[glos1] готово по расшифровке: ' + calosc.toFixed(2) + ' с дубля, ' + slowaP.length + ' слов');
  process.exit(0);
}

const potrzeba = FRAZY.length - 1;
if (ciszy.length < potrzeba) {
  throw new Error(`[glos1] пауз ${ciszy.length}, а нужно ${potrzeba} — текст слитный, разрежьте фразы иначе`);
}

// Границы ищем НЕ по «самым длинным паузам». Так вышло 100 слогов в секунду
// на первой фразе: две длинные паузы оказались рядом, и между ними уместился
// огрызок в 0,15 с. В связной речи длина паузы не говорит о её месте.
//
// Правильно — знать, ГДЕ граница должна быть: доля слогов от начала даёт
// ожидаемое время, а дальше берём ближайшую свободную паузу. Слоги считаем по
// тому тексту, который РЕАЛЬНО звучал (`mowa`), а не по подписям.
const sylabyRaw = (s2) => (String(s2).toLowerCase().match(/[aeiouyąęó]/g) || []).length || 1;
const wagi = FRAZY.map((f) => sylabyRaw(f.mowa || f.tekst));
const suma = wagi.reduce((a, b) => a + b, 0);
const mowaOd = (konce[0] ?? 0) < 0.4 ? konce[0] ?? 0 : 0;
const mowaDo = ciszy.length && ciszy[ciszy.length - 1].doo >= calosc - 0.1 ? ciszy[ciszy.length - 1].od : calosc;
let nar = 0;
const oczekiwane = wagi.slice(0, -1).map((w) => {
  nar += w;
  return mowaOd + ((mowaDo - mowaOd) * nar) / suma;
});

const wolne = ciszy.slice().sort((a, b) => a.od - b.od);
const ciecia = [];
for (const cel of oczekiwane) {
  let naj = -1;
  let dyst = Infinity;
  for (let i = 0; i < wolne.length; i++) {
    if (ciecia.length && wolne[i].od <= ciecia[ciecia.length - 1].od) continue;
    const d = Math.abs(wolne[i].od - cel);
    if (d < dyst) { dyst = d; naj = i; }
  }
  if (naj < 0) throw new Error('[glos1] пауз не хватило по порядку — текст слишком слитный');
  ciecia.push(wolne[naj]);
}

const frazy = [];
let od = (konce[0] ?? 0) < 0.4 ? konce[0] ?? 0 : 0;
for (const [i, c] of ciecia.entries()) {
  frazy.push({ tekst: FRAZY[i].tekst, a: +od.toFixed(3), b: +Math.max(od + 0.15, c.od - 0.02).toFixed(3), rola: FRAZY[i].rola });
  od = c.doo + 0.02;
}
const ostatnia = ciszy.find((c) => c.od > od && c.doo >= calosc - 0.1);
frazy.push({
  tekst: FRAZY[FRAZY.length - 1].tekst,
  a: +od.toFixed(3),
  b: +(ostatnia ? ostatnia.od + 0.04 : calosc).toFixed(3),
  rola: FRAZY[FRAZY.length - 1].rola,
});

// Слова подписи раскладываем внутри своей фразы по длине. На экране идёт
// `tekst`, а звучит `mowa` — поэтому совпадения слово-в-слово нет и быть
// не может, и ловить его расшифровкой бессмысленно.
const slowa = frazy.flatMap((f) => {
  const ws = f.tekst.split(/\s+/).filter(Boolean);
  const suma = ws.reduce((s, w) => s + w.length, 0) || 1;
  let t2 = f.a;
  return ws.map((w) => {
    const d = ((f.b - f.a) * w.length) / suma;
    const s2 = { tekst: w, a: +t2.toFixed(3), b: +(t2 + d).toFixed(3) };
    t2 += d;
    return s2;
  });
});

const sylaby = (s) => (String(s).toLowerCase().match(/[aeiouyąęó]/g) || []).length || 1;
console.log('[glos1] темп по фразам: ' + frazy.map((f) => (sylaby(f.tekst) / (f.b - f.a)).toFixed(1)).join(' '));

await writeFile(
  path.join(WYJ, 'nootri-glos.json'),
  JSON.stringify({ dlugosc: +(frazy[frazy.length - 1].b + 0.35).toFixed(3), frazy, slowa }, null, 2),
  'utf8'
);
console.log(`[glos1] готово: ${calosc.toFixed(2)} с дубля, ${slowa.length} слов`);
