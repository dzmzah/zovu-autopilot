// Собирает рисованный рилс целиком: голос, сцены, камера, звуки, музыка.
//
//   node rolka-grafika.mjs                      — следующий сценарий по кругу
//   node rolka-grafika.mjs --scenariusz=rytm    — конкретный
//   node rolka-grafika.mjs --bez-glosu          — проба картинки, голос не тратим
//
// Сами сценарии лежат в `scenariusze-grafika.mjs`. Здесь только сборка: до
// 18.08 сценарий был вшит в этот файл, и второй ролик требовал его переписать.
//
import { mkdir, writeFile, readFile, rm, readdir, copyFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { zbudujGlos } from './glos.mjs';
import { sprawdzRolke } from './kontrola.mjs';
import { grafikaHtml, renderujKlatki, wczytajObiekty, W, H, FPS } from './grafika.mjs';
import { wybierzScenariusz } from './scenariusze-grafika.mjs';
import { historiaScenariuszy } from './historia-scenariuszy.mjs';
import { wybierzWejscie } from './dzwiek.mjs';
import { podmienHasztagi } from './tagi.mjs';
import { zbudujPodklad } from './wedacy.mjs';
import { SCENARIUSZE_WEDACY } from './scenariusze-wedacy.mjs';
import { DEMA } from './scenariusze-demo.mjs';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ── какой ролик снимаем ───────────────────────────────────────────
// Сценарий и вся хореография под него живут в scenariusze-grafika.mjs.
// Здесь только выбор: ключом из аргумента или по кругу, чтобы лента
// перебирала все сценарии, а не крутила один и тот же.
const KLUCZ = (process.argv.find((a) => a.startsWith('--scenariusz=')) || '').split('=')[1] || '';
const stanPlik = path.join(DIR, 'rolki', 'stan.json');
let stan = {};
try { stan = JSON.parse(await readFile(stanPlik, 'utf8')); } catch { stan = {}; }
// Демо для клиентов лежат отдельно и в ротацию НЕ входят: чужой ролик с чужим
// призывом, попавший в наш перебор, вышел бы на аккаунте ZOVU как наш пост.
// Поэтому сначала ищем среди демо и только по явному ключу.
// Какие мысли уже стоят в очереди. Читаем ДО сборки: узнавать об этом
// после — значит узнавать, потратив голос и двадцать минут.
async function zajeteScenariusze() {
  try {
    const k = JSON.parse(await readFile(path.join(DIR, 'rolki', 'kolejka.json'), 'utf8'));
    // Ключ берём и из паспорта, и из имени исходника: очередь считает
    // повтором именно ИМЯ ФАЙЛА (auto-grafika-<ключ>.mp4), а паспорт у
    // старых записей может отсутствовать.
    const klucze = [];
    for (const p of k) {
      if (p.opublikowano) continue;
      if (p.scenariusz) klucze.push(p.scenariusz);
      const m = /^auto-grafika-(.+?).mp4$/.exec(p.zrodlo || '');
      if (m) klucze.push(m[1]);
    }
    return klucze;
  } catch {
    return [];
  }
}

const demo = KLUCZ ? DEMA.find((d) => d.klucz === KLUCZ) : null;
// Сценарии с ведущим лежат отдельным банком: у них другая раскладка кадра
// (центр занят лицом) и другая длина. В общую ротацию рисованных они не
// входят — их выбирают только явным ключом.
const zWedacym = KLUCZ ? SCENARIUSZE_WEDACY.find((d) => d.klucz === KLUCZ) : null;
const { scenariusz, idx: idxScen } = demo
  ? { scenariusz: demo, idx: null }
  : zWedacym
    ? { scenariusz: zWedacym, idx: null }
    : wybierzScenariusz(KLUCZ, stan, await zajeteScenariusze(), await historiaScenariuszy(DIR));
if (idxScen !== null) stan.grafikaScen = idxScen;
console.log(`[grafika] сценарий «${scenariusz.klucz}»: ${scenariusz.nazwa}`);

const FRAZY = scenariusz.frazy;

// ── пауза внутри фразы ────────────────────────────────────────────
// Правило выведено из замеров, а не из головы. Три дубля подряд:
//
//   · «odpowiedz» без внутренних точек — 4 торопливых фразы из 8, до 7,1 слог/с;
//   · тот же текст, переписанный длиннее, но всё ещё без точек — снова 4 из 8;
//   · тот же текст с точкой ВНУТРИ каждой фразы — 3,9-5,3, ноль торопливых.
//
// А в демо Museo разделение вышло идеально чистым: все четыре фразы с точкой
// внутри легли в норму (3,4 / 4,9 / 4,3 / 3,7), все четыре без точки — за
// планку (5,6 / 5,6 / 6,1 / 6,4). Длина фразы при этом ни на что не влияла.
//
// Объяснение простое: на точке модель делает НАСТОЯЩУЮ паузу, пауза входит в
// длительность фразы, и темп падает сам — без единого фильтра. Ровный поток
// слов без знаков препинания она проговаривает скороговоркой независимо от
// того, четыре в нём слога или четырнадцать.
//
// Ругаемся предупреждением, а не падением: правило эвристическое, и бывает
// фраза, которую точка испортит. Но молчать нельзя — иначе про него забудут
// ровно так же, как забыли в первый раз.
const bezPauzy = FRAZY
  .map((f, i) => ({ i, tekst: f.tekst }))
  .filter((f) => !/[.?!…;:—]\s+\S/.test(f.tekst.trim().replace(/[.?!…]+$/, '')));
if (bezPauzy.length) {
  console.warn(
    `[grafika] без паузы внутри: ${bezPauzy.length} фраз(ы) из ${FRAZY.length} — ` +
      'модель их обычно гонит. ' +
      bezPauzy.map((f) => `#${f.i} «${f.tekst}»`).join('; ')
  );
}

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

// Готовый голос снаружи. Нужен там, где дубль уже использован раньше по
// конвейеру — например под него пересобраны губы ведущего. Синтезировать
// заново нельзя: новый дубль всегда чуть другой, и губы разойдутся.
const GOTOWY_GLOS = (process.argv.find((a) => a.startsWith('--glos=')) || '').split('=')[1] || '';
const glos = GOTOWY_GLOS
  ? (() => {
      const p = path.isAbsolute(GOTOWY_GLOS) ? GOTOWY_GLOS : path.join(DIR, GOTOWY_GLOS);
      const g = JSON.parse(readFileSync(p, 'utf8'));
      // Путь к дорожке кладём рядом: он нужен и для замера длины, и для
      // сведения. В json его не пишем — при переносе между машинами он врёт.
      g.plik = g.plik || path.join(path.dirname(p), 'glos.wav');
      return g;
    })()
  : BEZ_GLOSU
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

// ── хореография под голос ─────────────────────────────────────────
// Сцены, ценник, формула, счётчики, камера и цветовые акценты приходят из
// сценария готовыми — им нужны только тайминги живого дубля. Правило внутри
// у всех одно: объект приходит под свою фразу и УХОДИТ, когда мысль
// сменилась, иначе кадр к финалу стоит неподвижной кучей.
const { scena, metki, wzor, liczniki, kamera, akcenty } = scenariusz.buduj({ t, total });

// ── подсветка слов ───────────────────────────────────────────────
// Цветной акцент ищет ТОЧНУЮ форму слова. Стоит переписать фразу — и слово из
// списка перестаёт встречаться, а подсветка тихо не срабатывает: на экране
// ничего не ломается, просто пропадает смысловой цвет. Так уже случилось
// дважды за одну ночь («spóźniona» после правки хука, «bezpłatnie» в демо).
// Молчаливая потеря хуже падения, поэтому ругаемся вслух.
{
  const slowaFraz = new Set(
    FRAZY.flatMap((f) => f.tekst.toLowerCase().replace(/[.,?!…;:—]/g, '').split(/\s+/))
  );
  const martwe = [...(akcenty.zolty || []), ...(akcenty.czerwony || [])].filter(
    (w) => !slowaFraz.has(w)
  );
  if (martwe.length) {
    console.warn(
      `[grafika] подсветка в никуда: ${martwe.join(', ')} — этих слов в тексте нет, цвет не сработает`
    );
  }
}

// Счётчику даём ДВЕ подписи: `tekst` человеку в сообщение об ошибке и
// `naEkranie` — то, что реально нарисовано. Ширину считаем по второй, иначе
// служебная строка «счётчик до 600» мерялась как двухстрочная и проверка
// начинала ругаться на здоровую вёрстку.
const teksty = [
  ...wzor,
  ...liczniki.map((l) => ({
    ...l,
    duzy: true,
    tekst: `счётчик до ${l.do}`,
    naEkranie: `${l.do}${l.jednostka || ''}`,
  })),
];
for (let i = 0; i < teksty.length; i++) {
  for (let j = i + 1; j < teksty.length; j++) {
    const a = teksty[i];
    const b = teksty[j];
    const razem = Math.min(a.b ?? 1e9, b.b ?? 1e9) - Math.max(a.a, b.a);
    const odstep = Math.abs(a.y - b.y);
    // Меряем ПРЯМОУГОЛЬНИКАМИ, а не расстоянием между центрами. И строки, и
    // счётчик позиционируются по ВЕРХНЕМУ краю (`style.top = y`), поэтому
    // прежняя формула «половина одной высоты плюс половина другой» описывала
    // не ту геометрию, что на экране: для строки на y940 она требовала зазор
    // от центра, которого у неё нет.
    //
    // Плюс учитываем ПЕРЕНОС. Проверка считала любую строку однострочной и
    // поэтому пропустила «1 ZDJĘCIE = 1 HISTORIA»: двадцать два знака в 76
    // пунктах Archivo Black по ширине кадра не влезли, строка перенеслась, и
    // её вторая половина встала в двадцати пикселях над счётчиком. Формально
    // это не наложение — но читается как наложение, а нам важно второе.
    const kegl = (x) => (x.maly ? 76 : x.duzy ? 136 : 118);
    const interlinia = (x) => (x.duzy ? 1.0 : 1.05); // .licznik 1, .wiersz 1.05
    const wysokosc = (x) => {
      const k = kegl(x);
      // Полоса текста: кадр минус отступы (.wiersz 60 px, .licznik 40 px).
      // Средняя ширина знака Archivo Black с плотным трекингом — ~0,58 кегля.
      const zmiesci = Math.max(1, Math.floor((W - (x.duzy ? 80 : 120)) / (k * 0.58)));
      const napis = String(x.naEkranie ?? x.tekst ?? '');
      return k * interlinia(x) * Math.max(1, Math.ceil(napis.length / zmiesci));
    };
    // Воздух между блоками. Ноль означал бы «можно вплотную» — а вплотную это
    // и есть тот кадр, который пришлось переделывать.
    const POWIETRZE = 28;
    const gora = (x) => x.y;
    const dol = (x) => x.y + wysokosc(x);
    const luka = Math.max(gora(a), gora(b)) - Math.min(dol(a), dol(b));
    if (razem > 0 && luka < POWIETRZE) {
      throw new Error(
        `[grafika] тексты стоят вплотную: «${a.tekst}» (y${a.y}, высота ` +
          `${Math.round(wysokosc(a))}) и «${b.tekst}» (y${b.y}, высота ` +
          `${Math.round(wysokosc(b))}) видны вместе ${razem.toFixed(2)} с, ` +
          `между ними ${Math.round(luka)} px, нужно минимум ${POWIETRZE}`
      );
    }
  }
}

const obrazki = await wczytajObiekty([...new Set(scena.map((o) => o.obiekt).filter(Boolean))]);

// ── живое видео для карточек ──────────────────────────────────────
// Готовим отдельно и в WebM. Браузер, которым мы снимаем кадры, собран без
// проприетарных кодеков: H.264 из `broll/` он не декодирует и показывает
// чёрный прямоугольник — молча, без ошибки. VP9 открытый, его понимает
// любая сборка.
//
// Заодно режем до нужного куска и до размера карточки: полноразмерный клип
// в окне 300 px — это лишняя работа декодера на каждом из тысячи кадров.
// Папка вывода создаётся ЗДЕСЬ, а не там, где до неё дойдут руки. На моей
// машине out/ существует с прошлых сборок, и всё работало; на чистом
// сервере первый же ffmpeg падал на «No such file or directory», и ни один
// сценарий не собирался. Ошибка при этом была про кодек, а не про папку.
await mkdir(OUT, { recursive: true });

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
      // Частота ОБЯЗАНА совпадать с частотой ролика. При 25 к/с внутри
      // 50-кадрового ролика браузер отдаёт один и тот же кадр видео дважды
      // подряд: карточка дёргается, и на глаз весь ролик кажется лагающим,
      // хотя графика вокруг идёт честные 50.
      `crop=${(o.skala || 300) * 2}:${(o.wys || 470) * 2},fps=${FPS}`,
    '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-deadline', 'good', '-cpu-used', '4',
    cel,
  ]);
  filmy[o.film] = 'file:///' + cel.replace(/\\/g, '/');
  console.log(`[grafika] живое видео: ${o.film} → ${path.basename(cel)}`);
}
const scenaZFilmami = scena.map((o) => (o.film ? { ...o, film: filmy[o.film] } : o));
// Папка кадров — своя на каждый сценарий. Общая означала, что два сборщика
// нельзя запустить одновременно: второй чистил папку под первым, и тот
// доснимал кадры в пустоту. Падало бы это не сразу и невнятно — на склейке,
// где ffmpeg просто не находит части кадров.
const katKlatek = path.join(OUT, `grafika-klatki-${scenariusz.klucz}`);
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
// Берём ГОТОВЫЕ полотна из `tlo/gotowe/` — их собирает `tlo-normalizuj.mjs`
// один раз, руками. Там уже отобрано и приведено к 50 к/с.
//
// Так вышло потому, что чинить фон при сборке оказалось нечем: у половины
// исходных полотен дёрганье вшито в сам файл, там лежат повторяющиеся кадры
// (у `papier-6` их 76 %, у `papier-4` — 72 %). Фильтр не восстановит того,
// чего нет. А полотно выбиралось по кругу, и ролик выходил «то нормально,
// то лагает» — Захар видел это три раза подряд, пока я правил не то.
//
// Отбор и приведение делаются заранее и один раз. Сборка просто берёт файл.
const KAT_TLA = existsSync(path.join(DIR, 'tlo', 'gotowe'))
  ? path.join(DIR, 'tlo', 'gotowe')
  : path.join(DIR, 'tlo');
const TLA = readdirSync(KAT_TLA).filter((f) => f.endsWith('.mp4')).sort();
const idxTla = ((stan.tloGrafika ?? -1) + 1) % TLA.length;
stan.tloGrafika = idxTla;

// Режим с ведущим: вместо полотна под сценой живой человек.
//
// Это тот же конвейер, только фоном идёт лицо. Отсюда три отличия, и все
// три обязательны: подложку нельзя размывать и таскать дрейфом (человек —
// не текстура, он предмет съёмки), её нельзя зацикливать бесконечно (лицо
// повторится и это видно), и на каждом резе между клипами обязана стоять
// врезка.
const Z_WEDACYM = process.argv.includes('--wedacy');
// Готовая подложка снаружи. Пересборка губ идёт отдельным шагом (python на
// сервере), и собирать её здесь нечем — сюда приходит уже готовый файл.
const GOTOWY_PODKLAD = (process.argv.find((a) => a.startsWith('--podklad=')) || '').split('=')[1] || '';
let cieciaWedacego = [];

let TLO;
if (GOTOWY_PODKLAD) {
  TLO = path.isAbsolute(GOTOWY_PODKLAD) ? GOTOWY_PODKLAD : path.join(DIR, GOTOWY_PODKLAD);
  const meta = TLO.replace(/.mp4$/, '-ciecia.json');
  if (existsSync(meta)) cieciaWedacego = JSON.parse(readFileSync(meta, 'utf8'));
} else if (Z_WEDACYM) {
  const p = await zbudujPodklad(total, { klatki: FPS });
  TLO = p.plik;
  cieciaWedacego = p.ciecia;
} else {
  TLO = process.env.TLO_WIDEO || path.join(KAT_TLA, TLA[idxTla] || '');
}
const jestTlo = existsSync(TLO);
console.log(`[grafika] фон: ${jestTlo ? path.basename(TLO) : 'нет, будет чёрный'}${Z_WEDACYM ? ' (ведущий)' : ''}`);

// Замедлять и достраивать кадры на лету больше не нужно: полотна приходят
// готовыми. Три подхода к этому ушли в мусор — доля повторов, размер скачка,
// достройка кадров при сборке — и каждый раз чинился симптом. Лечение
// оказалось в отборе исходников, а не в фильтре.
const tempoTla = 1;

const wideo = path.join(OUT, 'grafika-nieme.mp4');
await ffmpeg(
  jestTlo
    ? [
        '-stream_loop', '-1', '-i', TLO,
        '-framerate', String(FPS), '-i', path.join(katKlatek, 'f%05d.png'),
        '-filter_complex',
        // Полотно берём с запасом в 12%, чтобы дрейф не обнажал край кадра.
        ((Z_WEDACYM || GOTOWY_PODKLAD)
          ? // Лицо не размываем и не возим по кадру: это предмет съёмки, а не
            // текстура. Медленный наезд оставляем — статичный кадр мёртв.
            `[0:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,` +
            `crop=${W}:${H},zoompan=z='min(1.06,1+0.06*on/${Math.round(FPS * total)})':` +
            `d=1:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':s=${W}x${H}:fps=${FPS}[tlo];`
          : `[0:v]setpts=${tempoTla}*PTS,fps=${FPS},` +
            `scale=${Math.round(W * 1.12)}:${Math.round(H * 1.12)}:force_original_aspect_ratio=increase,` +
            `crop=${W}:${H}:'(iw-ow)/2+sin(n/${FPS * 9})*${Math.round(W * 0.045)}':` +
            `'(ih-oh)/2+cos(n/${FPS * 13})*${Math.round(H * 0.02)}',` +
            `gblur=sigma=${ROZMYCIE},eq=contrast=0.80:brightness=0.03:saturation=1.05[tlo];`) +
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
// Захар про готовый ролик: «звуковых эффектов вообще нет, один вуш на всё».
// И правда: семплов было два — свист на влёт и щелчок на уход, оба всегда
// одинаковые. Двадцать одинаковых свистов подряд ухо перестаёт слышать уже
// на пятой секунде.
//
// Теперь пять голосов: свист вверх (приход), свист вниз (уход), щелчок,
// удар с низом (расплата и ценник) и разгон перед ней. Плюс разброс高
// высоты по номеру события — два соседних свиста больше не близнецы.
const swist = path.join(OUT, 'g-swist.wav');
const swistDol = path.join(OUT, 'g-swist-dol.wav');
const puk = path.join(OUT, 'g-puk.wav');
const bum = path.join(OUT, 'g-bum.wav');
const rozped = path.join(OUT, 'g-rozped.wav');

// Приход: шум с подъёмом полосы — «влетело».
// Свист двумя слоями: шум-воздух даёт скорость, синус 78 Гц — вес. Один
// воздух звучит как «пшш» из телефона, один низ — как удар без движения.
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.26:c=white:a=0.7:r=48000',
  '-f', 'lavfi', '-i', 'sine=f=78:d=0.26:r=48000',
  '-filter_complex',
  '[0:a]highpass=f=1800,lowpass=f=6200,afade=t=in:st=0:d=0.06,afade=t=out:st=0.07:d=0.18,' +
    'volume=0.46[powietrze];' +
    '[1:a]afade=t=in:st=0:d=0.05,afade=t=out:st=0.08:d=0.17,volume=0.30[nisko];' +
    '[powietrze][nisko]amix=inputs=2:normalize=0,volume=0.9,aformat=channel_layouts=stereo[a]',
  '-map', '[a]', '-ac', '2', '-ar', '48000', swist,
]);

// Разброс высоты: два соседних свиста не должны быть близнецами.
const swistWyzej = path.join(OUT, 'g-swist-w.wav');
const swistNizej = path.join(OUT, 'g-swist-n.wav');
await ffmpeg(['-i', swist, '-af', 'asetrate=48000*1.10,aresample=48000,volume=0.95', swistWyzej]);
await ffmpeg(['-i', swist, '-af', 'asetrate=48000*0.92,aresample=48000,volume=1.0', swistNizej]);

// Тихий щелчок для мелких движений: сильный звук на каждое движение — та
// самая ошибка, после которой ухо перестаёт замечать звук вообще.
const stuk = path.join(OUT, 'g-stuk.wav');
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.05:c=white:a=0.5:r=48000',
  '-af', 'highpass=f=1500,lowpass=f=7000,afade=t=out:st=0.003:d=0.045,volume=0.22,' +
    'aformat=channel_layouts=stereo',
  '-ac', '2', '-ar', '48000', stuk,
]);

// Уход: тот же шум, но темнее и короче — «ушло за край».
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.20:c=white:a=0.6:r=48000',
  '-af', 'highpass=f=200,lowpass=f=2200,afade=t=in:st=0:d=0.03,afade=t=out:st=0.04:d=0.16,' +
    'volume=0.42,aformat=channel_layouts=stereo',
  '-ac', '2', '-ar', '48000', swistDol,
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

// Удар: низкая синусоида с быстрым спадом плюс щелчок сверху. Это то, чего
// в ролике не хватало совсем — веса в момент, когда встаёт главная цифра.
await ffmpeg([
  '-f', 'lavfi', '-i', 'sine=f=62:d=0.45:r=48000',
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.5:r=48000',
  '-filter_complex',
  '[0:a]afade=t=out:st=0.03:d=0.42,volume=0.9[b];' +
    '[1:a]highpass=f=1200,afade=t=out:st=0:d=0.06,volume=0.3[k];' +
    '[b][k]amix=inputs=2:normalize=0,volume=0.55,aformat=channel_layouts=stereo[a]',
  '-map', '[a]', '-ac', '2', '-ar', '48000', bum,
]);

// Разгон: шум с растущей полосой, 0,7 с перед ударом. Он и создаёт то самое
// ожидание, ради которого досматривают до цифры.
await ffmpeg([
  '-f', 'lavfi', '-i', 'anoisesrc=d=0.70:c=white:a=0.5:r=48000',
  '-af', 'highpass=f=300,lowpass=f=5200,afade=t=in:st=0:d=0.60,volume=0.34,' +
    'aformat=channel_layouts=stereo',
  '-ac', '2', '-ar', '48000', rozped,
]);

const PLIKI = { swist, swistW: swistWyzej, swistN: swistNizej, swistDol, puk, stuk, bum, rozped };

// Живые семплы из личного пака Захара. Синтезированный шум честно делает своё
// дело, но записанный звук всегда богаче: у него есть тело, хвост и характер,
// которых у lavfi нет. Поэтому если файл лежит в dzwieki/ — играем его, если
// папка пуста — остаётся синтез, и сборка не падает.
const KAT_DZWIEKOW = path.join(DIR, 'dzwieki');
const ZYWE = {
  swist: ['przylot-1.mp3', 'przylot-2.mp3', 'przylot-3.mp3'],
  swistW: ['przylot-3.mp3', 'przylot-1.mp3'],
  swistN: ['przylot-2.mp3', 'przylot-3.mp3'],
  swistDol: ['odlot-1.mp3', 'odlot-2.mp3'],
  stuk: ['klik-1.mp3', 'klik-2.mp3'],
  puk: ['klik-2.mp3', 'klik-1.mp3'],
  bum: ['uderzenie-1.mp3', 'uderzenie-2.mp3'],
  rozped: ['rozped-1.mp3'],
  kasa: ['kasa-1.mp3'],
};
const licznikiZywych = {};
function dzwiekDla(typ) {
  const lista = (ZYWE[typ] || []).map((n) => path.join(KAT_DZWIEKOW, n)).filter((p) => existsSync(p));
  if (lista.length) {
    // По кругу, а не всегда первый: два одинаковых семпла подряд слышны как
    // копипаста — то же правило, что и с разбросом высоты у синтеза.
    const n = (licznikiZywych[typ] = (licznikiZywych[typ] ?? -1) + 1);
    return lista[n % lista.length];
  }
  return PLIKI[typ] || puk;
}

// Крупный предмет въезжает со свистом, мелкий — со щелчком. Раньше свистело
// всё подряд, и к пятой секунде свист переставал что-либо значить.
const KROK_SWISTU = ['swist', 'swistW', 'swistN'];
let nrSwistu = 0;
const swistPoKolei = () => KROK_SWISTU[nrSwistu++ % KROK_SWISTU.length];

const zdarzenia = [
  ...scena.map((o) => ({
    t: +o.start,
    typ: (o.skala ?? 600) >= 640 || o.film ? swistPoKolei() : 'stuk',
  })),
  ...scena.filter((o) => o.koniec).map((o) => ({ t: +o.koniec, typ: 'swistDol' })),
  ...wzor.map((w) => ({ t: +w.a, typ: 'puk' })),
  ...liczniki.flatMap((l) => [
    { t: +l.a, typ: 'stuk' },
    { t: +(l.kres ?? l.a + (l.czas ?? 1.1)).toFixed(2), typ: 'puk' },
  ]),
  // Ценник — главный кадр ролика: разгон копит ожидание, удар разряжает.
  ...metki.flatMap((m) => [
    { t: +Math.max(0, m.a - 0.7).toFixed(2), typ: 'rozped' },
    { t: +(m.a + (m.czas ?? 1.1)).toFixed(2), typ: 'bum' },
    { t: +(m.a + (m.czas ?? 1.1) + 0.06).toFixed(2), typ: 'kasa' },
  ]),
].sort((a, b) => a.t - b.t);
console.log(`[grafika] звуковых событий: ${zdarzenia.length} (${(zdarzenia.length / total).toFixed(1)} на секунду)`);

const wejscia = [];
const czesci = [];
zdarzenia.forEach((z, i) => {
  wejscia.push('-i', dzwiekDla(z.typ));
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

// Кусок трека выбирается по ХУДШЕЙ секунде, а не по средней.
//
// Захар за один вечер поймал два случая, и оба прошли проверку: в одном
// ролике голос кончился и дальше «ничего не слышно» (две секунды −38 дБ при
// средней −18), в другом «музыки нет вообще» (самый тихий трек библиотеки,
// −19,7 дБ, без выравнивания). Средняя обе дырки спрятала.
const dlTracku = await (async () => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', muzyka,
    ]);
    return parseFloat(stdout.trim());
  } catch { return 0; }
})();

const wybor = await wybierzWejscie(
  muzyka,
  [0, 27, 54, 81],
  total,
  dlTracku,
  [0, 27, 54, 81][(stan.grafikaScen ?? 0) % 4]
);

const muzykaOd = wybor ? wybor.od : 0;
const korektaMuz = wybor ? Math.max(-9, Math.min(9, -13 - wybor.srednia)) : 0;
if (wybor) {
  console.log(
    `[grafika] подложка с ${wybor.od} с · средняя ${wybor.srednia.toFixed(1)} дБ · ` +
      `худшая секунда ${wybor.min.toFixed(1)} дБ · правка ${korektaMuz > 0 ? '+' : ''}${korektaMuz.toFixed(1)} дБ`
  );
  if (wybor.min < -40) {
    console.warn('[grafika] ВНИМАНИЕ: в подложке есть тихое место — проверь хвост ролика');
  }
}
const WEJ_MUZYKA = muzykaOd > 0 ? ['-ss', String(muzykaOd), '-i', muzyka] : ['-i', muzyka];

// Длины вслух. В ролике 21.08 дыра в хвосте пережила замену музыки, а
// значит дело было не в подложке — но понять, КТО короче ролика, по логу
// было нельзя: ни одна длина в него не попадала. Теперь попадают все три.
// Момент последнего слова: по нему поднимается подложка. Берём меньшее из
// посчитанной речи и реальной длины дорожки — если дорожка короче, ролик
// молчит уже с неё, и ждать «посчитанного» конца незачем.
let koniecMowy = +glos.dlugosc;
const dlGlosu = await (async () => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', glos.plik,
    ]);
    return parseFloat(stdout.trim());
  } catch { return 0; }
})();
console.log(
  `[grafika] длины: ролик ${total} с · дорожка голоса ${dlGlosu.toFixed(2)} с · посчитанная речь ${(+glos.dlugosc).toFixed(2)} с`
);
if (dlGlosu) koniecMowy = Math.min(koniecMowy, dlGlosu);
if (dlGlosu && dlGlosu < total - 0.8) {
  console.warn(
    `[grafika] ВНИМАНИЕ: дорожка голоса короче ролика на ${(total - dlGlosu).toFixed(2)} с — ` +
      'хвост будет держать только подложка'
  );
}
const POPRAW = `volume=${korektaMuz.toFixed(2)}dB,`;

// ── сведение ──────────────────────────────────────────────────────
// Голос жмём плотнее, чем раньше. Замер по роликам Захара: у него дорожка
// идёт с динамикой LRA 2.5-3.5, у нас было 4.8. Именно эта плотность и
// читается как «дикторский» звук: ровный, близкий, без провалов.
// Имя по ключу сценария, а не одно на всех: три ролика в одной папке иначе
// перезаписывают друг друга, и в артефакт уходит только последний.
// Проба помечается отдельно — её нельзя спутать с роликом, где есть голос.
const gotowy = path.join(OUT, `auto-grafika-${scenariusz.klucz}${BEZ_GLOSU ? '-proba' : ''}.mp4`);
// На пробе голоса нет — сводить нечего. Картинку, щелчки и музыку кладём
// как есть: этого хватает, чтобы судить о движении и ритме.
if (BEZ_GLOSU) {
  await ffmpeg([
    '-i', wideo, ...WEJ_MUZYKA, '-i', stuki,
    '-filter_complex',
    `[1:a]atrim=0:${total},asetpts=N/SR/TB,${POPRAW}volume=0.16[bed];` +
      `[bed][2:a]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95,` +
      `aformat=channel_layouts=stereo[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-t', String(total), gotowy,
  ]);
  console.log(`[grafika] ПРОБА готова: ${gotowy}`);
  process.exit(0);
}

// Голос отдельным проходом. Цепь та же, что была внутри сведения, слово в
// слово — меняется только место, где она выполняется.
const glosGotowy = path.join(OUT, 'g-glos-gotowy.wav');
await ffmpeg([
  '-i', glos.plik,
  '-af',
  'highpass=f=90,equalizer=f=320:t=q:w=1.2:g=-2,' +
    'equalizer=f=3800:t=q:w=0.8:g=3,treble=g=1.5:f=11000:width_type=q:w=0.7,' +
    'acompressor=threshold=-19dB:ratio=3:attack=12:release=160:makeup=2,' +
    'loudnorm=I=-14.5:TP=-1.5:LRA=5,aformat=channel_layouts=stereo',
  '-ar', '48000', '-ac', '2', glosGotowy,
]);
const dlGotowego = await (async () => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', glosGotowy,
    ]);
    return parseFloat(stdout.trim());
  } catch { return 0; }
})();
console.log(`[grafika] голос обработан отдельно: ${dlGotowego.toFixed(2)} с (исходник ${dlGlosu.toFixed(2)} с)`);
if (dlGotowego && dlGlosu && dlGotowego < dlGlosu - 0.25) {
  console.warn(
    `[grafika] ВНИМАНИЕ: обработка укоротила голос на ${(dlGlosu - dlGotowego).toFixed(2)} с — ` +
      'последние слова потеряны ещё до сведения'
  );
}

await ffmpeg([
  '-i', wideo, '-i', glosGotowy, ...WEJ_MUZYKA, '-i', stuki,
  '-f', 'lavfi', '-i', `anoisesrc=c=brown:a=0.02:r=48000:d=${total}`,
  // Дорожка голоса ВТОРОЙ раз, отдельным входом. Она нужна боковой цепи как
  // ключ, и раньше её брали через asplit из той же ветки, что идёт в микс.
  //
  // Замер показал, чем это кончается: последняя фраза «Napisz SESJA…»
  // пропала из готового ролика, хотя в самой дорожке она есть и после всей
  // обработки звучит на −18 дБ. Тот же микс, собранный у меня на машине из
  // того же файла, фразу сохраняет. Разошлись только сборки ffmpeg — на
  // сервере ветки asplit разбираются с разной скоростью, и данные теряются.
  // Второй вход снимает вопрос целиком: ветки больше не связаны.
  '-i', glosGotowy,
  '-filter_complex',
  // Голос. Прежняя цепь сама делала его «искусственным», и слышно это было
  // ровно в трёх местах:
  //   • подъём +2 дБ на 2,4 кГц — зона резкости. Он добавлял ту стеклянную
  //     жёсткость, по которой синтез узнают с первой фразы;
  //   • атака компрессора 6 мс срезала начало каждого согласного — из речи
  //     уходил призвук живого рта;
  //   • loudnorm с LRA=3 ровнял громкость почти в полку. Голос переставал
  //     дышать: одинаково громкие ударные и безударные — это машина.
  // Лечим прицельно: муть на 320 Гц срезаем, присутствие на 3,8 кГц
  // немного груди на 210 Гц и воздуха сверху, компрессия мягкая и с медленной
  // атакой, диапазон живой. Плюс общий уровень тише — голос перестаёт
  // упираться в потолок и оставляет место музыке.
  // Голос приходит уже обработанным, здесь его только тянем до конца
  // ролика: короткая дорожка не должна обрывать микс.
  `[1:a]apad=whole_dur=${total}[voice];` +
    // Подложка громче и БЕЗ длинного затухания в конце.
    //
    // Замер: разброс громкости у нас 8,1 LU против 2,2 у «Scenariusz 1».
    // Компрессия шину не спасала — она снимала едва 1 LU, потому что дело не
    // в пиках. Дело в хвосте: на двенадцатой секунде дорожка проваливалась до
    // −29 dB, пока у образца там ровные −18. Полуторасекундное затухание
    // оставляло ролик заканчиваться тишиной, а рилс в ленте крутится по
    // кругу — эта тишина попадала ровно на стык петли.
    //
    // Уровень 0,28, а не 0,11 как было. После починки обрыва хвост поднялся
    // с −50 до −29 dB, но у «Scenariusz 1» в том же месте −18: там подложка
    // просто ГРОМЧЕ. Бояться её нечего — под голосом её убирает боковая
    // цепь, а звучит она только там, где иначе была бы дыра.
    // Уровень 0,18. Пробовали 0,42 — Захар послушал готовый ролик и сказал
    // прямо: музыка громко. Под неё уходила речь, потому что кроме музыки в
    // миксе есть ещё щелчки на каждое движение, а их в ролике два десятка.
    // Подложка держит тон и заполняет паузы, но спорить с голосом не должна.
    // Подложка выходит вперёд, когда голос замолчал. В стоковых роликах
    // так с самого начала, в рисованных не было — и хвост держался на
    // одной боковой цепи. Стоило голосу кончиться раньше, чем ждёт ролик,
    // как последние секунды проваливались почти в тишину: Захар услышал
    // это как «голос оборвался и дальше ничего».
    //
    // Подъём начинается ПОСЛЕ последнего слова и тянется секунду —
    // раньше нельзя, иначе музыка наедет на конец фразы.
    // Базовый уровень 0,21. Было 0,18 — в паузах проваливалось; подняли до
    // 0,30 — Захар послушал и сказал: музыка перекрывает голос, тише на
    // тридцать процентов. 0,30 × 0,7 = 0,21. Это всё ещё выше прежних 0,18,
    // то есть паузы держатся, но под речью музыка снова уходит назад.
    //
    // Считать надо не по цифре в фильтре, а
    // по тому, что слышно: боковая цепь снимает под речью около семи
    // децибел, и под голосом остаётся те самые 0,13-0,15 — уровень, который
    // Захар слушал и утвердил. Зато в паузах подложка теперь 0,30 вместо
    // 0,18, и пауза перестаёт быть провалом.
    //
    // Замер того ролика: медиана −18,6 дБ, а пауза на 15-16 с −35. Семнадцать
    // децибел под медианой на телефоне это тишина, сколько бы формально там
    // ни было сигнала.
    `[2:a]atrim=0:${total},asetpts=N/SR/TB,${POPRAW}` +
    `volume='0.21+0.09*min(1,max(0,(t-${Math.max(0, koniecMowy).toFixed(2)})/0.45))':eval=frame,` +
    `afade=t=in:st=0:d=0.12,` +
    `afade=t=out:st=${Math.max(0, total - 0.12).toFixed(2)}:d=0.12[bed];` +
    // Ключ боковой цепи ОБЯЗАН тянуться до конца ролика. `sidechaincompress`
    // выдаёт ровно столько, сколько идёт КОРОЧЕ из двух его входов: как
    // только кончается голос, обрывается и подложка. Отсюда цифровая тишина
    // в хвосте каждого нашего ролика — не затухание, а обрыв. Замер: −50 dB
    // на последних двух секундах, у образца там ровные −18.
    // Ключу обработка не нужна — он только говорит цепи, когда молчать.
    `[5:a]apad=whole_dur=${total}[duck];` +
    // Приглушение подложки под голосом ослаблено с 11 к 1 до 6 к 1. При
    // прежней хватке подложка в паузах не успевала вернуться, и между
    // фразами получались те же провалы, только короткие.
    // Под голосом подложка отступает уверенно (6 к 1), а возвращается за
    // четверть секунды — так речь всегда сверху, но в паузах тишины нет.
    // Порог 0,08, а не 0,03. Замер синтетической проверкой: при 0,03 цепь
    // держит подложку прижатой и там, где речи уже нет, — душит её всё,
    // что выше −30 дБ, включая остаток дорожки между фразами. Речь у нас
    // идёт на −14,5 LUFS, ей порога 0,08 хватает с запасом.
    `[bed][duck]sidechaincompress=threshold=0.08:ratio=6:attack=12:release=350:makeup=1:level_sc=1[bedDuck];` +
    `[voice][bedDuck][3:a][4:a]amix=inputs=4:normalize=0:duration=longest,` +
    `alimiter=limit=0.9,aformat=channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-t', String(total), gotowy,
]);

const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', gotowy,
]);
const inf = JSON.parse(stdout).format;
console.log(`[grafika] собрано: ${gotowy} · ${(+inf.duration).toFixed(2)} с · ${(inf.size / 1048576).toFixed(2)} МБ`);

const kontrola = await sprawdzRolke(gotowy, {
  oczekiwanePrzejscia: zdarzenia.map((z) => z.t),
  bezGlosu: BEZ_GLOSU,
});
console.log('[grafika] проверка:', JSON.stringify(kontrola, null, 1));

// ── описание и паспорт ────────────────────────────────────────────
// Собираются из самого сценария, а не пишутся руками: седьмой сценарий
// заведут завтра, и он должен уехать в ленту с нормальным описанием без
// отдельной работы. Берём хук (он же обещание), расплату (она же смысл) и
// призыв — то, из чего описание и состоит у стоковых роликов.
const wiersz = (rola) =>
  scenariusz.frazy.filter((f) => f.rola === rola).map((f) => f.tekst.trim()).join(' ');

const hak = wiersz('hak');
const zaplata = wiersz('zaplata') || wiersz('tresc');
const cta = wiersz('cta');

// Тема нужна тегам: по ней подбираются нишевые и тематические хэштеги.
// Берём её из названия сценария — оно у нас как раз описывает тему.
const opisTekst = podmienHasztagi(
  [hak, zaplata, cta, 'zovu.pl'].filter(Boolean).join(String.fromCharCode(10, 10)),
  { temat: scenariusz.nazwa, forma: 'rysowana', nr: stan.grafikaScen ?? 0 }
);
await writeFile(gotowy.replace(/\.mp4$/, '-opis.txt'), opisTekst, 'utf8');

await writeFile(
  gotowy.replace(/\.mp4$/, '-meta.json'),
  JSON.stringify(
    {
      scenariusz: scenariusz.nazwa,
      forma: 'rysowana',
      temat: scenariusz.nazwa,
      dlugosc: +(+inf.duration).toFixed(2),
      frazy: scenariusz.frazy.length,
      typ: 'grafika',
    },
    null,
    2
  ) + String.fromCharCode(10),
  'utf8'
);
console.log('[grafika] описание и паспорт записаны');

// Дорожку голоса кладём рядом с роликом. Без неё разбор «почему в паузе
// тихо» превращается в гадание: по готовому миксу нельзя отличить «голос
// молчит» от «подложку прижали».
try {
  await copyFile(glos.plik, gotowy.replace(/.mp4$/, '-glos.mp3'));
  await copyFile(glosGotowy, gotowy.replace(/.mp4$/, '-glos-gotowy.wav'));
  console.log('[grafika] дорожка голоса сохранена рядом');
} catch {}
