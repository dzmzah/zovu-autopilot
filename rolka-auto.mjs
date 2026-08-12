// Автоматический рилс ZOVU без ведущего.
//
// Собирается целиком из кусков, которые уже проверены на ролике с Kuba:
// караоке-подписи, титры с номерами, дрейф кадра, наезды, врезки, фирменный
// аутро, воздух и щелчки. Разница одна — вместо снятого человека подложка из
// живого стока, а речь синтезируется локально.
//
// Почему без лица. Клип Veo делается руками в браузере и стоит бонусов
// (50 в сутки на 5 клипов). Всё остальное — код, значит повторяется без нас.
// Лицо вернём, когда заработает локальная пересборка губ.
//
// Строение ролика — то, что реально держит досмотр:
//   ХУК (до 3 с) → три пункта → расплата → призыв
// Первая секунда решает всё: сразу боль зрителя, без «cześć» и разогрева.
//
//   node rolka-auto.mjs                  — собрать по сценарию из банка
//   node rolka-auto.mjs --scenariusz=2   — взять другой сценарий
//   node rolka-auto.mjs --bez-kontroli   — не проверять результат замерами
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { zbudujGlos } from './glos.mjs';
import { zbuduj } from './awatar-reel.mjs';
import { searchStock, fetchClip } from './stock.mjs';
import { sprawdzRolke } from './kontrola.mjs';

const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');
const NR = +((process.argv.find((a) => a.startsWith('--scenariusz=')) || '').split('=')[1] || 0);
const BEZ_KONTROLI = process.argv.includes('--bez-kontroli');

// ── банк сценариев ────────────────────────────────────────────────
// Пока их пишем сами. Когда встанет генерация — сюда будет класть Gemini,
// а рамки останутся те же: хук до трёх секунд, три пункта, расплата, призыв.
// `szukaj` — чем искать подложку под этот кусок: смысл фразы, а не её слова.
const SCENARIUSZE = [
  {
    nazwa: 'trzy-bledy-w-postach',
    temat: 'dlaczego posty nie sprzedają',
    opis: [
      'Ładny feed nie znaczy nic, jeśli nikt z niego nie kupuje.',
      '',
      'Zwykle to nie kwestia pomysłów ani budżetu. To trzy rzeczy, które robi prawie każdy — i każda z nich po cichu kosztuje klientów.',
      '',
      'Masz je w 20 sekund. Bez lania wody.',
      '',
      'Napisz „AUDYT" w wiadomości — przejrzymy twój profil i powiemy wprost, który z tych trzech błędów robisz. Za darmo, bez zobowiązań.',
      '',
      'zovu.pl',
      '',
      '#marketing #socialmedia #reels #agencjamarketingowa #contentmarketing #katowice #zovu',
    ].join('
'),
    czesci: [
      { rola: 'hak', tekst: 'Twój post zobaczyło sto osób.', szukaj: 'phone screen scrolling social media', pauza: 0.16 },
      { rola: 'hak', tekst: 'Napisała zero.', szukaj: 'empty phone notification screen', pauza: 0.34 },
      { rola: 'punkt', numer: 1, tytul: 'mówisz o sobie', tekst: 'Piszesz o sobie, a nie o kliencie.', szukaj: 'person filming himself phone', pauza: 0.30 },
      { rola: 'punkt', numer: 2, tytul: 'brak powodu', tekst: 'Nie dajesz powodu, żeby odpisać.', szukaj: 'bored person scrolling phone', pauza: 0.30 },
      { rola: 'punkt', numer: 3, tytul: 'znikasz', tekst: 'Znikasz na dwa tygodnie.', szukaj: 'calendar time passing clock', pauza: 0.26 },
      { rola: 'zaplata', tekst: 'Algorytm liczy każdy z tych dni.', szukaj: 'analytics graph screen data', pauza: 0.30 },
      { rola: 'cta', tekst: 'Napisz AUDYT, a powiemy który błąd robisz.', szukaj: 'typing message phone chat', pauza: 0.20 },
    ],
  },
];

// ── отбраковка хромакея ───────────────────────────────────────────
// На стоке полно клипов с зелёным экраном в телефоне — их снимают, чтобы
// заказчик подставил свою картинку. В готовом ролике такой кадр выглядит
// как незаконченная работа. Замерами это ловится однозначно:
//   зелёный экран — HUEAVG около 110 при SATAVG выше 18
//   живой кадр    — HUEAVG 209…270 при SATAVG 3…9
// Разница на порядок, ошибиться негде.
async function czyChromakey(plik) {
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      ['-v', 'error', '-ss', '1', '-i', plik, '-vf',
        'signalstats,metadata=print:key=lavfi.signalstats.HUEAVG:file=-',
        '-frames:v', '1', '-f', 'null', '-'],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    const { stdout: s2 } = await execFileAsync(
      'ffmpeg',
      ['-v', 'error', '-ss', '1', '-i', plik, '-vf',
        'signalstats,metadata=print:key=lavfi.signalstats.SATAVG:file=-',
        '-frames:v', '1', '-f', 'null', '-'],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    const hue = +(stdout.match(/HUEAVG=([0-9.-]+)/) || [])[1];
    const sat = +(s2.match(/SATAVG=([0-9.-]+)/) || [])[1];
    if (!Number.isFinite(hue) || !Number.isFinite(sat)) return false;
    return sat > 18 && hue > 80 && hue < 160;
  } catch {
    return false;
  }
}

async function podklad(czesc, i) {
  const kandydaci = await searchStock(czesc.szukaj, { perPage: 10, minSeconds: 4 });
  if (!kandydaci.length) return null;

  // Идём по списку, пока не попадётся кадр без хромакея. Смещение по `i`
  // нужно, чтобы два соседних куска не взяли один и тот же клип.
  for (let k = 0; k < Math.min(4, kandydaci.length); k++) {
    const kand = kandydaci[(i + k) % kandydaci.length];
    const c = await fetchClip(kand, { seconds: 6, name: `auto-${czesc.rola}-${i}-${k}` });
    if (await czyChromakey(c.file)) {
      console.log(`[rolka-auto] пропускаю ${path.basename(c.file)} — зелёный экран`);
      continue;
    }
    return c.file;
  }
  return null;
}

const scen = SCENARIUSZE[NR] || SCENARIUSZE[0];
console.log(`[rolka-auto] сценарий: ${scen.nazwa}`);

// 1. Голос. Фразы озвучиваются по одной — так границы каждой известны точно.
const glos = await zbudujGlos(
  scen.czesci.map((c) => ({ tekst: c.tekst, pauza: c.pauza, rola: c.rola })),
  { tmp: path.join(OUT, `${scen.nazwa}-glos`) }
);
console.log(`[rolka-auto] голос: ${glos.dlugosc.toFixed(2)} с, слов ${glos.slowa.length}`);

// 2. Подложка. Один кусок стока на одну фразу, длиной ровно в эту фразу
//    вместе с паузой после неё — чтобы картинка менялась вместе со смыслом.
const klipy = [];
for (const [i, c] of scen.czesci.entries()) {
  const plik = await podklad(c, i);
  if (!plik) throw new Error(`не нашёл подложку под «${c.szukaj}»`);
  const f = glos.frazy[i];
  const nastepna = glos.frazy[i + 1];
  const dlugosc = (nastepna ? nastepna.a : glos.dlugosc) - (i === 0 ? 0 : f.a);
  klipy.push({ plik, dlugosc: +dlugosc.toFixed(3), tekst: c.tekst, od: 0.4 });
  console.log(`[rolka-auto] ${c.rola}: ${path.basename(plik)}  ${dlugosc.toFixed(2)} с`);
}

// 3. Титры пунктов — на начало фразы, где пункт называется.
const tytuly = scen.czesci
  .map((c, i) => (c.numer ? { start: +(glos.frazy[i].a - 0.10).toFixed(2), dlugosc: 1.45, numer: String(c.numer), tekst: c.tytul } : null))
  .filter(Boolean);

// 4. График вместо стока на «расплате»: цифра, которая растёт, смотрится,
//    а готовая пролистывается.
const zaplataIdx = scen.czesci.findIndex((c) => c.rola === 'zaplata');
const wstawki = zaplataIdx >= 0
  ? [{
      start: +(glos.frazy[zaplataIdx].a - 0.12).toFixed(2),
      dlugosc: +((glos.frazy[zaplataIdx + 1]?.a ?? glos.dlugosc) - glos.frazy[zaplataIdx].a + 0.35).toFixed(2),
      typ: 'wykres',
      dni: 14,
      tytul: 'przerwa między postami',
      jednostka: 'dni',
      podpis: 'a algorytm liczy każdy z nich',
    }]
  : [];

const plan = {
  nazwa: `auto-${scen.nazwa}`,
  muzyka: path.join(DIR, 'music', 'pixabay-creative-technology-showreel.mp3'),
  podkladGlosnosc: 0.15,
  podkladOgon: 0.32,
  powietrzeTlo: 0.02,
  stukiGlosnosc: 0.5,
  najazd: 1.1,
  // Между разными сценами стока рез — норма, растворение тут не нужно:
  // это не два дубля одного лица, а смена кадра по смыслу.
  przejscie: 0,
  wjazdWstawki: 0.3,
  ogonPrzejscie: 0.4,
  akcent: '#a78bfa',
  akcentPas: '#7c3aed',
  dryf: true,
  karaoke: true,
  glos: { plik: glos.plik, slowa: glos.slowa },
  klipy,
  tytuly,
  wstawki,
  ogon: {
    marka: true,
    dlugosc: 3.8,
    adres: 'zovu.pl',
    linie: [
      { tekst: 'robimy treści', maly: false },
      { tekst: 'które sprzedają', maly: true },
    ],
  },
};

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, `${plan.nazwa}-plan.json`), JSON.stringify(plan, null, 2), 'utf8');

const wynik = await zbuduj(plan);
console.log('[rolka-auto] собрано:', JSON.stringify(wynik));

// Описание кладём рядом с роликом: очередь заберёт его вместе с файлом.
// Хук в описании ДРУГОЙ, чем в ролике — кто видео не досмотрел, цепляется
// за текст. Призыв — одно слово в директ: на такое отвечают чаще, и сразу
// видно, сколько людей пришло именно с этого рилса.
if (scen.opis) {
  await writeFile(path.join(OUT, `${plan.nazwa}-opis.txt`), scen.opis, 'utf8');
}

if (!BEZ_KONTROLI) {
  const kontrola = await sprawdzRolke(wynik.plik, {
    oczekiwanePrzejscia: [
      ...tytuly.map((t) => t.start),
      ...wstawki.map((w) => w.start),
      ...wstawki.map((w) => w.start + w.dlugosc),
      ...klipy.reduce((acc, k) => { acc.push((acc.at(-1) ?? 0) + k.dlugosc); return acc; }, []),
    ],
  });
  console.log('[rolka-auto] проверка:', JSON.stringify(kontrola, null, 1));
  if (!kontrola.zdal) {
    console.error('::error::рилс не прошёл проверку — публиковать нельзя');
    process.exitCode = 1;
  }
}
