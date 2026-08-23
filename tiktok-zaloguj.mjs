// Разовый вход в TikTok: меняем согласие в браузере на постоянный ключ.
//
// Запускается ОДИН раз, руками, и требует одного нажатия Захара в окне
// TikTok — как было с гуглом. Дальше ключ живёт сам и лежит в секретах.
//
//   node tiktok-zaloguj.mjs
//
// Адрес возврата зашит в настройках приложения: http://localhost:8766/callback/
// Для настольного приложения TikTok принимает только localhost — обычный
// https-адрес он отвергает («Enter a valid URI»).
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';

const KLUCZ = process.env.TIKTOK_CLIENT_KEY;
const SEKRET = process.env.TIKTOK_CLIENT_SECRET;
if (!KLUCZ || !SEKRET) {
  console.error('нет TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET в окружении');
  process.exit(1);
}

const PORT = 8766;
const REDIRECT = `http://localhost:${PORT}/callback/`;
// Только то, что нужно: чтение профиля (без него не выдают ничего) и
// заливка черновика. Прямая публикация просит video.publish и требует
// пройденной проверки приложения — добавим, когда пройдём.
// Права. По умолчанию только черновик: прямая публикация (video.publish)
// живёт отдельно и её надо сначала включить в настройках приложения.
// Переключатель нужен, чтобы проверить прямую публикацию, не ломая рабочий
// ключ навсегда: не выйдет — входим обратно без него.
const SCOPE = process.env.TIKTOK_SCOPE || 'user.info.basic,video.upload';
const STAN = randomBytes(12).toString('hex');

// PKCE. TikTok требует его даже там, где есть секрет приложения: без
// code_challenge окно согласия сразу отвечает «Что-то пошло не так».
//
// Внимание: у TikTok своя мерка — вызов считается ШЕСТНАДЦАТЕРИЧНОЙ записью
// SHA-256, а не base64url, как в обычном OAuth. На этом легко обжечься:
// стандартный код даёт base64url и получает отказ.
const WERYFIKATOR = randomBytes(32).toString('hex'); // 64 знака, в рамках 43-128
const WYZWANIE = createHash('sha256').update(WERYFIKATOR).digest('hex');

const url =
  'https://www.tiktok.com/v2/auth/authorize/?' +
  new URLSearchParams({
    client_key: KLUCZ,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: REDIRECT,
    state: STAN,
    code_challenge: WYZWANIE,
    code_challenge_method: 'S256',
  });

const kod = await new Promise((res, rej) => {
  const srv = createServer((req, odp) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    const c = u.searchParams.get('code');
    const err = u.searchParams.get('error');
    const st = u.searchParams.get('state');
    odp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    odp.end(
      c
        ? '<h2 style="font-family:sans-serif">Готово. Можно закрыть вкладку.</h2>'
        : `<h2 style="font-family:sans-serif">Не вышло: ${err || 'нет кода'}</h2>`
    );
    srv.close();
    if (!c) return rej(new Error(err || 'нет кода'));
    // Проверка state — защита от того, что нам подсунут чужой код.
    if (st !== STAN) return rej(new Error('state не совпал'));
    res(c);
  });
  srv.listen(PORT, () => {
    console.log('Открываю окно согласия TikTok. Войди аккаунтом ZOVU и разреши доступ.');
    console.log(url);
    execFile('cmd', ['/c', 'start', '', url], () => {});
  });
});

const odp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_key: KLUCZ,
    client_secret: SEKRET,
    code: kod,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT,
    code_verifier: WERYFIKATOR,
  }),
});
const j = await odp.json();
if (!j.refresh_token) {
  console.error('TikTok не вернул постоянный ключ:', JSON.stringify(j, null, 1));
  process.exit(1);
}

console.log('\nREFRESH TOKEN получен:');
console.log(j.refresh_token);
console.log('\nПоложить в секреты: gh secret set TIKTOK_REFRESH_TOKEN');
