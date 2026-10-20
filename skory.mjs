// Монтажные «скины» — семь разных видов одного и того же ролика.
//
// 20.10.2026 Захар: «всё равно сам монтаж один и тот же… попробуем все
// идеи». До этого каждый рилс был стоком с жёлтыми подписями по 2–3 слова.
//
// Скин — это ДВЕ вещи поверх общего конвейера (голос, сток, музыка,
// концовка, проверка, очередь остаются те же):
//
//   · `filtr` — что делаем с видео под слоем: размыть, затемнить, ужать в
//     окно, отдать низ кадра под мем, разрезать на две половины;
//   · `html`  — прозрачный слой на весь ролик, который рисует сам «монтаж»:
//     чат, заметку, мем, огромное слово, типографику, пост.
//
// Слой получает фразы с таймингами из синтеза (`a`, `b`) и роли из сценария
// (`hak`, `punkt`, `zaplata`, `cta`) — поэтому любой сценарий банка идёт в
// любом скине без переписывания.
//
// В `filtr` метки {IN} и {OUT} — вход и выход куска графа ffmpeg.

import { oprawHtml } from './rezyser.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const SKORY = {
  czat: { nazwa: 'переписка', filtr: '{IN}boxblur=26:2,eq=brightness=-0.22:saturation=0.8,setsar=1{OUT}' },
  notatka: {
    nazwa: 'заметка iPhone',
    // Видео живёт только в окошке справа снизу — остальное закрывает заметка.
    filtr:
      '{IN}scale=400:640:force_original_aspect_ratio=increase,crop=400:640,' +
      'pad=1080:1920:620:1160:black,setsar=1{OUT}',
  },
  mem: { nazwa: 'мем', filtr: "{IN}crop=1080:1200:0:'(ih-1200)/2',pad=1080:1920:0:720:white,setsar=1{OUT}" },
  slowo: { nazwa: 'одно слово', filtr: '{IN}eq=brightness=-0.30:saturation=0.55,setsar=1{OUT}' },
  split: {
    nazwa: 'так / не так',
    // Две половины — одно видео со сдвигом в 2,5 с: сверху ч/б (как не надо),
    // снизу цвет (как надо). Нижняя к концу замирает на последнем кадре.
    filtr:
      "{IN}split=2[sa][sb];[sa]crop=1080:960:0:'(ih-960)/2',hue=s=0,eq=brightness=-0.06," +
      'pad=1080:1920:0:0[sg];' +
      "[sb]trim=start=2.5,setpts=PTS-STARTPTS,crop=1080:960:0:'(ih-960)/2'[sd];" +
      '[sg][sd]overlay=0:960:eof_action=repeat,setsar=1{OUT}',
  },
  typo: { nazwa: 'типографика на цвете', filtr: null },
  post: { nazwa: 'пост-цитата', filtr: '{IN}boxblur=22:2,eq=brightness=-0.25,setsar=1{OUT}' },
  // Несколько скинов в одном ролике, с переходами. Фильтр собирается под
  // конкретный ролик — см. filtrSkory.
  miks: { nazwa: 'микс со сменой стиля', filtr: null },
};

// Слова, которые не годятся в «главное слово» фразы.
const PUSTE = new Set(
  ('i a o u w z na do że to nie się jest są czy ale bo jak co już tak ten ta te ty ja my wy ' +
    'po od za przy dla bez nad pod przed tylko też jeszcze kiedy gdy który która które ' +
    'twoja twój twoje nasz nasza nasze jego jej ich mi ci go mu jej sobie siebie tym tego')
    .split(' ')
);
export function glowneSlowo(fraza) {
  if (fraza.tytul) return fraza.tytul;
  const slowa = String(fraza.tekst)
    .replace(/[.,?!…:;„”"«»—-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !PUSTE.has(w.toLowerCase()));
  // Цифры важнее всего: «3000 zł» читается мгновенно.
  const liczba = slowa.find((w) => /\d/.test(w));
  if (liczba) return liczba;
  return slowa.sort((a, b) => b.length - a.length)[0] || String(fraza.tekst).split(' ')[0];
}

const FONTY =
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Bebas+Neue&family=Caveat:wght@700&display=swap" rel="stylesheet">';

const BAZA = (W, H) => `* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; overflow:hidden; background:transparent; font-family:'Inter',sans-serif; }`;

// На сколько секунд смена фразы на экране идёт раньше голоса. Глаз читает
// чуть впереди уха, но 20.10 Захар заметил «текст немного опережает голос»
// — там была в основном ошибка разметки (wyrownaj.mjs), а запас ужат до 40 мс.
export const PRZED = 0.04;

// Общий кусок: фразы и слова + помощники времени.
const JS = (dane) => `
const PRZED = ${PRZED};
const F = ${JSON.stringify(dane.frazy)};
const S = ${JSON.stringify(dane.slowa)};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeBack = (x) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const biezaca = (t) => { let k = -1; F.forEach((f, i) => { if (t >= f.a - PRZED) k = i; }); return k; };
// Сколько слов фразы i уже прозвучало к моменту t.
const slowFrazy = (i) => S.filter((w) => w.a >= F[i].a - 0.05 && w.a < (F[i + 1] ? F[i + 1].a - 0.05 : 1e9));
const ileSlow = (i, t) => slowFrazy(i).filter((w) => t >= w.a - 0.02).length;
// Где во фразе кончается РЕЧЬ (не пауза после неё) — по последнему слову.
const koniecMowy = (i) => { const sl = slowFrazy(i); return sl.length ? sl[sl.length - 1].b : F[i].b; };
function dopasuj(el, max, min, wys) {
  let s = max; el.style.fontSize = s + 'px';
  while (s > min && (el.scrollWidth > el.clientWidth + 2 || (wys && el.scrollHeight > wys))) { s -= 4; el.style.fontSize = s + 'px'; }
}
`;

// ── 1. переписка ─────────────────────────────────────────────────
function czat(d, W, H) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
.tel { position:absolute; left:56px; right:56px; top:150px; bottom:250px; background:#000; border-radius:64px;
  box-shadow:0 30px 100px rgba(0,0,0,.65); overflow:hidden; }
.gora { position:absolute; left:0; right:0; top:0; height:190px; padding:56px 40px 0; display:flex; gap:24px;
  align-items:center; border-bottom:1px solid #262626; background:#000; z-index:2; }
.av { width:92px; height:92px; border-radius:50%; background:linear-gradient(135deg,#7c3aed,#a78bfa); flex:none; }
.nm { color:#fff; font-weight:800; font-size:42px; } .st { color:#8e8e8e; font-size:30px; margin-top:4px; }
.lista { position:absolute; left:34px; right:34px; top:220px; will-change:transform; }
.m { max-width:80%; padding:28px 36px; border-radius:46px; font-size:46px; line-height:1.24; margin:16px 0;
  background:#262626; color:#fff; opacity:0; transform-origin:left bottom; }
.m.ja { background:#7c3aed; margin-left:auto; transform-origin:right bottom; }
.m b { color:#facc15; font-weight:800; }
.pis { width:150px; padding:30px 34px; border-radius:46px; background:#262626; display:flex; gap:14px; margin:16px 0; opacity:0; }
.pis i { width:20px; height:20px; border-radius:50%; background:#8e8e8e; display:block; }
.dol { position:absolute; left:0; right:0; bottom:0; height:150px; background:#000; border-top:1px solid #262626;
  display:flex; align-items:center; padding:0 40px; z-index:2; }
.pole { flex:1; height:96px; border-radius:48px; border:2px solid #363636; color:#8e8e8e; font-size:38px;
  display:flex; align-items:center; padding:0 36px; }
</style></head><body>
<div class="tel">
  <div class="gora"><div class="av"></div><div><div class="nm">ZOVU</div><div class="st">aktywny teraz</div></div></div>
  <div class="lista"></div>
  <div class="dol"><div class="pole">Wiadomość…</div></div>
</div>
<script>${JS(d)}
const lista = document.querySelector('.lista');
// Каждой фразе — пузырь. Своя реплика (призыв) — справа, фиолетовым.
const dymki = F.map((f) => {
  const pis = document.createElement('div'); pis.className = 'pis'; pis.innerHTML = '<i></i><i></i><i></i>';
  const m = document.createElement('div'); m.className = 'm' + (f.rola === 'cta' ? ' ja' : '');
  m.innerHTML = f.numer ? '<b>' + f.numer + '.</b> ' + f.tekst.replace(/&/g,'&amp;').replace(/</g,'&lt;') : f.tekst.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  lista.appendChild(pis); lista.appendChild(m);
  return { pis, m };
});
const WYS = ${H} - 150 - 250 - 220 - 170;
window.setT = (t) => {
  dymki.forEach(({ pis, m }, i) => {
    const a = F[i].a;
    // «Печатает…» за полсекунды до фразы — это и делает чат живым.
    const pokazPis = t >= a - 0.55 && t < a - 0.05 && F[i].rola !== 'cta';
    pis.style.display = pokazPis ? 'flex' : 'none';
    pis.style.opacity = pokazPis ? 1 : 0;
    if (pokazPis) [...pis.children].forEach((k, j) => { k.style.transform = 'translateY(' + (Math.sin(t * 12 - j) * 6).toFixed(1) + 'px)'; });
    const p = clamp01((t - a + 0.05) / 0.22);
    m.style.display = t >= a - 0.05 ? 'block' : 'none';
    m.style.opacity = clamp01(p * 2);
    m.style.transform = 'scale(' + (0.7 + 0.3 * easeBack(p)).toFixed(3) + ')';
  });
  const h = lista.scrollHeight;
  lista.style.transform = 'translateY(' + Math.min(0, WYS - h) + 'px)';
};
</script></body></html>`;
}

// ── 2. заметка iPhone ────────────────────────────────────────────
function notatka(d, W, H) {
  const dzis = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
/* Бумага — тенью окна: так в заметке остаётся дырка, где видно видео. */
.okno { position:absolute; left:620px; top:1160px; width:400px; height:640px; border-radius:44px;
  box-shadow:0 0 0 3000px #fffdf5, 0 24px 60px rgba(0,0,0,.25) inset; transform:rotate(0deg); }
.hd { position:absolute; left:70px; right:70px; top:100px; color:#e0a800; font-size:42px; font-weight:500;
  display:flex; justify-content:space-between; }
.t { position:absolute; left:70px; right:70px; top:200px; font-size:92px; font-weight:800; color:#111;
  line-height:1.04; letter-spacing:-2px; }
.d { position:absolute; left:70px; top:0; color:#9a9a9a; font-size:34px; }
.tekst { position:absolute; left:70px; right:70px; top:0; bottom:790px; overflow:hidden;
  -webkit-mask-image:linear-gradient(transparent 0, #000 70px); mask-image:linear-gradient(transparent 0, #000 70px); }
.in { padding-top:40px; }
.in { will-change:transform; }
.li { font-size:58px; color:#222; line-height:1.32; margin-bottom:18px; }
.li.p { font-weight:700; }
.li.p mark { background:linear-gradient(transparent 58%, #fde68a 58%); color:#111; }
.li .kw { display:inline-block; width:62px; }
.kur { display:inline-block; width:5px; height:64px; background:#e0a800; vertical-align:-10px; margin-left:4px; }
</style></head><body>
<div class="okno"></div>
<div class="hd"><span>‹ Notatki</span><span>Gotowe</span></div>
<div class="t">${esc(d.temat)}</div>
<div class="d">${esc(dzis)}</div>
<div class="tekst"><div class="in"></div></div>
<script>${JS(d)}
const t0 = document.querySelector('.t'), dd = document.querySelector('.d'), box = document.querySelector('.tekst'), inn = document.querySelector('.in');
window.__fit = () => {
  dopasuj(t0, 92, 56, 200);
  const dol = t0.offsetTop + t0.offsetHeight;
  dd.style.top = (dol + 14) + 'px';
  box.style.top = (dol + 90) + 'px';
};
const linie = F.map((f) => {
  const el = document.createElement('div');
  el.className = 'li' + (f.numer ? ' p' : '');
  inn.appendChild(el);
  return el;
});
const KUR = '<span class="kur"></span>';
window.setT = (t) => {
  const k = biezaca(t);
  linie.forEach((el, i) => {
    const f = F[i];
    if (i > k) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    // Печатаем строку ровно под голос: буква за буквой между началом и концом фразы.
    const tekst = f.numer && f.tytul ? f.tytul : f.tekst;
    const p = clamp01((t - f.a) / Math.max(0.3, koniecMowy(i) - f.a));
    const n = Math.round(tekst.length * p);
    const widac = tekst.slice(0, n).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const kursor = i === k && p < 1 ? KUR : '';
    if (f.numer) {
      const zrobione = p >= 1;
      el.innerHTML = '<span class="kw">' + (zrobione ? '☑' : '☐') + '</span><mark>' + widac + '</mark>' + kursor;
    } else el.innerHTML = widac + kursor;
  });
  const h = inn.scrollHeight, maks = box.clientHeight;
  inn.style.transform = 'translateY(' + Math.min(0, maks - h) + 'px)';
};
</script></body></html>`;
}

// ── 3. мем ───────────────────────────────────────────────────────
function mem(d, W, H) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
.top { position:absolute; left:0; right:0; top:0; height:720px; background:#fff; }
.tx { position:absolute; left:64px; right:64px; bottom:56px; font-size:74px; font-weight:600; line-height:1.17; color:#000; }
.tag { position:absolute; left:64px; top:96px; font-size:36px; color:#888; font-weight:500; }
</style></head><body>
<div class="top"><div class="tag">@zovu.pl</div><div class="tx"></div></div>
<script>${JS(d)}
const tx = document.querySelector('.tx');
let ostatni = -2;
window.setT = (t) => {
  const k = biezaca(t);
  if (k !== ostatni) {
    ostatni = k;
    const f = F[Math.max(0, k)];
    tx.textContent = f.tekst.toLowerCase().replace(/[.]$/, '');
    dopasuj(tx, 78, 44, 560);
  }
};
</script></body></html>`;
}

// ── 4. одно слово ────────────────────────────────────────────────
function slowo(d, W, H) {
  const glowne = d.frazy.map(glowneSlowo);
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
.w { position:absolute; left:40px; right:40px; top:560px; text-align:center; font-family:'Bebas Neue',sans-serif;
  line-height:.86; color:#fff; letter-spacing:4px; white-space:nowrap; text-shadow:0 18px 60px rgba(0,0,0,.55); }
.w.zolty { color:#facc15; }
.s { position:absolute; left:90px; right:90px; top:1240px; text-align:center; color:rgba(255,255,255,.9);
  font-size:50px; font-weight:600; line-height:1.25; }
.s b { color:#facc15; font-weight:800; }
.nr { position:absolute; left:0; right:0; top:400px; text-align:center; font-family:'Bebas Neue'; font-size:120px;
  color:#a78bfa; letter-spacing:8px; }
</style></head><body><div class="nr"></div><div class="w"></div><div class="s"></div>
<script>${JS(d)}
const G = ${JSON.stringify(glowne)};
const w = document.querySelector('.w'), s = document.querySelector('.s'), nr = document.querySelector('.nr');
let ostatni = -2;
window.setT = (t) => {
  const k = biezaca(t);
  if (k < 0) { w.textContent = ''; s.textContent = ''; return; }
  if (k !== ostatni) {
    ostatni = k;
    w.textContent = G[k].toUpperCase();
    w.className = 'w' + (k % 3 === 1 ? ' zolty' : '');
    dopasuj(w, 520, 140);
    nr.textContent = F[k].numer ? '#' + F[k].numer : '';
  }
  // Удар: слово влетает с переразмером и садится.
  const p = clamp01((t - F[k].a + 0.06) / 0.2);
  w.style.transform = 'scale(' + (1.45 - 0.45 * easeOut(p)).toFixed(3) + ') rotate(' + ((k % 2 ? 1 : -1) * 2 * (1 - p)).toFixed(2) + 'deg)';
  w.style.opacity = clamp01(p * 3);
  // Под словом — вся фраза, сказанные слова ярче.
  const sl = slowFrazy(k), n = ileSlow(k, t);
  s.innerHTML = sl.map((x, i) => i < n ? '<b>' + x.tekst + '</b>' : '<span style="opacity:.35">' + x.tekst + '</span>').join(' ');
};
</script></body></html>`;
}

// ── 5. так / не так ──────────────────────────────────────────────
function split(d, W, H) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
.l { position:absolute; left:50px; padding:14px 32px; border-radius:18px; font-weight:900; font-size:58px; color:#fff; }
.x { top:56px; background:#ef4444; } .v { top:1016px; background:#22c55e; }
.q { position:absolute; left:50px; right:50px; padding:26px 36px; border-radius:26px; background:rgba(0,0,0,.74);
  color:#fff; font-size:52px; font-weight:600; line-height:1.22; opacity:0; }
.q1 { bottom:1000px; } .q2 { bottom:60px; }
.cien { position:absolute; left:0; right:0; height:960px; background:#000; opacity:0; }
.c1 { top:0; } .c2 { top:960px; }
.kreska { position:absolute; left:0; right:0; top:952px; height:16px; background:#fff; }
</style></head><body>
<div class="cien c1"></div><div class="cien c2"></div><div class="kreska"></div>
<div class="l x">✕ NIE TAK</div><div class="l v">✓ TAK</div>
<div class="q q1"></div><div class="q q2"></div>
<script>${JS(d)}
const q1 = document.querySelector('.q1'), q2 = document.querySelector('.q2');
const c1 = document.querySelector('.c1'), c2 = document.querySelector('.c2');
// Хук — это «как не надо» (верх), всё остальное — «как надо» (низ).
const gora = (f) => f.rola === 'hak';
window.setT = (t) => {
  const k = biezaca(t);
  if (k < 0) return;
  const f = F[k], g = gora(f);
  const q = g ? q1 : q2, inna = g ? q2 : q1;
  q.textContent = '„' + f.tekst.replace(/[.]$/, '') + '”';
  q.style.opacity = easeOut(clamp01((t - f.a + 0.08) / 0.2));
  // Сказанное в другой половине гаснет, но не пропадает — сравнение видно.
  inna.style.opacity = inna.textContent ? 0.45 : 0;
  c1.style.opacity = g ? 0 : 0.42;
  c2.style.opacity = g ? 0.42 : 0;
};
</script></body></html>`;
}

// ── 6. типографика на цвете ──────────────────────────────────────
function typo(d, W, H) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
.c { position:absolute; inset:0; }
.t { position:absolute; left:80px; right:80px; top:360px; font-weight:900; line-height:.98;
  letter-spacing:-5px; text-transform:uppercase; }
.t span { display:inline-block; margin-right:.22em; }
.t span.k { padding:0 16px; }
.r { position:absolute; left:80px; top:1300px; font-family:'Caveat',cursive; font-size:104px; transform:rotate(-4deg); white-space:nowrap; }
.st { position:absolute; right:90px; top:1460px; width:260px; height:260px; border-radius:50%; display:flex;
  align-items:center; justify-content:center; text-align:center; font-weight:900; font-size:150px; line-height:1; }
.logo { position:absolute; left:80px; bottom:110px; font-weight:900; font-size:44px; letter-spacing:-1px; }
</style></head><body><div class="c"></div><div class="t"></div><div class="r"></div><div class="st"></div><div class="logo">zovu.pl</div>
<script>${JS(d)}
// Палитра меняется на каждой фразе: фон / текст / акцент.
const P = [
  ['#facc15', '#111111', '#7c3aed'], ['#7c3aed', '#ffffff', '#facc15'], ['#111111', '#facc15', '#a78bfa'],
  ['#fffdf5', '#111111', '#ef4444'], ['#a78bfa', '#111111', '#ffffff'],
];
const G = ${JSON.stringify(d.frazy.map(glowneSlowo))};
const c = document.querySelector('.c'), tt = document.querySelector('.t'), r = document.querySelector('.r');
const st = document.querySelector('.st'), logo = document.querySelector('.logo');
let ostatni = -2;
window.setT = (t) => {
  const k = Math.max(0, biezaca(t));
  const [tlo, kol, akc] = P[k % P.length];
  if (k !== ostatni) {
    ostatni = k;
    c.style.background = tlo; tt.style.color = kol; logo.style.color = kol;
    const sl = slowFrazy(k);
    const glowne = G[k].toLowerCase();
    tt.innerHTML = sl.map((w) => {
      const czyste = w.tekst.toLowerCase().replace(/[.,?!…:;„”"]/g, '');
      return '<span' + (czyste === glowne ? ' class="k" style="background:' + kol + ';color:' + tlo + '"' : '') + '>' + w.tekst + '</span>';
    }).join('');
    dopasuj(tt, 170, 80, 880);
    r.style.color = akc; r.textContent = F[k].numer ? '← krok ' + F[k].numer : '';
    st.style.background = kol; st.style.color = tlo; st.textContent = F[k].numer || '';
    st.style.display = F[k].numer ? 'flex' : 'none';
  }
  // Слова встают под голос.
  const n = ileSlow(k, t);
  [...tt.children].forEach((s, i) => {
    const w = slowFrazy(k)[i];
    const p = w ? easeBack(clamp01((t - w.a + 0.04) / 0.18)) : 1;
    s.style.opacity = i < n ? 1 : 0;
    s.style.transform = 'translateY(' + ((1 - p) * 50).toFixed(1) + 'px)';
  });
  const ps = easeBack(clamp01((t - F[k].a - 0.25) / 0.3));
  st.style.transform = 'scale(' + ps.toFixed(3) + ') rotate(12deg)';
  r.style.opacity = clamp01((t - F[k].a - 0.35) / 0.2);
};
</script></body></html>`;
}

// ── 7. пост-цитата ───────────────────────────────────────────────
function post(d, W, H) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
.card { position:absolute; left:64px; right:64px; top:300px; background:#fff; border-radius:46px;
  padding:56px 56px 46px; box-shadow:0 30px 100px rgba(0,0,0,.5); }
.h { display:flex; align-items:center; gap:24px; margin-bottom:34px; }
.av { width:104px; height:104px; border-radius:50%; background:linear-gradient(135deg,#7c3aed,#a78bfa); flex:none; }
.n { font-weight:800; font-size:44px; } .u { color:#777; font-size:34px; }
.ile { margin-left:auto; color:#999; font-size:34px; font-weight:600; }
.tx { font-size:58px; line-height:1.3; color:#111; }
.tx p { margin-bottom:26px; } .tx p:last-child { margin-bottom:0; }
.tx b { background:linear-gradient(transparent 60%, #ddd6fe 60%); font-weight:700; }
.f { display:flex; gap:60px; margin-top:42px; color:#777; font-size:38px; font-weight:500; }
</style></head><body>
<div class="card"><div class="h"><div class="av"></div><div><div class="n">ZOVU</div><div class="u">@zovu.pl · teraz</div></div><div class="ile"></div></div>
<div class="tx"></div><div class="f"><span class="lk">♡ 0</span><span>💬 <span class="km">0</span></span><span>↻ <span class="rp">0</span></span></div></div>
<script>${JS(d)}
// Пост пишется под голос. Не влезает — начинается следующий пост треда.
const tx = document.querySelector('.tx'), ile = document.querySelector('.ile'), card = document.querySelector('.card');
const lk = document.querySelector('.lk'), km = document.querySelector('.km'), rp = document.querySelector('.rp');
const MAKS = ${H} - 300 - 260;
// Раскладываем фразы по постам заранее, по высоте.
const posty = [[]];
(() => {
  F.forEach((f, i) => {
    const kand = posty[posty.length - 1].concat(i);
    tx.innerHTML = kand.map((j) => '<p>' + F[j].tekst + '</p>').join('');
    if (card.offsetHeight > MAKS && posty[posty.length - 1].length) posty.push([i]);
    else posty[posty.length - 1] = kand;
  });
  tx.innerHTML = '';
})();
let ostatniPost = -1;
window.setT = (t) => {
  const k = Math.max(0, biezaca(t));
  const pi = posty.findIndex((p) => p.includes(k));
  const p = posty[pi];
  ile.textContent = posty.length > 1 ? (pi + 1) + '/' + posty.length : '';
  tx.innerHTML = p.filter((j) => j <= k).map((j) => {
    const sl = slowFrazy(j), n = j < k ? sl.length : ileSlow(j, t);
    return '<p>' + sl.slice(0, n).map((w) => F[j].numer && w === sl[0] ? '<b>' + w.tekst + '</b>' : w.tekst).join(' ') + '</p>';
  }).join('');
  if (pi !== ostatniPost) { ostatniPost = pi; }
  const wej = easeBack(clamp01((t - F[p[0]].a + 0.25) / 0.3));
  card.style.transform = 'translateY(' + ((1 - wej) * 120).toFixed(1) + 'px)';
  // Цифры под постом растут — как будто его читают прямо сейчас.
  const x = Math.max(0, t);
  lk.textContent = '♡ ' + (x < 10 ? Math.floor(x * 140) : (x * 0.14).toFixed(1).replace('.', ',') + ' tys.');
  km.textContent = Math.floor(x * 17); rp.textContent = Math.floor(x * 5);
};
</script></body></html>`;
}

// ── 8. микс: стиль меняется внутри ролика ────────────────────────
//
// 20.10.2026 Захар про семь стилей: «нравится каждая идея, но не нравится,
// что каждая идея длится весь ролик… не хватает переходов». Поэтому ролик
// режется на 3–4 куска по смыслу — хук, середина, вывод — и каждый кусок
// идёт своим стилем. Стык закрывает переход на весь экран: под ним
// одновременно меняются и слой, и обработка видео, и подмены не видно.
// Типографика в микс не входит: Захар оставил её отдельным форматом.

// Какие стили годятся для какого куска.
const PULE = {
  start: ['slowo', 'mem', 'split'],
  srodek: ['notatka', 'czat', 'slowo', 'post'],
  koniec: ['post', 'czat', 'mem', 'slowo'],
};
export const PRZEJSCIA = ['szyba', 'paski', 'iris', 'blysk', 'przelot'];

// Детерминированный случай: тот же ролик собирается тем же миксом.
function losuj(ziarno) {
  let h = 2166136261;
  for (const c of String(ziarno)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Раскладка микса по фразам.
 * @param {Array<{a:number,b:number,rola:string}>} frazy
 * @param {string} ziarno — например имя сценария + дата
 * @param {{wymus?: Record<string,string>}} [o] — для проб: {0:'slowo', 1:'czat', p1:'iris'}
 */
export function planMiksu(frazy, ziarno, { wymus = {} } = {}) {
  const los = losuj(ziarno);
  const wybierz = (lista) => lista[Math.floor(los() * lista.length)];
  const n = frazy.length;
  const koncowe = (r) => r === 'zaplata' || r === 'cta';
  // Границы кусков по ролям: хук | середина | вывод+призыв.
  let s1 = frazy.findIndex((f) => f.rola !== 'hak');
  if (s1 <= 0) s1 = 1;
  let s2 = frazy.findIndex((f, i) => i >= s1 && koncowe(f.rola));
  if (s2 < 0 || s2 <= s1) s2 = Math.max(s1 + 1, n - 1);
  const kawalki = [
    { czesc: 'start', od: 0, do: s1 },
    { czesc: 'srodek', od: s1, do: s2 },
    { czesc: 'koniec', od: s2, do: n },
  ].filter((k) => k.do > k.od);
  // Длинная середина (4+ фраз) делится пополам — иначе один стиль снова
  // тянется полролика.
  const sr = kawalki.find((k) => k.czesc === 'srodek');
  if (sr && sr.do - sr.od >= 4) {
    const pol = sr.od + Math.ceil((sr.do - sr.od) / 2);
    kawalki.splice(kawalki.indexOf(sr), 1, { ...sr, do: pol }, { czesc: 'srodek', od: pol, do: sr.do });
  }
  const czas = (k) => frazy[k.do - 1].b - frazy[k.od].a;
  // Кусок короче двух секунд — не стиль, а мелькание: приклеиваем к соседу.
  for (let i = 0; i < kawalki.length; i++) {
    if (kawalki.length > 2 && czas(kawalki[i]) < 2) {
      const j = i === kawalki.length - 1 ? i - 1 : i + 1;
      const x = kawalki[Math.min(i, j)], y = kawalki[Math.max(i, j)];
      kawalki.splice(Math.min(i, j), 2, { czesc: x.czesc, od: x.od, do: y.do });
      i = -1;
    }
  }
  const segmenty = [];
  kawalki.forEach((k, nr) => {
    const uzyte = segmenty.map((s) => s.typ);
    const pula = PULE[k.czesc].filter((t) => t !== uzyte.at(-1));
    const swieze = pula.filter((t) => !uzyte.includes(t));
    let typ = wymus[nr] || wybierz(swieze.length ? swieze : pula);
    // «Так / не так» без второй половины бессмысленен: сверху хук, снизу —
    // первая фраза середины. Забираем её в этот кусок.
    if (typ === 'split') {
      const nast = kawalki[nr + 1];
      if (k.czesc === 'start' && nast && nast.do - nast.od >= 2) { k.do += 1; nast.od += 1; }
      else typ = 'slowo';
    }
    segmenty.push({ typ, od: k.od, do: k.do, t: 0 });
  });
  segmenty.forEach((s, i) => { s.t = i === 0 ? 0 : +(frazy[s.od].a - PRZED).toFixed(3); });
  const przejscia = [];
  for (let i = 1; i < segmenty.length; i++) {
    const pula = PRZEJSCIA.filter((p) => p !== przejscia.at(-1)?.typ);
    przejscia.push({ t: segmenty[i].t, typ: wymus['p' + i] || wybierz(pula) });
  }
  return { segmenty, przejscia };
}

// Длина перехода: до стыка и после. Около самого стыка экран закрыт целиком.
export const PRZEJSCIE_PRZED = 0.22, PRZEJSCIE_PO = 0.28;

function miks(d, W, H) {
  const { segmenty, przejscia } = d;
  const ramki = segmenty.map((s) => {
    const frazy = d.frazy.slice(s.od, s.do);
    const od = frazy[0].a - 0.6, doo = (d.frazy[s.do]?.a ?? 1e9) - 0.01;
    const slowa = d.slowa.filter((w) => w.a >= od && w.a < doo);
    const html = BUDOWNICZE[s.typ]({ ...d, frazy, slowa }, W, H);
    return html.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  });
  // Главное слово первой фразы следующего куска — для перехода «przelot».
  const slowaPrzejsc = przejscia.map((p, i) => glowneSlowo(d.frazy[segmenty[i + 1].od]).toUpperCase());
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H)}
iframe { position:absolute; left:0; top:0; width:${W}px; height:${H}px; border:0; background:transparent;
  visibility:hidden; color-scheme:normal; }
.pz { position:absolute; inset:0; pointer-events:none; display:none; overflow:hidden; }
.szyba i { position:absolute; top:-200px; bottom:-200px; left:0; width:${Math.round(W * 1.7)}px; }
.paski i { position:absolute; left:0; width:${W}px; height:${Math.ceil(H / 6) + 2}px; }
.iris { background:#facc15; }
.blysk i { position:absolute; left:0; right:0; }
.przelot { align-items:center; justify-content:center; }
.przelot b { font-family:'Bebas Neue',sans-serif; font-size:300px; letter-spacing:6px; white-space:nowrap; font-weight:400; }
</style></head><body>
${ramki.map((r, i) => `<iframe id="r${i}" srcdoc="${r}"></iframe>`).join('\n')}
<div class="pz szyba"><i style="background:#facc15"></i><i style="background:#7c3aed"></i></div>
<div class="pz paski">${[0, 1, 2, 3, 4, 5]
    .map((k) => `<i style="top:${Math.round((k * H) / 6)}px;background:${k % 2 ? '#7c3aed' : '#111'}"></i>`)
    .join('')}</div>
<div class="pz iris"></div>
<div class="pz blysk"><i></i><i></i><i></i></div>
<div class="pz przelot"><b></b></div>
<script>
const SEG = ${JSON.stringify(segmenty.map((s) => s.t))};
const PRZ = ${JSON.stringify(przejscia)};
const SL = ${JSON.stringify(slowaPrzejsc)};
const PP = ${PRZEJSCIE_PRZED}, PO = ${PRZEJSCIE_PO}, W = ${W}, H = ${H};
const ramki = [...document.querySelectorAll('iframe')];
const el = (s) => document.querySelector(s);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eo = (x) => 1 - Math.pow(1 - x, 3);
const ei = (x) => x * x * x;
window.__czekaj = async () => {
  for (const r of ramki) {
    const w = r.contentWindow;
    await w.document.fonts.ready;
    if (w.__fit) w.__fit();
  }
};
// Переход рисуется вокруг стыка ts; около ts экран закрыт полностью.
const RYS = {
  szyba(ts, t) {
    // Половина пути — до стыка, половина — после: ровно на стыке шторка во весь экран.
    const q = t < ts ? 0.5 * clamp01((t - (ts - PP)) / PP) : 0.5 + 0.5 * clamp01((t - ts) / PO);
    const e = eio(q);
    const [a, b] = el('.szyba').children;
    const x = -1.75 * W + 2.9 * W * e - 0.05 * W;
    a.style.transform = 'translateX(' + (x + 0.16 * W).toFixed(1) + 'px) skewX(-14deg)';
    b.style.transform = 'translateX(' + x.toFixed(1) + 'px) skewX(-14deg)';
  },
  paski(ts, t) {
    [...el('.paski').children].forEach((p, k) => {
      const kier = k % 2 ? 1 : -1;
      let x;
      if (t < ts) x = kier * W * (1 - eo(clamp01((t - (ts - PP) - k * 0.018) / (PP - 0.1))));
      else x = -kier * W * ei(clamp01((t - ts - 0.04 - k * 0.018) / (PO - 0.12)));
      p.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
    });
  },
  iris(ts, t) {
    const R = Math.hypot(W, H) / 2 + 20;
    const s = el('.iris');
    if (t < ts) {
      const r = R * eio(clamp01((t - (ts - PP)) / PP));
      s.style.clipPath = 'circle(' + r.toFixed(0) + 'px at 50% 52%)';
      s.style.webkitMaskImage = 'none';
    } else {
      const r = R * eo(clamp01((t - ts - 0.04) / (PO - 0.04)));
      s.style.clipPath = 'none';
      s.style.webkitMaskImage = 'radial-gradient(circle at 50% 52%, transparent ' + r.toFixed(0) + 'px, #000 ' + (r + 2).toFixed(0) + 'px)';
    }
  },
  blysk(ts, t) {
    const s = el('.blysk');
    const op = t < ts ? eo(clamp01((t - (ts - 0.1)) / 0.1)) : 1 - eo(clamp01((t - ts - 0.04) / (PO - 0.04)));
    s.style.background = 'rgba(255,255,255,' + op.toFixed(3) + ')';
    // Цветные срезы-глитч поверх вспышки, скачут каждые два кадра.
    const kl = Math.floor(t * 15);
    [...s.children].forEach((p, k) => {
      const r = Math.abs(Math.sin(kl * 12.9898 + k * 78.233) * 43758.5453) % 1;
      p.style.top = (r * H).toFixed(0) + 'px';
      p.style.height = (20 + r * 90).toFixed(0) + 'px';
      p.style.background = ['#7c3aed', '#facc15', '#22d3ee'][k];
      p.style.opacity = Math.abs(t - ts) < 0.16 ? 0.85 : 0;
      p.style.transform = 'translateX(' + ((r - 0.5) * 120).toFixed(0) + 'px)';
    });
  },
  przelot(ts, t, n) {
    const s = el('.przelot'), b = s.firstChild;
    if (b.dataset.n !== String(n)) {
      b.dataset.n = n; b.textContent = SL[n];
      let f = 300; b.style.fontSize = f + 'px';
      while (f > 120 && b.scrollWidth > W - 120) { f -= 10; b.style.fontSize = f + 'px'; }
    }
    s.style.background = n % 2 ? '#facc15' : '#7c3aed';
    b.style.color = n % 2 ? '#111' : '#fff';
    // Фон влетает кругом, слово садится, потом пролетает «сквозь камеру».
    if (t < ts) {
      const p = clamp01((t - (ts - PP)) / PP);
      s.style.clipPath = 'circle(' + (Math.hypot(W, H) / 2 * eio(p) + 10).toFixed(0) + 'px at 50% 50%)';
      s.style.opacity = 1;
      b.style.transform = 'scale(' + (0.3 + 0.7 * eo(p)).toFixed(3) + ')';
    } else {
      const p = clamp01((t - ts - 0.06) / (PO - 0.06));
      s.style.clipPath = 'none';
      s.style.opacity = (1 - ei(p)).toFixed(3);
      b.style.transform = 'scale(' + (1 + 7 * ei(p)).toFixed(3) + ')';
    }
  },
};
let aktywny = -1;
window.setT = (t) => {
  let k = 0;
  SEG.forEach((s, i) => { if (t >= s) k = i; });
  if (k !== aktywny) {
    ramki.forEach((r, i) => { r.style.visibility = i === k ? 'visible' : 'hidden'; });
    aktywny = k;
  }
  ramki[k].contentWindow.setT(t);
  document.querySelectorAll('.pz').forEach((p) => { p.style.display = 'none'; });
  PRZ.forEach((p, n) => {
    if (t < p.t - PP || t > p.t + PO) return;
    el('.' + p.typ).style.display = p.typ === 'przelot' ? 'flex' : 'block';
    RYS[p.typ](p.t, t, n);
  });
};
</script></body></html>`;
}

// Фильтр видео под слоем. У одиночного скина — свой из SKORY; у микса —
// ветка на каждый кусок, и куски сменяют друг друга по времени стыков.
// Под переходом «вспышка» картинка ещё и расслаивается по цветам (глитч).
export function filtrSkory(skora) {
  if (!skora) return null;
  if (skora.typ !== 'miks') return SKORY[skora.typ]?.filtr || null;
  const { segmenty, przejscia } = skora.dane;
  const n = segmenty.length;
  const czesci = [`{IN}split=${n}` + segmenty.map((_, i) => `[mz${i}]`).join('')];
  segmenty.forEach((s, i) => {
    const f = SKORY[s.typ]?.filtr || '{IN}null{OUT}';
    czesci.push(f.replace('{IN}', `[mz${i}]`).replace('{OUT}', `[mf${i}]`));
  });
  let biez = '[mf0]';
  for (let i = 1; i < n; i++) {
    czesci.push(`${biez}[mf${i}]overlay=0:0:enable='gte(t,${segmenty[i].t.toFixed(3)})'[mo${i}]`);
    biez = `[mo${i}]`;
  }
  const glitch = przejscia.filter((p) => p.typ === 'blysk');
  if (glitch.length) {
    const okna = glitch.map((p) => `between(t,${(p.t - 0.12).toFixed(2)},${(p.t + 0.16).toFixed(2)})`).join('+');
    czesci.push(`${biez}rgbashift=rh=-26:bh=26:gv=8:enable='${okna}'[mg]`);
    biez = '[mg]';
  }
  czesci.push(`${biez}setsar=1{OUT}`);
  return czesci.join(';');
}

// Отрезки, где движение задумано (переходы микса), — для проверки рывков.
export function ruchSkory(skora) {
  if (skora?.typ !== 'miks') return [];
  return skora.dane.przejscia.map((p) => [
    +(p.t - PRZEJSCIE_PRZED - 0.05).toFixed(2),
    +(p.t + PRZEJSCIE_PO + 0.05).toFixed(2),
  ]);
}

const BUDOWNICZE = { czat, notatka, mem, slowo, split, typo, post, miks };

// dane: { frazy: [{tekst, a, b, rola, numer, tytul}], slowa: [{tekst, a, b}], temat }
// у микса ещё { segmenty, przejscia } из planMiksu
export function skoraHtml(typ, dane, { W = 1080, H = 1920 } = {}) {
  const b = BUDOWNICZE[typ];
  if (!b) throw new Error(`нет скина «${typ}», есть: ${Object.keys(BUDOWNICZE).join(', ')}`);
  // Палитра и шрифты — от режиссёра (rezyser.mjs); без них — цвета ZOVU.
  return oprawHtml(b(dane, W, H), { paleta: dane.paleta, font: dane.font });
}
