// Новый дизайн графических постов ZOVU (28.10.2026).
//
// Почему переделано: Митя и Захар (28.10) — старые посты «ИИ-фиолетовые»,
// тёмные, с чужими стоковыми кадрами и общими советами. Охват 2–35.
// Решение: светлая база, один сильный акцент, крупная редакционная типографика,
// настоящие кадры нашей работы вместо градиентов и стока.
//
// Палитра (одна на всё, токены ниже):
//   paper  #F6F4EF  тёплый белый — основной фон
//   white  #FFFFFF  карточки и слайды пунктов
//   ink    #111111  почти чёрный — весь текст
//   ink2   #55524C  второстепенный текст
//   line   #E3DFD6  линии
//   accent #FF4A1C  сигнальный оранжево-красный — ОДИН акцент. Большие цифры,
//                   выделенные слова, финальный слайд. Мелкий текст акцентом
//                   не набираем (контраст на белом ~3,3:1 — только крупный кегль).
// Шрифты (Google Fonts, латиница + польская диакритика):
//   Inter Tight 800/900 — заголовки, Inter 400/500/600 — текст,
//   Instrument Serif italic — 1–2 выделенных слова в заголовке (*так*).
//
// Макеты (1080×1350):
//   teza     — одна сильная мысль + «zrób dziś» (одиночный пост)
//   karuzela — обложка + 3–5 слайдов «jak/dlaczego» + финальный CTA
//   case     — klient → zadanie → efekt (карусель из 4 слайдов), без денег
//   kulisy   — настоящий скрин/кадр нашей работы с подписью (одиночный)
//
// Защита от обрезанного текста: каждый текстовый блок с классом .fit
// уменьшается в браузере, пока не влезет в свой max-height; если и на
// минимальном кегле не влез — рендер падает, а не публикует обрезок.
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const OUT_DIR = process.env.ZOVU_READY_DIR || path.join(import.meta.dirname, 'out');
const FOTO_DIR = path.join(import.meta.dirname, 'posty-foto');
const W = 1080;
const H = 1350;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// *słowo* → курсив Instrument Serif акцентным цветом. Всё остальное экранируется.
function rich(s) {
  return esc(s)
    .replace(/&lt;(\/?)b&gt;/g, '<$1b>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

const fotoCache = new Map();
// Кадр под слот w×h. ref — имя файла в posty-foto/ или объект из банка:
//   { plik, fokus:[x,y], crop:[x,y,w,h], fit:'cover'|'contain', tlo:'auto'|'#hex' }
//   fokus — точка интереса (доли 0..1): кроп идёт вокруг неё, а не по центру;
//   crop  — сначала вырезать прямоугольник (доли), например убрать чужую плашку;
//   fit 'contain' — объект целиком на подложке (цвет края кадра или tlo), когда
//   продукт/люди не помещаются в пропорцию слота без обрезки; tlo 'kopia' —
//   продлить краевые пиксели (для студийного однотонного фона).
// Правило (Mat, 29.10): товар, лица, животные и сам бой — целиком в кадре.
async function foto(ref, w, h, domyslnyFokus = [0.5, 0.5]) {
  if (!ref) return null;
  const spec = typeof ref === 'string' ? { plik: ref } : ref;
  const file = path.isAbsolute(spec.plik) ? spec.plik : path.join(FOTO_DIR, spec.plik);
  const key = JSON.stringify([file, w, h, spec, domyslnyFokus]);
  if (fotoCache.has(key)) return fotoCache.get(key);
  const S = 2; // рендерим с запасом под чёткость
  const W2 = Math.min(w * S, 2000);
  const H2 = Math.round((W2 * h) / w);
  let img = sharp(file).rotate();
  let { width: iw, height: ih } = await img.metadata();
  if (spec.crop) {
    const [cx, cy, cw, ch] = spec.crop;
    const left = Math.round(cx * iw);
    const top = Math.round(cy * ih);
    const ex = { left, top, width: Math.min(iw - left, Math.round(cw * iw)), height: Math.min(ih - top, Math.round(ch * ih)) };
    img = sharp(await img.extract(ex).toBuffer());
    iw = ex.width;
    ih = ex.height;
  }
  let buf;
  if (spec.fit === 'contain') {
    let tlo = spec.tlo && spec.tlo !== 'auto' && spec.tlo !== 'kopia' ? spec.tlo : null;
    if (!tlo && spec.tlo !== 'kopia') {
      // цвет подложки = средний цвет левой полосы кадра: шов не виден
      const pas = await img.clone().extract({ left: 0, top: 0, width: Math.max(1, Math.round(iw * 0.03)), height: ih }).stats();
      const [r, g, b] = pas.channels.map((c) => Math.round(c.mean));
      tlo = { r, g, b };
    }
    if (spec.tlo === 'kopia') {
      // студийный фон: продлеваем краевые пиксели, шва не видно
      const sc = Math.min(W2 / iw, H2 / ih);
      const rw = Math.round(iw * sc);
      const rh = Math.round(ih * sc);
      const l = Math.floor((W2 - rw) / 2);
      const t = Math.floor((H2 - rh) / 2);
      buf = await sharp(await img.resize(rw, rh).toBuffer())
        .extend({ left: l, right: W2 - rw - l, top: t, bottom: H2 - rh - t, extendWith: 'copy' })
        .jpeg({ quality: 88 })
        .toBuffer();
    } else {
      buf = await img.resize(W2, H2, { fit: 'contain', background: tlo }).jpeg({ quality: 88 }).toBuffer();
    }
  } else {
    const [fx, fy] = spec.fokus || domyslnyFokus;
    const sc = Math.max(W2 / iw, H2 / ih);
    const rw = Math.round(iw * sc);
    const rh = Math.round(ih * sc);
    const left = Math.min(Math.max(0, Math.round(fx * rw - W2 / 2)), rw - W2);
    const top = Math.min(Math.max(0, Math.round(fy * rh - H2 / 2)), rh - H2);
    buf = await img.resize(rw, rh).extract({ left, top, width: W2, height: H2 }).jpeg({ quality: 88 }).toBuffer();
  }
  const uri = 'data:image/jpeg;base64,' + buf.toString('base64');
  fotoCache.set(key, uri);
  return uri;
}

function head() {
  return `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@700;800;900&family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@1&display=block" rel="stylesheet">`;
}

function css() {
  return `
  :root { --paper:#F6F4EF; --white:#FFFFFF; --ink:#111111; --ink2:#55524C; --line:#E3DFD6;
    --accent:#FF4A1C; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; }
  body { background:var(--paper); color:var(--ink); overflow:hidden; position:relative;
    font-family:'Inter', sans-serif; -webkit-font-smoothing:antialiased; }
  body.white { background:var(--white); }
  .page { position:absolute; inset:0; padding:76px 84px 72px; display:flex; flex-direction:column; }
  /* шапка: вордмарк слева, рубрика справа */
  .top { display:flex; align-items:center; justify-content:space-between; height:44px; flex:none; }
  .wm { font-family:'Inter Tight'; font-weight:900; font-size:34px; letter-spacing:-.02em; display:flex;
    align-items:center; gap:12px; }
  .wm i { width:16px; height:16px; background:var(--accent); border-radius:4px; display:block; }
  .rub { font-size:22px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--ink2); }
  /* подвал */
  .bot { margin-top:auto; display:flex; align-items:center; justify-content:space-between; flex:none;
    padding-top:26px; border-top:2px solid var(--ink); font-size:24px; font-weight:500; color:var(--ink); }
  .bot b { font-weight:700; }
  h1, .h { font-family:'Inter Tight'; font-weight:800; letter-spacing:-.035em; line-height:1.02; color:var(--ink); }
  h1 em, .h em { font-family:'Instrument Serif'; font-style:italic; font-weight:400; color:var(--accent);
    letter-spacing:-.01em; padding-right:.04em; }
  .lead { font-size:36px; line-height:1.38; color:var(--ink2); font-weight:400; }
  .lead b { color:var(--ink); font-weight:600; }
  .fit { overflow:hidden; }
  .pill { display:inline-flex; align-items:center; gap:14px; background:var(--ink); color:#fff;
    border-radius:999px; padding:18px 30px; font-size:26px; font-weight:600; align-self:flex-start; }
  .pill.acc { background:var(--accent); color:var(--ink); }
  .tag { display:inline-flex; align-items:center; gap:12px; font-size:22px; font-weight:700;
    letter-spacing:.14em; text-transform:uppercase; color:var(--ink); }
  .tag::before { content:''; width:14px; height:14px; background:var(--accent); border-radius:3px; }
  .foto { border-radius:28px; overflow:hidden; background:transparent; flex:none; }
  .foto img { width:100%; height:100%; object-fit:cover; display:block; }
  `;
}

function top(rubryka) {
  return `<div class="top"><div class="wm"><i></i>ZOVU</div><div class="rub">${esc(rubryka || '')}</div></div>`;
}

function bot(lewa = '@zovu.pl', prawa = 'zovu.pl · Warszawa') {
  return `<div class="bot"><span><b>${esc(lewa)}</b></span><span>${esc(prawa)}</span></div>`;
}

function doc(body, extraCss = '', klasa = '') {
  return `<!doctype html><html><head>${head()}<style>${css()}${extraCss}</style></head>
<body class="${klasa}">${body}</body></html>`;
}

// ── TEZA: одна мысль ─────────────────────────────────────────────
function tezaHtml(p) {
  return doc(
    `<div class="page">
      ${top(p.rubryka)}
      <div class="tag" style="margin-top:64px">${esc(p.etykieta || 'Teza')}</div>
      <h1 class="fit" data-min="84" style="font-size:124px; margin-top:30px; max-height:520px">${rich(p.tytul)}</h1>
      <div class="lead fit" data-min="28" style="margin-top:36px; margin-bottom:44px; max-height:200px">${rich(p.tekst)}</div>
      <div class="zrob">
        <div class="zl">Zrób dziś</div>
        <div class="zt fit" data-min="26" style="max-height:130px">${rich(p.zrob)}</div>
      </div>
      ${bot('@zovu.pl', p.cta === 'ROLKA' ? 'Napisz ROLKA w wiadomości' : 'Zapisz, przyda się')}
    </div>`,
    `.zrob { margin-top:auto; margin-bottom:40px; flex:none; background:var(--white); border-radius:24px;
       padding:30px 36px; border-left:12px solid var(--accent); }
     .zl { font-size:22px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--ink2); }
     .zt { margin-top:10px; font-size:34px; line-height:1.3; font-weight:600; }
     .bot { margin-top:0; }`
  );
}

// ── KARUZELA: обложка ────────────────────────────────────────────
async function okladkaHtml(p, ile) {
  const o = p.okladka;
  const img = o.foto ? await foto(o.foto, 912, 470) : null;
  return doc(
    `<div class="page">
      ${top(p.rubryka)}
      ${o.liczba ? `<div class="num">${esc(o.liczba)}</div>` : ''}
      <h1 class="fit" data-min="80" style="font-size:${img ? 112 : 136}px; margin-top:${o.liczba ? 8 : 70}px;
        max-height:${img ? 380 : 620}px">${rich(o.tytul)}</h1>
      ${o.podtytul ? `<div class="lead fit" data-min="26" style="margin-top:28px; max-height:${img ? 110 : 160}px">${rich(o.podtytul)}</div>` : ''}
      ${img ? `<div class="foto" style="height:470px; margin-top:auto; margin-bottom:34px"><img src="${img}"></div>` : ''}
      <div class="row" style="${img ? '' : 'margin-top:auto;'}">
        <div class="pill">Przesuń <span style="font-size:30px">→</span></div>
        <div class="cnt">${ile} slajdów</div>
      </div>
    </div>`,
    `.num { font-family:'Inter Tight'; font-weight:900; font-size:220px; line-height:.86; color:var(--accent);
       letter-spacing:-.05em; margin-top:56px; }
     .row { display:flex; align-items:center; justify-content:space-between; flex:none; }
     .cnt { font-size:24px; font-weight:600; color:var(--ink2); }`
  );
}

// ── KARUZELA: слайд-пункт ─────────────────────────────────────────
function punktHtml(p, pt, i, n, ile) {
  const kreski = Array.from({ length: n }, (_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('');
  return doc(
    `<div class="page">
      ${top(p.rubryka)}
      <div class="prog">${kreski}</div>
      <div class="nr">${String(i + 1).padStart(2, '0')}</div>
      <div class="h fit" data-min="52" style="font-size:88px; margin-top:18px; max-height:370px">${rich(pt.naglowek)}</div>
      <div class="lead fit" data-min="26" style="margin-top:30px; font-size:38px; max-height:${pt.przyklad ? 220 : 420}px">${rich(pt.tekst)}</div>
      ${
        pt.przyklad
          ? `<div class="ex"><div class="exl">${esc(pt.przykladEtykieta || 'Przykład')}</div>
             <div class="ext fit" data-min="24" style="max-height:200px">${rich(pt.przyklad)}</div></div>`
          : ''
      }
      ${bot('@zovu.pl', `${i + 2} / ${ile}`)}
    </div>`,
    `.prog { display:flex; gap:8px; margin-top:44px; }
     .prog span { flex:1; height:6px; border-radius:3px; background:var(--line); }
     .prog span.on { background:var(--ink); }
     .nr { font-family:'Inter Tight'; font-weight:900; font-size:190px; line-height:.9; letter-spacing:-.05em;
       color:var(--accent); margin-top:48px; }
     .ex { margin-top:56px; background:var(--paper); border-radius:24px; padding:30px 36px; border-left:10px solid var(--accent); }
     .exl { font-size:21px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--ink2); }
     .ext { margin-top:12px; font-size:38px; line-height:1.3; font-weight:600; color:var(--ink); }`,
    'white'
  );
}

// ── финальный слайд: одно действие ───────────────────────────────
function ctaHtml(p, ile) {
  const rolka = p.cta === 'ROLKA';
  const tytul = p.ctaTytul || (rolka ? 'Chcesz to *u siebie*?' : 'Zapisz, *wrócisz* do tego');
  const linia =
    p.ctaLinia ||
    (rolka
      ? 'Zrobimy próbną rolkę dla Twojej firmy. Bez zobowiązań.'
      : 'Przyda się, kiedy usiądziesz do kolejnego posta.');
  return doc(
    `<div class="page">
      <div class="top"><div class="wm"><i style="background:var(--ink)"></i>ZOVU</div>
        <div class="rub" style="color:var(--ink)">${ile} / ${ile}</div></div>
      <h1 class="fit" data-min="80" style="font-size:132px; margin-top:150px; max-height:480px">${rich(tytul)}</h1>
      <div class="lead fit" data-min="28" style="margin-top:36px; color:var(--ink); max-height:160px">${rich(linia)}</div>
      <div class="akcja">${
        rolka
          ? 'Napisz <b>ROLKA</b> w wiadomości'
          : '<svg width="34" height="40" viewBox="0 0 24 28"><path d="M3 2h18v24l-9-6-9 6z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg> Zapisz post'
      }</div>
      <div class="bot" style="border-color:var(--ink)"><span><b>@zovu.pl</b></span>
        <span>Social media · Reklama · Treści · Strony · Automatyzacja</span></div>
    </div>`,
    `body { background:var(--accent); }
     h1 em { color:#fff; }
     .akcja { margin-top:auto; margin-bottom:44px; align-self:flex-start; display:flex; align-items:center; gap:18px;
       background:var(--ink); color:#fff; border-radius:999px; padding:30px 46px; font-size:44px; font-weight:600;
       font-family:'Inter Tight'; letter-spacing:-.01em; }
     .akcja b { font-weight:900; color:var(--accent); letter-spacing:.02em; }
     .bot { font-size:21px; }`
  );
}

// ── CASE: карточка клиента ───────────────────────────────────────
async function caseKartaHtml(p, ile) {
  const img = await foto(p.foto, 912, 500);
  return doc(
    `<div class="page">
      ${top('Case study')}
      <div class="foto" style="height:500px; margin-top:40px"><img src="${img}"></div>
      <div class="kl">
        <div class="h fit" data-min="48" style="font-size:72px; max-height:80px">${esc(p.klient)}</div>
        <div class="br">${esc(p.branza)}</div>
      </div>
      <div class="grid">
        <div class="lab">Zadanie</div><div class="val fit" data-min="24" style="max-height:96px">${rich(p.zadanie)}</div>
        <div class="lab">Efekt</div>
        <div><div class="big fit" data-min="52" style="max-height:92px">${rich(p.efekt.liczba)}</div>
          <div class="val fit" data-min="22" style="max-height:86px; margin-top:6px">${rich(p.efekt.opis)}</div></div>
      </div>
      <div class="row"><div class="pill">Co zrobiliśmy <span style="font-size:30px">→</span></div>
        <div class="cnt">1 / ${ile}</div></div>
    </div>`,
    `.kl { margin-top:34px; display:flex; align-items:baseline; gap:22px; flex-wrap:wrap; }
     .br { font-size:26px; color:var(--ink2); font-weight:500; }
     .grid { margin-top:26px; display:grid; grid-template-columns:190px 1fr; column-gap:24px; row-gap:22px;
       border-top:2px solid var(--ink); padding-top:24px; }
     .lab { font-size:21px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--ink2);
       padding-top:8px; }
     .val { font-size:30px; line-height:1.32; font-weight:500; }
     .big { font-family:'Inter Tight'; font-weight:900; font-size:78px; line-height:1; letter-spacing:-.04em;
       color:var(--accent); }
     .big em { font-family:'Inter Tight'; font-style:normal; color:var(--ink); }
     .row { margin-top:auto; display:flex; align-items:center; justify-content:space-between; }
     .cnt { font-size:24px; font-weight:600; color:var(--ink2); }`
  );
}

function caseListaHtml(p, ile) {
  const li = p.zrobilismy.map((t, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><div>${rich(t)}</div></li>`).join('');
  return doc(
    `<div class="page">
      ${top(p.klient)}
      <div class="h" style="font-size:96px; margin-top:80px">Co <em>zrobiliśmy</em></div>
      <ul class="fit" data-min="24" style="max-height:800px; font-size:38px">${li}</ul>
      ${bot('@zovu.pl', `2 / ${ile}`)}
    </div>`,
    `ul { list-style:none; margin-top:50px; display:flex; flex-direction:column; }
     li { display:flex; gap:28px; padding:22px 0; border-top:2px solid var(--line); line-height:1.3; font-weight:500; }
     li:first-child { border-top:2px solid var(--ink); }
     li span { font-family:'Inter Tight'; font-weight:900; color:var(--accent); min-width:58px; }`,
    'white'
  );
}

function caseWniosekHtml(p, ile) {
  return doc(
    `<div class="page">
      ${top(p.klient)}
      <div class="tag" style="margin-top:96px">Wniosek dla Twojej firmy</div>
      <h1 class="fit" data-min="64" style="font-size:100px; margin-top:34px; max-height:560px">${rich(p.wniosek.tytul)}</h1>
      <div class="lead fit" data-min="26" style="margin-top:36px; max-height:300px">${rich(p.wniosek.tekst)}</div>
      ${bot('@zovu.pl', `3 / ${ile}`)}
    </div>`
  );
}

// ── KULISY: настоящий скрин/кадр ─────────────────────────────────
async function kulisyHtml(p) {
  const tel = p.ekran === 'telefon';
  const img = tel ? await foto(p.screen, 412, 732, [0.5, 0]) : await foto(p.screen, 912, 640);
  const obraz = tel
    ? `<div class="tel"><img src="${img}"></div>`
    : `<div class="foto" style="height:640px; margin-top:40px"><img src="${img}"></div>`;
  const kroki = (p.kroki || [])
    .map((k, i) => `<div class="kr"><span>${i + 1}</span><div>${rich(k)}</div></div>`)
    .join('');
  return doc(
    `<div class="page">
      ${top('Kulisy')}
      <h1 class="fit" data-min="56" style="font-size:${tel ? 84 : 88}px; margin-top:56px; max-height:${tel ? 280 : 270}px">${rich(p.tytul)}</h1>
      ${
        tel
          ? `<div class="split">${obraz}<div class="side fit" data-min="22" style="max-height:760px">${kroki}</div></div>`
          : `${obraz}<div class="lead fit" data-min="24" style="margin-top:30px; font-size:32px; max-height:150px">${rich(p.podpis)}</div>`
      }
      ${bot('@zovu.pl', p.cta === 'ROLKA' ? 'Napisz ROLKA w wiadomości' : 'Zapisz, przyda się')}
    </div>`,
    `.split { display:flex; gap:44px; margin-top:44px; align-items:flex-start; }
     .tel { width:440px; height:760px; flex:none; border-radius:56px; border:14px solid var(--ink); overflow:hidden;
       background:#000; box-shadow:0 30px 60px rgba(17,17,17,.18); }
     .tel img { width:100%; height:100%; object-fit:cover; object-position:top; display:block; }
     .side { display:flex; flex-direction:column; gap:30px; padding-top:20px; font-size:31px; }
     .kr { display:flex; gap:18px; line-height:1.3; font-weight:500; }
     .kr span { flex:none; width:52px; height:52px; border-radius:50%; background:var(--accent); color:var(--ink);
       font-family:'Inter Tight'; font-weight:900; font-size:28px; display:flex; align-items:center; justify-content:center; }`
  );
}

// ── сборка страниц поста ─────────────────────────────────────────
export async function stronyPostu(p) {
  if (p.typ === 'teza') return [tezaHtml(p)];
  if (p.typ === 'kulisy') return [await kulisyHtml(p)];
  if (p.typ === 'karuzela') {
    const n = p.punkty.length;
    const ile = n + 2;
    return [
      await okladkaHtml(p, ile),
      ...p.punkty.map((pt, i) => punktHtml(p, pt, i, n, ile)),
      ctaHtml(p, ile),
    ];
  }
  if (p.typ === 'case') {
    const ile = 4;
    return [await caseKartaHtml(p, ile), caseListaHtml(p, ile), caseWniosekHtml(p, ile), ctaHtml(p, ile)];
  }
  throw new Error(`nieznany typ posta: ${p.typ}`);
}

// Уменьшает .fit, пока блок не влезет; возвращает список того, что не влезло
// даже на минимуме, плюс всё, что вылезло за край кадра.
async function dopasuj(page) {
  return page.evaluate(() => {
    const zle = [];
    for (const el of document.querySelectorAll('.fit')) {
      const maxH = parseFloat(el.style.maxHeight) || el.clientHeight;
      const min = parseFloat(el.dataset.min || '20');
      let fs = parseFloat(getComputedStyle(el).fontSize);
      let guard = 0;
      while (el.scrollHeight > maxH + 1 && fs > min && guard++ < 80) {
        fs -= 2;
        el.style.fontSize = fs + 'px';
      }
      if (el.scrollHeight > maxH + 1) zle.push(`nie mieści się: "${el.textContent.trim().slice(0, 60)}"`);
      // слово шире блока (длинное слово без переноса)
      if (el.scrollWidth > el.clientWidth + 1) zle.push(`za szerokie: "${el.textContent.trim().slice(0, 60)}"`);
    }
    for (const el of document.querySelectorAll('.page *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > 1080 + 1 || r.bottom > 1350 + 1)) {
        zle.push(`wychodzi poza kadr: <${el.tagName.toLowerCase()}> "${(el.textContent || '').trim().slice(0, 40)}"`);
        break;
      }
    }
    // соседние блоки страницы не должны слипаться (меньше 20 px) или наезжать
    const bloki = [...document.querySelectorAll('.page > *')].filter((e) => e.getBoundingClientRect().height);
    for (let k = 1; k < bloki.length; k++) {
      const gora = bloki[k - 1].getBoundingClientRect(), dol = bloki[k].getBoundingClientRect();
      if (dol.top < gora.bottom + 20 && !bloki[k].classList.contains('prog') && !bloki[k - 1].classList.contains('top')
          && !bloki[k - 1].classList.contains('nr') && !bloki[k - 1].classList.contains('num')) {
        zle.push(`bloki za blisko: "${(bloki[k].textContent || '').trim().slice(0, 40)}"`);
      }
    }
    // блоки не должны наезжать на подвал
    const bot = document.querySelector('.bot, .row, .akcja');
    if (bot) {
      const granica = bot.getBoundingClientRect().top;
      for (const el of document.querySelectorAll('.fit')) {
        if (el.getBoundingClientRect().bottom > granica + 1) {
          zle.push(`nachodzi na stopkę: "${el.textContent.trim().slice(0, 40)}"`);
        }
      }
    }
    return zle;
  });
}

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '-');
}

// Рендер готового поста → [{file, png, name}] (JPEG для Instagram, PNG для просмотра).
export async function renderujPost(p, { nazwa, katalog = OUT_DIR } = {}) {
  const strony = await stronyPostu(p);
  await mkdir(katalog, { recursive: true });
  const base = slug(nazwa || `post-${p.id}`);
  const browser = await chromium.launch();
  const out = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    for (const [i, html] of strony.entries()) {
      const name = strony.length > 1 ? `${base}-${String(i + 1).padStart(2, '0')}` : base;
      const htmlPath = path.join(katalog, `${name}.html`);
      await writeFile(htmlPath, html, 'utf8');
      await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      // Шрифт не догрузился — польские буквы уедут в запасной. Лучше упасть.
      const fontyOk = await page.evaluate(async () => {
        const proby = ['800 40px "Inter Tight"', '900 40px "Inter Tight"', '400 40px Inter', '600 40px Inter',
          'italic 400 40px "Instrument Serif"'];
        const wyniki = await Promise.all(proby.map((f) => document.fonts.load(f, 'ąęłóśźżĄĘŁ')));
        return wyniki.every((w) => w.length > 0);
      });
      if (!fontyOk) throw new Error('fonty Google nie wczytały się — nie renderuję postu na zastępczym kroju');
      const zle = await dopasuj(page);
      if (zle.length) throw new Error(`slajd ${i + 1} posta ${p.id}: ${zle.join('; ')}`);
      await page.waitForTimeout(150);
      const pngPath = path.join(katalog, `${name}.png`);
      const jpgPath = path.join(katalog, `${name}.jpg`);
      await page.screenshot({ path: pngPath });
      await sharp(pngPath).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(jpgPath);
      out.push({ file: jpgPath, png: pngPath, name: `${name}.jpg` });
    }
  } finally {
    await browser.close();
  }
  return out;
}

export async function czytajBank() {
  return JSON.parse(await readFile(path.join(import.meta.dirname, 'posty-bank.json'), 'utf8'));
}
