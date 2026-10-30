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
async function zloz(buf, okno = null) {
  const W = 1080;
  const H = 1350;
  const artW = W;

  // Дуотон в меру. Живой кадр рядом с фиолетовым логотипом выглядел как
  // случайная картинка из интернета, полный дуотон синил лица. Смесь держит
  // палитру бренда и не убивает естественность кожи.
  const obr = okno?.lustro ? sharp(await sharp(buf).rotate().flop().toBuffer()) : sharp(buf).rotate();
  const naturalny = await (okno ? obr.extract({ left: okno.left, top: okno.top, width: okno.width, height: okno.height }) : obr)
    // Окно считает kadruj() по рамке главного объекта от модели: объект целиком
    // и там, где его не закроет текст. Без рамки (модель молчит, свой кадр) —
    // 'attention', как раньше.
    .resize(artW, H, okno ? { fit: 'fill' } : { fit: 'cover', position: 'attention' })
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

// ── где в посте свободно от букв (29.10.2026) ─────────────────────
// Митя: «чтобы фотки были нормально выбраны и нормально стояли». В старых
// постах лицо сидело ровно под заголовком, а 'attention' резал кадр вслепую.
// Теперь модель отдаёт рамку главного объекта, и окно кадра двигается так,
// чтобы объект целиком попал в зону, где текста нет:
//   • foto / item — текст прижат к низу, объект в верхней половине;
//   • lista / cytat / cover — текст колонкой слева под тёмной вуалью,
//     объект справа (там вуаль почти прозрачная).
// Доли кадра 1080×1350.
const STREFY = {
  foto: { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.6 },
  item: { x0: 0.02, x1: 0.98, y0: 0.02, y1: 0.58 },
  lista: { x0: 0.4, x1: 1, y0: 0.02, y1: 0.98 },
  cytat: { x0: 0.4, x1: 1, y0: 0.02, y1: 0.98 },
  cover: { x0: 0.4, x1: 1, y0: 0.02, y1: 0.98 },
};

// Окно 4:5 в координатах снимка, в котором рамка объекта (box, доли 0–1)
// целиком лежит в зоне. Сначала без зума, потом приближаем до ×1.6, но не
// мельче 760 px по ширине (иначе апскейл мылит). null — не помещается:
// такой кадр под этот макет не берём, а не режем объект.
// box — весь главный объект, klucz — его главная часть (лица, руки с
// предметом, сам товар). Правило Мити «главное целиком»: klucz целиком в зоне
// без текста; весь объект не режется сверху и по бокам, а вниз может уходить
// под текст (человек в рост — ноги под подписью, это нормально).
export function kadruj(W0, H0, box, uklad = 'foto', klucz = null) {
  const Z = STREFY[uklad] || STREFY.foto;
  const k = klucz || box;
  const r = 1080 / 1350;
  const px = (b) => [b[0] * W0, b[1] * H0, b[2] * W0, b[3] * H0];
  const [bx0, by0, bx1] = px(box);
  const [kx0, ky0, kx1, ky1] = px(k);
  const chMax = Math.min(H0, W0 / r);
  const m = 0.015;
  for (let z = 1; z <= 1.6001; z += 0.1) {
    const ch = chMax / z;
    const cw = ch * r;
    if (cw < 760) break;
    if (kx1 - kx0 > (Z.x1 - Z.x0 - 2 * m) * cw || ky1 - ky0 > (Z.y1 - Z.y0 - 2 * m) * ch) continue;
    if (bx1 - bx0 > cw * 0.995) continue;
    const zcx = (Z.x0 + Z.x1) / 2, zcy = (Z.y0 + Z.y1) / 2;
    // по горизонтали держим весь объект, если он влезает, иначе ключ
    let wx = (kx0 + kx1) / 2 - zcx * cw;
    wx = Math.max(Math.min(bx0 - m * cw, wx), bx1 + m * cw - cw);
    let wy = (ky0 + ky1) / 2 - zcy * ch;
    wy = Math.min(wy, by0 - m * ch);
    wx = Math.max(0, Math.min(W0 - cw, wx));
    wy = Math.max(0, Math.min(H0 - ch, wy));
    const f = (v, o, d) => (v - o) / d;
    const kIn =
      f(kx0, wx, cw) >= Z.x0 && f(kx1, wx, cw) <= Z.x1 && f(ky0, wy, ch) >= Z.y0 && f(ky1, wy, ch) <= Z.y1;
    const bIn = f(bx0, wx, cw) >= -0.005 && f(bx1, wx, cw) <= 1.005 && f(by0, wy, ch) >= -0.005;
    if (kIn && bIn) {
      return { left: Math.round(wx), top: Math.round(wy), width: Math.round(cw), height: Math.round(ch) };
    }
  }
  return null;
}

async function podglad(buf) {
  return sharp(buf).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
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
let budzetOcen = Number(process.env.ZOVU_LIMIT_OCEN || 40);

// 29.10.2026: проверка больше НЕ пропускает кадр молча. Раньше при сбое модели,
// без ключа или после конца бюджета кадр шёл в пост без глаз — так под текст
// про шаблоны встала собака. Теперь null = «не проверен», и стоковый кадр
// без проверки в ленту не идёт (движок возьмёт следующий или откатится).
// Модель смотрит на СЫРОЙ снимок и отдаёт рамку главного объекта: по ней
// kadruj() ставит объект туда, где нет букв.
// Глаза модели: сначала Vertex (облако Google, кредит до 30.11, общей дневной
// квоты нет), потом ключ Gemini. Ночью 29.10 бесплатная квота ключа кончилась
// (рилсы выбрали её подбором кадров), и все кадры вернулись 429 — раньше в
// такой момент фото шли в пост без проверки. Получил 429 — ключ до конца
// прогона больше не дёргаем.
let kluczWyczerpany = false;

async function zapytajWzrok(pytanie, buf) {
  const parts = [{ text: pytanie }, { inline_data: { mime_type: 'image/jpeg', data: buf.toString('base64') } }];
  if (process.env.GCP_PROJECT && process.env.GCP_REFRESH_TOKEN) {
    try {
      const { vertex } = await import('./vertex.mjs');
      return await vertex({
        system: 'Oceniasz zdjęcia. Odpowiadasz wyłącznie obiektem JSON.',
        parts: [{ text: pytanie }, { inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } }],
        temperatura: 0,
      });
    } catch (e) {
      console.warn(`[photo] Vertex: ${e.message.slice(0, 120)} — próbuję klucz Gemini`);
    }
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key || kluczWyczerpany) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + key,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          // запас по токенам: «думающая» flash тратит их до ответа
          generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!r.ok) {
      console.warn(`[photo] ocena kadru: Gemini ${r.status}`);
      if (r.status === 429) kluczWyczerpany = true;
      return null;
    }
    const j = await r.json();
    return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
  } finally {
    clearTimeout(timer);
  }
}

export function wzrokDostepny() {
  return Boolean((process.env.GCP_PROJECT && process.env.GCP_REFRESH_TOKEN) || process.env.GEMINI_API_KEY);
}

async function ocenKadr(buf, query) {
  if (!wzrokDostepny()) return null;
  if (budzetOcen <= 0) {
    console.warn('[photo] limit sprawdzania kadrów wyczerpany — kadrów bez kontroli nie biorę');
    return null;
  }
  budzetOcen--;

  // Спрашиваем ЖЁСТКО и с перечнем мест, где знак прячется. Мягкая формулировка
  // пропустила щит Lamborghini на стене автосервиса. Сомнение трактуем за нас.
  const pytanie =
    'Oceniasz kadr do posta agencji marketingowej. Odpowiedz TYLKO obiektem JSON:\n' +
    '{"logo": true/false, "kadr": true/false, "ostry": true/false, "temat": 0/1/2, "stop": true/false, "box_2d": [ymin, xmin, ymax, xmax], "klucz_2d": [ymin, xmin, ymax, xmax]}\n' +
    `temat = jak blisko kadr jest tematu „${String(query || '').slice(0, 60)}":\n` +
    '  2 = na pierwszy rzut oka widać scenę z tej dziedziny (człowiek przy tej pracy, ten przedmiot),\n' +
    '  1 = neutralna scena pracy, biura, sklepu albo warsztatu z człowiekiem lub narzędziem,\n' +
    '  0 = zupełnie inna bajka: zwierzęta, przyroda, sport, wakacje, wnętrza\n' +
    '      prywatne, bałagan, puste i opuszczone miejsca bez ludzi i bez pracy.\n' +
    'W razie wątpliwości między 2 a 1 odpowiedz 1, między 1 a 0 odpowiedz 0.\n' +
    'stop = czy w kadrze jest coś, czego marka nie postawi za tekstem NIGDY:\n' +
    '  zwierzę (także pies lub kot w tle), dziecko, klatka lub kraty, szpital, lekarstwa, cmentarz, broń,\n' +
    '  symbole religijne, polityka, alkohol, wypadek, przemoc, człowiek w złym\n' +
    '  stanie, starość i bieda, bałagan, smutna lub przygnębiająca scena. Jeśli tak — true.\n' +
    'logo = czy w kadrze jest WYRAŹNY, CZYTELNY cudzy znak firmowy, który widz od razu rozpozna:\n' +
    '  nazwa marki lub logotyp na ubraniu, kubku, opakowaniu, szyldzie, plakacie, masce auta,\n' +
    '  logo producenta na laptopie lub telefonie (jabłko Apple itp.), ikona znanej aplikacji duża na ekranie.\n' +
    '  NIE liczy się: drobny, rozmyty albo nieczytelny napis, zwykły interfejs telefonu bez marki,\n' +
    '  sam kształt urządzenia, tekst na kartce, cennik bez nazwy firmy.\n' +
    'kadr = czy kadr jest czytelny: widać, co się dzieje, a jeśli jest człowiek, ' +
    'to widać jego twarz lub całą sylwetkę, a nie sam fragment tułowia bez głowy.\n' +
    'ostry = czy główny obiekt jest ostry i dobrze oświetlony (nie rozmyty, nie w ciemności, nie za szybą).\n' +
    'box_2d = ramka GŁÓWNEGO obiektu w skali 0–1000: człowiek razem z głową i rękami przy pracy ' +
    '(jeśli jest kilku, ramka obejmuje wszystkich ważnych), przedmiot w całości. Ramka ciasna, ale nic nie ucięte.\n' +
    'klucz_2d = ramka NAJWAŻNIEJSZEJ części w tej samej skali: twarz (twarze) razem z rękami i przedmiotem, ' +
    'którym człowiek pracuje; dla samego przedmiotu — cały przedmiot. Bez nóg i tułowia, jeśli nie są ważne.';

  try {
    const tekst = await zapytajWzrok(pytanie, buf);
    if (!tekst) return null;
    const o = JSON.parse(tekst);
    const temat =
      typeof o.temat === 'boolean' ? (o.temat ? 2 : 0) : Math.max(0, Math.min(2, Number(o.temat) || 0));
    const ramka = (v) => {
      const b = Array.isArray(v) ? v.map(Number) : null;
      if (!b || b.length !== 4 || !b.every((x) => Number.isFinite(x))) return null;
      const [y0, x0, y1, x1] = b.map((x) => Math.max(0, Math.min(1000, x)) / 1000);
      return x1 - x0 > 0.03 && y1 - y0 > 0.03 ? [x0, y0, x1, y1] : null;
    };
    const box = ramka(o.box_2d);
    let klucz = ramka(o.klucz_2d);
    // ключ обязан лежать внутри объекта; модель иногда путает — тогда без него
    if (klucz && box && (klucz[0] < box[0] - 0.05 || klucz[2] > box[2] + 0.05 || klucz[1] < box[1] - 0.05 || klucz[3] > box[3] + 0.05)) klucz = null;
    return {
      logo: o.logo === true,
      kadr: o.kadr !== false,
      ostry: o.ostry !== false,
      temat,
      stop: o.stop === true,
      box,
      klucz,
    };
  } catch (e) {
    console.warn(`[photo] ocena kadru nie wyszła: ${e.message}`);
    return null;
  }
}

// Рамка → окно кадра. Нет рамки — окно не задаём (сработает 'attention').
async function oknoDla(buf, ocena, uklad) {
  if (!ocena?.box) return { okno: null, pasuje: false };
  const m = await sharp(buf).rotate().metadata();
  // после rotate() metadata отдаёт размеры до поворота — для EXIF 5–8 меняем местами
  const obrot = (m.orientation || 1) >= 5;
  const W0 = obrot ? m.height : m.width;
  const H0 = obrot ? m.width : m.height;
  let okno = kadruj(W0, H0, ocena.box, uklad, ocena.klucz);
  // Объект слева, а свободно справа (lista/cytat/cover) — зеркалим снимок.
  // Лицензия Pexels правки разрешает, надписей в кадре нет (их отсеивает проверка).
  if (!okno) {
    const lustro = (b) => (b ? [1 - b[2], b[1], 1 - b[0], b[3]] : null);
    const o = kadruj(W0, H0, lustro(ocena.box), uklad, lustro(ocena.klucz));
    if (o) okno = { ...o, lustro: true };
  }
  return { okno, pasuje: Boolean(okno) };
}

// Ищем кадр под запрос. Возвращаем null (а не бросаем), чтобы вызывающий
// спокойно откатился на генерацию: пост важнее источника картинки.
// uklad — макет поста (foto / lista / cytat / item / cover): от него зависит,
// где в кадре свободно от текста и куда ставить главный объект.
export async function findPhoto(query, { name, nth = 0, uklad = 'foto' } = {}) {
  const tryb = String(process.env.ZOVU_FOTO || '').trim().toLowerCase();

  // Сначала своя папка. Кадр одобрен человеком, поэтому без проверки модели
  // он годен; модель спрашиваем только про рамку, чтобы правильно поставить.
  if (tryb !== 'stock') {
    const pliki = await wlasneKadry();
    if (pliki.length) {
      const wybrany = dopasuj(pliki, query, nth);
      try {
        const buf = await readFile(path.join(WLASNE_DIR, wybrany));
        const ocena = await ocenKadr(await podglad(buf), query);
        const { okno } = await oknoDla(buf, ocena, uklad);
        const gotowy = await zloz(buf, okno);
        await mkdir(PHOTO_DIR, { recursive: true });
        const safe = (name || `foto-${nth}`).replace(/[^a-zA-Z0-9._-]/g, '-');
        const file = path.join(PHOTO_DIR, `${safe}.jpg`);
        await writeFile(file, gotowy);
        console.log(`[photo] własny kadr: ${wybrany}${okno ? ' (kadr po obiekcie)' : ''}`);
        return { file, query, autor: 'ZOVU', zrodlo: 'foto/' + wybrany, wlasne: true };
      } catch (e) {
        console.warn(`[photo] własny kadr ${wybrany} nie wyszedł: ${e.message}`);
      }
    } else if (tryb === 'wlasne') {
      console.warn('[photo] ZOVU_FOTO=wlasne, ale folder foto/ jest pusty — nie ma z czego wybierać');
      return null;
    }
  }
  if (tryb === 'wlasne') return null;

  const key = await klucz();
  if (!key || !query) return null;
  // Без глаз модели сток не берём вовсе (см. ocenKadr): лучше генерённый фон,
  // чем случайная картинка в ленте.
  if (!wzrokDostepny()) {
    console.warn('[photo] brak Vertex i GEMINI_API_KEY — nie sprawdzę kadru, stocku nie biorę');
    return null;
  }

  console.log(`[photo] szukam w Pexels: "${query}" (układ ${uklad})`);
  const url =
    `${API}?query=${encodeURIComponent(query)}` +
    '&orientation=portrait&size=medium&per_page=30&locale=pl-PL';

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

  // Целимся в СЕРЕДИНУ яркости: тёмное пятно в ленте пролистывают, не читая.
  const CEL = 0.46;
  const kandydaci = (dane.photos || []).filter((p) => {
    const j = jasnosc(p.avg_color);
    return j > 0.2 && j < 0.72;
  });
  if (!kandydaci.length) return null;

  kandydaci.sort((a, b) => Math.abs(jasnosc(a.avg_color) - CEL) - Math.abs(jasnosc(b.avg_color) - CEL));

  // Запасной кадр: всё в порядке, но сцена рядом с темой (temat 1). Берётся,
  // только если он сам по себе чистый: без логотипа, без стоп-сюжета, резкий,
  // объект целиком и не под текстом.
  let zapasowy = null;

  for (const wybrany of kandydaci.slice(0, 8)) {
    const zrodlo = wybrany.src?.large2x || wybrany.src?.large || wybrany.src?.original;
    if (!zrodlo) continue;

    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 45000);
    try {
      const r = await fetch(zrodlo, { signal: ctrl2.signal });
      if (!r.ok) throw new Error('pobranie ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 20000) throw new Error('zdjęcie podejrzanie małe');

      const ocena = await ocenKadr(await podglad(buf), query);
      if (!ocena) {
        console.log(`[photo] pomijam: kadru nie udało się sprawdzić (${wybrany.photographer})`);
        if (budzetOcen <= 0 || (kluczWyczerpany && !process.env.GCP_PROJECT)) break;
        continue;
      }
      if (ocena.stop) {
        console.log(`[photo] odrzucam na amen: scena nie dla marki (${wybrany.photographer})`);
        continue;
      }
      if (ocena.logo) {
        console.log(`[photo] pomijam: obce logo w kadrze (${wybrany.photographer})`);
        continue;
      }
      if (!ocena.kadr || !ocena.ostry) {
        console.log(`[photo] pomijam: kadr nieczytelny albo nieostry (${wybrany.photographer})`);
        continue;
      }
      if (ocena.temat === 0) {
        console.log(`[photo] pomijam: kadr z innej bajki (${wybrany.photographer})`);
        continue;
      }
      // Главное целиком и не под буквами. Не поместился — не режем объект,
      // а берём следующий кадр.
      const { okno, pasuje } = await oknoDla(buf, ocena, uklad);
      if (!pasuje) {
        console.log(`[photo] pomijam: obiekt nie mieści się w wolnym miejscu układu ${uklad} (${wybrany.photographer}) box=${(ocena.box || []).map((v) => v.toFixed(2))} klucz=${(ocena.klucz || []).map((v) => v.toFixed(2))}`);
        continue;
      }
      const gotowy = await zloz(buf, okno);

      if (ocena.temat < 2) {
        console.log(`[photo] do zapasu: scena obok tematu (${wybrany.photographer})`);
        if (!zapasowy) zapasowy = { buf: gotowy, autor: wybrany.photographer, zrodlo: wybrany.url };
        continue;
      }

      await mkdir(PHOTO_DIR, { recursive: true });
      const safe = (name || `foto-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
      const file = path.join(PHOTO_DIR, `${safe}.jpg`);
      await writeFile(file, gotowy);
      console.log(`[photo] biorę: ${wybrany.photographer}, okno ${okno.width}×${okno.height} od ${okno.left},${okno.top}${okno.lustro ? ', lustro' : ''}`);
      return { file, query, autor: wybrany.photographer, zrodlo: wybrany.url };
    } catch {
      continue;
    } finally {
      clearTimeout(timer2);
    }
  }

  if (zapasowy) {
    try {
      await mkdir(PHOTO_DIR, { recursive: true });
      const safe = (name || `foto-${nth}`).replace(/[^a-zA-Z0-9._-]/g, '-');
      const file = path.join(PHOTO_DIR, `${safe}.jpg`);
      await writeFile(file, zapasowy.buf);
      console.log(`[photo] biorę kadr zapasowy (nikt nie pasował dokładnie do tematu): ${zapasowy.autor}`);
      return { file, query, autor: zapasowy.autor, zrodlo: zapasowy.zrodlo };
    } catch {
      /* не вышло — уходим в откат на генерацию */
    }
  }
  console.log(`[photo] bez zdjęcia: żaden kadr nie nadał się do "${query}" — wracam do tła generowanego`);
  return null;
}

// node photo.mjs "small business owner phone" — проверить поиск руками
if (process.argv[1] && process.argv[1].endsWith('photo.mjs')) {
  const ukl = (process.argv.find((a) => a.startsWith('--uklad=')) || '').split('=')[1] || 'foto';
  const q = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || 'small business owner smartphone';
  const wynik = await findPhoto(q, { name: 'test', uklad: ukl });
  console.log(wynik || 'nic nie znaleziono');
}
