// ══════════════════════════════════════════════════════════════════
// Сетка вариантов ФОНА для роликов автошкол.
// Берём боевой rolka-autoszkola-seria.mjs, подменяем ТОЛЬКО три куска
// (CSS фона, разметку фона, функцию tlo(t)) и снимаем один и тот же
// кадр OSK WOJTEK 9.20 с — тарелка 30 h, два чипа и мелкая строка.
// Текст и элементы не трогаем: сравнение честное.
// ══════════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const exe = promisify(execFile);
const DIR = import.meta.dirname;
const ZRODLO = path.join(DIR, 'rolka-autoszkola-seria.mjs');
const WYJ = 'D:\\My AI\\Zovu.pl\\Sprzedaz\\autoszkoly\\tla';
const POZA = 9.2;            // секунда кадра-эталона
const KLIP_SEK = 3;
const FPS = 50;

const rng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const ZIARNO = `#ziarno{position:absolute;inset:0;opacity:.05;
  background-image:radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px);
  background-size:5px 5px}`;

// ── 1. ДОРОГА В ПЕРСПЕКТИВЕ ───────────────────────────────────────
const W1 = (() => {
  const css = `
#tlo{position:absolute;inset:0;
  background:linear-gradient(180deg,#1b1049 0%,#150d38 30%,#0f0a28 58%,#0b0720 100%)}
#zorza{position:absolute;left:-14%;right:-14%;top:16%;height:52%;
  background:radial-gradient(ellipse 40% 48% at 50% 56%, rgba(124,58,237,.52), rgba(124,58,237,0) 70%)}
#swit{position:absolute;left:50%;top:1130px;width:900px;height:460px;margin-left:-450px;
  background:radial-gradient(ellipse 46% 44% at 50% 56%, rgba(255,210,63,.14), rgba(255,210,63,0) 72%)}
/* Плоскость земли: перспектива 1400, наклон 80°. Ширина полосы 300 ед.
   у горизонта разворачивается до 1230 px у нижнего края кадра. */
#scena{position:absolute;left:0;right:0;top:1400px;height:520px;overflow:hidden;
  perspective:1400px;perspective-origin:50% 0%}
#plyta{position:absolute;left:-90%;right:-90%;top:0;height:980px;transform-origin:50% 0%;
  transform:rotateX(80deg);
  background:linear-gradient(180deg,#4e35a2 0%,#382480 22%,#2e1e68 46%,#28195a 72%,#22164c 100%)}
/* Мягкий горизонт: без него верхний край плоскости даёт прямую линию поперёк
   кадра, и дорога читается как наклеенный прямоугольник. */
#horyz{position:absolute;left:0;right:0;top:1400px;height:190px;
  background:linear-gradient(180deg, rgba(15,10,40,1) 0%, rgba(15,10,40,.75) 34%, rgba(15,10,40,0) 100%)}
#szwy{position:absolute;inset:0;
  background:repeating-linear-gradient(to bottom, rgba(255,255,255,.07) 0 4px, rgba(255,255,255,0) 4px 210px)}
#osl{position:absolute;left:50%;top:0;width:15px;margin-left:-7.5px;height:100%;
  background:repeating-linear-gradient(to bottom, rgba(255,210,63,.85) 0 150px, rgba(255,210,63,0) 150px 400px)}
.kraw{position:absolute;top:0;width:11px;height:100%;background:rgba(226,218,255,.42)}
#krawL{left:50%;margin-left:-152px}
#krawP{left:50%;margin-left:141px}
.pobo{position:absolute;top:0;height:100%;width:150px;
  background:linear-gradient(90deg, rgba(124,58,237,.22), rgba(124,58,237,0))}
#poboL{left:50%;margin-left:-302px;transform:scaleX(-1)}
#poboP{left:50%;margin-left:152px}
#zanik{position:absolute;left:0;right:0;top:1400px;height:520px;
  background:linear-gradient(180deg, rgba(11,7,32,.22) 0%, rgba(11,7,32,.30) 46%, rgba(11,7,32,.72) 100%)}
#mgla{position:absolute;left:0;right:0;top:1250px;height:300px;
  background:linear-gradient(180deg, rgba(27,16,70,0) 0%, rgba(46,30,105,.55) 58%, rgba(27,16,70,0) 100%)}
.lat{position:absolute;left:0;top:0;border-radius:50%;
  background:radial-gradient(circle at 50% 50%, rgba(255,238,180,.95) 0%, rgba(255,210,63,.45) 28%, rgba(255,210,63,0) 70%)}
${ZIARNO}`;

  const html = `
<div id="tlo">
  <div id="zorza"></div>
  <div id="swit"></div>
  <div id="mgla"></div>
  <div id="scena">
    <div id="plyta">
      <div id="szwy"></div>
      <div class="pobo" id="poboL"></div>
      <div class="pobo" id="poboP"></div>
      <div class="kraw" id="krawL"></div>
      <div class="kraw" id="krawP"></div>
      <div id="osl"></div>
    </div>
  </div>
  <div id="horyz"></div>
  <div id="zanik"></div>
  <i class="lat"></i><i class="lat"></i><i class="lat"></i>
  <i class="lat"></i><i class="lat"></i><i class="lat"></i>
</div>
<div id="ziarno"></div>`;

  // Фонари едут по ТОЙ ЖЕ проекции, что и разметка: глубина растёт линейно,
  // на экран кладём через тот же множитель k. Иначе они плывут отдельно
  // от дороги и глаз ловит подделку.
  const js = `
var _LAT = null;
var HOR = 1400, PER = 1400, SIN = 0.9848, COS = 0.1736, BIEG = 150, DL = 980;
function tlo(t){
  var bieg = (t * BIEG);
  document.getElementById('osl').style.backgroundPosition = '0px ' + (bieg % 400).toFixed(1) + 'px';
  document.getElementById('szwy').style.backgroundPosition = '0px ' + (bieg % 210).toFixed(1) + 'px';
  var z = document.getElementById('zorza');
  z.style.transform = 'translate(' + (Math.sin(t*0.48)*24).toFixed(1) + 'px,' +
    (Math.sin(t*0.36+1.4)*15).toFixed(1) + 'px) scale(' + (1+Math.sin(t*0.42)*0.035).toFixed(3) + ')';
  document.getElementById('swit').style.opacity = (0.78 + Math.sin(t*0.5+0.8)*0.16).toFixed(3);
  if(!_LAT) _LAT = [].slice.call(document.querySelectorAll('.lat'));
  _LAT.forEach(function(e,i){
    var strona = i < 3 ? -1 : 1;
    var Y = ((t * BIEG) + (i % 3) * (DL / 3) + (i >= 3 ? DL / 6 : 0)) % DL;
    var k = PER / (PER - Y * SIN);
    var y = HOR + COS * Y * k - 74 * k;      // фонарь висит над плоскостью
    var x = 540 + strona * 330 * k;
    var s = 40 * k + 5;
    e.style.width = s.toFixed(1) + 'px';
    e.style.height = s.toFixed(1) + 'px';
    e.style.transform = 'translate(' + (x - s/2).toFixed(1) + 'px,' + (y - s/2).toFixed(1) + 'px)';
    var wy = Math.max(0, Math.min(1, (1920 + 200 - y) / 320));
    e.style.opacity = (Math.min(1, Y / 240) * wy * 0.8).toFixed(3);
  });
}`;
  return { nr: 1, nazwa: 'Droga w perspektywie', css, html, js };
})();

// ── 2. НОЧЬ И ОГНИ ────────────────────────────────────────────────
const W2 = (() => {
  const r = rng(20260823);
  // Настоящее боке — это ДИСК с подсветкой по краю, а не мягкое пятно.
  // Мягкое пятно на тёмном фоне пропадает совсем: проверено первым прогоном.
  const bok = [];
  for (let i = 0; i < 22; i++) {
    const gora = i % 3 === 0;                       // часть огней вверху кадра
    const d = (gora ? 90 : 130) + Math.round(r() * (gora ? 130 : 230));
    const kol = i % 4 === 0 ? '255,214,96' : i % 3 === 0 ? '236,231,255' : '176,150,255';
    bok.push({
      x: Math.round(r() * 1060 - 60),
      y: gora ? Math.round(-40 + r() * 470) : Math.round(1180 + r() * 780),
      d, kol,
      op: +((gora ? 0.22 : 0.34) + r() * 0.24).toFixed(3),
      bl: 5 + Math.round(r() * 16),
      ax: 14 + Math.round(r() * 34), ay: 10 + Math.round(r() * 26),
      sx: +(0.10 + r() * 0.24).toFixed(3), sy: +(0.08 + r() * 0.20).toFixed(3),
      ph: +(r() * 6.28).toFixed(2),
    });
  }
  const odb = [];
  for (let i = 0; i < 9; i++) {
    odb.push({
      x: Math.round(30 + r() * 990), w: 46 + Math.round(r() * 90),
      h: 220 + Math.round(r() * 280),
      kol: i % 3 === 0 ? '255,214,96' : '176,150,255',
      op: +(0.26 + r() * 0.22).toFixed(3), ph: +(r() * 6.28).toFixed(2),
    });
  }

  const css = `
#tlo{position:absolute;inset:0;
  background:linear-gradient(180deg,#170e3c 0%,#100a2a 44%,#0a0620 78%,#070414 100%)}
#poswiata{position:absolute;left:-10%;right:-10%;top:-6%;height:56%;
  background:radial-gradient(ellipse 44% 46% at 50% 40%, rgba(124,58,237,.40), rgba(124,58,237,0) 70%)}
.bok{position:absolute;border-radius:50%}
#mokro{position:absolute;left:0;right:0;bottom:0;height:700px;
  background:linear-gradient(180deg, rgba(124,58,237,0) 0%, rgba(124,58,237,.14) 34%, rgba(8,5,24,.55) 100%)}
.odb{position:absolute;bottom:0;filter:blur(16px);
  border-radius:46% 54% 40% 40% / 26% 26% 74% 74%}
#przejazd{position:absolute;left:-520px;top:1512px;width:470px;height:30px;border-radius:15px;
  background:linear-gradient(90deg, rgba(255,210,63,0) 0%, rgba(255,240,190,.9) 62%, rgba(255,255,255,0) 100%);
  filter:blur(10px);opacity:0}
#czytelnia{position:absolute;left:0;right:0;top:300px;height:1180px;
  background:linear-gradient(180deg, rgba(11,7,28,0) 0%, rgba(11,7,28,.38) 18%, rgba(11,7,28,.40) 80%, rgba(11,7,28,0) 100%)}
${ZIARNO}`;

  const html = `
<div id="tlo">
  <div id="poswiata"></div>
  ${bok.map((p) => `<i class="bok" style="left:${p.x}px;top:${p.y}px;width:${p.d}px;height:${p.d}px;background:radial-gradient(circle at 50% 50%, rgba(${p.kol},${(p.op * 0.62).toFixed(3)}) 0%, rgba(${p.kol},${(p.op * 0.58).toFixed(3)}) 56%, rgba(${p.kol},${p.op}) 84%, rgba(${p.kol},${(p.op * 0.5).toFixed(3)}) 94%, rgba(${p.kol},0) 100%);filter:blur(${p.bl}px)"></i>`).join('\n  ')}
  <div id="mokro"></div>
  ${odb.map((p) => `<i class="odb" style="left:${p.x}px;width:${p.w}px;height:${p.h}px;background:linear-gradient(180deg, rgba(${p.kol},${p.op}) 0%, rgba(${p.kol},${(p.op * 0.4).toFixed(3)}) 42%, rgba(${p.kol},0) 100%)"></i>`).join('\n  ')}
  <div id="przejazd"></div>
  <div id="czytelnia"></div>
</div>
<div id="ziarno"></div>`;

  const js = `
var BP = ${JSON.stringify(bok)};
var OP = ${JSON.stringify(odb)};
var _BOK = null, _ODB = null;
function tlo(t){
  if(!_BOK){ _BOK = [].slice.call(document.querySelectorAll('.bok')); _ODB = [].slice.call(document.querySelectorAll('.odb')); }
  _BOK.forEach(function(e,i){
    var p = BP[i];
    var dx = Math.sin(t * p.sx * 2.4 + p.ph) * p.ax - t * 5;
    var dy = Math.cos(t * p.sy * 1.7 + p.ph * 0.7) * p.ay - t * 17;
    var sk = 1 + Math.sin(t * p.sy * 2.2 + p.ph) * 0.06;
    e.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + sk.toFixed(3) + ')';
  });
  _ODB.forEach(function(e,i){
    var p = OP[i];
    var s = 1 + Math.sin(t * 0.9 + p.ph) * 0.07;
    e.style.transform = 'translateX(' + (Math.sin(t*0.5+p.ph)*7).toFixed(1) + 'px) scaleY(' + s.toFixed(3) + ')';
    e.style.opacity = (0.8 + Math.sin(t*1.3+p.ph)*0.18).toFixed(3);
  });
  var pr = document.getElementById('przejazd');
  var c = ((t + 1.1) % 4.4) / 4.4;
  pr.style.transform = 'translateX(' + (c * 2020).toFixed(0) + 'px)';
  pr.style.opacity = (Math.sin(c * Math.PI) * 0.75).toFixed(3);
  var po = document.getElementById('poswiata');
  po.style.transform = 'translate(' + (Math.sin(t*0.4)*26).toFixed(1) + 'px,' + (Math.sin(t*0.31+1.1)*16).toFixed(1) + 'px)';
}`;
  return { nr: 2, nazwa: 'Noc i swiatla', css, html, js };
})();

// ── 3. ТЕХНИЧЕСКАЯ СЕТКА ──────────────────────────────────────────
const W3 = (() => {
  const css = `
#tlo{position:absolute;inset:0;
  background:radial-gradient(ellipse 76% 46% at 50% 26%, #1c1150 0%, #120c30 46%, #0b0722 100%)}
#krata{position:absolute;inset:-120px;opacity:.5;
  background-image:
    linear-gradient(rgba(167,139,250,.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(167,139,250,.16) 1px, transparent 1px);
  background-size:96px 96px}
#wezly{position:absolute;inset:-120px;opacity:.55;
  background-image:radial-gradient(rgba(255,210,63,.55) 1.6px, transparent 1.8px);
  background-size:96px 96px}
#hud{position:absolute;left:50%;top:656px;width:1200px;height:1200px;margin:-600px 0 0 -600px}
.pier{position:absolute;left:50%;top:50%;border-radius:50%;border:1px solid rgba(167,139,250,.30);
  transform-origin:50% 50%}
#scena{position:absolute;left:0;right:0;top:1408px;height:512px;overflow:hidden;
  perspective:1200px;perspective-origin:50% 0%}
#plyta{position:absolute;left:-90%;right:-90%;top:0;height:900px;transform-origin:50% 0%;
  transform:rotateX(80deg)}
#kratkaP{position:absolute;inset:0;
  background-image:
    repeating-linear-gradient(to bottom, rgba(124,58,237,.55) 0 3px, rgba(124,58,237,0) 3px 150px),
    repeating-linear-gradient(to right, rgba(124,58,237,.42) 0 3px, rgba(124,58,237,0) 3px 130px)}
#zanik{position:absolute;left:0;right:0;top:1408px;height:512px;
  background:linear-gradient(180deg, rgba(11,7,34,.9) 0%, rgba(11,7,34,.25) 30%, rgba(11,7,34,.55) 100%)}
#skan{position:absolute;left:0;right:0;top:0;height:230px;
  background:linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.10) 50%, rgba(167,139,250,0) 100%)}
.znacz{position:absolute;width:26px;height:26px;opacity:.5}
.znacz i{position:absolute;background:rgba(255,210,63,.5)}
.znacz i.a{left:0;top:0;width:26px;height:2px}
.znacz i.b{left:0;top:0;width:2px;height:26px}
#zn1{left:96px;top:288px}
#zn2{right:96px;top:288px;transform:scaleX(-1)}
#zn3{left:96px;top:1632px;transform:scaleY(-1)}
#zn4{right:96px;top:1632px;transform:scale(-1,-1)}
${ZIARNO}`;

  const html = `
<div id="tlo">
  <div id="krata"></div>
  <div id="wezly"></div>
  <div id="hud">
    <div class="pier" style="width:520px;height:520px;margin:-260px 0 0 -260px"></div>
    <div class="pier" style="width:760px;height:760px;margin:-380px 0 0 -380px"></div>
    <div class="pier" style="width:1040px;height:1040px;margin:-520px 0 0 -520px;border-style:dashed"></div>
  </div>
  <div id="scena"><div id="plyta"><div id="kratkaP"></div></div></div>
  <div id="zanik"></div>
  <div id="skan"></div>
  <div class="znacz" id="zn1"><i class="a"></i><i class="b"></i></div>
  <div class="znacz" id="zn2"><i class="a"></i><i class="b"></i></div>
  <div class="znacz" id="zn3"><i class="a"></i><i class="b"></i></div>
  <div class="znacz" id="zn4"><i class="a"></i><i class="b"></i></div>
</div>
<div id="ziarno"></div>`;

  const js = `
var _PIER = null;
function tlo(t){
  var dx = (t * 7) % 96, dy = (t * 4.5) % 96;
  document.getElementById('krata').style.backgroundPosition = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
  document.getElementById('wezly').style.backgroundPosition = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
  document.getElementById('kratkaP').style.backgroundPosition =
    '0px ' + ((t * 120) % 150).toFixed(1) + 'px, ' + ((t * 26) % 130).toFixed(1) + 'px 0px';
  if(!_PIER) _PIER = [].slice.call(document.querySelectorAll('.pier'));
  _PIER.forEach(function(e,i){
    var s = 0.94 + Math.sin(t * 0.55 + i * 1.3) * 0.045;
    e.style.transform = 'rotate(' + ((t * (6 + i * 3)) % 360).toFixed(1) + 'deg) scale(' + s.toFixed(3) + ')';
    e.style.opacity = (0.55 + Math.sin(t * 0.5 + i) * 0.25).toFixed(3);
  });
  var sk = document.getElementById('skan');
  sk.style.transform = 'translateY(' + (((t * 0.09) % 1) * 2150 - 230).toFixed(0) + 'px)';
}`;
  return { nr: 3, nazwa: 'Siatka techniczna', css, html, js };
})();

// ── 4. СЛОИ С ГЛУБИНОЙ (ПАРАЛЛАКС) ───────────────────────────────
const W4 = (() => {
  const css = `
#tlo{position:absolute;inset:0;
  background:linear-gradient(168deg,#211353 0%,#160e3c 40%,#0e0928 72%,#0a0620 100%)}
.dal{position:absolute;border-radius:50%;filter:blur(70px)}
#d1{left:-160px;top:180px;width:700px;height:700px;background:rgba(124,58,237,.42)}
#d2{right:-220px;top:820px;width:820px;height:820px;background:rgba(88,48,190,.38)}
#d3{left:120px;top:1420px;width:640px;height:640px;background:rgba(167,139,250,.16)}
.smug{position:absolute;left:-40%;width:180%;height:280px;filter:blur(26px);
  background:linear-gradient(90deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.17) 46%, rgba(167,139,250,0) 100%);
  transform-origin:50% 50%}
#s1{top:420px;transform:rotate(-14deg)}
#s2{top:1180px;height:200px;transform:rotate(-9deg);opacity:.7}
.blis{position:absolute;border-radius:50%;filter:blur(52px);background:rgba(6,4,20,.85)}
#b1{left:-360px;bottom:-260px;width:900px;height:760px}
#b2{right:-380px;top:-300px;width:860px;height:720px}
#kurz{position:absolute;inset:0;opacity:.45;
  background-image:radial-gradient(rgba(214,203,255,.5) 1.4px, transparent 1.6px);
  background-size:150px 150px}
#winieta{position:absolute;inset:0;
  background:radial-gradient(ellipse 74% 62% at 50% 46%, rgba(0,0,0,0) 40%, rgba(0,0,0,.62) 100%)}
${ZIARNO}`;

  const html = `
<div id="tlo">
  <i class="dal" id="d1"></i>
  <i class="dal" id="d2"></i>
  <i class="dal" id="d3"></i>
  <div class="smug" id="s1"></div>
  <div class="smug" id="s2"></div>
  <div id="kurz"></div>
  <i class="blis" id="b1"></i>
  <i class="blis" id="b2"></i>
  <div id="winieta"></div>
</div>
<div id="ziarno"></div>`;

  const js = `
function tlo(t){
  var pl = [['d1',16,-1.2],['d2',-11,0.9],['d3',22,-0.8]];
  pl.forEach(function(p,i){
    var e = document.getElementById(p[0]);
    var x = Math.sin(t * 0.5 + i * 1.7) * (44 + i * 14) - t * p[1];
    var y = Math.cos(t * 0.38 + i) * (30 + i * 11) + t * p[2] * 4;
    e.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (1 + Math.sin(t*0.62+i)*0.07).toFixed(3) + ')';
  });
  var s1 = document.getElementById('s1'), s2 = document.getElementById('s2');
  s1.style.transform = 'rotate(-14deg) translate(' + (-((t * 62) % 520)).toFixed(1) + 'px,' + (Math.sin(t*0.7)*26).toFixed(1) + 'px)';
  s2.style.transform = 'rotate(-9deg) translate(' + (((t * 34) % 520) - 260).toFixed(1) + 'px,' + (Math.cos(t*0.55)*20).toFixed(1) + 'px)';
  document.getElementById('kurz').style.backgroundPosition =
    (-(t * 30) % 150).toFixed(1) + 'px ' + (-(t * 21) % 150).toFixed(1) + 'px';
  document.getElementById('b1').style.transform =
    'translate(' + (Math.sin(t*0.62)*76).toFixed(1) + 'px,' + (Math.cos(t*0.5)*40).toFixed(1) + 'px)';
  document.getElementById('b2').style.transform =
    'translate(' + (Math.cos(t*0.54+1.2)*84).toFixed(1) + 'px,' + (Math.sin(t*0.44)*46).toFixed(1) + 'px)';
}`;
  return { nr: 4, nazwa: 'Warstwy z glebia', css, html, js };
})();

// ── 5. ФАКТУРА ────────────────────────────────────────────────────
const W5 = (() => {
  const szum =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='320' height='320' filter='url(%23n)'/%3E%3C/svg%3E\")";

  const css = `
#tlo{position:absolute;inset:0;overflow:hidden;
  background:linear-gradient(158deg,#2a1a68 0%,#1b1149 34%,#110b30 66%,#0a0620 100%)}
#swiatlo{position:absolute;left:-20%;top:-14%;width:140%;height:86%;
  background:radial-gradient(ellipse 34% 40% at 50% 50%, rgba(196,176,255,.34), rgba(124,58,237,.14) 46%, rgba(124,58,237,0) 72%)}
#ciepl{position:absolute;left:-10%;bottom:-18%;width:120%;height:56%;
  background:radial-gradient(ellipse 40% 50% at 50% 50%, rgba(255,210,63,.10), rgba(255,210,63,0) 70%)}
#platno{position:absolute;inset:-160px;opacity:.19;mix-blend-mode:overlay;
  background-image:${szum};background-size:320px 320px}
#ziarno{position:absolute;inset:-160px;opacity:.08;
  background-image:${szum};background-size:170px 170px}
#tkanina{position:absolute;inset:0;opacity:.075;
  background-image:repeating-linear-gradient(52deg, rgba(255,255,255,.7) 0 1px, rgba(255,255,255,0) 1px 9px)}
#winieta{position:absolute;inset:0;
  background:radial-gradient(ellipse 66% 54% at 50% 44%, rgba(0,0,0,0) 34%, rgba(4,2,14,.72) 100%)}
#pyl{position:absolute;inset:0;opacity:.5;
  background-image:radial-gradient(rgba(255,236,190,.55) 1.3px, transparent 1.5px);
  background-size:230px 230px}`;

  const html = `
<div id="tlo">
  <div id="swiatlo"></div>
  <div id="ciepl"></div>
  <div id="tkanina"></div>
  <div id="pyl"></div>
  <div id="winieta"></div>
  <div id="platno"></div>
</div>
<div id="ziarno"></div>`;

  const js = `
function tlo(t){
  var s = document.getElementById('swiatlo');
  s.style.transform = 'translate(' + (Math.sin(t * 0.19) * 130).toFixed(1) + 'px,' +
    (Math.sin(t * 0.14 + 1.2) * 70).toFixed(1) + 'px) scale(' + (1 + Math.sin(t * 0.23) * 0.07).toFixed(3) + ')';
  s.style.opacity = (0.86 + Math.sin(t * 0.27) * 0.14).toFixed(3);
  var c = document.getElementById('ciepl');
  c.style.transform = 'translate(' + (Math.cos(t * 0.16 + 2.1) * 110).toFixed(1) + 'px,0) scale(' + (1 + Math.cos(t*0.2)*0.06).toFixed(3) + ')';
  // Зерно едет медленно и по кругу: рваный шум по кадрам дал бы мерцание.
  document.getElementById('platno').style.transform =
    'translate(' + (Math.sin(t * 1.9) * 46).toFixed(1) + 'px,' + (Math.cos(t * 1.6) * 40).toFixed(1) + 'px)';
  document.getElementById('ziarno').style.transform =
    'translate(' + (Math.cos(t * 2.3 + 1) * 34).toFixed(1) + 'px,' + (Math.sin(t * 2.05) * 30).toFixed(1) + 'px)';
  document.getElementById('pyl').style.backgroundPosition =
    (-(t * 6) % 230).toFixed(1) + 'px ' + (-(t * 11) % 230).toFixed(1) + 'px';
}`;
  return { nr: 5, nazwa: 'Fakturowe', css, html, js };
})();

// ── 6. ГОРОД И ДВИЖЕНИЕ ───────────────────────────────────────────
const W6 = (() => {
  const r = rng(4242);
  const rzad = (hMin, hMax, wMin, wMax) => {
    const b = [];
    let x = 0;
    while (x < 1120) {
      const w = wMin + Math.round(r() * (wMax - wMin));
      const h = hMin + Math.round(r() * (hMax - hMin));
      b.push({ x, w, h, wieza: r() > 0.82 });
      x += w + 6 + Math.round(r() * 22);
    }
    return b;
  };
  const dal = rzad(120, 250, 70, 160);
  const bli = rzad(150, 320, 90, 210);

  const dom = (p, okna) => {
    let o = '';
    if (okna) {
      const kol = Math.max(1, Math.floor((p.w - 18) / 26));
      for (let i = 0; i < kol; i++) {
        for (let j = 0; j < Math.floor(p.h / 46); j++) {
          if (r() > 0.42) continue;
          o += `<i style="left:${10 + i * 26}px;top:${16 + j * 42}px"></i>`;
        }
      }
    }
    return `<b style="left:${p.x}px;width:${p.w}px;height:${p.h}px">${o}${p.wieza ? '<u></u>' : ''}</b>`;
  };

  const css = `
#tlo{position:absolute;inset:0;overflow:hidden;
  background:linear-gradient(180deg,#1a1048 0%,#150d3a 34%,#120b30 60%,#0d0824 100%)}
#luna{position:absolute;left:-12%;right:-12%;top:2%;height:56%;
  background:radial-gradient(ellipse 40% 44% at 50% 46%, rgba(124,58,237,.46), rgba(124,58,237,0) 70%)}
#lupa{position:absolute;left:0;right:0;bottom:140px;height:520px;
  background:linear-gradient(180deg, rgba(124,58,237,0) 0%, rgba(124,58,237,.16) 62%, rgba(124,58,237,.05) 100%)}
.pas{position:absolute;left:0;width:2240px;height:520px}
.pas b{position:absolute;bottom:0;display:block;border-radius:4px 4px 0 0}
.pas b u{position:absolute;left:50%;top:-46px;margin-left:-1.5px;width:3px;height:46px;background:inherit}
.pas b i{position:absolute;width:9px;height:16px;border-radius:2px;background:rgba(255,210,63,.5)}
#dal{bottom:176px}
#dal b{background:#2a1c66;opacity:.5}
#dal b i{display:none}
#bli{bottom:76px}
#bli b{background:#120c2e}
#droga{position:absolute;left:0;right:0;bottom:0;height:110px;
  background:linear-gradient(180deg,#191038 0%,#0d0824 60%,#090519 100%)}
/* Дымка между планами: без неё силуэты читаются как плоская вырезка. */
#dymka{position:absolute;left:0;right:0;bottom:70px;height:420px;
  background:linear-gradient(180deg, rgba(124,58,237,0) 0%, rgba(124,58,237,.16) 46%, rgba(124,58,237,.06) 100%)}
.auta{position:absolute;height:8px;border-radius:4px;filter:blur(3px)}
#czytelnia{position:absolute;inset:0;
  background:linear-gradient(180deg, rgba(13,8,32,.30) 0%, rgba(13,8,32,.40) 40%, rgba(13,8,32,.34) 70%, rgba(13,8,32,0) 100%)}
${ZIARNO}`;

  const html = `
<div id="tlo">
  <div id="luna"></div>
  <div id="lupa"></div>
  <div class="pas" id="dal">${dal.map((p) => dom(p, false)).join('')}${dal.map((p) => dom({ x: p.x + 1120, w: p.w, h: p.h, wieza: p.wieza }, false)).join('')}</div>
  <div class="pas" id="bli">${bli.map((p) => dom(p, true)).join('')}${bli.map((p) => dom({ x: p.x + 1120, w: p.w, h: p.h, wieza: p.wieza }, true)).join('')}</div>
  <div id="dymka"></div>
  <div id="droga"></div>
  <i class="auta" id="a1" style="bottom:74px;width:120px;background:linear-gradient(90deg, rgba(255,236,170,0), rgba(255,236,170,.9))"></i>
  <i class="auta" id="a2" style="bottom:46px;width:150px;background:linear-gradient(270deg, rgba(255,120,120,0), rgba(255,140,140,.75))"></i>
  <i class="auta" id="a3" style="bottom:20px;width:190px;background:linear-gradient(90deg, rgba(255,236,170,0), rgba(255,246,200,.95))"></i>
  <div id="czytelnia"></div>
</div>
<div id="ziarno"></div>`;

  const js = `
var _OKNA = null;
function tlo(t){
  document.getElementById('dal').style.transform = 'translateX(' + (-((t * 11) % 1120)).toFixed(1) + 'px)';
  document.getElementById('bli').style.transform = 'translateX(' + (-((t * 27) % 1120)).toFixed(1) + 'px)';
  document.getElementById('luna').style.transform =
    'translate(' + (Math.sin(t*0.33)*22).toFixed(1) + 'px,' + (Math.sin(t*0.26+1)*13).toFixed(1) + 'px) scale(' + (1+Math.sin(t*0.4)*0.03).toFixed(3) + ')';
  var jazda = [['a1', 4.6, 1, 0.4], ['a2', 5.8, -1, 2.2], ['a3', 3.4, 1, 1.1]];
  jazda.forEach(function(p){
    var e = document.getElementById(p[0]);
    var f = ((t + p[3]) % p[1]) / p[1];
    var x = p[2] > 0 ? f * 1360 - 240 : 1360 - f * 1600;
    e.style.transform = 'translateX(' + x.toFixed(0) + 'px)';
    e.style.opacity = (Math.sin(f * Math.PI) * 0.9).toFixed(3);
  });
  if(!_OKNA) _OKNA = [].slice.call(document.querySelectorAll('#bli b i'));
  _OKNA.forEach(function(e,i){
    if(i % 11) return;
    e.style.opacity = (0.45 + Math.sin(t * (0.6 + (i % 7) * 0.13) + i) * 0.4).toFixed(3);
  });
}`;
  return { nr: 6, nazwa: 'Miasto i ruch', css, html, js };
})();

const WARIANTY = [W1, W2, W3, W4, W5, W6];

// ── подмена трёх кусков в боевом файле ───────────────────────────
function podmien(src, w) {
  let out = src;
  const a = out.indexOf('#tlo{position:absolute');
  const b = out.indexOf('\n.hl{position:relative');
  if (a < 0 || b < 0) throw new Error('nie znalazlem bloku CSS tla');
  out = out.slice(0, a) + w.css.trim() + '\n' + out.slice(b);

  const c = out.indexOf('function tlo(t) {');
  const d = out.indexOf('\n`;', c);
  if (c < 0 || d < 0) throw new Error('nie znalazlem funkcji tlo()');
  const klip =
    '\nwindow.__klip = (x) => { window.setT(' + POZA + '); tlo(' + POZA + ' + x); blyski(' + POZA + ' + x); };\n';
  out = out.slice(0, c) + w.js.trim() + '\n' + klip + out.slice(d);

  const e = out.indexOf('const TLO_HTML = `');
  const f = out.indexOf('`;', e + 20);
  out = out.slice(0, e) + 'const TLO_HTML = `' + w.html + '`;' + out.slice(f + 2);
  return out;
}

// ── съёмка одного варианта ───────────────────────────────────────
async function zrob(w) {
  const src = await readFile(ZRODLO, 'utf8');
  const kod = podmien(src, w);
  const tmpMjs = path.join(DIR, `tlo-w${w.nr}.mjs`);
  await mkdir(path.join(DIR, 'out'), { recursive: true });
  await writeFile(tmpMjs, kod, 'utf8');

  // страницу собираем тем же кодом: запускаем патченый файл в режиме
  // подгляда, он сам напишет strona.html — а снимаем уже своим браузером,
  // чтобы за один запуск получить и кадр, и клип.
  await exe(process.execPath, [tmpMjs, '--szkola=wojtek', `--podglad=${POZA}`], { cwd: DIR });
  const strona = path.join(DIR, 'out', 'autoszkola-WOJTEK_toauto', 'strona.html');

  const katalog = path.join(DIR, 'out', `tlo-klatki-${w.nr}`);
  await rm(katalog, { recursive: true, force: true });
  await mkdir(katalog, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file:///' + strona.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  await page.evaluate(() => window.__fit());

  await page.evaluate((x) => window.setT(x), POZA);
  const png = path.join(WYJ, `wariant-${w.nr}.png`);
  await page.screenshot({ path: png, type: 'png' });

  const n = KLIP_SEK * FPS;
  for (let i = 0; i < n; i++) {
    await page.evaluate((x) => window.__klip(x), i / FPS);
    await page.screenshot({ path: path.join(katalog, `k${String(i).padStart(4, '0')}.png`), type: 'png' });
  }
  await browser.close();

  const mp4 = path.join(WYJ, `wariant-${w.nr}.mp4`);
  await exe('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', path.join(katalog, 'k%04d.png'),
    '-vf', 'scale=540:960:flags=lanczos',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-movflags', '+faststart', mp4]);

  // Замер рывков: пик разницы соседних кадров выше 30 — видимый скачок.
  const wynik = await exe('ffmpeg', ['-hide_banner', '-i', mp4,
    '-vf', 'tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG',
    '-f', 'null', '-']).catch((e) => ({ stdout: '', stderr: String(e.stderr || '') }));
  const dane = ((wynik.stderr || '') + (wynik.stdout || '')).split('\n')
    .filter((s) => s.includes("YAVG")).map((s) => Number(s.split('=').pop()));
  const pik = dane.length ? Math.max(...dane) : -1;
  const sred = dane.length ? dane.reduce((x, y) => x + y, 0) / dane.length : -1;

  await rm(katalog, { recursive: true, force: true });
  await rm(tmpMjs, { force: true });
  console.log(`[w${w.nr}] ${w.nazwa} — pik roznicy ${pik.toFixed(2)}, srednio ${sred.toFixed(2)}`);
  return { nr: w.nr, nazwa: w.nazwa, png, mp4, pik, sred };
}

// ── эталон: текущий фон ──────────────────────────────────────────
async function obecne() {
  await exe(process.execPath, [ZRODLO, '--szkola=wojtek', `--podglad=${POZA}`], { cwd: DIR });
  const zr = path.join(DIR, 'out', 'autoszkola-WOJTEK_toauto', `t${POZA.toFixed(2)}.png`);
  const cel = path.join(WYJ, 'wariant-0-obecne.png');
  await copyFile(zr, cel);
  return cel;
}

// ── сводная сетка ────────────────────────────────────────────────
async function siatka(kafle) {
  const KOL = 480, WIER = 853;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0618;font-family:'Inter',sans-serif;padding:34px 30px 30px}
h1{color:#fff;font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:6px}
h2{color:#a79fc9;font-size:22px;font-weight:700;margin-bottom:26px}
.g{display:grid;grid-template-columns:repeat(4,${KOL}px);gap:26px}
.k{width:${KOL}px}
.k img{width:${KOL}px;height:${WIER}px;display:block;border-radius:12px;
  box-shadow:0 14px 40px rgba(0,0,0,.6)}
.k .p{margin-top:12px;color:#fff;font-size:26px;font-weight:900;letter-spacing:-.5px}
.k .p span{color:#ffd23f}
.k.ob .p span{color:#ff6b6b}
</style></head><body>
<h1>TŁO — sześć wariantów</h1>
<h2>ten sam kadr OSK WOJTEK, ${POZA.toFixed(2)} s · tekst i elementy identyczne</h2>
<div class="g">
${kafle.map((k) => `<div class="k ${k.nr === 0 ? 'ob' : ''}"><img src="file:///${k.png.replace(/\\/g, '/')}"><div class="p"><span>${k.nr}</span> ${k.nazwa}</div></div>`).join('\n')}
</div></body></html>`;
  const plik = path.join(DIR, 'out', 'siatka-tla.html');
  await writeFile(plik, html, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2076, height: 1980 }, deviceScaleFactor: 1 });
  await page.goto('file:///' + plik.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(WYJ, 'porownanie.png'), fullPage: true });
  await browser.close();
}

// ── полные ролики с выбранным фоном ──────────────────────────────
// Три секунды фона хватает, чтобы отсеять лишнее, но не хватает, чтобы
// выбрать: фон живёт весь ролик и спорит с текстом в тех сценах, которых
// в пробе нет вовсе. Поэтому финальный выбор — на целых пятнадцати.
//
//   node tla-warianty.mjs pelne 4 5 6
if (process.argv.includes('pelne')) {
  const nry = process.argv.slice(2).filter((x) => /^\d+$/.test(x)).map(Number);
  const src = await readFile(ZRODLO, 'utf8');
  for (const w of WARIANTY.filter((x) => nry.includes(x.nr))) {
    const tmpMjs = path.join(DIR, `tlo-pelne-w${w.nr}.mjs`);
    await writeFile(tmpMjs, podmien(src, w), 'utf8');
    const cel = path.join(WYJ, `pelna-w${w.nr}-${w.nazwa.replace(/ /g, '-')}.mp4`);
    console.log(`[pelne] ${w.nr} ${w.nazwa} —> ${cel}`);
    await exe(process.execPath, [tmpMjs, '--szkola=wojtek', `--wyjscie=${cel}`], { cwd: DIR });
    await rm(tmpMjs, { force: true });
  }
  process.exit(0);
}

// ── подмена фона в ролике OSK 100% ───────────────────────────────
// Первый ролик собирается ДРУГИМ движком (`rolka-autoszkola.mjs`): фон там
// вшит прямо в разметку и в `setT`, обёрток `TLO_HTML` и `tlo(t)` нет вовсе.
// Ставить их туда задним числом опаснее, чем описать вторую подмену: файл
// уже отдан клиенту и переписывать его структуру ради фона незачем.
function podmienOsk100(src, w) {
  let out = src;

  const a = out.indexOf('#tlo{position:absolute');
  const b = out.indexOf('\n/* ── общий текст');
  if (a < 0 || b < 0) throw new Error('osk100: nie znalazlem bloku CSS tla');
  out = out.slice(0, a) + w.css.trim() + '\n' + out.slice(b);

  const c = out.indexOf('<div id="tlo">');
  const d = out.indexOf('<div id="ziarno"></div>', c);
  if (c < 0 || d < 0) throw new Error('osk100: nie znalazlem HTML tla');
  out = out.slice(0, c) + w.html.trim() + out.slice(d + '<div id="ziarno"></div>'.length);

  // Функция кладётся перед setT, а прежние четыре строки анимации фона
  // заменяются одним вызовом. Границы блока — комментарий «фон» и последняя
  // строка про lampa2; всё, что между ними, принадлежит только фону.
  const e = out.indexOf('window.setT = (t) => {');
  if (e < 0) throw new Error('osk100: nie znalazlem setT');
  out = out.slice(0, e) + w.js.trim() + '\n\n' + out.slice(e);

  const f = out.indexOf('  // ── фон ');
  const g = out.indexOf("$('lampa2').style.transform", f);
  const h = out.indexOf('\n', g);
  if (f < 0 || g < 0) throw new Error('osk100: nie znalazlem animacji tla');
  out = out.slice(0, f) + '  tlo(t);\n' + out.slice(h + 1);
  return out;
}

// ── вся серия одним фоном ────────────────────────────────────────
//   node tla-warianty.mjs seria 6
if (process.argv.includes('seria')) {
  const nr = process.argv.slice(2).filter((x) => /^[0-9]+$/.test(x)).map(Number)[0];
  const w = WARIANTY.find((x) => x.nr === nr);
  if (!w) throw new Error('nie ma wariantu ' + nr);
  const wyj = path.join(WYJ, `seria-w${nr}`);
  await mkdir(wyj, { recursive: true });

  // OSK 100% — отдельный движок.
  const src100 = await readFile(path.join(DIR, 'rolka-autoszkola.mjs'), 'utf8');
  const tmp100 = path.join(DIR, `tlo-seria-osk100.mjs`);
  await writeFile(tmp100, podmienOsk100(src100, w), 'utf8');
  const cel100 = path.join(wyj, '1-OSK100_wrzesien.mp4');
  console.log(`[seria] OSK 100% —> ${cel100}`);
  await exe(process.execPath, [tmp100, `--wyjscie=${cel100}`], { cwd: DIR });
  await rm(tmp100, { force: true });

  // Остальные пять — общий движок серии.
  const src = await readFile(ZRODLO, 'utf8');
  const tmpMjs = path.join(DIR, 'tlo-seria.mjs');
  await writeFile(tmpMjs, podmien(src, w), 'utf8');
  const szkoly = [
    ['silesia', '2-Silesia_3wrzesnia'],
    ['akademia', '3-AkademiaJazdy_3400'],
    ['wojtek', '4-WOJTEK_toauto'],
    ['expert', '5-EXPERT_yaris'],
    ['oskx', '6-OSKX_piec_wariantow'],
  ];
  for (const [klucz, nazwa] of szkoly) {
    const cel = path.join(wyj, `${nazwa}.mp4`);
    console.log(`[seria] ${klucz} —> ${cel}`);
    await exe(process.execPath, [tmpMjs, `--szkola=${klucz}`, `--wyjscie=${cel}`], { cwd: DIR });
  }
  await rm(tmpMjs, { force: true });
  console.log(`[seria] gotowe: ${wyj}`);
  process.exit(0);
}

// ── смешанная раскладка: каждой школе свой фон ───────────────────
// Захар выбрал 4, 5 и 6 и решил не сводить их к одному. Это возможно ровно
// потому, что школы не видят роликов друг друга — страницы у каждой свои
// (их мы разделили, чтобы не показывать чужие цены).
//
// Раскладка не случайная. У EXPERT и OSKX курсивные строки сидят ниже, чем
// у остальных (1428 и 1382 px), и городские силуэты подходят к ним ближе
// всего — поэтому туда идёт самый спокойный низ кадра, фактура.
//
//   node tla-warianty.mjs mix
const MIX = [
  ['osk100',   6],
  ['silesia',  6],
  ['akademia', 4],
  ['wojtek',   4],
  ['expert',   5],
  ['oskx',     5],
];

if (process.argv.includes('mix')) {
  const wyj = path.join(WYJ, 'seria-mix');
  await mkdir(wyj, { recursive: true });
  const nazwy = {
    silesia: '2-Silesia_3wrzesnia', akademia: '3-AkademiaJazdy_3400',
    wojtek: '4-WOJTEK_toauto', expert: '5-EXPERT_yaris', oskx: '6-OSKX_piec_wariantow',
  };
  const src = await readFile(ZRODLO, 'utf8');
  const src100 = await readFile(path.join(DIR, 'rolka-autoszkola.mjs'), 'utf8');

  for (const [szkola, nr] of MIX) {
    const w = WARIANTY.find((x) => x.nr === nr);
    if (szkola === 'osk100') {
      const tmp100 = path.join(DIR, 'tlo-mix-osk100.mjs');
      await writeFile(tmp100, podmienOsk100(src100, w), 'utf8');
      const cel = path.join(wyj, `1-OSK100_wrzesien.mp4`);
      console.log(`[mix] OSK 100% + tlo ${nr} (${w.nazwa}) —> ${cel}`);
      await exe(process.execPath, [tmp100, `--wyjscie=${cel}`], { cwd: DIR });
      await rm(tmp100, { force: true });
      continue;
    }
    const tmpMjs = path.join(DIR, `tlo-mix-${szkola}.mjs`);
    await writeFile(tmpMjs, podmien(src, w), 'utf8');
    const cel = path.join(wyj, `${nazwy[szkola]}.mp4`);
    console.log(`[mix] ${szkola} + tlo ${nr} (${w.nazwa}) —> ${cel}`);
    await exe(process.execPath, [tmpMjs, `--szkola=${szkola}`, `--wyjscie=${cel}`], { cwd: DIR });
    await rm(tmpMjs, { force: true });
  }
  console.log(`[mix] gotowe: ${wyj}`);
  process.exit(0);
}

// ── запуск ───────────────────────────────────────────────────────
await mkdir(WYJ, { recursive: true });
// Пересобрать только сводную сетку из уже снятых кадров.
if (process.argv.includes('siatka')) {
  await siatka([{ nr: 0, nazwa: 'OBECNE', png: path.join(WYJ, 'wariant-0-obecne.png') },
    ...WARIANTY.map((w) => ({ nr: w.nr, nazwa: w.nazwa, png: path.join(WYJ, `wariant-${w.nr}.png`) }))]);
  console.log('[siatka] ' + path.join(WYJ, 'porownanie.png'));
  process.exit(0);
}
const tylko = process.argv.slice(2).filter((x) => /^\d+$/.test(x)).map(Number);
const lista = tylko.length ? WARIANTY.filter((w) => tylko.includes(w.nr)) : WARIANTY;
const ob = await obecne();
const gotowe = [];
for (const w of lista) gotowe.push(await zrob(w));
if (!tylko.length) {
  await siatka([{ nr: 0, nazwa: 'OBECNE', png: ob }, ...gotowe]);
  console.log('[siatka] ' + path.join(WYJ, 'porownanie.png'));
}
