// Разовый вход в YouTube: меняем согласие в браузере на постоянный ключ.
//
// Запускается ОДИН раз, руками. Поднимает локальный сервер, открывает окно
// согласия Google, ловит код и меняет его на refresh token — тот живёт
// долго и лежит в секретах GitHub, а не в репозитории.
//
//   node youtube-zaloguj.mjs
//
// Ключи клиента берутся из окружения: GCP_CLIENT_ID и
// GCP_CLIENT_SECRET. Они же лежат в секретах репозитория.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';

const ID = process.env.GCP_CLIENT_ID;
const SEKRET = process.env.GCP_CLIENT_SECRET;
if (!ID || !SEKRET) {
  console.error('нет GCP_CLIENT_ID / GCP_CLIENT_SECRET в окружении');
  process.exit(1);
}

const PORT = 8766;
const REDIRECT = `http://localhost:${PORT}`;
// Только загрузка. Просить больше, чем нужно, — плохая привычка: чем шире
// доступ, тем больнее, если ключ утечёт.
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const url =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // Без этого Google отдаёт refresh token только в первый раз в жизни, и
    // при повторном входе возвращается пустота — на этом спотыкаются все.
    prompt: 'consent',
  });

const kod = await new Promise((res, rej) => {
  const srv = createServer((req, odp) => {
    const u = new URL(req.url, REDIRECT);
    const c = u.searchParams.get('code');
    const err = u.searchParams.get('error');
    odp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    odp.end(
      c
        ? '<h2 style="font-family:sans-serif">Готово. Можно закрыть вкладку.</h2>'
        : `<h2 style="font-family:sans-serif">Не вышло: ${err || 'нет кода'}</h2>`
    );
    srv.close();
    c ? res(c) : rej(new Error(err || 'нет кода'));
  });
  srv.listen(PORT, () => {
    console.log('Открываю окно согласия. Войди под zovu.pl@gmail.com и разреши доступ.');
    console.log(url);
    execFile('cmd', ['/c', 'start', '', url], () => {});
  });
});

const odp = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code: kod,
    client_id: ID,
    client_secret: SEKRET,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
  }),
});
const j = await odp.json();
if (!j.refresh_token) {
  console.error('Google не вернул refresh token:', JSON.stringify(j, null, 1));
  process.exit(1);
}

console.log('\nREFRESH TOKEN получен. Кладу в секреты GitHub.');
console.log(j.refresh_token);
