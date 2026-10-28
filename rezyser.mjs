// Режиссёр монтажа: следит, чтобы лента не становилась однотипной.
//
// 20.10.2026 Захар: «не берём за основу… мне надо разнообразие, чтобы ты
// чувствовал, что если контент однотипный, то надо немного поменять монтаж».
// То есть «лучший» монтаж не закрепляется: понравившийся вариант через неделю
// повторов надоест так же, как надоел жёлтый сток.
//
// Как работает. У каждого ролика есть паспорт монтажа (`montaz` в очереди):
// формат, стили по кускам, переходы, палитра, шрифт, концовка. Перед сборкой
// режиссёр перебирает десятки возможных вариантов и берёт тот, что меньше
// всего похож на последние ролики ленты. Похожесть считаем с затуханием:
// вчерашний ролик весит больше, чем ролик недельной давности.
//
// Решение в два шага, потому что не всё известно сразу:
//   1. wybierzOprawe — до голоса: формат, палитра, шрифт, концовка
//      (концовка меняет текст призыва, а значит и озвучку);
//   2. wybierzMiks   — после голоса: какие стили по кускам и какие переходы
//      (раскладка зависит от длины фраз).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Сколько последних роликов помним и насколько быстро забываем.
const PAMIEC = 8;
const ZANIK = 0.6;

// Формат целиком: микс со сменой стилей, типографика на весь ролик, старый
// сток с подписями. Вес — как часто формат годится сам по себе: микс самый
// богатый, сток самый скучный. Новизна всё равно важнее веса.
export const FORMATY = { miks: 4, typo: 1, stok: 0.35 };

// Палитры — ТОНА внутри бренда ZOVU 2026 (reference_zovu_brand_2026).
// 29.10.2026 Митя: прежние шесть палитр (жёлтый/фиолетовый, коралл, мята…)
// — «скучно и однообразно», а фиолетовый — клише ИИ-сервисов. Теперь акцент
// всегда один, #FF4A1C; режиссёр меняет только тон карточек: светлый,
// бумага (белый фон и тёплые карточки), тёмный режим бренда, «огонь»
// (акцентный маркер ярче). Значения — CSS-переменные скинов (skory.mjs).
export const PALETY = {
  jasny: { waga: 2, t: { zt: '#F6F4EF', zk: '#FFFFFF', zx: '#111111', zs: '#55524C', za: '#FF4A1C', zl: '#FFD6C8', zd: '#111111' } },
  papier: { waga: 1.2, t: { zt: '#FFFFFF', zk: '#F6F4EF', zx: '#111111', zs: '#55524C', za: '#FF4A1C', zl: '#FFE2D8', zd: '#111111' } },
  ogien: { waga: 1, t: { zt: '#F6F4EF', zk: '#FFFFFF', zx: '#111111', zs: '#55524C', za: '#FF4A1C', zl: '#FF9B7A', zd: '#FF4A1C' } },
  ciemny: { waga: 0.5, t: { zt: '#111111', zk: '#1D1C1A', zx: '#F6F4EF', zs: '#B8B3A9', za: '#FF4A1C', zl: '#6B2814', zd: '#111111' } },
};

// Шрифт КРУПНОГО слова (заголовки, «одно слово», переходы). Текст везде Inter.
// Бренд: Inter Tight 800/900 + 1–2 акцентных слова Instrument Serif italic.
//   tight   — всё Inter Tight 900;
//   serif   — крупное слово Instrument Serif italic (редакционный вид);
//   miks    — Inter Tight, а акцентное (оранжевое) слово — Instrument Serif italic;
//   tight8  — Inter Tight 800 с плотным трекингом.
export const FONTY = {
  tight: { d: "'Inter Tight'", w: 900, s: 'normal', l: '-0.03em', a: "'Inter Tight'", as: 'normal' },
  serif: { d: "'Instrument Serif'", w: 400, s: 'italic', l: '-0.01em', a: "'Instrument Serif'", as: 'italic' },
  miks: { d: "'Inter Tight'", w: 900, s: 'normal', l: '-0.03em', a: "'Instrument Serif'", as: 'italic' },
  tight8: { d: "'Inter Tight'", w: 800, s: 'normal', l: '-0.045em', a: "'Inter Tight'", as: 'normal' },
};

// Концовки, которые идут с любым сценарием. `petla` — только если сценарий
// написан петлёй, `seria` — только когда будут настоящие серии.
const KONCOWKI = ['pytanie', 'wyslij', 'blysk', 'marka'];

function losuj(ziarno) {
  let h = 2166136261;
  for (const c of String(ziarno)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function wazony(los, wagi) {
  const pary = Object.entries(wagi);
  let x = los() * pary.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of pary) if ((x -= w) <= 0) return k;
  return pary.at(-1)[0];
}

const jaccard = (a = [], b = []) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  return [...A].filter((x) => B.has(x)).length / new Set([...A, ...B]).size;
};

// Похожесть двух паспортов, 0…~10. Веса — что зритель замечает первым:
// формат и цвет видны с первого кадра, переход — только на стыке.
export function podobienstwo(x, y) {
  let s = 0;
  if (x.format === y.format) s += 2;
  if ((x.paleta || 'jasny') === (y.paleta || 'jasny')) s += 2;
  if ((x.font || 'tight') === (y.font || 'tight')) s += 1;
  if (x.zakonczenie && x.zakonczenie === y.zakonczenie) s += 1.5;
  if (x.format === 'miks' && y.format === 'miks' && x.style && y.style) {
    if (x.style[0] === y.style[0]) s += 1.5;
    s += 2 * jaccard(x.style, y.style);
    s += jaccard(x.przejscia, y.przejscia);
  }
  return s;
}

// Насколько кандидат похож на ленту: взвешенная сумма по последним роликам.
export function powtarzalnosc(kandydat, historia) {
  return historia.reduce((s, h, i) => s + Math.pow(ZANIK, i) * podobienstwo(kandydat, h), 0);
}

// Последние паспорта ленты, свежие первыми. Старые ролики без паспорта —
// это сток с подписями: так монтировалось всё до 20.10.
export async function historiaMontazu(dir) {
  try {
    const kolejka = JSON.parse(await readFile(path.join(dir, 'rolki', 'kolejka.json'), 'utf8'));
    // Порядок СБОРКИ (очередь дописывается в конец), а не слота: очередь
    // ставит ролик в лучший свободный час, и вчерашняя сборка может выйти
    // раньше позавчерашней. Сравнивать надо с тем, что делали последним.
    return kolejka
      .filter((p) => p.kiedy || p.opublikowano)
      .reverse()
      .slice(0, PAMIEC)
      .map((p) => p.montaz || { format: 'stok', paleta: 'jasny', font: 'tight', zakonczenie: 'marka' });
  } catch {
    return [];
  }
}

// Однообразие самой ленты: средняя похожесть соседних роликов. Для лога —
// чтобы в сборке было видно, что режиссёр «почувствовал» и почему поменял.
export function odnostajnosc(historia) {
  if (historia.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < historia.length; i++) s += podobienstwo(historia[i - 1], historia[i]);
  return s / (historia.length - 1);
}

function opisz(p) {
  return [p.format, p.style?.join('→'), p.przejscia?.join(','), p.paleta, p.font, p.zakonczenie]
    .filter(Boolean)
    .join(' · ');
}

// Шаг 1. `wymus` — для проб: {format, paleta, font, zakonczenie}.
export function wybierzOprawe(historia, ziarno, { scen = {}, wymus = {} } = {}) {
  const los = losuj(ziarno + '-oprawa');
  const koncowki = KONCOWKI.concat(scen.zakonczenia?.petla ? ['petla'] : []);
  const wagiPalet = Object.fromEntries(Object.entries(PALETY).map(([k, v]) => [k, v.waga]));
  const kandydaci = [];
  for (let i = 0; i < 80; i++) {
    const format = wymus.format || wazony(los, FORMATY);
    const k = {
      format,
      // Сток рисует свои подписи — палитра и шрифт скинов его не касаются.
      paleta: format === 'stok' ? 'jasny' : wymus.paleta || wazony(los, wagiPalet),
      font: format === 'stok' ? 'tight' : wymus.font || Object.keys(FONTY)[Math.floor(los() * Object.keys(FONTY).length)],
      zakonczenie: wymus.zakonczenie || koncowki[Math.floor(los() * koncowki.length)],
    };
    // Чуть-чуть случайности поверх новизны: иначе при пустой истории
    // режиссёр всегда выбирал бы одно и то же «самое непохожее».
    k.ocena =
      powtarzalnosc(k, historia) -
      Math.log(FORMATY[format]) * 2.2 -
      Math.log(PALETY[k.paleta].waga) * 1.5 +
      los() * 0.6;
    kandydaci.push(k);
  }
  kandydaci.sort((a, b) => a.ocena - b.ocena);
  const { ocena, ...wybor } = kandydaci[0];
  return {
    ...wybor,
    log:
      `однообразие ленты ${odnostajnosc(historia).toFixed(1)} из 10; ` +
      `последний: ${historia[0] ? opisz(historia[0]) : '—'}; выбрал: ${opisz(wybor)} ` +
      `(похожесть на ленту ${powtarzalnosc(wybor, historia).toFixed(1)})`,
  };
}

// Шаг 2. `kandydaci` — раскладки planMiksu с разными зёрнами.
export function wybierzMiks(kandydaci, oprawa, historia) {
  const ocenione = kandydaci.map((m) => {
    const p = { ...oprawa, style: m.segmenty.map((s) => s.typ), przejscia: m.przejscia.map((x) => x.typ) };
    return { m, p, ocena: powtarzalnosc(p, historia) };
  });
  ocenione.sort((a, b) => a.ocena - b.ocena);
  return ocenione[0];
}

// Тон и шрифт в готовом HTML скина: одна строка CSS-переменных сразу после
// <body>. Строка в одинарных кавычках — попадает и в srcdoc микса (там
// экранированы только & и "), так что каждый кусок микса берёт тот же тон.
export function tokenyCss(paleta = 'jasny', font = 'tight') {
  const P = (PALETY[paleta] || PALETY.jasny).t;
  const F = FONTY[font] || FONTY.tight;
  return (
    ':root{' +
    Object.entries(P).map(([k, v]) => `--${k}:${v}`).join(';') +
    `;--zfd:${F.d};--zfw:${F.w};--zfs:${F.s};--zfl:${F.l};--zfa:${F.a};--zfas:${F.as}}`
  );
}

export function oprawHtml(html, { paleta = 'jasny', font = 'tight' } = {}) {
  // Шрифт качается, только когда им что-то написано, и fonts.ready до этого
  // молчит. Проба 20.10: слово подгонялось по ширине запасного шрифта, потом
  // приезжал настоящий — и вылезало за кадр. Невидимая строчка всеми
  // шрифтами заставляет их загрузиться до первого кадра.
  const zaladuj =
    "<div aria-hidden='true' style='position:absolute;left:-9999px;top:0;font-size:40px'>" +
    [['Inter Tight', 700, 'normal'], ['Inter Tight', 800, 'normal'], ['Inter Tight', 900, 'normal'],
      ['Instrument Serif', 400, 'italic'], ['Instrument Serif', 400, 'normal'],
      ['Inter', 400, 'normal'], ['Inter', 600, 'normal'], ['Inter', 800, 'normal'], ['Inter', 900, 'normal']]
      .map(([f, w, st]) => `<span style='font-family:${f};font-weight:${w};font-style:${st}'>ZĄ</span>`)
      .join('') +
    '</div>';
  const styl = `<style>${tokenyCss(paleta, font)}</style>`;
  return html.split('<body>').join('<body>' + styl + zaladuj);
}
