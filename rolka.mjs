// Публикация ГОТОВОГО рилса из папки `rolki/` в Instagram и Facebook.
//
// Отличие от `run-once.mjs`: тот сам придумывает пост и сам его рисует. Здесь
// ролик уже смонтирован руками (или движком `awatar-reel.mjs`), от нас нужна
// только выкладка. Поэтому очередь простая: файл, текст, время.
//
// Очередь лежит в `rolki/kolejka.json`:
//   [{ "plik": "kuba-trzy-powody.mp4", "kiedy": "2026-08-12T18:00:00+02:00",
//      "tekst": "...", "sieci": ["ig","fb"], "opublikowano": null }]
//
// Воркфлоу дёргает этот файл раз в час: публикуется всё, чему время пришло и
// что ещё не отмечено. Отметка пишется обратно в очередь и коммитится —
// поэтому повторный запуск не выложит один рилс дважды.
//
//   node rolka.mjs           — опубликовать всё созревшее
//   node rolka.mjs --dry     — только показать, что бы сделал
//   node rolka.mjs --teraz   — игнорировать время, выложить первое незакрытое
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
const TERAZ = process.argv.includes('--teraz');
const DIR = import.meta.dirname;
const KOLEJKA = path.join(DIR, 'rolki', 'kolejka.json');
const RAW_BASE =
  process.env.RAW_BASE || 'https://raw.githubusercontent.com/dzmzah/zovu-autopilot/main';
const IG_API = 'https://graph.instagram.com/v23.0';
const FB_API = 'https://graph.facebook.com/v21.0';

function env(k) {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
}

// Живой токен лежит в `token.enc` и расшифровывается ключом `TOKEN_KEY`.
// Секрет `INSTAGRAM_TOKEN` в GitHub давно протух — молча падать на него
// нельзя, публикация умирает с невнятным «Cannot parse access token».
// Поэтому источник печатаем.
async function igToken() {
  try {
    const store = await import('./token-store.mjs');
    const { token, fromStore } = await store.loadInstagramToken();
    console.log(`[rolka] токен Instagram: ${fromStore ? 'из хранилища' : 'ИЗ ОКРУЖЕНИЯ (запасной)'}`);
    if (token) return token;
  } catch (e) {
    console.warn(`[rolka] хранилище токена недоступно: ${e.message}`);
  }
  return env('INSTAGRAM_TOKEN');
}

// У Instagram и у страницы Facebook РАЗНЫЕ хосты и разные токены.
// Токен из `token.enc` — инстаграмовский, на `graph.facebook.com` он не
// парсится вовсе: «Cannot parse access token». Именно на это и упала первая
// попытка публикации. Хост берём тот же, что у автопилота, он проверен.
async function ig(sciezka, body) {
  const r = await fetch(`${IG_API}/${sciezka}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`${sciezka}: ${JSON.stringify(j.error || j)}`);
  return j;
}

async function fb(sciezka, params) {
  const r = await fetch(`${FB_API}/${sciezka}`, {
    method: 'POST',
    body: new URLSearchParams(params),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${sciezka}: ${j.error.message}`);
  return j;
}

// Видео Meta обрабатывает не мгновенно: контейнер надо дождаться. Без этого
// публикация падает с «media not ready» на совершенно исправном файле.
async function czekajNaKontener(id, token, minut = 5) {
  const koniec = Date.now() + minut * 60000;
  while (Date.now() < koniec) {
    const r = await fetch(`${IG_API}/${id}?fields=status_code,status&access_token=${token}`);
    const j = await r.json();
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR') throw new Error(`контейнер с ошибкой: ${j.status || ''}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error('контейнер не обработался за отведённое время');
}

async function naInstagram(url, tekst) {
  const token = await igToken();
  if (!token) throw new Error('нет токена Instagram');
  const kontener = await ig('me/media', {
    media_type: 'REELS',
    video_url: url,
    caption: tekst,
    share_to_feed: true,
    access_token: token,
  });
  await czekajNaKontener(kontener.id, token);
  const wynik = await ig('me/media_publish', {
    creation_id: kontener.id,
    access_token: token,
  });
  return wynik.id;
}

async function naFacebook(url, tekst) {
  const token = env('FACEBOOK_PAGE_TOKEN');
  const strona = env('FACEBOOK_PAGE_ID');
  if (!token || !strona) throw new Error('нет токена или ID страницы Facebook');
  // У страниц отдельный узел для видео; рилсы страницы принимают как video.
  const wynik = await fb(`${strona}/videos`, {
    file_url: url,
    description: tekst,
    access_token: token,
  });
  return wynik.id;
}

const kolejka = JSON.parse(await readFile(KOLEJKA, 'utf8'));
const teraz = Date.now();
let zmiany = false;

for (const poz of kolejka) {
  if (poz.opublikowano) continue;

  // `--teraz` — это «выложи ПЕРВЫЙ незакрытый», а не «выложи всё». Иначе
  // ручной запуск при очереди из двух роликов отправит оба разом, а два
  // рилса в сутки — ровно тот темп, после которого Meta нас уже сносила.
  if (TERAZ && zmiany) {
    console.log(`[rolka] ${poz.plik}: ручной запуск публикует только один, остальное по расписанию`);
    break;
  }

  const czas = new Date(poz.kiedy).getTime();
  if (!TERAZ && (Number.isNaN(czas) || czas > teraz)) {
    console.log(`[rolka] ${poz.plik}: ждёт до ${poz.kiedy}`);
    continue;
  }

  const url = `${RAW_BASE}/rolki/${encodeURIComponent(poz.plik)}`;
  const sieci = poz.sieci && poz.sieci.length ? poz.sieci : ['ig', 'fb'];
  console.log(`[rolka] ${poz.plik} → ${sieci.join(', ')}`);
  console.log(`[rolka] ссылка: ${url}`);

  if (DRY) {
    console.log('[rolka] сухой прогон, ничего не публикую');
    console.log('[rolka] текст:\n' + poz.tekst);
    continue;
  }

  const wynik = {};
  if (sieci.includes('ig')) {
    wynik.instagram = await naInstagram(url, poz.tekst);
    console.log(`[rolka] Instagram: ${wynik.instagram}`);
  }
  if (sieci.includes('fb')) {
    try {
      wynik.facebook = await naFacebook(url, poz.tekst);
      console.log(`[rolka] Facebook: ${wynik.facebook}`);
    } catch (e) {
      // Facebook не должен ронять уже удавшуюся публикацию в Instagram.
      console.error(`[rolka] Facebook не вышел: ${e.message}`);
    }
  }

  poz.opublikowano = new Date().toISOString();
  poz.wynik = wynik;
  zmiany = true;
}

if (zmiany) {
  await writeFile(KOLEJKA, JSON.stringify(kolejka, null, 2) + '\n', 'utf8');
  console.log('[rolka] очередь обновлена');
} else {
  console.log('[rolka] публиковать нечего');
}
