import { readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BG_DIR, renderCarousel } from './render.mjs';

console.log('BG_DIR:', BG_DIR);
const files = await readdir(BG_DIR);
console.log('files:', files);

for (const f of files) {
  if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
  const tag = f.replace(/\.[^.]+$/, '').replace(/[-_]?\d+$/, '').toLowerCase();
  const full = path.join(BG_DIR, f);
  try {
    const m = await sharp(full).metadata();
    console.log(`  ${f} -> tag "${tag}" | sharp OK ${m.width}x${m.height}`);
  } catch (e) {
    console.log(`  ${f} -> tag "${tag}" | sharp ERR ${e.message.slice(0, 120)}`);
  }
}

const out = await renderCarousel({
  name: 'diag2',
  title: 'Test',
  subtitle: 'Test',
  items: [{ heading: 'Punkt jeden', text: 'Tekst punktu' }],
  bg: 'automatyzacja',
});
console.log('слайдов:', out.length, out.map((o) => o.name).join(', '));
