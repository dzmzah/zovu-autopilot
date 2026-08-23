// Пульт ZOVU — окно, из которого готовый рилс уходит в TikTok.
//
// Зачем он есть. TikTok не пускает приложение к прямой публикации, пока не
// посмотрит на него глазами: заявке нужно демо-видео, где видно живой
// интерфейс, вход и публикацию. Интерфейса у автопилота не было — он живёт
// на серверах GitHub и ни на что не похож. Это он и есть.
//
// Заодно пульт полезен сам по себе: с него можно выложить рилс раньше
// очереди, не открывая приложение на телефоне.
//
// Запуск:
//   node pult.mjs                  — песочница (ключи из окружения)
//   node pult.mjs --port=8766      — другой порт
//
// Адрес возврата зашит в настройках приложения TikTok: 8766/callback/.
// Менять порт можно только вместе с ним.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import path from 'node:path';

const DIR = import.meta.dirname;
const ROLKI = path.join(DIR, 'rolki');
const API = 'https://open.tiktokapis.com/v2';

const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1] || 8766);
const REDIRECT = `http://localhost:${PORT}/callback/`;
const KLUCZ = process.env.TIKTOK_CLIENT_KEY;
const SEKRET = process.env.TIKTOK_CLIENT_SECRET;
if (!KLUCZ || !SEKRET) {
  console.error('нет TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET в окружении');
  process.exit(1);
}

// Всё живёт в памяти процесса: пульт запускают на минуту и закрывают, а
// класть чужой ключ на диск без нужды — плохая привычка.
const sesja = { dostep: null, odswiez: null, tworca: null, stan: null, weryfikator: null };

function json(odp, kod, dane) {
  const body = Buffer.from(JSON.stringify(dane), 'utf8');
  odp.writeHead(kod, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length });
  odp.end(body);
}

/** Ссылка на окно согласия. PKCE обязателен, и вызов у TikTok шестнадцатеричный. */
function adresZgody() {
  sesja.weryfikator = randomBytes(32).toString('hex');
  sesja.stan = randomBytes(12).toString('hex');
  return (
    'https://www.tiktok.com/v2/auth/authorize/?' +
    new URLSearchParams({
      client_key: KLUCZ,
      response_type: 'code',
      scope: 'user.info.basic,video.upload,video.publish',
      redirect_uri: REDIRECT,
      state: sesja.stan,
      code_challenge: createHash('sha256').update(sesja.weryfikator).digest('hex'),
      code_challenge_method: 'S256',
    })
  );
}

async function wymienKod(kod) {
  const r = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: KLUCZ,
      client_secret: SEKRET,
      code: kod,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT,
      code_verifier: sesja.weryfikator,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(JSON.stringify(j).slice(0, 200));
  sesja.dostep = j.access_token;
  sesja.odswiez = j.refresh_token;
}

/**
 * Кто мы и что нам можно. Спрашивать обязательно перед каждой публикацией:
 * TikTok требует показывать человеку ровно те уровни доступа и переключатели,
 * которые разрешены его аккаунту, а не выдуманные нами.
 */
async function otworca() {
  const r = await fetch(`${API}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${sesja.dostep}`, 'content-type': 'application/json; charset=UTF-8' },
  });
  const j = await r.json();
  if (j?.error?.code !== 'ok') throw new Error(j?.error?.message || 'creator_info nie odpowiada');
  sesja.tworca = j.data;
  return j.data;
}

/** Готовые рилсы: файл + текст описания из очереди, если он там есть. */
async function rolki() {
  let kolejka = [];
  try {
    kolejka = JSON.parse(await readFile(path.join(ROLKI, 'kolejka.json'), 'utf8'));
  } catch {}
  const opisy = new Map(kolejka.map((p) => [p.plik, p]));
  const pliki = (await readdir(ROLKI)).filter((f) => f.endsWith('.mp4'));
  const out = [];
  for (const f of pliki) {
    const s = await stat(path.join(ROLKI, f));
    const p = opisy.get(f);
    out.push({
      plik: f,
      rozmiar: s.size,
      zmieniony: s.mtimeMs,
      tekst: p?.tekst || '',
      opublikowano: p?.opublikowano || null,
    });
  }
  // Свежие сверху: обычно выкладывают последнее, что собралось.
  return out.sort((a, b) => b.zmieniony - a.zmieniony).slice(0, 12);
}

async function opublikuj(o) {
  const plik = path.join(ROLKI, path.basename(o.plik));
  const rozmiar = (await stat(plik)).size;
  const init = {
    post_info: {
      title: String(o.tekst || '').split('\n')[0].slice(0, 150),
      privacy_level: o.prywatnosc,
      disable_comment: !o.komentarze,
      disable_duet: !o.duety,
      disable_stitch: !o.sklejki,
      brand_content_toggle: Boolean(o.markaCudza),
      brand_organic_toggle: Boolean(o.markaWlasna),
    },
    source_info: { source: 'FILE_UPLOAD', video_size: rozmiar, chunk_size: rozmiar, total_chunk_count: 1 },
  };
  const r1 = await fetch(`${API}/post/publish/video/init/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${sesja.dostep}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(init),
  });
  const j1 = await r1.json();
  const url = j1?.data?.upload_url;
  const id = j1?.data?.publish_id;
  if (!url || !id) throw new Error(j1?.error?.message || JSON.stringify(j1).slice(0, 200));

  const wideo = await readFile(plik);
  const r2 = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(rozmiar),
      'content-range': `bytes 0-${rozmiar - 1}/${rozmiar}`,
    },
    body: wideo,
  });
  if (!r2.ok) throw new Error(`bajty odrzucone: ${r2.status}`);
  return id;
}

async function stanPublikacji(id) {
  const r = await fetch(`${API}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${sesja.dostep}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: id }),
  });
  return (await r.json())?.data || {};
}

const STRONA = await readFile(path.join(DIR, 'pult.html'), 'utf8').catch(() => null);

const srv = createServer(async (req, odp) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (u.pathname === '/' ) {
      const body = Buffer.from(STRONA || '<h1>brak pult.html</h1>', 'utf8');
      odp.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length });
      return odp.end(body);
    }

    if (u.pathname === '/zaloguj') {
      odp.writeHead(302, { location: adresZgody() });
      return odp.end();
    }

    if (u.pathname === '/callback/') {
      const kod = u.searchParams.get('code');
      const st = u.searchParams.get('state');
      if (!kod || st !== sesja.stan) {
        odp.writeHead(302, { location: '/?blad=zgoda' });
        return odp.end();
      }
      await wymienKod(kod);
      await otworca();
      odp.writeHead(302, { location: '/' });
      return odp.end();
    }

    if (u.pathname === '/api/stan') {
      return json(odp, 200, {
        zalogowany: Boolean(sesja.dostep),
        tworca: sesja.tworca,
        rolki: sesja.dostep ? await rolki() : [],
      });
    }

    if (u.pathname === '/api/publikuj' && req.method === 'POST') {
      const ciało = await new Promise((res) => {
        let d = '';
        req.on('data', (c) => (d += c));
        req.on('end', () => res(d));
      });
      const o = JSON.parse(ciało || '{}');
      if (!sesja.dostep) return json(odp, 401, { blad: 'nie zalogowano' });
      if (!o.prywatnosc) return json(odp, 400, { blad: 'wybierz, kto zobaczy film' });
      const id = await opublikuj(o);
      return json(odp, 200, { id });
    }

    if (u.pathname === '/api/status') {
      const id = u.searchParams.get('id');
      return json(odp, 200, await stanPublikacji(id));
    }

    odp.writeHead(404).end('nie ma');
  } catch (e) {
    json(odp, 500, { blad: String(e.message).slice(0, 300) });
  }
});

srv.listen(PORT, () => {
  console.log(`[pult] otwarte: http://localhost:${PORT}`);
});
