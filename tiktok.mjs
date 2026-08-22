// Заливка рилса в TikTok.
//
// Два режима, и разница между ними — не техническая, а разрешительная:
//
//   ЧЕРНОВИК (`inbox`) — работает сразу, без проверки приложения. Ролик
//   уезжает в приложение TikTok на телефоне, человек открывает его и
//   публикует сам. Это то, что у нас есть с 22.08.
//
//   ПРЯМАЯ ПУБЛИКАЦИЯ (`direct`) — полностью автоматом, без человека. Право
//   на неё TikTok выдаёт после проверки приложения. Код готов, включается
//   переключателем TIKTOK_TRYB=direct, когда проверку пройдём.
//
// Файл заливается байтами, как на ютубе: у TikTok своя загрузка, ссылку он
// принимает только с подтверждённого домена.
import { readFile, stat } from 'node:fs/promises';

const API = 'https://open.tiktokapis.com/v2';

function env(k) {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
}

/** Временный токен из постоянного. Живёт сутки, берём на каждый вызов. */
async function token() {
  const id = env('TIKTOK_CLIENT_KEY');
  const sek = env('TIKTOK_CLIENT_SECRET');
  const rt = env('TIKTOK_REFRESH_TOKEN');
  if (!id || !sek || !rt) throw new Error('нет ключей TikTok в окружении');

  const r = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: id,
      client_secret: sek,
      grant_type: 'refresh_token',
      refresh_token: rt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`токен не обновился: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

/**
 * Заливка.
 *
 * @param {string} plik — путь к mp4
 * @param {{tekst?:string, tryb?:'inbox'|'direct'}} o
 * @returns {Promise<string>} идентификатор публикации
 */
export async function naTikTok(plik, o = {}) {
  const dostep = await token();
  const tryb = o.tryb || env('TIKTOK_TRYB') || 'inbox';
  const rozmiar = (await stat(plik)).size;

  // Одним куском: наши рилсы весят 15-20 МБ, потолок одного куска 64 МБ.
  // Разбиение нужно большим файлам и добавляет запрос на каждый кусок.
  const init =
    tryb === 'direct'
      ? {
          post_info: {
            title: String(o.tekst || '').split(String.fromCharCode(10))[0].slice(0, 150),
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: rozmiar,
            chunk_size: rozmiar,
            total_chunk_count: 1,
          },
        }
      : {
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: rozmiar,
            chunk_size: rozmiar,
            total_chunk_count: 1,
          },
        };

  const sciezka = tryb === 'direct' ? 'post/publish/video/init/' : 'post/publish/inbox/video/init/';
  const r1 = await fetch(`${API}/${sciezka}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${dostep}`,
      'content-type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(init),
  });
  const j1 = await r1.json();
  const url = j1?.data?.upload_url;
  const id = j1?.data?.publish_id;
  if (!url || !id) throw new Error(`TikTok не открыл заливку: ${JSON.stringify(j1).slice(0, 300)}`);

  const wideo = await readFile(plik);
  const r2 = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(rozmiar),
      // Диапазон обязателен даже для одного куска — без него TikTok
      // отвечает 400 и не говорит, чего ему не хватило.
      'content-range': `bytes 0-${rozmiar - 1}/${rozmiar}`,
    },
    body: wideo,
  });
  if (!r2.ok) throw new Error(`байты не приняты: ${r2.status} ${(await r2.text()).slice(0, 200)}`);

  return id;
}
