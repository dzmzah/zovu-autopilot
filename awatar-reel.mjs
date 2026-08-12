// Рилс с ИИ-ведущим, собранный по замерам референса `Dbct8lzsSxc`.
// Все числа ниже взяты из REFERENS.md, а не придуманы.
//
// Устройство ролика:
//
//   герой → светлая карточка → герой → светлая карточка → … → герой
//
// «Герой» — кусок клипа из Veo: говорящий человек, тёмный кадр, свой звук.
// «Карточка» — полноэкранная типографика на светлом фоне, рисует браузер.
// Контраст тёмное/светлое и есть то, что читается как монтаж; частота
// склеек тут ни при чём — у референса средний план 3.4 с, а не 1 с.
//
// Звук. Голос героя идёт сквозь весь ролик непрерывно, включая карточки:
// картинка меняется, речь не прерывается. Под голосом всегда подложка,
// чтобы дорожка ни разу не провалилась в цифровую тишину — у референса
// silencedetect не находит ни одного провала за 32 секунды, а в сыром
// выхлопе Veo их три.
//
//   node awatar-reel.mjs plan.json
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;
const OUT_DIR = path.join(DIR, 'out');
const MUSIC_DIR = path.join(DIR, 'music');
const W = 1080;
const H = 1920;
const FPS = 30;

// Замеры референса — целевые значения сборки.
const REF = {
  lufs: -14,
  truePeak: -1.5,
  // У референса LRA 4.1. Ставим 7: loudnorm трактует LRA как ПОТОЛОК и при
  // низком значении дожимает дорожку. С lra:5 плюс компрессором на выходе
  // получалось 1.2 — речь становилась полкой, живость пропадала.
  lra: 7,
  planSredni: 3.4,
};

async function ffmpeg(args) {
  return execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function ffprobeDuration(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  return parseFloat(stdout.trim());
}

// ── речевые отрезки внутри клипа ──────────────────────────────────
// Нужны, чтобы (1) обрезать тишину по краям и (2) разложить слова подписи
// по реальному звуку, а не по равномерной сетке.
async function speechRuns(file) {
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', file, '-af', 'silencedetect=n=-34dB:d=0.10', '-f', 'null', '-'],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const total = await ffprobeDuration(file);
  const starts = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => +m[1]);
  const ends = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => +m[1]);

  const cisza = starts.map((s, i) => [s, ends[i] ?? total]);
  const runs = [];
  let t = 0;
  for (const [a, b] of cisza) {
    if (a - t > 0.12) runs.push([t, a]);
    t = b;
  }
  if (total - t > 0.12) runs.push([t, total]);
  return { total, runs: runs.length ? runs : [[0, total]] };
}

// ── карточка-врезка ───────────────────────────────────────────────
// Типографика референса: огромный жирный uppercase вперемешку с мелким
// курсивным serif строчными. Пара контрастных начертаний — весь приём.
function kartaHtml(karta, seconds) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const wiersze = karta.linie
    .map((l, i) => {
      const cls = l.maly ? 'maly' : 'duzy';
      return `<div class="w ${cls}" data-i="${i}">${esc(l.tekst)}</div>`;
    })
    .join('\n');

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Playfair+Display:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:${karta.tlo || '#efece2'}; overflow:hidden;
  font-family:'Inter',sans-serif; display:flex; flex-direction:column;
  justify-content:center; padding:0 96px; }
.w { opacity:0; }
.duzy { font-weight:900; font-size:150px; line-height:0.95; letter-spacing:-4px;
  text-transform:uppercase; color:#2b2a26; }
.maly { font-family:'Playfair Display',serif; font-style:italic; font-weight:400;
  font-size:62px; line-height:1.25; color:#6f6c63; margin:6px 0 10px 8px; }
</style></head><body>
${wiersze}
<script>
const N = ${karta.linie.length};
const SEC = ${seconds};
const el = [...document.querySelectorAll('.w')];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

window.__fit = () => {
  // Строки разной длины: подгоняем кегль, пока всё не влезет по ширине.
  // Короткая строка (цифра-номер пункта) стартует с большого кегля: на 150px
  // одинокая «1» теряется в кадре 1080×1920 и карточка выглядит пустой.
  el.forEach((e) => {
    if (!e.classList.contains('duzy')) return;
    let s = e.textContent.trim().length <= 3 ? 460 : 150;
    e.style.fontSize = s + 'px';
    while (s > 60 && e.scrollWidth > e.clientWidth) { s -= 4; e.style.fontSize = s + 'px'; }
  });
};

window.setT = (t) => {
  // Строки въезжают по очереди за первую треть карточки — как в референсе,
  // где слова проявляются под речь, а не все разом.
  const okno = Math.min(0.9, (SEC * 0.55) / N);
  el.forEach((e, i) => {
    const p = easeOut(clamp01((t - i * okno * 0.75) / okno));
    e.style.opacity = p;
    e.style.transform = 'translateY(' + Math.round((1 - p) * 26) + 'px)';
  });
};
</script></body></html>`;
}

// ── подписи поверх героя ──────────────────────────────────────────
// Референс: белый жирный гротеск ОБЫЧНЫМ регистром, тонкая тень, без
// толстой обводки, по центру на уровне груди — не внизу кадра.
function podpisyHtml(bloki, total) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // **слово** — акцентный цвет. Ключевое слово в фразе, выделенное фирменным
  // фиолетовым, читается за долю секунды; ровный белый текст глаз пролистывает.
  const zaznacz = (s) =>
    esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="hi">$1</span>');

  const divy = bloki
    .map((b, i) => `<div class="cap" data-i="${i}">${zaznacz(b.tekst)}</div>`)
    .join('\n');
  const meta = JSON.stringify(bloki.map((b) => ({ a: b.start, b: b.end })));

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:transparent; overflow:hidden; font-family:'Inter',sans-serif; }
.cap { position:absolute; left:60px; right:60px; top:990px; text-align:center;
  font-weight:800; font-size:92px; line-height:1.08; color:#fff;
  letter-spacing:-1.5px;
  text-shadow:0 4px 16px rgba(0,0,0,.62), 0 2px 4px rgba(0,0,0,.75),
    0 0 2px rgba(0,0,0,.8);
  visibility:hidden; }
.hi { color:#a78bfa; }
</style></head><body>
${divy}
<script>
const L = ${meta};
const caps = [...document.querySelectorAll('.cap')];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

window.__fit = () => {
  caps.forEach((c) => {
    let s = 88;
    c.style.fontSize = s + 'px';
    while (s > 46 && (c.scrollWidth > c.clientWidth || c.scrollHeight > 260)) {
      s -= 3; c.style.fontSize = s + 'px';
    }
  });
};

window.setT = (t) => {
  caps.forEach((c, i) => {
    const l = L[i];
    if (t < l.a || t >= l.b) { c.style.visibility = 'hidden'; return; }
    c.style.visibility = 'visible';
    // короткий подскок в начале — подпись «садится» на слово
    const p = clamp01((t - l.a) / 0.11);
    c.style.transform = 'scale(' + (0.94 + 0.06 * p).toFixed(3) + ')';
  });
};
</script></body></html>`;
}

// ── врезка-график ─────────────────────────────────────────────────
// Кривая рисуется на глазах, счётчик дней щёлкает вверх, точки постов
// разъезжаются. Готовое число зритель пролистывает, растущее — смотрит.
//
// Цифры честные: считаем то, что сказано в реплике (раз в две недели =
// 14 дней), а не выдуманный процент. Придуманная статистика в кадре —
// это обещание, за которое потом отвечать агентству.
function wykresHtml(opcje, seconds, akcent = '#7c3aed', akcent2 = '#a78bfa') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dni = opcje.dni ?? 14;

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800;900&family=Playfair+Display:ital@1&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{overflow:hidden;font-family:'Inter',sans-serif;
  background:
    radial-gradient(ellipse 820px 620px at 50% 30%, ${akcent}4d, transparent 64%),
    linear-gradient(180deg,#16112b 0%,#0b0718 100%);}
.wrap{position:absolute;left:90px;right:90px;top:430px;}
.tytul{font-weight:800;font-size:52px;color:#a9a2c4;letter-spacing:1px;
  text-transform:uppercase;opacity:0}
.licznik{font-weight:900;font-size:250px;line-height:1;color:#fff;letter-spacing:-10px;
  margin:14px 0 6px;opacity:0}
.licznik small{font-size:96px;letter-spacing:-3px;color:${akcent2};margin-left:18px}
.podpis{font-family:'Playfair Display',serif;font-style:italic;font-size:56px;
  color:#b9b2d6;opacity:0}
svg{position:absolute;left:60px;top:1030px;}
.siatka{stroke:#ffffff18;stroke-width:3}
.krzywa{fill:none;stroke:url(#g);stroke-width:14;stroke-linecap:round;stroke-linejoin:round}
.kropka{fill:#fff;stroke:${akcent};stroke-width:8}
.strzalka{opacity:0}
</style></head><body>
<div class="wrap">
  <div class="tytul">${esc(opcje.tytul || 'przerwa między postami')}</div>
  <div class="licznik"><span id="n">0</span><small>${esc(opcje.jednostka || 'dni')}</small></div>
  <div class="podpis">${esc(opcje.podpis || 'a algorytm liczy każdy z nich')}</div>
</div>
<svg width="960" height="560" viewBox="0 0 960 560">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${akcent2}"/><stop offset="1" stop-color="${akcent}"/>
  </linearGradient></defs>
  <line class="siatka" x1="0" y1="140" x2="960" y2="140"/>
  <line class="siatka" x1="0" y1="300" x2="960" y2="300"/>
  <line class="siatka" x1="0" y1="460" x2="960" y2="460"/>
  <path id="k" class="krzywa" d="M20,70 C180,90 260,150 360,210 C470,275 560,340 680,410 C780,468 860,495 940,510"/>
  <circle id="d" class="kropka" cx="20" cy="70" r="17"/>
</svg>
<script>
const SEC = ${seconds};
const DNI = ${dni};
const k = document.getElementById('k');
const d = document.getElementById('d');
const n = document.getElementById('n');
const dl = k.getTotalLength();
k.style.strokeDasharray = dl;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

window.__fit = () => {};
window.setT = (t) => {
  const tyt = document.querySelector('.tytul');
  const lic = document.querySelector('.licznik');
  const pod = document.querySelector('.podpis');
  const p1 = easeOut(clamp01(t / 0.30));
  const p2 = easeOut(clamp01((t - 0.16) / 0.30));
  const p3 = easeOut(clamp01((t - 0.52) / 0.34));
  tyt.style.opacity = p1;
  tyt.style.transform = 'translateY(' + Math.round((1 - p1) * 22) + 'px)';
  lic.style.opacity = p2;
  lic.style.transform = 'translateY(' + Math.round((1 - p2) * 26) + 'px)';
  pod.style.opacity = p3;

  // счётчик щёлкает вместе с тем, как рисуется кривая
  const bieg = easeOut(clamp01((t - 0.20) / (SEC * 0.62)));
  n.textContent = Math.round(bieg * DNI);
  k.style.strokeDashoffset = dl * (1 - bieg);
  const pt = k.getPointAtLength(dl * bieg);
  d.setAttribute('cx', pt.x);
  d.setAttribute('cy', pt.y);
  d.style.opacity = bieg > 0.02 ? 1 : 0;
};
</script></body></html>`;
}

// ── коллаж-вставка ────────────────────────────────────────────────
// Полностью НЕПРОЗРАЧНАЯ врезка на всю ширину кадра. Ставится туда, где
// склеены два разных прогона Veo: под ней происходит жёсткий рез, и его не
// видно, потому что в этот момент на экране другое.
//
// Почему не растворение: кросс-фейд между двумя дублями ОДНОГО лица даёт
// двойное изображение — на кадре две головы одна сквозь другую. Для лиц это
// хуже жёсткого реза. Проверено и забраковано.
//
// Карточки — живой сток (Pexels, бесплатно, коммерческое разрешено), а не
// генерация: рядом с ИИ-ведущим настоящие люди работают на достоверность.
async function zbudujKolaz(karty, sekundy, tmp, nazwa, akcent = '#7c3aed') {
  const dir = path.join(tmp, nazwa);
  await mkdir(dir, { recursive: true });

  // Фон коллажа — фирменный, рисуем один кадр и растягиваем на всю врезку.
  const tloPng = path.join(dir, 'tlo.png');
  await renderHtml(
    `<!doctype html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0}html,body{width:${W}px;height:${H}px}
      body{background:
        radial-gradient(ellipse 820px 620px at 50% 34%, ${akcent}55, transparent 64%),
        linear-gradient(180deg,#16112b 0%,#0b0718 100%);}
    </style></head><body><script>window.setT=()=>{};window.__fit=()=>{};</script></body></html>`,
    1 / FPS,
    dir,
    false
  );
  await execFileAsync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', path.join(dir, 'f00000.png'), tloPng]);

  // Карточка: вертикальный кусок стока в рамке. Белая рамка нужна, чтобы
  // карточка читалась поверх тёмного фона как объект, а не как дырка.
  const KARTA_W = 430;
  const KARTA_H = 610;
  const wejscia = ['-loop', '1', '-t', String(sekundy), '-i', tloPng];
  const filtry = [`[0:v]fps=${FPS},setsar=1[tlo]`];
  let biezacy = '[tlo]';

  karty.forEach((k, i) => {
    wejscia.push('-stream_loop', '-1', '-t', String(sekundy), '-i', k.plik);
    filtry.push(
      `[${i + 1}:v]scale=${KARTA_W}:${KARTA_H}:force_original_aspect_ratio=increase,` +
        `crop=${KARTA_W}:${KARTA_H},fps=${FPS},setsar=1,` +
        `pad=${KARTA_W + 12}:${KARTA_H + 12}:6:6:color=white[k${i}]`
    );

    // Въезд: карточка приходит снизу за 0.32 с, с задержкой по очереди.
    const start = (0.12 + i * 0.17).toFixed(2);
    const x = k.x;
    const y = k.y;
    const wjazd =
      `${y}+520*(1-min(1,max(0,(t-${start})/0.32)))*(1-min(1,max(0,(t-${start})/0.32)))`;
    filtry.push(
      `${biezacy}[k${i}]overlay=x=${x}:y='${wjazd}':eof_action=pass[s${i}]`
    );
    biezacy = `[s${i}]`;
  });

  const out = path.join(tmp, `${nazwa}.mp4`);
  await ffmpeg([
    ...wejscia,
    '-filter_complex', filtry.join(';'),
    '-map', biezacy,
    '-t', String(sekundy),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-an',
    out,
  ]);
  await rm(dir, { recursive: true, force: true });
  return out;
}

// ── титр-номер пункта ─────────────────────────────────────────────
// «Po pierwsze / po drugie / po trzecie» — это одновременно ритм, обещание
// конца и опора для глаза. Veo проглотил эти слова в звуке, поэтому их
// несёт графика.
//
// Устройство: цветная полоса выезжает слева, по ней въезжает текст, потом
// полоса уходит вправо. Полоса важнее текста — глаз ловит движение массы,
// а не буквы, и врезка читается даже на промотке.
//
// Ставится в зону между лицом и подписью, чтобы не спорить ни с тем, ни с
// другим. Ею же закрываются места, где герой недоиграл движение.
function tytulyHtml(tytuly, total, akcent = '#7c3aed', akcent2 = '#a78bfa') {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const divy = tytuly
    .map(
      (t, i) => `<div class="tyt" data-i="${i}">
  <div class="pas"></div>
  <div class="txt"><span>${
    t.numer ? `<b class="nr">${esc(t.numer)}.</b>` : ''
  }${esc(t.tekst)}</span></div>
</div>`
    )
    .join('\n');

  const meta = JSON.stringify(tytuly.map((t) => ({ a: t.start, b: t.start + t.dlugosc })));

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:transparent; overflow:hidden; font-family:'Inter',sans-serif; }
.tyt { position:absolute; left:64px; top:1560px; width:${W - 128}px; height:132px;
  visibility:hidden; }
.pas { position:absolute; inset:0; border-radius:10px;
  background:linear-gradient(100deg, ${akcent} 0%, ${akcent2} 100%);
  transform-origin:left center; transform:scaleX(0);
  box-shadow:0 16px 44px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.10) inset; }
.txt { position:absolute; inset:0; display:flex; align-items:center;
  padding-left:44px; overflow:hidden; }
.txt span { display:block; font-weight:900; font-size:82px; letter-spacing:-2px;
  text-transform:uppercase; color:#fff; white-space:nowrap;
  text-shadow:0 3px 14px rgba(0,0,0,.35); }
/* Номер отбит белой плашкой: цифра — якорь, за неё цепляется глаз, а
   дальше уже читается фраза. Без отбивки «1.» сливается со словом. */
.nr { display:inline-block; margin-right:22px; padding:0 18px; border-radius:9px;
  background:#fff; color:${akcent}; font-weight:900; }
</style></head><body>
${divy}
<script>
const T = ${meta};
const tyt = [...document.querySelectorAll('.tyt')];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;

window.__fit = () => {
  tyt.forEach((e) => {
    const s = e.querySelector('.txt span');
    let k = 82;
    s.style.fontSize = k + 'px';
    while (k > 44 && s.scrollWidth > e.clientWidth - 88) { k -= 3; s.style.fontSize = k + 'px'; }
  });
};

window.setT = (t) => {
  tyt.forEach((e, i) => {
    const { a, b } = T[i];
    if (t < a - 0.02 || t > b + 0.02) { e.style.visibility = 'hidden'; return; }
    e.style.visibility = 'visible';
    const l = t - a;
    const dur = b - a;
    const wjazd = easeOut(clamp01(l / 0.26));
    const wyjazd = easeIn(clamp01((l - (dur - 0.24)) / 0.24));
    const pas = e.querySelector('.pas');
    const span = e.querySelector('.txt span');
    // полоса въезжает слева и уходит вправо: origin переставляем на выходе,
    // иначе она схлопывается обратно к началу и движение читается как откат
    if (wyjazd > 0) {
      pas.style.transformOrigin = 'right center';
      pas.style.transform = 'scaleX(' + (1 - wyjazd).toFixed(3) + ')';
    } else {
      pas.style.transformOrigin = 'left center';
      pas.style.transform = 'scaleX(' + wjazd.toFixed(3) + ')';
    }
    const tp = easeOut(clamp01((l - 0.13) / 0.24));
    span.style.opacity = Math.min(tp, 1 - wyjazd);
    span.style.transform = 'translateX(' + Math.round((1 - tp) * -34) + 'px)';
  });
};
</script></body></html>`;
}

// ── реальные слова из звука ───────────────────────────────────────
// Раскладывать текст по кадру «на глаз», пропорционально длине речевых
// отрезков, — заведомо мимо: подпись уезжает от губ, а куски фраз теряют
// смысл. Берём слова из самого звука вместе с их временем.
//
// whisper.cpp с CUDA лежит в JARVIS — локально, на видеокарте, бесплатно,
// без единого запроса наружу. `-ml 1 -sow` = по одному слову на сегмент.
//
// Побочная польза: сразу видно, что герой сказал НА САМОМ ДЕЛЕ. Veo
// проглатывает слова из раскадровки — подпись по сценарию врала бы.
const WHISPER_EXE = 'D:/My AI/JARVIS/bin/whisper-cuda/whisper-cli.exe';
const WHISPER_MODEL = 'D:/My AI/JARVIS/models/ggml-large-v3-turbo-q5_0.bin';

async function transkrybuj(plik, tmp, i, cfg = {}) {
  const exe = cfg.exe || WHISPER_EXE;
  const model = cfg.model || WHISPER_MODEL;
  const wav = path.join(tmp, `mowa${i}.wav`);
  await ffmpeg(['-i', plik, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);

  const baza = path.join(tmp, `mowa${i}`);
  await execFileAsync(exe, [
    '-m', model, '-l', cfg.jezyk || 'pl', '-f', wav,
    '-ml', '1', '-sow', '-oj', '-of', baza,
  ], { maxBuffer: 32 * 1024 * 1024 });

  const j = JSON.parse(await readFile(baza + '.json', 'utf8'));
  return (j.transcription || [])
    .map((s) => ({
      tekst: String(s.text || '').trim(),
      a: s.offsets.from / 1000,
      b: s.offsets.to / 1000,
    }))
    .filter((w) => w.tekst && !/^[-–—.,!?]+$/.test(w.tekst));
}

// ── фразы для караоке-подписи ─────────────────────────────────────
// Копим слова в строку, пока она короткая, и рвём по знаку препинания —
// на нём фраза кончается и по смыслу, и на слух. Длинная строка на две
// полосы читается хуже, чем две короткие подряд.
function zbierzFrazy(slowa, maxZnakow = 20, maxSlow = 3) {
  const frazy = [];
  let biezaca = [];
  const zamknij = () => {
    if (!biezaca.length) return;
    frazy.push({
      slowa: biezaca,
      a: biezaca[0].a,
      b: biezaca[biezaca.length - 1].b,
    });
    biezaca = [];
  };
  for (const w of slowa) {
    const dlugosc = biezaca.reduce((s, x) => s + x.tekst.length + 1, 0) + w.tekst.length;
    if (biezaca.length && (dlugosc > maxZnakow || biezaca.length >= maxSlow)) zamknij();
    biezaca.push(w);
    // пауза длиннее 0.45 с — конец мысли, дальше начинается новая
    const przerwa = biezaca.length > 1 ? w.a - biezaca[biezaca.length - 2].b : 0;
    if (/[.,!?:;]$/.test(w.tekst) || przerwa > 0.45) zamknij();
  }
  zamknij();
  return frazy;
}

// ── караоке-подпись ───────────────────────────────────────────────
// Формат, на котором стоит весь короткий формат: КРУПНО, ЗАГЛАВНЫМИ, по
// центру, слова выскакивают ровно под голос, произносимое слово горит
// акцентом. Читается боковым зрением, без звука, за долю секунды.
// Польские служебные слова: предлоги, союзы, частицы, местоимения. Они не
// несут смысла и не должны ловить на себе плашку.
const SLUZBOWE = new Set([
  'a', 'i', 'o', 'w', 'z', 'ze', 'na', 'do', 'od', 'po', 'za', 'to', 'te', 'ta',
  'ten', 'tym', 'nie', 'sie', 'się', 'jest', 'ale', 'lub', 'czy', 'juz', 'już',
  'tak', 'jak', 'co', 'kto', 'gdy', 'bo', 'by', 'za', 'przez', 'dla', 'bez',
]);

function karaokeHtml(frazy, total, akcent = '#a78bfa') {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const divy = frazy
    .map(
      (f, i) =>
        `<div class="fraza" data-i="${i}">` +
        f.slowa
          .map((w, k) => {
            // Служебные слова плашкой не подсвечиваем: она загорается почти
            // на каждом слове и получается мигание вместо ритма. Им хватает
            // смены цвета — глаз всё равно ведёт по крупным.
            const goly = w.tekst.replace(/[^\p{L}\p{N}]/gu, '');
            const sluzbowe = goly.length <= 3 || SLUZBOWE.has(goly.toLowerCase());
            return `<span class="s${sluzbowe ? ' drobne' : ''}" data-k="${k}">${esc(
              w.tekst.toUpperCase()
            )}</span>`;
          })
          .join(' ') +
        `</div>`
    )
    .join('\n');

  const meta = JSON.stringify(
    frazy.map((f) => ({ a: f.a, b: f.b, w: f.slowa.map((w) => ({ a: w.a, b: w.b })) }))
  );

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:transparent; overflow:hidden; font-family:'Inter',sans-serif; }
/* Толстая тёмная обводка вокруг букв — то, чем короткий формат отличается
   от «титров в кино». Тень мягкая и на светлом фоне пропадает, обводка
   держит текст на любом кадре и заставляет глаз зацепиться. */
.fraza { position:absolute; left:48px; right:48px; top:1230px; text-align:center;
  font-weight:900; font-size:128px; line-height:1.06; letter-spacing:-3px;
  text-transform:uppercase; visibility:hidden; }
.s { display:inline-block; margin:0 0.10em; padding:2px 16px 8px; color:#fff; opacity:0;
  border-radius:18px;
  -webkit-text-stroke:11px #0b0718; paint-order:stroke fill;
  text-shadow:0 8px 26px rgba(0,0,0,.55);
  transform-origin:center bottom; }
/* Произносимое слово — не просто другой цвет, а ПЛАШКА под ним. Цвет текста
   глаз ловит медленнее, чем цветной прямоугольник. */
.s.gra { color:#fff; background:linear-gradient(100deg, ${akcent} 0%, #7c3aed 100%);
  box-shadow:0 10px 30px rgba(124,58,237,.45); }
/* Служебному слову — только цвет, без плашки: иначе она вспыхивает почти
   на каждом слове и ритм превращается в мигание. */
.s.drobne.gra { background:none; box-shadow:none; color:${akcent}; }
</style></head><body>
${divy}
<script>
const F = ${meta};
const frazy = [...document.querySelectorAll('.fraza')];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

window.__fit = () => {
  frazy.forEach((f) => {
    let s = 118;
    f.style.fontSize = s + 'px';
    while (s > 62 && (f.scrollWidth > f.clientWidth || f.scrollHeight > 280)) {
      s -= 4; f.style.fontSize = s + 'px';
    }
  });
};

window.setT = (t) => {
  frazy.forEach((el, i) => {
    const f = F[i];
    // Фраза висит до следующей, но уходит ЗАРАНЕЕ: слова следующей начинают
    // выскакивать за 0.09 с до звука, и без запаса две фразы на миг встают
    // одна поверх другой — на кадре это выглядит как двоение.
    const koniec = F[i + 1] ? Math.min(f.b + 0.45, F[i + 1].a - 0.14) : f.b + 0.45;
    if (t < f.a - 0.06 || t > koniec) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = 'visible';
    const spany = el.querySelectorAll('.s');
    f.w.forEach((w, k) => {
      const s = spany[k];
      // слово выскакивает за 0.09 с до того, как прозвучит — иначе кажется,
      // что подпись опаздывает: глаз читает медленнее, чем ухо слышит
      const p = easeOut(clamp01((t - (w.a - 0.09)) / 0.13));
      s.style.opacity = p;
      const gra = t >= w.a - 0.06 && t < w.b + 0.05;
      s.classList.toggle('gra', gra);
      const skok = gra ? 1.0 + 0.16 * (1 - clamp01((t - w.a) / 0.18)) : 1.0;
      s.style.transform = 'scale(' + (p * 0.12 + 0.88).toFixed(3) + ') scale(' + skok.toFixed(3) + ')';
    });
  });
};
</script></body></html>`;
}

// ── фирменный аутро ───────────────────────────────────────────────
// Светлая типографская плашка в конце — это ничей ролик. Финал должен быть
// узнаваем: фирменный тёмно-фиолетовый, свечение акцентом, лого и адрес.
//
// Строки выходят с ФИКСИРОВАННЫМ шагом KROK. Это принципиально: под каждое
// появление ставится щелчок печатной машинки, и если шаг плавает вместе с
// длиной карточки, звук разъезжается с картинкой.
const KROK_MARKI = 0.34;

function markaHtml(karta, seconds, logoDataUri) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const wiersze = karta.linie
    .map(
      (l, i) =>
        `<div class="w ${l.maly ? 'maly' : 'duzy'}" data-i="${i}">${esc(l.tekst)}</div>`
    )
    .join('\n');

  const logo = logoDataUri
    ? `<img class="logo" src="${logoDataUri}" alt="">`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Playfair+Display:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { overflow:hidden; font-family:'Inter',sans-serif;
  background:
    radial-gradient(ellipse 900px 700px at 50% 26%, rgba(124,58,237,.42), transparent 62%),
    linear-gradient(180deg, #160e2e 0%, #0d0820 100%);
  display:flex; flex-direction:column; justify-content:center; padding:0 96px; }

.w { opacity:0; }
.duzy { font-weight:900; font-size:150px; line-height:0.95; letter-spacing:-4px;
  text-transform:uppercase; color:#fff; text-shadow:0 8px 40px rgba(0,0,0,.45); }
.maly { font-family:'Playfair Display',serif; font-style:italic; font-weight:400;
  font-size:62px; line-height:1.25; color:#a78bfa; margin:8px 0 12px 8px; }

.stopka { position:absolute; left:96px; right:96px; bottom:190px;
  display:flex; align-items:center; gap:34px; opacity:0; }
.logo { width:132px; height:132px; display:block;
  filter:drop-shadow(0 10px 30px rgba(124,58,237,.55)); }
.adres { font-weight:900; font-size:82px; letter-spacing:-2px; color:#fff; }
.kreska { position:absolute; left:96px; bottom:150px; height:4px; width:calc(100% - 192px);
  background:linear-gradient(90deg, #7c3aed, #a78bfa); transform-origin:left center;
  transform:scaleX(0); border-radius:3px; }
</style></head><body>
${wiersze}
<div class="kreska"></div>
<div class="stopka">${logo}<div class="adres">${esc(karta.adres || 'zovu.pl')}</div></div>
<script>
const N = ${karta.linie.length};
const KROK = ${KROK_MARKI};
const el = [...document.querySelectorAll('.w')];
const stopka = document.querySelector('.stopka');
const kreska = document.querySelector('.kreska');
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

window.__fit = () => {
  el.forEach((e) => {
    if (!e.classList.contains('duzy')) return;
    let s = e.textContent.trim().length <= 3 ? 460 : 150;
    e.style.fontSize = s + 'px';
    while (s > 60 && e.scrollWidth > e.clientWidth) { s -= 4; e.style.fontSize = s + 'px'; }
  });
};

window.setT = (t) => {
  // каждая строка встаёт на своём шаге — под щелчок
  el.forEach((e, i) => {
    const p = easeOut(clamp01((t - i * KROK) / 0.24));
    e.style.opacity = p;
    e.style.transform = 'translateY(' + Math.round((1 - p) * 30) + 'px)';
  });
  const tStopka = N * KROK + 0.18;
  const ps = easeOut(clamp01((t - tStopka) / 0.3));
  stopka.style.opacity = ps;
  stopka.style.transform = 'translateY(' + Math.round((1 - ps) * 24) + 'px)';
  kreska.style.transform =
    'scaleX(' + easeOut(clamp01((t - tStopka + 0.1) / 0.55)).toFixed(3) + ')';
};
</script></body></html>`;
}

// ── штамп пункта поверх кадра ─────────────────────────────────────
// Полноэкранная карточка вместо лица убивает темп: зритель уходит с
// человека на статичную типографику и теряет нить. Живые рилсы делают
// наоборот — номер пункта приходит ПОВЕРХ говорящего, кадр в этот момент
// подскакивает наездом, и монтаж читается как приём, а не как пауза.
//
// Заодно штамп прикрывает стык двух клипов Veo: на склейке у героя
// меняется причёска, а под наездом со штампом это не читается.
function stempleHtml(stemple, total) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bloki = stemple
    .map(
      (s, i) => `<div class="st" data-i="${i}">
  <div class="num">${esc(s.numer)}</div>
  <div class="rule"></div>
  <div class="lab">${esc(s.podpis || '')}</div>
</div>`
    )
    .join('\n');

  const meta = JSON.stringify(stemple.map((s) => ({ a: s.start, b: s.start + s.dlugosc })));

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;900&family=Playfair+Display:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${W}px; height:${H}px; }
body { background:transparent; overflow:hidden; font-family:'Inter',sans-serif; }

/* Затемнение снизу: комната у героя светлая, белый текст по ней не читается.
   Градиент, а не плашка — иначе видно край и кадр выглядит заклеенным. */
.scrim { position:absolute; left:0; right:0; bottom:0; height:900px; opacity:0;
  background:linear-gradient(to top, rgba(12,11,10,.86) 0%, rgba(12,11,10,.62) 38%,
    rgba(12,11,10,.22) 72%, rgba(12,11,10,0) 100%); }

.st { position:absolute; left:78px; right:78px; bottom:250px; opacity:0; }
.num { font-weight:900; font-size:300px; line-height:0.78; letter-spacing:-14px;
  color:#fff; text-shadow:0 6px 34px rgba(0,0,0,.5); }
.rule { height:5px; background:#fff; margin:26px 0 22px; width:100%;
  transform-origin:left center; transform:scaleX(0); border-radius:3px;
  box-shadow:0 2px 14px rgba(0,0,0,.45); }
.lab { font-family:'Playfair Display',serif; font-style:italic; font-weight:500;
  font-size:66px; line-height:1.15; color:rgba(255,255,255,.96);
  text-shadow:0 3px 16px rgba(0,0,0,.55); }
</style></head><body>
<div class="scrim"></div>
${bloki}
<script>
const S = ${meta};
const scrim = document.querySelector('.scrim');
const st = [...document.querySelectorAll('.st')];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

window.__fit = () => {
  st.forEach((e) => {
    const lab = e.querySelector('.lab');
    let s = 66;
    lab.style.fontSize = s + 'px';
    while (s > 38 && lab.scrollHeight > 170) { s -= 3; lab.style.fontSize = s + 'px'; }
  });
};

window.setT = (t) => {
  let maxScrim = 0;
  st.forEach((e, i) => {
    const { a, b } = S[i];
    const dur = b - a;
    if (t < a - 0.02 || t > b + 0.02) { e.style.opacity = 0; return; }
    const l = t - a;
    // вход 0.22 с, выход 0.24 с — короче, чем у карточки: штамп должен
    // ударить и уйти, а не «показаться»
    const wej = easeOut(clamp01(l / 0.22));
    const wyj = 1 - easeOut(clamp01((l - (dur - 0.24)) / 0.24));
    const p = Math.min(wej, wyj);
    e.style.opacity = p;
    e.querySelector('.num').style.transform =
      'translateY(' + Math.round((1 - wej) * 46) + 'px)';
    e.querySelector('.rule').style.transform =
      'scaleX(' + easeOut(clamp01(l / 0.42)).toFixed(3) + ')';
    const lp = easeOut(clamp01((l - 0.14) / 0.26));
    const lab = e.querySelector('.lab');
    lab.style.opacity = Math.min(lp, wyj);
    lab.style.transform = 'translateY(' + Math.round((1 - lp) * 22) + 'px)';
    if (p > maxScrim) maxScrim = p;
  });
  scrim.style.opacity = maxScrim;
};
</script></body></html>`;
}

// ── покадровый снимок html ────────────────────────────────────────
async function renderHtml(html, seconds, outDir, transparent) {
  await mkdir(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'strona.html');
  await writeFile(htmlPath, html, 'utf8');

  const frames = Math.round(seconds * FPS);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.__fit && window.__fit());
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.setT(t), i / FPS);
      await page.screenshot({
        path: path.join(outDir, `f${String(i).padStart(5, '0')}.png`),
        type: 'png',
        omitBackground: !!transparent,
      });
    }
  } finally {
    await browser.close();
  }
  return frames;
}

// ── расстановка врезок ────────────────────────────────────────────
// Карточка садится в середину реплики героя: там речь идёт ровно, и
// подмена картинки читается как приём, а не как сбой. У стыка клипов
// ставить нельзя — рядом остаётся огрызок плана короче секунды.
//
// Карточек обычно на одну меньше, чем реплик: герой — врезка — герой.
// Если карточек больше, лишние равномерно расходятся по тем же репликам.
function rozstawKarty(karty, segs) {
  const MIN_OD_SKLEJKI = 1.0;
  return karty.map((k, i) => {
    if (k.start != null) return k;

    const seg = segs[i % segs.length];
    const srodek = seg.start + seg.dur / 2;

    // держим карточку внутри реплики с зазором от обоих краёв
    const min = seg.start + MIN_OD_SKLEJKI;
    const max = seg.start + seg.dur - MIN_OD_SKLEJKI - k.dlugosc;
    const start = max > min ? Math.min(Math.max(srodek - k.dlugosc / 2, min), max) : srodek;

    return { ...k, start: +start.toFixed(2) };
  });
}

// ── громкость: двухпроходный loudnorm ─────────────────────────────
// Однопроходный loudnorm работает в динамическом режиме и заново сжимает
// дорожку: замеряли LRA 2.2 на входе и получали 1.5 на выходе. Правильный
// путь — сначала снять реальные значения, потом применить их с linear=true,
// то есть просто сдвинуть уровень, не трогая динамику.
async function zmierz(file, przedFiltr) {
  const af = przedFiltr
    ? `${przedFiltr},loudnorm=I=${REF.lufs}:TP=${REF.truePeak}:LRA=${REF.lra}:print_format=json`
    : `loudnorm=I=${REF.lufs}:TP=${REF.truePeak}:LRA=${REF.lra}:print_format=json`;
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', file, '-af', af, '-f', 'null', '-'],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const m = stderr.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return {
      I: j.input_i,
      TP: j.input_tp,
      LRA: j.input_lra,
      thresh: j.input_thresh,
      offset: j.target_offset,
    };
  } catch {
    return null;
  }
}

// ── щелчки печатной машинки ───────────────────────────────────────
// Дорожка из коротких транзиентов: по одному на каждое появление строки в
// аутро. Собираем ОДНИМ файлом заранее — так в финальный микс уходит один
// вход, а не по входу на щелчок.
async function zbudujStuki(zdarzenia, total, tmp) {
  if (!zdarzenia.length) return null;
  const klik = path.join(tmp, 'klik.wav');
  const swist = path.join(tmp, 'swist.wav');

  // Свист под выезд титра: широкополосный шум с быстрым нарастанием и
  // длинным спадом. Читается как мазок, а не как щелчок.
  await ffmpeg([
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.30:c=white:a=0.7:r=48000',
    '-af', 'highpass=f=320,lowpass=f=4200,afade=t=in:st=0:d=0.09,' +
      'afade=t=out:st=0.10:d=0.20,volume=0.8,aformat=channel_layouts=stereo',
    '-ac', '2', '-ar', '48000',
    swist,
  ]);

  // Щелчок: короткий шумовой всплеск + низкий «удар» молоточка. Полоса
  // 1.2–7 кГц, спад 40 мс — это читается как клавиша, а не как треск.
  await ffmpeg([
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.85:r=48000',
    '-f', 'lavfi', '-i', 'sine=f=150:d=0.06:r=48000',
    '-filter_complex',
    '[0:a]highpass=f=1200,lowpass=f=7000,afade=t=out:st=0.003:d=0.045[s];' +
      '[1:a]volume=0.30,afade=t=out:st=0:d=0.05[t];' +
      '[s][t]amix=inputs=2:normalize=0,volume=0.9,aformat=channel_layouts=stereo[a]',
    '-map', '[a]', '-ac', '2', '-ar', '48000',
    klik,
  ]);

  const wejscia = [];
  const czesci = [];
  zdarzenia.forEach((z, i) => {
    wejscia.push('-i', z.typ === 'swist' ? swist : klik);
    const ms = Math.max(0, Math.round(z.t * 1000));
    const gl = z.glosnosc ?? 1;
    czesci.push(`[${i}:a]volume=${gl},adelay=${ms}|${ms}[k${i}]`);
  });
  const mix =
    zdarzenia.map((_, i) => `[k${i}]`).join('') +
    `amix=inputs=${zdarzenia.length}:normalize=0,` +
    // apad без явной длины на разных сборках ffmpeg ведёт себя по-разному:
    // на сервере GitHub дорожка щелчков выходила короче ролика, и `-shortest`
    // в финальном миксе обрезал по ней — аутро пропадало.
    `apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)},` +
    'asetpts=N/SR/TB[a]';

  const out = path.join(tmp, 'stuki.wav');
  await ffmpeg([
    ...wejscia,
    '-filter_complex', czesci.join(';') + ';' + mix,
    '-map', '[a]', '-ac', '2', '-ar', '48000',
    out,
  ]);
  return out;
}

async function pickMusic() {
  try {
    const f = (await readdir(MUSIC_DIR)).filter((x) => /\.(mp3|m4a|aac|wav)$/i.test(x));
    return f.length ? path.join(MUSIC_DIR, f[0]) : null;
  } catch {
    return null;
  }
}

// ── сборка ────────────────────────────────────────────────────────
export async function zbuduj(plan) {
  const base = (plan.nazwa || 'awatar').replace(/[^a-zA-Z0-9._-]/g, '-');
  const tmp = path.join(OUT_DIR, `${base}-tmp`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  // 1. Герой: режем клипы Veo по речи, склеиваем в одну дорожку.
  const czesci = [];
  let czas = 0;
  const heroSegs = [];

  // Воздух после последнего слова. Без него реплика упирается в следующий
  // план вплотную и стык слышно как обрыв: Veo отдаёт клип, у которого речь
  // доходит до последнего кадра. 0.18 не хватало — ставим 0.30.
  const POWIETRZE = plan.powietrze ?? 0.3;
  const PRZEJSCIE = plan.przejscie ?? 0;

  // ── режим «свой голос» ─────────────────────────────────────────
  // Рилс без ведущего: подложка — немой сток, речь приходит отдельным файлом
  // вместе с готовыми таймингами слов. Тогда расшифровка не нужна вообще —
  // мы САМИ синтезировали эту речь и знаем, где какое слово стоит.
  //
  // Это принципиально надёжнее, чем распознавать собственный синтез: whisper
  // на польском слышит «czy powody» вместо «Trzy powody», а на серверах
  // GitHub большой модели и нет. Здесь ошибиться не в чем.
  const GLOS_ZEWN = plan.glos || null;

  for (const [i, klip] of plan.klipy.entries()) {
    if (GLOS_ZEWN) {
      const dur = +(+klip.dlugosc).toFixed(3);
      const od = +(klip.od ?? 0);
      const out = path.join(tmp, `hero${i}.mp4`);
      await ffmpeg([
        '-ss', od.toFixed(3), '-t', dur.toFixed(3), '-i', klip.plik,
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`,
        '-an',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '19',
        out,
      ]);
      heroSegs.push({ plik: out, start: czas, dur, tekst: klip.tekst || '', slowa: [], runs: [[0, dur]] });
      czesci.push(out);
      czas += dur;
      if (i < plan.klipy.length - 1) czas -= PRZEJSCIE;
      continue;
    }

    const { runs: wszystkie } = await speechRuns(klip.plik);
    const trwanie = await ffprobeDuration(klip.plik);

    // `od`/`do` перебивают автоподрезку. Нужны, когда Veo не уложил фразу в
    // восемь секунд: хвост рубим руками, иначе он обрывается на полуслове.
    const a = klip.od != null ? +klip.od : Math.max(0, wszystkie[0][0] - 0.12);
    const b =
      klip.do != null
        ? Math.min(trwanie, +klip.do)
        : Math.min(trwanie, wszystkie[wszystkie.length - 1][1] + POWIETRZE);
    const dur = +(b - a).toFixed(3);

    // Речевые отрезки держим внутри окна — иначе подписи уезжают за срез.
    const runs = wszystkie
      .map(([x, y]) => [Math.max(x, a), Math.min(y, b)])
      .filter(([x, y]) => y - x > 0.05);
    if (!runs.length) runs.push([a, b]);

    const out = path.join(tmp, `hero${i}.mp4`);
    // 30 мс на въезд и выезд у каждого куска: без них склейка даёт щелчок —
    // дорожка обрывается посреди периода волны. Приём стандартный.
    await ffmpeg([
      '-ss', a.toFixed(3), '-t', dur.toFixed(3), '-i', klip.plik,
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`,
      '-af', `afade=t=in:st=0:d=0.03,afade=t=out:st=${Math.max(0, dur - 0.03).toFixed(3)}:d=0.03`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '19',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      out,
    ]);

    // Слова из звука — со сдвигом в общую шкалу ролика.
    let slowa = [];
    if (plan.karaoke !== false) {
      try {
        const w = await transkrybuj(klip.plik, tmp, i, plan.whisper || {});
        slowa = w
          .filter((x) => x.b > a && x.a < b)
          .map((x) => ({
            tekst: x.tekst,
            a: +(Math.max(x.a, a) - a + czas).toFixed(3),
            b: +(Math.min(x.b, b) - a + czas).toFixed(3),
          }));
      } catch (e) {
        console.error('[awatar] whisper не отработал, подписи будут по старой раскладке:', e.message);
      }
    }

    heroSegs.push({
      plik: out, start: czas, dur, tekst: klip.tekst, slowa,
      runs: runs.map(([x, y]) => [x - a, y - a]),
    });
    czesci.push(out);
    czas += dur;
    if (i < plan.klipy.length - 1) czas -= PRZEJSCIE;
  }

  // ── склейка двух дублей ───────────────────────────────────────
  // Встык два разных прогона Veo не сходятся: у героя другая поза, другой
  // объём волос, и он остаётся в движении — рез читается как «его оборвали
  // на полуслове». Короткое растворение снимает это целиком: глаз не ловит
  // границу, потому что её нет — один кадр перетекает в другой.
  const heroCat = path.join(tmp, 'hero-all.mp4');

  if (GLOS_ZEWN) {
    // Немая подложка: склеиваем только картинку, потом подкладываем голос.
    const tylkoObraz = path.join(tmp, 'hero-obraz.mp4');
    if (PRZEJSCIE > 0 && czesci.length > 1) {
      const wej = [];
      czesci.forEach((p) => wej.push('-i', p));
      const f = [];
      let poprz = '[0:v]';
      let dotad = heroSegs[0].dur;
      for (let k = 1; k < czesci.length; k++) {
        f.push(
          `${poprz}[${k}:v]xfade=transition=fade:duration=${PRZEJSCIE}:offset=${(dotad - PRZEJSCIE).toFixed(3)}[v${k}]`
        );
        poprz = `[v${k}]`;
        dotad += heroSegs[k].dur - PRZEJSCIE;
      }
      await ffmpeg([
        ...wej, '-filter_complex', f.join(';'), '-map', poprz,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-r', String(FPS),
        tylkoObraz,
      ]);
    } else {
      const lista = path.join(tmp, 'hero.txt');
      await writeFile(lista, czesci.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', tylkoObraz]);
    }
    // Голос кладём как дорожку. Если он короче картинки — добиваем тишиной,
    // её всё равно накроет подложка и «воздух» из финального микса.
    await ffmpeg([
      '-i', tylkoObraz, '-i', GLOS_ZEWN.plik,
      '-filter_complex', '[1:a]aformat=channel_layouts=stereo,apad[a]',
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest',
      heroCat,
    ]);
  } else if (PRZEJSCIE > 0 && czesci.length > 1) {
    const wej = [];
    czesci.forEach((p) => wej.push('-i', p));
    const f = [];
    let poprzedniV = '[0:v]';
    let poprzedniA = '[0:a]';
    let dotad = heroSegs[0].dur;
    for (let k = 1; k < czesci.length; k++) {
      const offset = (dotad - PRZEJSCIE).toFixed(3);
      f.push(
        `${poprzedniV}[${k}:v]xfade=transition=fade:duration=${PRZEJSCIE}:offset=${offset}[v${k}]`,
        `${poprzedniA}[${k}:a]acrossfade=d=${PRZEJSCIE}:c1=tri:c2=tri[a${k}]`
      );
      poprzedniV = `[v${k}]`;
      poprzedniA = `[a${k}]`;
      dotad += heroSegs[k].dur - PRZEJSCIE;
    }
    await ffmpeg([
      ...wej,
      '-filter_complex', f.join(';'),
      '-map', poprzedniV, '-map', poprzedniA,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19',
      '-c:a', 'aac', '-b:a', '192k', '-r', String(FPS),
      heroCat,
    ]);
  } else {
    const lista = path.join(tmp, 'hero.txt');
    await writeFile(lista, czesci.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', heroCat]);
  }

  const totalHero = czas;

  // 2. Подписи поверх героя — слова раскладываем по реальным речевым отрезкам.
  const bloki = [];
  for (const seg of heroSegs) {
    const slowa = String(seg.tekst || '').split(/\s+/).filter(Boolean);
    if (!slowa.length) continue;
    // На один речевой отрезок — своя порция слов, пропорционально его длине.
    const dlugosci = seg.runs.map(([a, b]) => b - a);
    const suma = dlugosci.reduce((s, d) => s + d, 0) || 1;
    let idx = 0;
    seg.runs.forEach(([a, b], ri) => {
      const ile =
        ri === seg.runs.length - 1
          ? slowa.length - idx
          : Math.max(1, Math.round((slowa.length * (b - a)) / suma));
      const czesc = slowa.slice(idx, idx + ile);
      idx += ile;
      if (!czesc.length) return;
      // Внутри отрезка бьём на группы по 2 слова — как в референсе.
      const grupy = [];
      for (let k = 0; k < czesc.length; k += 2) grupy.push(czesc.slice(k, k + 2).join(' '));
      const krok = (b - a) / grupy.length;
      grupy.forEach((g, gi) => {
        bloki.push({
          tekst: g,
          start: +(seg.start + a + gi * krok).toFixed(3),
          end: +(seg.start + a + (gi + 1) * krok).toFixed(3),
        });
      });
    });
  }

  // Автораскладка бьёт текст на пары слов и гонит их по кадру: получаются
  // огрызки вроде «o sobie,» и «i algorytm», которые не успеваешь прочесть и
  // которые сами по себе ничего не значат. Если в плане есть `podpisy` —
  // берём их: цельные фразы, свои тайминги, **акцент** на ключевом слове.
  const reczne = Array.isArray(plan.podpisy) && plan.podpisy.length;
  const podpisy = reczne
    ? plan.podpisy.map((p) => ({ tekst: p.tekst, start: +p.start, end: +p.end }))
    : bloki;

  // 2.5 Штампы пунктов. Пока на экране штамп — подпись прячем: два текстовых
  //     блока разом кадр не держат, читается ни один.
  const stemple = (plan.stemple || []).map((s) => ({ ...s, dlugosc: s.dlugosc ?? 1.2 }));
  const bloki2 = stemple.length
    ? podpisy.filter(
        (b) => !stemple.some((s) => b.start < s.start + s.dlugosc && b.end > s.start)
      )
    : podpisy;

  // Пока на экране титр «PO DRUGIE», подпись не должна дублировать его словом
  // «DRUGI» — одно и то же дважды в одном кадре читается как ошибка сборки.
  const oknaTytulow = (plan.tytuly || []).map((t) => ({
    a: +t.start,
    b: +t.start + (+t.dlugosc || 1.25),
  }));

  // Караоке-подпись по реальным словам вытесняет всё остальное: она точнее
  // ручной разметки и не врёт про то, что герой сказал.
  // Слова: либо из расшифровки клипов, либо готовые — из нашего же синтеза.
  const wszystkieSlowa = GLOS_ZEWN?.slowa?.length
    ? GLOS_ZEWN.slowa.map((w) => ({ tekst: w.tekst, a: +w.a, b: +w.b }))
    : heroSegs.flatMap((s) => s.slowa || []);
  const karaoke = plan.karaoke !== false && wszystkieSlowa.length > 3;
  const frazy = karaoke
    ? zbierzFrazy(wszystkieSlowa, plan.maxZnakow ?? 20, plan.maxSlow ?? 3).filter(
        (f) => !oknaTytulow.some((o) => f.a < o.b && f.b > o.a)
      )
    : [];

  const capDir = path.join(tmp, 'cap');
  await renderHtml(
    karaoke
      ? karaokeHtml(frazy, totalHero, plan.akcent || '#a78bfa')
      : podpisyHtml(bloki2, totalHero),
    totalHero,
    capDir,
    true
  );

  // ── слои поверх кадра ──────────────────────────────────────────
  // Порядок важен: подписи снизу, титр сверху. Титр перекрывает подпись,
  // если они совпали по времени, — и это правильно, читаться должно одно.
  const warstwy = [path.join(capDir, 'f%05d.png')];

  if (stemple.length) {
    const stpDir = path.join(tmp, 'stemple');
    await renderHtml(stempleHtml(stemple, totalHero), totalHero, stpDir, true);
    warstwy.push(path.join(stpDir, 'f%05d.png'));
  }

  const tytuly = (plan.tytuly || []).map((t) => ({ ...t, dlugosc: t.dlugosc ?? 1.25 }));
  if (tytuly.length) {
    const tytDir = path.join(tmp, 'tytuly');
    await renderHtml(
      tytulyHtml(tytuly, totalHero, plan.akcentPas || '#7c3aed', plan.akcent || '#a78bfa'),
      totalHero,
      tytDir,
      true
    );
    warstwy.push(path.join(tytDir, 'f%05d.png'));
  }

  const wejscia = ['-i', heroCat];
  warstwy.forEach((w) => wejscia.push('-framerate', String(FPS), '-i', w));

  // Врезки-коллажи. Собираются отдельными роликами и кладутся НЕПРОЗРАЧНО
  // поверх кадра: там, где врезка, склейки под ней не видно.
  const wstawki = [];
  for (const [i, w] of (plan.wstawki || []).entries()) {
    let plik = null;

    if (w.typ === 'wykres') {
      const dir = path.join(tmp, `wykres${i}`);
      await renderHtml(
        wykresHtml(w, w.dlugosc, plan.akcentPas || '#7c3aed', plan.akcent || '#a78bfa'),
        w.dlugosc,
        dir,
        false
      );
      plik = path.join(tmp, `wykres${i}.mp4`);
      await ffmpeg([
        '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
        '-vf', `format=yuv420p,fps=${FPS},setsar=1`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
        plik,
      ]);
      await rm(dir, { recursive: true, force: true });
    } else {
      const karty = (w.karty || []).map((k) => ({
        plik: k.plik,
        x: k.x ?? 60,
        y: k.y ?? 420,
      }));
      if (!karty.length) continue;
      plik = await zbudujKolaz(
        karty, w.dlugosc, tmp, `kolaz${i}`, plan.akcentPas || '#7c3aed'
      );
    }

    wstawki.push({ plik, start: +w.start, dlugosc: +w.dlugosc, idx: 0 });
  }
  wstawki.forEach((w) => {
    w.idx = wejscia.filter((a) => a === '-i').length;
    wejscia.push('-i', w.plik);
  });

  const filtr = [];

  // ── дрейф кадра ────────────────────────────────────────────────
  // Veo отдаёт видео с мёртвого штатива: одна дистанция, ноль дрожания.
  // Живое вертикальное видео так не выглядит никогда, и это читается
  // раньше, чем лицо. Поднимаем кадр на 6% и водим внутри этого запаса
  // двумя синусами с несовпадающими периодами — тогда движение не
  // зацикливается на глаз и похоже на съёмку с рук, а не на слайд.
  // Текстовые слои кладём ПОВЕРХ, поэтому они стоят намертво: плывёт
  // только картинка, и это ровно то, как выглядит настоящий монтаж.
  const dryf = plan.dryf ?? true;
  let baza = '[0:v]';
  if (dryf) {
    const amp = plan.dryfAmplituda ?? 13;
    filtr.push(
      `[0:v]scale=iw*1.06:ih*1.06,crop=${W}:${H}:` +
        `x='(in_w-out_w)/2+${amp}*sin(2*PI*t/7.3)':` +
        `y='(in_h-out_h)/2+${(amp * 0.7).toFixed(1)}*sin(2*PI*t/5.1+1.1)',setsar=1[dryf]`
    );
    baza = '[dryf]';
  }

  // Наезд. Кадр берём тот же самый и накладываем его же увеличенную копию —
  // источник один, рассинхрона быть не может. Окна берутся и от штампов, и
  // из `najazdy`: наезд нужен сам по себе — им бьют по ударному слову и им
  // же прикрывают склейку двух клипов, где у героя меняется причёска.
  const oknaNajazdu = [
    ...stemple.map((s) => ({ start: s.start, dlugosc: s.dlugosc })),
    ...(plan.najazdy || []).map((n) => ({ start: +n.start, dlugosc: +(n.dlugosc ?? 1.1) })),
  ];

  let biezacy = baza;
  if (oknaNajazdu.length) {
    const okna = oknaNajazdu
      .map((s) => `between(t,${s.start.toFixed(2)},${(s.start + s.dlugosc).toFixed(2)})`)
      .join('+');
    const z = (plan.najazd ?? 1.11).toFixed(3);
    filtr.push(
      `${baza}split=2[plan][zrodlo]`,
      `[zrodlo]scale=iw*${z}:ih*${z},crop=${W}:${H},setsar=1[zoom]`,
      `[plan][zoom]overlay=0:0:enable='${okna}'[poNajezdzie]`
    );
    biezacy = '[poNajezdzie]';
  }

  // Врезки ложатся ПОД подписи: голос под коллажем продолжается, значит и
  // подпись должна остаться — иначе зритель теряет строку на полторы секунды.
  // Врезка НЕ вырубается встык. Она въезжает снизу за 0.24 с и так же
  // уходит: жёсткая подмена картинки сама читается как скачок — ровно то,
  // что мы этой врезкой и лечим. Движение делает подмену событием.
  const WJAZD = plan.wjazdWstawki ?? 0.24;
  wstawki.forEach((w, k) => {
    const a = w.start;
    const b = w.start + w.dlugosc;
    const y =
      `if(lt(t,${(a + WJAZD).toFixed(2)}),` +
      `${H}*(1-pow((t-${a.toFixed(2)})/${WJAZD},0.55)),` +
      `if(gt(t,${(b - WJAZD).toFixed(2)}),` +
      `${H}*pow((t-${(b - WJAZD).toFixed(2)})/${WJAZD},1.8),0))`;
    filtr.push(
      `[${w.idx}:v]setpts=PTS-STARTPTS+${a.toFixed(2)}/TB[ins${k}]`,
      `${biezacy}[ins${k}]overlay=x=0:y='${y}':enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'` +
        `:eof_action=pass[pow${k}]`
    );
    biezacy = `[pow${k}]`;
  });

  warstwy.forEach((_, k) => {
    const ostatni = k === warstwy.length - 1;
    const wyj = ostatni ? '[v]' : `[w${k}]`;
    filtr.push(
      `${biezacy}[${k + 1}:v]overlay=0:0:format=auto` +
        (ostatni ? ',format=yuv420p' : '') +
        wyj
    );
    biezacy = wyj;
  });

  const heroPodpisany = path.join(tmp, 'hero-cap.mp4');
  await ffmpeg([
    ...wejscia,
    '-filter_complex', filtr.join(';'),
    '-map', '[v]', '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-c:a', 'copy',
    '-r', String(FPS), '-shortest',
    heroPodpisany,
  ]);

  // 3. Карточки: рисуем и вставляем ПОВЕРХ героя на заданных секундах.
  //    Звук при этом не режется — речь идёт непрерывно, меняется картинка.
  //
  //    Если у карточки нет `start`, ставим её сами. Правило из референса:
  //    врезка приходится на СЕРЕДИНУ реплики, а не на стык клипов — иначе
  //    рядом со склейкой появляется огрызок в полсекунды и монтаж рассыпается.
  const karty = rozstawKarty(plan.karty || [], heroSegs);

  let wynikV = heroPodpisany;
  for (const [i, k] of karty.entries()) {
    const dir = path.join(tmp, `karta${i}`);
    await renderHtml(kartaHtml(k, k.dlugosc), k.dlugosc, dir, false);

    const kartaMp4 = path.join(tmp, `karta${i}.mp4`);
    await ffmpeg([
      '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
      '-vf', `format=yuv420p,fps=${FPS},setsar=1`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      kartaMp4,
    ]);

    const next = path.join(tmp, `mix${i}.mp4`);
    await ffmpeg([
      '-i', wynikV, '-i', kartaMp4,
      '-filter_complex',
      `[1:v]setpts=PTS-STARTPTS+${k.start}/TB[k];` +
        `[0:v][k]overlay=0:0:enable='between(t,${k.start},${(k.start + k.dlugosc).toFixed(3)})':eof_action=pass[v]`,
      '-map', '[v]', '-map', '0:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-c:a', 'copy',
      next,
    ]);
    wynikV = next;
  }

  // 3.5 Хвостовая карточка: держится ПОСЛЕ того, как герой замолчал.
  //     Нужна, когда финальную фразу несёт типографика, а не лицо. Голос
  //     к этому моменту кончился, поэтому дорожку продлеваем тишиной —
  //     музыкальная подложка ниже накроет её и провала не будет.
  let totalWideo = totalHero;
  if (plan.ogon) {
    const o = plan.ogon;
    const dir = path.join(tmp, 'ogon');
    let logoUri = null;
    if (o.marka) {
      try {
        const b64 = (await readFile(path.join(DIR, 'logo-white.b64'), 'utf8')).replace(/\s+/g, '');
        logoUri = 'data:image/png;base64,' + b64;
      } catch {
        logoUri = null;
      }
    }
    await renderHtml(
      o.marka ? markaHtml(o, o.dlugosc, logoUri) : kartaHtml(o, o.dlugosc),
      o.dlugosc,
      dir,
      false
    );

    const ogonMp4 = path.join(tmp, 'ogon.mp4');
    await ffmpeg([
      '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-vf', `format=yuv420p,fps=${FPS},setsar=1`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-t', String(o.dlugosc),
      ogonMp4,
    ]);

    // Аутро НЕ вставляем встык: подмена всего кадра на плашку читается тем же
    // скачком, что и склейка. Он наезжает снизу — движение делает это
    // переходом, а не резом.
    const OGON_PRZ = plan.ogonPrzejscie ?? 0.4;
    const zOgonem = path.join(tmp, 'z-ogonem.mp4');

    if (OGON_PRZ > 0) {
      // ── переход в аутро, версионно-независимо ──────────────────
      // Два предыдущих подхода развалились на сборке ffmpeg из ubuntu:
      // `xfade` отдавал длину «первый вход + переход» вместо «смещение +
      // второй вход», а `tpad` вообще не удлинял дорожку. Оба раза ролик
      // выходил на три секунды короче и аутро жило меньше секунды.
      //
      // Теперь переход — ОТДЕЛЬНЫЙ клип: застывший последний кадр, поверх
      // которого выезжает аутро. Дальше три готовых файла склеиваются
      // встык. `concat` ведёт себя одинаково везде, гадать больше не о чем.
      const ostatniPng = path.join(tmp, 'ostatni-kadr.png');
      // `-sseof` с отрицательным значением местами разбирается как опция,
      // поэтому берём кадр по абсолютному времени.
      await ffmpeg([
        '-ss', Math.max(0, totalHero - 0.12).toFixed(3), '-i', wynikV,
        '-frames:v', '1', ostatniPng,
      ]);

      const przejscieMp4 = path.join(tmp, 'przejscie-ogon.mp4');
      await ffmpeg([
        '-loop', '1', '-t', String(OGON_PRZ), '-i', ostatniPng,
        '-i', ogonMp4,
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-filter_complex',
        `[0:v]fps=${FPS},scale=${W}:${H},setsar=1[tlo];` +
          `[1:v]trim=0:${OGON_PRZ},setpts=PTS-STARTPTS[og];` +
          `[tlo][og]overlay=x=0:y='${H}*(1-pow(t/${OGON_PRZ},0.6))'[v]`,
        '-map', '[v]', '-map', '2:a',
        '-t', String(OGON_PRZ),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        przejscieMp4,
      ]);

      const resztaMp4 = path.join(tmp, 'ogon-reszta.mp4');
      await ffmpeg([
        '-ss', String(OGON_PRZ), '-i', ogonMp4,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        resztaMp4,
      ]);

      // Длины МЕРЯЕМ, а не считаем: расхождение между машиной и сервером
      // трижды пряталось именно тут, и без замера его не видно.
      const dlugosci = {
        hero: await ffprobeDuration(wynikV),
        ogon: await ffprobeDuration(ogonMp4),
        przejscie: await ffprobeDuration(przejscieMp4),
        reszta: await ffprobeDuration(resztaMp4),
      };
      console.log('[awatar] части:', JSON.stringify(dlugosci));

      await ffmpeg([
        '-i', wynikV, '-i', przejscieMp4, '-i', resztaMp4,
        '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]',
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19',
        '-c:a', 'aac', '-b:a', '192k',
        zOgonem,
      ]);
      totalWideo += o.dlugosc;
    } else {
      await ffmpeg([
        '-i', wynikV, '-i', ogonMp4,
        '-filter_complex',
        '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]',
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19',
        '-c:a', 'aac', '-b:a', '192k',
        zOgonem,
      ]);
      totalWideo += o.dlugosc;
    }
    wynikV = zOgonem;
  }

  // 4. Звук: голос + подложка. Ключевое требование — ни одного провала
  //    в цифровую тишину. Подложка тихая, но непрерывная.
  const music = plan.muzyka || (await pickMusic());
  const final = path.join(OUT_DIR, `${base}.mp4`);
  await mkdir(OUT_DIR, { recursive: true });

  // Голос: чистим низ, поднимаем разборчивость и РАСТЯГИВАЕМ динамику.
  // Синтез Veo приходит с LRA 1.6-2.3 — вдвое площе живой записи (у
  // референса 4.1). Эта плоскость и есть половина ощущения «робот».
  // Экспандер тянет тихое вниз, громкое оставляет — диапазон возвращается.
  const GLOS =
    'highpass=f=85,equalizer=f=2600:t=q:w=1.1:g=2.5,' +
    'compand=attacks=0.02:decays=0.25:points=-70/-90|-40/-54|-24/-29|-12/-12|0/0';

  // Нормализация в ДВА прохода. Однопроходный loudnorm работает динамически
  // и заново сжимает то, что растянул экспандер: на входе 2.2, на выходе 1.5.
  // Сначала снимаем реальные значения, потом применяем их с linear=true —
  // это чистый сдвиг уровня, динамику не трогает.
  const zm = await zmierz(wynikV, GLOS);
  const norm = zm
    ? `loudnorm=I=${REF.lufs}:TP=${REF.truePeak}:LRA=${REF.lra}:linear=true:` +
      `measured_I=${zm.I}:measured_TP=${zm.TP}:measured_LRA=${zm.LRA}:` +
      `measured_thresh=${zm.thresh}:offset=${zm.offset}`
    : `loudnorm=I=${REF.lufs}:TP=${REF.truePeak}:LRA=${REF.lra}`;

  const cichy = plan.podkladGlosnosc ?? 0.11;
  const glosny = plan.ogon ? (plan.podkladOgon ?? 0.5) : cichy;

  // Щелчки под аутро — ровно на те же моменты, на которые встают строки.
  const czasyStukow = [];
  if (plan.ogon?.marka && plan.ogon.stuki !== false) {
    const n = plan.ogon.linie.length;
    for (let i = 0; i < n; i++) czasyStukow.push({ t: totalHero + i * KROK_MARKI, typ: 'klik' });
    czasyStukow.push({ t: totalHero + n * KROK_MARKI + 0.18, typ: 'klik' });
  }
  // Свист под каждый выезд титра — графика без звука ощущается дешёвой.
  for (const t of tytuly) czasyStukow.push({ t: t.start, typ: 'swist', glosnosc: 0.85 });
  // Врезка: свист на вход и по щелчку на каждую влетающую карточку.
  for (const w of plan.wstawki || []) {
    czasyStukow.push({ t: +w.start, typ: 'swist', glosnosc: 0.95 });
    (w.karty || []).forEach((_, i) =>
      czasyStukow.push({ t: +w.start + 0.14 + i * 0.17, typ: 'klik', glosnosc: 0.7 })
    );
  }
  const stuki = await zbudujStuki(czasyStukow, totalWideo, tmp);

  if (music) {
    const fade = Math.max(0, totalWideo - 1.4).toFixed(2);

    // «Воздух»: очень тихий непрерывный шум под всей дорожкой. Клипы Veo
    // приходят каждый со своим фоном комнаты, а между ними и на аутро фон
    // ПРОПАДАЕТ в ноль — это и слышно как щелчок перехода. Ровный воздух
    // поверх закрывает и дырку от подрезки, и разницу фонов между клипами.
    const powietrzeTlo = plan.powietrzeTlo ?? 0.022;

    const wejsciaA = ['-i', wynikV, '-i', music,
      '-f', 'lavfi', '-i', `anoisesrc=c=brown:a=${powietrzeTlo}:r=48000:d=${(totalWideo + 1).toFixed(2)}`];
    let idx = 3;
    let stukiIdx = -1;
    if (stuki) { wejsciaA.push('-i', stuki); stukiIdx = idx++; }

    const chain = [
      `[0:a]${GLOS},${norm}[voice]`,
      `[2:a]aformat=channel_layouts=stereo,highpass=f=60,lowpass=f=2400,` +
        `atrim=0:${totalWideo.toFixed(2)},asetpts=N/SR/TB,` +
        `afade=t=in:st=0:d=0.4,afade=t=out:st=${fade}:d=1.4[air]`,
      // Подложка: тихая, но непрерывная. Громче — и она поднимает пол в
      // паузах, из-за чего LRA всей дорожки схлопывается и речь читается
      // как «полка». У референса LRA 4.1, значит подложка там подшёптывает.
      // Под голосом подложка тихая, а на хвостовой карточке голоса уже нет —
      // там она выходит вперёд. Без этого хвост проваливается в тишину и
      // LRA всей дорожки улетает: замеряли 17.6 против 4.1 у референса.
      // Подъём начинаем ПОСЛЕ того, как герой замолчал, и тянем полторы
      // секунды. Раньше ramp стартовал за 0.25 с до конца речи и за 0.7 с
      // выходил на полную — музыка наезжала на последнее слово, и финал
      // читался как обрыв.
      `[1:a]atrim=0:${totalWideo.toFixed(2)},asetpts=N/SR/TB,` +
        `volume='${cichy}+(${glosny}-${cichy})*min(1,max(0,(t-${(totalHero + 0.1).toFixed(2)})/1.5))':eval=frame,` +
        `afade=t=in:st=0:d=0.5,afade=t=out:st=${fade}:d=1.4[bed]`,
    ];

    // ── музыка пригасает под голосом ───────────────────────────────
    // Просто «сделать тише» — плохое решение: в паузах подложка тогда
    // пропадает, а под речью всё равно лезет вперёд. Правильно — боковая
    // цепь: компрессор на музыке, управляемый самим голосом. Говорит —
    // музыка ушла вниз, замолчал — вернулась. Так делают в любом эфире.
    chain.push(
      '[voice]asplit=2[voiceOut][kluczDuck]',
      '[bed][kluczDuck]sidechaincompress=threshold=0.03:ratio=7:' +
        'attack=10:release=170:makeup=1:level_sc=1[bedDuck]'
    );

    const zrodla = ['[voiceOut]', '[bedDuck]', '[air]'];
    if (stuki) {
      chain.push(`[${stukiIdx}:a]volume=${plan.stukiGlosnosc ?? 0.5}[klik]`);
      zrodla.push('[klik]');
    }
    chain.push(
      // `duration=first` завязывает длину микса на дорожку голоса: если она
      // после loudnorm оказалась короче остальных, вместе с ней обрезается и
      // видео (через `-shortest`). Все входы и так подрезаны до длины ролика,
      // поэтому берём `longest` и добиваем тишиной.
      `${zrodla.join('')}amix=inputs=${zrodla.length}:normalize=0:duration=longest,` +
        `apad=whole_dur=${totalWideo.toFixed(2)},atrim=0:${totalWideo.toFixed(2)},` +
        'alimiter=limit=0.97[a]'
    );

    await ffmpeg([
      ...wejsciaA,
      '-filter_complex', chain.join(';'),
      '-map', '0:v', '-map', '[a]',
      // Без `-shortest`: длину задаём явно. `-shortest` резал ролик по самой
      // короткой дорожке, и на сервере это стабильно съедало аутро.
      '-t', totalWideo.toFixed(3),
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      final,
    ]);
    console.log(
      `[awatar] после склейки ${(await ffprobeDuration(wynikV)).toFixed(2)} с, ` +
        `в готовом ${(await ffprobeDuration(final)).toFixed(2)} с (ждали ${totalWideo.toFixed(2)})`
    );
  } else {
    await ffmpeg([
      '-i', wynikV,
      '-af', `${GLOS},${norm}`,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      final,
    ]);
  }

  await rm(tmp, { recursive: true, force: true });

  const bytes = (await readFile(final)).length;
  const planow = heroSegs.length + (plan.karty || []).length + stemple.length;
  return {
    plik: final,
    mb: +(bytes / 1048576).toFixed(2),
    sekundy: +totalWideo.toFixed(2),
    planow,
    sredniPlan: +(totalHero / planow).toFixed(2),
    podpisow: karaoke ? frazy.length : bloki2.length,
    slow: wszystkieSlowa.length,
    sklejki: heroSegs.map((s) => +s.start.toFixed(2)).slice(1),
  };
}

if (process.argv[1] && process.argv[1].endsWith('awatar-reel.mjs')) {
  const planPath = process.argv[2];
  if (!planPath) {
    console.error('node awatar-reel.mjs plan.json');
    process.exit(1);
  }
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  console.log(JSON.stringify(await zbuduj(plan), null, 1));
}
