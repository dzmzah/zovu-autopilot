// Синтез речи для рилсов без ведущего — локально, бесплатно, офлайн.
//
// Устройство. Фразы озвучиваются ПО ОДНОЙ и склеиваются с паузами. Это даёт
// две вещи разом:
//   1. точные границы каждой фразы — мы их не угадываем, а задаём;
//   2. управляемый ритм — пауза между фразами это и есть темп ролика.
//
// Почему не расшифровывать собственный синтез. Пробовали: whisper на польском
// слышит «czy powody» вместо «Trzy powody», а на серверах GitHub большой
// модели нет вовсе — маленькая ломает текст сильнее. Мы САМИ произнесли эти
// слова, знать их со стороны незачем.
//
// Слова внутри фразы раскладываются по длине с поправкой на то, что пробелы
// и знаки препинания времени почти не занимают. Фраза короткая (2–4 слова),
// поэтому ошибка внутри неё — сотые доли секунды, глазом не ловится. Ровно
// эта раскладка на ЦЕЛОМ клипе давала «огрызки», а на короткой фразе она
// точна, потому что границы фразы жёсткие.
//
//   node glos.mjs "Pierwsza fraza." "Druga fraza." — проверка
import { mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
// Озвучка кэшируется по отпечатку текста и настроек: у бесплатного тарифа
// ElevenLabs всего 10 тысяч символов в месяц, и пересборка монтажа не должна
// покупать одну и ту же фразу заново.
const KESZ = path.join(DIR, 'out', 'glos-kesz');

// На сервере модель кладётся в кэш и путь приходит переменной; на машине
// лежит рядом с проектом. Хардкод одного пути ломал бы то или другое.
export const MODEL_PL =
  process.env.PIPER_MODEL ||
  path.join('D:', 'My AI', 'Zovu.pl', 'Awatar', '09_Glos', 'modele', 'pl_PL-darkman-medium.onnx');

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Ключи берём из окружения либо из `.env` рядом с проектом — так же, как
// это делает поиск стока, чтобы не заводить второй способ настройки.
async function zEnv(klucz) {
  if (process.env[klucz]) return process.env[klucz].trim();
  try {
    const raw = await readFile(path.join(DIR, '.env'), 'utf8');
    const m = raw.match(new RegExp('^\\s*' + klucz + '\\s*=\\s*(.+)\\s*$', 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function trwanie(plik) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', plik,
  ]);
  return parseFloat(stdout.trim());
}

// ── Azure: нейронный голос ────────────────────────────────────────
// Локальный синтез (Piper, Chatterbox) на польском упёрся в потолок —
// Захар забраковал оба: слышно машину. Нейронные голоса Azure другого
// класса, а бесплатный тариф даёт 500 тысяч символов в месяц против наших
// девяти — запас в полсотни раз, и коммерция разрешена, в отличие от
// бесплатного ElevenLabs.
//
// Ключ и регион — в `.env` или в секретах GitHub:
//   AZURE_SPEECH_KEY=...
//   AZURE_SPEECH_REGION=northeurope
const AZURE_GLOS = process.env.AZURE_VOICE || 'pl-PL-MarekNeural';

function ssml(tekst, glos, tempo) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // `rate` заметно оживляет речь: ровный темп и есть половина ощущения
  // «читает робот». Чуть быстрее нормы — так говорят в коротком видео.
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pl-PL">
  <voice name="${glos}"><prosody rate="${tempo}">${esc(tekst)}</prosody></voice>
</speak>`;
}

async function powiedzAzure(tekst, wyjscie, { klucz, region, glos, tempo = '+6%' }) {
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': klucz,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
      'User-Agent': 'zovu-rolki',
    },
    body: ssml(tekst, glos, tempo),
  });
  if (!r.ok) throw new Error(`Azure ${r.status}: ${(await r.text()).slice(0, 200)}`);
  await writeFile(wyjscie, Buffer.from(await r.arrayBuffer()));
}

// ── ElevenLabs ────────────────────────────────────────────────────
// Победитель отбора: Piper и Chatterbox Захар забраковал как машинные,
// у польских голосов Azure нет управления эмоцией вообще (ни одного стиля
// `express-as`), а здесь голос `Jan Gajos` на Multilingual v2 звучит живым.
//
// Настройки взяты с того самого прогона, который Захар утвердил, — они
// закодированы прямо в имени скачанного файла: `sp102_s40_sb75_se40_m2`.
// Менять их наугад нельзя: на слух разница между Stability 40 и 55 — это
// разница между человеком и диктором.
//
// Важно: `<break time="0.3s" />` модель понимает прямо в тексте, а теги в
// квадратных скобках — НЕТ, их умеет только v3. В v2 они прочитаются вслух.
const EL_API = 'https://api.elevenlabs.io/v1/text-to-speech';

export const EL_USTAWIENIA = {
  model_id: 'eleven_multilingual_v2',
  stability: 0.4,
  similarity_boost: 0.75,
  style: 0.4,
  use_speaker_boost: true,
  // Было 1.02 — «чуть быстрее нормы, так говорят в коротком видео». На слух
  // вышло наоборот: Захар дважды поймал скороговорку. Замер подтвердил —
  // отдельные фразы уходили за 6,5 слог/с. Ниже нормы модель звучит спокойно,
  // а выравнивание темпа ниже подчищает остаток.
  speed: 0.97,
};

async function powiedzEleven(tekst, wyjscie, { klucz, glos, ustawienia = {} }) {
  const u = { ...EL_USTAWIENIA, ...ustawienia };
  const r = await fetch(
    `${EL_API}/${glos}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': klucz, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: tekst,
        model_id: u.model_id,
        voice_settings: {
          stability: u.stability,
          similarity_boost: u.similarity_boost,
          style: u.style,
          use_speaker_boost: u.use_speaker_boost,
          speed: u.speed,
        },
      }),
    }
  );
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  await writeFile(wyjscie, Buffer.from(await r.arrayBuffer()));
}

// ── Google Cloud TTS ──────────────────────────────────────────────
// Наш основной диктор с 31.08.2026, и вот почему именно он.
//
// У бесплатного ElevenLabs нет коммерческой лицензии — там требуется
// пометка сервиса, а озвучивать ролики клиентам таким голосом нельзя
// вообще. Плюс их бесплатный тариф с августа не отдаёт библиотечные
// голоса через API. У Gemini лицензия есть, но суточная квота меньше
// десятка запросов — на ролик из восьми фраз впритык, на клиентский из
// восемнадцати не хватает.
//
// У Cloud TTS бесплатный лимит ПОСТОЯННЫЙ и на два порядка больше нашего
// расхода (миллион знаков в месяц против наших десяти тысяч), голоса
// польские родные, а коммерческое использование внутри лимита разрешено.
//
// Ключом служит не API-key, а обновляемый токен OAuth: ключ пришлось бы
// заводить через консоль, а она в браузере ведёт себя непредсказуемо, да
// и утёкший ключ включает чужие сервисы. Токен же ограничен нашим
// проектом и отзывается одним нажатием.
const GOOGLE_TTS = "https://texttospeech.googleapis.com/v1/text:synthesize";
export const GOOGLE_GLOS = 'pl-PL-Chirp3-HD-Charon';

// Токен живёт час; на ролик уходит минута, поэтому берём один на прогон.
let googleToken = null;
async function tokenGoogle({ id, sekret, odswiez }) {
  if (googleToken && googleToken.do > Date.now() + 60000) return googleToken.t;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: sekret,
      refresh_token: odswiez,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) {
    throw new Error('Google: токен не обновился: ' + JSON.stringify(j).slice(0, 200));
  }
  googleToken = { t: j.access_token, do: Date.now() + (j.expires_in || 3600) * 1000 };
  return googleToken.t;
}

async function powiedzGoogle(tekst, wyjscie, { id, sekret, odswiez, projekt, glos, tempo }) {
  const token = await tokenGoogle({ id, sekret, odswiez });
  const r = await fetch(GOOGLE_TTS, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'x-goog-user-project': projekt,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      input: { text: tekst },
      voice: { languageCode: 'pl-PL', name: glos },
      // Скорость ниже единицы — то же лекарство от скороговорки, что и у
      // ElevenLabs: 0.95 звучит спокойно, а выравнивание темпа ниже
      // подчищает остаток по замеру слогов.
      // Формат — НЕ mp3. Захар послушал пробы и сказал «как будто снято на
      // мега хуёвый микрофон», и он был прав: mp3 у Google отдаётся 24 кГц
      // и 32 кбит/с, то есть телефонным качеством. Это не голос плохой, это
      // формат. LINEAR16 приходит без сжатия, дальше всё равно наша сборка.
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 48000, speakingRate: tempo ?? 0.95 },
    }),
  });
  if (!r.ok) throw new Error(`Google TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (!j.audioContent) throw new Error('Google TTS: ответ без звука');
  await writeFile(wyjscie, Buffer.from(j.audioContent, 'base64'));
}

// ── один дубль вместо восьми ──────────────────────────────────────
// Захар про пофразную озвучку: «после десятой секунды прям очень аишно».
// Причина не в тембре. С десятой секунды у нас начинается середина, а она
// написана рублеными точками — «Pomysł. Nagranie. Montaż.» Точки мы ставили
// под ElevenLabs, чтобы он не тараторил; Google на каждой точке даёт
// ЗАВЕРШАЮЩУЮ интонацию, и восемь отдельных дублей встык звучат как робот.
//
// Лечение проверено на слух: тот же смысл, написанный как живая речь, и весь
// ролик ОДНИМ дублем со сквозной линией. Реакция была «реально круто, очень
// хорошие эмоции» — на том же голосе, который до этого забраковали.
//
// Границы фраз тогда не даны заранее, их находим по паузам — тем же способом,
// что и у ElevenLabs без разметки. Не нашлись — честно возвращаем null, и
// наверху остаётся пофразный путь.

// Текст для голоса ≠ текст для подписи. Подписи на экране остаются рублеными,
// диктору отдаём связную речь: точка в КОНЦЕ фразы становится запятой, если
// это не последняя фраза и не вопрос.
export function zywaMowa(frazy, doWymowy) {
  // Механическая замена точек на запятые даёт другую крайность: четырнадцать
  // запятых подряд, речь без структуры. Живой текст, который Захар принял на
  // слух, писался руками — со связками «to jakieś», «razy… robi się», «czyli».
  // Никакая регулярка их не придумает, поэтому у фразы есть поле `mowa`:
  // что на экране и что в ухе — разные тексты, и это норма.
  //
  // Без `mowa` остаётся мягкий запасной путь: точку в КОНЦЕ фразы меняем на
  // запятую, чтобы дубль не распадался на отдельные завершённые предложения.
  // Точки внутри фразы не трогаем — они держат ритм.
  return frazy
    .map((f, n) => {
      if (f.mowa) return String(f.mowa).trim();
      const t = doWymowy(f).trim();
      if (n === frazy.length - 1) return t;
      if (/[?!…]$/.test(t)) return t;
      return t.replace(/\.$/, ',');
    })
    .join(' ');
}

const GOOGLE_PODANIE =
  'Mów jak człowiek, który tłumaczy to koledze przy stole: swobodnie, ze zmiennym ' +
  'rytmem i naturalnymi oddechami. Nie recytuj listy — prowadź jedną myśl do końca. ' +
  'Na ostatnim zdaniu nie trać energii, uśmiechnij się głosem.';

async function jednymDublemGoogle(frazy, wyjscie, google) {
  const tekst = zywaMowa(frazy, doWymowy);
  await powiedzGoogle(tekst, wyjscie, { ...google, podanie: GOOGLE_PODANIE });

  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', wyjscie, '-af', 'silencedetect=n=-35dB:d=0.07', '-f', 'null', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const starty = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => +m[1]);
  const konce = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => +m[1]);
  const calosc = await trwanie(wyjscie);

  const ciszy = starty
    .map((s2, n) => ({ od: s2, doo: konce[n] ?? calosc, dl: (konce[n] ?? calosc) - s2 }))
    .filter((c) => c.doo < calosc - 0.05);

  const potrzeba = frazy.length - 1;

  // Резать по САМЫМ ДЛИННЫМ паузам нельзя. В связной речи длинная пауза стоит
  // там, где смысловая точка, а не там, где кончается наша фраза: первый же
  // прогон дал первой фразе 0,1 секунды и темп 46 слогов в секунду, то есть
  // подписи разъехались бы полностью.
  //
  // Поэтому считаем, ГДЕ пауза должна быть: доля слогов фразы от всех слогов
  // — это её доля времени. Дальше к каждому ожидаемому месту подбираем
  // ближайшую настоящую паузу, не давая границам идти назад.
  const syl = frazy.map((f) => sylaby(f.mowa || f.tekst));
  const suma = syl.reduce((a, b) => a + b, 0) || 1;
  const oczekiwane = [];
  let narastajaco = 0;
  for (let n = 0; n < frazy.length - 1; n++) {
    narastajaco += syl[n];
    oczekiwane.push((narastajaco / suma) * calosc);
  }

  // Связная речь тем и хороша, что пауз в ней мало: на месте наших границ
  // стоит запятая, а не точка. Поэтому если рядом с расчётным местом паузы
  // нет — берём само расчётное место. Разметка тогда приблизительная, но
  // подписи держатся ритма, а голос остаётся тем самым, живым.
  //
  // Падать на пофразную озвучку здесь нельзя: она и есть та «аишность»,
  // из-за которой всё переделывалось.
  const BLISKO = 0.6; // секунд — насколько пауза считается «той самой»
  const ciecia = [];
  let wolneOd = 0;
  let zSlogow = 0;
  for (const cel of oczekiwane) {
    const kandydaci = ciszy.filter((c) => c.od > wolneOd);
    const naj = kandydaci.length
      ? kandydaci.reduce((a, b) =>
          Math.abs((a.od + a.doo) / 2 - cel) <= Math.abs((b.od + b.doo) / 2 - cel) ? a : b
        )
      : null;
    if (naj && Math.abs((naj.od + naj.doo) / 2 - cel) <= BLISKO) {
      ciecia.push(naj);
      wolneOd = naj.doo;
    } else {
      zSlogow++;
      const od2 = Math.max(wolneOd + 0.1, cel - 0.02);
      ciecia.push({ od: od2, doo: od2 + 0.02, dl: 0.02 });
      wolneOd = od2 + 0.02;
    }
  }
  if (zSlogow) {
    console.log(`[glos] границ по слогам: ${zSlogow} из ${oczekiwane.length} — пауз в речи меньше, чем фраз`);
  }

  const granice = [];
  let od = Math.max(0, (konce[0] ?? 0) < 0.4 ? konce[0] : 0);
  for (const c of ciecia) {
    granice.push([od, Math.max(od + 0.15, c.od - 0.02)]);
    od = c.doo + 0.02;
  }
  const ostatniaCisza = ciszy.find((c) => c.od > od && c.doo >= calosc - 0.1);
  granice.push([od, ostatniaCisza ? ostatniaCisza.od + 0.04 : calosc]);

  // Последняя проверка перед выдачей: если хоть одна фраза получила
  // невозможный темп, разметка неверна — молча выкладывать такое нельзя.
  const tempa = granice.map(([a, b], n) => sylaby(frazy[n].tekst) / Math.max(0.2, b - a));
  const zle = tempa.filter((t) => t < 1.2 || t > 9.5).length;
  if (zle) {
    console.warn(
      `[glos] границы дубля не сошлись (${zle} фраз с невозможным темпом) — режу пофразно`
    );
    return null;
  }
  return granice;
}

// ── Gemini TTS ────────────────────────────────────────────────────
// Зачем он здесь. 31.08 бесплатный аккаунт ElevenLabs отказался отдавать
// библиотечный голос через API («Free users cannot use library voices»), и
// то же ограничение накрыло создание своего голоса по описанию. На бесплатном
// тарифе остаются только штатные английские голоса — по-польски они звучат
// с акцентом, то есть лента заговорила бы чужим голосом.
//
// У Gemini голосов тридцать, польский родной, ключ у нас уже есть. Главное
// отличие от ElevenLabs: подача задаётся СЛОВАМИ в самом запросе, а не
// ползунками — поэтому инструкция диктору живёт здесь, у поставщика.
//
// Таймингов символов Gemini не отдаёт, и это не беда: фразы синтезируем по
// отдельности, тогда границы известны точно и общий дубль резать не надо.
const GEMINI_MODEL = 'gemini-2.5-flash-preview-tts';
// Подача у Gemini — это ОДНА строка перед текстом, кончающаяся двоеточием,
// как в их же примерах («Say cheerfully: …»). Длинную инструкцию абзацем
// модель принимает за текст: проба 31.08 дала дубли на 655 секунд вместо
// пятнадцати — она читала саму инструкцию и уходила в петлю.
export const GEMINI_PODANIE =
  'Przeczytaj spokojnie i ciepło, jak polski lektor reklamowy, z pauzami między zdaniami:';

async function powiedzGemini(tekst, wyjscie, { klucz, glos, podanie }) {
  const body = {
    contents: [{ parts: [{ text: (podanie || GEMINI_PODANIE) + ' ' + tekst }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: glos } } },
    },
  };

  // Квота бесплатного Gemini считается запросами в МИНУТУ, а фраз в ролике
  // восемь. На пробе десяти голосов 31.08 три из них поймали 429 подряд —
  // значит пауза в восемь секунд коротка, а ролику нужен весь список фраз,
  // а не «сколько успелось». Поэтому пять попыток по двадцать секунд: минуту
  // подождать дешевле, чем потерять день ленты. На любой другой ответ падаем
  // сразу, чтобы поломка не превратилась в тихую подмену голоса.
  let ostatni = '';
  for (let proba = 0; proba < 5; proba++) {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' +
        GEMINI_MODEL + ':generateContent?key=' + klucz,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (r.ok) {
      const j = await r.json();
      const b64 = j.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64) throw new Error('Gemini вернул ответ без звука');
      // Отдаётся сырой PCM: 16 бит, моно, 24 кГц. Заголовка wav в нём нет,
      // поэтому формат ffmpeg надо назвать руками — иначе он видит мусор.
      const surowy = wyjscie + '.pcm';
      await writeFile(surowy, Buffer.from(b64, 'base64'));
      await ffmpeg(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', surowy,
        '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', wyjscie]);
      return;
    }
    ostatni = r.status + ': ' + (await r.text()).slice(0, 160);
    if (r.status !== 429 && r.status !== 503) break;
    console.warn('[glos] Gemini занят (' + r.status + ') — жду и пробую снова');
    await new Promise((res) => setTimeout(res, 20000));
  }
  throw new Error('Gemini TTS ' + ostatni);
}

// ── дубль С ТАЙМИНГАМИ КАЖДОГО СИМВОЛА ────────────────────────────
// Резать общий дубль по самым длинным паузам — лотерея. При stability 0.4
// модель каждый раз играет иначе: где-то вздохнёт внутри фразы длиннее, чем
// между фразами, и резак промахивается. Захар получил ровно это: `Bez tych
// odpowiedzi cena to zgadywanka` разорвано пополам, призыв оборван на полуслове,
// звук не совпал с подписями. Тот же код на том же сценарии до этого дал
// чистый ролик — значит дело не в коде, а в том, что он гадает.
//
// ElevenLabs умеет отдавать вместе со звуком время начала и конца КАЖДОГО
// символа. Тогда границы фраз не угадываются, а считаются: нашли фразу в
// тексте — взяли время её первого и последнего символа. Гадать больше не о чем.
async function dubelZeZnacznikami(teksty, wyjscie, { klucz, glos, ustawienia = {} }) {
  const u = { ...EL_USTAWIENIA, ...ustawienia };
  // Фразы склеиваем пробелом: каждая и так кончается точкой или знаком
  // вопроса, модель делает паузу сама. Свои паузы мы ставим потом, при
  // сборке дорожки, — так ритм задаём мы, а не случай.
  const tekst = teksty.join(' ');
  const r = await fetch(`${EL_API}/${glos}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': klucz, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: tekst,
      model_id: u.model_id,
      voice_settings: {
        stability: u.stability,
        similarity_boost: u.similarity_boost,
        style: u.style,
        use_speaker_boost: u.use_speaker_boost,
        speed: u.speed,
      },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  await writeFile(wyjscie, Buffer.from(j.audio_base64, 'base64'));

  const a = j.alignment || j.normalized_alignment;
  const znaki = a?.characters;
  const od = a?.character_start_times_seconds;
  const doo = a?.character_end_times_seconds;
  // Если разметка не совпала с текстом по длине — не выдумываем, а честно
  // отдаём null: наверху есть запасной путь по паузам.
  if (!Array.isArray(znaki) || znaki.length !== tekst.length || !od || !doo) {
    console.warn('[glos] разметка символов не сошлась с текстом — режу по паузам');
    return null;
  }

  const granice = [];
  let poz = 0;
  for (const t of teksty) {
    const start = tekst.indexOf(t, poz);
    if (start < 0) {
      console.warn('[glos] не нашёл фразу в общем тексте — режу по паузам');
      return null;
    }
    const koniec = start + t.length;
    poz = koniec;
    // Небольшой запас по краям: согласная в начале слова успевает начаться
    // раньше, чем модель отмечает символ, а хвост гласной — договорить.
    granice.push([Math.max(0, od[start] - 0.04), doo[koniec - 1] + 0.06]);
  }
  return granice;
}

// Piper зовём через python: пакет ставится одной строкой и одинаково работает
// на машине и на сервере GitHub, в отличие от сборок под конкретную ОС.
async function powiedz(tekst, wyjscie, model) {
  const skrypt = `
import sys, wave
from piper import PiperVoice
v = PiperVoice.load(sys.argv[1])
with wave.open(sys.argv[3], 'wb') as w:
    v.synthesize_wav(sys.argv[2], w)
`;
  await execFileAsync('python', ['-c', skrypt, model, tekst, wyjscie], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

// Где во фразе начинается и кончается речь. Нужно, чтобы обрезать тишину,
// которую Piper оставляет по краям, и не растянуть паузы между фразами.
async function granicaMowy(plik, prog = -45) {
  const calosc = await trwanie(plik);
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', plik, '-af', `silencedetect=n=${prog}dB:d=0.06`, '-f', 'null', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const starty = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => +m[1]);
  const konce = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => +m[1]);

  // Тишина в самом начале — только если она начинается с нуля.
  let od = 0;
  if (starty.length && starty[0] < 0.02 && konce.length) od = Math.max(0, konce[0] - 0.03);
  // Тишина в конце — та, у которой нет пары `silence_end`.
  let doo = calosc;
  if (starty.length > konce.length) doo = Math.min(calosc, starty[starty.length - 1] + 0.06);
  else if (starty.length && starty[starty.length - 1] > doo - 0.5 && konce.length < starty.length)
    doo = Math.min(calosc, starty[starty.length - 1] + 0.06);

  if (doo - od < 0.15) return [0, calosc];
  return [od, doo];
}

// ── текст для голоса ≠ текст для подписи ──────────────────────────
// Слово капсом синтезатор читает не как слово, а как аббревиатуру, и на
// многоязычной модели — по-английски: `NIC` прозвучало «ник» вместо «ниц».
// Поймано замером: тот же сценарий со строчным `nic` whisper слышит верно,
// с `NIC` — «niej». На экране это ничего не давало вовсе: подписи и так
// рисуются капсом целиком.
//
// Поэтому голосу отдаём слово строчными, а подпись берёт исходный текст.
// Настоящие сокращения оставляем как есть — их читать по буквам правильно.
const SKROTY = new Set([
  'AI', 'SEO', 'SEM', 'CEO', 'CTA', 'PDF', 'VAT', 'NIP', 'ROI', 'CRM', 'SMS',
  'DM', 'PPC', 'UX', 'UI', 'HTML', 'CSS', 'KPI', 'IG', 'FB', 'YT', 'TT',
  'B2B', 'B2C', 'PR', 'TV',
]);

// Поле `mowa` — прямая замена текста для голоса, когда нужно подать фразу
// иначе, чем она написана на экране: многоточие в `Pytasz… ile kosztuje
// strona?` даёт вдох внутри вопроса, а подпись остаётся чистой.
export function doWymowy(fraza) {
  const t = typeof fraza === 'string' ? fraza : fraza.mowa ?? fraza.tekst;
  return String(t).replace(/\p{Lu}[\p{Lu}\p{N}]+/gu, (s) =>
    SKROTY.has(s) ? s : s.toLowerCase()
  );
}

// Слова фразы по времени. Веса — длина слова в буквах: короткие служебные
// («o», «a», «to») звучат заметно быстрее знаменательных, и равномерная
// сетка уводила бы подпись вперёд на них.
function rozlozSlowa(tekst, od, doo) {
  const slowa = String(tekst).trim().split(/\s+/).filter(Boolean);
  if (!slowa.length) return [];
  const wagi = slowa.map((s) => Math.max(1.6, s.replace(/[^\p{L}\p{N}]/gu, '').length));
  const suma = wagi.reduce((a, b) => a + b, 0);
  const dlugosc = doo - od;
  let t = od;
  return slowa.map((s, i) => {
    const d = (dlugosc * wagi[i]) / suma;
    const w = { tekst: s, a: +t.toFixed(3), b: +(t + d).toFixed(3) };
    t += d;
    return w;
  });
}

// ── один дубль на весь ролик ──────────────────────────────────────
// Пофразовый синтез давал РАЗНЫЙ голос: при stability 0.4 каждый запрос
// играет чуть иначе, и семь запросов складывались в семь разных подач.
// Захар это услышал сразу.
//
// Поэтому весь текст идёт ОДНИМ запросом, а фразы вырезаются по паузам:
// между ними ставится явный `<break>`, заметно длиннее естественных пауз
// внутри предложения, и границы находятся по нему однозначно. Плюс это
// втрое дешевле по кредитам — один запрос вместо семи.
async function jednymDublem(frazy, wyjscie, eleven, przerwa = 0.55) {
  const znacznik = `<break time="${przerwa}s" />`;
  const tekst = frazy.map((f) => doWymowy(f)).join(' ' + znacznik + ' ');
  await powiedzEleven(tekst, wyjscie, eleven);

  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', wyjscie, '-af', 'silencedetect=n=-38dB:d=0.28', '-f', 'null', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const starty = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => +m[1]);
  const konce = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => +m[1]);
  const calosc = await trwanie(wyjscie);

  // Пары «начало-конец» тишины; хвостовую тишину без пары отбрасываем.
  const ciszy = starty
    .map((s, i) => ({ od: s, doo: konce[i] ?? calosc, dl: (konce[i] ?? calosc) - s }))
    .filter((c) => c.doo < calosc - 0.05);

  // Нужно ровно N−1 разрезов — берём самые длинные паузы, это и есть наши
  // `<break>`, естественные внутри предложения заметно короче.
  const potrzeba = frazy.length - 1;
  if (ciszy.length < potrzeba) return null;
  const ciecia = ciszy
    .slice()
    .sort((a, b) => b.dl - a.dl)
    .slice(0, potrzeba)
    .sort((a, b) => a.od - b.od);

  // Границы берём ВНУТРЬ речи, а не наружу: у mp3 шумовой пол выше, чем
  // порог обычной подрезки, и хвосты тишины иначе остаются в куске. Каждый
  // такой хвост складывался с нашей собственной паузой, и ролик распухал.
  const granice = [];
  let od = Math.max(0, (konce[0] ?? 0) < 0.4 ? konce[0] : 0);
  for (const c of ciecia) {
    granice.push([od, Math.max(od + 0.15, c.od - 0.02)]);
    od = c.doo + 0.02;
  }
  const ostatniaCisza = ciszy.find((c) => c.od > od && c.doo >= calosc - 0.1);
  granice.push([od, ostatniaCisza ? ostatniaCisza.od + 0.04 : calosc]);
  return granice;
}

// ── темп: замеряем и выравниваем ──────────────────────────────────
// Даже с точной резкой подача остаётся случайной: при stability 0.4 одну и
// ту же фразу модель то проговаривает, то выстреливает. Захар слышит это
// сразу — «тараторит». Ждать удачного дубля нельзя, ролик собирается сам.
//
// Поэтому темп КАЖДОЙ фразы меряем и приводим к норме. Мера — слогов в
// секунду; в польском слог = группа гласных, считается надёжно. 4,5-5,5 —
// спокойная речь короткого видео, выше 6 — скороговорка.
//
// Растягиваем `atempo`: высоту голоса он не трогает, тембр остаётся тем же.
// Ниже 0,78 не опускаемся — дальше слышно «резину».
const TEMPO_CEL = 5.0;
const TEMPO_PROG = 5.6;
// У хука планка строже. Первые две фразы решают, досмотрят ли вообще, и
// «немного быстро» там слышно сразу — Захар поймал это даже на дубле, где
// остальные фразы легли идеально. Пять слогов в секунду для тела нормально,
// для хука уже тороплив.
const TEMPO_PROG_HAK = 5.0;
const progDla = (rola) => (rola === 'hak' ? TEMPO_PROG_HAK : TEMPO_PROG);

// И нижняя граница. Первая версия считала только «слишком быстро», поэтому
// дубль, замедленный до 0.88, всегда выигрывал: торопливых фраз в нём ноль
// по определению. Захар услышал результат сразу — «голос намного хуже»,
// а замер показал фразы на 2.5-3.2 слог/с. Это уже не спокойно, это тянет.
//
// Меру надо считать в обе стороны, иначе оптимизируешь число и теряешь то,
// ради чего его считал.
const TEMPO_MIN = 3.9;

function sylaby(tekst) {
  return (String(tekst).toLowerCase().match(/[aeiouyąęó]+/g) || []).length;
}

async function wyrownajTempo(plik, tekst, kat, i) {
  const d = await trwanie(plik);
  const syl = sylaby(tekst);
  if (!syl || !Number.isFinite(d) || d <= 0) return d;

  // Считаем по САМОЙ РЕЧИ, а не по длине куска. Первая версия делила на длину
  // файла — а в неё входит запас по краям, который мы сами и добавили при
  // резке. Из-за этого фраза, звучавшая 6,25 слог/с, по счёту выходила 5,2 и
  // выравнивание её не трогало. Ухо считает по речи, значит и мы должны.
  const [p1, p2] = await granicaMowy(plik, -38);
  const mowa = Math.max(0.15, p2 - p1);
  const tempo = syl / mowa;
  if (tempo <= TEMPO_PROG) {
    console.log(`[glos] фраза ${i + 1}: ${tempo.toFixed(2)} слог/с`);
    return d;
  }

  const wsp = Math.max(0.78, TEMPO_CEL / tempo);
  const wolniej = path.join(kat, `f${i}-wolniej.wav`);
  await ffmpeg(['-i', plik, '-filter:a', `atempo=${wsp.toFixed(4)}`, '-c:a', 'pcm_s16le', wolniej]);
  await copyFile(wolniej, plik);
  const nowa = await trwanie(plik);
  console.log(
    `[glos] «${String(tekst).slice(0, 28)}…» шла ${tempo.toFixed(2)} слог/с — растянул до ${(syl / nowa).toFixed(2)}`
  );
  return nowa;
}

/**
 * Озвучивает список фраз и отдаёт готовую дорожку с таймингами.
 * @param {Array<{tekst:string, pauza?:number}>} frazy — pauza в секундах ПОСЛЕ фразы
 */
// `glosId` и `ustawienia` — настройка ПОД ОДИН ролик, а не для всех сразу.
// Голос студии (Jan Gajos) и голос героя чужой рекламы — это разные роли, и
// одни настройки на обоих означали бы, что каждый новый заказ переписывает
// звук всей ленты. Не переданы — работает как раньше, из секретов и EL_USTAWIENIA.
export async function zbudujGlos(
  frazy,
  { model = MODEL_PL, tmp, przedPierwsza = 0.25, dostawca, glosId, ustawienia = {} } = {}
) {
  const kat = tmp || path.join(DIR, 'out', 'glos-tmp');
  await mkdir(kat, { recursive: true });

  // Порядок предпочтения: ElevenLabs (утверждён на слух) → Azure → Piper.
  // Падение вниз по цепочке нужно, чтобы отсутствие ключа не роняло сборку.
  // Поставщика можно назвать снаружи — ключом `dostawca` или переменной
  // GLOS_DOSTAWCA в окружении. Второе нужно, чтобы переключить ленту целиком
  // одной настройкой, не трогая семнадцать сценариев. Молчаливой подмены это
  // не создаёт: выбор виден в логе первой же строкой и сделан человеком.
  const wybor = dostawca || (await zEnv('GLOS_DOSTAWCA')) || '';
  const kluczEL = await zEnv('ELEVENLABS_KEY');
  const glosEL = glosId || (await zEnv('ELEVENLABS_VOICE')) || null;
  const kluczAz = await zEnv('AZURE_SPEECH_KEY');
  const region = (await zEnv('AZURE_SPEECH_REGION')) || 'northeurope';
  const kluczGem = await zEnv('GEMINI_API_KEY');
  const gcpId = await zEnv('GCP_CLIENT_ID');
  const gcpSekret = await zEnv('GCP_CLIENT_SECRET');
  const gcpOdswiez = await zEnv('GCP_REFRESH_TOKEN');
  const gcpProjekt = (await zEnv('GCP_PROJECT')) || 'zovu-autopilot';

  const google =
    wybor === 'google' && gcpId && gcpSekret && gcpOdswiez
      ? {
          id: gcpId,
          sekret: gcpSekret,
          odswiez: gcpOdswiez,
          projekt: gcpProjekt,
          glos: glosId || (await zEnv('GOOGLE_VOICE')) || GOOGLE_GLOS,
        }
      : null;

  if (wybor === 'google' && !google) {
    throw new Error('[glos] выбран Google, но нет GCP_CLIENT_ID / GCP_CLIENT_SECRET / GCP_REFRESH_TOKEN');
  }

  const gemini =
    !google && wybor === 'gemini' && kluczGem
      ? { klucz: kluczGem, glos: glosId || (await zEnv('GEMINI_VOICE')) || 'Charon' }
      : null;
  const eleven =
    !google && !gemini && (wybor === 'eleven' || !wybor) && kluczEL && glosEL
      ? { klucz: kluczEL, glos: glosEL, ustawienia }
      : null;
  const azure =
    !google && !gemini && !eleven && (wybor === 'azure' || !wybor) && kluczAz
      ? { klucz: kluczAz, region, glos: (await zEnv('AZURE_VOICE')) || AZURE_GLOS }
      : null;

  if (wybor === 'gemini' && !gemini) {
    throw new Error('[glos] выбран Gemini, но нет GEMINI_API_KEY');
  }

  console.log(
    `[glos] поставщик: ${
      google
        ? 'Google ' + google.glos
        : gemini
        ? 'Gemini ' + gemini.glos
        : eleven
          ? 'ElevenLabs ' + eleven.glos
          : azure
            ? 'Azure ' + azure.glos
            : 'Piper (локально)'
    }`
  );

  // Запасной синтез — это ДРУГОЙ ГОЛОС, а не тот же голос похуже.
  //
  // Без ключа сборка молча съезжала на Piper и выдавала готовый ролик, ничем
  // не отличающийся с виду. Захар слушал такой ролик и сказал про голос
  // «полная хуйня» — и был прав: читал робот, а не наш диктор. Полчаса после
  // этого я правил эквалайзер, пытаясь вылечить не ту причину.
  //
  // Тихая подмена хуже падения: она не видна ни в логе сборки, ни в замерах,
  // ни на картинке. Поэтому ронять. Кому нужен запасной путь — просит его
  // вслух через dostawca, и тогда молчаливой подмены всё равно нет.
  if (!eleven && !gemini && !google && !wybor) {
    throw new Error(
      '[glos] нет ключа ElevenLabs (ELEVENLABS_KEY / ELEVENLABS_VOICE) — ' +
        'сборка озвучила бы ролик ДРУГИМ голосом (' +
        (azure ? 'Azure' : 'Piper') +
        '). Для пробы картинки есть --bez-glosu, ' +
        'для осознанной замены — dostawca: "azure" | "piper".'
    );
  }

  await mkdir(KESZ, { recursive: true });

  // Один дубль на весь ролик — иначе голос гуляет от фразы к фразе.
  // Кэшируем целиком: ключ учитывает весь текст и настройки голоса.
  let granice = null;
  let dubel = null;
  // Границы из таймингов режутся точно; подрезать их ещё раз по тишине нельзя —
  // тихое начало фразы съестся, и вернутся те самые огрызки.
  let graniceDokladne = false;
  // Google пишем одним дублем: живая пунктуация и сквозная линия — то, ради
  // чего всё и затевалось. Кэш общий с остальными, ключ учитывает голос.
  if (google) {
    const odcisk = createHash('sha1')
      .update(JSON.stringify(['google-dubel-v1', frazy.map((f) => doWymowy(f)), google.glos]))
      .digest('hex')
      .slice(0, 16);
    dubel = path.join(KESZ, `dubel-${odcisk}.wav`);
    const granicePlik = path.join(KESZ, `dubel-${odcisk}.json`);
    if (existsSync(dubel) && existsSync(granicePlik)) {
      granice = JSON.parse(await readFile(granicePlik, 'utf8'));
      graniceDokladne = false;
      console.log('[glos] дубль из кэша');
    } else {
      granice = await jednymDublemGoogle(frazy, dubel, google);
      if (granice) {
        await writeFile(granicePlik, JSON.stringify(granice), 'utf8');
        console.log(`[glos] один дубль на ${frazy.length} фраз, границы по паузам`);
      }
    }
  }

  if (eleven) {
    const odciskCaly = createHash('sha1')
      .update(
        JSON.stringify([
          'znaczniki-v1',
          frazy.map((f) => doWymowy(f)),
          eleven.glos,
          { ...EL_USTAWIENIA, ...eleven.ustawienia },
        ])
      )
      .digest('hex')
      .slice(0, 16);
    dubel = path.join(KESZ, `dubel-${odciskCaly}.mp3`);
    const granicePlik = path.join(KESZ, `dubel-${odciskCaly}.json`);
    if (existsSync(dubel) && existsSync(granicePlik)) {
      const z = JSON.parse(await readFile(granicePlik, 'utf8'));
      granice = Array.isArray(z) ? z : z.granice;
      graniceDokladne = Array.isArray(z) ? false : Boolean(z.dokladne);
      console.log('[glos] дубль из кэша');
    } else {
      // Сначала точный путь — по таймингам символов. По паузам режем только
      // если разметка почему-то не пришла.
      const teksty = frazy.map((f) => doWymowy(f));

      // Торопливый дубль ПЕРЕПИСЫВАЕМ медленнее, а не растягиваем задним
      // числом: растяжка на 20% даёт резину, её слышно. Одной попытки мало —
      // сценарий из коротких фраз («Napisała zero.») модель гонит и на 0.94.
      // Поэтому до трёх дублей, каждый медленнее предыдущего, и берём лучший
      // по числу торопливых фраз. Три запроса — 750 символов из десяти тысяч,
      // и тратятся они только там, где иначе вышла бы скороговорка.
      // Фразы ВНЕ полосы — и быстрые, и тянущие. Считаем одинаково: обе
      // портят, просто по-разному.
      // Короткие фразы из счёта «тянет» исключаем. «Trzy sekundy» — четыре
      // слога; сказанные с весом и паузой, они дают 3.3 слог/с и по счёту
      // выглядят как затянутые, хотя вес там ровно к месту. Темп имеет смысл
      // мерить там, где есть чему течь.
      // Считаем не ШТУКИ, а НАСКОЛЬКО вышли за полосу. Со счётом по штукам
      // дубль с одной фразой на 7.0 слог/с равнялся дублю с одной на 3.8 —
      // и выигрывал по правилу «при равенстве берём наименее замедленный».
      // На слух это совсем не равные вещи: 7.0 это выстрел скороговоркой.
      const poza = (g) =>
        +g
          .reduce((suma, [a, b], i) => {
            const syl = sylaby(frazy[i].tekst);
            const t = syl / Math.max(0.2, b - a);
            const nad = Math.max(0, t - progDla(frazy[i].rola));
            // Короткие фразы «тянуть» не могут: «Trzy sekundy» сказанные с
            // весом дают 3.3 слог/с, и это к месту.
            // Затяг штрафуем ВДВОЕ против спешки. Скороговорку зритель
            // переживёт, а тянущаяся фраза выключает внимание совсем —
            // Захар поймал это дважды на разных роликах.
            const pod = syl >= 8 ? Math.max(0, TEMPO_MIN - t) * 2 : 0;
            return suma + nad + pod;
          }, 0)
          .toFixed(2);
      const liczSzybkie = (g) =>
        g.filter(([a, b], i) => sylaby(frazy[i].tekst) / Math.max(0.2, b - a) > progDla(frazy[i].rola))
          .length;

      let najlepszy = null;
      for (const speed of [null, 0.94]) {
        const plikProby = speed ? `${dubel}-${speed}.mp3` : dubel;
        // Перебор темпа — УЛУЧШЕНИЕ, а не условие. Если второй дубль не купился
        // (кончилась квота, отвалилась сеть), нельзя терять первый: он уже
        // оплачен и лежит на диске. Ровно так мы потеряли готовый дубль Adriana —
        // упало на 401 quota_exceeded, хотя годный вариант был в руках.
        let g;
        try {
          g = await dubelZeZnacznikami(
            teksty,
            plikProby,
            // Настройки ролика сохраняем: перебор темпа добавляет `speed`, а не
            // заменяет собой всё остальное. Иначе второй дубль ехал бы уже другим
            // голосом по характеру, и сравнивать их было бы нечестно.
            speed ? { ...eleven, ustawienia: { ...eleven.ustawienia, speed } } : eleven
          );
        } catch (e) {
          if (!najlepszy) throw e;
          console.warn(`[glos] дубль на темпе ${speed} не вышел (${e.message.slice(0, 80)}) — беру предыдущий`);
          break;
        }
        if (!g) break;

        const ile = liczSzybkie(g);
        const zle = poza(g);
        // Выигрывает дубль с наименьшим числом фраз вне полосы. При равенстве
        // побеждает ПЕРВЫЙ — то есть наименее замедленный. Это то же правило,
        // что и с обработкой звука: чем меньше мы вмешались, тем живее звучит.
        if (!najlepszy || zle < najlepszy.zle) najlepszy = { g, plik: plikProby, ile, zle, speed };
        if (!ile) break;
        console.warn(
          `[glos] торопливых фраз: ${ile}, перебор темпа ${zle}` +
            `${speed ? ` (speed ${speed})` : ''} — переписываю медленнее`
        );
      }

      if (najlepszy) {
        graniceDokladne = true;
        granice = najlepszy.g;
        if (najlepszy.plik !== dubel) await copyFile(najlepszy.plik, dubel);
        console.log(
          `[glos] дубль на ${frazy.length} фраз, границы по таймингам символов` +
            (najlepszy.speed ? `, темп ${najlepszy.speed}` : '') +
            (najlepszy.zle ? `, перебор темпа ${najlepszy.zle}` : '')
        );
      } else granice = await jednymDublem(frazy, dubel, eleven);

      if (granice) {
        await writeFile(granicePlik, JSON.stringify({ granice, dokladne: graniceDokladne }), 'utf8');
        console.log(`[glos] границы найдены на ${frazy.length} фраз`);
      } else {
        console.warn('[glos] дубль разрезать не удалось — падаю на пофразовый синтез');
      }
    }
  }

  // ── дубль целиком, без единой склейки ────────────────────────────
  // Пока границы угадывались по тишине, дорожку приходилось резать и
  // пересобирать: только так можно было задать свои паузы. Каждый разрез,
  // каждая переклейка и каждая растяжка добавляли по чуть-чуть — вместе это
  // и есть «слышно ИИ». Захар слушает тот же голос в интерфейсе ElevenLabs и
  // слышит живого человека, потому что там дубль НЕ ТРОГАЛИ.
  //
  // С точными таймингами резать звук незачем: время каждой фразы известно, и
  // под него режется КАРТИНКА. Голос идёт одним куском, ровно как пришёл, —
  // только сдвинут на паузу перед первой фразой.
  if (granice && graniceDokladne) {
    const plik = path.join(kat, 'glos.wav');
    const surowa = path.join(kat, 'glos-surowa.wav');
    const ms = Math.round(przedPierwsza * 1000);
    await ffmpeg([
      '-i', dubel,
      '-af', `adelay=${ms}|${ms}:all=1,aformat=channel_layouts=stereo,aresample=48000`,
      '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', surowa,
    ]);

    const meta = granice.map(([a, b], i) => ({
      tekst: frazy[i].tekst,
      a: +(a + przedPierwsza).toFixed(3),
      b: +(b + przedPierwsza).toFixed(3),
      rola: frazy[i].rola || null,
    }));

    // ── хвост дубля ───────────────────────────────────────────────
    // ElevenLabs оставляет в конце секунду-полторы тишины, и время последнего
    // символа она тоже прихватывает. Два следствия сразу: последняя фраза
    // считается вдвое длиннее, чем звучит (3,1 слог/с вместо 5), а последний
    // клип тянется до конца дорожки — в ролике повисает мёртвая секунда перед
    // аутро. Захар услышал это как «в конце какой-то кал».
    //
    // Поэтому конец речи БЕРЁМ ЗАМЕРОМ и по нему обрезаем и дорожку, и
    // границу последней фразы. Это не обработка голоса — это удаление тишины,
    // которой в ролике быть не должно.
    const ost = meta[meta.length - 1];
    const [, koniecMowy] = await granicaMowy(surowa, -38);

    // Замер конца речи и разметка расходятся по двум разным причинам, и
    // путать их нельзя. Хвост тишины, приписанный последнему символу, — это
    // секунда-полторы. А тихое последнее слово, которое замер не расслышал, —
    // это доли секунды. Поэтому подрезаем ТОЛЬКО правдоподобный хвост и
    // всегда с запасом: Захар получил «Włącz swoją ostat…» ровно потому, что
    // я поверил замеру без оглядки.
    // Порог был 0.3 с — слишком жадно. Тихий хвост последнего слова замер
    // не слышит, разница выходит те же полсекунды, и подрезка съедала речь:
    // Захар получил обрыв дважды. Хвост, приписанный последнему символу,
    // это секунда и больше — с него и начинаем подозревать.
    const zapas = 0.35;
    const roznica = ost.b - koniecMowy;
    if (koniecMowy > ost.a + 0.2 && roznica > 1.0 && roznica < 2.5) {
      console.log(
        `[glos] хвост дубля: речь кончилась на ${koniecMowy.toFixed(2)}, разметка тянула до ${ost.b.toFixed(2)}`
      );
      ost.b = +(koniecMowy + zapas).toFixed(3);
    }

    // Дорожку НЕ режем. Логическую длину отдаём наверх, а лишнюю тишину
    // отрежет сведение — там она обрезается по плану ролика. Резать здесь
    // значило бы рисковать словом ради секунды тишины, которую и так никто
    // не услышит.
    await copyFile(surowa, plik);

    // Темп смотрим по тем же таймингам — отдельного замера не нужно.
    const tempa = meta.map((m) => sylaby(m.tekst) / Math.max(0.2, m.b - m.a));
    console.log(`[glos] темп по фразам: ${tempa.map((t) => t.toFixed(1)).join(' ')} слог/с`);
    const szybkie = tempa.filter((t, i) => t > progDla(frazy[i].rola)).length;
    if (szybkie) console.warn(`[glos] быстрых фраз: ${szybkie} — дубль вышел торопливым`);

    const slowa = meta.flatMap((m) => rozlozSlowa(m.tekst, m.a, m.b));
    // Длина ЛОГИЧЕСКАЯ — по концу речи, а не по длине файла. Клипы режутся
    // по ней, поэтому мёртвой секунды перед аутро не будет, а в самом файле
    // хвост пусть лежит: обрезать его опасно, игнорировать — нет.
    const dlugoscLog = +(ost.b + 0.35).toFixed(3);
    return { plik, frazy: meta, slowa, dlugosc: dlugoscLog };
  }

  const czesci = [];
  const meta = [];
  let czas = przedPierwsza;
  let zKeszu = 0;
  let nowych = 0;

  for (let i = 0; i < frazy.length; i++) {
    const f = frazy[i];
    // У ElevenLabs забираем mp3 — ffmpeg дальше всё равно приводит к общему
    // виду, а лишнее перекодирование в wav ничего не улучшает.
    const surowy = path.join(kat, `f${i}-raw.${eleven ? 'mp3' : 'wav'}`);
    const gotowy = path.join(kat, `f${i}.wav`);

    // Кэш озвучки. У ElevenLabs бесплатный тариф — 10 тысяч символов в месяц,
    // это около двадцати рилсов. Пересобирать монтаж, каждый раз заново
    // покупая ту же самую фразу, — прямой способ остаться без озвучки к
    // середине месяца. Ключ кэша учитывает и текст, и настройки голоса.
    const odcisk = createHash('sha1')
      .update(
        JSON.stringify([
          doWymowy(f),
          eleven?.glos || google?.glos || gemini?.glos || azure?.glos || model,
          f.glos || {},
        ])
      )
      .digest('hex')
      .slice(0, 16);
    const wKeszu = path.join(KESZ, `${odcisk}.wav`);

    if (granice) {
      // Вырезаем свою фразу из общего дубля — голос остаётся одним и тем же.
      const [a, b] = granice[i];
      const zapas = path.join(kat, `f${i}-zapas.wav`);
      await ffmpeg([
        '-ss', a.toFixed(3), '-to', b.toFixed(3), '-i', dubel,
        '-af', 'aformat=channel_layouts=stereo,aresample=48000',
        '-c:a', 'pcm_s16le', zapas,
      ]);
      if (graniceDokladne) {
        // Границы уже точные — второй раз подрезать нечего. Подрезка по
        // тишине тут только вредит: тихое начало фразы она съедает.
        await copyFile(zapas, gotowy);
      } else {
        // Края режем ПО ЗАМЕРУ: разрез по `<break>` оставляет с обеих сторон
        // хвосты тишины, и они складывались с нашими собственными паузами —
        // ролик распухал на две секунды и терял темп.
        const [p1, p2] = await granicaMowy(zapas, -38);
        await ffmpeg([
          '-ss', p1.toFixed(3), '-to', p2.toFixed(3), '-i', zapas,
          '-c:a', 'pcm_s16le', gotowy,
        ]);
      }
      zKeszu++;
    } else if (existsSync(wKeszu)) {
      await copyFile(wKeszu, gotowy);
      zKeszu++;
    } else {
      if (eleven) {
        // Настройки можно задать на КАЖДУЮ фразу: хук энергичнее, призыв
        // теплее. Цельный прогон так не умеет, а у нас фразы отдельные.
        await powiedzEleven(doWymowy(f), surowy, { ...eleven, ustawienia: f.glos || {} });
      } else if (google) {
        await powiedzGoogle(doWymowy(f), surowy, { ...google, tempo: f.tempo });
      } else if (gemini) {
        await powiedzGemini(doWymowy(f), surowy, { ...gemini, podanie: f.podanie });
      } else if (azure) await powiedzAzure(doWymowy(f), surowy, azure);
      else await powiedz(doWymowy(f), surowy, model);
      nowych++;

      // Края подрезаем ПО ЗАМЕРУ, а не фильтром `silenceremove`: тот убирает
      // тишину и внутри фразы тоже — «Twoje posty nie sprzedają?» усыхало с
      // 1.58 до 0.60 секунды, речь превращалась в скороговорку.
      const [poczatek, koniec] = await granicaMowy(surowy);
      await ffmpeg([
        '-ss', poczatek.toFixed(3), '-to', koniec.toFixed(3), '-i', surowy,
        '-af', 'aformat=channel_layouts=stereo,aresample=48000',
        '-c:a', 'pcm_s16le', gotowy,
      ]);
      await copyFile(gotowy, wKeszu);
    }

    const d = await wyrownajTempo(gotowy, f.tekst, kat, i);
    meta.push({ tekst: f.tekst, a: +czas.toFixed(3), b: +(czas + d).toFixed(3), rola: f.rola || null });
    czesci.push({ plik: gotowy, dlugosc: d, pauza: f.pauza ?? 0.22 });
    czas += d + (f.pauza ?? 0.22);
  }

  // Собираем одной командой: каждая фраза сдвигается на своё посчитанное
  // начало, дальше всё смешивается. Так тайминги в метаданных и в звуке —
  // одни и те же числа, разъехаться нечему.
  const wejscia = [];
  czesci.forEach((c) => wejscia.push('-i', c.plik));

  const filtry2 = czesci.map((c, i) => {
    const ms = Math.round(meta[i].a * 1000);
    return `[${i}:a]adelay=${ms}|${ms}[s${i}]`;
  });
  const mix =
    czesci.map((_, i) => `[s${i}]`).join('') +
    `amix=inputs=${czesci.length}:normalize=0:duration=longest[a]`;

  const plik = path.join(kat, 'glos.wav');
  await ffmpeg([
    ...wejscia,
    '-filter_complex', filtry2.join(';') + ';' + mix,
    '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    plik,
  ]);

  console.log(`[glos] фраз из кэша: ${zKeszu}, синтезировано заново: ${nowych}`);
  const slowa = meta.flatMap((m) => rozlozSlowa(m.tekst, m.a, m.b));
  const dlugoscCala = +(await trwanie(plik)).toFixed(3);

  return { plik, frazy: meta, slowa, dlugosc: dlugoscCala };
}

if (process.argv[1] && process.argv[1].endsWith('glos.mjs')) {
  const teksty = process.argv.slice(2);
  if (!teksty.length) {
    console.error('node glos.mjs "Fraza pierwsza." "Fraza druga."');
    process.exit(1);
  }
  const r = await zbudujGlos(teksty.map((t) => ({ tekst: t })));
  console.log(JSON.stringify({ plik: r.plik, dlugosc: r.dlugosc, frazy: r.frazy, slow: r.slowa.length }, null, 1));
}
