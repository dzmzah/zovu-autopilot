// Публикация на страницу Facebook. Отдельно от Instagram: там свой токен,
// свои права и другой способ выкладывать несколько картинок.
//
// Нужен Page access token (НЕ инстаграмный) с правами:
//   pages_manage_posts, pages_read_engagement, pages_show_list
// Кладётся в .env / секреты как FACEBOOK_PAGE_TOKEN.
// Если токена нет — публикация в FB просто пропускается, Instagram не страдает.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const GRAPH = 'https://graph.facebook.com/v23.0';

async function env(key) {
  if (process.env[key]) return process.env[key].trim();
  try {
    const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8');
    const m = raw.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.+)\\s*$', 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function call(endpoint, params, method = 'POST') {
  const url = new URL(`${GRAPH}/${endpoint}`);
  const body = new URLSearchParams(params);
  const r =
    method === 'GET'
      ? await fetch(`${url}?${body}`)
      : await fetch(url, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok) throw new Error(`${endpoint}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// Находит страницу и её токен.
// ВАЖНО: у новых страниц Meta список me/accounts приходит ПУСТЫМ,
// хотя доступ есть. Поэтому если знаем ID — спрашиваем страницу напрямую,
// и только как запасной путь идём через me/accounts.
export async function resolvePage(userToken) {
  const wanted = (await env('FACEBOOK_PAGE_ID')) || '1104225396116061'; // ZOVU

  if (wanted) {
    try {
      const p = await call(wanted, { access_token: userToken, fields: 'id,name,access_token' }, 'GET');
      if (p.access_token) return { id: p.id, name: p.name, token: p.access_token };
    } catch {
      /* пробуем запасной путь */
    }
  }

  const list = await call('me/accounts', { access_token: userToken, fields: 'id,name,access_token' }, 'GET');
  const pages = list.data || [];
  if (!pages.length) throw new Error('token nie widzi żadnej strony');
  const page = wanted ? pages.find((p) => p.id === wanted) || pages[0] : pages[0];
  return { id: page.id, name: page.name, token: page.access_token };
}

// Рилс на страницу Facebook. Три шага по документации Meta:
//   start   → получаем video_id и адрес загрузчика
//   upload  → загрузчик сам скачивает mp4 по нашей публичной ссылке (заголовок file_url)
//   finish  → публикуем
// Если рилсы для страницы недоступны, откатываемся на обычное видео в ленту —
// лучше опубликовать видео, чем не опубликовать ничего.
async function publishReel(pageId, pageToken, videoUrl, caption) {
  try {
    const start = await call(`${pageId}/video_reels`, {
      upload_phase: 'start',
      access_token: pageToken,
    });
    if (!start.video_id) throw new Error('brak video_id');

    const uploadUrl =
      start.upload_url || `https://rupload.facebook.com/video-upload/v23.0/${start.video_id}`;
    const up = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `OAuth ${pageToken}`, file_url: videoUrl },
    });
    const upJson = await up.json().catch(() => ({}));
    if (!up.ok || upJson.success === false) {
      throw new Error(`upload: ${JSON.stringify(upJson).slice(0, 200)}`);
    }

    // Загрузчик отдал ответ сразу, но кодирование идёт ещё несколько секунд.
    // Публикуем с повторами: пока видео не готово, finish отвечает ошибкой.
    let fin = null;
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        fin = await call(`${pageId}/video_reels`, {
          video_id: start.video_id,
          upload_phase: 'finish',
          video_state: 'PUBLISHED',
          description: caption || '',
          access_token: pageToken,
        });
        break;
      } catch (e) {
        if (attempt === 8) throw e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    return { postId: fin.post_id || start.video_id, reel: true };
  } catch (e) {
    const r = await call(`${pageId}/videos`, {
      file_url: videoUrl,
      description: caption || '',
      access_token: pageToken,
    });
    return { postId: r.id, video: true, reelFallback: e.message.slice(0, 120) };
  }
}

// Публикация. Одна картинка — обычный пост с фото.
// Несколько — сначала грузим их неопубликованными, потом одним постом.
export async function publishToFacebook({ imageUrls, caption, kind }) {
  const raw = await env('FACEBOOK_PAGE_TOKEN');
  if (!raw) return { skipped: true, reason: 'brak FACEBOOK_PAGE_TOKEN' };

  // Токен может быть пользовательский — тогда меняем его на страничный.
  // Определяем по тому, отдаёт ли страница свой access_token.
  const page = await resolvePage(raw);
  const pageId = page.id;
  const pageToken = page.token || raw;

  if (kind === 'reel') return publishReel(pageId, pageToken, imageUrls[0], caption);

  if (imageUrls.length === 1) {
    const r = await call(`${pageId}/photos`, {
      url: imageUrls[0],
      caption: caption || '',
      published: 'true',
      access_token: pageToken,
    });
    return { postId: r.post_id || r.id, photos: 1 };
  }

  // несколько картинок: грузим скрытыми, потом собираем в один пост
  const media = [];
  for (const url of imageUrls) {
    const up = await call(`${pageId}/photos`, {
      url,
      published: 'false',
      temporary: 'true',
      access_token: pageToken,
    });
    media.push({ media_fbid: up.id });
  }

  const post = await call(`${pageId}/feed`, {
    message: caption || '',
    attached_media: JSON.stringify(media),
    access_token: pageToken,
  });
  return { postId: post.id, photos: media.length };
}

// CLI-проверка: node fb-publish.mjs
if (process.argv[1] && process.argv[1].endsWith('fb-publish.mjs')) {
  const t = await env('FACEBOOK_PAGE_TOKEN');
  if (!t) {
    console.log('nie ma FACEBOOK_PAGE_TOKEN w .env');
    process.exit(1);
  }
  const page = await resolvePage(t).catch((e) => ({ error: e.message }));
  console.log(JSON.stringify(page.error ? page : { id: page.id, name: page.name }, null, 1));
}
