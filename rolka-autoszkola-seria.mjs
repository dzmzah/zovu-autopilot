// Подарочные рилсы для катовицких автошкол — вторая и третья в серии.
// 15 с, вертикаль 1080x1920, 50 к/с, БЕЗ диктора, читается без звука.
//
//   node rolka-autoszkola-seria.mjs --szkola=silesia
//   node rolka-autoszkola-seria.mjs --szkola=akademia
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
  <div class="ptak"><i class="k1"></i><i class="k2"></i></div>
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
.ptak i{position:absolute;display:block;height:9px;border-radius:5px;background:${KOLOR.zolty};
  transform-origin:0 50%}
.ptak .k1{left:20px;top:40px;width:24px;transform:rotate(45deg) scaleX(0)}
.ptak .k2{left:34px;top:47px;width:38px;transform:rotate(-52deg) scaleX(0)}
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
        w.querySelector('.k1').style.transform = 'rotate(45deg) scaleX(' + easeOut(clamp01(k * 2)).toFixed(3) + ')';
        w.querySelector('.k2').style.transform = 'rotate(-52deg) scaleX(' + easeOut(clamp01((k - 0.35) / 0.65)).toFixed(3) + ')';
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

const SZKOLY = { silesia: SILESIA, akademia: AKADEMIA };

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
