// Проба для аудиокурса PL/EN (клиент Marcin Morzywolek, Useme).
//
// Главное отличие от того, что ему сделали раньше: ПАУЗА СЧИТАЕТСЯ, а не
// ставится на глаз. Замер чужого файла показал разброс 0,6–3,8 с — из-за
// этого материал невозможно слушать в машине. Здесь пауза после каждой
// фразы равна её собственной длительности: ухо получает ровно столько
// времени, сколько нужно на повтор, и правило одинаково во всех эпизодах.
//
// Второе: уровень. У предшественника LRA 11,8 LU при норме 5–8 и общий
// уровень −21,3 LUFS. Здесь сжатие диапазона и −17 LUFS.
//
// Запускается на сервере — ключ ElevenLabs живёт в секретах GitHub.
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const OUT = path.join(import.meta.dirname, 'out', 'kurs-probka');
const KLUCZ = process.env.ELEVENLABS_KEY;

// Схема курса: английский → польский → английский снова → короткий диалог.
const BLOKI = [
  {
    en: 'Give it a shot.',
    pl: 'Spróbuj.',
    dialog: [
      ['A', 'I have never spoken English in front of people. I don\'t think I can do it.'],
      ['B', 'Just give it a shot. I know you can do it.'],
    ],
  },
  {
    en: 'I\'m running late.',
    pl: 'Spóźniam się.',
    dialog: [
      ['A', 'Where are you? We said we\'d meet at the café at nine!'],
      ['B', 'Sorry, I\'m running late — I missed my bus. I\'ll be there in ten minutes.'],
    ],
  },
  {
    en: 'That\'s a good point.',
    pl: 'To dobra uwaga.',
    dialog: [
      ['A', 'There are only three seats left on that flight. We need to book it now.'],
      ['B', 'Yeah, that\'s a good point. Let\'s book it now.'],
    ],
  },
];

const INTRO = 'Flow. Everyday Expressions. Part One.';

const USTAWIENIA = {
  model_id: 'eleven_multilingual_v2',
  stability: 0.45,
  similarity_boost: 0.75,
  style: 0.25,      // ниже, чем в рилсах: тут нужна ровность, а не подача
  use_speaker_boost: true,
  speed: 0.95,      // курс языка слушают на повторе, спешка тут вредна
};

async function glosy() {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': KLUCZ },
  });
  if (!r.ok) throw new Error(`voices ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.voices || []).map((v) => ({
    id: v.voice_id,
    nazwa: v.name,
    plec: (v.labels && (v.labels.gender || v.labels.Gender)) || '',
  }));
}

async function powiedz(tekst, plik, glos) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${glos}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': KLUCZ, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: tekst,
        model_id: USTAWIENIA.model_id,
        voice_settings: {
          stability: USTAWIENIA.stability,
          similarity_boost: USTAWIENIA.similarity_boost,
          style: USTAWIENIA.style,
          use_speaker_boost: USTAWIENIA.use_speaker_boost,
          speed: USTAWIENIA.speed,
        },
      }),
    }
  );
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  await writeFile(plik, Buffer.from(await r.arrayBuffer()));
  return plik;
}

async function dlugosc(plik) {
  const { stdout } = await exec('ffprobe', ['-v', 'error',
    '-show_entries', 'format=duration', '-of', 'csv=p=0', plik]);
  return parseFloat(stdout.trim());
}

async function cisza(sek, plik) {
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
    '-t', sek.toFixed(3), '-c:a', 'libmp3lame', '-b:a', '128k', plik]);
  return plik;
}

async function main() {
  if (!KLUCZ) throw new Error('нет ELEVENLABS_KEY — проба обязана идти на сервере');
  await mkdir(OUT, { recursive: true });

  const dostepne = await glosy();
  console.log('[proba] голосов в аккаунте:', dostepne.length);
  dostepne.forEach((g) => console.log('   ', g.nazwa, g.plec, g.id));

  // Клиент просил сохранить разделение мужского и женского.
  const meski = dostepne.find((g) => /male/i.test(g.plec) && !/female/i.test(g.plec))
    || dostepne[0];
  const zenski = dostepne.find((g) => /female/i.test(g.plec)) || dostepne[1] || dostepne[0];
  console.log('[proba] мужской:', meski.nazwa, '· женский:', zenski.nazwa);

  const czesci = [];
  let nr = 0;
  const dodaj = async (tekst, glos, etykieta) => {
    const p = path.join(OUT, `${String(nr++).padStart(2, '0')}-${etykieta}.mp3`);
    await powiedz(tekst, p, glos);
    const d = await dlugosc(p);
    czesci.push({ plik: p, dl: d, etykieta, tekst });
    console.log(`   ${etykieta}: ${d.toFixed(2)} s — ${tekst.slice(0, 46)}`);
    return d;
  };
  const pauza = async (sek, etykieta) => {
    const p = path.join(OUT, `${String(nr++).padStart(2, '0')}-${etykieta}.mp3`);
    await cisza(sek, p);
    czesci.push({ plik: p, dl: sek, etykieta, tekst: '' });
    console.log(`   ${etykieta}: pauza ${sek.toFixed(2)} s`);
  };

  await dodaj(INTRO, meski.id, 'intro');
  await pauza(0.9, 'po-intro');

  for (let i = 0; i < BLOKI.length; i++) {
    const b = BLOKI[i];
    // 1) английский — пауза равна длине фразы: столько же нужно на повтор
    const d1 = await dodaj(b.en, meski.id, `b${i}-en1`);
    await pauza(Math.max(1.1, d1), `b${i}-p1`);
    // 2) польский перевод — короткая пауза, тут повторять нечего
    await dodaj(b.pl, zenski.id, `b${i}-pl`);
    await pauza(0.55, `b${i}-p2`);
    // 3) английский снова — снова пауза на повтор
    const d3 = await dodaj(b.en, meski.id, `b${i}-en2`);
    await pauza(Math.max(1.1, d3), `b${i}-p3`);
    // 4) диалог: A мужской, B женский
    for (const [kto, linia] of b.dialog) {
      await dodaj(linia, kto === 'A' ? meski.id : zenski.id, `b${i}-${kto}`);
      await pauza(0.42, `b${i}-${kto}-p`);
    }
    if (i < BLOKI.length - 1) await pauza(1.0, `b${i}-koniec`);
  }

  // Склейка
  const lista = path.join(OUT, 'lista.txt');
  await writeFile(lista, czesci.map((c) => `file '${c.plik.replace(/\\/g, '/')}'`).join('\n'));
  const surowy = path.join(OUT, 'surowy.mp3');
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', surowy]);

  // Мастеринг: сжимаем разброс и ставим уровень. У предшественника было
  // LRA 11,8 при −21,3 LUFS — оба числа мимо нормы для обучающего аудио.
  const gotowy = path.join(OUT, 'ZOVU-probka-kursu.mp3');
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', surowy,
    '-af', 'acompressor=threshold=-20dB:ratio=2.5:attack=12:release=220,' +
           'loudnorm=I=-17:TP=-1.5:LRA=6,' +
           'alimiter=limit=0.85:level=disabled',
    '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '1', gotowy]);

  const dl = await dlugosc(gotowy);
  console.log(`\n[proba] готово: ${gotowy} — ${dl.toFixed(1)} s`);

  // Замер для клиента: те же три числа, что я мерил у предшественника.
  const { stderr } = await exec('ffmpeg', ['-hide_banner', '-i', gotowy,
    '-af', 'ebur128=peak=true', '-f', 'null', '-'], { maxBuffer: 1 << 24 })
    .catch((e) => ({ stderr: e.stderr || '' }));
  const wyc = (re) => ((stderr.match(re) || [])[1] || '?');
  console.log('[pomiar] I:', wyc(/I:\s*(-?[\d.]+) LUFS/),
              'LRA:', wyc(/LRA:\s*([\d.]+) LU/),
              'TP:', wyc(/Peak:\s*(-?[\d.]+) dBFS/));
}

main().catch((e) => { console.error('[proba] ОШИБКА:', e.message); process.exit(1); });
