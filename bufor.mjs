// Публикация в ТикТок через Buffer.
//
// Зачем посредник. Наше приложение ТикТока не прошло аудит, поэтому прямая
// публикация закрыта: ролик доезжает до телефона черновиком и ждёт руки.
// Приложение Buffer аудит уже прошло, значит выкладывать может. Мы отдаём
// готовый файл им, они кладут его в ленту в назначенное время.
//
// Файл не загружаем — Buffer скачивает его сам по ссылке. Репозиторий
// публичный, поэтому ссылка на рилс уже есть и ничего хостить не нужно.
//
// Ключ живёт ТОЛЬКО в секретах GitHub (BUFFER_TOKEN). Локально его нет и
// быть не должно: personal-ключ Buffer даёт полный доступ к аккаунту.
const API = 'https://api.buffer.com';
const REPO = 'dzmzah/zovu-autopilot';

/** Публичная ссылка на файл в репозитории — то, что Buffer сможет скачать. */
export function adresRolki(plik, galaz = 'main') {
  return `https://raw.githubusercontent.com/${REPO}/${galaz}/rolki/${encodeURIComponent(plik)}`;
}

async function zapytaj(token, query, variables = {}) {
  const r = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const tekst = await r.text();
  let dane;
  try {
    dane = JSON.parse(tekst);
  } catch {
    throw new Error(`Buffer вернул не JSON (${r.status}): ${tekst.slice(0, 300)}`);
  }
  // GraphQL отвечает 200 даже на ошибку, поэтому смотрим на errors, а не на код.
  if (dane.errors?.length) {
    throw new Error('Buffer: ' + dane.errors.map((e) => e.message).join('; ').slice(0, 400));
  }
  return dane.data;
}

/** Организация аккаунта. Каналы висят на ней, поэтому сначала нужен её id. */
export async function organizacja(token) {
  const d = await zapytaj(token, `query { account { organizations { id name } } }`);
  const o = d?.account?.organizations?.[0];
  if (!o) throw new Error('Buffer не отдал организацию — проверь права ключа');
  return o;
}

/** Список подключённых каналов: id нужен для публикации, service — чтобы не промахнуться. */
export async function kanaly(token, organizationId) {
  const org = organizationId || (await organizacja(token)).id;
  const d = await zapytaj(
    token,
    `query Kanaly($org: String!) {
       channels(input: { organizationId: $org }) { id name displayName service }
     }`,
    { org }
  );
  return d?.channels ?? [];
}

/**
 * Ставит ролик в очередь Buffer.
 *
 * `kiedy` — время публикации в ISO. Без него Buffer положит в свой слот,
 * а нам нужен наш час: очередь автопилота уже решила, когда выходить.
 */
export async function opublikuj(token, { kanal, tekst, url, kiedy, oblozka = 2000 }) {
  const wejscie = {
    text: tekst,
    channelId: kanal,
    assets: [{ video: { url, metadata: { thumbnailOffset: oblozka } } }],
    ...(kiedy
      ? { schedulingType: 'custom', scheduledAt: kiedy, mode: 'schedule' }
      : { schedulingType: 'automatic', mode: 'addToQueue' }),
  };
  const d = await zapytaj(
    token,
    `mutation Publikuj($wejscie: CreatePostInput!) {
       createPost(input: $wejscie) {
         ... on PostActionSuccess { post { id status dueAt } }
         ... on MutationError { message }
       }
     }`,
    { wejscie }
  );
  const w = d?.createPost;
  if (w?.message) throw new Error('Buffer отказал: ' + w.message);
  if (!w?.post?.id) throw new Error('Buffer не вернул пост: ' + JSON.stringify(d).slice(0, 300));
  return w.post;
}
