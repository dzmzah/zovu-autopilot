// Проба анимации интерфейса — для заказа Useme «Video z animacją interfejsu».
//
// Żaneta спросила про работы на макетах Figma. Таких у нас нет, и я сказал ей
// это прямо. Вместо ссылки на чужое делаем то, что работало каждый раз: пробу
// на своём макете, до договора и без обязательств с её стороны.
//
// Способ тот же, что в роликах автошкол: интерфейс собран в HTML/CSS,
// анимируется временем, снимается покадрово браузером и склеивается ffmpeg.
// Отсюда две вещи, которые в After Effects стоят дорого: текст остаётся
// векторно резким в любом разрешении, а правка «сдвинь панель на 20 px» —
// это одна цифра, а не пересборка композиции.
//
//   node rolka-interfejs.mjs                    — полный ролик
//   node rolka-interfejs.mjs --podglad=1.2,4.5  — только кадры
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const exe = promisify(execFile);
const DIR = import.meta.dirname;
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};

const W = 1080, H = 1920, FPS = 50, SEK = 10.0;
const WYJSCIE = arg('wyjscie', path.join(DIR, 'out', 'proba-interfejs.mp4'));

// Хореография. Одни и те же числа управляют всеми сценами — при правке
// достаточно сдвинуть одну, остальное подстроится.
const T = {
  start: 0.10,   // телефон въезжает
  ekran1: 0.60,  // логин
  tap1: 2.00,    // палец нажимает «Zaloguj»
  ekran2: 2.40,  // список заказов
  karty: 2.70,   // карточки прилетают одна за другой
  licznik: 4.20, // счётчик суммы
  tap2: 5.20,    // тап по карточке
  ekran3: 5.60,  // деталь заказа
  wykres: 6.00,  // график рисуется
  koniec: 8.20,  // отъезд и подпись
};

const KOLOR = {
  tlo1: '#0d0820', tlo2: '#1a1040',
  akcent: '#7c3aed', jasny: '#a78bfa', zolty: '#ffd23f',
  ekran: '#ffffff', tekst: '#151226', szary: '#8b8aa3', linia: '#ecebf5',
};

const html = () => `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{background:${KOLOR.tlo1};overflow:hidden;font-family:'Inter',sans-serif;
  -webkit-font-smoothing:antialiased}

#tlo{position:absolute;inset:0;
  background:linear-gradient(170deg,${KOLOR.tlo2} 0%,${KOLOR.tlo1} 60%,#08051a 100%)}
#lampa{position:absolute;left:-15%;top:-10%;width:130%;height:80%;
  background:radial-gradient(ellipse 45% 40% at 50% 45%, rgba(124,58,237,.5), rgba(124,58,237,0) 70%)}
/* Сетка макета — намёк на Figmу, тот язык, на котором говорит заказчик. */
#siatka{position:absolute;inset:0;opacity:.10;
  background-image:linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px);
  background-size:60px 60px}

/* ── телефон ──────────────────────────────────────────────────── */
#fon{position:absolute;left:50%;top:196px;width:680px;height:1420px;
  margin-left:-340px;border-radius:64px;background:#0a0718;
  box-shadow:0 0 0 12px #1c1533, 0 60px 120px rgba(0,0,0,.6),
    inset 0 1px 0 rgba(255,255,255,.10);opacity:0}
#szkielko{position:absolute;left:14px;top:14px;right:14px;bottom:14px;
  border-radius:52px;overflow:hidden;background:${KOLOR.ekran}}
#wysepka{position:absolute;left:50%;top:34px;margin-left:-62px;width:124px;height:34px;
  border-radius:20px;background:#0a0718;z-index:9}

.ekran{position:absolute;inset:0;background:${KOLOR.ekran};opacity:0;
  display:flex;flex-direction:column;padding:96px 40px 40px}
.tytul{font-size:44px;font-weight:800;color:${KOLOR.tekst};letter-spacing:-1px}
.pod{margin-top:10px;font-size:26px;color:${KOLOR.szary};font-weight:500}

/* экран 1: вход */
.pole{margin-top:34px;height:96px;border-radius:20px;background:#f6f5fb;
  border:2px solid ${KOLOR.linia};display:flex;align-items:center;padding:0 28px;
  font-size:26px;color:${KOLOR.szary};font-weight:500}
.przycisk{margin-top:34px;height:104px;border-radius:22px;
  background:linear-gradient(135deg,${KOLOR.akcent},#9d5bff);
  display:flex;align-items:center;justify-content:center;
  font-size:30px;font-weight:700;color:#fff;
  box-shadow:0 18px 40px rgba(124,58,237,.35)}
.drobne{margin-top:auto;text-align:center;font-size:22px;color:${KOLOR.szary}}

/* экран 2: список */
.gora{display:flex;align-items:center;justify-content:space-between}
.karta{margin-top:22px;border-radius:24px;background:#fff;padding:28px 30px;
  border:2px solid ${KOLOR.linia};opacity:0;
  box-shadow:0 14px 34px rgba(21,18,38,.07)}
.karta .row{display:flex;align-items:center;justify-content:space-between}
.karta .nazwa{font-size:30px;font-weight:700;color:${KOLOR.tekst}}
.karta .kwota{font-size:32px;font-weight:800;color:${KOLOR.tekst};white-space:nowrap}
.karta .stan{margin-top:12px;display:inline-block;padding:8px 18px;border-radius:999px;
  font-size:20px;font-weight:700;letter-spacing:.5px}
.st-ok{background:#e8f8ef;color:#137a45}
.st-czeka{background:#fff5e0;color:#8a6100}
.suma{margin-top:auto;border-radius:24px;padding:30px;
  background:linear-gradient(135deg,#f4f1ff,#ece6ff);border:2px solid #ded4ff}
.suma .etyk{font-size:22px;font-weight:700;color:${KOLOR.akcent};letter-spacing:2px}
.suma .licz{margin-top:8px;font-size:60px;font-weight:900;color:${KOLOR.tekst};letter-spacing:-2px}

/* экран 3: деталь + график */
#wyk{margin-top:30px;height:320px;border-radius:24px;border:2px solid ${KOLOR.linia};
  position:relative;overflow:hidden;background:#fcfbff}
#wyk svg{position:absolute;inset:0;width:100%;height:100%}
.legenda{margin-top:22px;display:flex;gap:14px}
.chip{padding:14px 22px;border-radius:14px;background:#f4f1ff;
  font-size:22px;font-weight:700;color:${KOLOR.akcent}}

/* палец */
#palec{position:absolute;width:96px;height:96px;border-radius:50%;
  background:radial-gradient(circle at 35% 35%, rgba(255,255,255,.9), rgba(255,255,255,.25));
  border:3px solid rgba(255,255,255,.8);opacity:0;z-index:20;
  box-shadow:0 10px 30px rgba(0,0,0,.35)}

/* подпись под телефоном */
#stopka{position:absolute;left:70px;right:70px;top:1700px;text-align:center;opacity:0}
#stopka .duze{font-size:56px;font-weight:900;color:#fff;letter-spacing:-1.5px}
#stopka .male{margin-top:14px;font-size:28px;font-weight:600;color:${KOLOR.jasny}}
</style></head><body>
<div id="tlo"></div><div id="lampa"></div><div id="siatka"></div>

<div id="fon">
  <div id="wysepka"></div>
  <div id="szkielko">

    <div class="ekran" id="e1">
      <div class="tytul">Zaloguj się</div>
      <div class="pod">Panel zamówień</div>
      <div class="pole">adres@firma.pl</div>
      <div class="pole">••••••••••</div>
      <div class="przycisk" id="btn1">Zaloguj</div>
      <div class="drobne">Nie pamiętasz hasła?</div>
    </div>

    <div class="ekran" id="e2">
      <div class="gora">
        <div>
          <div class="tytul">Zamówienia</div>
          <div class="pod">sierpień 2026</div>
        </div>
      </div>
      <div class="karta" data-i="0"><div class="row">
        <div class="nazwa">Nowak sp. z o.o.</div><div class="kwota">2 340 zł</div></div>
        <div class="stan st-ok">OPŁACONE</div></div>
      <div class="karta" data-i="1"><div class="row">
        <div class="nazwa">Studio Kwadrat</div><div class="kwota">1 180 zł</div></div>
        <div class="stan st-czeka">W REALIZACJI</div></div>
      <div class="karta" data-i="2"><div class="row">
        <div class="nazwa">Kawiarnia Cztery</div><div class="kwota">860 zł</div></div>
        <div class="stan st-ok">OPŁACONE</div></div>
      <div class="suma">
        <div class="etyk">RAZEM W TYM MIESIĄCU</div>
        <div class="licz"><span id="licznik">0</span> zł</div>
      </div>
    </div>

    <div class="ekran" id="e3">
      <div class="tytul">Studio Kwadrat</div>
      <div class="pod">zamówienie #2481</div>
      <div id="wyk">
        <svg viewBox="0 0 520 320" preserveAspectRatio="none">
          <path id="linia" d="M20,270 L110,232 L200,244 L290,168 L380,140 L470,64"
            fill="none" stroke="${KOLOR.akcent}" stroke-width="6"
            stroke-linecap="round" stroke-linejoin="round"/>
          <circle id="kropka" cx="470" cy="64" r="11" fill="${KOLOR.zolty}" opacity="0"/>
        </svg>
      </div>
      <div class="legenda">
        <div class="chip">+38% konwersji</div>
        <div class="chip">7 dni</div>
      </div>
      <div class="przycisk" style="margin-top:auto">Pobierz raport</div>
    </div>

  </div>
</div>

<div id="palec"></div>

<div id="stopka">
  <div class="duze">Interfejs składany kodem</div>
  <div class="male">ostry w każdej rozdzielczości · poprawka to jedna liczba</div>
</div>

<script>
const T = ${JSON.stringify(T)};
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeBack = (p) => { const c = 1.70158 + 1; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
// Дыхание после посадки: кадр не должен замирать, когда всё прилетело.
const fala = (t, faza = 0, tempo = 1) => Math.sin((t + faza) * tempo * Math.PI * 2 / 3.6);

const karty = [].slice.call(document.querySelectorAll('#e2 .karta'));
const linia = $('linia');
const dl = linia.getTotalLength();
linia.style.strokeDasharray = dl;

window.__fit = () => {};

window.setT = (t) => {
  // ── телефон ──────────────────────────────────────────────────
  const pf = easeBack(clamp01((t - T.start) / 0.80));
  const fon = $('fon');
  fon.style.opacity = easeOut(clamp01((t - T.start) / 0.45));
  const odjazd = easeOut(clamp01((t - T.koniec) / 0.9));
  fon.style.transform =
    'perspective(2200px) translate3d(0,' + ((1 - pf) * 90 + fala(t, 0.4, .9) * 6 - odjazd * 60).toFixed(1) + 'px,0)' +
    ' rotateX(' + ((1 - pf) * -14 + fala(t, 1.2, .8) * 1.1).toFixed(2) + 'deg)' +
    ' rotateY(' + (fala(t, 2.0, .7) * 1.6 - odjazd * 4).toFixed(2) + 'deg)' +
    ' scale(' + (1 - (1 - pf) * .08 - odjazd * .06).toFixed(3) + ')';

  // ── экран 1: вход ────────────────────────────────────────────
  const w1 = clamp01((t - T.ekran2) / 0.32);
  const e1 = $('e1');
  e1.style.opacity = easeOut(clamp01((t - T.ekran1) / 0.35)) * (1 - w1);
  e1.style.transform = 'translateX(' + (-w1 * 120).toFixed(1) + 'px)';
  const nacisk = clamp01((t - T.tap1) / 0.18) * (1 - clamp01((t - T.tap1 - 0.18) / 0.18));
  $('btn1').style.transform = 'scale(' + (1 - nacisk * 0.05).toFixed(3) + ')';

  // ── экран 2: список ──────────────────────────────────────────
  const w2 = clamp01((t - T.ekran3) / 0.32);
  const e2 = $('e2');
  e2.style.opacity = easeOut(clamp01((t - T.ekran2) / 0.35)) * (1 - w2);
  e2.style.transform = 'translateX(' + ((1 - easeOut(clamp01((t - T.ekran2) / 0.42))) * 140 - w2 * 120).toFixed(1) + 'px)';

  karty.forEach((k, i) => {
    const a = T.karty + i * 0.22;
    const p = clamp01((t - a) / 0.42);
    k.style.opacity = easeOut(Math.min(1, p * 1.8));
    k.style.transform = 'translate3d(0,' + ((1 - easeBack(p)) * 34 + fala(t, i * .8, 1.1) * 1.8).toFixed(1) + 'px,0)' +
      ' scale(' + (0.96 + easeOut(p) * 0.04).toFixed(3) + ')';
  });

  const pl = clamp01((t - T.licznik) / 0.7);
  $('licznik').textContent = Math.round(easeOut(pl) * 4380).toLocaleString('pl-PL');

  // ── экран 3: деталь и график ─────────────────────────────────
  const e3 = $('e3');
  e3.style.opacity = easeOut(clamp01((t - T.ekran3) / 0.35));
  e3.style.transform = 'translateX(' + ((1 - easeOut(clamp01((t - T.ekran3) / 0.42))) * 140).toFixed(1) + 'px)';
  const pw = easeOut(clamp01((t - T.wykres) / 1.1));
  linia.style.strokeDashoffset = dl * (1 - pw);
  $('kropka').setAttribute('opacity', pw > .98 ? (0.5 + Math.abs(fala(t, 0, 2)) * 0.5).toFixed(2) : 0);

  // ── палец ────────────────────────────────────────────────────
  const palec = $('palec');
  let px = 0, py = 0, po = 0;
  const tap = (a, x, y) => {
    const p = clamp01((t - a + 0.45) / 0.45);
    const wy = clamp01((t - a - 0.25) / 0.3);
    if (p > 0 && wy < 1) { px = x; py = y; po = easeOut(p) * (1 - wy); }
  };
  tap(T.tap1, 540, 1210);
  tap(T.tap2, 540, 690);
  palec.style.opacity = po;
  palec.style.left = (px - 48) + 'px';
  palec.style.top = (py - 48) + 'px';
  palec.style.transform = 'scale(' + (0.85 + po * 0.15).toFixed(3) + ')';

  // ── подпись ──────────────────────────────────────────────────
  const ps = easeOut(clamp01((t - T.koniec) / 0.5));
  const st = $('stopka');
  st.style.opacity = ps;
  st.style.transform = 'translateY(' + ((1 - ps) * 26 + fala(t, 2.2, .9) * 2).toFixed(1) + 'px)';
};
window.setT(0);
</script>
</body></html>`;

// ── съёмка ────────────────────────────────────────────────────────
const tmp = path.join(DIR, 'out', 'interfejs-klatki');
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await mkdir(path.dirname(WYJSCIE), { recursive: true });

const plik = path.join(tmp, 'strona.html');
await writeFile(plik, html(), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto('file:///' + plik.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const czasy = arg('podglad');
if (czasy) {
  for (const t of czasy.split(',').map(Number)) {
    await page.evaluate((x) => window.setT(x), t);
    await page.screenshot({ path: path.join(tmp, `t${t.toFixed(2)}.png`) });
  }
  await browser.close();
  console.log(`[podglad] ${tmp}`);
  process.exit(0);
}

const klatki = Math.round(SEK * FPS);
for (let i = 0; i < klatki; i++) {
  await page.evaluate((t) => window.setT(t), i / FPS);
  await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(5, '0')}.png`) });
  if (i % 100 === 0) process.stdout.write(`\r[kadry] ${i}/${klatki}`);
}
process.stdout.write(`\r[kadry] ${klatki}/${klatki}\n`);
await browser.close();

// Проба немая: заказчик оценивает ruch i czytelność, а не подложку.
await exe('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(tmp, 'f%05d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
  '-r', String(FPS), '-movflags', '+faststart', WYJSCIE]);

const { stdout } = await exe('ffprobe', ['-v', 'error',
  '-show_entries', 'format=duration,size', '-of', 'json', WYJSCIE]);
const inf = JSON.parse(stdout).format;
console.log(`[interfejs] gotowe: ${WYJSCIE} · ${(+inf.duration).toFixed(2)} s · ${(inf.size / 1048576).toFixed(2)} MB`);
await rm(tmp, { recursive: true, force: true });
