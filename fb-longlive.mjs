// Превращает короткоживущий токен Facebook в постоянный.
//
// Как это работает:
//   1) короткий пользовательский токен → долгий пользовательский (60 дней)
//   2) из долгого пользовательского берём токен СТРАНИЦЫ — он бессрочный
//
// Запуск: node fb-longlive.mjs <APP_SECRET>
// Результат кладётся в .env и в секреты GitHub.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APP_ID = '1061473900154765';
const PAGE_ID = '1104225396116061'; // ZOVU
const ENV_FILE = path.join(import.meta.dirname, '.env');

const secret = process.argv[2];
if (!secret) {
  console.log('użycie: node fb-longlive.mjs <APP_SECRET>');
  process.exit(1);
}

const env = await readFile(ENV_FILE, 'utf8');
const short = env.match(/^FACEBOOK_PAGE_TOKEN=(.+)$/m)?.[1]?.trim();
if (!short) {
  console.log('w .env nie ma FACEBOOK_PAGE_TOKEN');
  process.exit(1);
}

// 1) меняем короткий на долгий
const ex = await fetch(
  'https://graph.facebook.com/v23.0/oauth/access_token?' +
    new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: secret,
      fb_exchange_token: short,
    })
).then((r) => r.json());

if (!ex.access_token) {
  console.log('nie udało się wymienić tokenu:', JSON.stringify(ex).slice(0, 300));
  process.exit(1);
}
const longUser = ex.access_token;
console.log('długi token użytkownika: ok');

// 2) берём токен страницы — он не wygasa
const page = await fetch(
  `https://graph.facebook.com/v23.0/${PAGE_ID}?fields=id,name,access_token&access_token=${encodeURIComponent(longUser)}`
).then((r) => r.json());

if (!page.access_token) {
  console.log('nie udało się pobrać tokenu strony:', JSON.stringify(page).slice(0, 300));
  process.exit(1);
}

// 3) проверяем срок
const dbg = await fetch(
  `https://graph.facebook.com/v23.0/debug_token?input_token=${encodeURIComponent(page.access_token)}&access_token=${encodeURIComponent(longUser)}`
).then((r) => r.json());
const exp = dbg?.data?.expires_at;
console.log(`token strony „${page.name}": ${exp ? new Date(exp * 1000).toISOString() : 'BEZTERMINOWY'}`);

// 4) сохраняем
const lines = env
  .split(/\r?\n/)
  .filter((l) => l && !/^FACEBOOK_PAGE_TOKEN=/.test(l));
lines.push(`FACEBOOK_PAGE_TOKEN=${page.access_token}`);
await writeFile(ENV_FILE, lines.join('\n') + '\n', 'utf8');
console.log('zapisano do .env');
console.log('\nteraz wgraj sekret:');
console.log(`  gh secret set FACEBOOK_PAGE_TOKEN --repo dzmzah/zovu-autopilot`);
