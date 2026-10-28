// Подписи под рилсами: Instagram/Facebook, заголовок YouTube, подпись TikTok.
//
// 28.10.2026 (Mat + Zahar). Аудит: подпись = закадровый текст слово в слово,
// первая строка подписи — «эссе» на две строки, заголовок YouTube = первые
// 100 знаков подписи, обрезанные «…», в конце голое «zovu.pl», теги
// #katowice #firmakatowice. Сохранений и пересылок — ноль за 86 рилсов.
//
// Формула теперь одна для всех площадок:
//   строка-заголовок (≤ 10 слов, это то, что видно в ленте)
//   → 2–3 предложения пользы, которых НЕТ в озвучке
//   → одно действие: кодовое слово в личные сообщения
//   → 3–5 тематических тегов.
// Локацию не пишем вовсе; если нужна — «Warszawa / cała Polska».
//
//   import { zbudujPodpisy } from './podpisy.mjs';
//   const { ig, yt, tt } = zbudujPodpisy(scen, { nr });
//
//   node podpisy.mjs --kolejka        — переписать подписи у НЕвышедших в очереди
//   node podpisy.mjs --kolejka --dry  — показать, не сохраняя
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hasztagi } from './tagi.mjs';
import { slowa, MAX_SLOW_HAKA, SLOWO, bezLokalnych } from './haki.mjs';

const DIR = import.meta.dirname;
const NL = String.fromCharCode(10);

// Кодовое слово. В личку, а не в комментарий: автоответа на комментарии
// пока нет, а комментарий без ответа хуже молчания. Когда появится
// автоматизация комментариев — менять здесь, в одном месте.
export { SLOWO, bezLokalnych };
// Варианты одного действия — чтобы подпись не была одной строкой-шаблоном
// под каждым роликом. Действие везде одно и то же: ROLKA в личку.
export const AKCJE = [
  `Chcesz takie rolki dla swojej firmy? Napisz ${SLOWO} w wiadomości.`,
  `Napisz ${SLOWO} w wiadomości, a pokażemy, jak to zrobić u ciebie.`,
  `Prowadzimy to za firmy w całej Polsce. Napisz ${SLOWO} w wiadomości.`,
  `Nie masz na to czasu? Napisz ${SLOWO} w wiadomości.`,
];
// То же действие для голоса и концовки — коротко, на одном дыхании.
export const AKCJE_MOWA = [
  `Napisz ${SLOWO} w wiadomości.`,
  `Chcesz tak u siebie? Napisz ${SLOWO} w wiadomości.`,
  `Zrobimy to za ciebie. Napisz ${SLOWO} w wiadomości.`,
  `Napisz nam ${SLOWO} w wiadomości.`,
];
export const akcja = (nr = 0) => AKCJE[Math.abs(Math.trunc(nr)) % AKCJE.length];
export const akcjaMowa = (nr = 0) => AKCJE_MOWA[Math.abs(Math.trunc(nr)) % AKCJE_MOWA.length];

// Локальные упоминания (Katowice и др.) — bezLokalnych из haki.mjs.

const norm = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/[^a-z0-9 ]+/g, ' ').trim();
const zbior = (s) => new Set(norm(s).split(/\s+/).filter((w) => w.length > 3));
// Доля слов предложения, которые и так звучат в ролике.
function pokrycie(zdanie, mowa) {
  const z = zbior(zdanie);
  if (!z.size) return 1;
  let w = 0;
  for (const x of z) if (mowa.has(x)) w++;
  return w / z.size;
}

// Предложения: режем по . ? ! … только перед заглавной буквой — так
// «„co tu dla mnie jest?”, po prostu wyjdą» остаётся одним предложением.
const zdania = (tekst) =>
  String(tekst || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!…]["”]?)\s+(?=[„"«]?[\p{Lu}\d])/u)
    .map((x) => x.trim())
    .filter(Boolean);

const duza = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const CTA_RE = /napisz|zapisz|wyślij|skomentuj|komentarz|oceń|link w bio|zovu\.pl|obserwuj/i;

// Обрезка по слову БЕЗ многоточия: заголовок, который кончается «…»,
// в поиске читается как обрыв.
export function przytnij(s, max) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  t = t.slice(0, max + 1).replace(/\s+\S*$/, '');
  return t.replace(/[\s,;:—–-]+$/, '');
}

// Строка-заголовок: из сценария (`podpis.tytul`), иначе из обложки или темы.
export function tytulPodpisu(scen) {
  const kandydaci = [
    scen?.podpis?.tytul,
    scen?.plyta?.linie?.length ? scen.plyta.linie.join(' ').toLowerCase() : '',
    scen?.temat,
  ].filter(Boolean).map((t) => duza(String(t).trim().replace(/\s+/g, ' ')));
  for (const k of kandydaci) {
    if (slowa(k).length <= MAX_SLOW_HAKA && bezLokalnych(k)) return /[.?!]$/.test(k) ? k : k + (/^(czy|jak|ile|dlaczego|co|kiedy|po co)\b/i.test(k) ? '?' : '.');
  }
  return przytnij(kandydaci[0] || 'ZOVU', 60) + '.';
}

// 2–3 предложения пользы: из `podpis.wartosc`, иначе из старого описания —
// только то, чего нет в озвучке, без призывов, адреса и тегов.
export function wartoscPodpisu(scen, { opisZapasowy = '' } = {}) {
  const mowa = zbior((scen?.czesci || []).map((c) => c.tekst).join(' '));
  if (Array.isArray(scen?.podpis?.wartosc) && scen.podpis.wartosc.length) {
    return scen.podpis.wartosc.map((x) => String(x).trim()).filter((x) => x && bezLokalnych(x)).slice(0, 3);
  }
  const zrodlo = String(scen?.opis || opisZapasowy || '')
    .split(/\n\s*\n/)
    .filter((a) => !/^\s*#/.test(a))
    .join(' ');
  const wybrane = [];
  // Первое предложение старого описания — тот самый «хук-эссе»: его место
  // занимает строка-заголовок.
  for (const z of zdania(zrodlo).slice(1)) {
    if (CTA_RE.test(z) || !bezLokalnych(z)) continue;
    if (slowa(z).length < 4 || slowa(z).length > 24) continue;
    if (pokrycie(z, mowa) > 0.6) continue;
    // Первым не ставим предложение, которое держится за выброшенное
    // («Ale żeby sprzedawał…» без подлежащего читается как обрывок).
    if (!wybrane.length && /^(ale|a|i|bo|więc|to|dlatego|wtedy)\b/i.test(z)) continue;
    wybrane.push(z);
    if (wybrane.length >= 3) break;
  }
  return wybrane;
}

// Ключевое слово под поиск YouTube: по теме ролика.
const KLUCZE = [
  [/rolk|reels|wideo|film|shorts|monta/i, 'rolki dla firm'],
  [/tiktok/i, 'TikTok dla firmy'],
  [/reklam|ads|kampani|promuj|budżet|budzet/i, 'reklama w social media'],
  [/google|opini|wizytówk|wizytowk/i, 'wizytówka Google'],
  [/stron|www|sklep/i, 'strona internetowa dla firmy'],
  [/newsletter|mail/i, 'newsletter dla firmy'],
  [/\bai\b|automaty|robot|autopilot/i, 'automatyzacja marketingu'],
  [/post|instagram|facebook|profil|tre[śs]c/i, 'social media dla firmy'],
  [/klient|wiadomo|cen|wycen|sprzeda/i, 'pozyskiwanie klientów'],
];
export function slowoKluczowe(scen) {
  const t = `${scen?.temat || ''} ${scen?.nazwa || ''} ${scen?.forma || ''}`;
  return (KLUCZE.find(([re]) => re.test(t)) || [null, 'marketing dla firm'])[1];
}

// Заголовок YouTube: тема + ключевое слово, ≤ 70 знаков, без «…».
export function tytulYouTube(scen) {
  if (scen?.podpis?.yt && bezLokalnych(scen.podpis.yt)) return przytnij(scen.podpis.yt, 70);
  const baza = tytulPodpisu(scen).replace(/[.!]$/, '');
  const klucz = slowoKluczowe(scen);
  if (norm(baza).includes(norm(klucz))) return przytnij(baza, 70);
  const z = `${baza} | ${klucz}`;
  return z.length <= 70 ? z : przytnij(baza, 70);
}

/**
 * Все подписи одного ролика.
 * @returns {{ig:string, yt:{tytul:string, opis:string}, tt:string}}
 */
export function zbudujPodpisy(scen, { nr = 0, opisZapasowy = '' } = {}) {
  const tytul = tytulPodpisu(scen);
  const wartosc = wartoscPodpisu(scen, { opisZapasowy });
  const dzialanie = scen?.podpis?.akcja && /ROLKA/.test(scen.podpis.akcja) ? scen.podpis.akcja : akcja(nr);
  const tagi = hasztagi({ temat: `${scen?.temat || ''} ${scen?.nazwa || ''}`, forma: scen?.forma || '', nr });
  const ig = [tytul, wartosc.join(' '), dzialanie, tagi].filter(Boolean).join(NL + NL);
  const yt = {
    tytul: tytulYouTube(scen),
    // Ссылка на ютубе в описании кликабельна — там она полезна, в IG нет.
    opis: [tytul, wartosc.join(' '), dzialanie, 'zovu.pl', tagi].filter(Boolean).join(NL + NL),
  };
  // ТикТок: видно две строки — заголовок и действие, плюс одна мысль и 4 тега.
  const tt = [tytul, wartosc[0] || '', dzialanie, tagi.split(' ').slice(0, 4).join(' ')]
    .filter(Boolean)
    .join(NL + NL);
  return { ig, yt, tt };
}

// ── переписать подписи в очереди (ещё не вышедшие) ──────────────────
async function przepiszKolejke({ dry, tylkoStare = false }) {
  const PLIK = path.join(DIR, 'rolki', 'kolejka.json');
  const kolejka = JSON.parse(await readFile(PLIK, 'utf8'));
  let bank = [];
  try { bank = JSON.parse(await readFile(path.join(DIR, 'rolki', 'scenariusze-generowane.json'), 'utf8')); } catch {}
  const { znaneScenariusze } = await import('./generator-scenariuszy.mjs');
  const reczne = await znaneScenariusze().catch(() => []);
  let n = 0;
  for (const [i, poz] of kolejka.entries()) {
    if (poz.opublikowano) continue;
    // --tylko-stare: только записи, собранные до 28.10 (без своих подписей).
    if (tylkoStare && poz.tytulYT) continue;
    const scen = bank.find((s) => s.nazwa === poz.scenariusz) ||
      reczne.find((s) => s.nazwa === poz.scenariusz) || { temat: poz.temat, forma: poz.forma, nazwa: poz.scenariusz };
    const p = zbudujPodpisy(scen, { nr: i, opisZapasowy: poz.tekst });
    console.log(`[podpisy] ${poz.plik} (${poz.kiedy})\n  YT: ${p.yt.tytul}\n  IG:\n${p.ig.replace(/^/gm, '    ')}`);
    poz.tekst = p.ig;
    poz.tytulYT = p.yt.tytul;
    poz.opisYT = p.yt.opis;
    poz.podpisTT = p.tt;
    n++;
  }
  if (!dry && n) await writeFile(PLIK, JSON.stringify(kolejka, null, 2) + NL, 'utf8');
  console.log(`[podpisy] переписано: ${n}${dry ? ' (сухой прогон)' : ''}`);
}

if (process.argv[1]?.endsWith('podpisy.mjs') && process.argv.includes('--kolejka')) {
  await przepiszKolejke({ dry: process.argv.includes("--dry"), tylkoStare: process.argv.includes("--tylko-stare") });
}
