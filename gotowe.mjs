// Собирает страницу с готовыми к публикации постами.
//
// Зачем: пока доступ к Graph API закрыт, автопилот всё равно делает посты и
// кладёт их в repo. Эта страница показывает их в один экран — с телефона
// достаточно нажать «скопировать подпись» и сохранить картинку.
//
// Страница живёт на GitHub Pages того же репозитория, поэтому обновляется
// сама при каждом прогоне.
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = process.env.CDN_REPO || import.meta.dirname;
const POSTS = path.join(DIR, 'posts');
const RAW = process.env.RAW_BASE || 'https://raw.githubusercontent.com/dzmzah/zovu-autopilot/main';

const pliki = await readdir(POSTS).catch(() => []);
const obrazki = pliki.filter((f) => /\.(jpe?g|png|mp4)$/i.test(f));

const posty = [];
for (const obraz of obrazki) {
  const baza = obraz.replace(/\.[^.]+$/, '');
  const podpis = pliki.includes(`${baza}.txt`) ? `${baza}.txt` : null;
  const s = await stat(path.join(POSTS, obraz)).catch(() => null);
  posty.push({ obraz, podpis, czas: s ? s.mtimeMs : 0, wideo: /\.mp4$/i.test(obraz) });
}
// свежие сверху — их и публикуют
posty.sort((a, b) => b.czas - a.czas);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── светофор наверху страницы ────────────────────────────────────
// Письмо от GitHub легко пропустить — блокировку 31.07 не замечали девять
// дней. Эта страница у Захара и так открывается с телефона, поэтому состояние
// автопилота показываем прямо здесь, первым экраном: одна строка, которую
// видно не читая. Данные те же, что у сторожа (doktor.mjs) — state.posted
// пишется только после реальной публикации.
async function stanAutopilota() {
  let s = {};
  try {
    s = JSON.parse(await readFile(path.join(DIR, 'state.json'), 'utf8'));
  } catch {
    return { klasa: 'zle', tytul: 'Nie wiem, co się dzieje', opis: 'Nie da się odczytać stanu autopilota.' };
  }
  let kolejka = [];
  try {
    kolejka = JSON.parse(await readFile(path.join(DIR, 'pending.json'), 'utf8'));
  } catch {
    kolejka = [];
  }
  const ile = Array.isArray(kolejka) ? kolejka.length : 0;

  const m = /^(\d{4}-\d{2}-\d{2})-(am|pm)$/.exec(String(s.posted || ''));
  if (!m) {
    return { klasa: 'zle', tytul: 'Publikacja nie ruszyła', opis: 'W stanie nie ma śladu żadnego opublikowanego postu.' };
  }
  const godzin = (Date.now() - Date.parse(`${m[1]}T${m[2] === 'am' ? '07' : '16'}:00:00Z`)) / 3600_000;
  const ogon = ile ? ` W kolejce czeka ${ile}.` : '';

  // тот же потолок, что у сторожа (doktor.mjs) — иначе плашка и письмо
  // рассказывали бы про разное состояние одной и той же системы
  if (godzin > 26) {
    const dni = Math.max(1, Math.floor(godzin / 24));
    return {
      klasa: 'zle',
      tytul: `Publikacja stoi ${dni} ${dni === 1 ? 'dzień' : 'dni'}`,
      opis: `Ostatni post: slot ${m[1]} ${m[2] === 'am' ? 'rano' : 'wieczorem'}.${ogon} Sprawdź pocztę — strażnik powinien był wysłać alarm.`,
    };
  }
  // Щадящий режим — не поломка, но объяснить надо: иначе «один пост вместо
  // двух» читается как сбой, а это ровно то, чем он не является.
  const lagodny = s.wznowiono && (Date.now() - Date.parse(s.wznowiono)) / 86400_000 < 7;
  return {
    klasa: 'ok',
    tytul: 'Autopilot działa',
    opis: `Ostatni post ${godzin.toFixed(0)} h temu (slot ${m[1]} ${m[2] === 'am' ? 'rano' : 'wieczorem'}).`
      + (lagodny ? ' Tryb łagodny po blokadzie: jeden post dziennie przez tydzień.' : '')
      + ogon,
  };
}

const stan = await stanAutopilota();

// ── рилсы: что выйдет и что уже вышло ────────────────────────────
// Недельная проверка Захаром выглядит так: открыть страницу с телефона.
// Значит на ней должно быть видно не только посты, но и ролики — причём
// ЗАРАНЕЕ, пока их ещё можно снять с выкладки. Раньше это можно было
// увидеть только в репозитории, то есть практически никогда.
//
// Цифры показываем рядом с формой ролика: «охват 800» сам по себе не
// говорит ничего, а «одна цифра — досмотр 61%, список — 38%» говорит всё.
async function rolki() {
  let kolejka = [];
  try {
    kolejka = JSON.parse(await readFile(path.join(DIR, 'rolki', 'kolejka.json'), 'utf8'));
  } catch {
    return null;
  }
  let wyniki = [];
  try {
    wyniki = JSON.parse(await readFile(path.join(DIR, 'rolki', 'wyniki.json'), 'utf8'));
  } catch {
    wyniki = [];
  }
  const poId = new Map(wyniki.map((w) => [w.id, w]));

  const czekaja = kolejka
    .filter((p) => !p.opublikowano && p.kiedy)
    .sort((a, b) => Date.parse(a.kiedy) - Date.parse(b.kiedy));
  const wyszly = kolejka
    .filter((p) => p.opublikowano)
    .sort((a, b) => Date.parse(b.opublikowano) - Date.parse(a.opublikowano))
    .slice(0, 8);

  return { czekaja, wyszly, poId };
}

const r = await rolki();

const dzien = (s) =>
  new Date(s).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const kartaRolki = (p, wynik) => {
  const d = wynik?.dane || {};
  const liczby = wynik
    ? `<div class="liczby">` +
      [
        d.reach != null ? `zasięg <b>${d.reach}</b>` : null,
        d.plays != null ? `odtworzenia <b>${d.plays}</b>` : null,
        d.saved != null ? `zapisy <b>${d.saved}</b>` : null,
        d.shares != null ? `udostępnienia <b>${d.shares}</b>` : null,
        wynik.dosmotr != null ? `obejrzane <b>${wynik.dosmotr}%</b>` : null,
      ]
        .filter(Boolean)
        .join(' · ') +
      `</div>`
    : '';
  return `<article class="rolka">
    <video src="${RAW}/rolki/${p.plik}" controls playsinline preload="metadata"></video>
    <div class="pod">
      <div class="data">${esc(dzien(p.opublikowano || p.kiedy))}${p.forma ? ` · <span class="forma">${esc(p.forma)}</span>` : ''}${p.dlugosc ? ` · ${p.dlugosc} s` : ''}</div>
      ${p.temat ? `<div class="temat">${esc(p.temat)}</div>` : ''}
      ${liczby}
    </div>
  </article>`;
};

const sekcjaRolek = !r
  ? ''
  : `<h2>Rolki</h2>
<p class="info">Najbliższe wyjdą same o 13:00. Obejrzyj zanim wyjdą — jeszcze można zdjąć.</p>
${r.czekaja.map((p) => kartaRolki(p, null)).join('\n') || '<p class="info">Kolejka pusta.</p>'}
${
  r.wyszly.length
    ? `<h2>Już wyszły</h2>\n` +
      r.wyszly.map((p) => kartaRolki(p, r.poId.get(p.wynik?.instagram))).join('\n')
    : ''
}`;

const karty = posty
  .slice(0, 40)
  .map((p) => {
    const data = new Date(p.czas).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
    const media = p.wideo
      ? `<video src="${RAW}/posts/${p.obraz}" controls playsinline></video>`
      : `<img src="${RAW}/posts/${p.obraz}" alt="" loading="lazy">`;
    return `<article class="post" data-podpis="${p.podpis ? `${RAW}/posts/${p.podpis}` : ''}">
      ${media}
      <div class="pod">
        <div class="data">${esc(data)}</div>
        <pre class="tekst">ładowanie…</pre>
        <div class="akcje">
          <button class="kopiuj">Kopiuj podpis</button>
          <a class="pobierz" href="${RAW}/posts/${p.obraz}" download>Pobierz${p.wideo ? ' wideo' : ' zdjęcie'}</a>
        </div>
      </div>
    </article>`;
  })
  .join('\n');

const html = `<!doctype html><html lang="pl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ZOVU — posty gotowe do publikacji</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0a0a0a; color:#fff; font-family:system-ui,-apple-system,sans-serif;
    padding:16px; max-width:760px; margin:0 auto; }
  h1 { font-size:20px; letter-spacing:-.02em; }
  .info { color:#9a9a9a; font-size:13px; margin:6px 0 18px; line-height:1.5; }
  .post { background:#141414; border:1px solid #262626; border-radius:16px;
    overflow:hidden; margin-bottom:18px; }
  .post img, .post video { width:100%; display:block; }
  .pod { padding:12px 14px 14px; }
  .data { font-size:12px; color:#7a7a7a; margin-bottom:8px; }
  .tekst { white-space:pre-wrap; font-size:13px; line-height:1.5; color:#e4e4e4;
    font-family:inherit; max-height:190px; overflow:auto; }
  .akcje { display:flex; gap:8px; margin-top:12px; }
  button, .pobierz { flex:1; text-align:center; border:0; border-radius:10px;
    padding:11px 12px; font-size:14px; font-weight:600; cursor:pointer;
    text-decoration:none; }
  button { background:#d4ff3f; color:#0a0a0a; }
  button.ok { background:#2f7d32; color:#fff; }
  .pobierz { background:#242424; color:#fff; }
  .stan { border-radius:14px; padding:14px 16px; margin:0 0 18px;
    border:1px solid; display:flex; gap:12px; align-items:flex-start; }
  .stan .kropka { width:10px; height:10px; border-radius:50%; margin-top:5px; flex:none; }
  .stan b { display:block; font-size:15px; margin-bottom:3px; }
  .stan span { font-size:13px; line-height:1.5; color:#b8b8b8; }
  .stan.ok { background:#0f1b0f; border-color:#25451f; }
  .stan.ok .kropka { background:#61d345; }
  .stan.zle { background:#1e0f0f; border-color:#5a2020; }
  .stan.zle .kropka { background:#ff4d4d; }
  h2 { font-size:17px; letter-spacing:-.02em; margin:26px 0 4px; }
  .rolka { background:#141414; border:1px solid #262626; border-radius:16px;
    overflow:hidden; margin-bottom:14px; display:flex; gap:12px; align-items:stretch; }
  .rolka video { width:104px; flex:none; display:block; background:#000; object-fit:cover; }
  .rolka .pod { padding:12px 14px 12px 0; display:flex; flex-direction:column; justify-content:center; }
  .rolka .temat { font-size:14px; color:#e4e4e4; line-height:1.4; margin-top:3px; }
  .rolka .forma { color:#d4ff3f; }
  .liczby { font-size:12px; color:#9a9a9a; margin-top:7px; line-height:1.6; }
  .liczby b { color:#fff; font-weight:600; }
</style></head><body>
<h1>Posty gotowe do publikacji</h1>
<div class="stan ${stan.klasa}">
  <div class="kropka"></div>
  <div><b>${esc(stan.tytul)}</b><span>${esc(stan.opis)}</span></div>
</div>
<p class="info">Autopilot publikuje sam do Instagrama i Facebooka.
Tu leżą te same posty do ręcznej publikacji — skopiuj podpis, pobierz zdjęcie.
Najnowsze na górze.</p>
${sekcjaRolek}
<h2>Posty</h2>
${karty || '<p class="info">Na razie pusto.</p>'}
<script>
for (const el of document.querySelectorAll('.post')) {
  const url = el.dataset.podpis;
  const pre = el.querySelector('.tekst');
  const btn = el.querySelector('.kopiuj');
  if (!url) { pre.textContent = '(bez podpisu)'; btn.disabled = true; continue; }
  fetch(url).then(r => r.text()).then(t => { pre.textContent = t.trim(); })
    .catch(() => { pre.textContent = '(nie udało się wczytać)'; });
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      btn.textContent = 'Skopiowane';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = 'Kopiuj podpis'; btn.classList.remove('ok'); }, 1600);
    } catch {
      // на części telefonów schowek wymaga zaznaczenia ręcznego
      const r = document.createRange();
      r.selectNodeContents(pre);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      btn.textContent = 'Zaznaczone — skopiuj';
    }
  });
}
</script></body></html>`;

await writeFile(path.join(DIR, 'index.html'), html, 'utf8');
console.log(`[gotowe] strona zbudowana, postów: ${posty.length}`);
