// Концовки рилсов — пять видов вместо одной карточки.
//
// 29.10.2026 — новый бренд ZOVU (reference_zovu_brand_2026): последний кадр
// уходит в размытие под тёплый белый #F6F4EF, текст #111111, единственный
// акцент #FF4A1C, заголовки Inter Tight 900, акцентные слова Instrument Serif
// italic, лого оранжевое. Фиолетового нет нигде.
//
// 19.10.2026 Захар: «концовку надо поменять… везде одинаковые, надо делать
// разное». До этого КАЖДЫЙ ролик кончался одним и тем же: призыв + 3,8 с
// карточки «ROBIMY TREŚCI / zovu.pl». При досмотре 1–3 с до неё почти никто
// не доходит, а кто дошёл — смотрит на мёртвую секунду.
//
// Концовка здесь — не отдельная плашка, а продолжение ПОСЛЕДНЕГО КАДРА:
// он размывается и темнеет, а поверх приходит действие. Поэтому переход
// без наезда — кадр тот же, рез не читается.
//
//   petla   — карточки нет вовсе: последняя фраза подводит к первой, ролик
//             смотрят второй раз (досмотр > 100 % — главный сигнал ленты);
//   pytanie — вопрос и поле комментария с мигающим курсором;
//   wyslij  — шторка «Отправить» как в инстаграме: пересылки площадка
//             ценит выше лайков;
//   seria   — «CZĘŚĆ 2 · jutro»: повод вернуться и подписаться;
//   blysk   — вспышка лого на 0,9 с вместо карточки на 3,8;
//   marka   — старая карточка, остаётся для редких выпусков.
export const ZAKONCZENIA = {
  petla: { dlugosc: 0 },
  pytanie: { dlugosc: 2.3 },
  wyslij: { dlugosc: 2.4 },
  seria: { dlugosc: 2.0 },
  // 1,6 вместо 0,9: на вспышке теперь кодовое слово, его надо успеть прочитать.
  blysk: { dlugosc: 1.6 },
  marka: { dlugosc: 3.8 },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BAZA = (W, H, tlo) => `
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; overflow:hidden; font-family:'Inter',sans-serif; background:#F6F4EF; color:#111111; }
.tlo { position:absolute; inset:-40px; background:url('${tlo}') center/cover no-repeat; will-change:filter; }
.cien { position:absolute; inset:0; background:#F6F4EF; opacity:0; }
.fiolet { position:absolute; inset:0; opacity:0;
  background:radial-gradient(ellipse 900px 800px at 50% 45%, rgba(255,74,28,.20), transparent 65%); }
`;

const WSPOLNE_JS = `
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeBack = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const tloEl = document.querySelector('.tlo');
const cienEl = document.querySelector('.cien');
function rozmyj(t, ile = 34, ciemno = 0.84) {
  const p = easeOut(clamp01(t / 0.32));
  tloEl.style.filter = 'blur(' + (p * ile).toFixed(1) + 'px)';
  tloEl.style.transform = 'scale(' + (1 + 0.04 * p).toFixed(3) + ')';
  cienEl.style.opacity = (p * ciemno).toFixed(3);
}
`;

const FONTY =
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Inter+Tight:wght@800;900&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">';

function pytanie(o, W, H, tlo) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H, tlo)}
.pyt { position:absolute; left:90px; right:90px; bottom:780px; color:#111111; font-family:'Inter Tight','Inter',sans-serif; font-weight:900; font-size:112px;
  line-height:1.0; letter-spacing:-3px; text-transform:uppercase; }
.pyt span.ak { color:#FF4A1C; }
.pyt span { display:inline-block; opacity:0; }
.pole { position:absolute; left:70px; right:70px; top:1190px; height:150px; border-radius:75px;
  background:#FFFFFF; display:flex; align-items:center; gap:28px; padding:0 44px; opacity:0;
  border:3px solid #111111; box-shadow:0 18px 50px rgba(17,17,17,.18); }
.awatar { width:86px; height:86px; border-radius:50%; background:#FF4A1C; flex:none; }
.wpis { font-size:52px; color:#111111; font-weight:700; white-space:nowrap; overflow:hidden; }
.wpis.pusty { color:#8e8e8e; font-weight:400; }
.kursor { width:4px; height:58px; background:#FF4A1C; margin-left:-18px; }
.wyslij { margin-left:auto; color:#FF4A1C; font-weight:800; font-size:46px; opacity:.35; }
</style></head><body><div class="tlo"></div><div class="cien"></div>
<div class="pyt">${esc(o.tekst)
    .split(' ')
    .map((w) => `<span${o.slowo && w.toUpperCase().includes(String(o.slowo).toUpperCase()) ? ' class="ak"' : ''}>${w}</span>`)
    .join(' ')}</div>
<div class="pole"><div class="awatar"></div><div class="wpis pusty">${o.dm ? 'Wyślij wiadomość…' : 'Dodaj komentarz…'}</div><div class="kursor"></div><div class="wyslij">${o.dm ? 'Wyślij' : 'Opublikuj'}</div></div>
<script>${WSPOLNE_JS}
const slowa = [...document.querySelectorAll('.pyt span')];
// Длинный вопрос растёт вверх от поля и ужимается, чтобы не залезть на него
// и не уйти под верх кадра (проба 20.10: пять строк наехали на поле).
const pytEl = document.querySelector('.pyt');
for (let r = 112; r > 60 && pytEl.offsetHeight > 640; r -= 6) pytEl.style.fontSize = r + 'px';
const pole = document.querySelector('.pole');
const wpis = document.querySelector('.wpis');
const kursor = document.querySelector('.kursor');
const wyslijEl = document.querySelector('.wyslij');
const ODP = ${JSON.stringify(o.odpowiedz || 'U mnie…')};
window.setT = (t) => {
  rozmyj(t);
  slowa.forEach((s, i) => {
    const p = easeBack(clamp01((t - 0.12 - i * 0.07) / 0.3));
    s.style.opacity = clamp01((t - 0.12 - i * 0.07) / 0.12);
    s.style.transform = 'translateY(' + ((1 - p) * 60).toFixed(1) + 'px)';
  });
  const tp = 0.12 + slowa.length * 0.07 + 0.1;
  const pp = easeBack(clamp01((t - tp) / 0.35));
  pole.style.opacity = clamp01((t - tp) / 0.15);
  pole.style.transform = 'translateY(' + ((1 - pp) * 120).toFixed(1) + 'px)';
  // Ответ печатается сам — зритель видит, что писать можно коротко.
  const tPis = tp + 0.55;
  const n = Math.floor(clamp01((t - tPis) / 0.9) * ODP.length);
  if (n > 0) { wpis.textContent = ODP.slice(0, n); wpis.classList.remove('pusty'); }
  wyslijEl.style.opacity = n >= ODP.length ? 1 : 0.35;
  kursor.style.opacity = Math.floor(t * 2.4) % 2 ? 0 : 1;
};
</script></body></html>`;
}

function wyslij(o, W, H, tlo) {
  const kontakty = (o.kontakty || ['Ania', 'Kuba', 'Szef', 'Ola']).slice(0, 4);
  const kolory = ['#FF4A1C,#FF7A50', '#111111,#3a3833', '#55524C,#8a857c', '#FF4A1C,#111111'];
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H, tlo)}
.naglowek { position:absolute; left:90px; right:90px; top:420px; color:#111111; font-family:'Inter Tight','Inter',sans-serif; font-weight:900; font-size:100px;
  line-height:1.02; letter-spacing:-3px; text-transform:uppercase; opacity:0; }
.naglowek small { display:block; font-family:'Instrument Serif',serif; font-style:italic; font-weight:400; text-transform:none;
  font-size:84px; letter-spacing:0; color:#FF4A1C; margin-bottom:10px; }
.szuflada { position:absolute; left:0; right:0; bottom:0; height:820px; background:#FFFFFF; border-radius:56px 56px 0 0;
  padding:30px 60px; box-shadow:0 -20px 80px rgba(17,17,17,.16); }
.uchwyt { width:120px; height:12px; border-radius:6px; background:#dbdbdb; margin:0 auto 46px; }
.tytul { text-align:center; font-weight:800; font-size:50px; color:#111111; margin-bottom:60px; }
.osoby { display:flex; justify-content:space-between; }
.osoba { width:200px; text-align:center; }
.kolko { width:180px; height:180px; border-radius:50%; margin:0 auto 22px; position:relative;
  display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:72px; }
.ptaszek { position:absolute; right:-6px; bottom:-6px; width:66px; height:66px; border-radius:50%; background:#FF4A1C;
  border:8px solid #fff; opacity:0; display:flex; align-items:center; justify-content:center; }
.ptaszek svg { width:30px; height:30px; }
.imie { font-size:42px; color:#111111; font-weight:600; }
.przycisk { margin-top:80px; height:130px; border-radius:30px; background:#FF4A1C; color:#fff; font-weight:800;
  font-size:54px; display:flex; align-items:center; justify-content:center; opacity:.4; }
</style></head><body><div class="tlo"></div><div class="cien"></div>
<div class="naglowek"><small>Wyślij to</small>${esc(o.tekst)}</div>
<div class="szuflada"><div class="uchwyt"></div><div class="tytul">Udostępnij</div>
<div class="osoby">${kontakty
    .map(
      (k, i) =>
        `<div class="osoba"><div class="kolko" style="background:linear-gradient(135deg,${kolory[i]})">${esc(k[0])}<div class="ptaszek"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div><div class="imie">${esc(k)}</div></div>`
    )
    .join('')}</div>
<div class="przycisk">Wyślij</div></div>
<script>${WSPOLNE_JS}
const nag = document.querySelector('.naglowek');
const szu = document.querySelector('.szuflada');
const ptaszki = [...document.querySelectorAll('.ptaszek')];
const btn = document.querySelector('.przycisk');
window.setT = (t) => {
  rozmyj(t);
  const pn = easeOut(clamp01((t - 0.1) / 0.3));
  nag.style.opacity = pn; nag.style.transform = 'translateY(' + ((1 - pn) * 40).toFixed(1) + 'px)';
  const ps = easeOut(clamp01((t - 0.25) / 0.4));
  szu.style.transform = 'translateY(' + ((1 - ps) * 900).toFixed(1) + 'px)';
  // Отмечаем двоих — «кому-то конкретному», а не всем подряд.
  [1, 2].forEach((k, i) => {
    const pk = easeBack(clamp01((t - 0.95 - i * 0.3) / 0.25));
    ptaszki[k].style.opacity = clamp01((t - 0.95 - i * 0.3) / 0.1);
    ptaszki[k].style.transform = 'scale(' + pk.toFixed(3) + ')';
  });
  const pb = clamp01((t - 1.6) / 0.15);
  btn.style.opacity = (0.4 + 0.6 * pb).toFixed(2);
  btn.style.transform = 'scale(' + (1 + 0.05 * Math.sin(clamp01((t - 1.75) / 0.4) * Math.PI)).toFixed(3) + ')';
};
</script></body></html>`;
}

function seria(o, W, H, tlo) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H, tlo)}
.blok { position:absolute; left:90px; right:90px; top:620px; color:#111111; }
.cz { white-space:nowrap; font-family:'Inter Tight','Inter',sans-serif; font-weight:900; font-size:210px; line-height:.9; letter-spacing:-10px; opacity:0; }
.cz b { color:#FF4A1C; }
.kiedy { font-weight:800; font-size:76px; margin-top:30px; opacity:0; letter-spacing:-1px; }
.o { font-weight:700; font-size:66px; margin-top:22px; color:#55524C; opacity:0; line-height:1.2; }
.pasek { margin-top:70px; height:18px; border-radius:9px; background:rgba(17,17,17,.12); overflow:hidden; opacity:0; }
.pasek i { display:block; height:100%; width:0; background:#FF4A1C; border-radius:9px; }
</style></head><body><div class="tlo"></div><div class="cien"></div><div class="fiolet"></div>
<div class="blok"><div class="cz">CZĘŚĆ <b>2</b></div><div class="kiedy">${esc(o.kiedy || 'JUTRO')}</div>
<div class="o">${esc(o.tekst)}</div><div class="pasek"><i></i></div></div>
<script>${WSPOLNE_JS}
const cz = document.querySelector('.cz'), kiedy = document.querySelector('.kiedy'), oo = document.querySelector('.o');
const pasek = document.querySelector('.pasek'), wyp = document.querySelector('.pasek i'), fiolet = document.querySelector('.fiolet');
window.setT = (t) => {
  rozmyj(t, 36, 0.86);
  fiolet.style.opacity = easeOut(clamp01((t - 0.1) / 0.5)).toFixed(3);
  const p1 = easeBack(clamp01((t - 0.12) / 0.32));
  cz.style.opacity = clamp01((t - 0.12) / 0.1);
  cz.style.transform = 'scale(' + (0.6 + 0.4 * p1).toFixed(3) + ')';
  cz.style.transformOrigin = 'left center';
  const p2 = easeOut(clamp01((t - 0.45) / 0.3));
  kiedy.style.opacity = p2; kiedy.style.transform = 'translateX(' + ((1 - p2) * -40).toFixed(1) + 'px)';
  const p3 = easeOut(clamp01((t - 0.65) / 0.3));
  oo.style.opacity = p3;
  pasek.style.opacity = p3;
  // Полоса доходит до половины: часть 1 из 2 — глаз дорисует вторую.
  wyp.style.width = (50 * easeOut(clamp01((t - 0.8) / 0.6))).toFixed(1) + '%';
};
</script></body></html>`;
}

function blysk(o, W, H, tlo, logo) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTY}<style>${BAZA(W, H, tlo)}
.kolo { position:absolute; left:50%; top:50%; width:300px; height:300px; margin:-210px 0 0 -150px; border-radius:50%;
  background:#FFFFFF; display:flex; align-items:center; justify-content:center;
  box-shadow:0 20px 80px rgba(255,74,28,.35); transform:scale(0); }
.kolo img { width:190px; height:190px; }
.adres { position:absolute; left:0; right:0; top:1150px; text-align:center; color:#111111; font-family:'Inter Tight','Inter',sans-serif; font-weight:900; font-size:96px;
  letter-spacing:-2px; opacity:0; }
.slowo { position:absolute; left:60px; right:60px; top:1290px; text-align:center; color:#111111; font-family:'Inter Tight','Inter',sans-serif; font-weight:900;
  font-size:84px; line-height:1.05; letter-spacing:-2px; text-transform:uppercase; opacity:0; }
.slowo b { color:#FF4A1C; }
.slowo small { display:block; font-family:'Instrument Serif',serif; font-style:italic; font-size:72px; letter-spacing:0; text-transform:none; font-weight:400; color:#55524C; margin-top:8px; }
.flash { position:absolute; inset:0; background:#fff; opacity:0; }
</style></head><body><div class="tlo"></div><div class="cien"></div><div class="fiolet"></div>
<div class="kolo">${logo ? `<img src="${logo}">` : ''}</div><div class="adres">${esc(o.adres || 'zovu.pl')}</div>${o.slowo ? `<div class="slowo">Napisz <b>${esc(o.slowo)}</b><small>w wiadomości</small></div>` : ''}<div class="flash"></div>
<script>${WSPOLNE_JS}
const kolo = document.querySelector('.kolo'), adres = document.querySelector('.adres');
const flash = document.querySelector('.flash'), fiolet = document.querySelector('.fiolet');
window.setT = (t) => {
  rozmyj(t / 0.6, 30, 0.86);
  fiolet.style.opacity = easeOut(clamp01(t / 0.25)).toFixed(3);
  const p = easeBack(clamp01((t - 0.05) / 0.28));
  kolo.style.transform = 'scale(' + p.toFixed(3) + ') rotate(' + ((1 - p) * -40).toFixed(1) + 'deg)';
  flash.style.opacity = (0.35 * Math.max(0, 1 - Math.abs(t - 0.2) / 0.08)).toFixed(3);
  const pa = easeOut(clamp01((t - 0.25) / 0.2));
  adres.style.opacity = pa; adres.style.transform = 'translateY(' + ((1 - pa) * 30).toFixed(1) + 'px)';
  const sl = document.querySelector('.slowo');
  if (sl) { const ps = easeBack(clamp01((t - 0.4) / 0.3)); sl.style.opacity = clamp01((t - 0.4) / 0.12); sl.style.transform = 'scale(' + (0.85 + 0.15 * ps).toFixed(3) + ')'; }
};
</script></body></html>`;
}

export function zakonczenieHtml(o, { W, H, tlo, logo }) {
  if (o.typ === 'pytanie') return pytanie(o, W, H, tlo);
  if (o.typ === 'wyslij') return wyslij(o, W, H, tlo);
  if (o.typ === 'seria') return seria(o, W, H, tlo);
  if (o.typ === 'blysk') return blysk(o, W, H, tlo, logo);
  throw new Error(`нет концовки «${o.typ}»`);
}
