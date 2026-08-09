// Живые фотографии под пост — вместо генерённых стеклянных объектов.
//
// Почему: Митя на посты сказал ровно то же, что раньше про сайты — «ещё бы
// настоящих фоток с реальными телефонами или людьми и топово будет». AI-объект
// на чёрном читается как заглушка, а агентство продаёт качество контента.
//
// Источник — Pexels. Лицензия разрешает коммерческое использование и правки,
// атрибуция не обязательна. ЧЕГО НЕЛЬЗЯ (и мы этого не делаем): выдавать людей
// с фото за клиентов или сотрудников ZOVU, ставить их в обидный контекст,
// продавать снимок как есть. Фото у нас всегда фон под свой текст.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const PHOTO_DIR = path.join(import.meta.dirname, 'bg-photo');
const API = 'https://api.pexels.com/v1/search';

async function klucz() {
  if (process.env.PEXELS_KEY) return process.env.PEXELS_KEY.trim();
  try {
    const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8');
    const m = raw.match(/^\s*PEXELS_KEY\s*=\s*(.+)\s*$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// Яркость по avg_color, который Pexels отдаёт для каждого снимка. Наш бренд
// тёмный: светлый кадр под белым заголовком превращается в кашу, поэтому
// предпочитаем тёмные, а совсем светлые не берём вовсе.
function jasnosc(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Кадр 1080x1350. Снимок занимает правые две трети и растворяется к центру,
// слева остаётся чистое тёмное поле под заголовок — та же раскладка, что у
// генерённых фонов, поэтому шаблон поста не приходится трогать.
//
// Затемнение держим ЛЁГКИМ. На рилсах уже наступали на эти грабли: притушили
// «как надо» — и живой съёмки стало не видно вообще, то есть незачем было её
// брать. Контраст букв даёт вуаль слева, а не заливка всего кадра.
async function zloz(buf) {
  const W = 1080;
  const H = 1350;
  const artW = 760;

  const foto = await sharp(buf)
    // 'attention' оставляет в кадре главное — лицо или предмет, а не угол стены
    .resize(artW, H, { fit: 'cover', position: 'attention' })
    .modulate({ brightness: 0.94, saturation: 0.9 })
    .linear(1.04, -4)
    .toBuffer();

  const rozmycie = Buffer.from(
    `<svg width="${artW}" height="${H}">
       <defs><linearGradient id="g" x1="0" x2="1">
         <stop offset="0" stop-color="#fff" stop-opacity="0"/>
         <stop offset="0.3" stop-color="#fff" stop-opacity="0.75"/>
         <stop offset="0.62" stop-color="#fff" stop-opacity="1"/>
       </linearGradient></defs>
       <rect width="${artW}" height="${H}" fill="url(#g)"/>
     </svg>`
  );
  const zmiekczone = await sharp(foto)
    .composite([{ input: rozmycie, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Две вуали поверх кадра: слева под заголовок, снизу под логотип.
  // Длина заголовка заранее неизвестна — он может уехать на две трети ширины
  // и лечь прямо на лицо. Слабая вуаль до 62% ширины держит контраст букв,
  // но правую часть снимка не трогает, поэтому кадр остаётся живым.
  const dol = Buffer.from(
    `<svg width="${W}" height="${H}">
       <defs>
         <linearGradient id="l" x1="0" x2="1">
           <stop offset="0" stop-color="#050505" stop-opacity="0.62"/>
           <stop offset="0.38" stop-color="#050505" stop-opacity="0.42"/>
           <stop offset="0.62" stop-color="#050505" stop-opacity="0.1"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0"/>
         </linearGradient>
         <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0.72" stop-color="#050505" stop-opacity="0"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0.72"/>
         </linearGradient>
       </defs>
       <rect width="${W}" height="${H}" fill="url(#l)"/>
       <rect width="${W}" height="${H}" fill="url(#d)"/>
     </svg>`
  );

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 5, g: 5, b: 5, alpha: 1 } },
  })
    .composite([
      { input: zmiekczone, left: W - artW, top: 0 },
      { input: dol, blend: 'over' },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Чужой логотип в нашем посте — отдельная неприятность: первый же кадр из
// поиска пришёл с читаемой надписью «dermalogica» на футболке. Стоки полны
// брендов, глазами это не отсмотришь, поэтому спрашиваем зрение модели.
// Нет ключа или модель молчит — пропускаем кадр дальше: проверка страхует,
// но не имеет права остановить публикацию.
async function maObcyLogotyp(buf) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;

  const pytanie =
    'Czy na tym zdjęciu widać czytelne logo marki, nazwę firmy albo napis ' +
    'reklamowy — na ubraniu, opakowaniu, szyldzie lub ekranie? ' +
    'Odpowiedz jednym słowem: TAK albo NIE.';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + key,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: pytanie },
                { inline_data: { mime_type: 'image/jpeg', data: buf.toString('base64') } },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 5 },
        }),
      }
    );
    if (!r.ok) return false;
    const j = await r.json();
    const tekst = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return /\btak\b/i.test(tekst);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Ищем кадр под запрос. Возвращаем null (а не бросаем), чтобы вызывающий
// спокойно откатился на генерацию: пост важнее источника картинки.
export async function findPhoto(query, { name } = {}) {
  const key = await klucz();
  if (!key || !query) return null;

  const url =
    `${API}?query=${encodeURIComponent(query)}` +
    '&orientation=portrait&size=medium&per_page=20';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let dane;
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Authorization: key } });
    if (!r.ok) throw new Error('Pexels ' + r.status);
    dane = await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const kandydaci = (dane.photos || []).filter((p) => jasnosc(p.avg_color) < 0.62);
  if (!kandydaci.length) return null;

  // из подходящих берём самый тёмный — он лучше всех держит белый заголовок
  kandydaci.sort((a, b) => jasnosc(a.avg_color) - jasnosc(b.avg_color));

  // Идём по кандидатам, пока не попадётся кадр без чужого логотипа. Четырёх
  // хватает: дальше начинаются заметно светлые кадры, а каждая проверка —
  // это ещё один вызов модели.
  for (const wybrany of kandydaci.slice(0, 4)) {
    const zrodlo = wybrany.src?.large2x || wybrany.src?.large || wybrany.src?.original;
    if (!zrodlo) continue;

    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 45000);
    try {
      const r = await fetch(zrodlo, { signal: ctrl2.signal });
      if (!r.ok) throw new Error('pobranie ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 20000) throw new Error('zdjęcie podejrzanie małe');

      const gotowy = await zloz(buf);
      // проверяем УЖЕ сложенный кадр: часть снимка растворяется к центру,
      // и логотип из отрезанной половины до поста всё равно не доедет
      if (await maObcyLogotyp(gotowy)) {
        console.log(`[photo] pomijam kadr z obcym logo (${wybrany.photographer})`);
        continue;
      }

      await mkdir(PHOTO_DIR, { recursive: true });
      const safe = (name || `foto-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
      const file = path.join(PHOTO_DIR, `${safe}.jpg`);
      await writeFile(file, gotowy);
      return { file, query, autor: wybrany.photographer, zrodlo: wybrany.url };
    } catch {
      continue;
    } finally {
      clearTimeout(timer2);
    }
  }
  return null;
}

// node photo.mjs "small business owner phone" — проверить поиск руками
if (process.argv[1] && process.argv[1].endsWith('photo.mjs')) {
  const q = process.argv.slice(2).join(' ') || 'small business owner smartphone';
  const wynik = await findPhoto(q, { name: 'test' });
  console.log(wynik || 'nic nie znaleziono');
}
