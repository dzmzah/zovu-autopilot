// Хранилище токена Instagram, которое обновляет само себя.
//
// Проблема: токен Instagram живёт 60 дней. Если его не продлевать,
// автопилот однажды замолчит без предупреждения.
//
// Решение: токен лежит в репозитории ЗАШИФРОВАННЫМ (файл token.enc),
// ключ — в секретах GitHub. Каждый утренний запуск продлевает токен
// ещё на 60 дней и перезаписывает файл. Секреты менять не нужно,
// поэтому не нужен и отдельный токен доступа к GitHub.
import { readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const STORE = path.join(import.meta.dirname, 'token.enc');
const ALGO = 'aes-256-gcm';

function keyFrom(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function encrypt(plain, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGO, keyFrom(secret), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(payload, secret) {
  const [iv, tag, data] = String(payload).trim().split('.');
  const d = crypto.createDecipheriv(ALGO, keyFrom(secret), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

// Читает актуальный токен: сначала из зашифрованного файла, потом из окружения
export async function loadInstagramToken() {
  const key = process.env.TOKEN_KEY;
  if (key) {
    try {
      const raw = await readFile(STORE, 'utf8');
      const parsed = JSON.parse(decrypt(raw, key));
      if (parsed.token) return { token: parsed.token, refreshedAt: parsed.refreshedAt, fromStore: true };
    } catch {
      /* файла ещё нет или ключ сменился — берём из окружения */
    }
  }
  const env = process.env.INSTAGRAM_TOKEN;
  if (!env) throw new Error('nie ma tokenu Instagrama');
  return { token: env.trim(), refreshedAt: null, fromStore: false };
}

// Продлевает токен ещё на 60 дней и сохраняет. Instagram разрешает
// продление, если токену больше суток — поэтому делаем это раз в день.
export async function refreshInstagramToken(current) {
  const r = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`
  );
  const j = await r.json();
  if (!r.ok || !j.access_token) {
    throw new Error('odświeżenie nie wyszło: ' + JSON.stringify(j).slice(0, 200));
  }
  return { token: j.access_token, expiresIn: j.expires_in };
}

export async function saveInstagramToken(token) {
  const key = process.env.TOKEN_KEY;
  if (!key) return { saved: false, reason: 'brak TOKEN_KEY' };
  const payload = JSON.stringify({ token, refreshedAt: new Date().toISOString() });
  await writeFile(STORE, encrypt(payload, key), 'utf8');
  return { saved: true };
}

// Продлевать не чаще раза в сутки
export function needsRefresh(refreshedAt) {
  if (!refreshedAt) return true;
  return Date.now() - new Date(refreshedAt).getTime() > 20 * 60 * 60 * 1000;
}

// CLI: node token-store.mjs init   — зашифровать текущий токен из .env
if (process.argv[1] && process.argv[1].endsWith('token-store.mjs')) {
  const env = await readFile(path.join(import.meta.dirname, '.env'), 'utf8');
  const tok = env.match(/^INSTAGRAM_TOKEN=(.+)$/m)?.[1]?.trim();
  const key = process.env.TOKEN_KEY || process.argv[3];
  if (!tok || !key) {
    console.log('użycie: TOKEN_KEY=<klucz> node token-store.mjs init');
    process.exit(1);
  }
  await writeFile(STORE, encrypt(JSON.stringify({ token: tok, refreshedAt: null }), key), 'utf8');
  console.log('zapisano zaszyfrowany token do', STORE);
}
