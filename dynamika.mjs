// Динамика рилсов: музыка по настроению, склейки по биту, удары, звуки,
// настоящий материал клиентов в кейсах.
//
// 29.10.2026 Митя посмотрел пробные ролики автопилота: «голос ИИшный, музыка
// одинаковая, нету мощного хука, не динамично — больше эффектов, больше
// монтажа, больше динамики». А кейс Fight Mode шёл на СТОКОВОМ боксе вместо
// настоящей гали — «выглядит фейком». Здесь всё, что лечит это, в одном
// месте, чтобы сборщик (rolka-auto.mjs) только звал готовые решения.
//
//   wybierzMuzyke   — трек из music/katalog.json по настроению сценария,
//                     не из последних шести; каждый порезан с дропа и
//                     стоит на сетке долей (bpm, siatka);
//   klientScenariusza / pulaKlienta / dobierzUjecie — кейсы только на своём
//                     материале (wlasne/klienci/<klient>, manifest.json);
//   siatkaCiec      — склейки по биту каждые ~0,7–1,2 с внутри фраз;
//   planUdarow      — зум-панч на кадре 0 и на ударных словах, тряска и
//                     вспышка на настоящих ударах, свист/удар звуком.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;

function losuj(ziarno) {
  let h = 2166136261;
  for (const c of String(ziarno)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ── музыка ────────────────────────────────────────────────────────
// Настроение сценария: явное поле `muzyka` в сценарии, иначе по теме.
// moc — трэп/хип-хоп/спорт (кейсы событий, «боль»), groove — хаус/фанк/
// электроника (кейсы брендов, советы), luz — чилл (кулисы), kino — кино.
export function nastrojScenariusza(scen) {
  if (scen.muzyka) return scen.muzyka;
  const n = `${scen.nazwa} ${scen.temat || ''}`.toLowerCase();
  if (/fight|gala|walk|sport/.test(n)) return 'moc';
  if (/^bol-|błąd|blad|mit-|zakaz/.test(scen.nazwa) || scen.hak_typ === 'bol' || scen.hak_typ === 'zakaz') return 'moc';
  if (/kulisy|robot|autopilot/.test(n)) return 'groove';
  if (/amorki|tvn|orchard|case/.test(n)) return 'groove';
  return ['moc', 'groove', 'groove', 'luz'][Math.abs([...n].reduce((s, c) => s + c.charCodeAt(0), 0)) % 4];
}

const PAMIEC_MUZYKI = 6;

/**
 * @returns {{plik:string, bpm:number, siatka:number, nastroj:string, gatunek:string}|null}
 */
export async function wybierzMuzyke(scen, { stanPlik, ziarno = '' } = {}) {
  let katalog = [];
  try {
    katalog = JSON.parse(await readFile(path.join(DIR, 'music', 'katalog.json'), 'utf8'));
  } catch {
    return null;
  }
  katalog = katalog.filter((t) => existsSync(path.join(DIR, 'music', t.plik)));
  if (!katalog.length) return null;
  let stan = {};
  try { stan = JSON.parse(await readFile(stanPlik, 'utf8')); } catch { stan = {}; }
  const ostatnie = Array.isArray(stan.muzykaOstatnie) ? stan.muzykaOstatnie : [];
  const nastroj = nastrojScenariusza(scen);
  const los = losuj(`${scen.nazwa}-${ziarno}`);
  let pula = katalog.filter((t) => t.nastroj === nastroj && !ostatnie.includes(t.plik));
  if (!pula.length) pula = katalog.filter((t) => !ostatnie.includes(t.plik));
  if (!pula.length) pula = katalog.filter((t) => t.plik !== ostatnie[0]);
  // Жанр прошлого трека — в конец очереди: «одна музыка» слышна и по жанру.
  const ostGat = katalog.find((t) => t.plik === ostatnie[0])?.gatunek;
  const inne = pula.filter((t) => t.gatunek !== ostGat);
  if (inne.length) pula = inne;
  // Пульс — вес: ритм ролика держит музыка (music/README.md).
  const suma = pula.reduce((s, t) => s + Math.sqrt(t.puls || 16), 0);
  let x = los() * suma;
  let wybor = pula[pula.length - 1];
  for (const t of pula) if ((x -= Math.sqrt(t.puls || 16)) <= 0) { wybor = t; break; }
  stan.muzykaOstatnie = [wybor.plik, ...ostatnie.filter((p) => p !== wybor.plik)].slice(0, PAMIEC_MUZYKI);
  await mkdir(path.dirname(stanPlik), { recursive: true });
  await writeFile(stanPlik, JSON.stringify(stan, null, 2) + '\n', 'utf8');
  return { ...wybor, plik: path.join(DIR, 'music', wybor.plik), nastroj };
}

// Шаг склейки: целое число долей, чтобы длина плана была 0,7–1,2 с
// (ритм EMU, feedback_montaz_po_referensu). Быстрый трек режем через две доли.
export function krokSiatki(bpm) {
  const p = 60 / (bpm || 120);
  let best = 2, blad = 9;
  for (let n = 1; n <= 4; n++) {
    const d = n * p;
    if (d < 0.62 || d > 1.3) continue;
    const b = Math.abs(d - 0.85);
    if (b < blad) { blad = b; best = n; }
  }
  return { dolka: p, krok: best * p, dolek: best };
}

// ── материал клиентов ─────────────────────────────────────────────
// Кейс о клиенте собирается ТОЛЬКО из его настоящего материала. Подмена
// стоком — ровно то, что Митя назвал фейком: зритель, видевший галу, видит,
// что это не она.
const KLIENCI = [
  { klient: 'fm', wzor: /fight-mode|fightmode|\bgala\b/ },
  { klient: 'amorki', wzor: /amorki|tvn/ },
  { klient: 'no', wzor: /new-orchard|neworchard/ },
  { klient: 'kulisy', wzor: /^kulisy-/ },
];

export function klientScenariusza(scen) {
  if (scen.material) return scen.material;
  const n = scen.nazwa || '';
  return KLIENCI.find((k) => k.wzor.test(n))?.klient || null;
}

let manifestCache = null;
export async function pulaKlienta(klient) {
  if (!manifestCache) {
    try {
      manifestCache = JSON.parse(await readFile(process.env.MANIFEST_KLIENCI || path.join(DIR, 'wlasne', 'klienci', 'manifest.json'), 'utf8'));
    } catch {
      manifestCache = [];
    }
  }
  return manifestCache
    .filter((x) => x.klient === klient)
    .map((x) => ({ ...x, sciezka: path.join(DIR, 'wlasne', 'klienci', x.plik) }))
    .filter((x) => existsSync(x.sciezka));
}

const rdzen = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').slice(0, 5);

// Лучший кадр под фразу: совпадение тегов со словами фразы, сила кадра,
// и как давно он стоял в этом ролике. `uzycia` — Map plik → сколько раз.
export function dobierzUjecie(pula, tekst, uzycia, { hak = false, poprzedni = null } = {}) {
  if (!pula.length) return null;
  const slowa = new Set(
    String(tekst || '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map(rdzen)
  );
  const ocena = (x) => {
    const tagi = (x.tagi || []).map(rdzen);
    const traf = tagi.filter((t) => [...slowa].some((s) => s.startsWith(t.slice(0, 4)) || t.startsWith(s.slice(0, 4)))).length;
    const u = uzycia.get(x.plik) || 0;
    return traf * 2 + (x.sila || 1) * (hak ? 3 : 1) - u * 4 - (x.plik === poprzedni ? 10 : 0);
  };
  return [...pula].sort((a, b) => ocena(b) - ocena(a))[0];
}

/**
 * Склейки по биту. Фразы задают границы смысла, сетка — ритм внутри.
 * @param {Array<{a:number,b:number}>} frazy — тайминги голоса
 * @param {number} dlugosc — длина тела ролика (без концовки)
 * @param {{bpm:number, siatka?:number}} muzyka
 * @returns {Array<{od:number, do:number, fraza:number, pierwszy:boolean}>}
 */
export function siatkaCiec(frazy, dlugosc, muzyka) {
  const { krok, dolka } = krokSiatki(muzyka?.bpm);
  const g0 = 0; // трек начинается на сильной доле в 0
  const naBit = (t) => g0 + Math.round((t - g0) / dolka) * dolka;
  // Границы фраз — на ближайшую долю, если она рядом.
  const granice = [0];
  for (let i = 1; i < frazy.length; i++) {
    let t = frazy[i].a;
    const b = naBit(t);
    if (Math.abs(b - t) <= 0.16) t = b;
    if (t - granice.at(-1) >= 0.45 && dlugosc - t >= 0.45) granice.push(+t.toFixed(3));
  }
  granice.push(+dlugosc.toFixed(3));
  const ujecia = [];
  for (let i = 0; i < granice.length - 1; i++) {
    const a = granice[i], b = granice[i + 1];
    const ciecia = [a];
    // Хук режем чаще (на долю раньше): первые три секунды решают досмотр.
    const k = i === 0 ? Math.max(0.6, krok * 0.85) : krok;
    // Идём по долям: режем на первой доле, до которой от прошлой склейки
    // набралось ~шаг. Хвост короче 0,45 с к фразе не оставляем.
    let ost = a;
    for (let t = Math.ceil((a + 0.02) / dolka) * dolka; t < b - 0.45; t += dolka) {
      if (t - ost >= k * 0.82) { ciecia.push(+t.toFixed(3)); ost = t; }
    }
    ciecia.push(b);
    for (let j = 0; j < ciecia.length - 1; j++) {
      ujecia.push({ od: ciecia[j], do: ciecia[j + 1], fraza: i, pierwszy: j === 0 });
    }
  }
  return ujecia;
}

// Слово, на которое бить зумом: число или самое длинное смысловое.
export function slowoUdaru(fraza, slowa) {
  const w = slowa.filter((s) => s.a >= fraza.a - 0.05 && s.a < fraza.b + 0.05);
  if (!w.length) return null;
  const liczba = w.find((s) => /\d/.test(s.tekst));
  if (liczba) return liczba;
  return [...w].sort((x, y) => y.tekst.replace(/[^\p{L}]/gu, '').length - x.tekst.replace(/[^\p{L}]/gu, '').length)[0];
}

const SFX = {
  uderzenie: ['uderzenie-1.mp3', 'uderzenie-2.mp3'],
  swist: ['przylot-1.mp3', 'przylot-3.mp3', 'odlot-2.mp3'],
  rozped: ['rozped-1.mp3'],
};
const sfx = (rodzaj, n) => path.join(DIR, 'dzwieki', SFX[rodzaj][n % SFX[rodzaj].length]);

/**
 * План ударов. Ровно столько, чтобы ролик «бил», но не мельтешил:
 * удар на кадре 0, лёгкий панч на каждом втором стыке, сильный — на
 * ударном слове фразы, тряска и вспышка только на настоящих ударах (sila 3
 * в материале FM), звук — на хуке, вспышках и переходах микса.
 */
export function planUdarow({ ujecia, frazy, slowa, klient, przejscia = [], bezGlosu = false }) {
  const udary = [{ t: 0, z: 0.2, wstrzas: klient === 'fm' ? 14 : 0 }];
  const blyski = [];
  const dzwieki = [{ t: 0.0, plik: sfx('uderzenie', 0), glosnosc: bezGlosu ? 1.0 : 0.8 }];
  const zajete = (t, odstep = 0.35) => udary.some((u) => Math.abs(u.t - t) < odstep);
  ujecia.forEach((u, i) => {
    if (i === 0) return;
    const t = u.od;
    if (u.mocny) {
      if (!zajete(t)) udary.push({ t, z: 0.16, wstrzas: klient === 'fm' ? 18 : 6 });
      if (blyski.length < 4 && (!blyski.length || t - blyski.at(-1) > 2.5)) {
        blyski.push(t);
        dzwieki.push({ t: Math.max(0, t - 0.02), plik: sfx('uderzenie', blyski.length), glosnosc: 0.7 });
      }
    } else if (i % 2 === 0 && !zajete(t)) {
      udary.push({ t, z: 0.07 });
    }
  });
  frazy.forEach((f, i) => {
    if (i === 0) return;
    const w = slowoUdaru(f, slowa);
    if (w && !zajete(w.a, 0.3)) udary.push({ t: +w.a.toFixed(3), z: 0.12 });
  });
  przejscia.forEach((p, i) => dzwieki.push({ t: Math.max(0, p.t - 0.2), plik: sfx('swist', i), glosnosc: 0.65 }));
  // Первая склейка после хука — разгон звуком, если там не стоит вспышка.
  const druga = ujecia[1]?.od;
  if (druga && !blyski.some((b) => Math.abs(b - druga) < 0.2)) {
    dzwieki.push({ t: Math.max(0, druga - 0.25), plik: sfx('swist', 2), glosnosc: 0.55 });
  }
  udary.sort((a, b) => a.t - b.t);
  return { udary: udary.slice(0, 30), blyski, dzwieki };
}
