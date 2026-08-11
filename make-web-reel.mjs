// Рилс-кейс: настоящие сайты клиентов в движении.
//
// Почему так, а не как раньше. Прошлый движок собирал ролик из стокового
// футажа и кинетического текста — восемь итераций правок и вывод «не нравится
// вообще». Дело было не в настройках: шаблонный ролик из чужих кадров работает
// против агентства, которое продаёт качество. Здесь материал наш собственный —
// работающие сайты, которые мы сделали. Их не нужно «оживлять»: они и так живые.
//
// Как устроено:
//   1. Playwright снимает каждый сайт целиком в мобильном виде (длинный PNG).
//   2. Страница-композиция 1080x1920 ставит этот снимок в рамку телефона на
//      фирменный фон и двигает его покадрово — скролл получается ровным,
//      без рывков живой прокрутки.
//   3. ffmpeg склеивает кадры, подкладывает музыку и гасит хвост.
//
// Скролл двигаем САМИ, а не CSS-анимацией: во время скриншотов браузер не
// обязан выдерживать тайминг анимации, и ролик поехал бы рывками.
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const ROOT = import.meta.dirname;
const KLATKI = path.join(ROOT, 'klatki');
const ZRZUTY = path.join(ROOT, 'zrzuty');
const AP = path.join(ROOT, '..', 'ap');

const FPS = 25;
const W = 1080;
const H = 1920;

// Сайты в порядке показа. podpis — короткий титр под телефоном.
const STRONY = [
  { url: 'https://zovupl.github.io/4K/', podpis: '4K · serwis samochodowy', sek: 3.0 },
  { url: 'https://zovupl.github.io/rezydencja/', podpis: 'Rezydencja · sprzedaż willi', sek: 3.0 },
  { url: 'https://dzmzah.github.io/maya-gold/', podpis: 'MAYA GOLD · sklep', sek: 3.0 },
  { url: 'https://zovu.pl', podpis: 'ZOVU · nasza strona', sek: 3.0 },
];

// ── 1. снимаем сайты ─────────────────────────────────────────────
async function zrzucStrony(browser) {
  await mkdir(ZRZUTY, { recursive: true });
  const out = [];
  for (const [i, s] of STRONY.entries()) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await ctx.newPage();
    console.log(`[reel] zrzut ${i + 1}/${STRONY.length}: ${s.url}`);
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    // Баннеры согласия и всплывашки на снимке выглядят как брак работы —
    // это ровно то, что клиент на своём сайте видеть не должен.
    await page.evaluate(() => {
      const smiec = [...document.querySelectorAll('div,section,aside')].filter((el) => {
        const t = (el.id + ' ' + el.className).toLowerCase();
        return /cookie|consent|rodo|popup|modal|newsletter/.test(t);
      });
      smiec.forEach((el) => el.remove());
    });

    // Прокручиваем ШАГАМИ, а не одним прыжком вниз.
    //
    // Rezydencja снялась целиком пустой: её блоки появляются по мере скролла
    // (IntersectionObserver), а прыжок в конец страницы такие наблюдатели не
    // будит — секции так и остались прозрачными. Наши же сайты и ловят на
    // этом: чем аккуратнее анимации, тем пустее наивный снимок.
    await page.evaluate(async () => {
      const krok = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += krok) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 260));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 700));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);

    // Страховка: то, что всё равно осталось спрятанным, показываем силой.
    // Трансформы не трогаем — ими держится вёрстка, а не только анимации.
    await page.addStyleTag({
      content: `*,*::before,*::after{animation:none!important;transition:none!important}
                [class*="aos"],[data-aos],[class*="fade"],[class*="reveal"],[class*="animate"]
                {opacity:1!important;visibility:visible!important}`,
    });
    await page.waitForTimeout(600);
    const plik = path.join(ZRZUTY, `strona-${i + 1}.png`);
    await page.screenshot({ path: plik, fullPage: true });
    const wym = await page.evaluate(() => ({
      w: document.documentElement.clientWidth,
      h: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    }));
    console.log(`[reel]   ${wym.w}x${wym.h}`);
    out.push({ ...s, plik, wysokosc: wym.h });
    await ctx.close();
  }
  return out;
}

// ── 2. страница-композиция ───────────────────────────────────────
async function stronaKompozycji(logoUri) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; }
  body { background:#050505; font-family:'JetBrains Mono', monospace; color:#fff; position:relative; }
  .glow-a { position:absolute; width:1500px; height:1500px; left:-420px; top:-460px;
    background:radial-gradient(circle at center, rgba(124,58,237,.45), rgba(124,58,237,0) 62%); }
  .glow-b { position:absolute; width:1200px; height:1200px; right:-420px; bottom:-380px;
    background:radial-gradient(circle at center, rgba(167,139,250,.28), rgba(167,139,250,0) 60%); }
  .grid { position:absolute; inset:0; opacity:.14;
    background-image:
      linear-gradient(to right, rgba(167,139,250,.16) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(167,139,250,.16) 1px, transparent 1px);
    background-size:110px 110px;
    mask-image:radial-gradient(ellipse 70% 55% at 50% 45%, #000 20%, transparent 76%);
    -webkit-mask-image:radial-gradient(ellipse 70% 55% at 50% 45%, #000 20%, transparent 76%); }

  /* телефон: корпус, экран со скруглением, блик по стеклу */
  /* Обёртка центрирует, а сам корпус двигаем — иначе translateX(-50%) для
     центровки и наезд камеры дерутся за один transform. */
  .scena { position:absolute; left:0; right:0; top:392px; height:1235px;
    display:flex; justify-content:center; perspective:2600px; }
  .telefon { position:relative;
    width:600px; height:1235px; border-radius:74px; padding:13px;
    background:linear-gradient(160deg,#3a3a44,#141418 42%,#2b2b33);
    box-shadow:0 50px 130px rgba(0,0,0,.72), 0 0 90px 12px rgba(124,58,237,.34),
      inset 0 1px 0 rgba(255,255,255,.16); }
  .ekran { position:relative; width:100%; height:100%; border-radius:62px; overflow:hidden;
    background:#000; }
  .ekran img { position:absolute; left:0; top:0; width:100%; display:block; }
  .blysk { position:absolute; inset:0; pointer-events:none; border-radius:62px;
    background:linear-gradient(118deg, rgba(255,255,255,.13) 0%, rgba(255,255,255,0) 34%); }

  /* Палец. Именно он превращает макет в «живой телефон в руке»: без него
     ролик читается как рендер, сколько ни двигай камеру. Рисуем не курсор,
     а мягкое пятно касания с ореолом — так это выглядит на записи экрана. */
  /* Касание, а не шар.
     Две попытки ушли на кружок с объёмным бликом — и обе читались как мячик,
     лежащий на экране: виноват был именно объём, смещённый блик и жёсткий
     край. На записи экрана касание выглядит иначе: мягкое пятно без границы
     и короткий след за ним. Поэтому — размытие, никакой обводки, малый
     размер и шлейф вверх по ходу движения. */
  .palec { position:absolute; left:50%; width:58px; height:58px; margin-left:-29px;
    border-radius:50%; opacity:0; pointer-events:none;
    background:rgba(255,255,255,.5);
    filter:blur(7px); }
  .palec::after { content:''; position:absolute; left:50%; margin-left:-13px; top:26px;
    width:26px; height:150px; border-radius:13px;
    background:linear-gradient(to bottom, rgba(255,255,255,.30), rgba(255,255,255,0)); }

  /* шапка: марка и о чём ролик */
  .naglowek { position:absolute; left:0; right:0; top:118px; text-align:center; }
  .naglowek .marka { display:inline-flex; align-items:center; gap:14px;
    border:1px solid rgba(167,139,250,.45); border-radius:999px; padding:13px 30px;
    font-size:23px; letter-spacing:.24em; text-transform:uppercase; color:#c4b5fd;
    background:rgba(124,58,237,.14); }
  .naglowek .kropka { width:10px; height:10px; border-radius:50%; background:#a78bfa;
    box-shadow:0 0 15px 4px rgba(167,139,250,.9); }
  .naglowek h1 { margin-top:26px; font-family:'Oswald',sans-serif; font-weight:700;
    font-size:74px; line-height:1.06; text-transform:uppercase; letter-spacing:-1px;
    background:linear-gradient(96deg,#fff 0%,#fff 46%,#a78bfa 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; padding-bottom:.08em; }

  /* подпись под телефоном */
  .podpis { position:absolute; left:0; right:0; bottom:196px; text-align:center;
    font-size:34px; letter-spacing:.06em; color:#e9e5f7; }
  .podpis span { color:#a78bfa; }

  /* подвал */
  .stopka { position:absolute; left:74px; right:74px; bottom:88px; padding-top:28px;
    border-top:1px solid rgba(255,255,255,.14);
    display:flex; align-items:center; justify-content:space-between; }
  .marka2 { display:flex; align-items:center; gap:16px; }
  .marka2 img { width:54px; height:54px; object-fit:contain;
    filter:drop-shadow(0 0 18px rgba(167,139,250,.55)); }
  .word { font-family:'Oswald',sans-serif; font-weight:700; font-size:38px; letter-spacing:.18em; }
  .www { font-size:26px; color:#a78bfa; letter-spacing:.06em; }

  /* финальный кадр */
  .final { position:absolute; inset:0; display:none; flex-direction:column;
    align-items:center; justify-content:center; gap:34px; background:#050505; }
  .final img { width:190px; height:190px; object-fit:contain;
    filter:drop-shadow(0 0 60px rgba(124,58,237,.75)); }
  .final h2 { font-family:'Oswald',sans-serif; font-weight:700; font-size:92px;
    text-transform:uppercase; letter-spacing:-1px; text-align:center; line-height:1.08;
    background:linear-gradient(96deg,#fff 0%,#fff 46%,#a78bfa 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; padding-bottom:.08em; }
  .final p { font-size:36px; color:#c4b5fd; letter-spacing:.1em; }
</style></head><body>
  <div class="glow-a"></div><div class="glow-b"></div><div class="grid"></div>

  <div class="naglowek">
    <div class="marka"><span class="kropka"></span>ZOVU · PORTFOLIO</div>
    <h1 id="tytul">Strony, które<br>zrobiliśmy</h1>
  </div>

  <div class="scena"><div class="telefon" id="telefon"><div class="ekran">
    <img id="zrzut" src="" alt="">
    <div class="blysk"></div>
    <div class="palec" id="palec"></div>
  </div></div></div>

  <div class="podpis" id="podpis"></div>

  <div class="stopka">
    <div class="marka2">${logoUri ? `<img src="${logoUri}" alt="">` : ''}<div class="word">ZOVU</div></div>
    <div class="www">zovu.pl</div>
  </div>

  <div class="final" id="final">
    ${logoUri ? `<img src="${logoUri}" alt="">` : ''}
    <h2>Zrobimy<br>i Twoją</h2>
    <p>zovu.pl</p>
  </div>
</body></html>`;
}

// ── 3. кадры ─────────────────────────────────────────────────────
// Плавность даёт не постоянная скорость, а мягкий старт и торможение:
// равномерный скролл выглядит машинным, глаз цепляется за рывок на стыках.
const wygladz = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function zrobKlatki(browser, strony, logoUri) {
  await rm(KLATKI, { recursive: true, force: true });
  await mkdir(KLATKI, { recursive: true });

  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(await stronaKompozycji(logoUri), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200); // шрифты

  let nr = 0;
  const zapisz = async () => {
    await page.screenshot({ path: path.join(KLATKI, String(nr++).padStart(4, '0') + '.png') });
  };

  for (const [i, s] of strony.entries()) {
    const dane = 'data:image/png;base64,' + (await readFile(s.plik)).toString('base64');
    // Экран телефона 574x1209 при ширине снимка 780 — считаем, сколько
    // пикселей снимка помещается по высоте, и прокручиваем ровно остаток.
    await page.evaluate(
      ({ dane, podpis }) => {
        const img = document.getElementById('zrzut');
        img.src = dane;
        document.getElementById('podpis').innerHTML = podpis.replace('·', '<span>·</span>');
      },
      { dane, podpis: s.podpis }
    );
    await page.waitForTimeout(600);

    // Прокручиваем НЕ весь сайт, а два с небольшим экрана.
    //
    // Первый прогон гнал 20 000 пикселей за три секунды: страница пролетала
    // так, что глаз не успевал ни за макетом, ни за текстом — получалось
    // мельтешение вместо демонстрации. Смысл кадра не в том, чтобы показать
    // сайт целиком, а в том, чтобы было видно: он живой, аккуратный и наш.
    const zapas = await page.evaluate(() => {
      const img = document.getElementById('zrzut');
      const ekran = img.parentElement;
      const doKonca = Math.max(0, img.getBoundingClientRect().height - ekran.getBoundingClientRect().height);
      return Math.min(doKonca, ekran.getBoundingClientRect().height * 2.2);
    });

    const klatek = Math.round(s.sek * FPS);
    for (let k = 0; k < klatek; k++) {
      const p = wygladz(klatek === 1 ? 0 : k / (klatek - 1));
      const t = klatek === 1 ? 0 : k / (klatek - 1);

      await page.evaluate(
        ({ y, t, i }) => {
          // Скролл. Округляем: движение на доли пикселя даёт ту самую
          // микро-дрожь, которую уже ловили на прошлых рилсах.
          document.getElementById('zrzut').style.transform = `translateY(${-Math.round(y)}px)`;

          // Камера: медленный наезд и лёгкий разворот корпуса. Направление
          // разворота чередуется по сайтам — иначе четыре сегмента подряд
          // выглядят как один длинный план.
          const bok = i % 2 === 0 ? 1 : -1;
          const skala = 0.975 + 0.05 * t;
          const obrot = bok * (3.4 - 5.2 * t);
          document.getElementById('telefon').style.transform =
            `scale(${skala.toFixed(4)}) rotateY(${obrot.toFixed(2)}deg)`;

          // Палец. Два свайпа за сегмент: касание, короткий ход вверх, отрыв.
          // Появляется и исчезает мягко — резкий показ читается как глюк.
          const palec = document.getElementById('palec');
          const faza = (t * 2) % 1;
          const widoczny = faza > 0.08 && faza < 0.72;
          const ruch = Math.min(1, Math.max(0, (faza - 0.08) / 0.64));
          const gora = 1180 - 520 * ruch;
          palec.style.top = `${Math.round(gora)}px`;
          // держим палец правее центра — так держат телефон в руке
          palec.style.marginLeft = '10px';
          palec.style.opacity = widoczny
            ? (ruch < 0.12 ? (ruch / 0.12) * 0.9 : ruch > 0.86 ? ((1 - ruch) / 0.14) * 0.9 : 0.9).toFixed(2)
            : '0';
        },
        { y: zapas * p, t, i }
      );
      await zapisz();
    }
    console.log(`[reel] klatki ${i + 1}/${strony.length}: ${klatek} (przewijam ${Math.round(zapas)}px)`);
  }

  // финальный кадр
  await page.evaluate(() => {
    document.getElementById('final').style.display = 'flex';
  });
  for (let k = 0; k < Math.round(1.6 * FPS); k++) await zapisz();
  console.log(`[reel] razem klatek: ${nr}`);
  await page.close();
  return nr;
}

// ── 4. сборка ────────────────────────────────────────────────────
// Трек выбираем из папки, а не жёстко один.
//
// Один и тот же трек на всех роликах делает ленту однообразной на слух —
// человек узнаёт мелодию и пролистывает, не досмотрев. Файл можно задать
// руками (--muzyka=имя), иначе берём случайный.
async function wybierzMuzyke() {
  const { readdir } = await import('node:fs/promises');
  const dir = path.join(AP, 'music');
  const recznie = (process.argv.find((a) => a.startsWith('--muzyka=')) || '').split('=')[1];
  const pliki = (await readdir(dir).catch(() => [])).filter((f) => /\.(mp3|m4a|aac|wav)$/i.test(f));
  if (!pliki.length) throw new Error('w music/ nie ma żadnego utworu');
  if (recznie) {
    const trafiony = pliki.find((f) => f.toLowerCase().includes(recznie.toLowerCase()));
    if (trafiony) return path.join(dir, trafiony);
    console.warn(`[reel] nie ma utworu „${recznie}" — biorę losowy`);
  }
  const wybrany = pliki[Math.floor(Math.random() * pliki.length)];
  console.log(`[reel] muzyka: ${wybrany}`);
  return path.join(dir, wybrany);
}

async function zloz(klatek) {
  const muzyka = await wybierzMuzyke();
  const wynik = path.join(ROOT, 'zovu-portfolio-reel.mp4');
  const sek = klatek / FPS;

  const args = [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(KLATKI, '%04d.png'),
    '-i', muzyka,
    '-filter_complex',
    // хвост музыки гасим, иначе ролик обрывается на полуноте
    `[1:a]atrim=0:${sek.toFixed(2)},afade=t=out:st=${(sek - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-14:TP=-1.5[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    wynik,
  ];
  await execFileAsync('ffmpeg', args, { maxBuffer: 40 * 1024 * 1024 });
  return { wynik, sek };
}

// ── поехали ──────────────────────────────────────────────────────
const logoUri = await readFile(path.join(AP, 'logo-white.b64'), 'utf8')
  .then((b) => 'data:image/png;base64,' + b.trim())
  .catch(() => null);

const browser = await chromium.launch();
try {
  const strony = process.env.SKIP_ZRZUT ? STRONY.map((x, i) => ({ ...x, plik: path.join(ZRZUTY, `strona-${i + 1}.png`) })) : await zrzucStrony(browser);
  const klatek = await zrobKlatki(browser, strony, logoUri);
  const { wynik, sek } = await zloz(klatek);
  console.log(`[reel] gotowe: ${wynik} (${sek.toFixed(1)}s)`);
} finally {
  await browser.close();
}
