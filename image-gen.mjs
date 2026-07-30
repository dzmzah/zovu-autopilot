// Генерация фонов под конкретный пост. Бесплатно, без ключей и карты:
// Pollinations (модель Flux). Если сервис недоступен — вызывающий код
// откатывается на библиотеку готовых фонов.
import { mkdir, writeFile } from 'node:fs/promises';
// writeFile используется для готового кадра, mkdir — для папки bg-gen
import path from 'node:path';
import sharp from 'sharp';

export const GEN_DIR = path.join(import.meta.dirname, 'bg-gen');

// Просим ЦЕНТРИРОВАННЫЙ объект на чёрном — так модель ошибается реже.
// Раскладку по кадру делаем сами, кодом: см. composeRight().
function wrap(scene) {
  return [
    `Hyper-detailed high-gloss 3D render of ${scene}.`,
    'Single centered product-style composition, floating objects, isolated on a plain black background.',
    'Rich violet and magenta lighting, strong specular highlights, iridescent glass materials,',
    'volumetric glow, dramatic contrast, soft long shadows.',
    'Cinematic, premium, vivid, uncluttered.',
    'No text, no letters, no numbers, no words, no logos, no watermarks, no user interface.',
  ].join(' ');
}

// Ставим сгенерированное в ПРАВУЮ часть кадра 1080x1350 и растворяем левый край.
// Так левая половина всегда остаётся чистой под заголовок — без надежды на модель.
async function composeRight(buf) {
  const W = 1080;
  const H = 1350;
  const artW = 720; // ширина области под объект
  const art = await sharp(buf).resize(artW, H, { fit: 'cover', position: 'centre' }).toBuffer();

  // маска: слева прозрачно, справа непрозрачно — мягкий переход в фон
  const fade = Buffer.from(
    `<svg width="${artW}" height="${H}">
       <defs><linearGradient id="g" x1="0" x2="1">
         <stop offset="0" stop-color="#fff" stop-opacity="0"/>
         <stop offset="0.42" stop-color="#fff" stop-opacity="0.85"/>
         <stop offset="0.7" stop-color="#fff" stop-opacity="1"/>
       </linearGradient></defs>
       <rect width="${artW}" height="${H}" fill="url(#g)"/>
     </svg>`
  );
  const masked = await sharp(art)
    .composite([{ input: fade, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 5, g: 5, b: 5, alpha: 1 } },
  })
    .composite([{ input: masked, left: W - artW, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function generateBackground(scene, { name, seed } = {}) {
  const prompt = wrap(scene);
  const s = seed ?? Math.floor(Math.random() * 1e6);
  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(prompt) +
    `?width=1080&height=1350&nologo=true&model=flux&seed=${s}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ZOVU-bot)' },
    });
    if (!r.ok) throw new Error('Pollinations ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 20000) throw new Error('картинка подозрительно мелкая');

    await mkdir(GEN_DIR, { recursive: true });
    const safe = (name || `gen-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
    const file = path.join(GEN_DIR, `${safe}.jpg`);
    await writeFile(file, await composeRight(buf));
    return { file, scene, seed: s };
  } finally {
    clearTimeout(timer);
  }
}

// Вертикальный кадр под рилс: 1080x1920, БЕЗ раскладки по сторонам.
// В видео объект живёт во весь экран, а текст читается за счёт затемняющей
// вуали в CSS — поэтому здесь картинку только слегка притемняем.
export async function generateVertical(scene, { name, seed } = {}) {
  const s = seed ?? Math.floor(Math.random() * 1e6);
  const url =
    'https://image.pollinations.ai/prompt/' +
    encodeURIComponent(wrap(scene)) +
    `?width=1080&height=1920&nologo=true&model=flux&seed=${s}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ZOVU-bot)' },
    });
    if (!r.ok) throw new Error('Pollinations ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 20000) throw new Error('картинка подозрительно мелкая');

    await mkdir(GEN_DIR, { recursive: true });
    const safe = (name || `v-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
    const file = path.join(GEN_DIR, `${safe}.jpg`);
    await sharp(buf)
      .resize(1080, 1920, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 0.88, saturation: 1.12 })
      .jpeg({ quality: 88 })
      .toFile(file);
    return { file, scene, seed: s };
  } finally {
    clearTimeout(timer);
  }
}

// Пачкой, по одному вертикальному кадру на сцену рилса.
// Строго по одному: на две и больше параллельных запросов Pollinations
// отвечает 429, и половина кадров теряется. Семь картинок — около пяти минут,
// это самая долгая часть прогона, но она внутри лимита задания.
export async function generateVerticals(scenes, baseName, { lanes = 1 } = {}) {
  const out = new Array(scenes.length).fill(null);
  let next = 0;

  async function worker(lane) {
    await new Promise((r) => setTimeout(r, lane * 6000)); // разводим старты
    for (;;) {
      const i = next++;
      if (i >= scenes.length) return;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const r = await generateVertical(scenes[i], { name: `${baseName}-v${i + 1}` });
          out[i] = r.file;
          break;
        } catch (e) {
          if (attempt === 2) {
            console.warn(`[bg-gen] kadr ${i + 1} nie wyszedł: ${e.message}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 15000));
        }
      }
    }
  }

  await Promise.all(Array.from({ length: lanes }, (_, l) => worker(l)));
  return out;
}

// Пачкой, по одному фону на пункт. Что не получилось — вернётся null,
// и вызывающий код подставит фон из библиотеки.
export async function generateForItems(items, baseName) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const scene = items[i].bgIdea || items[i].heading || 'abstract violet glass shapes';
    try {
      const r = await generateBackground(scene, { name: `${baseName}-${i + 1}` });
      out.push(r.file);
    } catch (e) {
      console.warn(`[bg-gen] punkt ${i + 1} nie wyszedł: ${e.message}`);
      out.push(null);
    }
  }
  return out;
}

// CLI: node image-gen.mjs "floating violet glass shopping bags"
if (process.argv[1] && process.argv[1].endsWith('image-gen.mjs')) {
  const scene = process.argv[2] || 'floating violet glass gears and a laptop';
  const r = await generateBackground(scene, { name: process.argv[3] || 'cli-test' });
  console.log(JSON.stringify(r, null, 1));
}
