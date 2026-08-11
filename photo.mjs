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

// ── своя библиотека кадров ───────────────────────────────────────
// Папка foto/ — снимки, которые Захар отобрал руками. Сток даёт вероятность:
// запрос про польский автосервис в среднем даёт польский автосервис, но каждый
// отдельный кадр — лотерея. Своя папка даёт определённость: в ленту попадает
// ровно то, что человек посмотрел и одобрил. Это обычный подбор материала,
// как в любом агентстве, только один раз и заранее.
//
// ZOVU_FOTO=wlasne — брать ТОЛЬКО свои кадры, в сток не ходить вовсе.
// ZOVU_FOTO=stock  — только сток (так было раньше).
// по умолчанию: свои, если папка не пуста, иначе сток.
const WLASNE_DIR = path.join(import.meta.dirname, 'foto');

async function wlasneKadry() {
  try {
    const { readdir } = await import('node:fs/promises');
    const pliki = (await readdir(WLASNE_DIR)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    return pliki.sort();
  } catch {
    return [];
  }
}

// Выбор своего кадра под смысл поста. Имя файла — это его теги: слова через
// дефис (warsztat-auto-1.jpg). Совпадение считаем по общим словам с запросом;
// не совпало ни одно — берём по кругу, чтобы кадры не повторялись подряд.
// Любой кадр из этой папки уместен по определению: его уже одобрили.
function dopasuj(pliki, query, nth) {
  const slowa = String(query || '').toLowerCase().split(/[^a-zа-я0-9ąćęłńóśźż]+/i).filter((w) => w.length > 2);
  let najlepszy = null;
  let ile = 0;
  for (const f of pliki) {
    const tagi = f.replace(/\.[^.]+$/, '').toLowerCase().split(/[^a-zа-я0-9ąćęłńóśźż]+/i);
    const wspolne = tagi.filter((t) => t.length > 2 && slowa.includes(t)).length;
    if (wspolne > ile) {
      ile = wspolne;
      najlepszy = f;
    }
  }
  return najlepszy || pliki[nth % pliki.length];
}

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
  const artW = W;

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

  // Кадр занимает ВЕСЬ пост, а не правую треть. Растворение к левому краю
  // оставляло там чёрную плиту: сколько ни осветляй снимок, половина поста
  // всё равно оставалась пустой — Захар на две правки подряд честно сказал,
  // что разницы не видит. Читаемость букв держит мягкая вуаль шаблона
  // (.has-foto), поэтому своё затемнение здесь почти не нужно.
  const zmiekczone = foto;

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
           <stop offset="0" stop-color="#050505" stop-opacity="0.18"/>
           <stop offset="0.38" stop-color="#050505" stop-opacity="0.1"/>
           <stop offset="0.62" stop-color="#050505" stop-opacity="0.02"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0"/>
         </linearGradient>
         <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0.8" stop-color="#050505" stop-opacity="0"/>
           <stop offset="1" stop-color="#050505" stop-opacity="0.4"/>
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
// Бюджет проверок на один прогон. Каждая — вызов модели, а квота бесплатного
// тира общая с текстом поста. Карусель на шести кадрах по шесть кандидатов
// давала до 36 вызовов и могла выесть дневной лимит, после чего пост не
// напишется вовсе: картинка важна, но текст важнее. Кончился бюджет — кадры
// идут без проверки, и об этом сказано в логе, а не тихо.
let budzetOcen = Number(process.env.ZOVU_LIMIT_OCEN || 12);

async function ocenKadr(buf, query) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { logo: false, kadr: true };
  if (budzetOcen <= 0) {
    console.warn('[photo] limit sprawdzania kadrów wyczerpany — biorę kadr bez kontroli logo');
    return { logo: false, kadr: true, temat: true };
  }
  budzetOcen--;

  // Спрашиваем ЖЁСТКО и с перечнем мест, где знак прячется. Мягкая формулировка
  // пропустила щит Lamborghini на стене автосервиса — крупный, читаемый, ровно
  // тот случай, ради которого проверка и заведена. Модель отвечает «нет», когда
  // сомневается, поэтому сомнение надо трактовать за нас: сказано «если не
  // уверен — считай, что логотип есть».
  const pytanie =
    'Oceniasz kadr do posta agencji marketingowej. Odpowiedz TYLKO obiektem JSON:\n' +
    '{"logo": true/false, "kadr": true/false, "temat": true/false}\n' +
    `temat = czy na zdjęciu widać to, o co prosiliśmy: „${String(query || '').slice(0, 60)}". ` +
    'Sama branża nie wystarczy: pusta hala albo opuszczony budynek to NIE jest ' +
    'warsztat przy pracy. Ma być widać scenę, o którą prosiliśmy.\n' +
    'logo = czy w kadrze widać JAKIKOLWIEK cudzy znak firmowy. Szukaj wszędzie:\n' +
    '  • emblematy i logotypy aut (na masce, kierownicy, feldze, na ścianie warsztatu)\n' +
    '  • plakaty, szyldy, banery, naklejki, tablice reklamowe\n' +
    '  • napisy na ubraniu, fartuchu, kubku, opakowaniu, torbie\n' +
    '  • logo na ekranie laptopa, telefonu, monitora\n' +
    'Liczy się też znak częściowo zasłonięty albo lekko rozmyty, jeśli da się go ' +
    'rozpoznać. NIE liczy się tekst nieczytelny ani sam kształt bez marki.\n' +
    'Jeśli masz wątpliwość, czy to znak marki — odpowiedz true.\n' +
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
    return { logo: o.logo === true, kadr: o.kadr !== false, temat: o.temat !== false };
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
export async function findPhoto(query, { name, nth = 0 } = {}) {
  const tryb = String(process.env.ZOVU_FOTO || '').trim().toLowerCase();

  // Сначала своя папка. Кадр оттуда проходит ту же обработку, что и стоковый,
  // поэтому в шаблоне он сидит один в один и ничего подкручивать не нужно.
  if (tryb !== 'stock') {
    const pliki = await wlasneKadry();
    if (pliki.length) {
      const wybrany = dopasuj(pliki, query, nth);
      try {
        const buf = await readFile(path.join(WLASNE_DIR, wybrany));
        const gotowy = await zloz(buf);
        await mkdir(PHOTO_DIR, { recursive: true });
        const safe = (name || `foto-${nth}`).replace(/[^a-zA-Z0-9._-]/g, '-');
        const file = path.join(PHOTO_DIR, `${safe}.jpg`);
        await writeFile(file, gotowy);
        console.log(`[photo] własny kadr: ${wybrany}`);
        return { file, query, autor: 'ZOVU', zrodlo: 'foto/' + wybrany, wlasne: true };
      } catch (e) {
        console.warn(`[photo] własny kadr ${wybrany} nie wyszedł: ${e.message}`);
      }
    } else if (tryb === 'wlasne') {
      // Режим «только свои», а папка пуста — молчать нельзя: движок откатится
      // на генерённые фоны, и человек решит, что подбор сломался.
      console.warn('[photo] ZOVU_FOTO=wlasne, ale folder foto/ jest pusty — nie ma z czego wybierać');
      return null;
    }
  }
  if (tryb === 'wlasne') return null;

  const key = await klucz();
  if (!key || !query) return null;

  // locale=pl-PL — поиск в польском контексте. Клиент у нас в Катовицах, и
  // кадр должен читаться как местный малый бизнес, а не как безликий сток из
  // калифорнийского опенспейса: другие вывески, интерьеры, улицы, одежда.
  // Отбор идёт по МЕСТУ И ОБСТАНОВКЕ. Людей по внешности не фильтруем.
  const url =
    `${API}?query=${encodeURIComponent(query)}` +
    '&orientation=portrait&size=medium&per_page=20&locale=pl-PL';

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

  // Идём по кандидатам, пока не попадётся кадр без чужого логотипа. Шесть, а
  // не четыре: после ужесточения проверки отсев вырос, и на «брендовых» темах
  // (авто, техника) четырёх кандидатов стало не хватать — движок откатывался
  // на генерённый фон, хотя годный кадр стоял пятым.
  for (const wybrany of kandydaci.slice(0, 6)) {
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
      const ocena = await ocenKadr(gotowy, query);
      if (ocena.logo) {
        console.log(`[photo] pomijam: obce logo w kadrze (${wybrany.photographer})`);
        continue;
      }
      if (!ocena.kadr) {
        console.log(`[photo] pomijam: kadr nieczytelny, np. tułów bez głowy (${wybrany.photographer})`);
        continue;
      }
      // Кадр «про отрасль», но не про сцену. Стоку всё равно: по запросу
      // «мастерская» он отдаёт и заброшенную промзону — тема угадана, а
      // происходящего в кадре нет. В посте это читается как случайная картинка.
      if (!ocena.temat) {
        console.log(`[photo] pomijam: kadr nie pasuje do tematu (${wybrany.photographer})`);
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
