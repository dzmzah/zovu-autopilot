// Пробы мужских голосов Gemini-TTS на НАШЕМ куске текста.
//
// Зачем короткий кусок, а не весь ролик: голос выбирается по первым секундам,
// а полный дубль на каждом голосе — это восемь лишних минут ожидания и восемь
// раз по семьсот знаков. Выбранный голос потом читает ролик целиком.
//
// Подача — та же строка, что в боевом синтезе, иначе сравнение нечестное:
// половина впечатления от голоса создаётся именно инструкцией.
//
//   node glosy-gemini-proby.mjs --glosy=Enceladus,Iapetus,...
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FRAZY } from './nootri-frazy.mjs';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=').pop();
const WYJ = path.join(import.meta.dirname, 'out', 'proby-gemini');

// Первые четыре фразы: хук и завязка. Ровно то, по чему зритель решает,
// слушать дальше или смахнуть.
const TEKST = FRAZY.slice(0, 4).map((f) => (f.mowa || f.tekst).trim()).join(' ');
const PODANIE =
  'Mów cicho i szczerze, jakbyś opowiadał to jednej osobie późnym wieczorem. ' +
  'Bez patosu i bez aktorstwa, naturalne oddechy, miejscami zawahanie.';

const GLOSY = arg('glosy', 'Enceladus,Iapetus,Umbriel,Rasalgethi,Schedar,Gacrux,Achird,Sadaltager')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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

await mkdir(WYJ, { recursive: true });
const t = await token();
console.log(`[proby] ${GLOSY.length} голосов, ${TEKST.length} знаков на каждый`);

for (const glos of GLOSY) {
  let ok = false;
  for (let i = 0; i < 5 && !ok; i++) {
    const r = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${t}`,
        'x-goog-user-project': process.env.GCP_PROJECT || 'zovu-autopilot',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: TEKST, prompt: PODANIE },
        voice: { languageCode: 'pl-PL', name: glos, modelName: 'gemini-2.5-flash-tts' },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000 },
      }),
    });
    if (r.status === 429) {
      console.warn(`[proby] ${glos}: 429, жду 20 с`);
      await new Promise((x) => setTimeout(x, 20000));
      continue;
    }
    if (!r.ok) {
      console.log(`[proby] ${glos}: ${r.status} ${(await r.text()).slice(0, 120)}`);
      break;
    }
    const j = await r.json();
    await writeFile(path.join(WYJ, `${glos}.wav`), Buffer.from(j.audioContent, 'base64'));
    console.log(`[proby] ${glos}.wav`);
    ok = true;
  }
}
console.log('[proby] готово');
