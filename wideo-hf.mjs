// Генерация вертикального видео через LTX Video (Hugging Face Space).
//
// Почему этот путь, а не Google Flow:
//   1. У Flow суточный лимит (12 очков за клип 8 с, потом «quota reached»).
//   2. ГЛАВНОЕ: из Flow невозможно забрать файл скриптом — песочница
//      расширения блокирует скачивание, а прямые ссылки сидят за
//      редиректом и требуют куки сессии.
//   Gradio отдаёт готовый файл обычной ссылкой, поэтому здесь весь цикл
//   идёт без браузера и файл сразу ложится на диск.
//
// Токен: строка HF_TOKEN=... в .env (huggingface.co/settings/tokens, тип Read).
// Без него ZeroGPU отвечает `event: error / {"error": null}` — это не
// поломка, а отказ анонимному вызову.
//
// Запуск:  node wideo-hf.mjs "промпт" [секунды] [файл.mp4]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://lightricks-ltx-video-distilled.hf.space';
const WYS = 1280;   // вертикаль 9:16 под рилсы
const SZER = 704;
const NEGATYW = 'worst quality, inconsistent motion, blurry, jittery, distorted';

async function token() {
  const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8').catch(() => '');
  const m = raw.match(/^\s*HF_TOKEN\s*=\s*(.+?)\s*$/m);
  if (!m) throw new Error('в .env нет HF_TOKEN=... (huggingface.co/settings/tokens)');
  return m[1].trim();
}

export async function generuj(prompt, sekundy = 5, plik = 'out.mp4') {
  const t = await token();
  const naglowki = { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };

  // порядок входов Space: prompt, негатив, image_n, video_n, высота, ширина,
  // задача, длительность, кадров из видео, seed,随机 seed, CFG, улучшение текстуры
  const dane = [prompt, NEGATYW, '', '', WYS, SZER, 'text-to-video', sekundy, 9, 0, true, 3, false];

  const start = await fetch(`${BASE}/gradio_api/call/text_to_video`, {
    method: 'POST', headers: naglowki, body: JSON.stringify({ data: dane }),
  });
  const { event_id } = await start.json();
  if (!event_id) throw new Error(`Space не принял задание: ${(await start.text()).slice(0, 200)}`);

  const strumien = await fetch(`${BASE}/gradio_api/call/text_to_video/${event_id}`, { headers: naglowki });
  const tekst = await strumien.text();
  if (/event:\s*error/.test(tekst)) throw new Error('Space отказал — обычно исчерпана квота ZeroGPU, подождать');

  const linia = tekst.split('\n').filter((l) => l.startsWith('data:')).pop();
  if (!linia) throw new Error(`пустой ответ: ${tekst.slice(0, 200)}`);
  const wynik = JSON.parse(linia.slice(5));
  const url = wynik?.[0]?.video?.url || wynik?.[0]?.url;
  if (!url) throw new Error(`в ответе нет ссылки: ${JSON.stringify(wynik).slice(0, 200)}`);

  const plikRes = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  const bufor = Buffer.from(await plikRes.arrayBuffer());
  await writeFile(plik, bufor);
  return { plik, kb: Math.round(bufor.length / 1024) };
}

// Windows: пути из import.meta.url и argv не совпадают по слэшам,
// поэтому просто смотрим, передали ли промпт.
if (process.argv[2]) {
  const [, , prompt, sek, plik] = process.argv;
  generuj(prompt, Number(sek) || 5, plik || 'out.mp4')
    .then((r) => console.log(`готово: ${r.plik} (${r.kb} КБ)`))
    .catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
}
