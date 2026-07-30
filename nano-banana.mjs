// Генерация фоновых картинок через Nano Banana (Gemini 2.5 Flash Image).
// Бесплатный тир: ~500 картинок в сутки, ~2 в минуту. Ключ — в .env: GEMINI_API_KEY=...
//
// Важно: модель НЕ просим писать текст. Текст, лого и рамку накладывает render.mjs —
// генераторы картинок ломают польскую диакритику, поэтому буквы делаем вёрсткой.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ENV_FILE = path.join(import.meta.dirname, '.env');
export const BG_DIR = path.join(import.meta.dirname, 'bg');
const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function apiKey() {
  const raw = await readFile(ENV_FILE, 'utf8');
  const m = raw.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error('в .env нет строки GEMINI_API_KEY=... (взять на aistudio.google.com/apikey)');
  const k = m[1].trim();
  if (!k || /^(твой|your|WKLEJ)/i.test(k)) throw new Error('в .env лежит заглушка вместо ключа Gemini');
  return k;
}

// Фирменный «скелет» промпта: стиль ленты ZOVU — глянцевые 3D-объекты,
// тёмный фон, фиолетовый свет, место под текст слева.
export function bgPrompt(subject, opts = {}) {
  const room = opts.textSide === 'right' ? 'left' : 'right';
  return [
    `Photorealistic glossy 3D render of ${subject}.`,
    'Floating objects arranged as a clean product-style composition,',
    `positioned in the ${room} portion of the frame.`,
    'Deep near-black background (#050505) with soft violet and purple studio lighting,',
    'subtle rim light, gentle reflections, soft long shadows, slight depth of field.',
    'Cinematic, premium, minimal, uncluttered.',
    'ABSOLUTELY NO text, NO letters, NO numbers, NO words, NO logos, NO watermarks, NO UI.',
    'Vertical composition, aspect ratio 4:5.',
    `Leave the ${opts.textSide === 'right' ? 'right' : 'left'} side visually calm and empty for typography.`,
  ].join(' ');
}

// Возвращает { file, name } — готовый JPEG 1080x1350 в папке bg/
export async function generateBackground(subject, { name, textSide = 'left' } = {}) {
  const key = await apiKey();
  const prompt = bgPrompt(subject, { textSide });

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    throw new Error('модель не вернула картинку: ' + JSON.stringify(data).slice(0, 400));
  }

  await mkdir(BG_DIR, { recursive: true });
  const base = (name || `bg-${process.hrtime.bigint().toString(36)}`).replace(/[^a-zA-Z0-9._-]/g, '-');
  const file = path.join(BG_DIR, `${base}.jpg`);

  // приводим к нашему формату 1080x1350
  await sharp(Buffer.from(img.inlineData.data, 'base64'))
    .resize(1080, 1350, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 90 })
    .toFile(file);

  return { file, name: `${base}.jpg`, prompt };
}

// CLI: node nano-banana.mjs "a laptop with glowing code, stack of banknotes" [имя] [left|right]
if (process.argv[1] && process.argv[1].endsWith('nano-banana.mjs')) {
  const subject = process.argv[2];
  if (!subject) {
    console.log('использование: node nano-banana.mjs "<что на картинке>" [имя] [left|right]');
    process.exit(1);
  }
  const out = await generateBackground(subject, {
    name: process.argv[3],
    textSide: process.argv[4] === 'right' ? 'right' : 'left',
  });
  console.log(JSON.stringify({ file: out.file, name: out.name }, null, 1));
}
