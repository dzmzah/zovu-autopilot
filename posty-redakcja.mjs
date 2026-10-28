// Редакция графических постов (28.10.2026): какой пост из банка выходит
// сегодня, проверка текста и подпись под пост.
//
// Почему банк, а не генерация на лету: за 3 месяца генератор выдал ленту
// общих советов «для всех» (охват 2–35, ноль сохранений). Владельцы просят
// посты со смыслом: конкретный вывод или доказательство в каждом. Такие
// пишутся руками — банк в posty-bank.json, порядок в `kolejnosc`.
// Когда круг пройден, начинается новый круг с самого давнего поста, а сторож
// (doktor.mjs) заранее предупреждает, что банк пора пополнить.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
// Банк читаем сами, без posty-design.mjs: тот тянет playwright и sharp, а
// сторож (straznik.yml) проверяет банк без установки браузера.
async function czytajBank() {
  return JSON.parse(await readFile(path.join(import.meta.dirname, 'posty-bank.json'), 'utf8'));
}

const STATE_FILE = path.join(import.meta.dirname, 'state.json');

// Стандартный набор: 2 локальных + 2 по теме поста + свой.
// «Katowice» больше не пишем нигде (решение Мити 28.10): мы в Варшаве,
// работаем по всей Польше.
const TAGI_STALE = ['warszawa', 'marketingwarszawa'];

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

// Все тексты поста, которые видит человек, — для проверок.
export function tekstyPostu(p) {
  const t = [p.tytul, p.tekst, p.zrob, p.podpis, p.caption, p.ctaTytul, p.ctaLinia, p.klient, p.branza, p.zadanie];
  if (p.okladka) t.push(p.okladka.tytul, p.okladka.podtytul, p.okladka.liczba);
  for (const pt of p.punkty || []) t.push(pt.naglowek, pt.tekst, pt.przyklad);
  for (const k of p.kroki || []) t.push(k);
  for (const z of p.zrobilismy || []) t.push(z);
  if (p.efekt) t.push(p.efekt.liczba, p.efekt.opis);
  if (p.wniosek) t.push(p.wniosek.tytul, p.wniosek.tekst);
  return t.filter(Boolean).map(String);
}

// Возвращает список проблем; пустой список = пост можно публиковать.
export function sprawdzPost(p) {
  const zle = [];
  const wszystko = tekstyPostu(p).join('\n');
  if (!['teza', 'karuzela', 'case', 'kulisy'].includes(p.typ)) zle.push(`typ "${p.typ}"`);
  if (!['ROLKA', 'ZAPISZ'].includes(p.cta)) zle.push('cta musi być ROLKA albo ZAPISZ');
  // Длинное тире — главный признак ИИ-текста. Короткое между цифрами
  // (17–32%) — нормальная типографика диапазона, его оставляем.
  if (/—/.test(wszystko)) zle.push('długi myślnik „—”');
  if (/\s–\s/.test(wszystko)) zle.push('myślnik „ – ” między słowami');
  if (/katowic/i.test(wszystko + (p.tagi || []).join(' '))) zle.push('Katowice (jesteśmy w Warszawie)');
  const emoji = (wszystko.match(EMOJI_RE) || []).length;
  if (emoji > 2) zle.push(`emoji: ${emoji} (max 2)`);
  // Кейсы клиентов — без денег: ни сумм, ни бюджетов, ни выручки.
  if (p.typ === 'case' && /\d[\d\s,.]*\s*(zł|pln|€|eur|chf|\$|usd)|\b(zł|pln|eur|chf|usd)\b|€|\$|budżet|przych|obrót|zarobi/i.test(wszystko)) {
    zle.push('kwoty/budżet w case study');
  }
  // Ровно одно действие. Подпись заканчивается им же, что и картинка.
  const cap = String(p.caption || '');
  const maRolka = /Napisz ROLKA/i.test(cap);
  const maZapisz = /Zapisz/i.test(cap);
  if (p.cta === 'ROLKA' && !maRolka) zle.push('podpis bez „Napisz ROLKA”');
  if (p.cta === 'ZAPISZ' && !maZapisz) zle.push('podpis bez „Zapisz”');
  if (p.cta === 'ZAPISZ' && maRolka) zle.push('dwa działania w podpisie (ZAPISZ i ROLKA)');
  const ostatni = cap.trim().split(/\n\s*\n/).pop();
  if (/\b(link )?w bio\b/i.test(ostatni)) zle.push('„link w bio” zamiast jednego działania');
  if (cap.length < 200 || cap.length > 1100) zle.push(`podpis ${cap.length} znaków (200–1100)`);
  // Структура по типу
  if (p.typ === 'karuzela') {
    if (!p.okladka?.tytul) zle.push('brak okladka.tytul');
    const n = (p.punkty || []).length;
    if (n < 3 || n > 5) zle.push(`karuzela: ${n} punktów (3–5)`);
  }
  if (p.typ === 'case') {
    for (const k of ['klient', 'branza', 'foto', 'zadanie']) if (!p[k]) zle.push(`case: brak ${k}`);
    if (!p.efekt?.liczba) zle.push('case: brak efekt.liczba');
    if (!(p.zrobilismy || []).length) zle.push('case: brak zrobilismy');
    if (!p.wniosek?.tytul) zle.push('case: brak wniosek');
  }
  if (p.typ === 'teza' && (!p.tytul || !p.zrob)) zle.push('teza: brak tytul/zrob');
  if (p.typ === 'kulisy' && !p.screen) zle.push('kulisy: brak screen');
  return zle;
}

export function podpis(p) {
  const tagi = [...TAGI_STALE, ...(p.tagi || []).slice(0, 2), 'zovu'];
  return `${p.caption.trim()}\n\n${[...new Set(tagi)].map((t) => '#' + t).join(' ')}`;
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// Следующий пост по кругу. Ничего не пишет: отметка ставится только после
// реальной публикации (oznaczWydany), иначе сорванный прогон «съел» бы пост.
export async function nastepnyPost({ id } = {}) {
  const bank = await czytajBank();
  const s = await readState();
  const red = s.redakcja || { krag: 1, wydane: {} };
  const poId = new Map(bank.posty.map((p) => [p.id, p]));
  let wybrany = id ? poId.get(id) : null;
  if (id && !wybrany) throw new Error(`nie ma posta ${id} w banku`);
  let krag = red.krag || 1;
  if (!wybrany) {
    const wolne = bank.kolejnosc.filter((x) => poId.has(x) && !(red.wydane || {})[x]);
    if (wolne.length) {
      wybrany = poId.get(wolne[0]);
    } else {
      // Круг пройден: самый давний пост идёт первым в новом круге.
      krag += 1;
      wybrany = poId.get(bank.kolejnosc[0]);
    }
  }
  const zle = sprawdzPost(wybrany);
  if (zle.length) throw new Error(`post ${wybrany.id} nie przechodzi kontroli: ${zle.join('; ')}`);
  const pozostalo = bank.kolejnosc.filter((x) => !(red.wydane || {})[x] && x !== wybrany.id).length;
  return { post: wybrany, caption: podpis(wybrany), krag, pozostalo };
}

export async function oznaczWydany(postId, krag) {
  const s = await readState();
  const red = s.redakcja || { krag: 1, wydane: {} };
  if ((krag || 1) > (red.krag || 1)) {
    red.krag = krag;
    red.wydane = {};
  }
  red.wydane = red.wydane || {};
  red.wydane[postId] = new Date().toISOString().slice(0, 10);
  s.redakcja = red;
  await writeFile(STATE_FILE, JSON.stringify(s, null, 1) + '\n', 'utf8');
}

// Для сторожа: сколько непоказанных постов осталось в текущем круге и
// проходят ли все посты банка проверку.
export async function stanBanku() {
  const bank = await czytajBank();
  const s = await readState();
  const wydane = s.redakcja?.wydane || {};
  const zle = [];
  for (const p of bank.posty) {
    const z = sprawdzPost(p);
    if (z.length) zle.push(`${p.id}: ${z.join(', ')}`);
  }
  return { wszystkie: bank.kolejnosc.length, pozostalo: bank.kolejnosc.filter((x) => !wydane[x]).length, zle };
}
