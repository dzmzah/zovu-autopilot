// Собирает вертикальный рилс 1080x1920 из наших слайдов.
//
// Как выглядит: слайд по центру, за ним — он же, растянутый и размытый,
// чтобы кадр был заполнен и не было чёрных полос. Медленный наезд на каждом
// кадре, плавные переходы. Музыка берётся из папки music/, если она там есть.
//
// Instagram принимает рилсы как MP4: H.264 + AAC, 9:16, от 3 до 90 секунд.
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OUT_DIR = path.join(import.meta.dirname, 'out');
const MUSIC_DIR = path.join(import.meta.dirname, 'music');
const W = 1080;
const H = 1920;
const FPS = 30;

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function pickMusic() {
  try {
    const files = (await readdir(MUSIC_DIR)).filter((f) => /\.(mp3|m4a|aac|wav)$/i.test(f));
    if (!files.length) return null;
    return path.join(MUSIC_DIR, files[Math.floor(Math.random() * files.length)]);
  } catch {
    return null;
  }
}

// Один кадр: размытый фон на весь экран + сам слайд по центру + медленный наезд
async function renderClip(image, outFile, seconds) {
  const frames = Math.round(seconds * FPS);
  const filter = [
    // фон: заполняем кадр, размываем, притемняем
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `boxblur=28:2,eq=brightness=-0.22:saturation=1.1[bg]`,
    // передний план: слайд по ширине кадра
    `[0:v]scale=${W - 80}:-1[fg]`,
    // Накладываем по центру, но приподнимаем на 90 px: снизу Instagram рисует
    // подпись и кнопки, и они закрывали бы наш логотип.
    `[bg][fg]overlay=(W-w)/2:(H-h)/2-90[base]`,
    // Медленный наезд. d=1 обязательно: иначе zoompan размножает КАЖДЫЙ входной
    // кадр на d кадров, и ролик раздувается в сотни мегабайт.
    // Масштаб считаем от номера кадра on.
    `[base]zoompan=z='min(1+0.00035*on,1.10)':d=1:s=${W}x${H}:fps=${FPS}[v]`,
  ].join(';');

  await ffmpeg([
    '-loop', '1', '-t', String(seconds), '-i', image,
    '-filter_complex', filter,
    '-map', '[v]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20',
    outFile,
  ]);
}

// data: { images: [...пути], name, secondsPerSlide }
export async function makeReel({ images, name, secondsPerSlide = 2.6 }) {
  if (!images?.length) throw new Error('nie ma z czego zrobić rolki');
  await mkdir(OUT_DIR, { recursive: true });

  const base = String(name || `reel-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
  const clips = [];

  for (const [i, img] of images.entries()) {
    // первый кадр держим дольше — на нём читают заголовок
    const sec = i === 0 ? secondsPerSlide + 1.2 : secondsPerSlide;
    const clip = path.join(OUT_DIR, `${base}-clip${i}.mp4`);
    await renderClip(img, clip, sec);
    clips.push(clip);
  }

  // склейка
  const listFile = path.join(OUT_DIR, `${base}-list.txt`);
  await writeFile(listFile, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');

  const silent = path.join(OUT_DIR, `${base}-mute.mp4`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

  // звук: музыка из папки или тишина (Instagram хочет звуковую дорожку)
  const music = await pickMusic();
  const final = path.join(OUT_DIR, `${base}.mp4`);

  if (music) {
    // Дорожки в music/ длиннее ролика, поэтому обрезаем по видео и гасим хвост.
    // Момент затухания считаем от реальной длины, а не от угаданного числа:
    // ролик меняет длину вместе с числом слайдов.
    const total = images.reduce((s, _, i) => s + (i === 0 ? secondsPerSlide + 1.2 : secondsPerSlide), 0);
    const fadeOut = Math.max(0, total - 2).toFixed(2);
    await ffmpeg([
      '-i', silent, '-i', music,
      '-filter_complex',
      // loudnorm приводит любую дорожку к -14 LUFS — уровню, под который
      // Instagram и так пересчитывает звук. Иначе один трек орёт, другой шепчет.
      `[1:a]atrim=0:${total.toFixed(2)},asetpts=N/SR/TB,` +
        `loudnorm=I=-14:TP=-1.5:LRA=11,` +
        `afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOut}:d=2[a]`,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
      final,
    ]);
  } else {
    await ffmpeg([
      '-i', silent,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest',
      final,
    ]);
  }

  // подчищаем промежуточное
  for (const f of [...clips, listFile, silent]) await unlink(f).catch(() => {});

  const stat = await readFile(final).then((b) => b.length);
  return { file: final, name: `${base}.mp4`, bytes: stat, withMusic: Boolean(music) };
}

// CLI: node make-reel.mjs <maska-plikow>
if (process.argv[1] && process.argv[1].endsWith('make-reel.mjs')) {
  const prefix = process.argv[2] || 'karuzela-v8';
  const files = (await readdir(OUT_DIR))
    .filter((f) => f.startsWith(prefix) && f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(OUT_DIR, f));
  if (!files.length) {
    console.log('nie znalazłem obrazków dla', prefix);
    process.exit(1);
  }
  console.log('klatek:', files.length);
  const r = await makeReel({ images: files, name: `${prefix}-reel` });
  console.log(JSON.stringify({ file: r.file, mb: (r.bytes / 1048576).toFixed(1), music: r.withMusic }, null, 1));
}
