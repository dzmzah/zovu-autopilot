// Пробы «чтобы не звучало как ИИ» — слепой отбор.
//
// 19.10.2026 Захар: голос должен быть не ИИшным, это самое главное. В ленте
// с 31.08 стоит Chirp3-HD Puck без подачи — ровный дикторский синтез, по
// которому ИИ узнаётся с первой фразы. Здесь один и тот же кусок ролика
// читается разными движками с РАЗГОВОРНОЙ подачей, а файлы получают номера
// вместо имён: выбор делается ушами, а не по названию модели. Ключ к
// номерам — `klucz.json` в том же артефакте.
//
//   node proby-naturalne.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const OUT = path.join(import.meta.dirname, 'out', 'proby-naturalne');

// Живая речь — это не только тембр: короткие фразы, «no», «serio»,
// недосказанность. Текст тот же для всех, иначе сравнение нечестное.
const TEKST =
  process.env.PROBA_TEKST ||
  'Hasztagi nie dają zasięgu. Serio. Ale ich brak potrafi go zabrać. ' +
  'Sprawdziliśmy to na naszych rolkach i… no, wyszło dość głupio. ' +
  'Pokażę ci, co poszło nie tak.';
// Для v3: теги в квадратных скобках он понимает, остальные модели прочитали бы их вслух.
const TEKST_V3 =
  'Hasztagi nie dają zasięgu. [short pause] Serio. Ale ich brak potrafi go zabrać. ' +
  'Sprawdziliśmy to na naszych rolkach i… [laughs softly] no, wyszło dość głupio. ' +
  'Pokażę ci, co poszło nie tak.';
const PODANIE =
  process.env.PROBA_PODANIE ||
  'Mów jak zwykły chłopak, który opowiada coś znajomemu przy kawie: naturalnie i swobodnie, ' +
  'z lekkim uśmiechem w głosie, z oddechami i drobnymi zawahaniami. Nie jak lektor, nie jak reklama. ' +
  'Normalne tempo rozmowy, krótkie pauzy po zdaniach.';

const kandydaci = [];

async function wavDoMp3(bufor, plik) {
  const surowy = plik + '.wav';
  await writeFile(surowy, bufor);
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', surowy,
    '-c:a', 'libmp3lame', '-b:a', '192k', plik]);
}

// ── Google Cloud TTS: Chirp (то, что в ленте) и Gemini-TTS с подачей ──
let token = null;
async function tokenGoogle() {
  if (token) return token;
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
  const j = await r.json();
  if (!j.access_token) throw new Error('Google token: ' + JSON.stringify(j).slice(0, 200));
  return (token = j.access_token);
}

async function google({ opis, glos, model }) {
  const t = await tokenGoogle();
  const zPodaniem = Boolean(model);
  const body = {
    input: zPodaniem ? { text: TEKST, prompt: PODANIE } : { text: TEKST },
    voice: zPodaniem
      ? { languageCode: 'pl-PL', name: glos, modelName: model }
      : { languageCode: 'pl-PL', name: glos },
    audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000 },
  };
  const url = zPodaniem
    ? 'https://texttospeech.googleapis.com/v1beta1/text:synthesize'
    : 'https://texttospeech.googleapis.com/v1/text:synthesize';
  // Потолок запросов в минуту у Gemini-TTS маленький — ждём и повторяем.
  for (let proba = 0; proba < 5; proba++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + t,
        'x-goog-user-project': process.env.GCP_PROJECT || 'zovu-autopilot',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = await r.json();
      return Buffer.from(j.audioContent, 'base64');
    }
    const blad = `${r.status} ${(await r.text()).slice(0, 160)}`;
    if (r.status !== 429 && r.status < 500) throw new Error(blad);
    console.log(`[proby] ${opis}: ${blad} — жду 20 с`);
    await new Promise((s) => setTimeout(s, 20000));
  }
  throw new Error('лимит не отпустил');
}

// ── ElevenLabs: наш прежний Jan Gajos на v2 и на v3 ───────────────
async function eleven({ model }) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        model === 'eleven_v3'
          // v3 принимает stability только 0 / 0.5 / 1 (Creative / Natural / Robust).
          ? { text: TEKST_V3, model_id: model, voice_settings: { stability: 0.5 } }
          : {
              text: TEKST,
              model_id: model,
              voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true, speed: 0.97 },
            }
      ),
    }
  );
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  return { mp3: Buffer.from(await r.arrayBuffer()) };
}

const LISTA = [
  { opis: 'Chirp3-HD Puck bez podania (TO, CO TERAZ W LENCIE)', f: () => google({ glos: 'pl-PL-Chirp3-HD-Puck' }) },
  { opis: 'Gemini 2.5 Flash TTS — Puck, podanie rozmowa', f: () => google({ glos: 'Puck', model: 'gemini-2.5-flash-tts' }) },
  ...['Puck', 'Charon', 'Enceladus', 'Iapetus', 'Achird', 'Sadaltager'].map((g) => ({
    opis: `Gemini 2.5 Pro TTS — ${g}, podanie rozmowa`,
    f: () => google({ glos: g, model: 'gemini-2.5-pro-tts' }),
  })),
  { opis: 'ElevenLabs Jan Gajos — multilingual v2 (stary)', f: () => eleven({ model: 'eleven_multilingual_v2' }) },
  { opis: 'ElevenLabs Jan Gajos — v3 z tagami', f: () => eleven({ model: 'eleven_v3' }) },
];

await mkdir(OUT, { recursive: true });
// Номера перемешаны: первым в списке идёт нынешний голос, и по порядку его бы узнали.
const kolejnosc = LISTA.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const klucz = {};
let n = 0;
for (const k of kolejnosc) {
  try {
    const wynik = await k.f();
    n++;
    const plik = path.join(OUT, `${String(n).padStart(2, '0')}.mp3`);
    if (wynik.mp3) await writeFile(plik, wynik.mp3);
    else await wavDoMp3(wynik, plik);
    klucz[n] = k.opis;
    console.log(`[proby] ${n} ← ${k.opis}`);
  } catch (e) {
    console.log(`[proby] ПРОПУСК ${k.opis}: ${e.message}`);
  }
}
await writeFile(path.join(OUT, 'klucz.json'), JSON.stringify(klucz, null, 2));
console.log('[proby] готово:', n, 'проб');
