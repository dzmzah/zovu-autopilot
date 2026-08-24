// Панель: что вышло, что ждёт, что сломалось.
//
// Зачем. Захар спрашивает «всё ли выложилось» — и до сих пор ответ приходилось
// собирать вручную из очереди, состояния постов и логов. Панель отвечает за
// секунду и с телефона.
//
// Живёт на GitHub Pages того же репозитория, поэтому обновляется сама при
// каждом прогоне: сборка, выкладка, сторож — все трогают её последним шагом.
//
//   node panel.mjs            — собрать panel.html
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DIR = import.meta.dirname;

const czytaj = async (p, zapas) => {
  try {
    return JSON.parse(await readFile(path.join(DIR, p), 'utf8'));
  } catch {
    return zapas;
  }
};

const kolejka = await czytaj('rolki/kolejka.json', []);
const stan = await czytaj('state.json', {});
const wyniki = await czytaj('rolki/wyniki.json', []);
let posty = [];
try {
  posty = (await readdir(path.join(DIR, 'posts'))).filter((f) => f.endsWith('.txt'));
} catch {}

// Польское время: вся лента живёт по нему, и «сегодня» тоже должно быть по нему.
const TERAZ = new Date();
const dzien = (d) =>
  new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }); // YYYY-MM-DD
const godzina = (d) =>
  new Date(d).toLocaleTimeString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
  });
const DZIS = dzien(TERAZ);

// ── что должно было выйти сегодня ────────────────────────────────
// Пост утром, пост вечером, рилс по расписанию очереди. Всё остальное —
// подробности; на светофоре только это.
const postyDzis = posty.filter((f) => f.startsWith(`auto-${DZIS}`));
const slotOstatni = String(stan.posted || '');
const rankiem = slotOstatni.startsWith(DZIS) || postyDzis.length >= 1;
const wieczorem = postyDzis.length >= 2 || slotOstatni === `${DZIS}-pm`;

const rolkiDzis = kolejka.filter((p) => p.kiedy && dzien(p.kiedy) === DZIS);
const rolkaWyszla = rolkiDzis.some((p) => p.opublikowano);
const rolkaCzeka = rolkiDzis.some((p) => !p.opublikowano);

// ── тревоги ──────────────────────────────────────────────────────
const alarmy = [];
const godzTeraz = +new Date(TERAZ).toLocaleString('en-GB', {
  timeZone: 'Europe/Warsaw',
  hour: '2-digit',
  hour12: false,
});
if (!rankiem && godzTeraz >= 11) alarmy.push('утренний пост не вышел');
if (!wieczorem && godzTeraz >= 20) alarmy.push('вечерний пост не вышел');
if (rolkaCzeka && godzTeraz >= 22) alarmy.push('рилс на сегодня так и не вышел');

const czekaja = kolejka.filter((p) => !p.opublikowano);
if (!czekaja.length) alarmy.push('очередь рилсов пуста — завтра выкладывать нечего');

const opublikowane = kolejka.filter((p) => p.opublikowano).slice(-12).reverse();

// Сеть считается доставленной, если в результате есть её идентификатор.
const SIECI = [
  ['instagram', 'ig', 'IG'],
  ['facebook', 'fb', 'FB'],
  ['youtube', 'yt', 'YT'],
  ['tiktok', 'tt', 'TT'],
];
for (const p of opublikowane.slice(0, 3)) {
  for (const [klucz, krotki, nazwa] of SIECI) {
    if ((p.sieci || []).includes(krotki) && !p.wynik?.[klucz]) {
      alarmy.push(`${p.plik}: ${nazwa} не принял`);
    }
  }
}

// ── цифры ────────────────────────────────────────────────────────
const zZasiegiem = wyniki.filter((w) => w.dane?.reach != null);
const zDosmotrem = wyniki.filter((w) => w.dosmotr != null && w.dosmotr < 100);
const sr = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const srZasieg = sr(zZasiegiem.map((w) => w.dane.reach));
const srDosmotr = sr(zDosmotrem.map((w) => w.dosmotr));
const zapisy = wyniki.reduce((a, w) => a + (w.dane?.saved || 0), 0);
const wyslania = wyniki.reduce((a, w) => a + (w.dane?.shares || 0), 0);

const esc = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

const swiatlo = (ok, czeka) =>
  ok ? '<i class="lampka ok"></i>' : czeka ? '<i class="lampka czeka"></i>' : '<i class="lampka zle"></i>';

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZOVU — что вышло</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
:root{--tlo:#f6f4fa;--karta:#fff;--obwod:#e4dff2;--linia:#efebf8;--tekst:#17122c;
 --cichy:#645c85;--akcent:#5b32e0;--ok:#0f766e;--czeka:#b45309;--zle:#be123c}
@media(prefers-color-scheme:dark){:root{--tlo:#0c0a15;--karta:#151228;--obwod:#2a2246;
 --linia:#221b3b;--tekst:#efeaff;--cichy:#9c93bd;--akcent:#9b7bff;--ok:#2dd4bf;
 --czeka:#fbbf24;--zle:#fb7185}}
*{box-sizing:border-box}
body{margin:0;background:var(--tlo);color:var(--tekst);font:16px/1.55 Inter,system-ui,sans-serif;
 padding:clamp(16px,4vw,40px) clamp(12px,4vw,28px)}
.stos{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:30px}
h1{font-size:clamp(22px,5vw,32px);margin:0;letter-spacing:-.02em}
.data{font:600 11px/1 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--akcent)}
h2{font-size:16px;margin:0 0 10px;letter-spacing:-.01em}
.karta{background:var(--karta);border:1px solid var(--obwod);border-radius:14px;padding:16px 18px}
/* Имена длиннее одной буквы нарочно: короткий .c уже занят карточкой цифр,
   и светофор наследовал её отступы — кружок раздувался в кляксу. */
.lampka{width:11px;height:11px;border-radius:50%;display:inline-block;flex:0 0 11px}
.lampka.ok{background:var(--ok)}
.lampka.czeka{background:var(--czeka)}
.lampka.zle{background:var(--zle)}
.dzis{display:flex;flex-direction:column;gap:10px}
.rz{display:flex;align-items:center;gap:11px;font-size:15px}
.rz b{font-weight:600}
.rz span{color:var(--cichy);font-size:13.5px;margin-left:auto;font-family:'IBM Plex Mono',monospace}
.alarm{background:color-mix(in srgb,var(--zle) 12%,transparent);
 border:1px solid color-mix(in srgb,var(--zle) 40%,transparent)}
.alarm h2{color:var(--zle)}
.alarm ul{margin:0;padding-left:20px}.alarm li{margin-bottom:5px}
.lista{display:flex;flex-direction:column}
.poz{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;
 padding:11px 2px;border-bottom:1px solid var(--linia)}
.poz .kiedy{font:600 12px/1 'IBM Plex Mono',monospace;color:var(--cichy);flex:0 0 auto}
.poz .co{flex:1 1 200px;font-size:14px}
.sieci{display:flex;gap:5px}
.s{font:600 10px/1 'IBM Plex Mono',monospace;padding:4px 6px;border-radius:5px;
 background:var(--linia);color:var(--cichy)}
.s.jest{background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok)}
.s.brak{background:color-mix(in srgb,var(--zle) 18%,transparent);color:var(--zle)}
.cyfry{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.c{background:var(--karta);border:1px solid var(--obwod);border-radius:12px;padding:14px 16px}
.c b{display:block;font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}
.c span{font-size:12.5px;color:var(--cichy)}
footer{color:var(--cichy);font-size:12.5px;border-top:1px solid var(--linia);padding-top:14px;
 font-family:'IBM Plex Mono',monospace}
</style></head><body><div class="stos">

<header>
  <div class="data">${DZIS} · ${godzina(TERAZ)} по Польше</div>
  <h1>Что вышло</h1>
</header>

${alarmy.length ? `<section class="karta alarm">
  <h2>Требует внимания</h2>
  <ul>${alarmy.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
</section>` : ''}

<section class="karta">
  <h2>Сегодня</h2>
  <div class="dzis">
    <div class="rz">${swiatlo(rankiem)}<b>Пост утром</b><span>${rankiem ? 'вышел' : 'ждём'}</span></div>
    <div class="rz">${swiatlo(wieczorem, godzTeraz < 18)}<b>Пост вечером</b><span>${wieczorem ? 'вышел' : godzTeraz < 18 ? 'по расписанию' : 'ждём'}</span></div>
    <div class="rz">${swiatlo(rolkaWyszla, rolkaCzeka)}<b>Рилс</b><span>${
      rolkaWyszla ? 'вышел' : rolkaCzeka ? 'ждёт' : 'на сегодня не планировался'
    }</span></div>
  </div>
</section>

<section>
  <h2>Последние рилсы</h2>
  <div class="lista">
    ${opublikowane
      .map(
        (p) => `<div class="poz">
      <span class="kiedy">${dzien(p.opublikowano).slice(5)} ${godzina(p.opublikowano)}</span>
      <span class="co">${esc(p.scenariusz || p.plik)}</span>
      <span class="sieci">${SIECI.map(([klucz, krotki, nazwa]) => {
        const chciano = (p.sieci || []).includes(krotki);
        const jest = Boolean(p.wynik?.[klucz]);
        return `<span class="s ${jest ? 'jest' : chciano ? 'brak' : ''}">${nazwa}</span>`;
      }).join('')}</span>
    </div>`
      )
      .join('')}
  </div>
</section>

<section>
  <h2>Ждут очереди</h2>
  ${
    czekaja.length
      ? `<div class="lista">
    ${czekaja
      .map(
        (p) => `<div class="poz">
      <span class="kiedy">${dzien(p.kiedy).slice(5)} ${godzina(p.kiedy)}</span>
      <span class="co">${esc(p.scenariusz || p.plik)}</span>
      <span class="sieci">${(p.sieci || [])
        .map((x) => `<span class="s">${x.toUpperCase()}</span>`)
        .join('')}</span>
    </div>`
      )
      .join('')}
  </div>`
      : '<div class="karta">Пусто — завтра выкладывать нечего.</div>'
  }
</section>

<section>
  <h2>Цифры по ${wyniki.length} роликам</h2>
  <div class="cyfry">
    <div class="c"><b>${srZasieg == null ? '—' : srZasieg.toFixed(0)}</b><span>средний охват</span></div>
    <div class="c"><b>${srDosmotr == null ? '—' : srDosmotr.toFixed(0) + '%'}</b><span>досмотр</span></div>
    <div class="c"><b>${zapisy}</b><span>сохранений</span></div>
    <div class="c"><b>${wyslania}</b><span>пересылок</span></div>
  </div>
</section>

<footer>
  Обновляется сама при каждом прогоне: сборка, выкладка, сторож.<br>
  Постов в папке: ${posty.length} · последний слот: ${esc(stan.posted || '—')}
</footer>

</div></body></html>`;

await writeFile(path.join(DIR, 'panel.html'), html, 'utf8');
console.log(
  `[panel] собрана: сегодня пост-утро ${rankiem ? 'есть' : 'нет'}, ` +
    `вечер ${wieczorem ? 'есть' : 'нет'}, рилс ${rolkaWyszla ? 'есть' : rolkaCzeka ? 'ждёт' : '—'}` +
    (alarmy.length ? ` · ТРЕВОГ: ${alarmy.length}` : '')
);
