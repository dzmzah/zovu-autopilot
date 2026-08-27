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
import { naYouTube, tytulZOpisu } from './youtube.mjs';
import { naTikTok } from './tiktok.mjs';

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

// Первая строка текста — то, чем ролик узнаётся среди уже вышедших.
// Сравнивать весь текст нельзя: хэштеги подставляются генератором и у
// повтора могут отличаться, а хук — нет.
function odcisk(tekst) {
  return String(tekst || '')
    .split(String.fromCharCode(10))[0]
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
}

// Что уже вышло в Instagram за последние часы. Ошибку запроса глушим:
// защита от дубля не должна ронять саму выкладку — иначе одна неудачная
// проверка оставит ленту пустой на день.
async function ostatnieWpisy(token) {
  if (!token) return [];
  try {
    const r = await fetch(
      `${IG_API}/me/media?fields=id,caption,timestamp&limit=8&access_token=${encodeURIComponent(token)}`
    );
    const j = await r.json();
    if (!Array.isArray(j?.data)) {
      console.warn('[rolka] не смог прочитать последние публикации — иду дальше');
      return [];
    }
    return j.data;
  } catch (e) {
    console.warn(`[rolka] проверка повторов недоступна: ${e.message}`);
    return [];
  }
}

const OKNO_POWTORU_H = 12;

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

  // Проверка на повтор — прямо перед выкладкой, по площадке.
  if (!DRY) {
    const token = await igToken();
    const wpisy = await ostatnieWpisy(token);
    const mój = odcisk(poz.tekst);
    const bliznak = wpisy.find((w) => {
      if (!w.caption || odcisk(w.caption) !== mój) return false;
      const wiek = (Date.now() - new Date(w.timestamp).getTime()) / 36e5;
      return Number.isFinite(wiek) && wiek >= 0 && wiek < OKNO_POWTORU_H;
    });
    if (bliznak) {
      const wiek = ((Date.now() - new Date(bliznak.timestamp).getTime()) / 36e5).toFixed(1);
      console.log(
        `::warning::[rolka] ${poz.plik} уже вышел ${wiek} ч назад (id ${bliznak.id}) — ` +
          'второй раз не выкладываю'
      );
      poz.opublikowano = bliznak.timestamp || new Date().toISOString();
      poz.wynik = { instagram: bliznak.id, powtorka: true };
      zmiany = true;
      continue;
    }
  }

  const wynik = {};
  if (sieci.includes('ig')) {
    wynik.instagram = await naInstagram(url, poz.tekst);
    console.log(`[rolka] Instagram: ${wynik.instagram}`);
  }
  // Ютуб. Файл заливается ЦЕЛИКОМ, а не по ссылке, как у Meta: у Google
  // своя загрузка, и она хочет байты. Ролик и так лежит рядом в репозитории.
  //
  // Падение ютуба не должно ронять уже удавшуюся выкладку в Instagram —
  // как и с Facebook. Три площадки, три независимых исхода.
  if (sieci.includes('yt')) {
    try {
      const plik = path.join(DIR, 'rolki', poz.plik);
      wynik.youtube = await naYouTube(plik, {
        tytul: tytulZOpisu(poz.tekst),
        opis: poz.tekst,
        prywatnosc: 'public',
      });
      console.log(`[rolka] YouTube: ${wynik.youtube}`);
    } catch (e) {
      console.error(`[rolka] YouTube не вышел: ${e.message}`);
    }
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

  // TikTok. Своим приложением мы публиковать не можем: оно не прошло аудит,
  // и ролик уезжает ЧЕРНОВИКОМ в телефон — ждать нажатия. Три таких висели
  // неделю, а панель показывала их как выложенные.
  //
  // Поэтому первым идёт Buffer: их приложение аудит прошло, публикует само,
  // файл берёт по ссылке из этого же публичного репозитория. Своя отправка
  // остаётся запасной — на случай, если Buffer откажет.
  if (sieci.includes('tt')) {
    const plik = path.join(DIR, 'rolki', poz.plik);
    let wyszlo = false;

    if (process.env.BUFFER_TOKEN) {
      try {
        const { kanaly, opublikuj, adresRolki } = await import('./bufor.mjs');
        const tt = (await kanaly(process.env.BUFFER_TOKEN)).find((k) => k.service === 'tiktok');
        if (!tt) throw new Error('в Buffer нет подключённого ТикТока');
        // Подпись под ТикТок своя. В Instagram описание читают под роликом,
        // в ТикТоке видно две строки — остальное прячется, а простыня тегов
        // выглядит спамом. Отдавать одинаковый текст обеим площадкам значит
        // писать его для одной и надеяться на вторую.
        const { podpisTikToka } = await import('./tagi.mjs');
        const post = await opublikuj(process.env.BUFFER_TOKEN, {
          kanal: tt.id,
          tekst: podpisTikToka(poz.tekst, {
            temat: poz.temat || '',
            forma: poz.forma || '',
            nr: Number(String(poz.plik).replace(/\D/g, '').slice(-3)) || 0,
          }),
          url: adresRolki(poz.plik),
          // Через минуту: файл только что лёг в репозиторий, пусть ссылка
          // успеет ожить, прежде чем Buffer пойдёт её качать.
          kiedy: new Date(Date.now() + 60_000).toISOString(),
        });
        wynik.tiktok = `bufor:${post.id}`;
        wyszlo = true;
        console.log(`[rolka] TikTok через Buffer: ${post.status} на ${post.dueAt}`);
      } catch (e) {
        console.error(`[rolka] Buffer не принял: ${e.message}`);
      }
    }

    if (!wyszlo && process.env.TIKTOK_REFRESH_TOKEN) {
      try {
        wynik.tiktok = await naTikTok(plik, { tekst: poz.tekst });
        console.log(`[rolka] TikTok черновиком: ${wynik.tiktok}`);
      } catch (e) {
        console.error(`[rolka] TikTok не вышел: ${e.message}`);
      }
    } else if (!wyszlo) {
      console.log('[rolka] TikTok пропущен: ни Buffer, ни своего ключа');
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
