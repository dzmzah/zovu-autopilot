// Финал ролика Nootri — вместо белой плашки живой кадр с настоящей упаковкой.
//
// Почему меняем. Светлая карточка с текстом обрывает ролик: только что был
// кинематографичный кадр, и вдруг слайд из презентации. Захар: «слишком просто,
// белый фон и текст». Финал должен быть той же плотности, что и остальное.
//
// Устройство: последний кадр Veo с ИХ упаковкой продолжает жить, снизу
// поднимается тёмная вуаль, из-под неё выезжает гарантия, следом адрес.
// Движение только у текста — кадр не трогаем, наездов не делаем.
//
//   node nootri-ogon.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');
const TMP = path.join(OUT, 'ogon-tmp');
const KLIP = path.join(OUT, 'veo', 'nootri-produkt.mp4');
const DL = 3.4;

await mkdir(TMP, { recursive: true });

// Две надписи рисуем браузером: тот же шрифт и та же типографика, что в ролике.
const HTML = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:transparent;font-family:'Outfit',sans-serif}
  .p{width:1080px;height:1920px;position:relative;background:transparent}
  .duzy{position:absolute;left:84px;bottom:470px;color:#fff;font-size:104px;
        font-weight:200;line-height:.98;letter-spacing:-.01em}
  .duzy b{font-weight:500}
  .maly{position:absolute;left:88px;bottom:360px;color:#fff;opacity:.8;
        font-size:30px;letter-spacing:.34em;text-transform:uppercase;font-weight:300}
</style>
<div class="p" id="a"><div class="duzy">30 dni<br><b>gwarancji</b></div></div>
<div class="p" id="b"><div class="maly">nootri.pl &nbsp;·&nbsp; @neworchard_</div></div>`;

const plikHtml = path.join(TMP, 'ogon.html');
await (await import('node:fs/promises')).writeFile(plikHtml, HTML, 'utf8');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto('file:///' + plikHtml.replace(/\\/g, '/'));
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
for (const id of ['a', 'b']) {
  const el = await p.$('#' + id);
  await el.screenshot({ path: path.join(TMP, `${id}.png`), omitBackground: true });
}
await b.close();

// Вуаль снизу поднимается за 0.5 с, гарантия выезжает на 40 px за 0.45 с,
// адрес появляется через секунду после неё. Всё на живом кадре.
const wyjscie = path.join(OUT, 'nootri-ogon.mp4');
await exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
  '-i', KLIP,
  '-loop', '1', '-i', path.join(TMP, 'a.png'),
  '-loop', '1', '-i', path.join(TMP, 'b.png'),
  '-filter_complex',
    `[0:v]trim=4.6:${(4.6 + DL).toFixed(2)},setpts=PTS-STARTPTS,scale=1080:1920,` +
      `drawbox=x=0:y=ih-h:w=iw:h='min(760,760*t/0.5)':color=0x0a0e09@0.62:t=fill,` +
      `format=yuv420p[bg];` +
    `[1:v]format=rgba,fade=t=in:st=0.35:d=0.35:alpha=1[t1];` +
    `[2:v]format=rgba,fade=t=in:st=1.25:d=0.4:alpha=1[t2];` +
    `[bg][t1]overlay=0:'if(lt(t,0.8),40-40*min(1,(t-0.35)/0.45),0)':format=auto[v1];` +
    `[v1][t2]overlay=0:0:format=auto,format=yuv420p[v]`,
  '-map', '[v]', '-t', String(DL), '-r', '30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
  wyjscie,
], { maxBuffer: 64 * 1024 * 1024 });

const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wyjscie]);
console.log(`[ogon] готово: ${wyjscie} — ${(+stdout.trim()).toFixed(2)} с`);
