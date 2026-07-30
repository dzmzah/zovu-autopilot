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

// Находит страницу, которой можно управлять этим токеном.
// Если задан FACEBOOK_PAGE_ID — берём именно её.
export async function resolvePage(userToken) {
  const wanted = await env('FACEBOOK_PAGE_ID');
  const list = await call('me/accounts', { access_token: userToken, fields: 'id,name,access_token' }, 'GET');
  const pages = list.data || [];
  if (!pages.length) throw new Error('token nie widzi żadnej strony');
  const page = wanted ? pages.find((p) => p.id === wanted) : pages[0];
  if (!page) throw new Error(`nie znaleziono strony ${wanted}`);
  return { id: page.id, name: page.name, token: page.access_token };
}

// Публикация. Одна картинка — обычный пост с фото.
// Несколько — сначала грузим их неопубликованными, потом одним постом.
export async function publishToFacebook({ imageUrls, caption }) {
  const raw = await env('FACEBOOK_PAGE_TOKEN');
  if (!raw) return { skipped: true, reason: 'brak FACEBOOK_PAGE_TOKEN' };

  // токен может быть пользовательский (тогда достаём из него страницу)
  // или уже страничный — пробуем оба варианта
  let pageId = await env('FACEBOOK_PAGE_ID');
  let pageToken = raw;
  if (!pageId) {
    const page = await resolvePage(raw);
    pageId = page.id;
    pageToken = page.token;
  }

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
