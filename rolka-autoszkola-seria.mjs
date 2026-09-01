// Подарочные рилсы для катовицких автошкол — вторая и третья в серии.
// 15 с, вертикаль 1080x1920, 50 к/с, БЕЗ диктора, читается без звука.
//
//   node rolka-autoszkola-seria.mjs --szkola=silesia
//   node rolka-autoszkola-seria.mjs --szkola=akademia
//   node rolka-autoszkola-seria.mjs --szkola=wojtek
//   node rolka-autoszkola-seria.mjs --szkola=expert
//   node rolka-autoszkola-seria.mjs --szkola=oskx
//   node rolka-autoszkola-seria.mjs --szkola=silesia --podglad=0.9,3.1,9.0
//
// Первая школа (OSK 100%) собирается прежним rolka-autoszkola.mjs — там один
// макет на все сцены. Здесь у КАЖДОЙ школы свой макет и свой ритм: три ролика
// в одинаковой раскладке и другом цвете — это не серия, это копипаста.
//
//   silesia  — стоит на дате. Календарная лента доезжает до 3 сентября,
//              дальше день по часам (15:30 → 17:00), потом что в курсе.
//   akademia — стоит на цене и выборе. Счётчик 3400, потом чек-лист, который
//              РАСТЁТ внутри одной панели, и развилка на две дороги.
//
// Общее с первым роликом: палитра, жёлтая плашка вместо обводки, дорожная
// разметка в фоне, синтезированные щелчки под каждую посадку. Это и держит
// серию вместе.

import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const W = 1080;
const H = 1920;
const FPS = 50;
const SEK = 15.0;

const KOLOR = {
  ciemny: '#0d0820',
  ciemny2: '#180f3d',
  akcent: '#7c3aed',
  jasny: '#a78bfa',
  zolty: '#ffd23f',
  cichy: '#a79fc9',
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Ключевое слово на жёлтой подложке: белый слой снизу, тёмный внутри жёлтой
// плашки с растущей шириной. Плашка ВЫЕЗЖАЕТ по слову, а не включается кадром.
const hl = (tekst, id) =>
  `<span class="hl" id="${id}"><span class="pod">${esc(tekst)}</span>` +
  `<span class="nad"><i class="blysk"></i><span class="in">${esc(tekst)}</span></span></span>`;

// *17:00* — жёлтым то, что человек ищет глазами в строке.
const zolteGwiazdki = (s) => esc(s).replace(/\*(.+?)\*/g, '<b class="godz">$1</b>');

// ── общий низ страницы: фон, плашка, утилиты ──────────────────────
const BAZA_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{background:${KOLOR.ciemny};overflow:hidden;font-family:'Inter',sans-serif;
  -webkit-font-smoothing:antialiased}

#tlo{position:absolute;inset:0;
  background:linear-gradient(175deg,${KOLOR.ciemny2} 0%,${KOLOR.ciemny} 62%,#08051a 100%)}
#lampa{position:absolute;left:-10%;top:-14%;width:120%;height:90%;
  background:radial-gradient(ellipse 46% 42% at 50% 45%, rgba(124,58,237,.55), rgba(124,58,237,0) 68%)}
#lampa2{position:absolute;left:-20%;bottom:-24%;width:140%;height:70%;
  background:radial-gradient(ellipse 40% 46% at 50% 50%, rgba(167,139,250,.20), rgba(0,0,0,0) 70%)}
/* Дорожная разметка: два ряда штрихов уплывают вверх с разной скоростью.
   Тема читается боковым зрением, кадр не стоит на месте ни секунды. */
.pas{position:absolute;top:-260px;height:${H + 520}px;width:16px;border-radius:8px;
  background:repeating-linear-gradient(to bottom, rgba(255,255,255,.16) 0 96px, rgba(255,255,255,0) 96px 216px)}
#pas1{left:82px}
#pas2{right:96px;width:10px;opacity:.6}
#ziarno{position:absolute;inset:0;opacity:.05;
  background-image:radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px);
  background-size:5px 5px}

.hl{position:relative;display:inline-block;padding:16px 18px 18px;border-radius:18px}
.hl .pod{color:#fff;text-shadow:0 6px 26px rgba(0,0,0,.5)}
.hl .nad{position:absolute;left:0;top:0;bottom:0;width:0;overflow:hidden;
  background:${KOLOR.zolty};border-radius:18px;padding:16px 18px 18px;
  box-shadow:0 14px 34px rgba(255,210,63,.28)}
.hl .nad .in{position:relative;display:block;white-space:nowrap;color:#150e33;text-shadow:none}
/* Блик по плашке. Без него финальные секунды дают почти нулевую разницу
   кадров — то есть стоп-кадр вместо кадра. */
.hl .blysk{position:absolute;top:-30%;bottom:-30%;left:0;width:170px;
  background:linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.55) 50%, rgba(255,255,255,0) 100%);
  transform:skewX(-16deg) translateX(-400px)}

.kicker{font-weight:800;letter-spacing:7px;color:${KOLOR.jasny};text-align:center}
.licz{font-variant-numeric:tabular-nums}
.godz{color:${KOLOR.zolty}}
.cienEl{position:absolute;border-radius:50%;
  background:radial-gradient(ellipse at center, rgba(0,0,0,.62), rgba(0,0,0,0) 72%);
  filter:blur(14px)}
`;

const HELPERY_JS = `
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// Лёгкий перелёт на посадке: предмет чуть проскакивает и возвращается.
// Без него въезд читается как перемещение картинки, а не как приход предмета.
const easeBack = (x) => {
  const c = 1.42;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
// Дыхание после посадки: кадр обязан жить, когда всё уже прилетело.
const fala = (t, f, s = 1.55) => Math.sin(t * s + f);
const $ = (id) => document.getElementById(id);

let SZER = {};
function zmierz() {
  document.querySelectorAll('[data-fit]').forEach((e) => {
    const parts = e.dataset.fit.split(',').map(Number);
    const start = parts[0], min = parts[1], maxh = parts[2];
    let s = start;
    e.style.fontSize = s + 'px';
    while (s > min && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > maxh)) {
      s -= 2; e.style.fontSize = s + 'px';
    }
  });
  // Ширину жёлтой плашки меряем ОДИН раз: внутри setT замер поплывёт от кадра
  // к кадру из-за скруглений и теней.
  document.querySelectorAll('.hl').forEach((e) => {
    if (!e.id) e.id = 'hl' + Math.random().toString(36).slice(2);
    SZER[e.id] = e.getBoundingClientRect().width;
  });
}
function plama(id, p) {
  const e = document.getElementById(id);
  if (!e) return;
  e.querySelector('.nad').style.width = Math.round((SZER[id] || 0) * clamp01(p)) + 'px';
}
// Блик пробегает по каждой плашке по кругу; фаза от порядка, чтобы две плашки
// в кадре не вспыхивали разом.
function blyski(t) {
  document.querySelectorAll('.hl').forEach((e, i) => {
    const b = e.querySelector('.blysk');
    if (!b) return;
    const szer = (SZER[e.id] || 300) + 340;
    const faza = ((t * 0.46 + i * 0.37) % 1);
    b.style.transform = 'skewX(-16deg) translateX(' + (faza * szer - 240).toFixed(0) + 'px)';
  });
}
// Приход предмета: со сдвигом и поворотом по двум осям — это и есть
// трёхмерность, которой не даёт простое перемещение.
function wjazd(el, p, opts) {
  opts = opts || {};
  const dy = (opts.dy == null ? 46 : opts.dy) * (1 - p);
  const dx = (opts.dx == null ? 0 : opts.dx) * (1 - p);
  const ry = (opts.ry == null ? 0 : opts.ry) * (1 - p);
  const rx = (opts.rx == null ? 0 : opts.rx) * (1 - p);
  const sc = 1 - (opts.sc == null ? 0 : opts.sc) * (1 - p);
  el.style.transform =
    'perspective(1500px) translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)' +
    ' rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)' +
    ' scale(' + sc.toFixed(3) + ')' + (opts.po || '');
}
function licznik(el, p, doWartosci) {
  if (!el) return;
  el.textContent = Math.round(easeOut(clamp01(p)) * doWartosci);
}
// Контактная тень: живёт вместе с предметом, иначе он висит в пустоте.
function cien(el, widocznosc, kolysanie) {
  if (!el) return;
  el.style.opacity = (widocznosc * (0.62 - kolysanie * 0.03)).toFixed(3);
  el.style.transform = 'scaleX(' + (0.94 - kolysanie * 0.008).toFixed(3) + ')';
}
function tlo(t) {
  $('pas1').style.transform = 'translateY(' + (-((t * 132) % 216)).toFixed(1) + 'px)';
  $('pas2').style.transform = 'translateY(' + (-((t * 86) % 216)).toFixed(1) + 'px)';
  const l = $('lampa');
  l.style.transform =
    'translate(' + (fala(t, 0, .55) * 26).toFixed(1) + 'px,' + (fala(t, 1.7, .42) * 20).toFixed(1) + 'px)' +
    ' scale(' + (1 + fala(t, .6, .5) * .04).toFixed(3) + ')';
  $('lampa2').style.transform = 'translate(' + (fala(t, 2.2, .38) * -30).toFixed(1) + 'px,0)';
}
`;

const TLO_HTML = `
<div id="tlo"><div id="lampa"></div><div id="lampa2"></div></div>
<div class="pas" id="pas1"></div>
<div class="pas" id="pas2"></div>
<div id="ziarno"></div>`;

function dokument(css, body, skrypt) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900&family=Playfair+Display:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>${BAZA_CSS}${css}</style></head><body>
${TLO_HTML}
${body}
<script>${HELPERY_JS}
window.__fit = zmierz;
${skrypt}
</script></body></html>`;
}

// ══════════════════════════════════════════════════════════════════
// ШКОЛА 1 — OSK SILESIA. Ролик стоит на дате.
// Все числа с osksilesia.pl: 3800 zł kat. B, раты 0%, 30 h теории,
// 30 h езды, старт 3 сентября (badania 15:30, otwarcie 17:00),
// дальше 14.09, 1.10, 29.10, badania lekarskie 200 zł отдельно.
// ══════════════════════════════════════════════════════════════════
const SILESIA = {
  plik: 'Silesia_3wrzesnia',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/Silesia_3wrzesnia.mp4',
  szkola: 'OSK SILESIA',
  muzyka: 'pixabay-creative-technology-showreel.mp3',
  muzykaOd: 30,

  T: {
    // Календарная лента доезжает до тройки — дата не появляется, а ДОЕЗЖАЕТ.
    hak: { a: -0.10, tasma: 0.18, spin: 0.72, zolty: 0.94, mies: 1.02, chip: 1.32, wyjscie: 2.10 },
    // Два часа этого дня, потом — что в курсе. Группы СМЕНЯЮТСЯ, не копятся.
    // Группы ПЕРЕСЕКАЮТСЯ на 0.2 с: если дождаться, пока уедет первая,
    // между ними встаёт пустой кадр — в пятнадцатисекундном ролике это дыра.
    dzien: { a: 2.24, tytA: 2.30, a1: 2.42, a2: 3.34, wyjA: 4.36,
             tytB: 4.50, b1: 4.60, b2: 5.56, b3: 6.52, wyjscie: 8.24 },
    cena: { a: 8.44, kicker: 8.50, licznik: 8.62, raty: 9.50, uwaga: 10.14, wyjscie: 11.46 },
    fin: { a: 11.62, kicker: 11.66, l1: 11.82, kreska: 12.08, chip: 12.28, krok: 0.22, marka: 13.22 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: T.hak.a + 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.a + T.hak.spin - 0.02, typ: 'dun', gl: 0.9 });
    z.push({ t: T.hak.a + T.hak.zolty + 0.02, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.a + T.hak.mies + 0.04, typ: 'klik', gl: 0.5 });
    z.push({ t: T.hak.a + T.hak.chip + 0.04, typ: 'klik', gl: 0.42 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    [T.dzien.a1, T.dzien.a2].forEach((x) => z.push({ t: x + 0.16, typ: 'dun', gl: 0.62 }));
    z.push({ t: T.dzien.wyjA + 0.02, typ: 'swist', gl: 0.5 });
    [T.dzien.b1, T.dzien.b2, T.dzien.b3].forEach((x) =>
      z.push({ t: x + 0.16, typ: 'klik', gl: 0.62 })
    );
    z.push({ t: T.dzien.wyjscie + 0.02, typ: 'swist', gl: 0.58 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.cena.raty + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.uwaga + 0.12, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.58 });
    for (let i = 0; i < 3; i++) z.push({ t: T.fin.chip + i * T.fin.krok + 0.14, typ: 'klik', gl: 0.48 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const dni = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const komorki = dni
      .map(
        (d, i) =>
          `<div class="kom" data-i="${i}"><span class="bia">${d}</span>` +
          `<span class="zolt"><i>${d}</i></span></div>`
      )
      .join('');

    const godzKarta = (i, godzina, tytul) =>
      `<div class="godzK" data-i="${i}">
  <div class="cienEl kcien"></div>
  <div class="odz">${esc(godzina)}</div>
  <div class="opis" data-fit="62,34,130">${esc(tytul)}</div>
</div>`;

    const kursKarta = (i, prawo, tytul, pod) =>
      `<div class="kursK" data-i="${i}">
  <div class="cienEl kcien"></div>
  <div class="kl">
    <div class="ktyt" data-fit="54,30,80">${esc(tytul)}</div>
    <div class="kpod">${esc(pod)}</div>
  </div>
  <div class="kp">${prawo}</div>
</div>`;

    const chipy = ['*14* WRZEŚNIA', '*1* PAŹDZIERNIKA', '*29* PAŹDZIERNIKA']
      .map((c, i) => `<div class="chip" data-i="${i}">${zolteGwiazdki(c)}</div>`)
      .join('\n');

    const css = `
/* ── 0–2.3 с: дата приезжает лентой ───────────────────────────── */
#hak{position:absolute;left:0;right:0;top:0;height:${H}px}
#hKicker{position:absolute;left:70px;right:70px;top:430px;font-size:40px}
#tasma{position:absolute;left:0;right:0;top:522px;height:216px;overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,rgba(0,0,0,0) 0,#000 22%,#000 78%,rgba(0,0,0,0) 100%)}
#ruch{position:absolute;left:0;top:0;height:216px;white-space:nowrap}
.kom{position:relative;display:inline-block;width:180px;height:216px;margin-right:16px;
  vertical-align:top;border-radius:26px;text-align:center;
  background:linear-gradient(140deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.kom span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:118px;letter-spacing:-4px}
.kom .bia{color:#fff;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.kom .zolt{opacity:0;background:${KOLOR.zolty};border-radius:26px;
  box-shadow:0 18px 44px rgba(255,210,63,.34)}
.kom .zolt i{font-style:normal;color:#150e33}
#ramka{position:absolute;left:${540 - 100}px;top:512px;width:200px;height:236px;
  border:5px solid rgba(167,139,250,.85);border-radius:30px;
  box-shadow:0 0 30px rgba(167,139,250,.35), inset 0 0 24px rgba(167,139,250,.15)}
#hMies{position:absolute;left:70px;right:70px;top:786px;text-align:center;
  font-weight:900;font-size:124px;letter-spacing:-5px;color:#fff;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#hChip{position:absolute;left:220px;right:220px;top:952px;height:112px;border-radius:24px;
  display:flex;align-items:center;justify-content:center;gap:18px;
  font-weight:800;font-size:52px;color:#fff;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 20px 50px rgba(0,0,0,.4)}
#hakCien{left:24%;right:24%;top:1096px;height:44px}

/* ── 2.4–8.3 с: этот день по часам, потом что в курсе ─────────── */
#dzien{position:absolute;inset:0}
#tytA,#tytB{position:absolute;left:70px;right:70px;font-size:44px;opacity:0}
#tytA{top:522px}
#tytB{top:436px}
.godzK{position:absolute;left:70px;right:70px;height:236px;border-radius:32px;
  padding:0 40px;display:flex;align-items:center;gap:34px;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 28px 64px rgba(0,0,0,.44)}
.godzK[data-i="0"]{top:682px}
.godzK[data-i="1"]{top:962px}
.godzK .odz{flex:0 0 268px;height:150px;border-radius:22px;display:flex;align-items:center;
  justify-content:center;font-weight:900;font-size:76px;letter-spacing:-2px;color:${KOLOR.zolty};
  border:4px solid rgba(255,210,63,.55);background:rgba(255,210,63,.08)}
.godzK .opis{flex:1;font-weight:900;font-size:62px;line-height:1.04;letter-spacing:-2px;color:#fff;
  text-shadow:0 4px 18px rgba(0,0,0,.45)}
.kcien{left:7%;right:7%;bottom:-28px;height:44px;opacity:0}
.kursK{position:absolute;left:70px;right:70px;height:222px;border-radius:30px;
  padding:0 36px;display:flex;align-items:center;gap:24px;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.11), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 26px 60px rgba(0,0,0,.42)}
.kursK[data-i="0"]{top:568px}
.kursK[data-i="1"]{top:844px}
.kursK[data-i="2"]{top:1120px}
.kursK .kl{flex:1;min-width:0}
.kursK .ktyt{font-weight:900;font-size:58px;line-height:1;letter-spacing:-2px;color:#fff;
  white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
.kursK .kpod{margin-top:10px;font-family:'Playfair Display',serif;font-style:italic;
  font-size:36px;color:${KOLOR.cichy}}
.kursK .kp{flex:0 0 auto;text-align:right;font-weight:900;font-size:96px;letter-spacing:-3px;
  color:#fff;white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.kursK .kp .jedn{font-size:54px;color:${KOLOR.zolty}}
.kursK .kp .hl{font-size:44px}

/* ── 8.5–11.6 с: цена, раты и честная доплата ─────────────────── */
#cena{position:absolute;inset:0;opacity:0}
#cKicker{position:absolute;left:70px;right:70px;top:498px;font-size:42px;opacity:0}
#cCena{position:absolute;left:70px;right:70px;top:576px;text-align:center;
  font-weight:900;font-size:210px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#cCena .jedn{font-size:118px;color:${KOLOR.zolty};letter-spacing:-4px}
#cCien{left:26%;right:26%;top:830px;height:46px;opacity:0}
#cRaty{position:absolute;left:70px;right:70px;top:896px;text-align:center;opacity:0}
#cRaty .hl{font-size:92px;font-weight:900;letter-spacing:-2px}
#cUwaga{position:absolute;left:150px;right:150px;top:1094px;border-radius:22px;
  text-align:center;padding:22px 26px 26px;
  border:3px dashed rgba(167,139,250,.45);color:${KOLOR.cichy};
  font-weight:700;font-size:40px;line-height:1.24;opacity:0}
#cUwaga b{color:#fff}

/* ── 11.7–15 с: следующие даты и марка ────────────────────────── */
#fin{position:absolute;inset:0;opacity:0}
#dKicker{position:absolute;left:60px;right:60px;top:404px;font-size:34px;letter-spacing:5px;opacity:0}
#dL1{position:absolute;left:70px;right:70px;top:466px;text-align:center;
  font-weight:900;font-size:100px;letter-spacing:-3px;color:#fff;opacity:0;
  text-shadow:0 8px 30px rgba(0,0,0,.5)}
#dKreska{position:absolute;left:240px;top:600px;width:600px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
.chip{position:absolute;left:168px;right:168px;height:112px;border-radius:24px;
  display:flex;align-items:center;justify-content:center;text-align:center;
  font-weight:800;font-size:50px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 20px 50px rgba(0,0,0,.4)}
.chip .godz{margin-right:.28em}
.chip[data-i="0"]{top:656px}
.chip[data-i="1"]{top:794px}
.chip[data-i="2"]{top:932px}
#marka{position:absolute;left:60px;right:60px;top:1130px;text-align:center;opacity:0}
#marka .nazwa{font-weight:900;font-size:118px;letter-spacing:-5px;color:#fff;white-space:nowrap;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#marka .miasto{margin-top:10px;font-weight:800;font-size:48px;letter-spacing:12px;color:${KOLOR.zolty}}
#marka .www{margin-top:22px;font-weight:600;font-size:44px;color:${KOLOR.cichy}}
#markaCien{left:28%;right:28%;top:1396px;height:44px;opacity:0}
`;

    const body = `
<div id="hak">
  <div id="hKicker" class="kicker">NAJBLIŻSZY KURS</div>
  <div id="tasma"><div id="ruch">${komorki}</div></div>
  <div id="ramka"></div>
  <div id="hMies">WRZEŚNIA</div>
  <div id="hChip"><span>CZWARTEK</span><span class="godz">17:00</span></div>
</div>
<div id="hakCien" class="cienEl"></div>

<div id="dzien">
  <div id="tytA" class="kicker">TEGO DNIA</div>
  <div id="tytB" class="kicker">A W KURSIE</div>
  ${godzKarta(0, '15:30', 'BADANIA LEKARSKIE')}
  ${godzKarta(1, '17:00', 'OTWARCIE KURSU')}
  ${kursKarta(0, '<span class="licz" data-do="30">0</span><span class="jedn"> h</span>', 'TEORIA', 'z kursem pierwszej pomocy')}
  ${kursKarta(1, '<span class="licz" data-do="30">0</span><span class="jedn"> h</span>', 'JAZDY', 'Skoda Fabia, Toyota Yaris')}
  ${kursKarta(2, hl('W CENIE', 'kursHl'), 'EGZAMINY WEWNĘTRZNE', 'i baza pytań egzaminacyjnych')}
</div>

<div id="cena">
  <div id="cKicker" class="kicker">KURS KATEGORII B</div>
  <div id="cCena"><span class="licz" data-do="3800">0</span><span class="jedn"> zł</span></div>
  <div id="cCien" class="cienEl"></div>
  <div id="cRaty">${hl('RATY 0%', 'ratyHl')}</div>
  <div id="cUwaga">badania lekarskie <b>200 zł</b><br>płatne osobno</div>
</div>

<div id="fin">
  <div id="dKicker" class="kicker">JEŚLI NIE ZDĄŻYSZ NA 3 WRZEŚNIA</div>
  <div id="dL1">KOLEJNE STARTY</div>
  <div id="dKreska"></div>
  ${chipy}
  <div id="marka">
    <div class="nazwa">OSK SILESIA</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">osksilesia.pl</div>
  </div>
  <div id="markaCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const KROK = 196;                 // ширина ячейки 180 + зазор 16
const CEL = 540 - (2 * KROK + 90); // третье сентября точно по центру рамки
const START = CEL + 2 * KROK;      // лента приезжает на две ячейки

const komorki = [].slice.call(document.querySelectorAll('.kom'));
const godzK = [].slice.call(document.querySelectorAll('.godzK'));
const kursK = [].slice.call(document.querySelectorAll('.kursK'));
const chipy = [].slice.call(document.querySelectorAll('.chip'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.3 с: дата приезжает ───────────────────────────────────
  {
    const h = $('hak'), c = $('hakCien'), r = $('ramka');
    const wej = easeOut(clamp01((t - T.hak.a) / 0.36));
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wej > 0 && wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    c.style.display = widok ? 'block' : 'none';
    r.style.display = widok ? 'block' : 'none';
    if (widok) {
      const zyc = fala(t, 0.4) * 4;
      h.style.opacity = Math.min(wej, 1 - wyj);
      h.style.transform = 'translate3d(0,' + (-wyj * 80 + zyc).toFixed(1) + 'px,0)' +
        ' scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      // Лента: плавный разгон и торможение, на посадке — короткий отскок,
      // как у механического табло. Резкого старта нет намеренно: на 50 к/с
      // он дал бы рывок в 40+ пикселей за кадр.
      const s = clamp01((t - T.hak.a - T.hak.tasma) / (T.hak.spin - T.hak.tasma));
      let x = START + (CEL - START) * easeInOut(s);
      const po = t - T.hak.a - T.hak.spin;
      if (po > 0) x += Math.exp(-po * 9) * Math.sin(po * 26) * 9;
      $('ruch').style.transform = 'translateX(' + x.toFixed(1) + 'px)';
      r.style.opacity = (Math.min(wej, 1 - wyj) * (0.5 + 0.5 * s)).toFixed(3);
      r.style.transform = 'scale(' + (1 + fala(t, 0, 2.2) * 0.006 + (1 - s) * 0.03).toFixed(4) + ')';

      const zol = easeOut(clamp01((t - T.hak.a - T.hak.zolty) / 0.20));
      komorki.forEach((k, i) => {
        const akt = i === 2 ? zol : 0;
        k.querySelector('.zolt').style.opacity = akt;
        k.querySelector('.bia').style.opacity = 1 - akt;
        k.style.transform = 'scale(' + (1 + akt * 0.06 + (i === 2 ? fala(t, 0, 2.0) * 0.006 : 0)).toFixed(4) + ')';
      });

      const pm = easeBack(clamp01((t - T.hak.a - T.hak.mies) / 0.40));
      const m = $('hMies');
      m.style.opacity = easeOut(clamp01((t - T.hak.a - T.hak.mies) / 0.24)) * (1 - wyj);
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 46 + fala(t, 1.1) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -20).toFixed(2) + 'deg)';

      const pc = easeBack(clamp01((t - T.hak.a - T.hak.chip) / 0.40));
      const ch = $('hChip');
      ch.style.opacity = easeOut(clamp01((t - T.hak.a - T.hak.chip) / 0.24)) * (1 - wyj);
      ch.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pc) * 40 + fala(t, 2.0, 1.3) * 3).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pc) * -18 + fala(t, 2.0, 1.3) * 0.8).toFixed(2) + 'deg)';

      cien(c, Math.min(wej, 1 - wyj), fala(t, 0.4) * 4);
    }
  }

  // ── 2.4–8.3 с: день по часам, потом курс ──────────────────────
  {
    const d = $('dzien');
    const wyj = easeIn(clamp01((t - T.dzien.wyjscie) / 0.30));
    const widok = t > T.dzien.a - 0.05 && wyj < 1;
    d.style.display = widok ? 'block' : 'none';
    if (widok) {
      d.style.opacity = 1 - wyj;

      const pa = easeOut(clamp01((t - T.dzien.tytA) / 0.26));
      const wa = easeIn(clamp01((t - T.dzien.wyjA) / 0.26));
      const ta = $('tytA');
      ta.style.opacity = pa * (1 - wa);
      ta.style.transform = 'translateY(' + ((1 - pa) * 18 - wa * 30).toFixed(1) + 'px)';

      const pb = easeOut(clamp01((t - T.dzien.tytB) / 0.26));
      const tb = $('tytB');
      tb.style.opacity = pb * (1 - wyj);
      tb.style.transform = 'translateY(' + ((1 - pb) * 18).toFixed(1) + 'px)';

      // Группа «этого дня»: приходит слева, уходит влево. Часы — жёлтой
      // рамкой, чтобы взгляд цеплялся за 15:30 и 17:00, а не за подпись.
      godzK.forEach((k, i) => {
        const a = i === 0 ? T.dzien.a1 : T.dzien.a2;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const w = easeIn(clamp01((t - T.dzien.wyjA - i * 0.05) / 0.26));
        const vid = Math.min(easeOut(p), 1 - w);
        k.style.opacity = vid;
        const zy = fala(t, i * 1.2) * 4;
        wjazd(k, easeBack(p), {
          dy: 22, dx: -150, ry: -18, rx: 6, sc: 0.07,
          po: ' translate3d(' + (-w * 220).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.2 + 0.7, 1.2) * 1.2).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.kcien'), vid, zy);
      });

      // Группа «в курсе»: приходит справа — направление смены читается как
      // перелистывание, а не как добавление ещё трёх строк к прежним.
      kursK.forEach((k, i) => {
        const a = [T.dzien.b1, T.dzien.b2, T.dzien.b3][i];
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const w = easeIn(clamp01((t - T.dzien.wyjscie - i * 0.04) / 0.26));
        const vid = Math.min(easeOut(p), 1 - w);
        k.style.opacity = vid;
        const zy = fala(t, i * 1.15 + 0.4) * 3.6;
        wjazd(k, easeBack(p), {
          dy: 24, dx: 140, ry: 16, rx: 5, sc: 0.06,
          po: ' translate3d(' + (w * 120).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.15, 1.2) * 1.1).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.kcien'), vid, zy);
        licznik(k.querySelector('.licz'), (t - a - 0.12) / 0.52, 30);
        if (i === 2) plama('kursHl', easeOut(clamp01((t - a - 0.22) / 0.28)));
      });
    }
  }

  // ── 8.5–11.6 с: цена ──────────────────────────────────────────
  {
    const c = $('cena');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;
      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const ck = $('cKicker');
      ck.style.opacity = pk;
      ck.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('cCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      // Цена ЩЁЛКАЕТ от нуля: готовое число зритель пролистывает.
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.80, 3800);
      cien($('cCien'), easeOut(pl), zy);

      const pr = easeBack(clamp01((t - T.cena.raty) / 0.42));
      const cr = $('cRaty');
      cr.style.opacity = easeOut(clamp01((t - T.cena.raty) / 0.26));
      cr.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pr) * 40 + fala(t, 2.4, 1.2) * 3).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pr) * -18).toFixed(2) + 'deg)';
      plama('ratyHl', easeOut(clamp01((t - T.cena.raty - 0.14) / 0.30)));

      // Доплату говорим сами. Всё равно узнают на месте, а сказанная цифра
      // читается как честность, а не как мелкий шрифт.
      const pu = easeOut(clamp01((t - T.cena.uwaga) / 0.34));
      const cu = $('cUwaga');
      cu.style.opacity = pu * 0.96;
      cu.style.transform = 'translateY(' + ((1 - pu) * 22 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 11.7–15 с: следующие даты и марка ─────────────────────────
  {
    const f = $('fin');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      // Медленный наезд: в аутро нечему прилетать, и без камеры последняя
      // секунда даёт нулевую разницу кадров, то есть стоп-кадр.
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const dk = $('dKicker');
      dk.style.opacity = pk;
      dk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.40));
      const l1 = $('dL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 44 + fala(t, 0.2) * 2.4).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -18).toFixed(2) + 'deg)';

      $('dKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      chipy.forEach((c, i) => {
        const a = T.fin.chip + i * T.fin.krok;
        const p = easeBack(clamp01((t - a) / 0.38));
        c.style.opacity = easeOut(clamp01((t - a) / 0.24));
        const zy = fala(t, i * 1.5 + 2.0) * 3;
        const bok = i === 1 ? 70 : -70;
        c.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * bok).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * (i === 1 ? 14 : -14) + fala(t, i * 1.5, 1.2) * 1.0).toFixed(2) + 'deg)';
      });

      const m = $('marka');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('markaCien'), pmo * 0.9, zy);
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.34) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};

// ══════════════════════════════════════════════════════════════════
// ШКОЛА 2 — AKADEMIA JAZDY KATOWICE. Ролик стоит на цене и выборе.
// Числа с akademiajazdy.katowice.pl: 3400 zł базовый, 3800 zł экспресс,
// 30 h теории, 30 h езды, материалы, доучивание 130 zł/h, раты
// индивидуально, ul. Młyńska 3/4. Слов «najtańsza» и «najlepsza» нет —
// мы не проверяли все школы и не имеем права говорить это за клиента.
// ══════════════════════════════════════════════════════════════════
const AKADEMIA = {
  plik: 'AkademiaJazdy_3400',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/AkademiaJazdy_3400.mp4',
  szkola: 'AKADEMIA JAZDY',
  muzyka: 'pixabay-creative-technology-showreel.mp3',
  muzykaOd: 74,

  T: {
    hak: { a: -0.20, licznik: -0.16, kreska: 0.66, pod: 0.84, wyjscie: 2.16 },
    lista: { a: 2.36, odznaka: 2.42, kicker: 2.64, r1: 2.86, r2: 3.98, r3: 5.10, stopka: 6.40, wyjscie: 8.10 },
    // Развилка — подпись ролика. Две дороги растут из одной точки.
    wybor: { a: 8.24, kicker: 8.28, wezel: 8.36, linie: 8.44, lewo: 8.62, prawo: 8.90, roznica: 10.40, wyjscie: 12.06 },
    fin: { a: 12.22, kicker: 12.26, l1: 12.42, pod: 12.80, kreska: 13.00, marka: 13.26 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: T.hak.a + 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: 0.06, typ: 'dun', gl: 0.9 });
    z.push({ t: T.hak.kreska + 0.02, typ: 'klik', gl: 0.5 });
    z.push({ t: T.hak.pod + 0.04, typ: 'klik', gl: 0.4 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    z.push({ t: T.lista.odznaka + 0.30, typ: 'klik', gl: 0.6 });
    [T.lista.r1, T.lista.r2, T.lista.r3].forEach((x) => z.push({ t: x + 0.18, typ: 'klik', gl: 0.62 }));
    z.push({ t: T.lista.stopka + 0.10, typ: 'klik', gl: 0.32 });
    z.push({ t: T.lista.wyjscie + 0.02, typ: 'swist', gl: 0.58 });
    z.push({ t: T.wybor.linie + 0.06, typ: 'swist', gl: 0.42 });
    z.push({ t: T.wybor.lewo + 0.18, typ: 'dun', gl: 0.72 });
    z.push({ t: T.wybor.prawo + 0.18, typ: 'dun', gl: 0.72 });
    z.push({ t: T.wybor.roznica + 0.12, typ: 'klik', gl: 0.44 });
    z.push({ t: T.wybor.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, tytul, prawo) =>
      `<div class="wrz" data-i="${i}">
  <div class="ptak"><svg viewBox="0 0 76 76"><path class="kr" d="M21 39 L33 52 L56 24"/></svg></div>
  <div class="wtyt" data-fit="56,32,80">${esc(tytul)}</div>
  <div class="wpr">${prawo}</div>
</div>`;

    const sciezka = (bok, etyk, cena, pod) =>
      `<div class="scz" id="scz${bok}">
  <div class="cienEl scien"></div>
  <div class="setyk">${esc(etyk)}</div>
  <div class="scena"><span class="licz" data-do="${cena}">0</span><span class="jedn"> zł</span></div>
  <div class="spod">${esc(pod)}</div>
</div>`;

    const css = `
/* ── 0–2.3 с: цена как крючок ─────────────────────────────────── */
#hak{position:absolute;inset:0}
#hKicker{position:absolute;left:60px;right:60px;top:520px;font-size:40px}
#hCena{position:absolute;left:60px;right:60px;top:596px;text-align:center;
  font-weight:900;font-size:238px;letter-spacing:-12px;color:#fff;white-space:nowrap;
  text-shadow:0 14px 44px rgba(0,0,0,.55)}
#hCena .jedn{font-size:130px;color:${KOLOR.zolty};letter-spacing:-5px}
#hakCien{left:24%;right:24%;top:876px;height:48px}
#hKreska{position:absolute;left:290px;top:930px;width:500px;height:6px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#hPod{position:absolute;left:60px;right:60px;top:976px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:60px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–8.2 с: панель, которая РАСТЁТ построчно ──────────────── */
#lista{position:absolute;inset:0;opacity:0}
#odznaka{position:absolute;left:60px;right:60px;top:412px;text-align:center;opacity:0}
#odznaka .hl{font-size:76px;font-weight:900;letter-spacing:-2px}
#lKicker{position:absolute;left:60px;right:60px;top:560px;font-size:40px;opacity:0}
#panel{position:absolute;left:70px;right:70px;top:642px;height:120px;border-radius:34px;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 30px 70px rgba(0,0,0,.45);overflow:hidden}
#panelCien{left:9%;right:9%;top:0;height:48px;opacity:0}
.wrz{position:absolute;left:44px;right:44px;height:176px;display:flex;align-items:center;gap:30px;opacity:0}
.wrz + .wrz{border-top:0}
.ptak{position:relative;flex:0 0 76px;height:76px;border-radius:50%;
  background:rgba(255,210,63,.14);border:4px solid rgba(255,210,63,.55)}
/* Галочка — ОДИН росчерк, а не две полоски. Двумя было сделано ради
   дорисовки на ходу, но у них сходится только математика: скруглённые концы
   в углу дают утолщение, и в кадре это читается как залом. Захар посмотрел
   четыре варианта и выбрал линию.
   Рисуется тем же приёмом, что и раньше, только вместо растягивания полоски
   отпускается пунктир: длина контура 54, смещение от 54 до 0. */
.ptak svg{position:absolute;left:0;top:0;width:76px;height:76px;overflow:visible}
.ptak .kr{fill:none;stroke:${KOLOR.zolty};stroke-width:9;stroke-linecap:round;
  stroke-linejoin:round;stroke-dasharray:54;stroke-dashoffset:54}
/* Галочка рисуется двумя полосками: короткая идёт вниз-вправо, длинная —
   вверх. Обе растут из своего ЛЕВОГО конца (transform-origin:0 50%), поэтому
   начало длинной обязано совпадать с концом короткой. Не совпадало: разрыв
   был 10 px, и вместо галочки в кружке получалась пара палок под углом —
   Захар написал «это не галочки, а фиг пойми что», и он прав.

   Считаем стык честно. Короткая: начало (20, 36+4.5), поворот 45°, длина 22 —
   конец (35.6, 56.1). Длинная начинается ровно там: left 36, top 51 даёт
   начало (36, 55.5), расхождение полпикселя, его съедают скруглённые концы. */

.wtyt{flex:1;min-width:0;font-weight:900;font-size:56px;letter-spacing:-2px;color:#fff;
  white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
.wpr{flex:0 0 auto;text-align:right;font-weight:900;font-size:88px;letter-spacing:-3px;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.wpr .jedn{font-size:52px;color:${KOLOR.zolty}}
.wpr .hl{font-size:46px}
#stopka{position:absolute;left:120px;right:120px;top:1308px;text-align:center;
  font-weight:700;font-size:38px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#stopka b{color:#fff}

/* ── 8.3–12.1 с: развилка ─────────────────────────────────────── */
#wybor{position:absolute;inset:0;opacity:0}
#wKicker{position:absolute;left:60px;right:60px;top:482px;font-size:42px;opacity:0}
#wezel{position:absolute;left:512px;top:562px;width:56px;height:56px;border-radius:16px;
  background:${KOLOR.zolty};transform:rotate(45deg) scale(0);
  box-shadow:0 0 40px 10px rgba(255,210,63,.35)}
.linia{position:absolute;left:540px;top:586px;height:6px;border-radius:4px;
  background:linear-gradient(90deg,rgba(255,210,63,.9),rgba(167,139,250,.75));
  transform-origin:0 50%}
.scz{position:absolute;top:756px;width:452px;height:440px;border-radius:34px;padding:38px 26px 0;
  text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 30px 70px rgba(0,0,0,.45)}
#sczL{left:60px}
#sczP{right:60px}
.scien{left:8%;right:8%;bottom:-30px;height:46px;opacity:0}
.setyk{font-weight:800;font-size:40px;letter-spacing:4px;color:${KOLOR.jasny}}
.scena{margin-top:34px;font-weight:900;font-size:104px;letter-spacing:-4px;color:#fff;
  white-space:nowrap;text-shadow:0 8px 28px rgba(0,0,0,.5)}
.scena .jedn{font-size:62px;color:${KOLOR.zolty}}
.spod{margin-top:26px;font-family:'Playfair Display',serif;font-style:italic;
  font-size:42px;line-height:1.2;color:${KOLOR.cichy}}
#sczP .setyk{color:${KOLOR.zolty}}
#roznica{position:absolute;left:270px;right:270px;top:1270px;height:96px;border-radius:22px;
  display:flex;align-items:center;justify-content:center;gap:14px;opacity:0;
  font-weight:800;font-size:42px;color:${KOLOR.cichy};
  border:3px dashed rgba(167,139,250,.45)}
#roznica b{color:#fff}

/* ── 12.3–15 с: раты, адрес, марка ────────────────────────────── */
#fin{position:absolute;inset:0;opacity:0}
#fKicker{position:absolute;left:60px;right:60px;top:426px;font-size:40px;opacity:0}
#fL1{position:absolute;left:60px;right:60px;top:494px;text-align:center;opacity:0}
#fL1 .hl{font-size:124px;font-weight:900;letter-spacing:-4px}
#fPod{position:absolute;left:60px;right:60px;top:700px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:50px;color:${KOLOR.jasny};opacity:0}
#fKreska{position:absolute;left:270px;top:812px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#marka{position:absolute;left:50px;right:50px;top:906px;text-align:center;opacity:0}
#marka .nazwa{font-weight:900;font-size:112px;letter-spacing:-5px;line-height:1.0;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#marka .adres{margin-top:26px;font-weight:800;font-size:52px;letter-spacing:1px;color:${KOLOR.zolty}}
#marka .miasto{margin-top:12px;font-weight:800;font-size:44px;letter-spacing:12px;color:#fff}
#marka .www{margin-top:24px;font-weight:600;font-size:42px;color:${KOLOR.cichy}}
#markaCien{left:26%;right:26%;top:1240px;height:44px;opacity:0}
`;

    const body = `
<div id="hak">
  <div id="hKicker" class="kicker">KURS PRAWA JAZDY · KAT. B</div>
  <div id="hCena"><span class="licz" data-do="3400">0</span><span class="jedn"> zł</span></div>
  <div id="hakCien" class="cienEl"></div>
  <div id="hKreska"></div>
  <div id="hPod">kurs podstawowy</div>
</div>

<div id="lista">
  <div id="odznaka">${hl('3400 zł', 'odzHl')}</div>
  <div id="lKicker" class="kicker">W TEJ CENIE</div>
  <div id="panelCien" class="cienEl"></div>
  <div id="panel">
    ${wiersz(0, 'TEORIA', '<span class="licz" data-do="30">0</span><span class="jedn"> h</span>')}
    ${wiersz(1, 'JAZDY', '<span class="licz" data-do="30">0</span><span class="jedn"> h</span>')}
    ${wiersz(2, 'MATERIAŁY SZKOLENIOWE', hl('W CENIE', 'matHl'))}
  </div>
  <div id="stopka">poza kursem: jazdy doszkalające <b>130 zł/h</b></div>
</div>

<div id="wybor">
  <div id="wKicker" class="kicker">DWIE ŚCIEŻKI</div>
  <div id="wezel"></div>
  <div class="linia" id="liniaL"></div>
  <div class="linia" id="liniaP"></div>
  ${sciezka('L', 'PODSTAWOWY', 3400, 'standardowe tempo')}
  ${sciezka('P', 'EKSPRESOWY', 3800, 'szybciej')}
  <div id="roznica">różnica <b>400 zł</b></div>
</div>

<div id="fin">
  <div id="fKicker" class="kicker">PŁATNOŚĆ</div>
  <div id="fL1">${hl('W RATACH', 'ratyHl')}</div>
  <div id="fPod">warunki ustalane indywidualnie</div>
  <div id="fKreska"></div>
  <div id="marka">
    <div class="nazwa" data-fit="112,60,260">AKADEMIA JAZDY</div>
    <div class="adres">ul. Młyńska 3/4</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">akademiajazdy.katowice.pl</div>
  </div>
  <div id="markaCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.wrz'));
const CZAS_W = [T.lista.r1, T.lista.r2, T.lista.r3];
const GORA = 44;      // отступ сверху внутри панели
const WYS = 176;      // высота строки

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.3 с: цена ─────────────────────────────────────────────
  {
    const h = $('hak');
    const wej = clamp01((t - T.hak.licznik) / 0.46);
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = t > T.hak.a - 0.05 && wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const hk = $('hKicker');
      hk.style.opacity = pk;
      hk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const zy = fala(t, 0.5, 1.4) * 5;
      const c = $('hCena');
      c.style.opacity = easeOut(wej);
      c.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(wej)) * 64 + zy - wyj * 70).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(wej)) * -24 + fala(t, 0.5, 1.4) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(wej)) * 0.12 - wyj * 0.06).toFixed(3) + ')';
      // Счётчик 0 → 3400: цена — весь крючок, она обязана щёлкнуть.
      licznik(c.querySelector('.licz'), (t - T.hak.licznik) / 0.72, 3400);
      cien($('hakCien'), easeOut(wej) * (1 - wyj), zy);

      $('hKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.hak.kreska) / 0.38)).toFixed(3) + ')';
      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const p = $('hPod');
      p.style.opacity = pp * (1 - wyj);
      p.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.2, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–8.2 с: панель растёт построчно ────────────────────────
  {
    const l = $('lista');
    const wyj = easeIn(clamp01((t - T.lista.wyjscie) / 0.28));
    const widok = t > T.lista.a - 0.05 && wyj < 1;
    l.style.display = widok ? 'block' : 'none';
    if (widok) {
      l.style.opacity = 1 - wyj;

      // Цена не исчезает, а СЖИМАЕТСЯ в бирку наверху: связь со сценой
      // крючка остаётся, и зритель не теряет, о какой сумме речь.
      const po = easeOut(clamp01((t - T.lista.odznaka) / 0.52));
      const o = $('odznaka');
      o.style.opacity = po;
      o.style.transform = 'translate3d(0,' + ((1 - po) * 130 + fala(t, 1.4, 1.2) * 2.5).toFixed(1) + 'px,0)' +
        ' scale(' + (1 + (1 - po) * 0.5).toFixed(3) + ')';
      plama('odzHl', easeOut(clamp01((t - T.lista.odznaka - 0.26) / 0.30)));

      const pk = easeOut(clamp01((t - T.lista.kicker) / 0.28));
      const lk = $('lKicker');
      lk.style.opacity = pk;
      lk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      // Высота панели — сумма пришедших строк. Панель РАСТЁТ под каждым
      // пунктом, а не стоит готовой рамкой, в которую что-то падает.
      let wys = GORA;
      const p = [];
      wiersze.forEach((w, i) => {
        const s = easeOut(clamp01((t - CZAS_W[i]) / 0.44));
        p.push(s);
      });
      wiersze.forEach((w, i) => {
        let gora = GORA;
        for (let j = 0; j < i; j++) gora += WYS * p[j];
        const zy = fala(t, i * 1.3 + 0.6) * 2.6;
        w.style.top = (gora + zy).toFixed(1) + 'px';
        w.style.opacity = p[i];
        w.style.transform = 'perspective(1400px) translate3d(' + ((1 - p[i]) * 60).toFixed(1) + 'px,0,0)' +
          ' rotateY(' + ((1 - p[i]) * 12 + fala(t, i * 1.3, 1.15) * 0.8).toFixed(2) + 'deg)';
        // Галочка ДОРИСОВЫВАЕТСЯ двумя штрихами — это движение внутри строки.
        const k = clamp01((t - CZAS_W[i] - 0.14) / 0.26);
        w.querySelector('.kr').style.strokeDashoffset = (54 * (1 - easeOut(k))).toFixed(2);
        licznik(w.querySelector('.licz'), (t - CZAS_W[i] - 0.10) / 0.50, 30);
        wys += WYS * p[i];
      });
      wys += GORA;
      const panel = $('panel');
      panel.style.height = wys.toFixed(1) + 'px';
      panel.style.opacity = easeOut(clamp01((t - CZAS_W[0] + 0.18) / 0.34)).toFixed(3);
      panel.style.transform = 'perspective(1600px) rotateX(' + (fala(t, 1.0, 0.9) * 0.5).toFixed(2) + 'deg)' +
        ' translateY(' + (fala(t, 1.0, 0.9) * 3).toFixed(1) + 'px)';
      plama('matHl', easeOut(clamp01((t - CZAS_W[2] - 0.22) / 0.28)));
      const pc = $('panelCien');
      pc.style.top = (642 + wys + 12).toFixed(1) + 'px';
      cien(pc, easeOut(clamp01((t - CZAS_W[0]) / 0.44)), fala(t, 1.0, 0.9) * 3);

      const ps = easeOut(clamp01((t - T.lista.stopka) / 0.34));
      const st = $('stopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.0, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 8.3–12.1 с: развилка ──────────────────────────────────────
  {
    const w = $('wybor');
    const wyj = easeIn(clamp01((t - T.wybor.wyjscie) / 0.26));
    const widok = t > T.wybor.a - 0.05 && wyj < 1;
    w.style.display = widok ? 'block' : 'none';
    if (widok) {
      w.style.opacity = 1 - wyj;
      const pk = easeOut(clamp01((t - T.wybor.kicker) / 0.28));
      const wk = $('wKicker');
      wk.style.opacity = pk;
      wk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const pw = easeBack(clamp01((t - T.wybor.wezel) / 0.36));
      $('wezel').style.transform = 'rotate(' + (45 + fala(t, 0, 0.8) * 6).toFixed(1) + 'deg)' +
        ' scale(' + Math.max(0, pw * (1 + fala(t, 0, 2.4) * 0.06)).toFixed(3) + ')';

      // Две дороги растут из одного узла: развилка ДЕЛАЕТСЯ на глазах,
      // а не появляется готовой схемой.
      const pl = easeOut(clamp01((t - T.wybor.linie) / 0.40));
      const pr = easeOut(clamp01((t - T.wybor.linie - 0.10) / 0.40));
      $('liniaL').style.width = '292px';
      $('liniaL').style.transform = 'rotate(146deg) scaleX(' + pl.toFixed(3) + ')';
      $('liniaP').style.width = '292px';
      $('liniaP').style.transform = 'rotate(34deg) scaleX(' + pr.toFixed(3) + ')';

      [['sczL', T.wybor.lewo, -1, 3400], ['sczP', T.wybor.prawo, 1, 3800]].forEach((s, i) => {
        const el = $(s[0]);
        const p = clamp01((t - s[1]) / 0.46);
        if (p <= 0) { el.style.opacity = 0; return; }
        const e = easeBack(p);
        el.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.7 + 0.3, 1.3) * 5;
        wjazd(el, e, {
          dy: 40, dx: s[2] * 90, ry: s[2] * 18, rx: 10, sc: 0.10,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.7, 1.2) * 1.4).toFixed(2) + 'deg)',
        });
        cien(el.querySelector('.scien'), easeOut(p), zy);
        licznik(el.querySelector('.licz'), (t - s[1] - 0.12) / 0.56, s[3]);
      });

      const pz = easeOut(clamp01((t - T.wybor.roznica) / 0.34));
      const rz = $('roznica');
      rz.style.opacity = pz * 0.95;
      rz.style.transform = 'translateY(' + ((1 - pz) * 20 + fala(t, 3.6, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: раты, адрес, марка ─────────────────────────────
  {
    const f = $('fin');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('ratyHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('marka');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('markaCien'), pmo * 0.9, zy);
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.36) / 0.34));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.22) / 0.30));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};

// ══════════════════════════════════════════════════════════════════
// ШКОЛА 3 — OSK WOJTEK. Ролик стоит на «сдаёшь тем, чем ездил».
// Числа с oskwojtek.katowice.pl: 4000 zł kat. B, раты 0%, 30 h езды,
// курс ок. 8 недель, занятия 6:00–16:00 пн–пт, e-learning + доступ
// к базе вопросов WORD на 6 месяцев, доплаты 150 zł/h, пакет 10 h
// 1400 zł, аренда машины школы на экзамен 200 zł, площадка WORD
// 100 zł/30 мин. Сдаваемости нет — школа её не публикует.
//
// Свой ход этого ролика: ДВЕ МАШИНЫ СЪЕЗЖАЮТСЯ В ОДНУ. Ни у Silesia
// (лента календаря), ни у Akademia (растущая панель) такого нет.
// ══════════════════════════════════════════════════════════════════
const WOJTEK = {
  plik: 'WOJTEK_toauto',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/WOJTEK_toauto.mp4',
  szkola: 'OSK WOJTEK',
  muzyka: 'pixabay-audio_b7259abb71.mp3',
  muzykaOd: 40,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.48, pod: 0.98, wyjscie: 2.20 },
    // Съезд машин — сердце ролика. Карточки приходят с боков, между ними
    // встаёт знак равенства, потом они сходятся и становятся одной.
    zlacz: { a: 2.34, kicker: 2.38, karL: 2.54, karP: 2.78, rowna: 3.36,
             scal: 4.14, karM: 4.30, plyta: 4.66, pod: 5.12, wyjscie: 6.30 },
    kurs: { a: 6.44, kicker: 6.48, gauge: 6.60, etyk: 7.42, chip1: 7.70,
            chip2: 8.10, stopka: 8.64, wyjscie: 10.02 },
    cena: { a: 10.16, kicker: 10.22, licznik: 10.34, raty: 11.22, uwaga: 11.76, wyjscie: 12.44 },
    fin: { a: 12.58, kicker: 12.62, l1: 12.76, kreska: 13.02, marka: 13.26 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    z.push({ t: T.zlacz.karL + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.zlacz.karP + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.zlacz.rowna + 0.08, typ: 'klik', gl: 0.5 });
    z.push({ t: T.zlacz.scal + 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.zlacz.karM + 0.16, typ: 'dun', gl: 0.92 });
    z.push({ t: T.zlacz.plyta + 0.06, typ: 'klik', gl: 0.58 });
    z.push({ t: T.zlacz.pod + 0.06, typ: 'klik', gl: 0.3 });
    z.push({ t: T.zlacz.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    z.push({ t: T.kurs.gauge + 0.08, typ: 'dun', gl: 0.8 });
    z.push({ t: T.kurs.chip1 + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.kurs.chip2 + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.kurs.stopka + 0.10, typ: 'klik', gl: 0.32 });
    z.push({ t: T.kurs.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.cena.raty + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.uwaga + 0.12, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    // Машина собрана из div-ов: колёса крутятся всё время, пока карточка
    // в кадре. Это дешевле любого спрайта и не съезжает по кадрам.
    const auto = (kl) => `<div class="auto ${kl}">
  <div class="kadl"></div><div class="dach"></div><div class="szyba"></div>
  <div class="swiat"></div>
  <div class="kolo l"><i></i><i class="b"></i></div>
  <div class="kolo p"><i></i><i class="b"></i></div>
</div>`;

    const css = `
/* ── общая машина ─────────────────────────────────────────────── */
.auto{position:relative;width:300px;height:132px;margin:0 auto}
.auto .kadl{position:absolute;left:0;bottom:24px;width:300px;height:60px;
  border-radius:20px 30px 14px 14px;background:linear-gradient(160deg,#ffffff,#c6bdea);
  box-shadow:0 12px 30px rgba(0,0,0,.45)}
.auto .dach{position:absolute;left:78px;bottom:74px;width:152px;height:58px;
  border-radius:32px 36px 4px 4px;background:linear-gradient(160deg,#f1ecff,#ada2dc)}
.auto .szyba{position:absolute;left:92px;bottom:82px;width:124px;height:42px;
  border-radius:24px 26px 3px 3px;background:rgba(13,8,32,.72)}
.auto .swiat{position:absolute;right:4px;bottom:52px;width:24px;height:15px;border-radius:7px;
  background:${KOLOR.zolty};box-shadow:0 0 20px rgba(255,210,63,.75)}
.auto .kolo{position:absolute;bottom:0;width:60px;height:60px;border-radius:50%;
  background:#120c2c;border:7px solid #ded7fb}
.auto .kolo.l{left:32px}
.auto .kolo.p{right:32px}
.auto .kolo i{position:absolute;left:50%;top:50%;width:6px;height:32px;
  margin:-16px 0 0 -3px;border-radius:3px;background:#ded7fb}
.auto .kolo i.b{transform:rotate(90deg)}

/* ── 0–2.2 с: страх, который знает каждый ─────────────────────── */
#wHak{position:absolute;inset:0}
#wKicker{position:absolute;left:60px;right:60px;top:558px;font-size:40px}
#wL1{position:absolute;left:60px;right:60px;top:634px;text-align:center;
  font-weight:900;font-size:92px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#wL2{position:absolute;left:60px;right:60px;top:768px;text-align:center;opacity:0}
#wL2 .hl{font-size:84px;font-weight:900;letter-spacing:-3px}
#wHakCien{left:26%;right:26%;top:918px;height:44px}
#wPod{position:absolute;left:60px;right:60px;top:986px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:56px;color:${KOLOR.jasny};opacity:0}

/* ── 2.3–6.3 с: две машины съезжаются в одну ──────────────────── */
#zl{position:absolute;inset:0}
#zKicker{position:absolute;left:60px;right:60px;top:424px;font-size:40px;opacity:0}
.kar{position:absolute;top:580px;width:452px;height:400px;border-radius:34px;
  padding:32px 22px 0;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 30px 70px rgba(0,0,0,.45)}
#karL{left:48px}
#karP{right:48px}
.kar .etyk{font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny};white-space:nowrap}
.kar .autoBox{margin-top:22px}
.kar .dol{position:absolute;left:22px;right:22px;bottom:30px;font-weight:900;font-size:42px;
  color:#fff;white-space:nowrap;text-shadow:0 4px 16px rgba(0,0,0,.45)}
.karCien{left:8%;right:8%;bottom:-26px;height:42px;opacity:0}
.rown{position:absolute;left:508px;width:64px;height:12px;border-radius:6px;
  background:${KOLOR.zolty};transform-origin:50% 50%;transform:scaleX(0);
  box-shadow:0 0 26px rgba(255,210,63,.55)}
#rowA{top:756px}
#rowB{top:792px}
#karM{position:absolute;left:62px;right:62px;top:540px;height:504px;border-radius:38px;
  padding:56px 30px 0;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.14), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.24), 0 34px 80px rgba(0,0,0,.48)}
#karM .plyta{position:absolute;left:30px;right:30px;bottom:40px}
#karM .auto{transform:scale(1.34);transform-origin:50% 50%}
#karM .plyta .hl{font-size:82px;font-weight:900;letter-spacing:-3px}
#karMCien{left:13%;right:13%;top:1062px;height:48px;opacity:0}
#zPod{position:absolute;left:90px;right:90px;top:1128px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;line-height:1.26;
  color:${KOLOR.jasny};opacity:0}

/* ── 6.4–10 с: 30 часов на шкале, срок и часы ─────────────────── */
#ku{position:absolute;inset:0}
#kKicker{position:absolute;left:60px;right:60px;top:398px;font-size:40px;opacity:0}
#gaugeBox{position:absolute;left:350px;top:466px;width:380px;height:380px;opacity:0}
#gLicz{position:absolute;left:350px;top:580px;width:380px;text-align:center;
  font-weight:900;font-size:116px;letter-spacing:-5px;color:#fff;
  text-shadow:0 8px 30px rgba(0,0,0,.5)}
#gLicz .jedn{font-size:62px;color:${KOLOR.zolty}}
#gEtyk{position:absolute;left:60px;right:60px;top:876px;font-size:38px;opacity:0}
.kchip{position:absolute;left:110px;right:110px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;text-align:center;
  font-weight:800;font-size:46px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
.kchip[data-i="0"]{top:958px}
.kchip[data-i="1"]{top:1094px}
#kStopka{position:absolute;left:110px;right:110px;top:1258px;text-align:center;
  font-weight:700;font-size:38px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#kStopka b{color:#fff}

/* ── 10.2–12.4 с: цена, раты и честные доплаты ────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:70px;right:70px;top:474px;font-size:42px;opacity:0}
#ceCena{position:absolute;left:70px;right:70px;top:552px;text-align:center;
  font-weight:900;font-size:206px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .jedn{font-size:116px;color:${KOLOR.zolty};letter-spacing:-4px}
#ceCien{left:26%;right:26%;top:800px;height:46px;opacity:0}
#ceRaty{position:absolute;left:70px;right:70px;top:862px;text-align:center;opacity:0}
#ceRaty .hl{font-size:92px;font-weight:900;letter-spacing:-2px}
#ceUwaga{position:absolute;left:120px;right:120px;top:1060px;border-radius:22px;
  text-align:center;padding:24px 26px 28px;
  border:3px dashed rgba(167,139,250,.45);color:${KOLOR.cichy};
  font-weight:700;font-size:38px;line-height:1.3;opacity:0}
#ceUwaga b{color:#fff}

/* ── 12.6–15 с: развязка и марка ──────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:428px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:492px;text-align:center;opacity:0}
#fiL1 .hl{font-size:78px;font-weight:900;letter-spacing:-3px}
#fiKreska{position:absolute;left:270px;top:700px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:772px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:122px;letter-spacing:-5px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .miasto{margin-top:24px;font-weight:800;font-size:46px;letter-spacing:12px;color:${KOLOR.zolty}}
#mk .www{margin-top:24px;font-weight:600;font-size:42px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1108px;height:44px;opacity:0}
`;

    const body = `
<div id="wHak">
  <div id="wKicker" class="kicker">DZIEŃ EGZAMINU</div>
  <div id="wL1">SIADASZ W AUCIE,</div>
  <div id="wL2">${hl('KTÓREGO NIE ZNASZ', 'wHl')}</div>
  <div id="wHakCien" class="cienEl"></div>
  <div id="wPod">I szukasz sprzęgła.</div>
</div>

<div id="zl">
  <div id="zKicker" class="kicker">W OSK WOJTEK</div>
  <div class="kar" id="karL">
    <div class="cienEl karCien"></div>
    <div class="etyk">NA KURSIE</div>
    <div class="autoBox">${auto('mala')}</div>
    <div class="dol">30 godzin jazd</div>
  </div>
  <div class="kar" id="karP">
    <div class="cienEl karCien"></div>
    <div class="etyk">NA EGZAMINIE</div>
    <div class="autoBox">${auto('mala')}</div>
    <div class="dol">WORD Katowice</div>
  </div>
  <div class="rown" id="rowA"></div>
  <div class="rown" id="rowB"></div>
  <div id="karM">
    ${auto('duza')}
    <div class="plyta">${hl('TAKIE SAMO AUTO', 'mHl')}</div>
  </div>
  <div id="karMCien" class="cienEl"></div>
  <div id="zPod">Uczysz się na tych samych modelach,<br>którymi zdaje się egzamin.</div>
</div>

<div id="ku">
  <div id="kKicker" class="kicker">ZANIM WEJDZIESZ NA EGZAMIN</div>
  <div id="gaugeBox">
    <svg width="380" height="380" viewBox="0 0 380 380">
      <circle cx="190" cy="190" r="158" fill="none" stroke="rgba(255,255,255,.09)"
        stroke-width="30" stroke-linecap="round" stroke-dasharray="794 400"
        transform="rotate(126 190 190)"></circle>
      <circle id="gLuk" cx="190" cy="190" r="158" fill="none" stroke="${KOLOR.zolty}"
        stroke-width="30" stroke-linecap="round" stroke-dasharray="0 2000"
        transform="rotate(126 190 190)"></circle>
    </svg>
  </div>
  <div id="gLicz"><span class="licz" data-do="30">0</span><span class="jedn"> h</span></div>
  <div id="gEtyk" class="kicker">GODZIN ZA KIEROWNICĄ</div>
  <div class="kchip" data-i="0"><span>${zolteGwiazdki('kurs trwa *około 8 tygodni*')}</span></div>
  <div class="kchip" data-i="1"><span>${zolteGwiazdki('zajęcia *6:00 – 16:00*, pon–pt')}</span></div>
  <div id="kStopka">e-learning do teorii<br>i <b>baza pytań WORD na 6 miesięcy</b></div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">KURS KLASYCZNY · KAT. B</div>
  <div id="ceCena"><span class="licz" data-do="4000">0</span><span class="jedn"> zł</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="ceRaty">${hl('RATY 0%', 'ratyHl')}</div>
  <div id="ceUwaga">auto szkoły na egzamin <b>200 zł</b><br>dodatkowa godzina jazd <b>150 zł</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">NA KURSIE I NA EGZAMINIE</div>
  <div id="fiL1">${hl('TAKIM SAMYM AUTEM', 'finHl')}</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">OSK WOJTEK</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">oskwojtek.katowice.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const kola = [].slice.call(document.querySelectorAll('.auto .kolo'));
const kchipy = [].slice.call(document.querySelectorAll('.kchip'));

window.setT = (t) => {
  blyski(t);
  tlo(t);
  // Колёса крутятся всегда: пока машина в кадре, кадр не может замереть.
  const obrot = (t * 172).toFixed(1);
  kola.forEach((k) => { k.style.transform = 'rotate(' + obrot + 'deg)'; });

  // ── 0–2.2 с: страх ────────────────────────────────────────────
  {
    const h = $('wHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('wKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('wL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('wL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('wHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('wHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('wPod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.3–6.3 с: две машины → одна ──────────────────────────────
  {
    const z = $('zl');
    const wyj = easeIn(clamp01((t - T.zlacz.wyjscie) / 0.28));
    const widok = t > T.zlacz.a - 0.05 && wyj < 1;
    z.style.display = widok ? 'block' : 'none';
    if (widok) {
      z.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.zlacz.kicker) / 0.28));
      const kk = $('zKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      // Съезд: карточки идут навстречу и гаснут на подходе, чтобы стык
      // не читался как две картинки, положенные друг на друга.
      const sc = easeInOut(clamp01((t - T.zlacz.scal) / 0.36));
      const znik = clamp01((sc - 0.40) / 0.60);

      [['karL', T.zlacz.karL, -1], ['karP', T.zlacz.karP, 1]].forEach((s, i) => {
        const el = $(s[0]);
        const p = clamp01((t - s[1]) / 0.46);
        if (p <= 0) { el.style.opacity = 0; return; }
        const e = easeBack(p);
        el.style.opacity = (easeOut(p) * (1 - znik)).toFixed(3);
        const zy = fala(t, i * 1.6 + 0.4, 1.3) * 4.5;
        wjazd(el, e, {
          dy: 30, dx: s[2] * 150, ry: s[2] * 20, rx: 8, sc: 0.10,
          po: ' translate3d(' + (-s[2] * sc * 210).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.6, 1.2) * 1.4 + s[2] * sc * 12).toFixed(2) + 'deg)' +
              ' scale(' + (1 - sc * 0.16).toFixed(3) + ')',
        });
        cien(el.querySelector('.karCien'), easeOut(p) * (1 - znik), zy);
      });

      const pr = easeOut(clamp01((t - T.zlacz.rowna) / 0.30));
      ['rowA', 'rowB'].forEach((id, i) => {
        const e = $(id);
        const q = easeOut(clamp01((t - T.zlacz.rowna - i * 0.06) / 0.30));
        e.style.opacity = (1 - znik).toFixed(3);
        e.style.transform = 'scaleX(' + (q * (1 - sc)).toFixed(3) + ')';
      });

      const pm = clamp01((t - T.zlacz.karM) / 0.46);
      const km = $('karM');
      if (pm > 0) {
        const e = easeBack(pm);
        const zy = fala(t, 0.9, 1.25) * 5;
        km.style.opacity = easeOut(pm);
        km.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - e) * 26 + zy).toFixed(1) + 'px,0)' +
          ' rotateX(' + ((1 - e) * -12 + fala(t, 0.9, 1.25) * 0.7).toFixed(2) + 'deg)' +
          ' rotateY(' + (fala(t, 2.1, 0.9) * 1.1).toFixed(2) + 'deg)' +
          ' scale(' + (1 - (1 - e) * 0.14).toFixed(3) + ')';
        cien($('karMCien'), easeOut(pm) * 0.95, zy);
        plama('mHl', easeOut(clamp01((t - T.zlacz.plyta) / 0.32)));
      } else {
        km.style.opacity = 0;
        $('karMCien').style.opacity = 0;
      }

      const pp = easeOut(clamp01((t - T.zlacz.pod) / 0.34));
      const zp = $('zPod');
      zp.style.opacity = pp;
      zp.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 3.2, 1.05) * 2.2).toFixed(1) + 'px)';
    }
  }

  // ── 6.4–10 с: шкала часов ─────────────────────────────────────
  {
    const k = $('ku');
    const wyj = easeIn(clamp01((t - T.kurs.wyjscie) / 0.28));
    const widok = t > T.kurs.a - 0.05 && wyj < 1;
    k.style.display = widok ? 'block' : 'none';
    if (widok) {
      k.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.kurs.kicker) / 0.28));
      const kk = $('kKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      // Дуга ДОЧЕРЧИВАЕТСЯ, число щёлкает вместе с ней.
      const pg = clamp01((t - T.kurs.gauge) / 0.86);
      const g = $('gaugeBox');
      g.style.opacity = easeOut(clamp01((t - T.kurs.gauge) / 0.26));
      g.style.transform = 'rotate(' + (fala(t, 0.5, 0.7) * 1.2).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(clamp01((t - T.kurs.gauge) / 0.44))) * 0.12 + fala(t, 0.5, 1.1) * 0.006).toFixed(4) + ')';
      $('gLuk').setAttribute('stroke-dasharray', (easeOut(pg) * 794).toFixed(1) + ' 2000');

      const gl = $('gLicz');
      gl.style.opacity = easeOut(clamp01((t - T.kurs.gauge) / 0.26));
      gl.style.transform = 'translateY(' + (fala(t, 0.5, 1.1) * 3.4).toFixed(1) + 'px)' +
        ' scale(' + (1 - (1 - easeBack(clamp01((t - T.kurs.gauge) / 0.44))) * 0.16).toFixed(3) + ')';
      licznik(gl.querySelector('.licz'), (t - T.kurs.gauge) / 0.86, 30);

      const pe = easeOut(clamp01((t - T.kurs.etyk) / 0.30));
      const ge = $('gEtyk');
      ge.style.opacity = pe;
      ge.style.transform = 'translateY(' + ((1 - pe) * 16).toFixed(1) + 'px)';

      kchipy.forEach((c, i) => {
        const a = i === 0 ? T.kurs.chip1 : T.kurs.chip2;
        const p = easeBack(clamp01((t - a) / 0.40));
        c.style.opacity = easeOut(clamp01((t - a) / 0.24));
        const zy = fala(t, i * 1.5 + 1.8) * 3.2;
        const bok = i === 0 ? -70 : 70;
        c.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * bok).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * (i === 0 ? -14 : 14) + fala(t, i * 1.5, 1.2) * 1.1).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.kurs.stopka) / 0.34));
      const st = $('kStopka');
      st.style.opacity = ps * 0.96;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.6, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 10.2–12.4 с: цена ─────────────────────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;
      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const ck = $('ceKicker');
      ck.style.opacity = pk;
      ck.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.80, 4000);
      cien($('ceCien'), easeOut(pl), zy);

      const pr = easeBack(clamp01((t - T.cena.raty) / 0.42));
      const cr = $('ceRaty');
      cr.style.opacity = easeOut(clamp01((t - T.cena.raty) / 0.26));
      cr.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pr) * 40 + fala(t, 2.4, 1.2) * 3).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pr) * -18).toFixed(2) + 'deg)';
      plama('ratyHl', easeOut(clamp01((t - T.cena.raty - 0.14) / 0.30)));

      const pu = easeOut(clamp01((t - T.cena.uwaga) / 0.34));
      const cu = $('ceUwaga');
      cu.style.opacity = pu * 0.96;
      cu.style.transform = 'translateY(' + ((1 - pu) * 22 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.6–15 с: развязка ───────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.22) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.36) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};

// ══════════════════════════════════════════════════════════════════
// ШКОЛА 4 — EXPERT (szkolanaukijazdy.katowice.pl). Ролик стоит на
// точности: Toyota Yaris III LUNA 1.33, коробка 6 ступеней — такая же,
// как экзаменационные в WORD Katowice и Bytom. В цене 30 h теории,
// 30 h езды, материалы, 1 h езды бесплатно. Цена «od 4999 zł» —
// самая высокая в подборке, поэтому она стоит ПОСЛЕ довода, а не до.
//
// Свой ход: ТАБЛИЧКА ХАРАКТЕРИСТИК, строки которой переворачиваются
// на ось X, как на механическом табло, под бегущей полосой сканера.
// ══════════════════════════════════════════════════════════════════
const EXPERT = {
  plik: 'EXPERT_yaris',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/EXPERT_yaris.mp4',
  szkola: 'EXPERT',
  muzyka: 'pixabay-audio_3670b74de1.mp3',
  muzykaOd: 62,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">ZANIM ZAPISZESZ SIĘ NA KURS</div>
  <div id="eL1">CZYM BĘDZIESZ</div>
  <div id="eL2">${hl('JEŹDZIĆ?', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Model. Wersja. Silnik.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">AUTO, KTÓRYM JEŹDZISZ NA KURSIE</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'MODEL', 'TOYOTA YARIS III')}
    ${wiersz(1, 'WERSJA', 'LUNA')}
    ${wiersz(2, 'SILNIK', '1.33')}
    ${wiersz(3, 'SKRZYNIA', '6 BIEGÓW')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">TAKIE SAME AUTA JAK W</div>
  <div class="spchip" id="chipA">WORD KATOWICE</div>
  <div class="spchip" id="chipB">WORD BYTOM</div>
  <div id="spStopka">Bez niespodzianek w dniu egzaminu.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">W KURSIE</div>
  ${karta(0, '<span class="licz" data-do="30">0</span>', ' h', 'TEORII', false)}
  ${karta(1, '<span class="licz" data-do="30">0</span>', ' h', 'JAZD', false)}
  ${karta(2, '1', ' h', 'JAZDY GRATIS', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">KURS KATEGORII B</div>
  <div id="ceCena"><span class="od">od </span><span class="licz" data-do="4999">0</span><span class="jedn"> zł</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">pakiety: <b>podstawowy · ekspresowy · indywidualny</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">NA KURSIE I NA EGZAMINIE</div>
  <div id="fiL1">${hl('TAKA SAMA TOYOTA', 'finHl')}</div>
  <div id="fiPod">Yaris III LUNA 1.33, 6 biegów</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">EXPERT</div>
    <div class="pod">SZKOŁA NAUKI JAZDY</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">szkolanaukijazdy.katowice.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        licznik(k.querySelector('.licz'), (t - a - 0.10) / 0.50, 30);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 4999);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};

// ══════════════════════════════════════════════════════════════════
// ШКОЛА 5 — OSK X (oskx.pl). Ролик стоит на графике человека, который
// работает. Пять вариантов курса: podstawowy 3400, elastyczny 3600,
// ekspresowy 4200, weekendowy 4500, rozszerzony 40 h 4700. Часы:
// podstawowy дни рабочие 6:00–16:00, elastyczny ежедневно 6:00–22:00,
// weekendowy суббота и воскресенье. Раты 0%: первый взнос 500 zł,
// остаток на 4 части. Доплаты: площадка WORD 100 zł/30 мин,
// подача машины на экзамен 150 zł.
//
// Свой ход: ОДНА НЕДЕЛЬНАЯ СЕТКА, которая ПЕРЕСОБИРАЕТСЯ под каждый
// вариант. Столбики растут и опадают — три врезки в одном объекте.
// ══════════════════════════════════════════════════════════════════
const OSKX = {
  plik: 'OSKX_piec_wariantow',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/OSKX_piec_wariantow.mp4',
  szkola: 'OSK X',
  muzyka: 'pixabay-audio_bedae80d67.mp3',
  muzykaOd: 48,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.28 },
    siatka: { a: 2.42, kicker: 2.46, kol: 2.56, w1: 3.02, w2: 5.08, w3: 6.88,
              stale: 3.90, uwaga: 8.34, wyjscie: 9.56 },
    raty: { a: 9.70, kicker: 9.74, plyta: 9.86, blok: 10.32, krok: 0.22,
            opis: 11.36, uwaga: 11.78, wyjscie: 12.44 },
    fin: { a: 12.58, kicker: 12.62, l1: 12.76, pod: 13.04, kreska: 13.16, marka: 13.36 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    z.push({ t: T.siatka.kol + 0.10, typ: 'klik', gl: 0.4 });
    [T.siatka.w1, T.siatka.w2, T.siatka.w3].forEach((x) => {
      z.push({ t: x + 0.06, typ: 'dun', gl: 0.8 });
      z.push({ t: x + 0.34, typ: 'klik', gl: 0.4 });
    });
    z.push({ t: T.siatka.stale + 0.08, typ: 'klik', gl: 0.3 });
    z.push({ t: T.siatka.uwaga + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.siatka.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    z.push({ t: T.raty.plyta + 0.14, typ: 'dun', gl: 0.82 });
    for (let i = 0; i < 5; i++) z.push({ t: T.raty.blok + i * T.raty.krok + 0.10, typ: 'klik', gl: i === 0 ? 0.62 : 0.46 });
    z.push({ t: T.raty.opis + 0.08, typ: 'klik', gl: 0.34 });
    z.push({ t: T.raty.uwaga + 0.08, typ: 'klik', gl: 0.3 });
    z.push({ t: T.raty.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const DNI = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SB', 'ND'];
    const LEWO = 122;
    const SZER = 110;
    const ODST = 11;
    const naglowki = DNI.map(
      (d, i) => `<div class="dzn" data-i="${i}" style="left:${LEWO + i * (SZER + ODST)}px">${esc(d)}</div>`
    ).join('\n');
    const tory = DNI.map(
      (d, i) =>
        `<div class="tor" data-i="${i}" style="left:${LEWO + i * (SZER + ODST)}px"><div class="wyp"></div></div>`
    ).join('\n');

    const nazwy = ['PODSTAWOWY', 'ELASTYCZNY', 'WEEKENDOWY']
      .map((n, i) => `<div class="wnaz" data-i="${i}">${esc(n)}</div>`)
      .join('\n');
    const godziny = ['*6:00 – 16:00* · dni robocze', '*6:00 – 22:00* · codziennie', '*soboty i niedziele*']
      .map((g, i) => `<div class="wgodz" data-i="${i}">${zolteGwiazdki(g)}</div>`)
      .join('\n');

    const bloki =
      `<div class="blok pierwszy" data-i="0"><span>500 zł</span></div>` +
      [1, 2, 3, 4].map((n, i) => `<div class="blok" data-i="${i + 1}"><span>${n}</span></div>`).join('');

    const css = `
/* ── 0–2.3 с: график, а не цена ───────────────────────────────── */
#xHak{position:absolute;inset:0}
#xKicker{position:absolute;left:60px;right:60px;top:552px;font-size:40px}
#xL1{position:absolute;left:60px;right:60px;top:628px;text-align:center;
  font-weight:900;font-size:96px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#xL2{position:absolute;left:60px;right:60px;top:764px;text-align:center;opacity:0}
#xL2 .hl{font-size:100px;font-weight:900;letter-spacing:-4px}
#xHakCien{left:30%;right:30%;top:928px;height:44px}
#xPod{position:absolute;left:60px;right:60px;top:992px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:50px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–9.6 с: одна сетка, три варианта ──────────────────────── */
#si{position:absolute;inset:0}
#siKicker{position:absolute;left:50px;right:50px;top:398px;font-size:36px;opacity:0}
.wnaz{position:absolute;left:60px;right:60px;top:452px;text-align:center;
  font-weight:900;font-size:78px;letter-spacing:-3px;color:#fff;white-space:nowrap;opacity:0;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#siCena{position:absolute;left:60px;right:60px;top:556px;text-align:center;
  font-weight:900;font-size:104px;letter-spacing:-4px;color:#fff;white-space:nowrap;opacity:0;
  text-shadow:0 8px 28px rgba(0,0,0,.5)}
#siCena .jedn{font-size:62px;color:${KOLOR.zolty}}
.wgodz{position:absolute;left:60px;right:60px;top:684px;text-align:center;
  font-weight:800;font-size:46px;color:${KOLOR.cichy};white-space:nowrap;opacity:0}
.dzn{position:absolute;top:764px;width:110px;text-align:center;
  font-weight:800;font-size:32px;letter-spacing:2px;color:${KOLOR.cichy};opacity:0}
.tor{position:absolute;top:816px;width:110px;height:400px;border-radius:16px;overflow:hidden;
  background:rgba(255,255,255,.06);box-shadow:inset 0 1px 0 rgba(255,255,255,.12);opacity:0}
.tor .wyp{position:absolute;left:0;right:0;top:0;height:0;border-radius:14px;
  background:linear-gradient(180deg,#ffe07a,${KOLOR.zolty} 40%,#f0a500);
  box-shadow:0 8px 26px rgba(255,210,63,.30)}
.skala{position:absolute;left:16px;width:88px;text-align:right;
  font-weight:700;font-size:30px;color:${KOLOR.cichy};opacity:0}
#skalaG{top:820px}
#skalaD{top:1178px}
#siStale{position:absolute;left:100px;right:100px;top:1258px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.32;color:${KOLOR.cichy};opacity:0}
#siStale b{color:#fff}
#siUwaga{position:absolute;left:110px;right:110px;top:1382px;border-radius:20px;
  text-align:center;padding:20px 22px 24px;
  border:3px dashed rgba(167,139,250,.45);color:${KOLOR.cichy};
  font-weight:700;font-size:34px;line-height:1.3;opacity:0}
#siUwaga b{color:#fff}

/* ── 9.7–12.4 с: раты кубиками ────────────────────────────────── */
#ra{position:absolute;inset:0;opacity:0}
#raKicker{position:absolute;left:60px;right:60px;top:470px;font-size:42px;opacity:0}
#raPlyta{position:absolute;left:60px;right:60px;top:536px;text-align:center;opacity:0}
#raPlyta .hl{font-size:104px;font-weight:900;letter-spacing:-3px}
#raCien{left:30%;right:30%;top:722px;height:46px;opacity:0}
.blok{position:absolute;top:812px;height:150px;border-radius:22px;opacity:0;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:44px;color:#fff;
  background:linear-gradient(140deg, rgba(167,139,250,.28), rgba(124,58,237,.20));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 20px 46px rgba(0,0,0,.40)}
.blok.pierwszy{width:300px;left:91px;font-size:64px;letter-spacing:-2px;color:#150e33;
  background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:0 20px 46px rgba(255,210,63,.28)}
.blok[data-i="1"]{width:130px;left:415px}
.blok[data-i="2"]{width:130px;left:563px}
.blok[data-i="3"]{width:130px;left:711px}
.blok[data-i="4"]{width:130px;left:859px}
#raOpis{position:absolute;left:60px;right:60px;top:1014px;text-align:center;
  font-weight:800;font-size:38px;white-space:nowrap;color:#fff;opacity:0}
#raOpis .godz{color:${KOLOR.zolty}}
#raUwaga{position:absolute;left:110px;right:110px;top:1116px;border-radius:22px;
  text-align:center;padding:22px 24px 26px;
  border:3px dashed rgba(167,139,250,.45);color:${KOLOR.cichy};
  font-weight:700;font-size:36px;line-height:1.3;opacity:0}
#raUwaga b{color:#fff}

/* ── 12.6–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:424px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:488px;text-align:center;opacity:0}
#fiL1 .hl{font-size:98px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:698px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:50px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:796px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:864px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:160px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .miasto{margin-top:28px;font-weight:800;font-size:46px;letter-spacing:12px;color:${KOLOR.zolty}}
#mk .www{margin-top:24px;font-weight:600;font-size:44px;color:${KOLOR.cichy}}
#mkCien{left:32%;right:32%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="xHak">
  <div id="xKicker" class="kicker">KURS PRAWA JAZDY · KAT. B</div>
  <div id="xL1">NIE MASZ CZASU</div>
  <div id="xL2">${hl('W TYGODNIU?', 'xHl')}</div>
  <div id="xHakCien" class="cienEl"></div>
  <div id="xPod">To jeszcze nie znaczy, że nie masz kiedy.</div>
</div>

<div id="si">
  <div id="siKicker" class="kicker">WYBIERZ POD SWÓJ GRAFIK</div>
  ${nazwy}
  <div id="siCena"><span class="licz">0</span><span class="jedn"> zł</span></div>
  ${godziny}
  ${naglowki}
  <div class="skala" id="skalaG">6:00</div>
  ${tory}
  <div class="skala" id="skalaD">22:00</div>
  <div id="siStale">w każdym wariancie <b>30 h praktyki</b>,<br>e-learning na <b>8 miesięcy</b> i pierwsza pomoc</div>
  <div id="siUwaga">${zolteGwiazdki('są też ekspresowy *4200 zł*')}<br>${zolteGwiazdki('i rozszerzony 40 h *4700 zł*')}</div>
</div>

<div id="ra">
  <div id="raKicker" class="kicker">PŁATNOŚĆ</div>
  <div id="raPlyta">${hl('RATY 0%', 'ratyHl')}</div>
  <div id="raCien" class="cienEl"></div>
  ${bloki}
  <div id="raOpis">${zolteGwiazdki('pierwsza wpłata *500 zł*, reszta w *4* częściach')}</div>
  <div id="raUwaga">plac WORD <b>100 zł</b> / 30 min<br>podstawienie auta na egzamin <b>150 zł</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">GODZINY POD SIEBIE</div>
  <div id="fiL1">${hl('PIĘĆ WARIANTÓW', 'finHl')}</div>
  <div id="fiPod">od 3400 do 4700 zł</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">OSK X</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">oskx.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const tory = [].slice.call(document.querySelectorAll('.tor'));
const dzni = [].slice.call(document.querySelectorAll('.dzn'));
const nazwy = [].slice.call(document.querySelectorAll('.wnaz'));
const godziny = [].slice.call(document.querySelectorAll('.wgodz'));
const bloki = [].slice.call(document.querySelectorAll('.blok'));

const WYS = 400;            // высота колонки = 6:00–22:00
const H_OD = 6, H_DO = 22;
const fr = (g) => (g - H_OD) / (H_DO - H_OD);

// Три состояния одной и той же сетки. Пустой день = нулевая полоса,
// поэтому переход между вариантами — это рост и опадание, а не подмена.
const STAN = [
  [[6,16],[6,16],[6,16],[6,16],[6,16],null,null],
  [[6,22],[6,22],[6,22],[6,22],[6,22],[6,22],[6,22]],
  [null,null,null,null,null,[6,22],[6,22]],
];
const CENY = [3400, 3600, 4500];
const CZASY = [T.siatka.w1, T.siatka.w2, T.siatka.w3];
const PRZEJ = 0.52;

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.3 с: график ───────────────────────────────────────────
  {
    const h = $('xHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('xKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('xL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('xL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('xHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('xHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('xPod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–9.6 с: сетка недели пересобирается ────────────────────
  {
    const s = $('si');
    const wyj = easeIn(clamp01((t - T.siatka.wyjscie) / 0.28));
    const widok = t > T.siatka.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.siatka.kicker) / 0.28));
      const kk = $('siKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      // Какой вариант показан и насколько мы уже в переходе к нему.
      let idx = 0, mieszanka = 0;
      for (let i = 0; i < CZASY.length; i++) if (t >= CZASY[i]) idx = i;
      if (idx > 0) mieszanka = clamp01((t - CZASY[idx]) / PRZEJ);
      else mieszanka = clamp01((t - CZASY[0]) / PRZEJ);
      const poprz = idx > 0 ? STAN[idx - 1] : [null, null, null, null, null, null, null];
      const m = easeInOut(mieszanka);

      const pierwszy = easeOut(clamp01((t - T.siatka.kol) / 0.34));
      tory.forEach((tr, i) => {
        const op = easeOut(clamp01((t - T.siatka.kol - i * 0.045) / 0.32));
        tr.style.opacity = op;
        const zy = fala(t, i * 0.6, 1.05) * 2.2;
        tr.style.transform = 'translate3d(0,' + ((1 - op) * 26 + zy).toFixed(1) + 'px,0)' +
          ' scaleY(' + (0.86 + op * 0.14).toFixed(3) + ')';
        tr.style.transformOrigin = '50% 0%';

        const a = poprz[i], b = STAN[idx][i];
        const a0 = a ? fr(a[0]) : 0, a1 = a ? fr(a[1]) : 0;
        const b0 = b ? fr(b[0]) : 0, b1 = b ? fr(b[1]) : 0;
        const g0 = a0 + (b0 - a0) * m;
        const g1 = a1 + (b1 - a1) * m;
        const w = tr.querySelector('.wyp');
        w.style.top = (g0 * WYS).toFixed(1) + 'px';
        w.style.height = Math.max(0, (g1 - g0) * WYS).toFixed(1) + 'px';

        const akt = (b ? 1 : 0) * m + (a ? 1 : 0) * (1 - m);
        dzni[i].style.opacity = (op * (0.42 + akt * 0.58)).toFixed(3);
        dzni[i].style.color = akt > 0.5 ? '#fff' : '${KOLOR.cichy}';
      });

      const skalaOp = pierwszy * 0.75 * (1 - (idx === 2 ? m : 0));
      ['skalaG', 'skalaD'].forEach((id) => { $(id).style.opacity = skalaOp.toFixed(3); });

      // Название и часы варианта перелистываются, цена доезжает до новой.
      nazwy.forEach((n, i) => {
        const w = i === idx ? m : i === idx - 1 ? 1 - m : 0;
        n.style.opacity = w.toFixed(3);
        n.style.transform = 'translate3d(0,' + ((1 - w) * (i === idx ? 34 : -34) + fala(t, 0.4) * 2.2).toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + w * 0.06).toFixed(3) + ')';
      });
      godziny.forEach((g, i) => {
        const w = i === idx ? m : i === idx - 1 ? 1 - m : 0;
        g.style.opacity = w.toFixed(3);
        g.style.transform = 'translate3d(0,' + ((1 - w) * (i === idx ? 26 : -26) + fala(t, 1.5, 1.15) * 2).toFixed(1) + 'px,0)';
      });

      const cenaOd = idx > 0 ? CENY[idx - 1] : 0;
      const cena = $('siCena');
      cena.style.opacity = easeOut(clamp01((t - CZASY[0]) / 0.30));
      cena.style.transform = 'perspective(1500px) translate3d(0,' + (fala(t, 0.9, 1.3) * 3.6 + (1 - m) * 8).toFixed(1) + 'px,0)' +
        ' rotateX(' + (fala(t, 0.9, 1.3) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 + (1 - Math.abs(m - 0.5) * 2) * 0.035).toFixed(3) + ')';
      cena.querySelector('.licz').textContent =
        Math.round(cenaOd + (CENY[idx] - cenaOd) * easeOut(mieszanka));

      const ps = easeOut(clamp01((t - T.siatka.stale) / 0.34));
      const st = $('siStale');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 18 + fala(t, 3.0, 1.05) * 1.8).toFixed(1) + 'px)';

      const pu = easeOut(clamp01((t - T.siatka.uwaga) / 0.34));
      const uw = $('siUwaga');
      uw.style.opacity = pu * 0.96;
      uw.style.transform = 'translateY(' + ((1 - pu) * 20 + fala(t, 3.9, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 9.7–12.4 с: раты кубиками ─────────────────────────────────
  {
    const r = $('ra');
    const wyj = easeIn(clamp01((t - T.raty.wyjscie) / 0.26));
    const widok = t > T.raty.a - 0.05 && wyj < 1;
    r.style.display = widok ? 'block' : 'none';
    if (widok) {
      r.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.raty.kicker) / 0.28));
      const kk = $('raKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeBack(clamp01((t - T.raty.plyta) / 0.44));
      const pl = $('raPlyta');
      pl.style.opacity = easeOut(clamp01((t - T.raty.plyta) / 0.26));
      const zy = fala(t, 0.7, 1.3) * 5;
      pl.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pp) * 48 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pp) * -20 + fala(t, 0.7, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pp) * 0.10).toFixed(3) + ')';
      plama('ratyHl', easeOut(clamp01((t - T.raty.plyta - 0.14) / 0.30)));
      cien($('raCien'), easeOut(clamp01((t - T.raty.plyta) / 0.26)), zy);

      // Первый взнос и четыре части: платёж РАСКЛАДЫВАЕТСЯ на кубики.
      bloki.forEach((b, i) => {
        const a = T.raty.blok + i * T.raty.krok;
        const p = easeBack(clamp01((t - a) / 0.38));
        b.style.opacity = easeOut(clamp01((t - a) / 0.22));
        const zw = fala(t, i * 0.9 + 0.5, 1.25) * 2.8;
        b.style.transform = 'perspective(1400px) translate3d(0,' + ((1 - p) * 44 + zw).toFixed(1) + 'px,0)' +
          ' rotateX(' + ((1 - p) * -26).toFixed(2) + 'deg)' +
          ' rotateY(' + (fala(t, i * 0.9, 1.1) * 1.4).toFixed(2) + 'deg)' +
          ' scale(' + (1 - (1 - p) * 0.16).toFixed(3) + ')';
      });

      const po = easeOut(clamp01((t - T.raty.opis) / 0.32));
      const op = $('raOpis');
      op.style.opacity = po;
      op.style.transform = 'translateY(' + ((1 - po) * 20 + fala(t, 2.8, 1.1) * 2).toFixed(1) + 'px)';

      const pu = easeOut(clamp01((t - T.raty.uwaga) / 0.32));
      const uw = $('raUwaga');
      uw.style.opacity = pu * 0.96;
      uw.style.transform = 'translateY(' + ((1 - pu) * 20 + fala(t, 3.6, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.6–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.22) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.36) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};

// ═════════════════════════════════════════════════════════════════
// ШКОЛА ТАНЦЕВ 1 — i-Dance Katowice (i-dance-katowice.pl).
//
// Ролик стоит на одной операции, которую родитель делает в голове и так:
// карнет OPEN для ребёнка 350 zł — это 11,60 zł в день. Цифра 350 отпугивает
// и откладывает решение, 11,60 — нет. На сайте школы этого пересчёта нет.
//
// Все суммы с их страницы /cennik/, без единой придуманной цифры.
// «Найдешевшая в городе» не пишем: у СкТ есть 100 zł и это проверяется за две минуты.
// ═════════════════════════════════════════════════════════════════
const IDANCE = {
  plik: 'iDance_11zl',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/szkoly-tanca/iDance_11zl.mp4',
  szkola: 'i-DANCE',
  muzyka: 'pixabay-audio_59b3a0e3c6.mp3',
  muzykaOd: 24,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">KARNET OPEN DLA DZIECKA</div>
  <div id="eL1">350 ZŁ MIESIĘCZNIE</div>
  <div id="eL2">${hl('CZY 11,60 ZŁ?', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Ta sama kwota, inaczej policzona.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">CENNIK BEZ GWIAZDEK</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, '1× W TYG.', '140 ZŁ')}
    ${wiersz(1, '2× W TYG.', '230 ZŁ')}
    ${wiersz(2, 'OPEN DZIECI', '350 ZŁ')}
    ${wiersz(3, 'OPEN DOROŚLI', '370 ZŁ')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">JEDNORAZOWO</div>
  <div class="spchip" id="chipA">45 MIN — 45 ZŁ</div>
  <div class="spchip" id="chipB">60 MIN — 60 ZŁ</div>
  <div id="spStopka">Karnet ważny cztery tygodnie.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">KARNETY MIESIĘCZNE</div>
  ${karta(0, '<span class="licz" data-do="140">0</span>', ' zł', '1× W TYGODNIU', false)}
  ${karta(1, '<span class="licz" data-do="230">0</span>', ' zł', '2× W TYGODNIU', false)}
  ${karta(2, '350', ' zł', 'OPEN DZIECI', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">OPEN — WSZYSTKO W MIESIĄCU</div>
  <div id="ceCena"><span class="licz" data-do="11">0</span><span class="od">,60</span><span class="jedn"> zł</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">tyle wychodzi <b>za jeden dzień</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">OD PRZEDSZKOLAKA DO SENIORA</div>
  <div id="fiL1">${hl('WSZYSTKIE STYLE', 'finHl')}</div>
  <div id="fiPod">Rekreacja albo mistrzostwa — wybierasz sam.</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">i-DANCE</div>
    <div class="pod">SZKOŁA TAŃCA</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">ul. Lechicka 1 · i-dance-katowice.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 11);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const SKT = {
  plik: 'SKT_100zl',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/szkoly-tanca/SKT_100zl.mp4',
  szkola: 'SKT',
  muzyka: 'pixabay-audio_7fd615b293.mp3',
  muzykaOd: 38,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">A JEŚLI NIE POLUBI?</div>
  <div id="eL1">SPRAWDŹCIE</div>
  <div id="eL2">${hl('ZA 100 ZŁ', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Grupa 4–6 lat, raz w tygodniu.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">CAŁY CENNIK MA 13 POZYCJI</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'KIDS 4–6 LAT', '100 ZŁ')}
    ${wiersz(1, 'GRUPA START', '120 ZŁ')}
    ${wiersz(2, 'DOROŚLI BASIC', '120 ZŁ')}
    ${wiersz(3, 'TURNIEJOWA', '200 ZŁ')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">MIX PRACTICE</div>
  <div class="spchip" id="chipA">WEJŚCIE 20 ZŁ</div>
  <div class="spchip" id="chipB">MIESIĄC 70 ZŁ</div>
  <div id="spStopka">Cztery mix practice w karnecie.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">NAJNIŻSZY PRÓG</div>
  ${karta(0, '<span class="licz" data-do="30">0</span>', ' min', 'ZAJĘCIA', false)}
  ${karta(1, '<span class="licz" data-do="4">0</span>', ' lat', 'WIEK OD', false)}
  ${karta(2, '100', ' zł', 'MIESIĘCZNIE', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">TYLE KOSZTUJE SPRAWDZENIE</div>
  <div id="ceCena"><span class="licz" data-do="25">0</span><span class="jedn"> zł</span><span class="od"> / zajęcia</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">cztery zajęcia w miesiącu, <b>bez zobowiązań na rok</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">OD CZTERECH LAT DO DOROSŁYCH</div>
  <div id="fiL1">${hl('CENTRUM KATOWIC', 'finHl')}</div>
  <div id="fiPod">Taniec towarzyski, latino, pierwszy taniec.</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">SKT</div>
    <div class="pod">ŚLĄSKI KLUB TANECZNY</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">al. Korfantego 141 · slaskiklubtaneczny.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 25);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const LACLAVE = {
  plik: 'LaClave_bezterminowo',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/szkoly-tanca/LaClave_bezterminowo.mp4',
  szkola: 'LA CLAVE',
  muzyka: 'pixabay-audio_1b6f4de1c4.mp3',
  muzykaOd: 52,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">KARNET, KTÓRY NIE PRZEPADA</div>
  <div id="eL1">BEZ TERMINU</div>
  <div id="eL2">${hl('WAŻNOŚCI', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Chorujesz, wyjeżdżasz — wejścia czekają.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">CZTERY SPOSOBY WEJŚCIA</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'START · 4 WEJŚCIA', '109 ZŁ')}
    ${wiersz(1, 'EKO · 8 WEJŚĆ', '189 ZŁ')}
    ${wiersz(2, 'PRO · 10 WEJŚĆ', '219 ZŁ')}
    ${wiersz(3, 'OPEN · 4 TYGODNIE', '300 ZŁ')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">JEDNORAZOWO</div>
  <div class="spchip" id="chipA">WEJŚCIE 30 ZŁ</div>
  <div class="spchip" id="chipB">GOTÓWKA I BLIK</div>
  <div id="spStopka">Karnety Start, Eko i Pro — bezterminowe.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">KARNET PRO</div>
  ${karta(0, '<span class="licz" data-do="10">0</span>', '', 'WEJŚĆ', false)}
  ${karta(1, '<span class="licz" data-do="219">0</span>', ' zł', 'ZA CAŁOŚĆ', false)}
  ${karta(2, '0', ' dni', 'TERMINU', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">WYCHODZI ZA JEDNO WEJŚCIE</div>
  <div id="ceCena"><span class="licz" data-do="21">0</span><span class="od">,90</span><span class="jedn"> zł</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">i <b>żadne nie przepadnie</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">SALSA W DWÓCH MIASTACH</div>
  <div id="fiL1">${hl('KATOWICE I GLIWICE', 'finHl')}</div>
  <div id="fiPod">Chorzowska 11 · Wyszyńskiego 14D</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">LA CLAVE</div>
    <div class="pod">SZKOŁA TAŃCA</div>
    <div class="miasto">KATOWICE · GLIWICE</div>
    <div class="www">laclave.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 21);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const LABOCA = {
  plik: 'LaBoca_LipFlip',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/kliniki/LaBoca_LipFlip.mp4',
  szkola: 'LA BOCA',
  muzyka: 'pixabay-audio_1b6f4de1c4.mp3',
  muzykaOd: 52,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── LABOCA-TLO: клиника, а не автошкола ──────────────────────── */
.pas{display:none}
#tlo{background:linear-gradient(175deg,#2b141c 0%,#1a0d12 58%,#120709 100%)}
#lampa{background:radial-gradient(ellipse 46% 42% at 50% 45%,
  rgba(231,185,174,.30), rgba(231,185,174,0) 68%)}
#lampa2{background:radial-gradient(ellipse 40% 46% at 50% 50%,
  rgba(200,140,130,.16), rgba(0,0,0,0) 70%)}
#ziarno{opacity:.035}
.hl .nad{background:#f0d3c4;box-shadow:0 14px 34px rgba(240,211,196,.26)}
.hl .nad .in{color:#2b141c}
.kicker{color:#e7b9ae}
.jedn{color:#e7b9ae}
.od{color:#e7b9ae}
#ceCena{color:#f0d3c4}

/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:#e7b9ae;opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(231,185,174,0) 0%, rgba(231,185,174,.17) 50%, rgba(231,185,174,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:#e7b9ae}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,#b3766a,#f0d3c4);transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:#c9a79f;opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:#f0d3c4}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:#c9a79f}
.cka.zol{background:linear-gradient(140deg,#ffe07a,#f0d3c4);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(240,211,196,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,#b3766a,#f0d3c4);transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:#c9a79f;font-weight:800}
#ceCena .jedn{font-size:112px;color:#f0d3c4;letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:#c9a79f;opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:#e7b9ae;opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,#b3766a,#f0d3c4);transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:#f0d3c4}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:#c9a79f}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">GÓRNA WARGA ZNIKA PRZY UŚMIECHU?</div>
  <div id="eL1">LIP FLIP</div>
  <div id="eL2">${hl('15 MINUT', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Bez wypełniaczy. Sama warga się unosi.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">JAK TO DZIAŁA W CZASIE</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'ZABIEG TRWA', '15–30 MIN')}
    ${wiersz(1, 'PIERWSZY EFEKT', '3–5 DNI')}
    ${wiersz(2, 'PEŁNY EFEKT', '10–14 DNI')}
    ${wiersz(3, 'UTRZYMUJE SIĘ', '3–5 MIES.')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">JAK CZĘSTO</div>
  <div class="spchip" id="chipA">2–3 RAZY W ROKU</div>
  <div class="spchip" id="chipB">BEZ ZWOLNIENIA</div>
  <div id="spStopka">Zaczerwienienie schodzi w kilka godzin.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">LIP FLIP</div>
  ${karta(0, '<span class="licz" data-do="15">0</span>', ' min', 'ZABIEG', false)}
  ${karta(1, '<span class="licz" data-do="350">0</span>', ' zł', 'OD', false)}
  ${karta(2, '<span class="licz" data-do="5">0</span>', ' mies.', 'EFEKTU', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">W PRZELICZENIU NA MIESIĄC</div>
  <div id="ceCena"><span class="licz" data-do="70">0</span><span class="od"></span><span class="jedn"> zł</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">i <b>zero rekonwalescencji</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">MEDYCYNA ESTETYCZNA</div>
  <div id="fiL1">${hl('STAWOWA 10', 'finHl')}</div>
  <div id="fiPod">Katowice · 572 663 208</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">LA BOCA</div>
    <div class="pod">CLINIC</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">labocaclinic.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 70);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const MUSEO = {
  plik: 'Museo_ScanListen',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/museo/Museo_ScanListen.mp4',
  szkola: 'MUSEO',
  muzyka: 'pixabay-audio_1b6f4de1c4.mp3',
  muzykaOd: 52,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── LABOCA-TLO: клиника, а не автошкола ──────────────────────── */
.pas{display:none}
#tlo{background:linear-gradient(175deg,#1b1a26 0%,#12111a 58%,#0a0910 100%)}
#lampa{background:radial-gradient(ellipse 46% 42% at 50% 45%,
  rgba(214,178,120,.26), rgba(214,178,120,0) 68%)}
#lampa2{background:radial-gradient(ellipse 40% 46% at 50% 50%,
  rgba(150,140,190,.14), rgba(0,0,0,0) 70%)}
#ziarno{opacity:.035}
.hl .nad{background:#e8cf9a;box-shadow:0 14px 34px rgba(232,207,154,.26)}
.hl .nad .in{color:#2b141c}
.kicker{color:#d6b278}
.jedn{color:#d6b278}
.od{color:#d6b278}
#ceCena{color:#e8cf9a}

/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:#d6b278;opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(214,178,120,0) 0%, rgba(214,178,120,.17) 50%, rgba(214,178,120,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:#d6b278}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,#8a7bbf,#e8cf9a);transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:#c9a79f;opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:#e8cf9a}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:#c9a79f}
.cka.zol{background:linear-gradient(140deg,#ffe07a,#e8cf9a);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(232,207,154,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,#8a7bbf,#e8cf9a);transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:#c9a79f;font-weight:800}
#ceCena .jedn{font-size:112px;color:#e8cf9a;letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:#c9a79f;opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:#d6b278;opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,#8a7bbf,#e8cf9a);transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:#e8cf9a}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:#c9a79f}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">STOISZ PRZED OBRAZEM</div>
  <div id="eL1">I NIE WIESZ,</div>
  <div id="eL2">${hl('NA CO PATRZYSZ', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Tabliczka ma trzy zdania. I tyle.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">JAK JEST TERAZ</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'TABLICZKA', '3 ZDANIA')}
    ${wiersz(1, 'AUDIOPRZEWODNIK', 'PRZY WEJŚCIU')}
    ${wiersz(2, 'OPROWADZANIE', 'O PEŁNEJ')}
    ${wiersz(3, 'TELEFON W RĘKU', 'ZAWSZE')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">A WYSTARCZY</div>
  <div class="spchip" id="chipA">SKIEROWAĆ APARAT</div>
  <div class="spchip" id="chipB">I SŁUCHAĆ</div>
  <div id="spStopka">Obraz sam opowiada swoją historię.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">MUSEO</div>
  ${karta(0, '<span class="licz" data-do="20">0</span>', '+', 'JĘZYKÓW', false)}
  ${karta(1, '<span class="licz" data-do="3">0</span>', ' sek', 'ROZPOZNANIE', false)}
  ${karta(2, '<span class="licz" data-do="0">0</span>', ' zł', 'DLA CIEBIE', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">TWÓJ PRZEWODNIK</div>
  <div id="ceCena"><span class="od">w </span>KIESZENI</div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">i <b>zero kolejek po sprzęt</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">SCAN · LISTEN · DISCOVER</div>
  <div id="fiL1">${hl('MUSEO', 'finHl')}</div>
  <div id="fiPod">iOS i Android</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">MUSEO</div>
    <div class="pod">AUDIO GUIDE</div>
    <div class="miasto">20+ JĘZYKÓW</div>
    <div class="www">themuseo.ai</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 70);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const LINGUA = {
  plik: 'LinguaHouse_199start',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/szkoly-jezykowe/LinguaHouse_199start.mp4',
  szkola: 'LINGUA HOUSE',
  muzyka: 'pixabay-audio_4a325d0f0b.mp3',
  muzykaOd: 30,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">KURS ROCZNY DLA DZIECKA</div>
  <div id="eL1">2347 ZŁ ZA ROK?</div>
  <div id="eL2">${hl('199 NA START', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Tyle wynosi pierwsza rata.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">CENNIK 2025/26</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'DZIECI · 3-8 OSÓB', '2347 ZŁ')}
    ${wiersz(1, 'DZIECI · DWOJE', '2647 ZŁ')}
    ${wiersz(2, 'DOROŚLI · SEMESTR', '1487 ZŁ')}
    ${wiersz(3, 'VIP · OD 2 OSÓB', '1587 ZŁ')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">ROZŁOŻENIE</div>
  <div class="spchip" id="chipA">PIERWSZA RATA 199 ZŁ</div>
  <div class="spchip" id="chipB">PŁATNE W 4 RATACH</div>
  <div id="spStopka">E-learning, aplikacja i nagrania w cenie.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">ROK NAUKI DLA DZIECKA</div>
  ${karta(0, '<span class="licz" data-do="12">0</span>', ' mies.', 'NAUKI', false)}
  ${karta(1, '<span class="licz" data-do="2347">0</span>', ' zł', 'ZA ROK', false)}
  ${karta(2, '199', ' zł', 'NA START', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">WYCHODZI NA MIESIĄC</div>
  <div id="ceCena"><span class="licz" data-do="196">0</span><span class="jedn"> zł</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">czyli mniej niż <b>jedna korepetycja</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">METODA BEZPOŚREDNIA</div>
  <div id="fiL1">${hl('DUŻO MÓWIENIA', 'finHl')}</div>
  <div id="fiPod">Dzieci, dorośli, seniorzy i firmy.</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">LINGUA HOUSE</div>
    <div class="pod">SZKOŁA JĘZYKOWA</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">ul. Gliwicka 12 · lingua-house.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 196);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const LOPECIK = {
  plik: 'Lopecik_95procent',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/Lopecik_95procent.mp4',
  szkola: 'OSK LOPECIK',
  muzyka: 'pixabay-audio_5d25481bef.mp3',
  muzykaOd: 46,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">ZDAWALNOŚĆ ZA PIERWSZYM RAZEM</div>
  <div id="eL1">ILE OSÓB ZDAJE?</div>
  <div id="eL2">${hl('95%', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Liczba ze strony OSK Lopecik.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">CO MÓWIĄ ICH LICZBY</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'DOŚWIADCZENIE', '10+ LAT')}
    ${wiersz(1, 'KURSANCI', '3000+')}
    ${wiersz(2, 'ZDAWALNOŚĆ', '95%+')}
    ${wiersz(3, 'NAJBLIŻSZY KURS', 'WKRÓTCE')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">SKĄD TE DANE</div>
  <div class="spchip" id="chipA">ZE STRONY SZKOŁY</div>
  <div class="spchip" id="chipB">NIC NIE DODANE</div>
  <div id="spStopka">Zdawalność podaje jedna szkoła na osiem.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">DZIESIĘĆ LAT PRACY</div>
  ${karta(0, '<span class="licz" data-do="10">0</span>', '+ lat', 'NA RYNKU', false)}
  ${karta(1, '<span class="licz" data-do="3000">0</span>', '+', 'KURSANTÓW', false)}
  ${karta(2, '95', '%', 'ZDAJE', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">ZDAJE ZA PIERWSZYM RAZEM</div>
  <div id="ceCena"><span class="licz" data-do="95">0</span><span class="jedn">%</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">liczba <b>ze strony szkoły</b>, nie nasza</div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">ZAPISY NA NAJBLIŻSZY KURS</div>
  <div id="fiL1">${hl('RUSZAMY WKRÓTCE', 'finHl')}</div>
  <div id="fiPod">Dziesięć lat i trzy tysiące kursantów.</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">LOPECIK</div>
    <div class="pod">OŚRODEK SZKOLENIA KIEROWCÓW</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">lopecik.katowice.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 95);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const AUTOEXPERT = {
  plik: 'Autoexpert_7do22',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/Autoexpert_7do22.mp4',
  szkola: 'OSK AUTOEXPERT',
  muzyka: 'pixabay-creative-technology-showreel.mp3',
  muzykaOd: 74,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">PRACUJESZ NA ZMIANY?</div>
  <div id="eL1">JAZDY OD</div>
  <div id="eL2">${hl('7:00 DO 22:00', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Piętnaście godzin na dobę.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">CO JEST NA ICH STRONIE</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'JAZDY', '7:00–22:00')}
    ${wiersz(1, 'AUTA', 'TOYOTA YARIS')}
    ${wiersz(2, 'POZYCJA', 'PIERWSZA TRÓJKA')}
    ${wiersz(3, 'OD ILU LAT', 'OD TRZECH')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">DLACZEGO TO WAŻNE</div>
  <div class="spchip" id="chipA">PRZED PRACĄ</div>
  <div class="spchip" id="chipB">ALBO PO PRACY</div>
  <div id="spStopka">Egzaminacyjne Toyoty Yaris — te same co w WORD.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">PIĘTNAŚCIE GODZIN DZIENNIE</div>
  ${karta(0, '<span class="licz" data-do="7">0</span>', ':00', 'OD', false)}
  ${karta(1, '<span class="licz" data-do="22">0</span>', ':00', 'DO', false)}
  ${karta(2, '15', ' h', 'DO WYBORU', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">TYLE TRWA ICH DZIEŃ</div>
  <div id="ceCena"><span class="licz" data-do="15">0</span><span class="jedn"> h</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">kurs <b>dopasujesz do pracy</b>, nie odwrotnie</div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">ZDAWALNOŚĆ W KATOWICACH</div>
  <div id="fiL1">${hl('PIERWSZA TRÓJKA', 'finHl')}</div>
  <div id="fiPod">Od trzech lat. Jazdy od 7:00 do 22:00.</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">AUTOEXPERT</div>
    <div class="pod">OŚRODEK SZKOLENIA KIEROWCÓW</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">oskautoexpert.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 15);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const JUDO = {
  plik: 'AZS_judo_wrzesien',
  wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/kluby-sportowe/AZS_judo_wrzesien.mp4',
  szkola: 'AZS AWF JUDO',
  muzyka: 'pixabay-audio_b7259abb71.mp3',
  muzykaOd: 40,

  T: {
    hak: { a: -0.10, l1: 0.02, l2: 0.50, pod: 1.00, wyjscie: 2.24 },
    spec: { a: 2.38, kicker: 2.42, panel: 2.54, r1: 2.72, krok: 0.46,
            kreska: 5.06, kicker2: 5.26, chipA: 5.50, chipB: 5.76, stopka: 6.34, wyjscie: 7.80 },
    cena: { a: 7.94, kicker: 7.98, k1: 8.10, krok: 0.30, kreska: 9.24,
            kicker2: 9.36, licznik: 9.52, pakiety: 10.84, wyjscie: 12.16 },
    fin: { a: 12.30, kicker: 12.34, l1: 12.48, pod: 12.86, kreska: 13.04, marka: 13.28 },
  },

  dzwieki(T) {
    const z = [];
    z.push({ t: 0.02, typ: 'swist', gl: 0.5 });
    z.push({ t: T.hak.l1 + 0.06, typ: 'dun', gl: 0.85 });
    z.push({ t: T.hak.l2 + 0.10, typ: 'klik', gl: 0.66 });
    z.push({ t: T.hak.pod + 0.06, typ: 'klik', gl: 0.36 });
    z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.55 });
    for (let i = 0; i < 4; i++) z.push({ t: T.spec.r1 + i * T.spec.krok + 0.14, typ: 'klik', gl: 0.64 });
    z.push({ t: T.spec.kreska + 0.04, typ: 'swist', gl: 0.36 });
    z.push({ t: T.spec.chipA + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.chipB + 0.14, typ: 'dun', gl: 0.66 });
    z.push({ t: T.spec.stopka + 0.10, typ: 'klik', gl: 0.3 });
    z.push({ t: T.spec.wyjscie + 0.02, typ: 'swist', gl: 0.56 });
    for (let i = 0; i < 3; i++) z.push({ t: T.cena.k1 + i * T.cena.krok + 0.14, typ: 'klik', gl: 0.6 });
    z.push({ t: T.cena.kreska + 0.04, typ: 'swist', gl: 0.4 });
    z.push({ t: T.cena.licznik + 0.06, typ: 'dun', gl: 0.88 });
    z.push({ t: T.cena.pakiety + 0.10, typ: 'klik', gl: 0.34 });
    z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.55 });
    z.push({ t: T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
    z.push({ t: T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
    return z;
  },

  html() {
    const wiersz = (i, etykieta, wartosc) =>
      `<div class="spr" data-i="${i}">
  <div class="spl">${esc(etykieta)}</div>
  <div class="spv" data-fit="62,34,90">${esc(wartosc)}</div>
</div>`;

    const karta = (i, liczba, jedn, podpis, zolta) =>
      `<div class="cka${zolta ? ' zol' : ''}" data-i="${i}">
  <div class="cienEl ckaCien"></div>
  <div class="ckl">${liczba}<span class="jedn">${esc(jedn)}</span></div>
  <div class="ckp">${esc(podpis)}</div>
</div>`;

    const css = `
/* ── 0–2.25 с: вопрос, который редко задают ───────────────────── */
#eHak{position:absolute;inset:0}
#eKicker{position:absolute;left:60px;right:60px;top:550px;font-size:36px}
#eL1{position:absolute;left:60px;right:60px;top:626px;text-align:center;
  font-weight:900;font-size:94px;letter-spacing:-3px;color:#fff;white-space:nowrap;
  text-shadow:0 8px 30px rgba(0,0,0,.55)}
#eL2{position:absolute;left:60px;right:60px;top:762px;text-align:center;opacity:0}
#eL2 .hl{font-size:104px;font-weight:900;letter-spacing:-4px}
#eHakCien{left:30%;right:30%;top:930px;height:44px}
#ePod{position:absolute;left:60px;right:60px;top:996px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:54px;color:${KOLOR.jasny};opacity:0}

/* ── 2.4–7.8 с: табличка характеристик ────────────────────────── */
#sp{position:absolute;inset:0}
#spKicker{position:absolute;left:50px;right:50px;top:320px;font-size:34px;letter-spacing:6px;opacity:0}
#spPanel{position:absolute;left:62px;right:62px;top:386px;height:752px;border-radius:36px;
  overflow:hidden;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 32px 76px rgba(0,0,0,.46)}
#spSkan{position:absolute;left:0;right:0;height:240px;pointer-events:none;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 50%, rgba(167,139,250,0) 100%)}
.spr{position:absolute;left:44px;right:44px;height:168px;display:flex;align-items:center;
  gap:24px;opacity:0;transform-origin:50% 0%}
.spr::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;
  background:rgba(255,255,255,.10)}
.spr[data-i="3"]::after{opacity:0}
.splin{position:absolute;left:44px;right:44px;height:2px;background:rgba(255,255,255,.07)}
.spr[data-i="0"]{top:40px}
.spr[data-i="1"]{top:208px}
.spr[data-i="2"]{top:376px}
.spr[data-i="3"]{top:544px}
.spl{flex:0 0 244px;font-weight:800;font-size:32px;letter-spacing:5px;color:${KOLOR.jasny}}
.spv{flex:1;min-width:0;overflow:hidden;text-align:right;font-weight:900;font-size:62px;
  letter-spacing:-2px;color:#fff;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.45)}
#spPanelCien{left:12%;right:12%;top:1152px;height:46px;opacity:0}
#spKreska{position:absolute;left:270px;top:1176px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#spKicker2{position:absolute;left:50px;right:50px;top:1212px;font-size:34px;letter-spacing:6px;opacity:0}
.spchip{position:absolute;top:1272px;width:452px;height:118px;border-radius:26px;
  display:flex;align-items:center;justify-content:center;
  font-weight:900;font-size:46px;letter-spacing:-1px;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 22px 54px rgba(0,0,0,.42)}
#chipA{left:62px}
#chipB{right:62px}
#spStopka{position:absolute;left:90px;right:90px;top:1428px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:44px;color:${KOLOR.cichy};opacity:0}

/* ── 7.9–12.2 с: что в цене, потом цена ───────────────────────── */
#ce{position:absolute;inset:0;opacity:0}
#ceKicker{position:absolute;left:60px;right:60px;top:410px;font-size:40px;opacity:0}
.cka{position:absolute;top:478px;width:309px;height:238px;border-radius:30px;
  padding-top:40px;text-align:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 26px 60px rgba(0,0,0,.42)}
.cka[data-i="0"]{left:56px}
.cka[data-i="1"]{left:385px}
.cka[data-i="2"]{right:56px}
.cka .ckl{font-weight:900;font-size:96px;letter-spacing:-4px;line-height:1;color:#fff;
  white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.cka .ckl .jedn{font-size:54px;color:${KOLOR.zolty}}
.cka .ckp{margin-top:26px;font-weight:800;font-size:32px;letter-spacing:3px;color:${KOLOR.cichy}}
.cka.zol{background:linear-gradient(140deg,#ffe07a,${KOLOR.zolty});
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5), 0 26px 60px rgba(255,210,63,.22)}
.cka.zol .ckl{color:#150e33;text-shadow:none}
.cka.zol .ckl .jedn{color:#3d2c00}
.cka.zol .ckp{color:#4a3600}
.ckaCien{left:10%;right:10%;bottom:-24px;height:40px;opacity:0}
#ceKreska{position:absolute;left:270px;top:790px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#ceKicker2{position:absolute;left:60px;right:60px;top:830px;font-size:40px;opacity:0}
#ceCena{position:absolute;left:60px;right:60px;top:900px;text-align:center;
  font-weight:900;font-size:198px;letter-spacing:-10px;color:#fff;white-space:nowrap;
  text-shadow:0 12px 40px rgba(0,0,0,.55)}
#ceCena .od{font-size:92px;letter-spacing:-2px;color:${KOLOR.cichy};font-weight:800}
#ceCena .jedn{font-size:112px;color:${KOLOR.zolty};letter-spacing:-4px;margin-left:12px}
#ceCien{left:28%;right:28%;top:1140px;height:46px;opacity:0}
#cePak{position:absolute;left:70px;right:70px;top:1216px;text-align:center;
  font-weight:700;font-size:34px;line-height:1.3;color:${KOLOR.cichy};opacity:0}
#cePak b{color:#fff}

/* ── 12.3–15 с: марка ─────────────────────────────────────────── */
#fi{position:absolute;inset:0;opacity:0}
#fiKicker{position:absolute;left:60px;right:60px;top:426px;font-size:38px;opacity:0}
#fiL1{position:absolute;left:60px;right:60px;top:490px;text-align:center;opacity:0}
#fiL1 .hl{font-size:76px;font-weight:900;letter-spacing:-3px}
#fiPod{position:absolute;left:60px;right:60px;top:702px;text-align:center;
  font-family:'Playfair Display',serif;font-style:italic;font-size:48px;color:${KOLOR.jasny};opacity:0}
#fiKreska{position:absolute;left:270px;top:800px;width:540px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
#mk{position:absolute;left:50px;right:50px;top:868px;text-align:center;opacity:0}
#mk .nazwa{font-weight:900;font-size:138px;letter-spacing:-4px;line-height:1;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#mk .pod{margin-top:22px;font-weight:800;font-size:42px;letter-spacing:6px;color:${KOLOR.zolty}}
#mk .miasto{margin-top:14px;font-weight:800;font-size:40px;letter-spacing:12px;color:#fff}
#mk .www{margin-top:24px;font-weight:600;font-size:40px;color:${KOLOR.cichy}}
#mkCien{left:28%;right:28%;top:1244px;height:44px;opacity:0}
`;

    const body = `
<div id="eHak">
  <div id="eKicker" class="kicker">NOWI CZŁONKOWIE KLUBU</div>
  <div id="eL1">CAŁY WRZESIEŃ</div>
  <div id="eL2">${hl('ZA DARMO', 'eHl')}</div>
  <div id="eHakCien" class="cienEl"></div>
  <div id="ePod">Zajęcia judo dla dzieci i młodzieży.</div>
</div>

<div id="sp">
  <div id="spKicker" class="kicker">TERMINY NABORU</div>
  <div id="spPanelCien" class="cienEl"></div>
  <div id="spPanel">
    <div id="spSkan"></div>
    <div class="splin" style="top:207px"></div>
    <div class="splin" style="top:375px"></div>
    <div class="splin" style="top:543px"></div>
    ${wiersz(0, 'GRUPY 1–3', '31 SIERPNIA')}
    ${wiersz(1, 'GRUPY 5–8', '7 WRZEŚNIA')}
    ${wiersz(2, 'WRZESIEŃ', 'BEZ OPŁAT')}
    ${wiersz(3, 'DLA KOGO', 'DZIECI I MŁODZIEŻ')}
  </div>
  <div id="spKreska"></div>
  <div id="spKicker2" class="kicker">JAK ZACZĄĆ</div>
  <div class="spchip" id="chipA">PRZYJDŹ NA ZAJĘCIA</div>
  <div class="spchip" id="chipB">ZAPISY PRZEZ KLUB</div>
  <div id="spStopka">Cały wrzesień, żeby dziecko sprawdziło, czy polubi.</div>
</div>

<div id="ce">
  <div id="ceKicker" class="kicker">MIESIĄC NA SPRAWDZENIE</div>
  ${karta(0, '<span class="licz" data-do="31">0</span>', '.08', 'START', false)}
  ${karta(1, '<span class="licz" data-do="30">0</span>', ' dni', 'PRÓBY', false)}
  ${karta(2, '0', ' zł', 'WE WRZEŚNIU', true)}
  <div id="ceKreska"></div>
  <div id="ceKicker2" class="kicker">TYLE KOSZTUJE PIERWSZY MIESIĄC</div>
  <div id="ceCena"><span class="licz" data-do="0">0</span><span class="jedn"> zł</span></div>
  <div id="ceCien" class="cienEl"></div>
  <div id="cePak">potem decydujecie, <b>czy zostajecie</b></div>
</div>

<div id="fi">
  <div id="fiKicker" class="kicker">SEKCJA JUDO</div>
  <div id="fiL1">${hl('ZAPISY TRWAJĄ', 'finHl')}</div>
  <div id="fiPod">Grupy 1–3 od 31 sierpnia, 5–8 od 7 września.</div>
  <div id="fiKreska"></div>
  <div id="mk">
    <div class="nazwa">AZS AWF</div>
    <div class="pod">KLUB SPORTOWY · JUDO</div>
    <div class="miasto">KATOWICE</div>
    <div class="www">azs.awf.katowice.pl</div>
  </div>
  <div id="mkCien" class="cienEl"></div>
</div>`;

    const skrypt = `
const T = ${JSON.stringify(this.T)};
const SEK = ${SEK};
const wiersze = [].slice.call(document.querySelectorAll('.spr'));
const karty = [].slice.call(document.querySelectorAll('.cka'));

window.setT = (t) => {
  blyski(t);
  tlo(t);

  // ── 0–2.25 с: вопрос ──────────────────────────────────────────
  {
    const h = $('eHak');
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.28));
    const widok = wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    if (widok) {
      h.style.opacity = 1 - wyj;
      h.style.transform = 'translate3d(0,' + (-wyj * 70).toFixed(1) + 'px,0) scale(' + (1 - wyj * 0.05).toFixed(3) + ')';

      const pk = easeOut(clamp01((t - T.hak.a) / 0.30));
      const kk = $('eKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.hak.l1) / 0.42));
      const l1 = $('eL1');
      l1.style.opacity = easeOut(clamp01((t - T.hak.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 50 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';

      const p2 = easeBack(clamp01((t - T.hak.l2) / 0.44));
      const l2 = $('eL2');
      l2.style.opacity = easeOut(clamp01((t - T.hak.l2) / 0.26));
      const zy = fala(t, 1.3, 1.3) * 4;
      l2.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p2) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -22 + fala(t, 1.3, 1.3) * 0.8).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - p2) * 0.08).toFixed(3) + ')';
      plama('eHl', easeOut(clamp01((t - T.hak.l2 - 0.14) / 0.30)));
      cien($('eHakCien'), easeOut(clamp01((t - T.hak.l2) / 0.26)), zy);

      const pp = easeOut(clamp01((t - T.hak.pod) / 0.32));
      const pd = $('ePod');
      pd.style.opacity = pp;
      pd.style.transform = 'translateY(' + ((1 - pp) * 22 + fala(t, 2.4, 1.1) * 2.4).toFixed(1) + 'px)';
    }
  }

  // ── 2.4–7.8 с: табличка ───────────────────────────────────────
  {
    const s = $('sp');
    const wyj = easeIn(clamp01((t - T.spec.wyjscie) / 0.28));
    const widok = t > T.spec.a - 0.05 && wyj < 1;
    s.style.display = widok ? 'block' : 'none';
    if (widok) {
      s.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.spec.kicker) / 0.28));
      const kk = $('spKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const pp = easeOut(clamp01((t - T.spec.panel) / 0.34));
      const pan = $('spPanel');
      pan.style.opacity = pp;
      pan.style.transform = 'perspective(1800px) rotateX(' + (fala(t, 1.0, 0.85) * 0.6).toFixed(2) + 'deg)' +
        ' rotateY(' + (fala(t, 2.3, 0.7) * 0.7).toFixed(2) + 'deg)' +
        ' translateY(' + ((1 - pp) * 24 + fala(t, 1.0, 0.85) * 3).toFixed(1) + 'px)';
      cien($('spPanelCien'), pp * 0.9, fala(t, 1.0, 0.85) * 3);
      // Полоса сканера идёт по табличке всю сцену: панель не стоит
      // мёртвым прямоугольником даже когда строки уже прилетели.
      $('spSkan').style.transform =
        'translateY(' + ((((t - T.spec.panel) * 0.40) % 1) * 992 - 240).toFixed(1) + 'px)';

      // Строки ПЕРЕВОРАЧИВАЮТСЯ на оси X, как на механическом табло.
      wiersze.forEach((w, i) => {
        const a = T.spec.r1 + i * T.spec.krok;
        const p = clamp01((t - a) / 0.46);
        if (p <= 0) { w.style.opacity = 0; return; }
        const e = easeOut(p);
        const zy = fala(t, i * 1.1 + 0.5, 1.15) * 2.2;
        w.style.opacity = Math.min(1, p * 2.2);
        w.style.transform = 'perspective(1200px) rotateX(' + ((1 - easeBack(p)) * -88).toFixed(2) + 'deg)' +
          ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
          ' scale(' + (0.94 + e * 0.06).toFixed(3) + ')';
      });

      $('spKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.spec.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.spec.kicker2) / 0.28));
      const kk2 = $('spKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      [['chipA', T.spec.chipA, -1], ['chipB', T.spec.chipB, 1]].forEach((c, i) => {
        const el = $(c[0]);
        const p = easeBack(clamp01((t - c[1]) / 0.40));
        el.style.opacity = easeOut(clamp01((t - c[1]) / 0.24));
        const zy = fala(t, i * 1.6 + 2.2, 1.25) * 3;
        el.style.transform = 'perspective(1500px) translate3d(' + ((1 - p) * c[2] * 80).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * c[2] * 16 + fala(t, i * 1.6, 1.2) * 1.2).toFixed(2) + 'deg)';
      });

      const ps = easeOut(clamp01((t - T.spec.stopka) / 0.34));
      const st = $('spStopka');
      st.style.opacity = ps * 0.95;
      st.style.transform = 'translateY(' + ((1 - ps) * 20 + fala(t, 3.8, 1.05) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 7.9–12.2 с: что в цене, потом цена ────────────────────────
  {
    const c = $('ce');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.26));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1 - wyj;

      const pk = easeOut(clamp01((t - T.cena.kicker) / 0.28));
      const kk = $('ceKicker');
      kk.style.opacity = pk;
      kk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      karty.forEach((k, i) => {
        const a = T.cena.k1 + i * T.cena.krok;
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        k.style.opacity = easeOut(p);
        const zy = fala(t, i * 1.25 + 0.4) * 3.4;
        wjazd(k, e, {
          dy: 40, dx: 0, ry: (i - 1) * 16, rx: 12, sc: 0.14,
          po: ' translate3d(0,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.25, 1.15) * 1.3).toFixed(2) + 'deg)',
        });
        cien(k.querySelector('.ckaCien'), easeOut(p), zy);
        // Цели у карточек разные (140 и 230), поэтому берём из разметки,
        // а не из одного числа на все три — иначе счётчик врёт клиенту.
        const el = k.querySelector('.licz');
        if (el) licznik(el, (t - a - 0.10) / 0.50, +el.dataset.do);
      });

      $('ceKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.cena.kreska) / 0.40)).toFixed(3) + ')';

      const pk2 = easeOut(clamp01((t - T.cena.kicker2) / 0.28));
      const kk2 = $('ceKicker2');
      kk2.style.opacity = pk2;
      kk2.style.transform = 'translateY(' + ((1 - pk2) * 16).toFixed(1) + 'px)';

      const pl = clamp01((t - T.cena.licznik) / 0.46);
      const cc = $('ceCena');
      const zy = fala(t, 0.6, 1.35) * 5;
      cc.style.opacity = easeOut(pl);
      cc.style.transform = 'perspective(1600px) translate3d(0,' + ((1 - easeBack(pl)) * 56 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - easeBack(pl)) * -22 + fala(t, 0.6, 1.35) * 0.7).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - easeBack(pl)) * 0.10).toFixed(3) + ')';
      licznik(cc.querySelector('.licz'), (t - T.cena.licznik) / 0.82, 0);
      cien($('ceCien'), easeOut(pl), zy);

      const pp = easeOut(clamp01((t - T.cena.pakiety) / 0.34));
      const cp = $('cePak');
      cp.style.opacity = pp * 0.96;
      cp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 3.4, 1.1) * 2).toFixed(1) + 'px)';
    }
  }

  // ── 12.3–15 с: марка ──────────────────────────────────────────
  {
    const f = $('fi');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      f.style.transformOrigin = '50% 46%';
      f.style.transform = 'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';

      const pk = easeOut(clamp01((t - T.fin.kicker) / 0.30));
      const fk = $('fiKicker');
      fk.style.opacity = pk;
      fk.style.transform = 'translateY(' + ((1 - pk) * 16).toFixed(1) + 'px)';

      const p1 = easeBack(clamp01((t - T.fin.l1) / 0.42));
      const l1 = $('fiL1');
      l1.style.opacity = easeOut(clamp01((t - T.fin.l1) / 0.24));
      l1.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - p1) * 48 + fala(t, 0.3) * 2.6).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.l1 - 0.16) / 0.30)));

      const pp = easeOut(clamp01((t - T.fin.pod) / 0.32));
      const fp = $('fiPod');
      fp.style.opacity = pp;
      fp.style.transform = 'translateY(' + ((1 - pp) * 20 + fala(t, 2.6, 1.1) * 2).toFixed(1) + 'px)';

      $('fiKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.kreska) / 0.42)).toFixed(3) + ')';

      const m = $('mk');
      const pm = easeBack(clamp01((t - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7;
      m.style.transform = 'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      cien($('mkCien'), pmo * 0.9, zy);
      m.querySelector('.pod').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.20) / 0.30));
      m.querySelector('.miasto').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.28) / 0.30));
      m.querySelector('.www').style.opacity = easeOut(clamp01((t - T.fin.marka - 0.38) / 0.34));
    }
  }
};`;

    return dokument(css, body, skrypt);
  },
};


const SZKOLY = { museo: MUSEO, laboca: LABOCA, silesia: SILESIA, akademia: AKADEMIA, wojtek: WOJTEK, expert: EXPERT, oskx: OSKX,
  idance: IDANCE, skt: SKT, laclave: LACLAVE, lingua: LINGUA, lopecik: LOPECIK, autoexpert: AUTOEXPERT, judo: JUDO };

// ── аргументы ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};

const klucz = arg('szkola', 'silesia');
const M = SZKOLY[klucz];
if (!M) {
  console.error(`nie znam szkoły "${klucz}" — dostępne: ${Object.keys(SZKOLY).join(', ')}`);
  process.exit(1);
}
const WYJSCIE = arg('wyjscie') || M.wyjscie;

// ── съёмка ────────────────────────────────────────────────────────
async function otworz(html, katalog) {
  await mkdir(katalog, { recursive: true });
  const plik = path.join(katalog, 'strona.html');
  await writeFile(plik, html, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto('file:///' + plik.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  await page.evaluate(() => window.__fit());
  return { browser, page };
}

// Правки по анимации — это десятки прогонов, и снимать ради каждого 750
// кадров бессмысленно. `--podglad=0.9,3.2` снимает только нужные моменты.
async function podglad(html, katalog, czasy) {
  const { browser, page } = await otworz(html, katalog);
  try {
    for (const t of czasy) {
      await page.evaluate((x) => window.setT(x), t);
      await page.screenshot({ path: path.join(katalog, `t${t.toFixed(2)}.png`), type: 'png' });
    }
  } finally {
    await browser.close();
  }
  console.log(`[podglad] ${katalog}`);
}

async function zdjecia(html, katalog) {
  const { browser, page } = await otworz(html, katalog);
  const klatki = Math.round(SEK * FPS);
  try {
    for (let i = 0; i < klatki; i++) {
      await page.evaluate((t) => window.setT(t), i / FPS);
      await page.screenshot({
        path: path.join(katalog, `f${String(i).padStart(5, '0')}.png`),
        type: 'png',
      });
      if (i % 100 === 0) process.stdout.write(`\r[kadry] ${i}/${klatki}`);
    }
    process.stdout.write(`\r[kadry] ${klatki}/${klatki}\n`);
  } finally {
    await browser.close();
  }
  return klatki;
}

// ── звук ──────────────────────────────────────────────────────────
async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Каждое появление — со звуком. Без транзиента графика ощущается наклейкой,
// как бы аккуратно она ни была нарисована.
async function zbudujDzwiek(tmp) {
  const klik = path.join(tmp, 'klik.wav');
  const swist = path.join(tmp, 'swist.wav');
  const dun = path.join(tmp, 'dun.wav');

  await ffmpeg([
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.85:r=48000',
    '-f', 'lavfi', '-i', 'sine=f=150:d=0.06:r=48000',
    '-filter_complex',
    '[0:a]highpass=f=1200,lowpass=f=7000,afade=t=out:st=0.003:d=0.045[s];' +
      '[1:a]volume=0.30,afade=t=out:st=0:d=0.05[t];' +
      '[s][t]amix=inputs=2:normalize=0,volume=0.9,aformat=channel_layouts=stereo[a]',
    '-map', '[a]', '-ac', '2', '-ar', '48000', klik,
  ]);

  await ffmpeg([
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.34:c=white:a=0.7:r=48000',
    '-af', 'highpass=f=320,lowpass=f=4200,afade=t=in:st=0:d=0.10,' +
      'afade=t=out:st=0.11:d=0.22,volume=0.75,aformat=channel_layouts=stereo',
    '-ac', '2', '-ar', '48000', swist,
  ]);

  await ffmpeg([
    '-f', 'lavfi', '-i', 'sine=f=72:d=0.42:r=48000',
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.09:c=white:a=0.5:r=48000',
    '-filter_complex',
    '[0:a]afade=t=out:st=0.02:d=0.38,volume=1.1[b];' +
      '[1:a]lowpass=f=900,afade=t=out:st=0.005:d=0.07,volume=0.5[n];' +
      '[b][n]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[a]',
    '-map', '[a]', '-ac', '2', '-ar', '48000', dun,
  ]);

  const z = M.dzwieki(M.T).filter((x) => x.t < SEK - 0.05).sort((a, b) => a.t - b.t);
  const wejscia = [];
  const czesci = [];
  z.forEach((e, i) => {
    wejscia.push('-i', e.typ === 'swist' ? swist : e.typ === 'dun' ? dun : klik);
    const ms = Math.max(0, Math.round(e.t * 1000));
    czesci.push(`[${i}:a]volume=${e.gl},adelay=${ms}|${ms}[k${i}]`);
  });
  const stuki = path.join(tmp, 'stuki.wav');
  await ffmpeg([
    ...wejscia,
    '-filter_complex',
    czesci.join(';') + ';' +
      z.map((_, i) => `[k${i}]`).join('') +
      `amix=inputs=${z.length}:normalize=0,apad=whole_dur=${SEK},` +
      `atrim=0:${SEK},asetpts=N/SR/TB[a]`,
    '-map', '[a]', '-ac', '2', '-ar', '48000', stuki,
  ]);

  // Ролик немой — музыка держит весь ритм, поэтому она громче, чем под
  // голосом, но всё равно ниже транзиентов, иначе щелчки утонут.
  const muz = path.join(DIR, 'music', M.muzyka);
  const mix = path.join(tmp, 'mix.wav');
  await ffmpeg([
    '-ss', String(M.muzykaOd ?? 0), '-i', muz, '-i', stuki,
    '-filter_complex',
    `[0:a]atrim=0:${SEK},asetpts=N/SR/TB,volume=0.62,` +
      `afade=t=in:st=0:d=0.35,afade=t=out:st=${(SEK - 0.7).toFixed(2)}:d=0.7[m];` +
      '[m][1:a]amix=inputs=2:normalize=0:duration=longest,' +
      'alimiter=limit=0.94,' +
      'loudnorm=I=-14:TP=-1.5:LRA=11,' +
      // loudnorm отдаёт пик около −0.8 dBTP: для соцсетей это впритык.
      // Досаживаем потолок сами, громкость не трогаем (level=disabled).
      'alimiter=limit=0.82:level=disabled[a]',
    '-map', '[a]', '-t', String(SEK), '-ac', '2', '-ar', '48000', mix,
  ]);
  return mix;
}

// ── сборка ────────────────────────────────────────────────────────
const tmp = path.join(DIR, 'out', `autoszkola-${M.plik}`);
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await mkdir(path.dirname(WYJSCIE), { recursive: true });

console.log(`[rolka] ${M.szkola} — ${SEK} s, ${FPS} kl/s`);

const czasyPodgladu = arg('podglad');
if (czasyPodgladu) {
  await podglad(M.html(), tmp, czasyPodgladu.split(',').map(Number));
  process.exit(0);
}

await zdjecia(M.html(), tmp);
const audio = await zbudujDzwiek(tmp);

await ffmpeg([
  '-framerate', String(FPS), '-i', path.join(tmp, 'f%05d.png'),
  '-i', audio,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
  '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart', '-shortest',
  WYJSCIE,
]);

console.log(`[rolka] gotowe: ${WYJSCIE}`);
if (!argv.includes('--zostaw')) await rm(tmp, { recursive: true, force: true });
