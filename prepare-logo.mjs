// Готовит лого для встраивания в шаблоны: убирает белый фон в прозрачность.
// Исходник — фиолетовая капля на белом. Плавный переход по яркости, чтобы края не рвались.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';

const SRC = process.argv[2] || 'D:\\My AI\\Zovu.pl\\logo\\Logo Zovu white.png';
const OUT_B64 = path.join(import.meta.dirname, 'logo-white.b64');
const OUT_PNG = path.join(import.meta.dirname, 'logo-transparent.png');

const src = await readFile(SRC);

// 1) в сырые RGBA
const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// 2) белое → прозрачное. Плавный спад между 205 и 250 по минимальному каналу.
const LO = 205; // темнее — полностью непрозрачно
const HI = 250; // светлее — полностью прозрачно
for (let i = 0; i < data.length; i += 4) {
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  let a = 255;
  if (min >= HI) a = 0;
  else if (min > LO) a = Math.round(255 * (1 - (min - LO) / (HI - LO)));
  data[i + 3] = Math.min(data[i + 3], a);
}

// 3) обрезаем пустые поля и уменьшаем до размера для встраивания
const cleaned = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toBuffer();

const trimmed = await sharp(cleaned).trim({ threshold: 1 }).toBuffer();
const final = await sharp(trimmed)
  .resize({ height: 240, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toBuffer();

const meta = await sharp(final).metadata();
await writeFile(OUT_PNG, final);
await writeFile(OUT_B64, final.toString('base64'), 'utf8');

console.log(`${path.basename(SRC)} → ${meta.width}x${meta.height}, ${Math.round(final.length / 1024)}KB`);
console.log(`  ${OUT_PNG}`);
console.log(`  ${OUT_B64}`);
