// Настоящее время фраз и слов в дубле — вместо раскладки по слогам.
//
// 20.10.2026 Захар: «почти везде текст немного опережает голос». Замер на
// пробе это подтвердил: границы фраз считались пропорционально слогам, а
// новый голос (Iapetus, подача «przy kawie») делает паузы по 1,3–1,8 с
// между мыслями. Раскладка их не видит, и к концу ролика подпись уходила
// вперёд на 0,8–1,2 с.
//
// Поэтому дубль расшифровывается (faster-whisper, wyrownaj.py), и слова
// сценария ставятся на распознанные слова выравниванием последовательностей.
// Распознанный текст нам не нужен — только время: «czy» вместо «trzy» встаёт
// на своё место как замена, и время у него верное.
//
// Нет python-пакета или модели — честно возвращаем null, и наверху остаётся
// раскладка по слогам. Ролик это не роняет.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const DIR = import.meta.dirname;

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/[^\p{L}\p{N}]/gu, '');

function podobienstwo(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// Слова сценария (s) против распознанных (r): Нидлман–Вунш. Замена допустима —
// это то самое «czy» вместо «trzy»; пропуск дороже замены. Плюс склейки:
// whisper слышит «Potem» как «Po tym» (одно слово — два) и наоборот.
// Результат: для каждого слова сценария — отрезок распознанных [j0, j1]
// и доля этого отрезка [u0, u1] (при склейке двух слов сценария в одно).
function dopasuj(s, r) {
  const m = s.length, n = r.length;
  const GAP = -0.6;
  const zysk = (p) => (p >= 0.5 ? 1 + p : p - 0.4);
  const wynik = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
  const skad = Array.from({ length: m + 1 }, () => new Uint8Array(n + 1));
  for (let i = 1; i <= m; i++) { wynik[i][0] = i * GAP; skad[i][0] = 1; }
  for (let j = 1; j <= n; j++) { wynik[0][j] = j * GAP; skad[0][j] = 2; }
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const opcje = [
        [wynik[i - 1][j - 1] + zysk(podobienstwo(s[i - 1], r[j - 1])), 0],
        [wynik[i - 1][j] + GAP, 1],
        [wynik[i][j - 1] + GAP, 2],
      ];
      // одно слово сценария = два распознанных
      if (j > 1) opcje.push([wynik[i - 1][j - 2] + zysk(podobienstwo(s[i - 1], r[j - 2] + r[j - 1])) + 0.1, 3]);
      // два слова сценария = одно распознанное
      if (i > 1) opcje.push([wynik[i - 2][j - 1] + zysk(podobienstwo(s[i - 2] + s[i - 1], r[j - 1])) * 2 + 0.1, 4]);
      let best = opcje[0];
      for (const o of opcje) if (o[0] > best[0]) best = o;
      wynik[i][j] = best[0];
      skad[i][j] = best[1];
    }
  const para = new Array(m).fill(null);
  let i = m, j = n;
  while (i > 0 || j > 0) {
    const k = i > 0 && j > 0 ? skad[i][j] : i > 0 ? 1 : 2;
    if (k === 0) {
      if (podobienstwo(s[i - 1], r[j - 1]) >= 0.3) para[i - 1] = { j0: j - 1, j1: j - 1, u0: 0, u1: 1 };
      i--; j--;
    } else if (k === 3) {
      para[i - 1] = { j0: j - 2, j1: j - 1, u0: 0, u1: 1 };
      i--; j -= 2;
    } else if (k === 4) {
      const d = s[i - 2].length / Math.max(1, s[i - 2].length + s[i - 1].length);
      para[i - 2] = { j0: j - 1, j1: j - 1, u0: 0, u1: d };
      para[i - 1] = { j0: j - 1, j1: j - 1, u0: d, u1: 1 };
      i -= 2; j--;
    } else if (k === 1) i--;
    else j--;
  }
  return para;
}

async function cisze(plik, prog = -38, min = 0.12) {
  const { stderr } = await execFileAsync(
    'ffmpeg',
    ['-v', 'info', '-i', plik, '-af', `silencedetect=n=${prog}dB:d=${min}`, '-f', 'null', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  const starty = [...stderr.matchAll(/silence_start:\s*(-?[0-9.]+)/g)].map((m) => Math.max(0, +m[1]));
  const konce = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => +m[1]);
  return starty.map((od, k) => ({ od, doo: konce[k] ?? null }));
}

async function trwanie(plik) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', plik,
  ]);
  return +stdout.trim();
}

// ── длинные паузы ─────────────────────────────────────────────────
// Подача «z zawahaniami» живая, но паузы по полторы секунды в коротком видео —
// это место, где зритель смахивает, и провал звука, на котором проверка
// бракует сборку. Режем ТОЛЬКО внутри тишины: от каждой длинной паузы
// остаётся `zostaw` секунд, края речи не трогаем. Стык в тишине не слышен —
// в отличие от стыков посреди слова, которые Захар услышал как «лагает».
export async function skrocPauzy(plik, { dluzszeNiz = 0.62, zostaw = 0.42 } = {}) {
  const calosc = await trwanie(plik);
  const dziury = (await cisze(plik, -40, dluzszeNiz)).filter(
    (c) => c.doo != null && c.od > 0.05 && c.doo < calosc - 0.05
  );
  if (!dziury.length) return 0;
  const zostaje = [];
  let od = 0;
  let wycieto = 0;
  for (const c of dziury) {
    const polowa = zostaw / 2;
    zostaje.push([od, c.od + polowa]);
    wycieto += c.doo - c.od - zostaw;
    od = c.doo - polowa;
  }
  zostaje.push([od, calosc]);
  const kawalki = zostaje
    .map(([a, b], k) => `[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS[k${k}]`)
    .join(';');
  const sklej = zostaje.map((_, k) => `[k${k}]`).join('') + `concat=n=${zostaje.length}:v=0:a=1[out]`;
  const tmp = plik.replace(/(\.\w+)$/, '-krotsze$1');
  await execFileAsync('ffmpeg', [
    '-v', 'error', '-y', '-i', plik, '-filter_complex', `${kawalki};${sklej}`, '-map', '[out]', tmp,
  ]);
  await copyFile(tmp, plik);
  await rm(tmp, { force: true });
  console.log(
    `[glos] длинных пауз: ${dziury.length} (${dziury.map((c) => (c.doo - c.od).toFixed(2)).join(', ')} с) — ` +
      `ужал до ${zostaw} с, ролик короче на ${wycieto.toFixed(2)} с`
  );
  return wycieto;
}

function python() {
  if (process.env.PYTHON) return process.env.PYTHON;
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Время фраз и слов в дубле.
 * @param {string} plik — дубль (wav)
 * @param {string[][]} slowaFraz — слова сценария по фразам, как их ПРОИЗНОСЯТ
 * @returns {Promise<null | {granice: [number,number][], slowa: {a:number,b:number}[][], trafien: number}>}
 */
export async function wyrownaj(plik, slowaFraz) {
  const wyj = plik + '.slowa.json';
  try {
    await execFileAsync(python(), [path.join(DIR, 'wyrownaj.py'), plik, wyj], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 6 * 60 * 1000,
    });
  } catch (e) {
    console.warn(`[glos] whisper недоступен (${String(e.message).split('\n')[0].slice(0, 120)}) — остаюсь на слогах`);
    return null;
  }
  const r = JSON.parse(await readFile(wyj, 'utf8'));
  await rm(wyj, { force: true });

  const plaskie = slowaFraz.flatMap((f, i) => f.map((w) => ({ w, i })));
  const S = plaskie.map((x) => norm(x.w));
  const R = r.map((x) => norm(x.w));
  const para = dopasuj(S, R);
  const trafien = para.filter(Boolean).length / Math.max(1, S.length);
  if (trafien < 0.55) {
    console.warn(`[glos] whisper услышал другое (совпало ${(trafien * 100).toFixed(0)} %) — остаюсь на слогах`);
    return null;
  }

  // Время каждого слова сценария: из пары, иначе интерполяция по буквам между
  // соседями с известным временем.
  const czasy = plaskie.map((_, k) => {
    const p = para[k];
    if (!p) return null;
    const a = r[p.j0].a, b = r[p.j1].b;
    return { a: a + (b - a) * p.u0, b: a + (b - a) * p.u1 };
  });
  const calosc = await trwanie(plik);
  for (let k = 0; k < czasy.length; k++) {
    if (czasy[k]) continue;
    let p = k - 1;
    while (p >= 0 && !czasy[p]) p--;
    let n = k + 1;
    while (n < czasy.length && !czasy[n]) n++;
    const od = p >= 0 ? czasy[p].b : 0;
    const doo = n < czasy.length ? czasy[n].a : calosc;
    const grupa = plaskie.slice(p + 1, n);
    const wagi = grupa.map((x) => Math.max(1.6, norm(x.w).length));
    const suma = wagi.reduce((a, b) => a + b, 0);
    let t = od;
    for (let q = p + 1; q < n; q++) {
      const d = ((doo - od) * wagi[q - p - 1]) / suma;
      czasy[q] = { a: t, b: t + d };
      t += d;
    }
  }
  // Монотонность: whisper иногда даёт двум словам одно и то же начало.
  for (let k = 1; k < czasy.length; k++) {
    if (czasy[k].a < czasy[k - 1].a) czasy[k].a = czasy[k - 1].a;
    if (czasy[k].b < czasy[k].a + 0.04) czasy[k].b = czasy[k].a + 0.04;
  }

  // Начало слова у whisper гуляет на 0,1–0,2 с. Конец паузы перед ним, если
  // он рядом, — точнее: это и есть момент, когда звучит первый звук.
  const ciszy = (await cisze(plik, -38, 0.1)).filter((c) => c.doo != null);
  const dociagnij = (t) => {
    const c = ciszy.find((c) => c.doo >= t - 0.35 && c.doo <= t + 0.12);
    return c ? c.doo : t;
  };

  const slowa = slowaFraz.map(() => []);
  plaskie.forEach((x, k) => slowa[x.i].push({ a: czasy[k].a, b: czasy[k].b }));
  slowa.forEach((f) => { if (f.length) f[0].a = dociagnij(f[0].a); });
  const granice = slowa.map((f, i) => {
    const a = f[0].a;
    const nast = slowa[i + 1]?.[0]?.a;
    // Фраза держится до начала следующей — на экране подпись не должна
    // гаснуть в паузе посреди мысли.
    const b = nast != null ? Math.max(a + 0.15, nast) : Math.max(a + 0.15, f.at(-1).b);
    return [+a.toFixed(3), +b.toFixed(3)];
  });
  return { granice, slowa, trafien };
}
