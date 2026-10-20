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

// Палитры: [акцент, второй цвет]. В скинах акцент — жёлтый ZOVU, второй —
// фиолетовый; палитра подменяет оба. Свои цвета ZOVU весят вдвое: лента
// должна оставаться узнаваемой.
export const PALETY = {
  zovu: { a: '#facc15', b: '#7c3aed', waga: 2 },
  koral: { a: '#fb7185', b: '#1e3a8a', waga: 1 },
  mieta: { a: '#34d399', b: '#312e81', waga: 1 },
  pomarancz: { a: '#fb923c', b: '#0f172a', waga: 1 },
  cyjan: { a: '#22d3ee', b: '#9d174d', waga: 1 },
  limonka: { a: '#bef264', b: '#4c1d95', waga: 1 },
};

// Крупный шрифт (вместо Bebas Neue) и основной (вместо Inter). Все — с
// польскими буквами (latin-ext).
export const FONTY = {
  bebas: { duzy: 'Bebas Neue', gf: 'Bebas+Neue', tekst: 'Inter', gfTekst: 'Inter:wght@400;500;600;700;800;900' },
  anton: { duzy: 'Anton', gf: 'Anton', tekst: 'Inter', gfTekst: 'Inter:wght@400;500;600;700;800;900' },
  archivo: { duzy: 'Archivo Black', gf: 'Archivo+Black', tekst: 'Manrope', gfTekst: 'Manrope:wght@400;500;600;700;800' },
  oswald: { duzy: 'Oswald', gf: 'Oswald:wght@700', tekst: 'Montserrat', gfTekst: 'Montserrat:wght@400;500;600;700;800;900' },
  grotesk: { duzy: 'Space Grotesk', gf: 'Space+Grotesk:wght@700', tekst: 'Space Grotesk', gfTekst: 'Space+Grotesk:wght@400;500;600;700' },
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
  if ((x.paleta || 'zovu') === (y.paleta || 'zovu')) s += 2;
  if ((x.font || 'bebas') === (y.font || 'bebas')) s += 1;
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
    return kolejka
      .filter((p) => p.kiedy || p.opublikowano)
      .sort((a, b) => Date.parse(b.kiedy || b.opublikowano) - Date.parse(a.kiedy || a.opublikowano))
      .slice(0, PAMIEC)
      .map((p) => p.montaz || { format: 'stok', paleta: 'zovu', font: 'bebas', zakonczenie: 'marka' });
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
      paleta: format === 'stok' ? 'zovu' : wymus.paleta || wazony(los, wagiPalet),
      font: format === 'stok' ? 'bebas' : wymus.font || Object.keys(FONTY)[Math.floor(los() * Object.keys(FONTY).length)],
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

// Подмена палитры и шрифтов в готовом HTML скина. Цвета в скинах заданы
// прямо в CSS и в JS — поэтому меняем по точному значению, а не через
// переменные: ни один скин не надо переписывать.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const mieszaj = (h, z, k) => hex(rgb(h).map((x, i) => x + (rgb(z)[i] - x) * k));

export function oprawHtml(html, { paleta = 'zovu', font = 'bebas' } = {}) {
  const P = PALETY[paleta] || PALETY.zovu;
  const F = FONTY[font] || FONTY.bebas;
  let out = html;
  if (paleta !== 'zovu') {
    const zam = [
      ['#facc15', P.a],
      ['#e0a800', mieszaj(P.a, '#000000', 0.12)],
      ['#fde68a', mieszaj(P.a, '#ffffff', 0.55)],
      ['#7c3aed', P.b],
      ['#a78bfa', mieszaj(P.b, '#ffffff', 0.45)],
    ];
    for (const [z, na] of zam) out = out.split(z).join(na).split(z.toUpperCase()).join(na);
    out = out.split('124,58,237').join(rgb(P.b).join(','));
  }
  if (font !== 'bebas') {
    out = out
      .split("'Bebas Neue'").join(`'${F.duzy}'`)
      .split('family=Bebas+Neue').join('family=' + F.gf);
    if (F.tekst !== 'Inter') {
      out = out
        .split("'Inter'").join(`'${F.tekst}'`)
        .split('family=Inter:wght@400;500;600;700;800;900').join('family=' + F.gfTekst);
    }
  }
  return out;
}
