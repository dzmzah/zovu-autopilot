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
export async function zbudujGlos(frazy, { model = MODEL_PL, tmp, przedPierwsza = 0.25, dostawca } = {}) {
  const kat = tmp || path.join(DIR, 'out', 'glos-tmp');
  await mkdir(kat, { recursive: true });

  // Порядок предпочтения: ElevenLabs (утверждён на слух) → Azure → Piper.
  // Падение вниз по цепочке нужно, чтобы отсутствие ключа не роняло сборку.
  const kluczEL = await zEnv('ELEVENLABS_KEY');
  const glosEL = (await zEnv('ELEVENLABS_VOICE')) || null;
  const kluczAz = await zEnv('AZURE_SPEECH_KEY');
  const region = (await zEnv('AZURE_SPEECH_REGION')) || 'northeurope';

  const eleven =
    (dostawca === 'eleven' || !dostawca) && kluczEL && glosEL
      ? { klucz: kluczEL, glos: glosEL }
      : null;
  const azure =
    !eleven && (dostawca === 'azure' || !dostawca) && kluczAz
      ? { klucz: kluczAz, region, glos: (await zEnv('AZURE_VOICE')) || AZURE_GLOS }
      : null;

  console.log(
    `[glos] поставщик: ${
      eleven ? 'ElevenLabs ' + eleven.glos : azure ? 'Azure ' + azure.glos : 'Piper (локально)'
    }`
  );

  await mkdir(KESZ, { recursive: true });

  // Один дубль на весь ролик — иначе голос гуляет от фразы к фразе.
  // Кэшируем целиком: ключ учитывает весь текст и настройки голоса.
  let granice = null;
  let dubel = null;
  // Границы из таймингов режутся точно; подрезать их ещё раз по тишине нельзя —
  // тихое начало фразы съестся, и вернутся те самые огрызки.
  let graniceDokladne = false;
  if (eleven) {
    const odciskCaly = createHash('sha1')
      .update(JSON.stringify(['znaczniki-v1', frazy.map((f) => doWymowy(f)), eleven.glos, EL_USTAWIENIA]))
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
      granice = await dubelZeZnacznikami(frazy.map((f) => doWymowy(f)), dubel, eleven);
      if (granice) {
        graniceDokladne = true;
        console.log(`[glos] дубль на ${frazy.length} фраз, границы по таймингам символов`);
      } else granice = await jednymDublem(frazy, dubel, eleven);

      if (granice) {
        await writeFile(granicePlik, JSON.stringify({ granice, dokladne: graniceDokladne }), 'utf8');
        console.log(`[glos] границы найдены на ${frazy.length} фраз`);
      } else {
        console.warn('[glos] дубль разрезать не удалось — падаю на пофразовый синтез');
      }
    }
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
      .update(JSON.stringify([doWymowy(f), eleven?.glos || azure?.glos || model, f.glos || {}]))
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
