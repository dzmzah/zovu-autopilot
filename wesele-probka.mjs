// Проба монтажа для Wronski.Media: минута из 63-минутного свадебного репортажа.
//
// Материал клиента — НЕ публикуем нигде, он просил об этом прямо.
//
// Логика подбора: сначала прошёл весь материал кадрами через минуту и построил
// карту дня, потом уточнил ключевые сцены. Порядок сцен идёт за эмоцией дня,
// а не за хронометражем: сборы → церемония → конфетти → веселье → финал.
// Длина планов сокращается к середине и снова растёт в конце — так ритм
// не утомляет, а финал успевает «сесть».
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);
const BAZA = 'D:/My AI/Zovu.pl/Sprzedaz/wesele';
const ZRODLO = path.join(BAZA, 'reportaz.mp4');
const MUZYKA = path.join(BAZA, 'muzyka.mp3');
const TMP = path.join(BAZA, 'ciecia');
const WYJSCIE = path.join(BAZA, 'ZOVU-proba-minuta.mp4');

// [начало в секундах, длительность, что это]
const UJECIA = [
  [450, 3.0, 'dron - posiadlosc'],
  [200, 2.5, 'pan mlody sie ubiera'],
  [62, 2.6, 'muszka'],
  [301, 2.8, 'panna mloda - emocja'],
  [604, 2.4, 'para z bukietem'],
  [700, 2.2, 'ceremonia - goscie'],
  [842, 3.0, 'ceremonia - ogolny'],
  [871, 2.8, 'spojrzenie'],
  [931, 2.8, 'przysiega - blisko'],
  [961, 2.2, 'moment'],
  [1021, 3.2, 'konfetti'],
  [1100, 2.5, 'toast'],
  [1204, 2.0, 'wejscie na sale'],
  [1501, 2.0, 'gratulacje'],
  [1802, 2.2, 'pierwszy taniec'],
  [2101, 2.4, 'tort'],
  [2250, 1.8, 'zabawa'],
  [2701, 1.8, 'parkiet'],
  [2900, 1.8, 'dyskoteka'],
  [3450, 2.0, 'para z goscmi'],
  [3601, 2.0, 'fotobudka'],
  [3779, 4.5, 'final - para'],
];

async function main() {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });

  const pliki = [];
  for (let i = 0; i < UJECIA.length; i++) {
    const [start, dl, opis] = UJECIA[i];
    const plik = path.join(TMP, `u${String(i).padStart(2, '0')}.mp4`);
    // -ss перед -i: быстрая перемотка, дальше точная резка по длительности.
    // Перекодируем, потому что исходник VP9 и склейка копированием невозможна.
    await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(start), '-i', ZRODLO, '-t', String(dl),
      '-an', '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      plik]);
    pliki.push(plik);
    console.log(`  ${String(i).padStart(2)} ${opis} — ${dl}s`);
  }

  const lista = path.join(TMP, 'lista.txt');
  await writeFile(lista, pliki.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  const sklejka = path.join(TMP, 'sklejka.mp4');
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', sklejka]);

  const { stdout } = await exec('ffprobe', ['-v', 'error',
    '-show_entries', 'format=duration', '-of', 'csv=p=0', sklejka]);
  const dl = parseFloat(stdout.trim());
  console.log(`\n[proba] sklejka: ${dl.toFixed(1)} s`);

  // Музыка: тихий вход, ровный уровень, затухание на последних двух секундах.
  await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', sklejka, '-i', MUZYKA,
    '-filter_complex',
    `[1:a]atrim=0:${dl.toFixed(2)},afade=t=in:st=0:d=1.5,` +
    `afade=t=out:st=${(dl - 2).toFixed(2)}:d=2,loudnorm=I=-16:TP=-1.5:LRA=8[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
    WYJSCIE]);

  console.log(`[proba] gotowe: ${WYJSCIE}`);
}

main().catch((e) => { console.error('[proba] BŁĄD:', e.message); process.exit(1); });
