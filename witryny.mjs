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
const SEK = Number(arg('sekundy', 7));
const OUT = path.join(DIR, 'broll', 'witryny');

// Кадр снимаем в половинном размере с удвоенной плотностью: браузер рисует
// как на телефоне (шрифты, вёрстка, точки останова), а на выходе всё равно
// получается 1080×1920 без единого мягкого пикселя.
const VW = W / 2, VH = H / 2;

export const WITRYNY = [
  { klucz: 'zovu', url: 'https://zovu.pl', nazwa: 'zovu.pl', czym: 'сайт студии' },
  // Портфолио открывается по-русски: язык запоминается в браузере, а у чистого
  // профиля Playwright его нет. Русский текст в польском ролике — брак, который
  // на контрольном листе видно сразу, а в сборке уже поздно.
  { klucz: 'zah', url: 'https://zah.zovu.pl', nazwa: 'zah.zovu.pl', czym: 'портфолио', jezyk: 'PL' },
  { klucz: '4k', url: 'https://zovupl.github.io/4K/', nazwa: '4K', czym: 'автосервис' },
  { klucz: 'rezydencja', url: 'https://zovupl.github.io/rezydencja/', nazwa: 'Rezydencja', czym: 'вилла под ключ' },
  { klucz: 'rolki', url: 'https://dzmzah.github.io/rolki/', nazwa: 'rolki', czym: 'оффер' },
  { klucz: 'maya', url: 'https://dzmzah.github.io/maya-gold/', nazwa: 'MAYA GOLD', czym: 'витрина' },
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
  await exe('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS),
    '-i', path.join(kat, '%04d.png'),
    '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
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
