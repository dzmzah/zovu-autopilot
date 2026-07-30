// Забирает свежескачанный файл из Downloads и кладёт в библиотеку фонов.
// node import-bg.mjs <имя-без-расширения>   например: node import-bg.mjs social-1
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BG_DIR } from './render.mjs';

const name = process.argv[2];
if (!name) {
  console.log('использование: node import-bg.mjs <имя>   (например social-1)');
  process.exit(1);
}

const DOWNLOADS = path.join(process.env.USERPROFILE || 'C:\\Users\\zahar', 'Downloads');
const files = await readdir(DOWNLOADS);

let newest = null;
for (const f of files) {
  const full = path.join(DOWNLOADS, f);
  const st = await stat(full).catch(() => null);
  if (!st || !st.isFile()) continue;
  // свежий (последние 10 минут) и достаточно крупный, чтобы быть картинкой
  if (Date.now() - st.mtimeMs > 10 * 60 * 1000 || st.size < 150 * 1024) continue;
  if (!newest || st.mtimeMs > newest.mtime) newest = { full, mtime: st.mtimeMs, size: st.size };
}

if (!newest) {
  console.log('свежих файлов в Downloads не найдено');
  process.exit(1);
}

const dest = path.join(BG_DIR, `${name}.jpg`);
const meta = await sharp(newest.full).metadata();
await sharp(newest.full).resize(1080, 1350, { fit: 'cover' }).jpeg({ quality: 90 }).toFile(dest);
await unlink(newest.full).catch(() => {});

console.log(`${path.basename(newest.full)} (${meta.width}x${meta.height}) → ${dest}`);
