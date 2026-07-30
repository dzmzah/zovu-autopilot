// Что реально работает: собирает лайки и комментарии по постам
// и показывает, какие темы и форматы заходят, а какие нет.
//
// Запуск: node stats.mjs [ile_postow]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HISTORY = path.join(import.meta.dirname, 'stats.json');

async function token() {
  if (process.env.INSTAGRAM_TOKEN) return process.env.INSTAGRAM_TOKEN.trim();
  try {
    const store = await import('./token-store.mjs');
    const { token } = await store.loadInstagramToken();
    return token;
  } catch {
    const env = await readFile(path.join(import.meta.dirname, '.env'), 'utf8');
    return env.match(/^INSTAGRAM_TOKEN=(.+)$/m)?.[1]?.trim();
  }
}

const limit = Number(process.argv[2] || 25);
const t = await token();
if (!t) {
  console.log('nie ma tokenu');
  process.exit(1);
}

const r = await fetch(
  `https://graph.instagram.com/v23.0/me/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&limit=${limit}&access_token=${encodeURIComponent(t)}`
).then((x) => x.json());

if (r.error) {
  console.log('błąd:', JSON.stringify(r.error).slice(0, 200));
  process.exit(1);
}

const posts = (r.data || []).map((m) => ({
  id: m.id,
  type: m.media_type,
  date: (m.timestamp || '').slice(0, 10),
  likes: m.like_count ?? 0,
  comments: m.comments_count ?? 0,
  score: (m.like_count ?? 0) + (m.comments_count ?? 0) * 3, // комментарий весит больше
  hook: (m.caption || '').split('\n')[0].slice(0, 58),
  permalink: m.permalink,
}));

const avg = posts.length ? posts.reduce((s, p) => s + p.score, 0) / posts.length : 0;

console.log(`\nПОСТОВ: ${posts.length} · средний балл: ${avg.toFixed(1)}`);
console.log('(балл = лайки + комментарии×3)\n');

console.log('ЛУЧШИЕ:');
[...posts].sort((a, b) => b.score - a.score).slice(0, 5).forEach((p, i) => {
  console.log(` ${i + 1}. ${String(p.score).padStart(3)} · ${p.type === 'CAROUSEL_ALBUM' ? 'карусель' : 'пост    '} · ${p.date} · ${p.hook}`);
});

console.log('\nСЛАБЫЕ:');
[...posts].sort((a, b) => a.score - b.score).slice(0, 3).forEach((p, i) => {
  console.log(` ${i + 1}. ${String(p.score).padStart(3)} · ${p.type === 'CAROUSEL_ALBUM' ? 'карусель' : 'пост    '} · ${p.date} · ${p.hook}`);
});

// карусель против одиночного
const byType = {};
for (const p of posts) {
  const k = p.type === 'CAROUSEL_ALBUM' ? 'карусель' : 'обычный';
  (byType[k] ||= []).push(p.score);
}
console.log('\nПО ТИПУ:');
for (const [k, v] of Object.entries(byType)) {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  console.log(`  ${k.padEnd(9)} ${v.length} шт · средний ${m.toFixed(1)}`);
}

await writeFile(
  HISTORY,
  JSON.stringify({ checkedAt: new Date().toISOString(), avg, posts }, null, 1),
  'utf8'
);
console.log(`\nсохранено в ${HISTORY}`);
