// Проверка и превью графических постов.
//   node posty-test.mjs                  — проверить тексты ВСЕГО банка и отрисовать все посты в out/podglad
//   node posty-test.mjs --tylko-tekst    — только проверка текстов (быстро, без браузера)
//   node posty-test.mjs --dir=D:\x id1 id2 — отрисовать выбранные посты в папку + PRZEGLAD.html
// Падает с кодом 1, если хоть один пост не проходит проверку или не влезает в кадр.
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { czytajBank, renderujPost } from './posty-design.mjs';
import { sprawdzPost, podpis } from './posty-redakcja.mjs';

const args = process.argv.slice(2);
const tylkoTekst = args.includes('--tylko-tekst');
const dirArg = args.find((a) => a.startsWith('--dir='));
const katalog = dirArg ? path.resolve(dirArg.slice(6)) : path.join(import.meta.dirname, 'out', 'podglad');
const ids = args.filter((a) => !a.startsWith('--'));

const bank = await czytajBank();
const lista = ids.length ? ids.map((id) => bank.posty.find((p) => p.id === id) || { id, typ: '?' }) : bank.posty;

let bledy = 0;
for (const p of lista) {
  const zle = sprawdzPost(p);
  if (zle.length) {
    bledy++;
    console.log(`✗ ${p.id}: ${zle.join('; ')}`);
  }
}
for (const id of bank.kolejnosc) if (!bank.posty.some((p) => p.id === id)) { bledy++; console.log(`✗ kolejnosc: brak ${id}`); }
console.log(`[posty] tekst: ${lista.length - bledy}/${lista.length} ok`);
if (tylkoTekst) process.exit(bledy ? 1 : 0);

await mkdir(katalog, { recursive: true });
const wyniki = [];
for (const [i, p] of lista.entries()) {
  try {
    const pliki = await renderujPost(p, { nazwa: `${String(i + 1).padStart(2, '0')}-${p.id}`, katalog });
    wyniki.push({ p, pliki });
    console.log(`✓ ${p.id}: ${pliki.length} slajd(ów)`);
  } catch (e) {
    bledy++;
    console.log(`✗ ${p.id}: ${e.message}`);
  }
}

// Контактный лист: каждый пост строкой, подпись под ним — как в ленте.
const TYPY = { teza: 'Teza', karuzela: 'Karuzela', case: 'Case study', kulisy: 'Kulisy' };
const rows = wyniki
  .map(({ p, pliki }) => {
    const imgs = pliki.map((f) => `<img src="${path.basename(f.png)}" loading="lazy" alt="">`).join('');
    const cap = podpis(p).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<section><div class="meta"><span class="typ">${TYPY[p.typ] || p.typ}</span><b>${p.id}</b>
      <span>${pliki.length} ${pliki.length === 1 ? 'obraz' : 'slajdów'} · CTA: ${p.cta}</span></div>
      <div class="strip">${imgs}</div><pre>${cap}</pre></section>`;
  })
  .join('\n');
await writeFile(
  path.join(katalog, 'PRZEGLAD.html'),
  `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Posty ZOVU nowy design</title>
<style>
:root{--paper:#F6F4EF;--ink:#111;--ink2:#55524C;--accent:#FF4A1C;--line:#E3DFD6}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--paper:#161513;--ink:#F3F1EC;--ink2:#A8A39A;--line:#2C2A26}}
:root[data-theme="dark"]{--paper:#161513;--ink:#F3F1EC;--ink2:#A8A39A;--line:#2C2A26}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
header{padding:32px 16px 8px;max-width:1400px;margin:auto}
h1{font-size:28px;margin:0}header p{color:var(--ink2);margin:6px 0 0}
section{max-width:1400px;margin:24px auto;padding:0 16px 24px;border-bottom:1px solid var(--line)}
.meta{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}
.typ{background:var(--accent);color:#111;font-weight:700;border-radius:99px;padding:2px 10px;font-size:13px}
.meta span{color:var(--ink2);font-size:14px}
.strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}
.strip img{height:420px;max-height:70vw;border-radius:8px;flex:none;box-shadow:0 1px 3px rgba(0,0,0,.15)}
pre{white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;color:var(--ink2);max-width:720px}
</style></head><body><header><h1>Posty ZOVU, nowy design (28.10.2026)</h1>
<p>Jasna baza, jeden akcent #FF4A1C, Inter Tight + Inter + Instrument Serif. Jeden post dziennie, ok. 18:30.</p></header>
${rows}</body></html>`,
  'utf8'
);
console.log(`[posty] podgląd: ${path.join(katalog, 'PRZEGLAD.html')}`);
if (bledy) {
  console.log(`[posty] BŁĘDY: ${bledy}`);
  process.exit(1);
}
