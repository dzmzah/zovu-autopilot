// Съёмка наших живых сайтов — банк кадров для рилсов-портфолио.
//
// Зачем. Лента у нас держится на стоке и рисованных полотнах: и то и другое
// может собрать любой конкурент за вечер. Единственное, что подделать нельзя, —
// наши собственные сайты. Они уже в интернете, их можно снять и показать как
// доказательство, а не как обещание. Стоит это ноль злотых и выглядит дороже
// всего, что мы делали.
//
// Как. Сайт открывается в браузере в телефонном кадре, страница едет вниз
// по расчётной кривой (не «плавным скроллом» браузера — тот дёргается и
// зависит от машины), каждый кадр снимается отдельно и склеивается ffmpeg.
// Отсюда ровно 50 кадров в секунду и одинаковый темп на любом железе.
//
//   node witryny.mjs                       — снять все
//   node witryny.mjs --tylko=4k,rezydencja — только эти
//   node witryny.mjs --sekundy=8           — длиннее проход
import { mkdir, rm, writeFile } from 'node:fs/promises';
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

const W = 1080, H = 1920, FPS = 50;

// Сайт НЕ на весь кадр. Причина не в красоте: подписи ролика встают около
// 1180-1300 px, а сайт — это сплошной текст, и наша фраза ложилась прямо на
// его заголовок. В пробе 25.08 «DZIAŁA DZIŚ.» село на «OSTATNIE PROJEKTY» —
// то самое «текст поверх текста», за которое ролики уже прилетало.
// Поэтому страница живёт экраном телефона в верхней части кадра, а низ
// остаётся чистым полем для подписей и номерных плашек.
const EKRAN = { szer: 592, wys: 1052, x: 244, y: 74, promien: 46 };
const DOL_WOLNY = H - (EKRAN.y + EKRAN.wys); // 794 px чистого поля
const SEK = Number(arg('sekundy', 7));
const OUT = path.join(DIR, 'broll', 'witryny');

// Кадр снимаем в половинном размере с удвоенной плотностью: браузер рисует
// как на телефоне (шрифты, вёрстка, точки останова), а на выходе всё равно
// получается 1080×1920 без единого мягкого пикселя.
const VW = W / 2, VH = H / 2;

export const WITRYNY = [
  { klucz: 'zovu', url: 'https://zovu.pl', nazwa: 'zovu.pl', czym: 'strona studia' },
  // Портфолио открывается по-русски: язык запоминается в браузере, а у чистого
  // профиля Playwright его нет. Русский текст в польском ролике — брак, который
  // на контрольном листе видно сразу, а в сборке уже поздно.
  { klucz: 'zah', url: 'https://zah.zovu.pl', nazwa: 'zah.zovu.pl', czym: 'portfolio', jezyk: 'PL' },
  { klucz: '4k', url: 'https://zovupl.github.io/4K/', nazwa: '4K', czym: 'serwis samochodowy' },
  { klucz: 'rezydencja', url: 'https://zovupl.github.io/rezydencja/', nazwa: 'Rezydencja', czym: 'willa na sprzedaż' },
  { klucz: 'rolki', url: 'https://dzmzah.github.io/rolki/', nazwa: 'rolki', czym: 'oferta rolek' },
  { klucz: 'maya', url: 'https://dzmzah.github.io/maya-gold/', nazwa: 'MAYA GOLD', czym: 'sklep jubilerski' },
];

// Плавность решает всё: линейный проезд читается как машинная прокрутка,
// а не как рука. Разгон и торможение — обычный косинус, но с полками в
// начале и в конце, чтобы зритель успел прочитать первый экран и последний.
const POLKA = 0.14;
function postep(u) {
  if (u <= POLKA) return 0;
  if (u >= 1 - POLKA) return 1;
  const t = (u - POLKA) / (1 - 2 * POLKA);
  return 0.5 - Math.cos(Math.PI * t) / 2;
}

// Баннеры согласия перекрывают первый экран и портят кадр. Убираем их до
// съёмки, а не жмём «принять»: нажатие — это согласие от имени Захара.
const SPRZATANIE = `
  const wzorce = /cookie|consent|rodo|zgod|privacy|gdpr/i;
  document.querySelectorAll('div,section,aside,dialog').forEach((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') return;
    if (el.offsetHeight > innerHeight * 0.85) return;
    if (wzorce.test(el.className + ' ' + el.id + ' ' + (el.textContent || '').slice(0, 400))) {
      el.style.display = 'none';
    }
  });
  document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch {} });

  // Плавающие пузыри чата (WhatsApp, Messenger, «наверх») — чужие виджеты
  // в нашем кадре. Они прилипают к углу и тянут взгляд ровно туда, где
  // ничего нашего нет. Прячем всё мелкое и закреплённое в нижней части
  // экрана; крупные закреплённые панели (шапки, меню) не трогаем.
  document.querySelectorAll('body *').forEach((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width > 130 || r.height > 130 || r.width < 20) return;
    if (r.top < innerHeight * 0.45) return;
    el.style.display = 'none';
  });
`;

// Рамка — один PNG на весь кадр: фирменный фон и тень, а на месте экрана
// дырка. Кладём его ПОВЕРХ видео, и скруглённые углы получаются сами формой
// дырки — маску и alphamerge городить не нужно.
// Подпись работы живёт НИЖЕ подписей ролика (те стоят около 1180-1300 px).
// Без неё нижние 800 px кадра пустуют почти половину ролика — замер на пробе
// 25.08 дал 44 % кадров без единой буквы внизу. И зритель не знает, чей
// сайт он видит: экран без имени — это просто чей-то экран.
const PODPIS_Y = 1452;

async function zbudujRamke(br, plik, w = null) {
  const podpis = w
    ? `
    <text x="${W / 2}" y="${PODPIS_Y}" text-anchor="middle"
          font-family="Inter, Segoe UI, sans-serif" font-size="46" font-weight="700"
          fill="#efeaff" letter-spacing="1">${w.nazwa}</text>
    <text x="${W / 2}" y="${PODPIS_Y + 46}" text-anchor="middle"
          font-family="Inter, Segoe UI, sans-serif" font-size="27" font-weight="500"
          fill="#9b7bff" letter-spacing="4">${String(w.czym).toUpperCase()}</text>`
    : '';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="tlo" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#241a44"/>
      <stop offset="0.55" stop-color="#150f2a"/>
      <stop offset="1" stop-color="#0b0816"/>
    </linearGradient>
    <filter id="cien" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
    <mask id="dziura">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <rect x="${EKRAN.x}" y="${EKRAN.y}" width="${EKRAN.szer}" height="${EKRAN.wys}"
            rx="${EKRAN.promien}" ry="${EKRAN.promien}" fill="#000"/>
    </mask>
  </defs>
  <g mask="url(#dziura)">
    <rect width="${W}" height="${H}" fill="url(#tlo)"/>
    <rect x="${EKRAN.x - 10}" y="${EKRAN.y + 16}" width="${EKRAN.szer + 20}" height="${EKRAN.wys + 20}"
          rx="${EKRAN.promien + 8}" fill="#000" opacity="0.55" filter="url(#cien)"/>
    <rect x="${EKRAN.x - 3}" y="${EKRAN.y - 3}" width="${EKRAN.szer + 6}" height="${EKRAN.wys + 6}"
          rx="${EKRAN.promien + 3}" fill="none" stroke="#5b32e0" stroke-opacity="0.45" stroke-width="3"/>
  </g>
  ${podpis}
</svg>`;
  const pg = await br.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(
    `<body style="margin:0;background:transparent">${svg}</body>`
  );
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: plik, omitBackground: true });
  await pg.close();
}

async function snimi(br, w) {
  const kat = path.join(OUT, '.klatki-' + w.klucz);
  await rm(kat, { recursive: true, force: true });
  await mkdir(kat, { recursive: true });

  const pg = await br.newPage({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  // Анимации по времени страницы нам мешают: между кадрами проходит секунда
  // реального времени, и всё, что двигается само, дёргается. Замораживаем.
  await pg.addStyleTag({ content: `*,*::before,*::after{
    animation-play-state:paused !important; transition:none !important;
    scroll-behavior:auto !important; }` }).catch(() => {});

  await pg.goto(w.url, { waitUntil: 'networkidle', timeout: 60_000 });
  await pg.waitForTimeout(1500);

  // Переключатель языка: жмём нужный код, если он на странице есть. Молчать
  // тут нельзя — снятый не на том языке сайт выглядит как рабочий кадр.
  if (w.jezyk) {
    const przelacznik = pg.getByText(w.jezyk, { exact: true }).first();
    try {
      await przelacznik.click({ timeout: 5000 });
      await pg.waitForTimeout(1200);
    } catch {
      console.warn(`[витрины] ${w.klucz}: не нашёл переключатель «${w.jezyk}» — снимаю как есть`);
    }
  }

  await pg.evaluate(SPRZATANIE);
  await pg.addStyleTag({ content: `*,*::before,*::after{
    animation-play-state:paused !important; transition:none !important;
    scroll-behavior:auto !important; }` }).catch(() => {});
  await pg.waitForTimeout(400);

  const wysokosc = await pg.evaluate(() => document.documentElement.scrollHeight);
  // Ниже трёх экранов не едем: у длинных страниц хвост обычно пустой футер,
  // а проезд по нему выглядит как «сайт закончился».
  const droga = Math.min(Math.max(0, wysokosc - VH), VH * 3);

  const klatki = Math.round(SEK * FPS);
  for (let i = 0; i < klatki; i++) {
    const y = Math.round(droga * postep(i / (klatki - 1)));
    await pg.evaluate((v) => window.scrollTo(0, v), y);
    await pg.screenshot({ path: path.join(kat, String(i).padStart(4, '0') + '.png') });
  }
  await pg.close();

  const plik = path.join(OUT, w.klucz + '.mp4');
  const ramka = path.join(OUT, '.ramka-' + w.klucz + '.png');
  await zbudujRamke(br, ramka, w);
  await exe('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS),
    '-i', path.join(kat, '%04d.png'),
    '-i', ramka,
    '-filter_complex',
    // Экран кладём на своё место, сверху — рамка с дыркой. Порядок важен:
    // рамка непрозрачна везде, кроме экрана, поэтому она же рисует фон.
    //
    // Холст делаем через `pad`, а не отдельным источником `color`: источник
    // заливки имеет собственную длину, и `shortest` обрезал по ней весь
    // ролик — из шести секунд оставалась одна.
    `[0:v]scale=${EKRAN.szer}:${EKRAN.wys}:flags=lanczos,` +
      `pad=${W}:${H}:${EKRAN.x}:${EKRAN.y}:color=black[z];` +
      `[z][1:v]overlay=0:0,format=yuv420p[out]`,
    '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
    '-movflags', '+faststart',
    plik,
  ]);
  await rm(kat, { recursive: true, force: true });
  return { plik, droga, wysokosc };
}

const tylko = (arg('tylko', '') || '').split(',').filter(Boolean);
const lista = tylko.length ? WITRYNY.filter((w) => tylko.includes(w.klucz)) : WITRYNY;
if (!lista.length) throw new Error('нечего снимать: проверь --tylko');

await mkdir(OUT, { recursive: true });
const br = await chromium.launch();
const opis = [];
for (const w of lista) {
  try {
    const r = await snimi(br, w);
    opis.push({ ...w, plik: path.basename(r.plik), sekundy: SEK });
    console.log(`[витрины] ${w.klucz}: ${SEK} с, проезд ${r.droga} из ${r.wysokosc} px`);
  } catch (e) {
    // Один упавший сайт не должен уносить всю съёмку: остальные кадры нужны.
    console.log(`[витрины] ${w.klucz}: НЕ СНЯЛСЯ — ${e.message.slice(0, 120)}`);
  }
}
await br.close();

if (opis.length) {
  await writeFile(path.join(OUT, 'spis.json'), JSON.stringify(opis, null, 1), 'utf8');
}
console.log(`[витрины] готово: ${opis.length} из ${lista.length} → ${OUT}`);
