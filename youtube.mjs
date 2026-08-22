// Загрузка рилса на YouTube Shorts.
//
// Квота API: 10 000 единиц в сутки, одна загрузка стоит 1600 — шесть роликов
// в день. Нам хватает с четырёхкратным запасом.
//
// Shorts не отдельный тип: ютуб сам считает роликом-шортсом всё, что
// вертикальное и короче трёх минут. Отдельно помечать не нужно и нечем.
import { readFile } from 'node:fs/promises';

const OAUTH = 'https://oauth2.googleapis.com/token';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';

function env(k) {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
}

/** Временный токен из постоянного. Живёт час, поэтому берём на каждый вызов. */
async function token() {
  const id = env('YOUTUBE_CLIENT_ID');
  const sek = env('YOUTUBE_CLIENT_SECRET');
  const rt = env('YOUTUBE_REFRESH_TOKEN');
  if (!id || !sek || !rt) throw new Error('нет ключей YouTube в окружении');

  const r = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: sek,
      refresh_token: rt,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`токен не обновился: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

/**
 * Заголовок ролика. Ютуб показывает его под видео, и это единственное место,
 * где у нас есть текст в поиске — описание там читают единицы.
 * Берём первую строку описания: это хук, ради которого ролик и смотрят.
 */
export function tytulZOpisu(tekst, zapas = 'ZOVU') {
  const pierwsza = String(tekst || '').split(String.fromCharCode(10))[0].trim();
  if (!pierwsza) return zapas;
  // Потолок ютуба сто знаков, но обрезать посреди слова некрасиво.
  if (pierwsza.length <= 95) return pierwsza;
  return pierwsza.slice(0, 95).replace(/\s+\S*$/, '') + '…';
}

/**
 * Заливка файла.
 *
 * @param {string} plik — путь к mp4
 * @param {{tytul:string, opis:string, prywatnosc?:'public'|'unlisted'|'private'}} o
 * @returns {Promise<string>} id ролика на ютубе
 */
export async function naYouTube(plik, o) {
  const dostep = await token();
  const wideo = await readFile(plik);

  const meta = {
    snippet: {
      title: o.tytul,
      description: o.opis || '',
      // Категория 22 — «Люди и блоги». Для нашего формата ближе всего:
      // «Наука и технологии» уводит в другую выдачу.
      categoryId: '22',
      defaultLanguage: 'pl',
    },
    status: {
      privacyStatus: o.prywatnosc || 'public',
      selfDeclaredMadeForKids: false,
    },
  };

  // Простая multipart-заливка: она держит файлы до 100 МБ, а наши рилсы
  // весят 15-20. Возобновляемая заливка нужна большим файлам и добавляет
  // два лишних запроса на каждый ролик.
  const granica = '=-=-=zovu' + wideo.length.toString(36);
  const naglowek = Buffer.from(
    `--${granica}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(meta)}\r\n--${granica}\r\ncontent-type: video/mp4\r\n\r\n`,
    'utf8'
  );
  const stopka = Buffer.from(`\r\n--${granica}--\r\n`, 'utf8');

  const r = await fetch(`${UPLOAD}?uploadType=multipart&part=snippet,status`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${dostep}`,
      'content-type': `multipart/related; boundary=${granica}`,
    },
    body: Buffer.concat([naglowek, wideo, stopka]),
  });

  const j = await r.json();
  if (!j.id) throw new Error(`ютуб не принял: ${JSON.stringify(j).slice(0, 300)}`);
  return j.id;
}
