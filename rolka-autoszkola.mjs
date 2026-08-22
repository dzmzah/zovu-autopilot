// Подарочный рилс для автошколы: 15 с, вертикаль, БЕЗ диктора.
// Всё рисуется кодом — ни одного стокового кадра.
//
//   node rolka-autoszkola.mjs
//   node rolka-autoszkola.mjs --dane=autoszkoly/xyz.json --wyjscie=D:/.../XYZ.mp4
//   node rolka-autoszkola.mjs --klatki   — только кадры, без склейки (быстрый просмотр)
//
// Под серию из восьми катовицких школ: ВСЕ тексты и числа живут в объекте
// DANE, хореография и звук пересчитываются от него сами. Чтобы отдать
// следующую школу, достаточно json-файла рядом с роликом.

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const W = 1080;
const H = 1920;
const FPS = 50;
const SEK = 15.0;

// ── ДАННЫЕ ШКОЛЫ ──────────────────────────────────────────────────
// Всё, что видно на экране. Ни одной цифры мимо сайта клиента:
// пакеты, часы, даты стартов и расписание взяты с osk100procent.pl.
// Придуманной «сдаваемости» тут нет и быть не должно — школа её не публикует.
const DANE = {
  plik: 'OSK100_wrzesien',
  szkola: 'OSK 100%',
  miasto: 'KATOWICE',
  www: 'osk100procent.pl',

  // 0–2 с: крючок. Выбор из двух дат читается быстрее вопроса «сколько это
  // длится»: в нём уже есть цена промедления, и он не обещает ничего.
  hak: {
    jasne: 'WRZESIEŃ',
    ciemne: 'CZY MARZEC?',
    pod: 'Kiedy zaczniesz — wtedy zdasz.',
  },

  // 2–9 с: честная ось времени. Числа въезжают и ОСТАЮТСЯ на экране.
  os: [
    { nr: '01', tytul: 'ZAPIS',                pod: 'na kurs',           znak: 'WRZESIEŃ' },
    { nr: '02', tytul: 'TEORIA',               pod: 'godzin lekcyjnych', licznik: 30, jednostka: ' h' },
    { nr: '03', tytul: 'JAZDY',                pod: 'godzin zegarowych', licznik: 30, jednostka: ' h' },
    { nr: '04', tytul: 'EGZAMINY WEWNĘTRZNE',  pod: 'teoria i praktyka', znak: '0 zł', zolty: true },
    { nr: '05', tytul: 'EGZAMIN PAŃSTWOWY',    pod: 'i jedziesz sam',    znak: 'ZIMĄ' },
  ],

  // 9–12 с: что входит в цену. Ровно три пункта, больше зритель не удержит.
  cena: {
    tytul: 'W KAŻDYM PAKIECIE',
    karty: [
      { liczba: 2, jednostka: ' h',  podpis: 'SYMULATOR JAZDY' },
      { liczba: 4, jednostka: ' h',  podpis: 'PIERWSZA POMOC' },
      { znak: '0 zł', podpis: 'EGZAMINY WEWNĘTRZNE', zolty: true },
    ],
  },

  // 12–15 с: конкретика, с которой можно позвонить.
  finał: {
    kicker: 'NAJBLIŻSZE KURSY TEORII',
    linia1: 'STARTUJĄ',
    linia2: 'WE WRZEŚNIU',
    chipy: ['PIĄTKI *16:00*', 'SOBOTY I NIEDZIELE *10:00*'],
  },

  // Не рисуется — держим рядом, чтобы цифры школы лежали в одном месте.
  pakiety: { Podstawowy: 4600, Ekonomiczny: 6300, Premium: 8100 },
  starty: ['wrzesień', 'październik', 'listopad', 'grudzień 2026'],

  muzyka: 'pixabay-creative-technology-showreel.mp3',
  // Не с начала трека: вступление на 4-7 дБ тише и рвано по секундам
  // (замер: -23.9 против -10 в середине). Ролик обязан открыться на полном
  // аранжементе, иначе первые две секунды звучат как «ещё не началось».
  muzykaOd: 30,
};

// ── ХОРЕОГРАФИЯ ───────────────────────────────────────────────────
// Одни и те же числа управляют картинкой и звуком: щелчок стоит ровно там,
// где элемент садится. Если тайминги разъедутся, звук отклеится от кадра.
const T = {
  hak: { a: 0.10, plama: 0.46, pod: 0.86, wyjscie: 1.92 },
  os: { a: 1.98, pierwszy: 0.26, krok: 1.28, wyjscie: 8.78 },
  cena: { a: 9.06, tytul: 0.10, pierwszy: 0.34, krok: 0.33, wyjscie: 11.62 },
  fin: { a: 11.98, kicker: 0.06, l1: 0.22, l2: 0.44, kreska: 0.72, chip: 0.94, chip2: 1.14, marka: 1.58 },
};

// Палитра: фирменный фиолет + жёлтый акцент. Жёлтая подложка — наш способ
// выделять ключевое слово, обводки нет ни в одном образце Захара.
const KOLOR = {
  ciemny: '#0d0820',
  ciemny2: '#180f3d',
  akcent: '#7c3aed',
  jasny: '#a78bfa',
  zolty: '#ffd23f',
  cichy: '#a79fc9',
};

// ── аргументы ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};

const daneNadpis = arg('dane');
if (daneNadpis) Object.assign(DANE, JSON.parse(await readFile(daneNadpis, 'utf8')));

const WYJSCIE =
  arg('wyjscie') || `D:/My AI/Zovu.pl/Sprzedaz/autoszkoly/${DANE.plik}.mp4`;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Ключевое слово на жёлтой подложке. Два слоя: белый снизу, тёмный внутри
// жёлтой плашки с растущей шириной — плашка ВЫЕЗЖАЕТ по слову, а не
// включается кадром. Это и движение, и акцент одним приёмом.
const hl = (tekst, id) =>
  `<span class="hl" id="${id}"><span class="pod">${esc(tekst)}</span>` +
  `<span class="nad"><i class="blysk"></i><span class="in">${esc(tekst)}</span></span></span>`;

// ── страница ──────────────────────────────────────────────────────
function stronaHtml() {
  const wiersze = DANE.os
    .map(
      (r, i) => `<div class="rzad" data-i="${i}">
  <div class="kropka"></div>
  <div class="karta">
    <div class="cien"></div>
    <div class="tresc">
      <div class="lewo">
        <div class="nr">${esc(r.nr)}</div>
        <div class="tyt" data-fit="58,32,80">${esc(r.tytul)}</div>
        <div class="sub">${esc(r.pod)}</div>
      </div>
      <div class="prawo">${
        r.licznik != null
          ? `<span class="licz" data-do="${r.licznik}">0</span><span class="jedn">${esc(
              r.jednostka || ''
            )}</span>`
          : r.zolty
            ? hl(r.znak, `oshl${i}`)
            : `<span class="znak">${esc(r.znak || '')}</span>`
      }</div>
    </div>
  </div>
</div>`
    )
    .join('\n');

  const karty = DANE.cena.karty
    .map(
      (k, i) => `<div class="kkarta ${k.zolty ? 'zol' : ''}" data-i="${i}">
  <div class="cien"></div>
  <div class="ktresc">
    <div class="kliczba">${
      k.liczba != null
        ? `<span class="licz" data-do="${k.liczba}">0</span><span class="jedn">${esc(
            k.jednostka || ''
          )}</span>`
        : hl(k.znak, `cehl${i}`)
    }</div>
    <div class="kpodpis" data-fit="52,32,120">${esc(k.podpis)}</div>
  </div>
</div>`
    )
    .join('\n');

  const chipy = DANE.finał.chipy
    // *16:00* — час жёлтым: именно час человек ищет глазами в этой строке.
    .map(
      (c, i) =>
        `<div class="chip" data-i="${i}" data-fit="52,34,90">${esc(c).replace(
          /\*(.+?)\*/g,
          '<b class="godz">$1</b>'
        )}</div>`
    )
    .join('\n');

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900&family=Playfair+Display:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{background:${KOLOR.ciemny};overflow:hidden;font-family:'Inter',sans-serif;
  -webkit-font-smoothing:antialiased}

/* ── фон: он живёт всегда ─────────────────────────────────────── */
#tlo{position:absolute;inset:0;
  background:linear-gradient(175deg,${KOLOR.ciemny2} 0%,${KOLOR.ciemny} 62%,#08051a 100%)}
#lampa{position:absolute;left:-10%;top:-14%;width:120%;height:90%;
  background:radial-gradient(ellipse 46% 42% at 50% 45%, rgba(124,58,237,.55), rgba(124,58,237,0) 68%)}
#lampa2{position:absolute;left:-20%;bottom:-24%;width:140%;height:70%;
  background:radial-gradient(ellipse 40% 46% at 50% 50%, rgba(167,139,250,.20), rgba(0,0,0,0) 70%)}
/* Дорожная разметка: два ряда штрихов уплывают вверх с разной скоростью.
   Тема читается боковым зрением, а кадр никогда не стоит на месте. */
.pas{position:absolute;top:-260px;height:${H + 520}px;width:16px;border-radius:8px;
  background:repeating-linear-gradient(to bottom, rgba(255,255,255,.16) 0 96px, rgba(255,255,255,0) 96px 216px)}
#pas1{left:82px}
#pas2{right:96px;width:10px;opacity:.6}
#ziarno{position:absolute;inset:0;opacity:.05;
  background-image:radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px);
  background-size:5px 5px}

/* ── общий текст ──────────────────────────────────────────────── */
.cn{color:#fff;text-shadow:0 6px 26px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.45)}
.hl{position:relative;display:inline-block;padding:16px 18px 18px;border-radius:18px}
.hl .pod{color:#fff;text-shadow:0 6px 26px rgba(0,0,0,.5)}
.hl .nad{position:absolute;left:0;top:0;bottom:0;width:0;overflow:hidden;
  background:${KOLOR.zolty};border-radius:18px;padding:16px 18px 18px;
  box-shadow:0 14px 34px rgba(255,210,63,.28)}
.hl .nad .in{position:relative;display:block;white-space:nowrap;color:#150e33;text-shadow:none}
/* Блик по плашке. Он и есть жизнь в статичном финале: без него последние
   секунды дают почти нулевую разницу кадров — то есть стоп-кадр. */
.hl .blysk{position:absolute;top:-30%;bottom:-30%;left:0;width:170px;
  background:linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.55) 50%, rgba(255,255,255,0) 100%);
  transform:skewX(-16deg) translateX(-400px)}

/* ── 0–2 с: крючок ────────────────────────────────────────────── */
#hak{position:absolute;left:70px;right:70px;top:640px;text-align:center}
#hak .duze{font-weight:900;font-size:154px;line-height:1.02;letter-spacing:-5px}
#hak .ciemne{color:#6b6390;text-shadow:none}
#hak .podpis{margin-top:34px;font-family:'Playfair Display',serif;font-style:italic;
  font-size:60px;color:${KOLOR.jasny}}
#hakCien{position:absolute;left:20%;right:20%;top:1030px;height:40px;border-radius:50%;
  background:radial-gradient(ellipse at center, rgba(0,0,0,.6), rgba(0,0,0,0) 70%);
  filter:blur(12px)}

/* ── 2–9 с: ось времени ───────────────────────────────────────── */
#os{position:absolute;inset:0}
#szyna{position:absolute;left:132px;top:292px;width:8px;border-radius:6px;height:0;
  background:linear-gradient(180deg,${KOLOR.jasny},${KOLOR.akcent})}
#glowa{position:absolute;left:120px;top:292px;width:32px;height:32px;border-radius:50%;
  background:${KOLOR.zolty};box-shadow:0 0 34px 10px rgba(255,210,63,.45)}
.rzad{position:absolute;left:0;right:0;height:250px;opacity:0}
.rzad .kropka{position:absolute;left:118px;top:96px;width:36px;height:36px;border-radius:50%;
  background:${KOLOR.ciemny};border:8px solid ${KOLOR.jasny};box-shadow:0 0 24px rgba(167,139,250,.6)}
.rzad .karta{position:absolute;left:214px;right:56px;top:34px;min-height:168px;
  border-radius:26px;padding:26px 30px;
  background:linear-gradient(140deg, rgba(255,255,255,.11), rgba(255,255,255,.045));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 26px 60px rgba(0,0,0,.42)}
.rzad .cien{position:absolute;left:6%;right:6%;bottom:-26px;height:40px;border-radius:50%;
  background:radial-gradient(ellipse at center, rgba(0,0,0,.62), rgba(0,0,0,0) 72%);
  filter:blur(14px)}
.tresc{display:flex;align-items:center;gap:22px}
.lewo{flex:1;min-width:0}
.nr{font-weight:800;font-size:30px;letter-spacing:4px;color:${KOLOR.jasny};margin-bottom:6px}
.tyt{font-weight:900;font-size:58px;line-height:1.0;letter-spacing:-2px;color:#fff;white-space:nowrap;
  text-shadow:0 4px 18px rgba(0,0,0,.45)}
.sub{margin-top:10px;font-family:'Playfair Display',serif;font-style:italic;
  font-size:38px;color:${KOLOR.cichy}}
.prawo{flex:0 0 auto;text-align:right;font-weight:900;font-size:88px;letter-spacing:-3px;
  color:#fff;white-space:nowrap;text-shadow:0 6px 22px rgba(0,0,0,.5)}
.prawo .jedn{font-size:52px;color:${KOLOR.jasny};letter-spacing:-1px}
.prawo .znak{font-size:52px;font-weight:800;color:${KOLOR.jasny};letter-spacing:0}
.prawo .hl{font-size:74px}

/* ── 9–12 с: что в цене ───────────────────────────────────────── */
#cena{position:absolute;inset:0;opacity:0}
#cenaTyt{position:absolute;left:70px;right:70px;top:300px;text-align:center;
  font-weight:800;font-size:46px;letter-spacing:8px;color:${KOLOR.jasny}}
.kkarta{position:absolute;left:70px;right:70px;height:262px;border-radius:34px;
  padding:0 46px;display:flex;align-items:center;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.12), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 30px 70px rgba(0,0,0,.45)}
.kkarta .cien{position:absolute;left:8%;right:8%;bottom:-30px;height:46px;border-radius:50%;
  background:radial-gradient(ellipse at center, rgba(0,0,0,.66), rgba(0,0,0,0) 72%);
  filter:blur(16px)}
.ktresc{display:flex;align-items:center;gap:36px;width:100%}
.kliczba{flex:0 0 300px;font-weight:900;font-size:132px;letter-spacing:-6px;color:#fff;
  text-shadow:0 8px 30px rgba(0,0,0,.5);white-space:nowrap}
.kliczba .jedn{font-size:72px;color:${KOLOR.zolty};letter-spacing:-2px}
.kliczba .hl{font-size:108px}
.godz{color:${KOLOR.zolty};margin-left:.32em}
.kpodpis{flex:1;font-weight:800;font-size:52px;line-height:1.06;letter-spacing:-1px;color:#fff;
  text-shadow:0 4px 18px rgba(0,0,0,.45)}

/* ── 12–15 с: конкретика ──────────────────────────────────────── */
#fin{position:absolute;inset:0;opacity:0}
#finKicker{position:absolute;left:70px;right:70px;top:344px;text-align:center;
  font-weight:800;font-size:42px;letter-spacing:7px;color:${KOLOR.jasny};opacity:0}
#finL1{position:absolute;left:70px;right:70px;top:436px;text-align:center;
  font-weight:900;font-size:104px;letter-spacing:-3px;color:#fff;opacity:0}
#finL2{position:absolute;left:70px;right:70px;top:596px;text-align:center;
  font-weight:900;font-size:126px;letter-spacing:-4px;opacity:0}
#finKreska{position:absolute;left:190px;top:828px;width:700px;height:5px;border-radius:3px;
  background:linear-gradient(90deg,${KOLOR.akcent},${KOLOR.zolty});transform-origin:left center;
  transform:scaleX(0)}
.chip{position:absolute;left:168px;right:168px;height:116px;border-radius:24px;
  display:flex;align-items:center;justify-content:center;text-align:center;
  font-weight:800;font-size:52px;letter-spacing:0;color:#fff;opacity:0;
  background:linear-gradient(140deg, rgba(255,255,255,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.20), 0 20px 50px rgba(0,0,0,.4)}
#chip0{top:876px}
#chip1{top:1018px}
#marka{position:absolute;left:70px;right:70px;top:1216px;text-align:center;opacity:0}
#marka .nazwa{font-weight:900;font-size:132px;letter-spacing:-5px;color:#fff;
  text-shadow:0 10px 40px rgba(0,0,0,.55)}
#marka .miasto{margin-top:8px;font-weight:800;font-size:52px;letter-spacing:12px;
  color:${KOLOR.zolty}}
#marka .www{margin-top:24px;font-weight:600;font-size:44px;letter-spacing:1px;
  color:${KOLOR.cichy}}
#markaCien{position:absolute;left:26%;right:26%;top:1372px;height:44px;border-radius:50%;
  background:radial-gradient(ellipse at center, rgba(0,0,0,.6), rgba(0,0,0,0) 72%);
  filter:blur(14px);opacity:0}
</style></head><body>

<div id="tlo"><div id="lampa"></div><div id="lampa2"></div></div>
<div class="pas" id="pas1"></div>
<div class="pas" id="pas2"></div>
<div id="ziarno"></div>

<div id="hak">
  <div class="duze cn">${hl(DANE.hak.jasne, 'hakHl')}</div>
  <div class="duze ciemne">${esc(DANE.hak.ciemne)}</div>
  <div class="podpis">${esc(DANE.hak.pod)}</div>
</div>
<div id="hakCien"></div>

<div id="os">
  <div id="szyna"></div>
  <div id="glowa"></div>
  ${wiersze}
</div>

<div id="cena">
  <div id="cenaTyt">${esc(DANE.cena.tytul)}</div>
  ${karty}
</div>

<div id="fin">
  <div id="finKicker">${esc(DANE.finał.kicker)}</div>
  <div id="finL1">${esc(DANE.finał.linia1)}</div>
  <div id="finL2">${hl(DANE.finał.linia2, 'finHl')}</div>
  <div id="finKreska"></div>
  ${chipy}
  <div id="marka">
    <div class="nazwa">${esc(DANE.szkola)}</div>
    <div class="miasto">${esc(DANE.miasto)}</div>
    <div class="www">${esc(DANE.www)}</div>
  </div>
  <div id="markaCien"></div>
</div>

<script>
const T = ${JSON.stringify(T)};
const OS = ${JSON.stringify(DANE.os)};
const KART = ${JSON.stringify(DANE.cena.karty)};
const SEK = ${SEK};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;
// Лёгкий перелёт на посадке: элемент чуть проскакивает и возвращается.
// Без него въезд читается как перемещение картинки, а не как приход предмета.
const easeBack = (x) => {
  const c = 1.42;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
// Дыхание после посадки. Кадр обязан жить, когда всё уже прилетело.
const fala = (t, f, s = 1.55) => Math.sin(t * s + f);

const rzedy = [...document.querySelectorAll('.rzad')];
const kkarty = [...document.querySelectorAll('.kkarta')];
const chipy = [...document.querySelectorAll('.chip')];
const $ = (id) => document.getElementById(id);

// Y-координаты пунктов оси: считаем от числа пунктов, чтобы список из
// четырёх или шести шагов у другой школы разложился сам.
const OS_GORA = 268;
const OS_DOL = 1568;
const KROK_Y = (OS_DOL - OS_GORA) / OS.length;
const yRzad = (i) => Math.round(OS_GORA + i * KROK_Y);
const tRzad = (i) => T.os.a + T.os.pierwszy + i * T.os.krok;
const tKarta = (i) => T.cena.a + T.cena.pierwszy + i * T.cena.krok;

// Карточки «в цене» центруем по тем же правилам — три или четыре, неважно.
const K_GORA = 502;
const K_KROK = 326;

let SZER = {};
window.__fit = () => {
  rzedy.forEach((r, i) => { r.style.top = yRzad(i) + 'px'; });
  kkarty.forEach((k, i) => { k.style.top = (K_GORA + i * K_KROK) + 'px'; });
  chipy.forEach((c, i) => { c.id = 'chip' + i; c.style.top = (876 + i * 142) + 'px'; });

  document.querySelectorAll('[data-fit]').forEach((e) => {
    const [start, min, maxh] = e.dataset.fit.split(',').map(Number);
    let s = start;
    e.style.fontSize = s + 'px';
    while (s > min && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > maxh)) {
      s -= 2; e.style.fontSize = s + 'px';
    }
  });
  // Ширина жёлтой плашки меряется ОДИН раз: во время съёмки шрифт уже
  // загружен, а внутри setT замерять нельзя — из-за скруглений и теней
  // значение поплывёт от кадра к кадру.
  document.querySelectorAll('.hl').forEach((e) => {
    SZER[e.id || (e.id = 'hl' + Math.random().toString(36).slice(2))] =
      e.getBoundingClientRect().width;
  });
};

// Блик пробегает по каждой плашке по кругу; фаза от id, чтобы две плашки
// в одном кадре не вспыхивали одновременно.
function blyski(t) {
  document.querySelectorAll('.hl').forEach((e, i) => {
    const b = e.querySelector('.blysk');
    if (!b) return;
    const szer = (SZER[e.id] || 300) + 340;
    const faza = ((t * 0.46 + i * 0.37) % 1);
    b.style.transform = 'skewX(-16deg) translateX(' + (faza * szer - 240).toFixed(0) + 'px)';
  });
}

function plama(id, p) {
  const e = document.getElementById(id);
  if (!e) return;
  e.querySelector('.nad').style.width = Math.round((SZER[id] || 0) * clamp01(p)) + 'px';
}

// Приход предмета: снизу, с поворотом по обеим осям — это и есть
// трёхмерность, которой не даёт простой сдвиг.
function wjazd(el, p, opts = {}) {
  const dy = (opts.dy ?? 46) * (1 - p);
  const dx = (opts.dx ?? 0) * (1 - p);
  const ry = (opts.ry ?? 0) * (1 - p);
  const rx = (opts.rx ?? 0) * (1 - p);
  const sc = 1 - (opts.sc ?? 0) * (1 - p);
  el.style.transform =
    'perspective(1500px) translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)' +
    ' rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)' +
    ' scale(' + sc.toFixed(3) + ')' + (opts.po || '');
}

window.setT = (t) => {
  blyski(t);
  // ── фон ─────────────────────────────────────────────────────
  // Штрихи разметки уплывают вверх непрерывно, скорости разные — глубина.
  $('pas1').style.transform = 'translateY(' + (-((t * 132) % 216)).toFixed(1) + 'px)';
  $('pas2').style.transform = 'translateY(' + (-((t * 86) % 216)).toFixed(1) + 'px)';
  const l = $('lampa');
  l.style.transform =
    'translate(' + (fala(t, 0, .55) * 26).toFixed(1) + 'px,' + (fala(t, 1.7, .42) * 20).toFixed(1) + 'px)' +
    ' scale(' + (1 + fala(t, .6, .5) * .04).toFixed(3) + ')';
  $('lampa2').style.transform = 'translate(' + (fala(t, 2.2, .38) * -30).toFixed(1) + 'px,0)';

  // ── 0–2 с: крючок ───────────────────────────────────────────
  {
    const h = $('hak');
    const cien = $('hakCien');
    const p = easeOut(clamp01((t - T.hak.a) / 0.42));
    const wyj = easeIn(clamp01((t - T.hak.wyjscie) / 0.30));
    const widok = p > 0 && wyj < 1;
    h.style.display = widok ? 'block' : 'none';
    cien.style.display = widok ? 'block' : 'none';
    if (widok) {
      const zyc = fala(t, 0.4) * 5;
      h.style.opacity = Math.min(p, 1 - wyj);
      h.style.transform =
        'perspective(1600px) translate3d(0,' + ((1 - p) * 70 - wyj * 90 + zyc).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p) * -26).toFixed(2) + 'deg) scale(' + (1 - wyj * 0.06).toFixed(3) + ')';
      const ciemne = h.querySelector('.ciemne');
      const pc = easeOut(clamp01((t - T.hak.a - 0.20) / 0.36));
      ciemne.style.opacity = pc;
      ciemne.style.transform = 'translateY(' + ((1 - pc) * 34).toFixed(1) + 'px)';
      const pp = easeOut(clamp01((t - T.hak.a - T.hak.pod) / 0.34));
      const pod = h.querySelector('.podpis');
      pod.style.opacity = pp * (1 - wyj);
      pod.style.transform = 'translateY(' + ((1 - pp) * 22).toFixed(1) + 'px)';
      plama('hakHl', easeOut(clamp01((t - T.hak.a - T.hak.plama) / 0.26)));
      cien.style.opacity = (Math.min(p, 1 - wyj) * (0.55 - fala(t, 0.4) * 0.10)).toFixed(3);
      cien.style.transform = 'scaleX(' + (0.9 + fala(t, 0.4) * 0.05).toFixed(3) + ')';
    }
  }

  // ── 2–9 с: ось времени ──────────────────────────────────────
  {
    const os = $('os');
    const wyj = easeIn(clamp01((t - T.os.wyjscie) / 0.34));
    const widok = t > T.os.a - 0.1 && wyj < 1;
    os.style.display = widok ? 'block' : 'none';
    if (widok) {
      os.style.opacity = 1 - wyj;

      // Рельс тянется вниз и приходит к каждой точке ровно к её выезду.
      let hSzyny = 0;
      const t0 = tRzad(0) - 0.18;
      if (t >= t0) {
        let i = 0;
        while (i < OS.length - 1 && t > tRzad(i + 1)) i++;
        const a = i === 0 ? t0 : tRzad(i);
        const b = tRzad(i + 1) ?? tRzad(i) + 0.5;
        const yA = yRzad(i) + 114 - 292 + (i === 0 ? 0 : 0);
        const yB = (i < OS.length - 1 ? yRzad(i + 1) + 114 : OS_DOL + 40) - 292;
        const k = clamp01((t - a) / Math.max(0.05, b - a));
        hSzyny = i === 0 && t < tRzad(0)
          ? (yRzad(0) + 114 - 292) * clamp01((t - t0) / 0.18)
          : yA + (yB - yA) * k;
      }
      $('szyna').style.height = Math.max(0, hSzyny).toFixed(0) + 'px';
      $('glowa').style.top = (292 + Math.max(0, hSzyny) - 16).toFixed(0) + 'px';
      $('glowa').style.opacity = hSzyny > 2 && t < T.os.wyjscie ? 1 : 0;
      $('glowa').style.transform = 'scale(' + (1 + fala(t, 0, 6) * 0.12).toFixed(3) + ')';

      rzedy.forEach((r, i) => {
        const a = tRzad(i);
        const p = clamp01((t - a) / 0.40);
        if (p <= 0) { r.style.opacity = 0; return; }
        const e = easeBack(p);
        // Ряды уходят волной, а не все разом: волна читается как движение,
        // одновременное исчезновение — как выключенный свет.
        const w = easeIn(clamp01((t - T.os.wyjscie - i * 0.035) / 0.26));
        r.style.opacity = Math.min(easeOut(p), 1 - w);
        const zy = fala(t, i * 1.1) * 3.4;
        const karta = r.querySelector('.karta');
        wjazd(karta, e, {
          dy: 26, dx: -110, ry: -16, rx: 4, sc: 0.06,
          po: ' translate3d(' + (-w * 140).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.1 + 0.8, 1.2) * 1.1).toFixed(2) + 'deg)',
        });
        const cien = r.querySelector('.cien');
        cien.style.opacity = (Math.min(easeOut(p), 1 - w) * (0.62 - zy * 0.03)).toFixed(3);
        cien.style.transform = 'scaleX(' + (0.94 - zy * 0.008).toFixed(3) + ')';
        const kr = r.querySelector('.kropka');
        const pk = easeBack(clamp01((t - a + 0.10) / 0.30));
        kr.style.transform = 'scale(' + (pk * (1 + fala(t, i, 2.4) * 0.03)).toFixed(3) + ')';
        // Счётчик щёлкает вверх — готовое число зритель пролистывает.
        const licz = r.querySelector('.licz');
        if (licz) {
          const b = clamp01((t - a - 0.12) / 0.52);
          licz.textContent = Math.round(easeOut(b) * +licz.dataset.do);
        }
        if (OS[i].zolty) plama('oshl' + i, easeOut(clamp01((t - a - 0.22) / 0.26)));
      });
    }
  }

  // ── 9–12 с: что в цене ──────────────────────────────────────
  {
    const c = $('cena');
    const wyj = easeIn(clamp01((t - T.cena.wyjscie) / 0.28));
    const widok = t > T.cena.a - 0.05 && wyj < 1;
    c.style.display = widok ? 'block' : 'none';
    if (widok) {
      c.style.opacity = 1;
      const pt = easeOut(clamp01((t - T.cena.a - T.cena.tytul) / 0.30));
      const ct = $('cenaTyt');
      ct.style.opacity = pt * (1 - wyj);
      ct.style.transform = 'translateY(' + ((1 - pt) * 20).toFixed(1) + 'px)';

      kkarty.forEach((k, i) => {
        const a = tKarta(i);
        const p = clamp01((t - a) / 0.44);
        if (p <= 0) { k.style.opacity = 0; return; }
        const e = easeBack(p);
        const w = easeIn(clamp01((t - T.cena.wyjscie - i * 0.05) / 0.24));
        k.style.opacity = Math.min(easeOut(p), 1 - w);
        const zy = fala(t, i * 1.4 + 0.5) * 4.2;
        wjazd(k, e, {
          dy: 90, ry: 0, rx: 34, sc: 0.10,
          po: ' translate3d(0,' + (zy - w * 40).toFixed(1) + 'px,0)' +
              ' rotateY(' + (fala(t, i * 1.4, 1.15) * 1.3).toFixed(2) + 'deg)' +
              ' scale(' + (1 - w * 0.06).toFixed(3) + ')',
        });
        const cien = k.querySelector('.cien');
        cien.style.opacity = (Math.min(easeOut(p), 1 - w) * (0.66 - zy * 0.03)).toFixed(3);
        cien.style.transform = 'scaleX(' + (0.95 - zy * 0.007).toFixed(3) + ')';
        const licz = k.querySelector('.licz');
        if (licz) {
          const b = clamp01((t - a - 0.14) / 0.46);
          licz.textContent = Math.round(easeOut(b) * +licz.dataset.do);
        }
        if (KART[i].zolty) plama('cehl' + i, easeOut(clamp01((t - a - 0.24) / 0.28)));
      });
    }
  }

  // ── 12–15 с: конкретика ─────────────────────────────────────
  {
    const f = $('fin');
    const widok = t > T.fin.a - 0.05;
    f.style.display = widok ? 'block' : 'none';
    if (widok) {
      f.style.opacity = 1;
      // Медленный наезд на весь финал. Аутро — единственное место, где нечему
      // прилетать, и без камеры последняя секунда даёт почти нулевую разницу
      // кадров, то есть стоп-кадр. Наезд на 1.5% глазом не ловится, а кадр
      // живёт до самого конца.
      f.style.transformOrigin = '50% 46%';
      f.style.transform =
        'scale(' + (1.004 + clamp01((t - T.fin.a) / (SEK - T.fin.a)) * 0.016).toFixed(4) + ')';
      const wejscie = (el, dt, dur, dy) => {
        const p = easeOut(clamp01((t - T.fin.a - dt) / dur));
        el.style.opacity = p;
        return p;
      };
      const k = $('finKicker');
      const pk = wejscie(k, T.fin.kicker, 0.30);
      k.style.transform = 'translateY(' + ((1 - pk) * 18).toFixed(1) + 'px)';

      const l1 = $('finL1');
      const p1 = easeBack(clamp01((t - T.fin.a - T.fin.l1) / 0.40));
      l1.style.opacity = easeOut(clamp01((t - T.fin.a - T.fin.l1) / 0.24));
      l1.style.transform =
        'perspective(1500px) translate3d(0,' + ((1 - p1) * 44 + fala(t, 0.2) * 2.4).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p1) * -18).toFixed(2) + 'deg)';

      const l2 = $('finL2');
      const p2 = easeBack(clamp01((t - T.fin.a - T.fin.l2) / 0.40));
      l2.style.opacity = easeOut(clamp01((t - T.fin.a - T.fin.l2) / 0.24));
      l2.style.transform =
        'perspective(1500px) translate3d(0,' + ((1 - p2) * 48 + fala(t, 1.1) * 3.0).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - p2) * -20).toFixed(2) + 'deg)';
      plama('finHl', easeOut(clamp01((t - T.fin.a - T.fin.l2 - 0.16) / 0.30)));

      $('finKreska').style.transform =
        'scaleX(' + easeOut(clamp01((t - T.fin.a - T.fin.kreska) / 0.44)).toFixed(3) + ')';

      chipy.forEach((c, i) => {
        const dt = i === 0 ? T.fin.chip : T.fin.chip2;
        const p = easeBack(clamp01((t - T.fin.a - dt) / 0.38));
        c.style.opacity = easeOut(clamp01((t - T.fin.a - dt) / 0.24));
        const zy = fala(t, i * 1.6 + 2.0) * 3.0;
        c.style.transform =
          'perspective(1500px) translate3d(' + ((1 - p) * (i ? 70 : -70)).toFixed(1) + 'px,' + zy.toFixed(1) + 'px,0)' +
          ' rotateY(' + ((1 - p) * (i ? 14 : -14) + fala(t, i * 1.6, 1.2) * 1.0).toFixed(2) + 'deg)';
      });

      const m = $('marka');
      const pm = easeBack(clamp01((t - T.fin.a - T.fin.marka) / 0.46));
      const pmo = easeOut(clamp01((t - T.fin.a - T.fin.marka) / 0.26));
      m.style.opacity = pmo;
      const zy = fala(t, 3.1, 1.35) * 7.0;
      m.style.transform =
        'perspective(1500px) translate3d(0,' + ((1 - pm) * 54 + zy).toFixed(1) + 'px,0)' +
        ' rotateX(' + ((1 - pm) * -22 + fala(t, 3.1, 1.35) * 0.9).toFixed(2) + 'deg)' +
        ' scale(' + (1 - (1 - pm) * 0.08 + fala(t, 1.9, 0.9) * 0.006).toFixed(4) + ')';
      const mc = $('markaCien');
      mc.style.opacity = (pmo * (0.55 - zy * 0.03)).toFixed(3);
      mc.style.transform = 'scaleX(' + (0.92 - zy * 0.008).toFixed(3) + ')';
      const www = m.querySelector('.www');
      www.style.opacity = easeOut(clamp01((t - T.fin.a - T.fin.marka - 0.34) / 0.34));
    }
  }
};
</script></body></html>`;
}

// ── просмотр отдельных секунд ─────────────────────────────────────
// Правки по анимации — это десятки итераций, и гонять ради каждой все 750
// кадров бессмысленно. `--podglad=0.9,2.6,...` снимает только нужные моменты.
async function podglad(html, katalog, czasy) {
  await mkdir(katalog, { recursive: true });
  const plik = path.join(katalog, 'strona.html');
  await writeFile(plik, html, 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto('file:///' + plik.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__fit());
    for (const t of czasy) {
      await page.evaluate((x) => window.setT(x), t);
      await page.screenshot({ path: path.join(katalog, `t${t.toFixed(2)}.png`), type: 'png' });
    }
  } finally {
    await browser.close();
  }
  console.log(`[podglad] ${katalog}`);
}

// ── съёмка ────────────────────────────────────────────────────────
async function zdjecia(html, katalog) {
  await mkdir(katalog, { recursive: true });
  const plik = path.join(katalog, 'strona.html');
  await writeFile(plik, html, 'utf8');

  const klatki = Math.round(SEK * FPS);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
    });
    await page.goto('file:///' + plik.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__fit());
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
// как бы аккуратно она ни была нарисована. Синтезируем сами: шумовой
// всплеск 1.2–7 кГц плюс низкий удар читается ухом как щелчок клавиши.
function zdarzenia() {
  const z = [];
  z.push({ t: T.hak.a + 0.02, typ: 'swist', gl: 0.55 });
  z.push({ t: T.hak.a + 0.16, typ: 'dun', gl: 0.85 });
  z.push({ t: T.hak.a + T.hak.plama + 0.04, typ: 'klik', gl: 0.7 });
  z.push({ t: T.hak.a + T.hak.pod + 0.04, typ: 'klik', gl: 0.4 });
  z.push({ t: T.hak.wyjscie, typ: 'swist', gl: 0.6 });
  DANE.os.forEach((_, i) => {
    z.push({ t: T.os.a + T.os.pierwszy + i * T.os.krok + 0.16, typ: 'klik', gl: 0.62 });
  });
  z.push({ t: T.os.wyjscie + 0.02, typ: 'swist', gl: 0.6 });
  DANE.cena.karty.forEach((_, i) => {
    z.push({ t: T.cena.a + T.cena.pierwszy + i * T.cena.krok + 0.2, typ: 'klik', gl: 0.66 });
  });
  z.push({ t: T.cena.wyjscie + 0.02, typ: 'swist', gl: 0.6 });
  z.push({ t: T.fin.a + T.fin.l1 + 0.16, typ: 'klik', gl: 0.6 });
  z.push({ t: T.fin.a + T.fin.l2 + 0.18, typ: 'dun', gl: 0.8 });
  z.push({ t: T.fin.a + T.fin.chip + 0.16, typ: 'klik', gl: 0.5 });
  z.push({ t: T.fin.a + T.fin.chip2 + 0.16, typ: 'klik', gl: 0.5 });
  z.push({ t: T.fin.a + T.fin.marka + 0.2, typ: 'dun', gl: 0.9 });
  return z.filter((x) => x.t < SEK - 0.05);
}

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

  // Низкий удар под крупные посадки: он даёт вес, которого щелчку не хватает.
  await ffmpeg([
    '-f', 'lavfi', '-i', 'sine=f=72:d=0.42:r=48000',
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.09:c=white:a=0.5:r=48000',
    '-filter_complex',
    '[0:a]afade=t=out:st=0.02:d=0.38,volume=1.1[b];' +
      '[1:a]lowpass=f=900,afade=t=out:st=0.005:d=0.07,volume=0.5[n];' +
      '[b][n]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[a]',
    '-map', '[a]', '-ac', '2', '-ar', '48000', dun,
  ]);

  const z = zdarzenia();
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

  // Подложка. Ролик немой — музыка держит весь ритм, поэтому она громче,
  // чем под голосом, но всё равно ниже транзиентов, иначе щелчки утонут.
  const muz = path.join(DIR, 'music', DANE.muzyka);
  const mix = path.join(tmp, 'mix.wav');
  await ffmpeg([
    '-ss', String(DANE.muzykaOd ?? 0), '-i', muz, '-i', stuki,
    '-filter_complex',
    `[0:a]atrim=0:${SEK},asetpts=N/SR/TB,volume=0.62,` +
      `afade=t=in:st=0:d=0.35,afade=t=out:st=${(SEK - 0.7).toFixed(2)}:d=0.7[m];` +
      '[m][1:a]amix=inputs=2:normalize=0:duration=longest,' +
      'alimiter=limit=0.94,' +
      'loudnorm=I=-14:TP=-1.5:LRA=11,' +
      // loudnorm отдаёт пик −0.8 dBTP: для соцсетей это впритык, лишние
      // межсэмпловые пики там ловит уже их собственный кодек. Досаживаем
      // потолок сами, громкость при этом не трогаем (level=disabled).
      'alimiter=limit=0.82:level=disabled[a]',
    '-map', '[a]', '-t', String(SEK), '-ac', '2', '-ar', '48000', mix,
  ]);
  return mix;
}

// ── сборка ────────────────────────────────────────────────────────
const tmp = path.join(DIR, 'out', `autoszkola-${DANE.plik}`);
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await mkdir(path.dirname(WYJSCIE), { recursive: true });

console.log(`[rolka] ${DANE.szkola} — ${SEK} s, ${FPS} kl/s`);

const czasyPodgladu = arg('podglad');
if (czasyPodgladu) {
  await podglad(stronaHtml(), tmp, czasyPodgladu.split(',').map(Number));
  process.exit(0);
}

await zdjecia(stronaHtml(), tmp);
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
