// Собирает рисованный рилс целиком: голос, сцены, камера, звуки, музыка.
//
//   node rolka-grafika.mjs
//
// Сценарий построен как у Захара в `Scenariusz 2`: не «три пункта», а
// ВЫЧИСЛЕНИЕ. Голос считает вслух, картинка складывает вместе с ним, в конце
// цифра потери красным. Объекты при этом не украшают текст — они и есть
// слагаемые. Именно этого не хватало первой версии: там иконки просто
// иллюстрировали слова, и получалось «не та тема».
//
// Арифметика честная: 20 минут × 30 дней = 10 часов. Ничего не выдумано.
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { zbudujGlos } from './glos.mjs';
import { sprawdzRolke } from './kontrola.mjs';
import { grafikaHtml, renderujKlatki, wczytajObiekty, W, H, FPS } from './grafika.mjs';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

const FRAZY = [
  { rola: 'hak', tekst: 'Ile kosztuje cię milczenie w sieci?', pauza: 0.34 },
  { rola: 'hak', tekst: 'Policzmy.', pauza: 0.42 },
  { rola: 'tresc', tekst: 'Jeden post to dwadzieścia minut.', pauza: 0.30 },
  { rola: 'tresc', tekst: 'Razy trzydzieści dni.', pauza: 0.34 },
  { rola: 'tresc', tekst: 'Dziesięć godzin miesięcznie. Twoich.', pauza: 0.38 },
  { rola: 'zaplata', tekst: 'Tyle samo kosztuje ktoś, kto zrobi to za ciebie.', pauza: 0.30 },
  { rola: 'cta', tekst: 'Napisz CZAS, a policzymy twoje.', pauza: 0.20 },
];

// ── проба без озвучки ─────────────────────────────────────────────
// Каждая проба картинки стоила дубля ElevenLabs, а правок по анимации нужны
// десятки: подвинуть тень, увеличить объект, сменить фон. Платить голосом за
// то, что решается глазами, бессмысленно — и именно так мы сожгли квоту.
//
// Тайминги считаем по слогам в темпе живой речи. Для проверки картинки этого
// достаточно: важно, ЧТО и КОГДА появляется, а не как оно звучит.
const BEZ_GLOSU = process.argv.includes('--bez-glosu');

// Размытие полотна. Захар: «топография нравится, но заблюрил бы, чтобы не
// было сильного акцента на нём, но его было видно». Ровно то, что делает
// камера с настоящим фоном: рисунок остаётся, но глубина резкости уводит его
// назад, и первым в кадре читается предмет, а не узор.
//
// Заодно сажаем контраст: одно размытие оставляет линии тёмными, они всё
// равно тянут взгляд, просто нерезкие.
const ROZMYCIE = +(
  (process.argv.find((a) => a.startsWith('--rozmycie=')) || '').split('=')[1] ?? 18
);

function udawanyGlos(frazy, przedPierwsza = 0.45) {
  const TEMPO = 4.2; // слогов в секунду — то, к чему стремимся в живом дубле
  const sylaby = (s) => (String(s).toLowerCase().match(/[aeiouyąęó]/g) || []).length || 1;
  const meta = [];
  let czas = przedPierwsza;
  for (const f of frazy) {
    const d = sylaby(f.tekst) / TEMPO;
    meta.push({ tekst: f.tekst, a: +czas.toFixed(3), b: +(czas + d).toFixed(3) });
    czas += d + (f.pauza ?? 0.3);
  }
  // Слова раскладываем по фразе пропорционально длине — подписи должны
  // сменяться, иначе на пробе не видно, попадают ли они под объекты.
  const slowa = meta.flatMap((m) => {
    const ws = m.tekst.split(/\s+/).filter(Boolean);
    const suma = ws.reduce((s, w) => s + w.length, 0) || 1;
    let t = m.a;
    return ws.map((w) => {
      const d = ((m.b - m.a) * w.length) / suma;
      const s = { tekst: w, a: +t.toFixed(3), b: +(t + d).toFixed(3) };
      t += d;
      return s;
    });
  });
  return { plik: null, frazy: meta, slowa, dlugosc: +(czas + 0.35).toFixed(3) };
}

const glos = BEZ_GLOSU
  ? udawanyGlos(FRAZY)
  : await zbudujGlos(FRAZY, { tmp: path.join(OUT, 'grafika-glos'), przedPierwsza: 0.45 });
console.log(
  BEZ_GLOSU
    ? `[grafika] ПРОБА без озвучки: ${glos.dlugosc.toFixed(2)} с по слогам, голос не тратим`
    : `[grafika] голос ${glos.dlugosc.toFixed(2)} с, слов ${glos.slowa.length}`
);

const F = glos.frazy;
const total = +(glos.dlugosc + 0.5).toFixed(2);
const t = (i, d = 0) => +(F[i].a + d).toFixed(2);

// ── сцены ─────────────────────────────────────────────────────────
// Объект приходит под свою фразу и УХОДИТ, когда мысль сменилась. Это
// главное отличие от первой версии, где всё копилось до конца и кадр к
// финалу стоял неподвижной кучей.
const scena = [
// Размеры и положения сняты с образцов Захара, а не выбраны на глаз. У него
// объект занимает половину кадра и ОБРЕЗАЕТСЯ краем: влетает сверху так, что
// часть остаётся за рамкой. Кадр от этого читается как окно, за которым
// продолжается сцена. Наш аккуратный предмет по центру, целиком в кадре и с
// воздухом со всех сторон, выдаёт наклейку — сколько его ни покачивай.
//
// Плюс у эмодзи Fluent прозрачные поля по краям PNG: в рамке 500 px сам
// предмет занимает около 350. Поэтому числа здесь заметно больше тех, что
// кажутся нужными.
  { obiekt: 'mobile_phone_3d', x: 520, y: 560, skala: 760, obrot: -6, skad: 'gora',
    start: t(0, 0.05), koniec: t(1, 0.10), dokad: 'lewo' },
  { obiekt: 'thinking_face_3d', x: 880, y: 1120, skala: 440, obrot: 8, skad: 'prawo',
    start: t(0, 0.42), koniec: t(1, 0.10), dokad: 'prawo' },

  // Часы и календарь — пара слагаемых. Разводим к краям и даём им вылезти за
  // рамку: два предмета, вписанные целиком, читаются как иконки в списке.
  { obiekt: 'alarm_clock_3d', x: 250, y: 470, skala: 700, obrot: -10, skad: 'lewo',
    start: t(2, 0.02), koniec: t(4, 0.55), dokad: 'lewo' },
  { obiekt: 'calendar_3d', x: 830, y: 560, skala: 640, obrot: 9, skad: 'prawo',
    start: t(3, 0.02), koniec: t(4, 0.55), dokad: 'prawo' },

  // Расплата — самый крупный кадр ролика: одна вещь во весь экран.
  { obiekt: 'money_with_wings_3d', x: 540, y: 540, skala: 820, obrot: -5, skad: 'gora',
    start: t(4, 0.35), koniec: t(5, 0.15), dokad: 'gora' },

  // Три карточки с ЖИВЫМ видео — то, чего в рисованном ролике не было вовсе.
  // Снято с «Scenariusz 1»: там в этом месте три играющие карточки с людьми,
  // и именно они делают кадр живым. Нарисованный предмет, как его ни крути,
  // остаётся рисунком; человек в кадре — нет.
  //
  // Момент выбран не случайно: голос говорит «столько же стоит тот, кто
  // сделает это за тебя», и карточки показывают, ЧТО именно он сделает.
  // Средняя карточка крупнее и выше боковых: тройка одинаковых читается как
  // таблица, а с выделенной серединой — как сцена, у которой есть центр.
  { film: 'barber', x: 235, y: 830, skala: 340, wys: 540, obrot: -7, skad: 'dol',
    start: t(5, 0.05), koniec: t(6, 0.50), dokad: 'lewo' },
  { film: 'moda', x: 552, y: 760, skala: 390, wys: 620, obrot: 1, skad: 'dol',
    start: t(5, 0.20), koniec: t(6, 0.50), dokad: 'dol' },
  { film: 'uroda', x: 870, y: 830, skala: 340, wys: 540, obrot: 7, skad: 'dol',
    start: t(5, 0.35), koniec: t(6, 0.50), dokad: 'prawo' },

  // Конверт уходит наверх и уменьшается: под ним теперь ценник, и два
  // крупных предмета в одном кадре дерутся за взгляд.
  { obiekt: 'envelope_3d', x: 540, y: 430, skala: 480, obrot: 0, skad: 'gora',
    start: t(6, 0.02) },
];

// ── ценник ────────────────────────────────────────────────────────
// Приём из «Scenariusz 1»: бирка с числом и шкалой процента, число падает,
// шкала уезжает, на посадке вспышка. Держит не цифра, а падение — глаз
// следит за уходящей полосой и ждёт, где она встанет.
//
// Считаем честно и ничего не выдумываем: те самые десять часов, которые мы
// только что насчитали, уходят в ноль. Придумывать сюда злотые нельзя — мы
// не знаем ни ставки зрителя, ни своего ценника для него.
const metki = [
  {
    x: 540, y: 1010, szer: 400, wys: 540,
    od: 10, do: 0, jednostka: 'H',
    odProc: 100, doProc: 0,
    a: t(6, 0.10), b: total,
    czas: 1.1,
  },
];

// ── формула ───────────────────────────────────────────────────────
// Собирается под голос: строка появляется ровно тогда, когда её произносят.
// Ответ приходит ПОСЛЕ того, как слагаемые ушли, и на их место. Раньше он
// начинал проявляться за 0,3 с до их исчезновения и садился на 1020 — ровно
// между строками 980 и 1120. На кадре это читалось как двоение: сквозь
// «20 MIN» просвечивало красное «= 10 GODZIN». Строки формулы вообще нельзя
// разводить только по вертикали: они появляются с наездом камеры, и запас в
// сорок пикселей съедается зумом.
const wzor = [
  { tekst: '20 MIN × 30 DNI', y: 940, maly: true, a: t(2, 0.35), b: t(4, 0.55) },
  { tekst: '= 10 GODZIN', y: 1080, kolor: 'czerwony', a: t(4, 0.68), b: t(5, 0.10) },
];

// ── счётчик ───────────────────────────────────────────────────────
// Умножение теперь не пишется, а СЧИТАЕТСЯ на экране: пока голос произносит
// «умножить на тридцать дней», цифра накручивается с нуля до шестисот и
// тормозит на результате. Это ровно тот приём, что держит взгляд в образцах —
// там цена бежит до 20 205 zł, а ценник падает с 3000 до 150.
//
// Готовую цифру зритель читает и забывает; растущую досматривает, потому что
// хочет узнать, где она остановится. Смотреть на это ещё и честно: 20 минут
// на пост, тридцать постов в месяц — шестьсот минут никто не выдумывал.
const liczniki = [
  // ХУК. У Захара в «Scenariusz 1» цифра 20 205 zł стоит на полутора
  // секундах — ответ показан раньше, чем объяснён, и досмотр держится на
  // желании узнать, откуда он взялся. У нас первые три секунды уходили на
  // разогрев: телефон и думающее лицо. Теперь на вопрос «сколько тебе стоит
  // молчание» сразу прилетает цифра, а доказывать её будет весь ролик.
  //
  // Крутится быстрее, чем в середине: здесь она дразнит, а не считает.
  { od: 0, do: 600, jednostka: 'MIN', y: 1120, a: t(0, 0.30), b: t(1, 0.55),
    czas: 0.85, zPodpisem: true },

  // Середина: то же число, но теперь оно ВЫВОДИТСЯ. Повтор здесь намеренный —
  // в двадцатисекундном ролике ключевую цифру запоминают со второго раза.
  { od: 0, do: 600, jednostka: 'MIN', y: 1120, a: t(3, 0.05), b: t(4, 0.55), czas: 1.25 },
];

// Наложение строк ловим замером, а не глазами. Двоение «20 MIN» и
// «= 10 GODZIN» пролежало в ролике незамеченным, потому что видно его только
// на трёх кадрах из тысячи — ровно там, где одна строка гаснет, а вторая
// проявляется. Такое ищут не просмотром, а проверкой.
// Счётчик проверяем вместе со строками формулы: это такой же крупный текст в
// том же поле кадра, и налезть он может ровно так же.
const teksty = [...wzor, ...liczniki.map((l) => ({ ...l, duzy: true, tekst: `счётчик до ${l.do}` }))];
for (let i = 0; i < teksty.length; i++) {
  for (let j = i + 1; j < teksty.length; j++) {
    const a = teksty[i];
    const b = teksty[j];
    const razem = Math.min(a.b ?? 1e9, b.b ?? 1e9) - Math.max(a.a, b.a);
    const odstep = Math.abs(a.y - b.y);
    // Нужный зазор — половина высоты одной строки плюс половина другой.
    // Мерить одним числом нельзя: знак «×» набран 76 пунктами против 118 у
    // остальных, и общий порог ругался бы на здоровую вёрстку.
    const wys = (x) => (x.maly ? 76 : x.duzy ? 136 : 118) * 1.05;
    const trzeba = (wys(a) + wys(b)) / 2;
    if (razem > 0 && odstep < trzeba) {
      throw new Error(
        `[grafika] строки формулы налезают: «${a.tekst}» (y${a.y}) и «${b.tekst}» (y${b.y}) ` +
          `видны вместе ${razem.toFixed(2)} с при зазоре ${odstep} px, нужно ${Math.round(trzeba)}`
      );
    }
  }
}

// ── камера ────────────────────────────────────────────────────────
// Медленный наезд через весь ролик и подрывы на смысловых точках: на
// результате вычисления и на призыве. Неподвижная рамка выдаёт рисунок,
// движущаяся читается как съёмка.
const kamera = [
  { t: 0, zoom: 1.00, x: 0, y: 0 },
  { t: t(1), zoom: 1.05, x: -18, y: 10 },
  { t: t(2), zoom: 1.02, x: 20, y: -12 },
  { t: t(4, 0.25), zoom: 1.12, x: 0, y: 24 },
  { t: t(4, 0.90), zoom: 1.04, x: 0, y: 0 },
  { t: t(5, 0.20), zoom: 1.08, x: 14, y: -16 },
  { t: t(6), zoom: 1.02, x: 0, y: 0 },
  { t: total, zoom: 1.10, x: 0, y: 8 },
];

// Цвет по СМЫСЛУ, а не по длине слова: жёлтый — выгода, красный — потеря.
const akcenty = {
  zolty: ['policzmy', 'zrobi', 'ciebie', 'czas', 'policzymy'],
  czerwony: ['milczenie', 'dziesięć', 'godzin', 'twoich'],
};

const obrazki = await wczytajObiekty([...new Set(scena.map((o) => o.obiekt).filter(Boolean))]);

// ── живое видео для карточек ──────────────────────────────────────
// Готовим отдельно и в WebM. Браузер, которым мы снимаем кадры, собран без
// проприетарных кодеков: H.264 из `broll/` он не декодирует и показывает
// чёрный прямоугольник — молча, без ошибки. VP9 открытый, его понимает
// любая сборка.
//
// Заодно режем до нужного куска и до размера карточки: полноразмерный клип
// в окне 300 px — это лишняя работа декодера на каждом из тысячи кадров.
const filmy = {};
for (const o of scena.filter((x) => x.film)) {
  if (filmy[o.film]) continue;
  const zrodlo = path.join(DIR, 'broll', `${o.film}.mp4`);
  if (!existsSync(zrodlo)) {
    throw new Error(`[grafika] нет живого клипа broll/${o.film}.mp4`);
  }
  const cel = path.join(OUT, `film-${o.film}.webm`);
  await ffmpeg([
    '-i', zrodlo, '-t', '8',
    '-vf', `scale=${(o.skala || 300) * 2}:${(o.wys || 470) * 2}:force_original_aspect_ratio=increase,` +
      `crop=${(o.skala || 300) * 2}:${(o.wys || 470) * 2},fps=25`,
    '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-deadline', 'good', '-cpu-used', '4',
    cel,
  ]);
  filmy[o.film] = 'file:///' + cel.replace(/\\/g, '/');
  console.log(`[grafika] живое видео: ${o.film} → ${path.basename(cel)}`);
}
const scenaZFilmami = scena.map((o) => (o.film ? { ...o, film: filmy[o.film] } : o));
const katKlatek = path.join(OUT, 'grafika-klatki');
await rm(katKlatek, { recursive: true, force: true });
const klatek = await renderujKlatki(
  grafikaHtml({ scena: scenaZFilmami, wzor, liczniki, metki, kamera, akcenty, slowa: glos.slowa, obrazki }),
  total,
  katKlatek
);
console.log(`[grafika] отрисовано кадров: ${klatek} (${FPS} к/с)`);

// ── подложка ──────────────────────────────────────────────────────
// Только светлые полотна. Тень мы рисуем чёрной — на тёмном фоне её не
// видно ВООБЩЕ, и вместе с ней пропадает объём, ради которого всё затевалось.
// Там же умирает красная строка формулы: на почти чёрном она читается как
// грязное пятно. Проверено покадрово на `17_LUCHSHIY_FINAL.mp4`, собранном
// на `topografia-2`: тени нет ни на одном кадре.
//
// `topografia-3` — то самое бежевое полотно, на котором собран «Scenariusz 1»
// Захара. Тёмные фоны остаются в папке и включаются через `TLO_WIDEO`, но
// сами по себе больше не выпадают.
//
// `abstrakcja-3` тоже светлый, но насыщенно-розовый: объекты у нас розовые
// и красные, на нём они тонут, а тень пропадает в цвете. Светлый и НЕЙТРАЛЬНЫЙ
// — вот условие. Четыре новых взяты из пака YoEdit тем же критерием.
// Выбор Захара 17.08 из шести показанных: топография. Бумага, точки и
// однотонное остаются в папке — если понадобится развести ленту, они уже
// готовы, но сами по себе больше не выпадают.
const TLA = [
  'topografia-3.mp4',     // бежевая, на ней собран «Scenariusz 1» Захара
  'topografia-jasna.mp4', // белая — тот же рисунок, светлее и холоднее
];
const stanPlik = path.join(DIR, 'rolki', 'stan.json');
let stan = {};
try { stan = JSON.parse(await readFile(stanPlik, 'utf8')); } catch { stan = {}; }
const idxTla = ((stan.tloGrafika ?? -1) + 1) % TLA.length;
stan.tloGrafika = idxTla;

const TLO = process.env.TLO_WIDEO || path.join(DIR, 'tlo', TLA[idxTla]);
const jestTlo = existsSync(TLO);
console.log(`[grafika] фон: ${jestTlo ? path.basename(TLO) : 'нет, будет чёрный'}`);

const wideo = path.join(OUT, 'grafika-nieme.mp4');
await ffmpeg(
  jestTlo
    ? [
        '-stream_loop', '-1', '-i', TLO,
        '-framerate', String(FPS), '-i', path.join(katKlatek, 'f%05d.png'),
        '-filter_complex',
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
          `fps=${FPS},gblur=sigma=${ROZMYCIE},eq=contrast=0.80:brightness=0.03:saturation=1.05[tlo];` +
          `[tlo][1:v]overlay=0:0:format=auto,format=yuv420p,setsar=1[v]`,
        '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
        '-t', String(total), wideo,
      ]
    : [
        '-framerate', String(FPS), '-i', path.join(katKlatek, 'f%05d.png'),
        '-vf', `format=yuv420p,fps=${FPS},setsar=1`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-t', String(total), wideo,
      ]
);

// ── звук движения ─────────────────────────────────────────────────
// У Захара звуковое событие раз в секунду и чаще — на каждое движение, а не
// только на влёт. Поэтому озвучиваем и приходы, и уходы, и строки формулы.
const swist = path.join(OUT, 'g-swist.wav');
const puk = path.join(OUT, 'g-puk.wav');
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.26:c=white:a=0.7:r=48000',
  '-af', 'highpass=f=380,lowpass=f=4600,afade=t=in:st=0:d=0.05,afade=t=out:st=0.06:d=0.19,' +
    'volume=0.5,aformat=channel_layouts=stereo',
  '-ac', '2', '-ar', '48000', swist,
]);
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.07:c=white:a=0.8:r=48000',
  '-f', 'lavfi', '-i', 'sine=f=180:d=0.07:r=48000',
  '-filter_complex',
  '[0:a]highpass=f=900,lowpass=f=6000,afade=t=out:st=0.004:d=0.05[s];' +
    '[1:a]volume=0.35,afade=t=out:st=0:d=0.06[t];' +
    '[s][t]amix=inputs=2:normalize=0,volume=0.42,aformat=channel_layouts=stereo[a]',
  '-map', '[a]', '-ac', '2', '-ar', '48000', puk,
]);

const zdarzenia = [
  ...scena.map((o) => ({ t: +o.start, typ: 'swist' })),
  ...scena.filter((o) => o.koniec).map((o) => ({ t: +o.koniec, typ: 'puk' })),
  ...wzor.map((w) => ({ t: +w.a, typ: 'puk' })),
  // Счётчик озвучиваем дважды: щелчок на старте и второй в тот миг, когда
  // цифра встала. Остановка без звука проходит незамеченной — а она и есть
  // то, ради чего на счётчик смотрят.
  ...liczniki.flatMap((l) => [
    { t: +l.a, typ: 'swist' },
    { t: +(l.kres ?? l.a + (l.czas ?? 1.1)).toFixed(2), typ: 'puk' },
  ]),
].sort((a, b) => a.t - b.t);
console.log(`[grafika] звуковых событий: ${zdarzenia.length} (${(zdarzenia.length / total).toFixed(1)} на секунду)`);

const wejscia = [];
const czesci = [];
zdarzenia.forEach((z, i) => {
  wejscia.push('-i', z.typ === 'swist' ? swist : puk);
  const ms = Math.max(0, Math.round(z.t * 1000));
  czesci.push(`[${i}:a]adelay=${ms}|${ms}[s${i}]`);
});
const stuki = path.join(OUT, 'g-stuki.wav');
await ffmpeg([
  ...wejscia,
  '-filter_complex',
  czesci.join(';') + ';' + zdarzenia.map((_, i) => `[s${i}]`).join('') +
    `amix=inputs=${zdarzenia.length}:normalize=0,apad=whole_dur=${total}[a]`,
  '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', stuki,
]);

// ── музыка по кругу ───────────────────────────────────────────────
const utwory = (await readdir(path.join(DIR, 'music')).catch(() => []))
  .filter((f) => /\.mp3$/i.test(f))
  .sort();
const idxMuz = utwory.length ? ((stan.muzykaGrafika ?? -1) + 1) % utwory.length : 0;
if (utwory.length) {
  stan.muzykaGrafika = idxMuz;
  console.log(`[grafika] музыка ${idxMuz + 1} из ${utwory.length}: ${utwory[idxMuz]}`);
}
await mkdir(path.dirname(stanPlik), { recursive: true });
await writeFile(stanPlik, JSON.stringify(stan, null, 2) + String.fromCharCode(10), 'utf8');
const muzyka = path.join(DIR, 'music', utwory[idxMuz] || 'pixabay-creative-technology-showreel.mp3');

// ── сведение ──────────────────────────────────────────────────────
// Голос жмём плотнее, чем раньше. Замер по роликам Захара: у него дорожка
// идёт с динамикой LRA 2.5-3.5, у нас было 4.8. Именно эта плотность и
// читается как «дикторский» звук: ровный, близкий, без провалов.
const gotowy = path.join(OUT, 'auto-grafika-milczenie.mp4');
// На пробе голоса нет — сводить нечего. Картинку, щелчки и музыку кладём
// как есть: этого хватает, чтобы судить о движении и ритме.
if (BEZ_GLOSU) {
  await ffmpeg([
    '-i', wideo, '-i', muzyka, '-i', stuki,
    '-filter_complex',
    `[1:a]atrim=0:${total},asetpts=N/SR/TB,volume=0.16[bed];` +
      `[bed][2:a]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95,` +
      `aformat=channel_layouts=stereo[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-t', String(total), gotowy,
  ]);
  console.log(`[grafika] ПРОБА готова: ${gotowy}`);
  process.exit(0);
}

await ffmpeg([
  '-i', wideo, '-i', glos.plik, '-i', muzyka, '-i', stuki,
  '-f', 'lavfi', '-i', `anoisesrc=c=brown:a=0.02:r=48000:d=${total}`,
  '-filter_complex',
  `[1:a]highpass=f=85,equalizer=f=2400:t=q:w=1.2:g=2,` +
    `acompressor=threshold=-20dB:ratio=4:attack=6:release=140:makeup=3,` +
    `loudnorm=I=-15:TP=-1.5:LRA=3[voice];` +
    `[2:a]atrim=0:${total},asetpts=N/SR/TB,volume=0.11,afade=t=in:st=0:d=0.12,` +
    `afade=t=out:st=${Math.max(0, total - 1.4).toFixed(2)}:d=1.4[bed];` +
    `[voice]asplit=2[v1][duck];` +
    `[bed][duck]sidechaincompress=threshold=0.02:ratio=11:attack=10:release=170:makeup=1:level_sc=1[bedDuck];` +
    `[v1][bedDuck][3:a][4:a]amix=inputs=4:normalize=0:duration=longest,` +
    `alimiter=limit=0.95,aformat=channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-t', String(total), gotowy,
]);

const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', gotowy,
]);
const inf = JSON.parse(stdout).format;
console.log(`[grafika] собрано: ${gotowy} · ${(+inf.duration).toFixed(2)} с · ${(inf.size / 1048576).toFixed(2)} МБ`);

const kontrola = await sprawdzRolke(gotowy, { oczekiwanePrzejscia: zdarzenia.map((z) => z.t) });
console.log('[grafika] проверка:', JSON.stringify(kontrola, null, 1));
