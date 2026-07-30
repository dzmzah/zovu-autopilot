// Переносит живой футаж из личной библиотеки Захара в репозиторий.
//
// Зачем нормализовать, а не копировать как есть: исходники разного размера
// (416x752 и 720x1280) и веса, а на серверах GitHub репозиторий выкачивается
// перед каждым запуском — лишние сотни мегабайт стоят времени в каждом прогоне.
//
//   node import-broll.mjs            — импортировать всё
//   node import-broll.mjs --list     — только показать теги
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SRC =
  process.env.ZOVU_BROLL_SRC || 'D:\\My AI\\Zovu.pl\\Reels\\wideo-for-reels';
const DEST = path.join(import.meta.dirname, 'broll');
const SECONDS = 4.5;

// Теги по-польски и по отраслям: именно так думает наша аудитория —
// владелец кофейни ищет «kawa», а не «floating violet glass cup».
const TAGS = {
  'DJ': 'muzyka',
  'NIKE': 'marka',
  'ai': 'ai',
  'architekutra': 'architektura',
  'barbershop': 'barber',
  'beauty': 'uroda',
  'bieganie-1': 'bieganie',
  'book': 'ksiazki',
  'car-mers': 'auto',
  'cars': 'auto2',
  'chair': 'wnetrza',
  'cholate': 'czekolada',
  'clock': 'czas',
  'coffe': 'kawa',
  'crypto': 'finanse',
  'desert': 'deser',
  'deteling': 'detailing',
  'eating': 'jedzenie',
  'flowers': 'kwiaty',
  'gadzet': 'gadzety',
  'gaming': 'gaming',
  'green rastenia': 'rosliny',
  'joga': 'joga',
  'juvelirka': 'bizuteria',
  'kokteil': 'koktajl',
  'kosmetika': 'kosmetyki',
  'media-prdk': 'ekrany',
  'merry': 'swieta',
  'model-1': 'moda',
  'modern': 'nowoczesne',
  'nedvig': 'nieruchomosci',
  'parfume': 'perfumy',
  'photo studio': 'fotostudio',
  'pyteshestvia': 'podroze',
  'saleotwar': 'wyprzedaz',
  'spa': 'spa',
  'stadium': 'sport',
  'svechi': 'swiece',
  'Hand_holding_glowing_emblem_disc_202606042303': 'marka2',
  'Violet_disc_unfolds_holographic_…_202606042137': 'marka3',
  'Mercedes-AMG_GT_driving_Warsaw_202606051944': 'auto3',
};

export const BROLL_TAGS = [...new Set(Object.values(TAGS))].sort();

if (process.argv.includes('--list')) {
  console.log(BROLL_TAGS.join(', '));
  process.exit(0);
}

await mkdir(DEST, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(mp4|mov)$/i.test(f));
let done = 0;
let bytes = 0;

for (const f of files) {
  const key = f.replace(/\.[^.]+$/, '');
  const tag = TAGS[key];
  if (!tag) {
    console.log(`- ${f}: нет тега, пропускаю`);
    continue;
  }
  const out = path.join(DEST, `${tag}.mp4`);
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', path.join(SRC, f),
        '-t', String(SECONDS),
        // приводим к 1080x1920: сначала вписываем по большей стороне, потом обрезаем
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
        '-an', // звук футажа не нужен: под ролик идёт своя дорожка
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '30',
        out,
      ],
      { maxBuffer: 32 * 1024 * 1024 }
    );
    const s = await stat(out);
    bytes += s.size;
    done++;
    console.log(`+ ${tag}.mp4  ${(s.size / 1048576).toFixed(1)} MB`);
  } catch (e) {
    console.log(`! ${f}: ${e.message.slice(0, 120)}`);
  }
}

console.log(`\nготово: ${done} клипов, ${(bytes / 1048576).toFixed(0)} MB`);
