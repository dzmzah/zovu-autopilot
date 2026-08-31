// Пробы дикторов: синтезирует ОДНУ И ТУ ЖЕ фразу всеми доступными голосами,
// чтобы выбор делался на слух, а не по описанию.
//
// Запускается на сервере (`.github/workflows/proby-glosu.yml`), потому что
// ключи живут в секретах GitHub, а не на машине. Локально ключей нет, и
// именно поэтому сборка там молча съезжала на робота Piper.
//
//   node proby-glosu.mjs            — Gemini + ElevenLabs
//   node proby-glosu.mjs --gemini   — только Gemini (не тратит квоту ElevenLabs)
//
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const OUT = path.join(import.meta.dirname, 'out', 'proby-glosu');

// Фразу и подачу можно задать снаружи: голос выбирается под КОНКРЕТНЫЙ ролик,
// а не вообще. Дикторский тон, годный для рилса студии, не годится для
// исповеди героя — это и есть причина, по которой пробу гоняем заново.
const TEKST =
  process.env.PROBA_TEKST ||
  'Dziesięć postów w jeden dzień. Potem cisza na miesiąc. Ludzie zapamiętują rytm.';
// Подача словами — то, чего не умеют ни Piper, ни XTTS. Именно она отвечает
// за «поставленность»: паузы, нажим на ключевых словах, отсутствие речитатива.
const PODANIE =
  process.env.PROBA_PODANIE ||
  'Przeczytaj jak doświadczony lektor radiowy: pewnie, ciepło, niespiesznie, ' +
  'z wyraźnymi pauzami między zdaniami i naciskiem na słowa kluczowe. Nie recytuj.';

const tylkoGemini = process.argv.includes('--gemini');

async function pcmDoMp3(b64, plik, czestotliwosc = 24000) {
  const surowy = plik + '.pcm';
  await writeFile(surowy, Buffer.from(b64, 'base64'));
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', String(czestotliwosc), '-ac', '1', '-i', surowy,
    '-c:a', 'libmp3lame', '-b:a', '192k', plik]);
}

// ── Gemini: 30 готовых голосов, подача задаётся текстом ───────────
async function gemini() {
  const klucz = process.env.GEMINI_API_KEY;
  if (!klucz) return console.log('[proby] нет GEMINI_API_KEY — пропускаю Gemini');
  const GLOSY = [
    'Charon', 'Puck', 'Algieba', 'Fenrir', 'Orus', 'Iapetus',
    // Добавлены под ролики с историей от первого лица: там нужен не диктор,
    // а человек, который рассказывает про себя. Тембры ниже и суше.
    'Enceladus', 'Umbriel', 'Rasalgethi', 'Alnilam',
  ];
  for (const glos of GLOSY) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${klucz}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${PODANIE}\n\n${TEKST}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: glos } } },
          },
        }),
      }
    );
    if (!r.ok) { console.log(`[proby] Gemini ${glos}: ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
    const j = await r.json();
    const b64 = j.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) { console.log(`[proby] Gemini ${glos}: пустой ответ`); continue; }
    await pcmDoMp3(b64, path.join(OUT, `GEMINI-${glos}.mp3`));
    console.log(`[proby] GEMINI-${glos}.mp3`);
  }
}

// ── ElevenLabs: наш нынешний голос плюс польские из библиотеки ────
async function eleven() {
  const klucz = process.env.ELEVENLABS_KEY;
  if (!klucz) return console.log('[proby] нет ELEVENLABS_KEY — пропускаю ElevenLabs');

  const glosy = [];
  if (process.env.ELEVENLABS_VOICE) {
    glosy.push({ id: process.env.ELEVENLABS_VOICE, nazwa: 'NASZ-OBECNY' });
  }
  // Библиотека: берём мужские польские голоса, помеченные как дикторские.
  try {
    const r = await fetch(
      'https://api.elevenlabs.io/v1/shared-voices?page_size=8&language=pl&gender=male',
      { headers: { 'xi-api-key': klucz } }
    );
    if (r.ok) {
      const j = await r.json();
      for (const g of (j.voices || []).slice(0, 5)) {
        glosy.push({ id: g.voice_id, nazwa: (g.name || g.voice_id).replace(/[^\w-]/g, '') });
      }
    } else {
      console.log(`[proby] библиотека ElevenLabs: ${r.status}`);
    }
  } catch (e) {
    console.log('[proby] библиотека ElevenLabs недоступна:', e.message);
  }

  for (const g of glosy) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${g.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': klucz, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEKST,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true, speed: 0.97 },
      }),
    });
    if (!r.ok) { console.log(`[proby] EL ${g.nazwa}: ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
    await writeFile(path.join(OUT, `EL-${g.nazwa}.mp3`), Buffer.from(await r.arrayBuffer()));
    console.log(`[proby] EL-${g.nazwa}.mp3`);
  }
}

await mkdir(OUT, { recursive: true });
await gemini();
if (!tylkoGemini) await eleven();
console.log('[proby] готово:', OUT);
