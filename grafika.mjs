// Рисованный рилс: сцена живёт во времени, а не набор картинок подряд.
//
// Всё, что здесь есть, снято замерами с четырёх роликов Захара
// (`Reklama szkolenia`, `Scenariusz 1/2/3`) — покадрово, по звуку, по речи:
//
//   · склейки НЕ главное. Два ролика из четырёх идут одним планом и не
//     выглядят статичными: живёт не монтаж, а сцена внутри кадра;
//   · объекты не копятся, а СМЕНЯЮТСЯ: пришёл, отработал, ушёл, вместо него
//     другой. Накопление до конца — главное, чем наша первая версия
//     отличалась от образца;
//   · кадр всё время едет: медленный наезд с дрейфом, на смысловых точках
//     подрыв. Именно это Захар назвал «иллюзией живой картинки»;
//   · объекты КРУПНЫЕ — треть ширины кадра, а не мелкие иконки;
//   · цвет подписи смысловой: жёлтый на выгоде, красный на потере;
//   · звуковое событие раз в секунду и чаще — на каждое движение;
//   · 50 кадров в секунду, а не 30: влёты заметно глаже.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const W = 1080, H = 1920, FPS = 50;
const OBIEKTY = path.join(DIR, 'grafika', 'obiekty');

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Картинки вшиваем в страницу как data:URI. Иначе Chromium тянет их с диска
// на КАЖДОМ кадре — на восьмистах кадрах это дольше самой отрисовки.
async function wczytajObiekty(nazwy) {
  const out = {};
  for (const n of nazwy) {
    const b = await readFile(path.join(OBIEKTY, `${n}.png`));
    out[n] = `data:image/png;base64,${b.toString('base64')}`;
  }
  return out;
}

/**
 * @param {object} plan
 *   scena:   [{ obiekt, x, y, skala, obrot, skad, start, koniec?, dokad? }]
 *   slowa:   [{ tekst, a, b }]           — подпись по словам, из синтеза
 *   wzor:    [{ tekst, kolor?, a, b, y }] — строки формулы, собираются под голос
 *   kamera:  [{ t, zoom, x, y }]         — ключевые точки движения кадра
 *   akcenty: { zolty: [...], czerwony: [...] }
 */
export function grafikaHtml(plan) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Каждый объект — тень на «полу» плюс сам предмет. Плоский `drop-shadow`
  // объёма не даёт: он висит вместе с предметом и едет с ним. Объём продаёт
  // тень, которая живёт отдельно.
  // Элемент сцены — либо предмет, либо ОКНО с живым видео. Второе появилось
  // после разбора «Scenariusz 1»: там в кадре три играющие карточки с людьми,
  // и именно они дают ролику жизнь, которой не даёт ни один нарисованный
  // предмет. Двигаются они по тем же правилам, что и предметы, — влетают,
  // плавают, поворачиваются, отбрасывают тень; разница только в начинке.
  const obiekty = plan.scena
    .map((o, i) => {
      const cien = `<div class="cien" data-i="${i}"></div>`;
      if (o.film) {
        const szer = o.skala || 380;
        const wys = o.wys || Math.round(szer * 1.55);
        return (
          `${cien}\n<div class="okno" data-i="${i}" style="width:${szer}px;height:${wys}px">` +
          `<video data-i="${i}" src="${o.film}" muted playsinline preload="auto"></video></div>`
        );
      }
      return `${cien}\n<img class="ob" data-i="${i}" src="${plan.obrazki[o.obiekt]}" style="width:${o.skala || 380}px">`;
    })
    .join('\n');

  // Счётчики. В образцах цифра НИКОГДА не появляется готовой: «20 205 zł»
  // накручивается на лету, ценник падает с 3000 до 150. Готовое число зритель
  // прочитывает и забывает, растущее — досматривает, потому что хочет узнать,
  // где оно остановится. Это самый дешёвый способ удержать взгляд, который
  // у них есть.
  const liczniki = (plan.liczniki || [])
    .map((l, i) => `<div class="licznik ${l.kolor || ''}" data-i="${i}"></div>`)
    .join('\n');

  // Ценник с полосой — снят с «Scenariusz 1»: бирка с числом, под ней шкала
  // с процентом, число падает, шкала уезжает, на посадке бирка вспыхивает.
  // Работает он не цифрой, а ПАДЕНИЕМ: глаз следит за уходящей полосой и
  // ждёт, где та остановится. Одна и та же цифра, показанная сразу, не
  // держит внимания ни секунды.
  const metki = (plan.metki || [])
    .map(
      (m, i) =>
        `<div class="metka" data-i="${i}" style="width:${m.szer || 380}px;height:${m.wys || 520}px">` +
        `<div class="dziurka"></div><div class="metka-cyfra"></div></div>\n` +
        `<div class="pasek" data-i="${i}" style="width:${m.szer || 380}px">` +
        `<div class="pasek-tor"></div><div class="pasek-wype"></div>` +
        `<div class="pasek-opis"></div></div>`
    )
    .join('\n');

  const wzory = (plan.wzor || [])
    .map((w, i) => `<div class="wiersz ${w.kolor || ''} ${w.maly ? 'maly' : ''}" data-i="${i}">${esc(w.tekst)}</div>`)
    .join('\n');

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; overflow:hidden; }
body { font-family:'Inter',sans-serif; background:transparent; }

/* Вся сцена внутри одного слоя — его и двигает «камера». Наезд применяется
   ко всему разом, поэтому картинка едет целиком, как в съёмке, а не каждый
   предмет отдельно. */
#kamera { position:absolute; inset:0; transform-origin:50% 46%;
  perspective:1500px; perspective-origin:50% 44%; will-change:transform; }

.ob { position:absolute; left:0; top:0; transform-origin:50% 50%;
  transform-style:preserve-3d; will-change:transform,opacity; }

/* Тень с плотным ядром, а не ровное пятно. Размытый по всей площади овал
   читается как грязь под предметом; контакт продаёт ТЁМНАЯ середина, от
   которой тень быстро светлеет к краю. Заодно меньше размываем: пятно с
   краем даёт опору, пятно без края — туман. */
.cien { position:absolute; left:0; top:0; border-radius:50%;
  background:radial-gradient(ellipse 50% 50% at 50% 50%,
    rgba(0,0,0,.62) 0%, rgba(0,0,0,.42) 38%, rgba(0,0,0,.16) 62%, transparent 78%);
  filter:blur(14px); will-change:transform,opacity; opacity:0; }

/* Формула. Ради неё всё и затевалось: объекты не украшают текст, а СЧИТАЮТ
   вместе с диктором — зритель складывает вместе с ним. */
.wiersz { position:absolute; left:60px; right:60px; text-align:center;
  font-family:'Archivo Black','Inter',sans-serif; font-size:118px; line-height:1.05;
  letter-spacing:-3px; text-transform:uppercase; color:#fff; opacity:0;
  -webkit-text-stroke:10px #0b0718; paint-order:stroke fill;
  text-shadow:0 12px 0 rgba(11,7,24,.5), 0 22px 48px rgba(0,0,0,.6); }
.wiersz.zolty { color:#ffd23f; }
.wiersz.czerwony { color:#ff4d4d; }
.wiersz.maly { font-size:76px; }

/* Подпись под голос. Белая по умолчанию, цвет — только по смыслу:
   жёлтый на выгоде, красный на потере. Так у Захара в образцах. */
.slowo { position:absolute; left:70px; right:70px; bottom:230px; text-align:center;
  font-family:'Archivo Black','Inter',sans-serif;
  font-size:88px; line-height:1.06; letter-spacing:-2px; text-transform:uppercase;
  color:#fff; opacity:0; transform-origin:50% 60%; text-wrap:balance; }
/* Плашка ОДНА на всю фразу, а не по плашке на слово: отдельные плашки
   расходятся щелями и на переносе съезжают ступенькой — строка выглядит
   рваной. Клонирование фона доводит его до края каждой строки,
   поэтому двухстрочная фраза остаётся цельной подписью.
   Обводки в 9 пикселей больше нет: она давала ровно тот вид дежурного
   тиктока, из-за которого подпись читалась как чужой шаблон. */
.slowo .plyta { display:inline; padding:10px 20px; border-radius:18px;
  background:rgba(11,7,24,.86); box-decoration-break:clone;
  -webkit-box-decoration-break:clone;
  box-shadow:0 14px 40px rgba(0,0,0,.35); }
/* Слово в фразе: приглушено, пока звучит не оно. Разница по яркости, а не
   по размеру — прыгающий кегль внутри строки заставляет соседние слова
   ползать по кадру, и подпись снова выглядит дёрганой. */
.slowo .s { color:#fff; opacity:.5; }
.slowo .s.teraz { opacity:1; }
.slowo .s.zolty.teraz { color:#ffd23f; }
.slowo .s.czerwony.teraz { color:#ff4d4d; }

/* Окно с живым видео. Скругление крупное — карточка, а не телевизор; рамка
   светлая, чтобы кадр не сливался со светлым полотном фона. */
.okno { position:absolute; left:0; top:0; overflow:hidden; border-radius:44px;
  transform-origin:50% 50%; transform-style:preserve-3d; background:#000;
  box-shadow:0 0 0 6px rgba(255,255,255,.92), 0 26px 60px rgba(0,0,0,.28);
  will-change:transform,opacity; }
.okno video { width:100%; height:100%; object-fit:cover; display:block; }

/* Счётчик набран той же гарнитурой, что и формула, но чуть крупнее: пока
   цифра крутится, она и есть главное в кадре. */
.licznik { position:absolute; left:40px; right:40px; text-align:center;
  font-family:'Archivo Black','Inter',sans-serif; font-size:136px; line-height:1;
  letter-spacing:-4px; color:#fff; opacity:0;
  -webkit-text-stroke:10px #0b0718; paint-order:stroke fill;
  font-variant-numeric:tabular-nums;
  text-shadow:0 12px 0 rgba(11,7,24,.5), 0 22px 48px rgba(0,0,0,.6); }
.licznik.zolty { color:#ffd23f; }
.licznik.czerwony { color:#ff4d4d; }
.licznik .jedn { font-size:0.46em; letter-spacing:-1px; margin-left:.12em; }

/* Ценник. Форма бирки — скругление плюс дырка под шнурок сверху: без неё
   это просто плашка, а с ней предмет, который держат в руках. */
.metka { position:absolute; left:0; top:0; border-radius:56px; opacity:0;
  transform-origin:50% 12%; transform-style:preserve-3d;
  display:flex; align-items:center; justify-content:center;
  will-change:transform,opacity,filter; }
.metka .dziurka { position:absolute; top:46px; left:50%; width:44px; height:44px;
  margin-left:-22px; border-radius:50%; background:rgba(0,0,0,.30);
  box-shadow:inset 0 4px 8px rgba(0,0,0,.45); }
.metka-cyfra { font-family:'Archivo Black','Inter',sans-serif; font-size:112px;
  line-height:1; letter-spacing:-4px; color:#fff; font-variant-numeric:tabular-nums;
  text-shadow:0 8px 22px rgba(0,0,0,.35); margin-top:40px; }
.metka-cyfra .jedn { font-size:0.44em; letter-spacing:-1px; margin-left:.10em; }

/* Шкала под биркой. Заливка уезжает вправо-влево вместе с числом — она и
   есть то, за чем следит глаз. */
.pasek { position:absolute; left:0; top:0; height:74px; opacity:0;
  display:flex; align-items:center; justify-content:center; will-change:transform,opacity; }
/* Дорожка под заливкой. Без неё шкала на нуле превращается в белую точку и
   перестаёт читаться как шкала — а именно на нуле она и должна сказать
   «здесь ничего не осталось». Пустая дорожка это говорит, точка — нет. */
.pasek-tor { position:absolute; left:0; right:0; top:22px; height:30px; border-radius:15px;
  background:rgba(0,0,0,.16); box-shadow:inset 0 2px 5px rgba(0,0,0,.18); }
.pasek-wype { position:absolute; left:0; top:22px; height:30px; border-radius:15px;
  background:#fff; box-shadow:0 6px 18px rgba(0,0,0,.28); }
.pasek-opis { position:relative; font-family:'Archivo Black','Inter',sans-serif;
  font-size:54px; letter-spacing:-2px; color:#fff; font-variant-numeric:tabular-nums;
  -webkit-text-stroke:8px #0b0718; paint-order:stroke fill; }

/* Затемнение под подписью. Оно рисовалось, когда фон был тёмным, и там
   честно отделяло текст от картинки. На светлом полотне тот же приём
   размазывает по нижней трети кадра серую грязь — Захар это увидел раньше,
   чем я, и был прав.
   Светлому фону нужно ОСВЕТЛЕНИЕ, а не затемнение: подпись у нас белая с
   тёмной обводкой, её держит обводка, а полотну надо лишь слегка успокоить
   рисунок под текстом. Держим слабым — заметная плашка выдаёт шаблон. */
.scrim { position:absolute; left:0; right:0; bottom:0; height:560px; pointer-events:none;
  background:linear-gradient(to top, rgba(255,255,255,.38) 0%, rgba(255,255,255,.16) 52%, transparent 100%); }
</style></head><body>
<div id="kamera">
${obiekty}
${wzory}
${liczniki}
${metki}
</div>
<div class="scrim"></div>
<div class="slowo"></div>
<script>
const S = ${JSON.stringify(plan.scena)};
const SLOWA = ${JSON.stringify(plan.slowa || [])};
// ── подпись группами, а не по одному слову ────────────────────────
// По слову на кадр экран занимали служебные части речи: целую секунду во
// весь рост стояло «NA» или «TEN». Читать там нечего, глаз дёргается, а
// мысль собирается только к концу фразы — уносить из кадра нечего.
//
// Собираем 2-3 слова в группу по трём правилам: пауза длиннее 0,34 с
// означает смену мысли и рвёт группу; строка не длиннее 20 знаков, иначе
// шрифт мельчает; служебное слово не остаётся последним — оно тянет к себе
// следующее, потому что «na" в конце строки висит так же сиротливо, как и
// в одиночку. Активное слово внутри группы подсвечивается — фраза стоит,
// а голос по ней идёт.
const GRUPY = (() => {
  const POMOCNICZE = new Set(['na','w','we','i','a','o','u','z','ze','do','po','od','za','to','ten','ta','te','ci','że','sie','się','nie','ale','czy','jak','bo','by','juz','już','mi','go','jej','ich','im','co','kto','tym','tu','tam','przez','dla','bez','pod','nad','przy','ale','oraz','lub','albo']);
  const male = (s) => String(s).toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '');
  const czysty = (s) => String(s).replace(/[.,!?…]+$/, '');
  const out = [];
  let g = null;
  for (let i = 0; i < SLOWA.length; i++) {
    const s = SLOWA[i];
    const nast = SLOWA[i + 1];
    if (!g) g = { a: s.a, b: s.b, slowa: [] };
    g.slowa.push({ tekst: czysty(s.tekst), male: male(s.tekst), a: s.a, b: s.b });
    g.b = s.b;
    const dlugosc = g.slowa.reduce((n, x) => n + x.tekst.length + 1, -1);
    const przerwa = nast ? nast.a - s.b : 9;
    const ogon = POMOCNICZE.has(male(s.tekst));
    const pelna = g.slowa.length >= 3 || dlugosc >= 20;
    if (!nast || (!ogon && (pelna || przerwa > 0.34))) { out.push(g); g = null; }
  }
  if (g) out.push(g);
  return out;
})();
const WZOR = ${JSON.stringify(plan.wzor || [])};
const KAM = ${JSON.stringify(plan.kamera || [])};
const AKC = ${JSON.stringify(plan.akcenty || { zolty: [], czerwony: [] })};
const W = ${W}, H = ${H};

const LICZ = ${JSON.stringify(plan.liczniki || [])};
const METKI = ${JSON.stringify(plan.metki || [])};

const kam = document.getElementById('kamera');
// Предметы и окна с видео лежат в одном списке и в том же порядке, что и в
// плане: у окна та же анимация, что у предмета, разной должна быть только
// начинка. Разложить их по двум спискам значило бы писать движение дважды.
const obs = [...document.querySelectorAll('.ob, .okno')];
const cienie = [...document.querySelectorAll('.cien')];
const wiersze = [...document.querySelectorAll('.wiersz')];
const licz = [...document.querySelectorAll('.licznik')];
const metki = [...document.querySelectorAll('.metka')];
const paski = [...document.querySelectorAll('.pasek')];
const metkiCyfry = [...document.querySelectorAll('.metka-cyfra')];
const elSlowo = document.querySelector('.slowo');

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const backOut = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const KIERUNKI = { lewo: [-1, .25], prawo: [1, .25], gora: [.2, -1], dol: [-.2, 1] };

window.__fit = () => {};
window.setT = (t) => {
  // Перемотка живого видео — единственное, чего нельзя сделать мгновенно.
  // Снимок нужно делать ПОСЛЕ того, как кадр доехал, иначе в ролик попадёт
  // предыдущий: карточка будет дёргаться назад через раз. Поэтому setT
  // отдаёт обещание, а съёмка его дожидается.
  const czekaj = [];
  // ── камера ───────────────────────────────────────────────────────
  // Кадр едет всё время: медленный наезд, дрейф, на смысловых точках
  // подрыв. Неподвижная рамка выдаёт рисунок, движущаяся читается как съёмка.
  let zoom = 1, kx = 0, ky = 0;
  if (KAM.length) {
    let a = KAM[0], b = KAM[KAM.length - 1];
    for (let i = 0; i < KAM.length - 1; i++) {
      if (t >= KAM[i].t && t <= KAM[i + 1].t) { a = KAM[i]; b = KAM[i + 1]; break; }
    }
    const p = b.t > a.t ? easeInOut(clamp01((t - a.t) / (b.t - a.t))) : 1;
    zoom = (a.zoom ?? 1) + ((b.zoom ?? 1) - (a.zoom ?? 1)) * p;
    kx = (a.x ?? 0) + ((b.x ?? 0) - (a.x ?? 0)) * p;
    ky = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * p;
  }
  // Дыхание поверх ключей: даже на «стоянке» кадр не замирает.
  zoom += Math.sin(t * 0.42) * 0.006;
  kx += Math.sin(t * 0.31) * 5;
  ky += Math.cos(t * 0.27) * 4;
  kam.style.transform = 'translate(' + kx.toFixed(1) + 'px,' + ky.toFixed(1) + 'px) scale(' + zoom.toFixed(4) + ')';

  // ── объекты ──────────────────────────────────────────────────────
  obs.forEach((el, i) => {
    const o = S[i];
    const cien = cienie[i];
    const wlot = o.wlot ?? 0.40;
    const rozm = o.skala || 380;
    const koniec = o.koniec ?? 1e9;

    if (t < o.start - 0.02 || t > koniec + 0.5) {
      el.style.opacity = 0; if (cien) cien.style.opacity = 0; return;
    }

    // Высота у окна своя: карточка вертикальная, а не квадратная, и центр
    // по вертикали считается по ней, иначе окно висит выше своей тени.
    const wysok = o.film ? (o.wys || Math.round(rozm * 1.55)) : rozm;

    const p = clamp01((t - o.start) / wlot);
    const e = backOut(p);
    const skad = KIERUNKI[o.skad || 'lewo'];
    let dx = (1 - e) * skad[0] * W * 0.9;
    let dy = (1 - e) * skad[1] * H * 0.55;
    let widocz = 1, skala = 1;

    // Уход. Объект не гаснет на месте — он уезжает и уменьшается, иначе
    // кадр «мигает» и смена читается как ошибка сборки.
    if (t > koniec) {
      const q = clamp01((t - koniec) / 0.42);
      const dokad = KIERUNKI[o.dokad || 'gora'];
      dx += q * q * dokad[0] * W * 0.7;
      dy += q * q * dokad[1] * H * 0.45;
      widocz = 1 - q;
      skala = 1 - 0.25 * q;
    }

    const v = Math.abs(backOut(clamp01(p + 0.03)) - e) * 30;
    const blur = Math.min(16, v * 26) + (t > koniec ? 8 * clamp01((t - koniec) / 0.42) : 0);

    // Жизнь после посадки: дрейф, покачивание, поворот по двум осям.
    // У каждого своя фаза, иначе сцена пульсирует в такт.
    const faza = i * 1.9;
    const okres = 3.0 + (i % 3) * 0.7;
    const zyje = clamp01((t - o.start - wlot) / 0.5) * (t > koniec ? 0 : 1);
    const plyw = Math.sin((t / okres) * Math.PI * 2 + faza) * 16 * zyje;
    const kolysanie = Math.sin((t / (okres * 1.4)) * Math.PI * 2 + faza) * 2.6 * zyje;
    const ry = Math.sin((t / (okres * 1.15)) * Math.PI * 2 + faza) * 10 * zyje;
    const rx = Math.cos((t / (okres * 1.6)) * Math.PI * 2 + faza) * 5 * zyje;

    const obrot = (o.obrot || 0) + (1 - e) * (o.skad === 'prawo' ? 26 : -26) + kolysanie;
    el.style.opacity = widocz;
    el.style.filter = 'blur(' + blur.toFixed(1) + 'px)';
    // Живое видео перематываем в такт ролику: карточка играет с момента
    // своего появления, а не с нуля файла, и зациклена по своей длине.
    if (o.film) {
      const wid = el.querySelector('video');
      if (wid && wid.readyState >= 1 && wid.duration) {
        const cel = (o.odKlipu || 0) + Math.max(0, t - o.start);
        const doc = cel % wid.duration;
        if (Math.abs(wid.currentTime - doc) > 0.012) {
          czekaj.push(new Promise((ok) => {
            wid.addEventListener('seeked', ok, { once: true });
            wid.currentTime = doc;
            // Страховка: на конце файла событие может не прийти вовсе, и
            // тогда съёмка встала бы навсегда на одном кадре.
            setTimeout(ok, 120);
          }));
        }
      }
    }

    el.style.transform =
      'translate3d(' + (o.x + dx - rozm / 2).toFixed(1) + 'px,' +
      (o.y + dy - wysok / 2 + plyw).toFixed(1) + 'px,0)' +
      ' scale(' + skala.toFixed(3) + ')' +
      ' rotateY(' + ry.toFixed(1) + 'deg) rotateX(' + rx.toFixed(1) + 'deg)' +
      ' rotate(' + obrot.toFixed(1) + 'deg)';

    if (cien) {
      const wys = (plyw + 16) / 32;
      const szer = rozm * (0.60 + 0.16 * wys) * skala;
      cien.style.opacity = (0.5 - 0.2 * wys) * e * widocz;
      cien.style.width = szer.toFixed(1) + 'px';
      cien.style.height = (szer * 0.28).toFixed(1) + 'px';
      cien.style.transform =
        'translate(' + (o.x + dx - szer / 2).toFixed(1) + 'px,' +
        (o.y + dy + wysok * 0.42).toFixed(1) + 'px)';
    }
  });

  // ── формула ──────────────────────────────────────────────────────
  wiersze.forEach((el, i) => {
    const w = WZOR[i];
    el.style.top = w.y + 'px';
    if (t < w.a - 0.02 || t > (w.b ?? 1e9)) { el.style.opacity = 0; return; }
    const p = clamp01((t - w.a) / 0.16);
    const e = backOut(p);
    const gasnie = w.b ? clamp01((w.b - t) / 0.3) : 1;
    el.style.opacity = Math.min(1, p * 2.4) * gasnie;
    el.style.transform = 'scale(' + (0.7 + 0.3 * e).toFixed(3) + ')';
  });

  // ── счётчики ─────────────────────────────────────────────────────
  // Цифра не появляется — она НАКРУЧИВАЕТСЯ. Замедление к концу обязательно:
  // равномерный счёт читается как таблица, а тормозящий — как результат, к
  // которому пришли. На разгоне добавляем смаз по вертикали: так барабан и
  // выглядит, когда цифры не успевают прочитаться.
  licz.forEach((el, i) => {
    const l = LICZ[i];
    if (t < l.a - 0.02 || t > (l.b ?? 1e9)) { el.style.opacity = 0; return; }
    el.style.top = l.y + 'px';

    const kres = l.kres ?? Math.min(l.b ?? 1e9, l.a + (l.czas ?? 1.1));
    const p = clamp01((t - l.a) / Math.max(0.1, kres - l.a));
    const e = 1 - Math.pow(1 - p, 3);
    const wart = Math.round((l.od ?? 0) + ((l.do ?? 0) - (l.od ?? 0)) * e);

    // Разделитель разрядов — узкий пробел: «20 205» читается с одного взгляда,
    // «20205» приходится разбирать.
    const napis = String(wart).replace(/\\B(?=(\\d{3})+(?!\\d))/g, String.fromCharCode(8201));
    el.innerHTML = napis + (l.jednostka ? '<span class="jedn">' + l.jednostka + '</span>' : '');

    const predkosc = Math.abs(3 * Math.pow(1 - p, 2)) * (1 - p);
    const gasnie = l.b ? clamp01((l.b - t) / 0.3) : 1;
    el.style.opacity = Math.min(1, (t - l.a) / 0.1) * gasnie;
    // Досадка в конце: цифра встала — и коротко «ударила» в размер.
    const dosiad = p >= 1 ? 1 + 0.06 * Math.max(0, 1 - (t - kres) / 0.22) : 1;
    el.style.filter = 'blur(' + (predkosc * 7).toFixed(2) + 'px)';
    el.style.transform = 'scale(' + dosiad.toFixed(3) + ')';
  });

  // ── ценники ──────────────────────────────────────────────────────
  // Бирка влетает целой, а потом ПАДАЕТ в цифре: число уходит вниз, шкала
  // уезжает, цвет из спокойного уходит в горячий, и на посадке бирка коротко
  // вспыхивает. Порядок важен: сначала показываем, сколько есть, и только
  // потом отнимаем — иначе отнимать нечего и падение не читается.
  metki.forEach((el, i) => {
    const m = METKI[i];
    const pas = paski[i];
    const cyf = metkiCyfry[i];
    const szer = m.szer || 380;
    const wys = m.wys || 520;

    if (t < m.a - 0.02 || t > (m.b ?? 1e9)) {
      el.style.opacity = 0;
      if (pas) pas.style.opacity = 0;
      return;
    }

    // Влёт — как у предметов, чтобы бирка не выпадала из общего движения.
    const wlot = m.wlot ?? 0.42;
    const pw = clamp01((t - m.a) / wlot);
    const ew = backOut(pw);
    const dy = (1 - ew) * H * 0.5;

    // Падение цифры начинается позже влёта: бирка должна успеть встать.
    const spadA = m.spadA ?? m.a + wlot + 0.25;
    const spadB = m.spadB ?? spadA + (m.czas ?? 0.95);
    const ps = clamp01((t - spadA) / Math.max(0.1, spadB - spadA));
    const es = 1 - Math.pow(1 - ps, 3);
    const wart = Math.round((m.od ?? 0) + ((m.do ?? 0) - (m.od ?? 0)) * es);
    const proc = (m.odProc ?? 100) + ((m.doProc ?? 0) - (m.odProc ?? 100)) * es;

    cyf.innerHTML = String(wart) + (m.jednostka ? '<span class="jedn">' + m.jednostka + '</span>' : '');

    // Цвет ведём от спокойного к горячему по ходу падения: к нулю бирка
    // становится тем самым золотым, что в образце.
    const h1 = m.barwaOd ?? 158, h2 = m.barwaDo ?? 32;
    const h = h1 + (h2 - h1) * es;
    el.style.background =
      'linear-gradient(160deg, hsl(' + h.toFixed(0) + ' 62% 58%), hsl(' + (h - 12).toFixed(0) + ' 66% 44%))';

    // Вспышка ровно в момент остановки и сразу гаснет: свечение, которое
    // держится, читается как ошибка, а не как удар.
    const blysk = ps >= 1 ? Math.max(0, 1 - (t - spadB) / 0.45) : 0;
    el.style.boxShadow =
      '0 26px 60px rgba(0,0,0,.30)' +
      (blysk > 0
        ? ', 0 0 ' + (90 * blysk).toFixed(0) + 'px ' + (26 * blysk).toFixed(0) +
          'px hsl(' + h2 + ' 90% 60% / ' + (0.75 * blysk).toFixed(2) + ')'
        : '');

    const gasnie = m.b ? clamp01((m.b - t) / 0.3) : 1;
    const skok = 1 + 0.05 * blysk;
    el.style.opacity = Math.min(1, pw * 2.2) * gasnie;
    el.style.transform =
      'translate3d(' + (m.x - szer / 2).toFixed(1) + 'px,' + (m.y - wys / 2 + dy).toFixed(1) + 'px,0)' +
      ' rotate(' + ((1 - ew) * -9 + Math.sin(t * 1.5) * 1.4).toFixed(2) + 'deg)' +
      ' scale(' + skok.toFixed(3) + ')';

    if (pas) {
      pas.style.opacity = el.style.opacity;
      pas.style.transform =
        'translate3d(' + (m.x - szer / 2).toFixed(1) + 'px,' +
        (m.y + wys / 2 + 34 + dy).toFixed(1) + 'px,0)';
      pas.querySelector('.pasek-wype').style.width = ((szer * proc) / 100).toFixed(1) + 'px';
      // Подпись словом, если она задана. Голый процент под биркой ничего не
      // объясняет: на последнем кадре первого ролика стояло «0 H» и «0%» —
      // зритель видел два нуля и не мог понять, что именно обнулилось.
      // Слово «TWOJE GODZINY» отвечает на это за один взгляд.
      const opis = pas.querySelector('.pasek-opis');
      opis.textContent = m.opis || Math.round(proc) + '%';
      // Слово шире процента и в штатных 54 px вылезает за шкалу. Считаем
      // кегль под длину: «POSTÓW W MIESIĄCU» это семнадцать знаков, и в
      // четырёхсот пикселях они помещаются только меньшим шрифтом.
      // Ровно в одну строку. Перенос делит подпись пополам и та начинает
      // спорить с числом на самой бирке — вместо объяснения выходит второй
      // блок текста. Кегль считаем под длину, шкалу подпись может перерасти.
      opis.style.whiteSpace = 'nowrap';
      opis.style.fontSize = m.opis
        ? Math.min(46, Math.floor((szer * 1.45) / m.opis.length)) + 'px'
        : '';
      opis.style.webkitTextStroke = m.opis ? '6px #0b0718' : '';
    }
  });

  // ── подпись ──────────────────────────────────────────────────────
  // Пока на экране формула, подпись молчит. Два текстовых блока кадр не
  // держат — читается ни один, а в паре кадров они ещё и наложились друг
  // на друга: «30 DNI» под словом «TRZYDZIEŚCI».
  // Счётчик молчит подпись так же, как формула: пока крутится цифра, читают
  // её, а второй текст в кадре только мешает — и однажды уже наложился.
  // Счётчик в хуке — исключение: там подпись нужна обеим сторонам. Цифра
  // отвечает на вопрос, слово его задаёт, и гасить одно ради другого нельзя.
  // Разводим их по кадру, а не по времени.
  const wzorNaEkranie =
    WZOR.some((x) => t >= x.a - 0.05 && t <= (x.b ?? 1e9)) ||
    LICZ.some((x) => !x.zPodpisem && t >= x.a - 0.05 && t <= (x.b ?? 1e9));
  const g = wzorNaEkranie ? null : GRUPY.find((x) => t >= x.a - 0.06 && t < x.b + 0.2);
  if (g) {
    // Строку перерисовываем только при смене группы. Трогать innerHTML на
    // каждом из тысячи кадров — это лишняя раскладка текста, а на глаз
    // выглядит как мигание строки под подсветкой.
    if (elSlowo.dataset.g !== String(g.a)) {
      elSlowo.dataset.g = String(g.a);
      elSlowo.innerHTML = '<span class="plyta">' + g.slowa
        .map((s) => {
          const kl = AKC.zolty.includes(s.male) ? ' zolty'
            : AKC.czerwony.includes(s.male) ? ' czerwony' : '';
          return '<span class="s' + kl + '" data-a="' + s.a + '" data-b="' + s.b + '">' + s.tekst + '</span>';
        })
        .join(' ') + '</span>';
    }
    // Фраза стоит целиком, а голос идёт по ней: слово под голосом полной
    // яркости, остальные приглушены. Видно и мысль разом, и место, где мы
    // сейчас находимся.
    for (const el of elSlowo.querySelectorAll('.s')) {
      const teraz = t >= +el.dataset.a - 0.04 && t < +el.dataset.b + 0.06;
      el.classList.toggle('teraz', teraz);
    }
    const p = clamp01((t - (g.a - 0.06)) / 0.16);
    const e = backOut(p);
    elSlowo.style.opacity = Math.min(1, p * 2.2);
    elSlowo.style.transform =
      'scale(' + (0.88 + 0.12 * e).toFixed(3) + ') rotate(' + ((1 - e) * -1.8).toFixed(2) + 'deg)';
  } else {
    elSlowo.style.opacity = 0;
    elSlowo.dataset.g = '';
  }

  return czekaj.length ? Promise.all(czekaj) : null;
};
</script></body></html>`;
}

// Снимаем страницу покадрово: время задаём сами через setT, а не ждём
// реального проигрывания — иначе кадры поедут на любой заминке браузера.
export async function renderujKlatki(html, sekundy, outDir) {
  await mkdir(outDir, { recursive: true });
  const plikHtml = path.join(outDir, 'scena.html');
  await writeFile(plikHtml, html, 'utf8');

  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + plikHtml.replace(/\\/g, '/'));

  // Живое видео перед съёмкой обязано быть готово к перемотке. Без этой
  // паузы первые карточки выходят чёрными: страница уже нарисована, а дорожка
  // ещё грузится, и `currentTime` уходит в пустоту.
  await page.evaluate(async () => {
    const filmy = [...document.querySelectorAll('video')];
    await Promise.all(
      filmy.map(
        (v) =>
          new Promise((ok) => {
            if (v.readyState >= 2) return ok();
            v.addEventListener('loadeddata', ok, { once: true });
            v.addEventListener('error', ok, { once: true });
            setTimeout(ok, 8000);
          })
      )
    );
  });
  await page.waitForTimeout(600);

  const klatek = Math.ceil(sekundy * FPS);
  for (let i = 0; i < klatek; i++) {
    await page.evaluate((t) => window.setT(t), i / FPS);
    await page.screenshot({
      path: path.join(outDir, `f${String(i).padStart(5, '0')}.png`),
      omitBackground: true,
    });
  }
  await browser.close();
  return klatek;
}

export { W, H, FPS, wczytajObiekty, ffmpeg };
