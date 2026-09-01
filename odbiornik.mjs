// Приёмник файлов из браузера — обход песочницы расширения.
//
// Зачем. Скачивание, начатое СТРАНИЦЕЙ, расширение блокирует: `<a download>`
// с блобом не сохраняет ничего, кнопка «Скачать» в Google Flow и в Диске
// оставляет пустышки. Из-за этого клипы весь вечер вытаскивал Захар руками.
//
// Решение без обходов политики: страница сама читает файл своим же сеансом
// (fetch с куками) и ОТПРАВЛЯЕТ его сюда, на localhost. Скачивания в браузере
// не происходит вовсе, а файл оказывается на диске.
//
//   node odbiornik.mjs [--kat=out/pobrane] [--port=8899]
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=').pop();
const KAT = path.resolve(arg('kat', path.join(import.meta.dirname, 'out', 'pobrane')));
const PORT = +arg('port', '8899');

await mkdir(KAT, { recursive: true });

createServer(async (req, res) => {
  // Браузер сначала спрашивает разрешение — отвечаем на предполётный запрос.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  // Chrome отдельно спрашивает разрешение на выход из публичного сайта в
  // локальную сеть (Private Network Access). Без этого заголовка запрос
  // к 127.0.0.1 просто виснет и обрывается по таймауту, без внятной ошибки.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'POST') return res.end('odbiornik ZOVU\n');

  const nazwa = (new URL(req.url, 'http://x').searchParams.get('name') || 'plik.bin')
    .replace(/[^\w.\- ]+/g, '_')
    .slice(-120);
  const kawalki = [];
  for await (const c of req) kawalki.push(c);
  const dane = Buffer.concat(kawalki);
  const plik = path.join(KAT, nazwa);
  await writeFile(plik, dane);
  console.log(`[odbiornik] ${nazwa} — ${(dane.length / 1048576).toFixed(2)} МБ`);
  res.end('ok');
}).listen(PORT, '127.0.0.1', () => console.log(`[odbiornik] жду файлы на 127.0.0.1:${PORT}, кладу в ${KAT}`));
