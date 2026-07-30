// Рендер визуалов ZOVU (1080x1350, zah-стиль). Модуль — используют CLI и сервер.
// Два формата:
//   renderPost(data)     — одиночный пост
//   renderCarousel(data) — карусель (обложка + пункты + финальный слайд с CTA)
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const OUT_DIR = path.join(import.meta.dirname, 'out');
// Библиотека фонов и готовые посты живут на диске D, в папке проекта ZOVU
export const BG_DIR =
  process.env.ZOVU_BG_DIR || 'D:\\My AI\\Zovu.pl\\Автоматизация\\Посты\\Фоны';
const LOGO_FILE = path.join(import.meta.dirname, 'logo-white.b64');

let logoDataUri = null;
async function logo() {
  if (logoDataUri === null) {
    try {
      logoDataUri = 'data:image/png;base64,' + (await readFile(LOGO_FILE, 'utf8')).trim();
    } catch {
      logoDataUri = ''; // без лого тоже отрисуется
    }
  }
  return logoDataUri;
}

// ── фото людей ───────────────────────────────────────────────────
// Короткие имена вместо путей: photo: 'zah' | 'mat' | 'alex'
// Можно передать и полный путь к любому файлу.
// Псевдонимы, под которыми команда известна в сети: Zah, Mat, Alex
const PEOPLE = {
  zah: { file: 'C:\\Users\\zahar\\zovu-pl\\захар.jpg', name: 'Zah', role: 'Content & AI' },
  mat: { file: 'C:\\Users\\zahar\\zovu-pl\\Митя.jpg', name: 'Mat', role: 'Founder & CEO' },
  alex: { file: 'C:\\Users\\zahar\\zovu-pl\\саша.jpg', name: 'Alex', role: 'Creative' },
};

const photoCache = new Map();
// shape: 'square' — карточка автора, 'tall' — крупный портрет в край кадра
async function photoAsset(ref, shape = 'square') {
  if (!ref) return null;
  const key = String(ref).toLowerCase() + '|' + shape;
  if (photoCache.has(key)) return photoCache.get(key);

  const known = PEOPLE[String(ref).toLowerCase()];
  const file = known ? known.file : String(ref);
  const size = shape === 'tall' ? { w: 760, h: 1060 } : { w: 560, h: 560 };
  try {
    const buf = await sharp(file)
      .resize(size.w, size.h, { fit: 'cover', position: sharp.strategy.attention })
      .modulate({ saturation: 1.05 })
      .jpeg({ quality: 92 })
      .toBuffer();
    const asset = {
      uri: 'data:image/jpeg;base64,' + buf.toString('base64'),
      name: known ? known.name : '',
      role: known ? known.role : '',
    };
    photoCache.set(key, asset);
    return asset;
  } catch {
    photoCache.set(key, null);
    return null;
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── библиотека фонов ─────────────────────────────────────────────
// Кладёшь в папку bg/ картинки, сгенерированные вручную (Google Flow, ChatGPT).
// Имя = тег + номер: automatyzacja-1.jpg, social-2.jpg, pieniadze-1.jpg
// В данных пишешь bg:'automatyzacja' — движок сам возьмёт файл с этим тегом
// и будет чередовать их между слайдами, чтобы не повторялись.
let bgIndex = null;
async function bgLibrary(force = false) {
  if (bgIndex && !force) return bgIndex;
  bgIndex = new Map();
  try {
    const files = await readdir(BG_DIR);
    for (const f of files) {
      if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
      const tag = f.replace(/\.[^.]+$/, '').replace(/[-_]?\d+$/, '').toLowerCase();
      if (!bgIndex.has(tag)) bgIndex.set(tag, []);
      bgIndex.get(tag).push(path.join(BG_DIR, f));
    }
  } catch {
    /* папки ещё нет — работаем без фонов */
  }
  return bgIndex;
}

const bgCache = new Map();
// ref — тег ('automatyzacja'), имя файла или полный путь. nth — чтобы чередовать.
async function bgAsset(ref, nth = 0) {
  if (!ref) return null;
  let lib = await bgLibrary();
  const tag = String(ref).replace(/\.[^.]+$/, '').replace(/[-_]?\d+$/, '').toLowerCase();

  // если тега нет — возможно, файл добавили уже после старта. Перечитываем папку.
  if (!lib.has(tag)) lib = await bgLibrary(true);

  let file = null;
  const pool = lib.get(tag);
  if (pool && pool.length) {
    file = pool[nth % pool.length]; // ротация внутри тега
  } else if (/\.(jpe?g|png|webp)$/i.test(String(ref))) {
    file = path.isAbsolute(ref) ? ref : path.join(BG_DIR, ref);
  }
  if (!file) return null;

  if (bgCache.has(file)) return bgCache.get(file);
  try {
    const buf = await sharp(file)
      .resize(1080, 1350, { fit: 'cover', position: 'centre' })
      .modulate({ saturation: 1.04 })
      .jpeg({ quality: 88 })
      .toBuffer();
    const uri = 'data:image/jpeg;base64,' + buf.toString('base64');
    bgCache.set(file, uri);
    return uri;
  } catch {
    bgCache.set(file, null);
    return null;
  }
}

// ── общая база стилей ────────────────────────────────────────────
function baseCss() {
  return `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1080px; height:1350px; }
  body { background:#050505; color:#fff; overflow:hidden; position:relative;
    font-family:'JetBrains Mono', monospace; }
  .glow-a { position:absolute; width:1180px; height:1180px; left:-300px; top:-360px;
    background:radial-gradient(circle at center, rgba(124,58,237,.50), rgba(124,58,237,0) 62%); }
  .glow-b { position:absolute; width:960px; height:960px; right:-330px; bottom:-300px;
    background:radial-gradient(circle at center, rgba(167,139,250,.30), rgba(167,139,250,0) 60%); }
  .noise { position:absolute; inset:0; opacity:.05; mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E"); }

  /* ── «живые» слои: сетка, световой блик, органические брендовые формы ── */
  /* тонкая техническая сетка — даёт фактуру, не отвлекая от текста */
  .grid-lines { position:absolute; inset:0; opacity:.16;
    background-image:
      linear-gradient(to right, rgba(167,139,250,.16) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(167,139,250,.16) 1px, transparent 1px);
    background-size:90px 90px;
    mask-image:radial-gradient(ellipse 75% 60% at 50% 40%, #000 20%, transparent 78%);
    -webkit-mask-image:radial-gradient(ellipse 75% 60% at 50% 40%, #000 20%, transparent 78%); }
  /* диагональный луч света */
  .streak { position:absolute; width:1700px; height:340px; left:-380px; top:180px;
    transform:rotate(-32deg); pointer-events:none;
    background:linear-gradient(90deg, rgba(167,139,250,0) 0%, rgba(196,181,253,.13) 45%, rgba(167,139,250,0) 100%);
    filter:blur(38px); }
  /* большая размытая брендовая капля — «дышащий» объём */
  .blob { position:absolute; object-fit:contain; pointer-events:none; }
  .blob-a { width:760px; height:760px; right:-230px; top:-140px; opacity:.30;
    filter:blur(2px) saturate(1.25) drop-shadow(0 0 90px rgba(124,58,237,.65)); }
  .blob-b { width:520px; height:520px; left:-190px; bottom:110px; opacity:.16;
    filter:blur(26px) saturate(1.1); transform:rotate(150deg); }
  /* стеклянная панель — под пояснительный текст */
  .glass { border:1px solid rgba(167,139,250,.22); border-radius:26px;
    background:linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
    box-shadow:0 20px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
    backdrop-filter:blur(6px); }
  .wrap { position:relative; z-index:2; height:100%; padding:92px 84px 210px;
    display:flex; flex-direction:column; }
  .eyebrow { display:inline-flex; align-self:flex-start; align-items:center; gap:12px;
    border:1px solid rgba(167,139,250,.45); border-radius:999px; padding:12px 26px;
    font-size:20px; letter-spacing:.22em; text-transform:uppercase; color:#c4b5fd;
    background:rgba(124,58,237,.12); }
  .dot { width:9px; height:9px; border-radius:50%; background:#a78bfa;
    box-shadow:0 0 14px 3px rgba(167,139,250,.9); }
  h1 { font-family:'Oswald', sans-serif; font-weight:700; text-transform:uppercase;
    /* 1.12 — минимум, при котором польская диакритика (Ą, Ę, Ó, Ż) не режется
       и хвостики не наезжают на строку выше */
    line-height:1.12; letter-spacing:-1px;
    background:linear-gradient(96deg,#ffffff 0%,#ffffff 44%,#a78bfa 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    padding-bottom:.08em; }
  /* подвал: слева лого-знак + вордмарк, справа адрес сайта */
  .foot { position:absolute; left:84px; right:84px; bottom:80px; padding-top:32px;
    border-top:1px solid rgba(255,255,255,.14);
    display:flex; align-items:center; justify-content:space-between; }
  .brand { display:flex; align-items:center; gap:18px; }
  .brand img { width:58px; height:58px; object-fit:contain;
    filter:drop-shadow(0 0 18px rgba(167,139,250,.55)); }
  .wordmark { font-family:'Oswald', sans-serif; font-weight:700; font-size:40px;
    letter-spacing:.18em; }
  .site { font-size:25px; color:#a78bfa; letter-spacing:.06em; }
  /* счётчик слайдов (1/7) не показываем — Instagram сам рисует точки */
  .count { display:none !important; }

  /* ── фото человека ── */
  /* карточка автора: круглый портрет + имя и роль */
  .person { display:flex; align-items:center; gap:22px; align-self:flex-start;
    padding:18px 30px 18px 18px; border-radius:999px; }
  .person img { width:104px; height:104px; border-radius:50%; object-fit:cover;
    border:2px solid rgba(167,139,250,.55);
    box-shadow:0 0 34px 6px rgba(124,58,237,.42); }
  .person .who { display:flex; flex-direction:column; gap:6px; }
  .person .nm { font-family:'Oswald', sans-serif; font-weight:700; font-size:32px;
    letter-spacing:.06em; text-transform:uppercase; }
  .person .rl { font-size:20px; color:#c4b5fd; letter-spacing:.1em; text-transform:uppercase; }
  /* крупный портрет на финальном слайде */
  .portrait { width:360px; height:360px; border-radius:40px; object-fit:cover;
    border:2px solid rgba(167,139,250,.5); margin-bottom:48px;
    box-shadow:0 26px 80px rgba(0,0,0,.6), 0 0 60px 10px rgba(124,58,237,.35); }

  /* ── сгенерированный фон ── */
  .slide-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
    z-index:0; filter:saturate(1.05); }
  /* затемняющая вуаль: слева плотно (там текст), справа прозрачно (там объекты) */
  .scrim { position:absolute; inset:0; z-index:1;
    background:
      linear-gradient(to right, rgba(5,5,5,.94) 0%, rgba(5,5,5,.82) 38%, rgba(5,5,5,.28) 72%, rgba(5,5,5,.12) 100%),
      linear-gradient(to top, rgba(5,5,5,.96) 0%, rgba(5,5,5,.15) 34%, rgba(5,5,5,0) 60%); }
  .has-bg .wrap { z-index:3; }
  .has-bg .foot { z-index:4; }
  .has-bg .count { z-index:4; }
  `;
}

function head() {
  return `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">`;
}

// Фоновые слои — одинаковые для всех шаблонов, чтобы серия смотрелась как одна лента.
// Если есть сгенерированный фон, свои декорации приглушаем: иначе каша.
function layers(logoUri, bgUri) {
  if (bgUri) {
    return `<img class="slide-bg" src="${bgUri}" alt=""><div class="scrim"></div>
    <div class="noise"></div>`;
  }
  const blobs = logoUri
    ? `<img class="blob blob-a" src="${logoUri}" alt=""><img class="blob blob-b" src="${logoUri}" alt="">`
    : '';
  return `<div class="glow-a"></div><div class="glow-b"></div>
  ${blobs}<div class="streak"></div><div class="grid-lines"></div><div class="noise"></div>`;
}

function bodyTag(bgUri) {
  return bgUri ? '<body class="has-bg">' : '<body>';
}

function footer(logoUri, site) {
  const mark = logoUri ? `<img src="${logoUri}" alt="">` : '';
  return `<div class="foot">
    <div class="brand">${mark}<div class="wordmark">ZOVU</div></div>
    <div class="site">${esc(site || 'zovu.pl')}</div>
  </div>`;
}

// ── одиночный пост: заголовок + максимум 3 КОРОТКИХ пункта ───────
function singleHtml({ eyebrow, title, bullets, footer: site }, logoUri, bgUri) {
  const items = (bullets || []).slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join('');
  const len = String(title).length;
  const size = len > 68 ? 78 : len > 46 ? 94 : 112;
  return `<!doctype html><html><head>${head()}<style>${baseCss()}
  .wrap { justify-content:center; }
  h1 { font-size:${size}px; margin-top:52px; }
  ul { list-style:none; margin-top:70px; display:flex; flex-direction:column; gap:28px; }
  li { position:relative; padding-left:44px; font-size:30px; line-height:1.35; color:#e9e5f7; }
  li::before { content:''; position:absolute; left:0; top:12px; width:19px; height:19px;
    border-radius:6px; background:linear-gradient(135deg,#7c3aed,#a78bfa);
    box-shadow:0 0 18px 3px rgba(124,58,237,.65); }
  </style></head>${bodyTag(bgUri)}
  ${layers(logoUri, bgUri)}
  <div class="wrap">
    <div class="eyebrow"><span class="dot"></span>${esc(eyebrow || 'ZOVU')}</div>
    <h1>${esc(title)}</h1>
    <ul>${items}</ul>
    ${footer(logoUri, site)}
  </div></body></html>`;
}

// ── слайд карусели: обложка ──────────────────────────────────────
function coverHtml({ eyebrow, title, subtitle, total, footer: site }, logoUri, person) {
  const len = String(title).length;
  const size = len > 40 ? 116 : len > 26 ? 140 : 168;
  return `<!doctype html><html><head>${head()}<style>${baseCss()}
  .wrap { justify-content:center; }
  h1 { font-size:${size}px; margin-top:46px; }
  .sub { margin-top:38px; font-size:32px; line-height:1.4; color:#efecf9; max-width:84%;
    padding:28px 32px; align-self:flex-start; }
  /* подсказка в потоке, а не абсолютом — иначе накладывается на карточку автора */
  .swipe { margin-top:34px; display:flex; align-items:center; gap:16px; align-self:flex-start;
    font-size:22px; letter-spacing:.2em; text-transform:uppercase; color:#c4b5fd; }
  .swipe .arrow { font-size:30px; color:#a78bfa; }
  .count { position:absolute; right:84px; top:92px; font-size:24px; color:#a78bfa;
    letter-spacing:.14em; }
  </style></head><body>
  ${layers(logoUri)}
  <div class="wrap">
    <div class="eyebrow"><span class="dot"></span>${esc(eyebrow || 'ZOVU')}</div>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub glass">${esc(subtitle)}</div>` : ''}
    ${
      person
        ? `<div class="person glass" style="margin-top:34px">
             <img src="${person.uri}" alt="">
             <div class="who"><div class="nm">${esc(person.name || 'ZOVU')}</div>
             <div class="rl">${esc(person.role || 'zovu.pl')}</div></div>
           </div>`
        : ''
    }
    <div class="count">1/${total}</div>
    <div class="swipe">przesuń<span class="arrow">→</span></div>
    ${footer(logoUri, site)}
  </div></body></html>`;
}

// ── обложка с крупным фото человека в край кадра ─────────────────
function coverHeroHtml({ eyebrow, title, subtitle, total, footer: site }, logoUri, person) {
  const len = String(title).length;
  // колонка узкая (фото занимает правую часть), поэтому кегль мельче обычной обложки
  const size = len > 52 ? 74 : len > 40 ? 84 : len > 28 ? 98 : 118;
  return `<!doctype html><html><head>${head()}<style>${baseCss()}
  /* фото уходит в правый край. Растворение — ОДНОЙ маской на самом фото:
     накладка-градиент поверх фона давала видимый шов, mask-composite в
     headless Chrome работает непредсказуемо, а одна маска — надёжно. */
  .hero { position:absolute; right:-40px; bottom:0; width:700px; height:1090px;
    object-fit:cover; object-position:center top; z-index:1;
    mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,.35) 26%, #000 52%);
    -webkit-mask-image:linear-gradient(to right, transparent 0%, rgba(0,0,0,.35) 26%, #000 52%);
    filter:saturate(1.08) contrast(1.04); }
  /* текст в левой колонке, чтобы не спорил с фото */
  .wrap { justify-content:center; padding-right:455px; }
  h1 { font-size:${size}px; margin-top:40px; }
  .sub { margin-top:32px; font-size:28px; line-height:1.42; color:#efecf9;
    padding:24px 28px; align-self:flex-start; }
  .who-line { margin-top:34px; align-self:flex-start; }
  .who-line .nm { font-family:'Oswald', sans-serif; font-weight:700; font-size:52px;
    letter-spacing:.05em; text-transform:uppercase;
    background:linear-gradient(96deg,#ffffff,#a78bfa);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .who-line .rl { margin-top:6px; font-size:21px; color:#c4b5fd;
    letter-spacing:.16em; text-transform:uppercase; }
  .swipe { margin-top:30px; display:flex; align-items:center; gap:14px; align-self:flex-start;
    font-size:22px; letter-spacing:.2em; text-transform:uppercase; color:#c4b5fd; }
  .swipe .arrow { font-size:30px; color:#a78bfa; }
  .count { position:absolute; right:84px; top:92px; font-size:24px; color:#a78bfa;
    letter-spacing:.14em; z-index:4; }
  .wrap { z-index:3; }
  .foot { z-index:4; }
  </style></head><body>
  ${layers(logoUri)}
  <img class="hero" src="${person.uri}" alt="">
  <div class="wrap">
    <div class="eyebrow"><span class="dot"></span>${esc(eyebrow || 'ZOVU')}</div>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub glass">${esc(subtitle)}</div>` : ''}
    ${
      person.name
        ? `<div class="who-line"><div class="nm">${esc(person.name)}</div>
             <div class="rl">${esc(person.role || '')}</div></div>`
        : ''
    }
    <div class="count">1/${total}</div>
    <div class="swipe">przesuń<span class="arrow">→</span></div>
    ${footer(logoUri, site)}
  </div></body></html>`;
}

// ── слайд карусели: пункт с крупным номером ──────────────────────
function itemHtml({ index, total, heading, text, footer: site }, logoUri, bgUri) {
  const num = String(index).padStart(2, '0');
  const len = String(heading).length;
  const size = len > 44 ? 78 : len > 28 ? 92 : 108;
  return `<!doctype html><html><head>${head()}<style>${baseCss()}
  /* текстовый блок прижат к низу, крупный номер держит верх — так нет пустоты */
  .wrap { justify-content:flex-end; padding-bottom:290px; }
  .bignum { position:absolute; right:-30px; top:120px; font-family:'Oswald', sans-serif;
    font-weight:700; font-size:520px; line-height:.8; color:rgba(167,139,250,.10);
    letter-spacing:-14px; z-index:1; }
  .badge { display:inline-flex; align-items:center; justify-content:center;
    width:104px; height:104px; border-radius:28px;
    background:linear-gradient(135deg,#7c3aed,#a78bfa);
    box-shadow:0 0 40px 8px rgba(124,58,237,.45);
    font-family:'Oswald', sans-serif; font-weight:700; font-size:54px; color:#fff;
    -webkit-text-fill-color:#fff; }
  h1 { font-size:${size}px; margin-top:44px; }
  .txt { margin-top:34px; font-size:30px; line-height:1.45; color:#efecf9; max-width:88%;
    padding:26px 30px; align-self:flex-start; }
  .count { position:absolute; right:84px; top:92px; font-size:24px; color:#a78bfa;
    letter-spacing:.14em; }
  /* поверх сгенерированного фона гигантский номер лишний — убираем */
  .has-bg .bignum { display:none; }
  </style></head>${bodyTag(bgUri)}
  ${layers(logoUri, bgUri)}
  <div class="bignum">${num}</div>
  <div class="wrap">
    <div class="badge">${num}</div>
    <h1>${esc(heading)}</h1>
    ${text ? `<div class="txt glass">${esc(text)}</div>` : ''}
    <div class="count">${index + 1}/${total}</div>
    ${footer(logoUri, site)}
  </div></body></html>`;
}

// ── слайд карусели: финальный, с призывом ────────────────────────
function ctaHtml({ total, headline, line, footer: site }, logoUri, person) {
  // если есть фото человека — показываем его, лого уходит в подвал
  const mark = person
    ? `<img class="portrait" src="${person.uri}" alt="">`
    : logoUri
      ? `<img class="biglogo" src="${logoUri}" alt="">`
      : '';
  return `<!doctype html><html><head>${head()}<style>${baseCss()}
  /* на финальном слайде подвала нет, поэтому центрируем по всей высоте */
  .wrap { justify-content:center; align-items:center; text-align:center; padding-bottom:92px; }
  .biglogo { width:190px; height:190px; object-fit:contain; margin-bottom:56px;
    filter:drop-shadow(0 0 46px rgba(167,139,250,.6)); }
  h1 { font-size:96px; }
  .line { margin-top:38px; font-size:32px; line-height:1.4; color:#e9e5f7; max-width:76%; }
  .pill { margin-top:52px; display:inline-flex; align-items:center; gap:14px;
    border:1px solid rgba(167,139,250,.55); border-radius:999px; padding:20px 40px;
    font-size:27px; color:#fff; background:rgba(124,58,237,.16);
    box-shadow:0 0 34px 6px rgba(124,58,237,.25); }
  .count { position:absolute; right:84px; top:92px; font-size:24px; color:#a78bfa;
    letter-spacing:.14em; }
  </style></head><body>
  ${layers(logoUri)}
  <div class="wrap">
    ${mark}
    <h1>${esc(headline || 'ZROBIMY TO ZA CIEBIE')}</h1>
    <div class="line">${esc(line || 'Napisz do nas — pokażemy, jak to działa w Twojej firmie.')}</div>
    ${person ? '' : `<div class="pill"><span class="dot"></span>${esc(site || 'zovu.pl')}</div>`}
    <div class="count">${total}/${total}</div>
    ${person ? footer(logoUri, site) : ''}
  </div></body></html>`;
}

// ── движок: HTML → PNG → JPEG ────────────────────────────────────
async function shoot(pages) {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const out = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1,
    });
    for (const { name, html } of pages) {
      const htmlPath = path.join(OUT_DIR, `${name}.html`);
      const pngPath = path.join(OUT_DIR, `${name}.png`);
      const jpgPath = path.join(OUT_DIR, `${name}.jpg`);
      await writeFile(htmlPath, html, 'utf8');
      await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(320);
      await page.screenshot({ path: pngPath });
      await sharp(pngPath).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(jpgPath);
      out.push({ file: jpgPath, png: pngPath, name: `${name}.jpg` });
    }
  } finally {
    await browser.close();
  }
  return out;
}

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '-');
}

export async function renderPost(data) {
  if (!data || !data.title) throw new Error('нужно поле title');
  const name = slug(data.name || `post-${process.hrtime.bigint().toString(36)}`);
  const uri = await logo();
  const bg = await bgAsset(data.bg);
  const [res] = await shoot([{ name, html: singleHtml(data, uri, bg) }]);
  return res;
}

// data: { eyebrow, title, subtitle, items:[{heading,text}], cta:{headline,line}, footer, name }
export async function renderCarousel(data) {
  if (!data || !data.title) throw new Error('нужно поле title');
  const items = (data.items || []).slice(0, 8);
  if (!items.length) throw new Error('нужен непустой items');

  const base = slug(data.name || `carousel-${process.hrtime.bigint().toString(36)}`);
  const total = items.length + 2; // обложка + пункты + финальный слайд
  const uri = await logo();
  // photo — на обложке, photoCta — на финальном слайде (по умолчанию тот же человек)
  // cover: 'hero' — фото крупно в край кадра, иначе карточка автора
  const hero = data.cover === 'hero';
  const person = await photoAsset(data.photo, hero ? 'tall' : 'square');
  const personCta = await photoAsset(data.photoCta || data.photo);

  // фон: общий для всех пунктов (data.bg) либо свой на каждый пункт (it.bg)
  const itemBgs = await Promise.all(
    items.map((it, i) => bgAsset(it.bg || data.bg, i))
  );

  const coverFn = hero && person ? coverHeroHtml : coverHtml;
  const pages = [
    { name: `${base}-01`, html: coverFn({ ...data, total }, uri, person) },
    ...items.map((it, i) => ({
      name: `${base}-${String(i + 2).padStart(2, '0')}`,
      html: itemHtml(
        { index: i + 1, total, heading: it.heading, text: it.text, footer: data.footer },
        uri,
        itemBgs[i]
      ),
    })),
    {
      name: `${base}-${String(total).padStart(2, '0')}`,
      html: ctaHtml({ total, ...(data.cta || {}), footer: data.footer }, uri, personCta),
    },
  ];

  return shoot(pages);
}
