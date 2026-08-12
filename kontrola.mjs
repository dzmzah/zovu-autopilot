// Проверка готового рилса ЗАМЕРАМИ, а не глазами.
//
// Зачем. За одну ночь правок оказалось, что глазами я стабильно пропускаю то,
// что заказчик ловит с первого просмотра: двойное изображение на растворении,
// звук, оборванный концом клипа, провал фона на стыке, дубль текста. Каждое из
// этого — измеримо. Значит проверять должна машина, а человек смотреть уже то,
// что проверку прошло.
//
// Пороги взяты из замеров живого материала, а не из головы:
//   • обычное движение в кадре даёт разницу соседних кадров 2–5
//   • рез или щелчок зума — 30 и выше
//   • у клипов Veo собственная дрожь доходит до 15, и это не наш брак
//
//   node kontrola.mjs rolka.mp4
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PROGI = {
  skok: 30,          // выше — видимый рывок
  ciszaDb: -50,      // ниже — дырка в дорожке
  ciszaSek: 0.12,
  lufsMin: -17,
  lufsMax: -11,
  dlugoscMin: 8,
  dlugoscMax: 90,
  toleransPrzejscia: 0.5, // насколько скачок может отстоять от запланированного
};

async function ffprobe(args) {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}

async function skoki(plik) {
  const { stdout } = await execFileAsync(
    'ffmpeg',
    ['-v', 'error', '-i', plik, '-vf',
      'tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-an', '-f', 'null', '-'],
    { maxBuffer: 128 * 1024 * 1024 }
  );
  const linie = stdout.split(/\r?\n/);
  const out = [];
  let czas = null;
  for (const l of linie) {
    const t = l.match(/pts_time:([0-9.]+)/);
    if (t) czas = +t[1];
    const v = l.match(/YAVG=([0-9.]+)/);
    if (v && czas != null) out.push({ t: czas, v: +v[1] });
  }
  return out;
}

async function dziury(plik) {
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', plik, '-af',
      `silencedetect=noise=${PROGI.ciszaDb}dB:d=${PROGI.ciszaSek}`, '-f', 'null', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  return [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => +m[1]);
}

async function glosnosc(plik) {
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', plik, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const m = stderr.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try { return +JSON.parse(m[0]).input_i; } catch { return null; }
}

/**
 * @param {string} plik
 * @param {{oczekiwanePrzejscia?: number[]}} opcje — секунды, где рывок ЗАПЛАНИРОВАН
 *        (въезд врезки, титр, склейка): там скачок это приём, а не брак.
 */
export async function sprawdzRolke(plik, opcje = {}) {
  const oczekiwane = (opcje.oczekiwanePrzejscia || []).filter((x) => Number.isFinite(x));
  const uwagi = [];

  const dlugosc = +(await ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', plik]));
  const wymiary = await ffprobe([
    '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', plik,
  ]);

  if (dlugosc < PROGI.dlugoscMin || dlugosc > PROGI.dlugoscMax) {
    uwagi.push(`длина ${dlugosc.toFixed(1)} с вне диапазона ${PROGI.dlugoscMin}–${PROGI.dlugoscMax}`);
  }
  if (!/^1080,1920$/.test(wymiary.replace(/\s/g, ''))) {
    uwagi.push(`кадр ${wymiary}, а нужен 1080x1920`);
  }

  const wszystkieSkoki = await skoki(plik);
  const podejrzane = wszystkieSkoki
    .filter((s) => s.v >= PROGI.skok)
    .filter((s) => !oczekiwane.some((o) => Math.abs(o - s.t) <= PROGI.toleransPrzejscia));
  // Соседние кадры одного и того же перехода схлопываем в одно событие.
  const zdarzenia = [];
  for (const s of podejrzane) {
    const ost = zdarzenia.at(-1);
    if (ost && s.t - ost.doo <= 0.25) { ost.doo = s.t; ost.max = Math.max(ost.max, s.v); }
    else zdarzenia.push({ od: s.t, doo: s.t, max: s.v });
  }
  // Скачок на САМОМ последнем кадре — артефакт обрезки, зритель его не видит:
  // ролик там либо кончается, либо уходит в повтор. Не считаем за брак.
  const realneZdarzenia = zdarzenia.filter((z) => z.od < dlugosc - 0.2);
  for (const z of realneZdarzenia) {
    uwagi.push(`незапланированный рывок на ${z.od.toFixed(2)} с (сила ${z.max.toFixed(0)})`);
  }

  const cisze = await dziury(plik);
  // Провал в самом конце — это затухание, оно штатное.
  const realne = cisze.filter((t) => t < dlugosc - 1.6);
  for (const t of realne) uwagi.push(`провал звука на ${t.toFixed(2)} с`);

  const lufs = await glosnosc(plik);
  if (lufs != null && (lufs < PROGI.lufsMin || lufs > PROGI.lufsMax)) {
    uwagi.push(`громкость ${lufs.toFixed(1)} LUFS вне ${PROGI.lufsMin}…${PROGI.lufsMax}`);
  }

  return {
    zdal: uwagi.length === 0,
    dlugosc: +dlugosc.toFixed(2),
    lufs: lufs != null ? +lufs.toFixed(1) : null,
    rywkow: realneZdarzenia.length,
    dziur: realne.length,
    uwagi,
  };
}

if (process.argv[1] && process.argv[1].endsWith('kontrola.mjs')) {
  const plik = process.argv[2];
  if (!plik) { console.error('node kontrola.mjs rolka.mp4'); process.exit(1); }
  const r = await sprawdzRolke(plik);
  console.log(JSON.stringify(r, null, 1));
  if (!r.zdal) process.exitCode = 1;
}
