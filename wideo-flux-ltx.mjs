// Связка для качественного вертикального видео: FLUX рисует кадр, LTX его оживляет.
//
// Почему так, а не text-to-video одной моделью: у LTX в режиме «текст→видео»
// картинка средняя, и это первое, что заметил Захар. В режиме «картинка→видео»
// качество задаёт FLUX, а LTX отвечает только за движение — итог заметно лучше
// при том же нуле затрат.
//
// Обе модели — Spaces на Hugging Face, файлы отдаются обычной ссылкой,
// поэтому весь цикл идёт скриптом. Нужен HF_TOKEN в .env.
//
// Запуск:  node wideo-flux-ltx.mjs "что в кадре" "какое движение" wynik.mp4
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const FLUX = 'https://black-forest-labs-flux-1-dev.hf.space';
const LTX = 'https://lightricks-ltx-video-distilled.hf.space';
const WYS = 1280, SZER = 704;           // вертикаль 9:16
const NEGATYW = 'worst quality, inconsistent motion, blurry, jittery, distorted';

async function token() {
  const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8').catch(() => '');
  const m = raw.match(/^\s*HF_TOKEN\s*=\s*(.+?)\s*$/m);
  if (!m) throw new Error('в .env нет HF_TOKEN=...');
  return m[1].trim();
}

async function wywolaj(base, api, dane, naglowki) {
  const start = await fetch(`${base}/gradio_api/call/${api}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...naglowki },
    body: JSON.stringify({ data: dane }),
  });
  const { event_id } = await start.json();
  if (!event_id) throw new Error(`${api}: задание не принято`);
  const res = await fetch(`${base}/gradio_api/call/${api}/${event_id}`, { headers: naglowki });
  const tekst = await res.text();
  if (/event:\s*error/.test(tekst)) throw new Error(`${api}: отказ (обычно квота ZeroGPU — подождать)`);
  const linia = tekst.split('\n').filter((l) => l.startsWith('data:')).pop();
  if (!linia) throw new Error(`${api}: пустой ответ`);
  return JSON.parse(linia.slice(5));
}

export async function zrobWideo(opisKadru, opisRuchu, wyjscie = 'out.mp4') {
  const t = await token();
  const AUTH = { Authorization: `Bearer ${t}` };

  // 1. кадр во FLUX — от него зависит всё качество
  const obraz = await wywolaj(FLUX, 'infer', [opisKadru, 0, true, SZER, WYS, 3.5, 28], AUTH);
  const urlObrazu = obraz?.[0]?.url || obraz?.[0]?.image?.url;
  if (!urlObrazu) throw new Error('FLUX не вернул картинку');
  const bajty = Buffer.from(await (await fetch(urlObrazu, { headers: AUTH })).arrayBuffer());

  // 2. заливаем кадр в LTX
  const fd = new FormData();
  fd.append('files', new Blob([bajty], { type: 'image/png' }), 'kadr.png');
  const up = await fetch(`${LTX}/gradio_api/upload`, { method: 'POST', headers: AUTH, body: fd });
  const sciezki = await up.json();
  if (!sciezki?.[0]) throw new Error('LTX не принял картинку');
  const plik = { path: sciezki[0], meta: { _type: 'gradio.FileData' } };

  // 3. оживляем
  const wynik = await wywolaj(LTX, 'image_to_video',
    [opisRuchu, NEGATYW, plik, '', WYS, SZER, 'image-to-video', 5, 9, 0, true, 3, false], AUTH);
  const urlWideo = wynik?.[0]?.video?.url || wynik?.[0]?.url;
  if (!urlWideo) throw new Error('LTX не вернул видео');

  const wideo = Buffer.from(await (await fetch(urlWideo, { headers: AUTH })).arrayBuffer());
  await writeFile(wyjscie, wideo);
  return { plik: wyjscie, kb: Math.round(wideo.length / 1024) };
}

if (process.argv[2]) {
  const [, , kadr, ruch, plik] = process.argv;
  zrobWideo(kadr, ruch || 'subtle natural motion, slow camera push in, cinematic', plik || 'out.mp4')
    .then((r) => console.log(`готово: ${r.plik} (${r.kb} КБ)`))
    .catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
}
