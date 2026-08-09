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

  // Дуотон в меру. Живой кадр рядом с фиолетовым логотипом выглядел как
  // случайная картинка из интернета, полный дуотон синил лица. Смесь держит
  // палитру бренда и не убивает естественность кожи.
  const naturalny = await sharp(buf)
    // 'attention' оставляет в кадре главное — лицо или предмет, а не угол стены
    .resize(artW, H, { fit: 'cover', position: 'attention' })
    // Светлее, чем кажется правильным. Первая версия утонула в чёрном: Захар
    // сказал «темновато». В ленте пост конкурирует за взгляд, а тёмное пятно
    // пролистывают не читая.
    .modulate({ brightness: 1.12, saturation: 1.06 })
    .linear(1.1, -8)
    .toBuffer();

  const szary = await sharp(naturalny).grayscale().toBuffer();
  const duo = await sharp(szary)
    .composite([
      {
        input: { create: { width: artW, height: H, channels: 4, background: { r: 139, g: 92, b: 246, alpha: 0.55 } } },
        blend: 'overlay',
      },
      {
        input: { create: { width: artW, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.55 } } },
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  const foto = await sharp(naturalny).composite([{ input: duo, blend: 'over' }]).toBuffer();

  // Растворяем кадр ПО ДИАГОНАЛИ: пусто в левом верхнем углу, плотно в правом
  // нижнем. Заголовок живёт сверху слева, поэтому буквы больше не ложатся на
  // лицо — текст и снимок расходятся по разным углам вместо драки за середину.
  const rozmycie = Buffer.from(
    `<svg width="${artW}" height="${H}">
       <defs><linearGradient id="g" x1="0.1" y1="0" x2="0.62" y2="1">
         <stop offset="0" stop-color="#fff" stop-opacity="0"/>
         <stop offset="0.42" stop-color="#fff" stop-opacity="0.12"/>
         <stop offset="0.66" stop-color="#fff" stop-opacity="0.7"/>
         <stop offset="0.88" stop-color="#fff" stop-opacity="1"/>
       </linearGradient></defs>
       <rect width="${artW}" height="${H}" fill="url(#g)"/>
     </svg>`
  );
  const zmiekczone = await sharp(foto)
    .composite([{ input: rozmycie, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Свечение ПОД фотографией: фиолетовое пятно в правом нижнем углу и холодный
  // отсвет сверху. Без него кадр висит в пустой черноте — именно это читалось
  // как «темновато». Пятно даёт глубину и цепляет взгляд в ленте.
  const poswiata = Buffer.from(
    `<svg width="${W}" height="${H}">
       <defs>
         <radialGradient id="cieplo" cx="0.78" cy="0.72" r="0.62">
           <stop offset="0" stop-color="#7c3aed" stop-opacity="0.55"/>
           <stop offset="0.45" stop-color="#6d28d9" stop-opacity="0.24"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0"/>
         </radialGradient>
         <radialGradient id="chlod" cx="0.72" cy="0.12" r="0.5">
           <stop offset="0" stop-color="#a78bfa" stop-opacity="0.22"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${W}" height="${H}" fill="url(#cieplo)"/>
       <rect width="${W}" height="${H}" fill="url(#chlod)"/>
     </svg>`
  );

  // Вуали поверх кадра: слева под заголовок, снизу под логотип. Обе слабее,
  // чем были — свет важнее идеальной чистоты фона, буквы и так держатся на
  // двойной тени из шаблона.
  const dol = Buffer.from(
    `<svg width="${W}" height="${H}">
       <defs>
         <linearGradient id="l" x1="0" x2="1">
           <stop offset="0" stop-color="#050505" stop-opacity="0.42"/>
           <stop offset="0.38" stop-color="#050505" stop-opacity="0.26"/>
           <stop offset="0.62" stop-color="#050505" stop-opacity="0.06"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0"/>
         </linearGradient>
         <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0.76" stop-color="#050505" stop-opacity="0"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0.6"/>
         </linearGradient>
       </defs>
       <rect width="${W}" height="${H}" fill="url(#l)"/>
       <rect width="${W}" height="${H}" fill="url(#d)"/>
     </svg>`
  );

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 10, g: 8, b: 18, alpha: 1 } },
  })
    .composite([
      { input: poswiata, blend: 'over' },
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
async function ocenKadr(buf) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { logo: false, kadr: true };

  const pytanie =
    'Oceniasz kadr do posta w social mediach. Odpowiedz TYLKO obiektem JSON:\n' +
    '{"logo": true/false, "kadr": true/false}\n' +
    'logo = czy widać czytelne logo marki, nazwę firmy albo napis reklamowy ' +
    '(na ubraniu, opakowaniu, szyldzie, ekranie).\n' +
    'kadr = czy kadr jest czytelny: widać, co się dzieje, a jeśli jest człowiek, ' +
    'to widać jego twarz lub całą sylwetkę, a nie sam fragment tułowia bez głowy.';

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
          generationConfig: { temperature: 0, maxOutputTokens: 60, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!r.ok) return { logo: false, kadr: true };
    const j = await r.json();
    const tekst = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const o = JSON.parse(tekst);
    return { logo: o.logo === true, kadr: o.kadr !== false };
  } catch {
    // модель не ответила или прислала не JSON — пропускаем кадр дальше:
    // контроль страхует публикацию, а не решает за неё
    return { logo: false, kadr: true };
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

  // Целимся в СЕРЕДИНУ яркости, а не в самый тёмный кадр. Сначала брали
  // «потемнее, чтобы буквы читались» — и посты вышли мрачными, Захар сказал
  // «темновато». Контраст текста даёт вуаль, а кадр должен быть живым:
  // тёмное пятно в ленте пролистывают, не читая.
  const CEL = 0.46;
  const kandydaci = (dane.photos || []).filter((p) => {
    const j = jasnosc(p.avg_color);
    return j > 0.2 && j < 0.72;
  });
  if (!kandydaci.length) return null;

  kandydaci.sort((a, b) => Math.abs(jasnosc(a.avg_color) - CEL) - Math.abs(jasnosc(b.avg_color) - CEL));

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
      // поэтому и лого, и обрезка оцениваются ровно в том виде, в каком
      // попадут в ленту
      const ocena = await ocenKadr(gotowy);
      if (ocena.logo) {
        console.log(`[photo] pomijam: obce logo w kadrze (${wybrany.photographer})`);
        continue;
      }
      if (!ocena.kadr) {
        console.log(`[photo] pomijam: kadr nieczytelny, np. tułów bez głowy (${wybrany.photographer})`);
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
