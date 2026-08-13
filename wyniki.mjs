// Сбор цифр по вышедшим рилсам — то, ради чего всё остальное и строится.
//
// Без обратной связи автоматика не улучшается, а ДРЕЙФУЕТ: те же шаблоны,
// тот же голос, та же структура, и через месяц лента однообразна. Аккаунты
// умирают от этого, а не от технических сбоев.
//
// Поэтому после каждой публикации забираем показатели и складываем рядом с
// тем, ЧЕМ был ролик: какой сценарий, какой хук, какая длина, во сколько
// вышел. Через месяц накопится достаточно, чтобы выбор перестал быть
// случайным.
//
// Считаем не лайки. Лайк ничего не решает; решают досмотр (сколько людей
// дожили до конца) и сохранения с пересылками — по ним площадка и разносит.
//
//   node wyniki.mjs          — обновить цифры по всему опубликованному
//   node wyniki.mjs --raport — вывести сводку человеку
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = import.meta.dirname;
const KOLEJKA = path.join(DIR, 'rolki', 'kolejka.json');
const WYNIKI = path.join(DIR, 'rolki', 'wyniki.json');
const API = 'https://graph.facebook.com/v21.0';
const RAPORT = process.argv.includes('--raport');

// Досмотр важнее охвата: площадка разносит то, что дослушали до конца.
const METRYKI = [
  'plays', 'reach', 'saved', 'shares', 'comments', 'likes',
  'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time',
];

async function igToken() {
  try {
    const store = await import('./token-store.mjs');
    const { token } = await store.loadInstagramToken();
    if (token) return token;
  } catch {
    /* нет хранилища — берём из окружения */
  }
  return process.env.INSTAGRAM_TOKEN || null;
}

async function pobierz(id, token) {
  const url = `${API}/${id}/insights?metric=${METRYKI.join(',')}&access_token=${token}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) {
    // Часть показателей появляется не сразу и не у всех типов медиа —
    // это не повод ронять сбор по остальным роликам.
    return { blad: j.error.message };
  }
  const out = {};
  for (const m of j.data || []) {
    out[m.name] = m.values?.[0]?.value ?? null;
  }
  return out;
}

const kolejka = JSON.parse(await readFile(KOLEJKA, 'utf8'));
let wyniki = [];
try {
  wyniki = JSON.parse(await readFile(WYNIKI, 'utf8'));
} catch {
  wyniki = [];
}

const token = await igToken();
if (!token) {
  console.error('[wyniki] нет токена Instagram');
  process.exit(1);
}

const poId = new Map(wyniki.map((w) => [w.id, w]));
let nowe = 0;

for (const poz of kolejka) {
  const id = poz.wynik?.instagram;
  if (!poz.opublikowano || !id) continue;

  const dane = await pobierz(id, token);
  const wpis = poId.get(id) || { id, plik: poz.plik, opublikowano: poz.opublikowano };
  wpis.zebrane = new Date().toISOString();
  wpis.godzina = new Date(poz.opublikowano).getUTCHours() + 2;
  wpis.hak = String(poz.tekst || '').split('\n')[0].slice(0, 90);
  wpis.dane = dane;

  // Признаки ролика — из паспорта, который положила сборка. Без них цифры
  // остаются числами: сравнивать «охват 800» можно только с охватом РОЛИКОВ
  // ТОЙ ЖЕ формы. На этом и стоит будущий выбор сценария по результатам.
  if (poz.scenariusz) wpis.scenariusz = poz.scenariusz;
  if (poz.forma) wpis.forma = poz.forma;
  if (poz.temat) wpis.temat = poz.temat;
  if (poz.dlugosc) wpis.dlugosc = poz.dlugosc;
  if (poz.tempo?.length) {
    wpis.tempoSrednie = +(poz.tempo.reduce((a, b) => a + b, 0) / poz.tempo.length).toFixed(2);
  }

  // Досмотр в долях: сколько секунд в среднем смотрели относительно длины.
  if (dane.ig_reels_avg_watch_time && poz.dlugosc) {
    wpis.dosmotr = +((dane.ig_reels_avg_watch_time / 1000 / poz.dlugosc) * 100).toFixed(1);
  }

  if (!poId.has(id)) { wyniki.push(wpis); poId.set(id, wpis); nowe++; }
}

await writeFile(WYNIKI, JSON.stringify(wyniki, null, 2) + '\n', 'utf8');
console.log(`[wyniki] записей: ${wyniki.length}, новых: ${nowe}`);

if (RAPORT) {
  console.log('\n=== что вышло ===');
  for (const w of wyniki.slice(-14)) {
    const d = w.dane || {};
    console.log(
      [
        (w.opublikowano || '').slice(0, 16).replace('T', ' '),
        String(w.plik).padEnd(28),
        `охват ${String(d.reach ?? '—').padStart(6)}`,
        `просм ${String(d.plays ?? '—').padStart(6)}`,
        `сохр ${String(d.saved ?? '—').padStart(4)}`,
        `перес ${String(d.shares ?? '—').padStart(4)}`,
        w.dosmotr != null ? `досмотр ${w.dosmotr}%` : '',
      ].join('  ')
    );
  }

  // Простейший вывод, который уже полезен: в какой час выходило лучше.
  const poGodzinie = {};
  for (const w of wyniki) {
    const g = w.godzina;
    const r = w.dane?.reach;
    if (g == null || !r) continue;
    (poGodzinie[g] ||= []).push(r);
  }
  const srednie = Object.entries(poGodzinie)
    .map(([g, xs]) => [g, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), xs.length])
    .sort((a, b) => b[1] - a[1]);
  if (srednie.length) {
    console.log('\n=== средний охват по часу выхода ===');
    for (const [g, sr, n] of srednie) console.log(`  ${g}:00  ${sr}  (роликов: ${n})`);
  }

  // Ради чего всё и затевалось: какая ФОРМА держит зрителя. Сравнивать
  // формы между собой честно только по досмотру — охват зависит ещё и от
  // того, кому площадка решила показать. Досмотр зависит от ролика.
  //
  // Пока роликов мало, вывод врёт: одна удачная тема перевесит форму.
  // Поэтому рядом печатается, СКОЛЬКО роликов стоит за средним. Меньше
  // трёх — это ещё не наблюдение, а совпадение.
  const poFormie = {};
  for (const w of wyniki) {
    if (!w.forma) continue;
    (poFormie[w.forma] ||= []).push(w);
  }
  const formy = Object.entries(poFormie)
    .map(([f, xs]) => {
      const d = xs.map((x) => x.dosmotr).filter((x) => x != null);
      const r = xs.map((x) => x.dane?.reach).filter(Boolean);
      const sr = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
      return { forma: f, ile: xs.length, dosmotr: sr(d), zasieg: sr(r) };
    })
    .sort((a, b) => (b.dosmotr ?? -1) - (a.dosmotr ?? -1));

  if (formy.length) {
    console.log('\n=== по форме ролика ===');
    for (const f of formy) {
      console.log(
        `  ${String(f.forma).padEnd(14)} досмотр ${String(f.dosmotr ?? '—').padStart(6)}%` +
          `  охват ${String(f.zasieg ?? '—').padStart(7)}  (роликов: ${f.ile})` +
          (f.ile < 3 ? '  ← мало данных' : '')
      );
    }
  }
}
