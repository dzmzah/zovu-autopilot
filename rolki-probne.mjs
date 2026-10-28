// Пробные рилсы (Trial Reels) — повтор лучших роликов для НЕподписчиков.
//
// 28.10.2026, добро Mat + Zahar: «повторная публикация залетевших рилс как
// пробных для неподписчиков». Instagram показывает пробный рилс только тем,
// кто на нас не подписан; подписчики его не видят, поэтому повтор не
// засоряет нашу ленту. С `graduation_strategy: SS_PERFORMANCE` Instagram сам
// переводит пробный в обычный, если он показал себя хорошо.
//
// API проверен по официальной документации (IG User /media, параметр
// `trial_params` → `graduation_strategy` = MANUAL | SS_PERFORMANCE, только
// для media_type=REELS, 28.10.2026). Ничего не подделываем: если Instagram
// отказал — пишем отказ в журнал и красный прогон, а не «успех».
//
// Правила:
//   • раз в день, не больше одного;
//   • кандидат — вышедший ≥ 7 дней назад рилс из wyniki.json, лучший по
//     среднему времени просмотра (без петель) и охвату;
//   • один ролик второй раз пробным не идёт никогда;
//   • подпись НОВАЯ: другая первая строка + формула podpisy.mjs.
//
// Журнал: rolki/probne.json.
//
//   node rolki-probne.mjs          — выложить сегодняшний пробный
//   node rolki-probne.mjs --dry    — показать выбор и подпись, ничего не слать
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { zbudujPodpisy } from './podpisy.mjs';

const DIR = import.meta.dirname;
const DRY = process.argv.includes('--dry');
const IG_API = 'https://graph.instagram.com/v23.0';
const RAW_BASE = process.env.RAW_BASE || 'https://raw.githubusercontent.com/dzmzah/zovu-autopilot/main';
const STAN = path.join(DIR, 'rolki', 'probne.json');
const MIN_DNI = 7;
const STRATEGIA = 'SS_PERFORMANCE';

const czytaj = async (p, zapas) => {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return zapas; }
};
const dzienPL = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);
const pierwszaLinia = (t) => String(t || '').split('\n')[0].trim().toLowerCase();

// Оценка: секунды просмотра (обрезанные длиной ролика — петли Instagram
// складывает в среднее, и один пересмотренный ролик показывал 1042 %) ×
// логарифм охвата (охват 200 не должен в сто раз перевешивать охват 2).
export function ocena(w, dlugosc) {
  const sek = (w.dane?.ig_reels_avg_watch_time || 0) / 1000;
  const zasieg = w.dane?.reach || 0;
  const d = dlugosc || w.dlugosc || 30;
  // Логарифм охвата в квадрате: время просмотра без охвата — это три
  // человека, крутившие ролик по кругу, а не сигнал для новых людей.
  return Math.min(sek, d) * Math.log2(2 + zasieg) ** 2;
}

export async function wybierzKandydata({ teraz = Date.now() } = {}) {
  const wyniki = await czytaj(path.join(DIR, 'rolki', 'wyniki.json'), []);
  const kolejka = await czytaj(path.join(DIR, 'rolki', 'kolejka.json'), []);
  const stan = await czytaj(STAN, []);
  const wyszle = stan.filter((s) => s.status === 'opublikowano');
  const juz = new Set(wyszle.map((s) => s.plik));
  // Тот же сценарий другим дублем — тоже повтор для зрителя.
  const juzScen = new Set(wyszle.map((s) => s.scenariusz).filter(Boolean));
  const kandydaci = [];
  for (const w of wyniki) {
    if (!w.plik || juz.has(w.plik) || juzScen.has(w.scenariusz) || !w.id) continue;
    const kiedy = Date.parse(w.opublikowano || '');
    if (!Number.isFinite(kiedy) || teraz - kiedy < MIN_DNI * 86400000) continue;
    if (typeof w.dane?.ig_reels_avg_watch_time !== 'number' || typeof w.dane?.reach !== 'number') continue;
    try { await access(path.join(DIR, 'rolki', w.plik)); } catch { continue; }
    const poz = kolejka.find((p) => p.plik === w.plik) || {};
    kandydaci.push({ w, poz, ocena: ocena(w, poz.dlugosc) });
  }
  // Охват не ниже медианы: ролик, который три человека крутили по кругу,
  // даёт огромное «время просмотра», но это не сигнал для новых людей.
  const zasiegi = kandydaci.map((k) => k.w.dane.reach).sort((a, b) => a - b);
  const mediana = zasiegi.length ? zasiegi[Math.floor(zasiegi.length / 2)] : 0;
  const pula = kandydaci.filter((k) => k.w.dane.reach >= mediana && k.w.scenariusz);
  pula.sort((a, b) => b.ocena - a.ocena);
  return { kandydaci: pula, stan, mediana };
}

// Сценарий для подписи: из банка генератора (там есть podpis/plyta), иначе
// из ручного банка (тема и фразы), иначе из паспорта в очереди.
async function scenariusz(nazwa, poz) {
  const g = await czytaj(path.join(DIR, 'rolki', 'scenariusze-generowane.json'), []);
  const s = g.find((x) => x.nazwa === nazwa);
  if (s) return s;
  try {
    const { znaneScenariusze } = await import('./generator-scenariuszy.mjs');
    const r = (await znaneScenariusze()).find((x) => x.nazwa === nazwa);
    if (r) return { ...r, forma: poz.forma };
  } catch { /* ручной банк недоступен — хватит паспорта */ }
  return { nazwa, temat: poz.temat, forma: poz.forma };
}

export async function podpisProby(w, poz, nr) {
  const scen = await scenariusz(w.scenariusz || poz.scenariusz, poz);
  const stara = pierwszaLinia(poz.tekst);
  // Первая строка обязана отличаться от той, с которой ролик вышел: пробный
  // видят новые люди, но Instagram сверяет и подписи.
  let p = zbudujPodpisy(scen, { nr, opisZapasowy: poz.tekst });
  if (pierwszaLinia(p.ig) === stara) {
    const tytul = scen.temat ? scen.temat[0].toUpperCase() + scen.temat.slice(1).replace(/[.!?]?$/, '.') : 'Zobacz, jak to robimy.';
    p = zbudujPodpisy({ ...scen, podpis: { ...(scen.podpis || {}), tytul }, plyta: null }, { nr, opisZapasowy: poz.tekst });
  }
  return p.ig;
}

async function igToken() {
  try {
    const store = await import('./token-store.mjs');
    const { token } = await store.loadInstagramToken();
    if (token) return token;
  } catch { /* запасной путь ниже */ }
  return process.env.INSTAGRAM_TOKEN || null;
}

async function ig(sciezka, body) {
  const r = await fetch(`${IG_API}/${sciezka}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${sciezka}: ${JSON.stringify(j.error || j).slice(0, 400)}`);
  return j;
}

async function czekaj(id, token, minut = 6) {
  const koniec = Date.now() + minut * 60000;
  while (Date.now() < koniec) {
    const r = await fetch(`${IG_API}/${id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const j = await r.json();
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR') throw new Error(`контейнер с ошибкой: ${j.status || ''}`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error('контейнер не обработался');
}

if (process.argv[1]?.endsWith('rolki-probne.mjs')) {
  const { kandydaci, stan, mediana } = await wybierzKandydata();
  const dzis = dzienPL();
  if (stan.some((s) => s.dzien === dzis && s.status === 'opublikowano')) {
    console.log(`[probne] сегодня (${dzis}) пробный уже вышел — следующий завтра`);
    process.exit(0);
  }
  console.log(`[probne] кандидатов: ${kandydaci.length} (охват ≥ медианы ${mediana})`);
  for (const k of kandydaci.slice(0, 5)) {
    console.log(`  ${k.ocena.toFixed(1)}  ${k.w.plik}  ${k.w.scenariusz}  просмотр ${(k.w.dane.ig_reels_avg_watch_time / 1000).toFixed(1)} с, охват ${k.w.dane.reach}`);
  }
  const wyb = kandydaci[0];
  if (!wyb) {
    console.log('[probne] нечего повторять: нет вышедших ≥ 7 дней назад и ещё не пробных');
    process.exit(0);
  }
  const caption = await podpisProby(wyb.w, wyb.poz, stan.length);
  const url = `${RAW_BASE}/rolki/${encodeURIComponent(wyb.w.plik)}`;
  console.log(`[probne] выбран ${wyb.w.plik} (${wyb.w.scenariusz}), ссылка ${url}\n[probne] новая подпись:\n${caption}`);
  if (DRY) {
    console.log('[probne] сухой прогон — ничего не публикую');
    process.exit(0);
  }
  const wpis = { dzien: dzis, plik: wyb.w.plik, scenariusz: wyb.w.scenariusz, oryginal: wyb.w.id, ocena: +wyb.ocena.toFixed(2), strategia: STRATEGIA, podpis: caption.split('\n')[0] };
  try {
    const token = await igToken();
    if (!token) throw new Error('нет токена Instagram');
    const kont = await ig('me/media', {
      media_type: 'REELS',
      video_url: url,
      caption,
      trial_params: { graduation_strategy: STRATEGIA },
      access_token: token,
    });
    await czekaj(kont.id, token);
    const pub = await ig('me/media_publish', { creation_id: kont.id, access_token: token });
    Object.assign(wpis, { status: 'opublikowano', id: pub.id, kiedy: new Date().toISOString() });
    console.log(`[probne] пробный рилс вышел: ${pub.id}`);
  } catch (e) {
    // Отказ тоже пишем: ролик не должен уйти в повтор завтра вслепую, а
    // человек должен видеть ПРИЧИНУ. Но плохим этот ролик не считаем — его
    // можно повторить, когда починят, поэтому статус отдельный.
    Object.assign(wpis, { status: 'blad', blad: String(e.message).slice(0, 300), kiedy: new Date().toISOString() });
    console.error(`::error::[probne] Instagram не принял пробный рилс: ${e.message}`);
    process.exitCode = 1;
  }
  // Ошибочную попытку держим в журнале, но повторять ролик разрешаем.
  const nowy = stan.filter((s) => !(s.plik === wpis.plik && s.status === 'blad'));
  nowy.push(wpis);
  await writeFile(STAN, JSON.stringify(nowy, null, 2) + '\n', 'utf8');
}
