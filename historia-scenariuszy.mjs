// Память ленты: какой сценарий когда уже выходил.
//
// Зачем. До 31.08 обе ротации — и стоковая (rolka-auto.mjs), и рисованная
// (scenariusze-grafika.mjs) — были простым кругом по банку. Круг обходил
// только то, что ЖДЁТ в очереди, и ничего не знал о том, что уже вышло.
// Пока банк был длиннее ленты, это работало; 28-31.08 круг замкнулся, и
// девять текстов повторились дословно: 18.08→30.08, 19.08→28.08,
// 20.08→31.08. Голос при этом пишется заново, темп подбирается заново —
// поэтому со стороны это выглядит не «повтор», а «тот же ролик другим
// голосом». Захар заметил это раньше сторожа, что и есть худший вариант.
//
// Правило теперь одно: берём не «следующий по кругу», а тот, что НЕ выходил
// дольше всех. Повтор раньше тридцати дней возможен только когда банк
// физически кончился — и тогда об этом кричат и сборка, и сторож.
//
// История берётся из самой очереди, а не из отдельного файла состояния:
// очередь и есть журнал ленты, её нельзя рассинхронизировать с реальностью,
// и она переживает любую потерю state.json.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Сколько дней сценарий обязан отдыхать. Тридцать — это не круглое число:
// при одной выкладке в сутки лента за месяц показывает человеку тридцать
// разных мыслей, и повтор на тридцать первый день читается как напоминание,
// а не как «у них кончились идеи».
export const MIN_DNI = 30;

// Ключ сценария по имени исходника. Очередь хранит `zrodlo` в виде
// `auto-<ключ>.mp4`: у стоковых это имя сценария (`mit-codziennie`), у
// рисованных — с приставкой банка (`grafika-odpowiedz`). Одна форма записи
// на оба банка нужна, чтобы история была общей: лента у зрителя одна.
export function idZrodla(zrodlo) {
  if (!zrodlo) return null;
  return String(zrodlo)
    .replace(/^auto-/, '')
    .replace(/\.mp4$/, '');
}

// Когда каждый сценарий выходил в последний раз (мс эпохи).
// Запланированное, но ещё не вышедшее считается СВЕЖИМ: ролик уже собран и
// уйдёт завтра, повторять его мысль сегодня незачем.
export async function historiaScenariuszy(dir = import.meta.dirname) {
  const mapa = new Map();
  try {
    const kolejka = JSON.parse(
      await readFile(path.join(dir, 'rolki', 'kolejka.json'), 'utf8')
    );
    for (const p of kolejka) {
      const id = idZrodla(p.zrodlo);
      if (!id) continue;
      const kiedy = Date.parse(p.opublikowano || p.kiedy || '');
      if (!Number.isFinite(kiedy)) continue;
      if (!mapa.has(id) || mapa.get(id) < kiedy) mapa.set(id, kiedy);
    }
  } catch {
    // Нет очереди — значит и повторять нечего.
  }
  return mapa;
}


// Средний охват по ФОРМЕ ролика — из тех же замеров, что собирает wyniki.mjs.
//
// Зачем это здесь. Ротация берёт самый давний сценарий, а при равном возрасте
// решает порядок в банке. Пока банк пополняется, «ни разу не выходил» — это
// сразу полтора десятка сценариев с одинаковым возрастом Infinity, и тогда
// весь выбор делает случайность: кто раньше дописан в массив. Замер 26 роликов
// показал разброс в десять раз (kulisy 75 против rysowana 7,7), то есть
// порядок в массиве решает больше, чем сам монтаж.
//
// Форме верим только с двух замеров. По одному ролику средним называть нечего:
// один удачный день выглядит как открытие и уводит ленту на месяц.
export async function sredniZasiegPoFormie(dir = import.meta.dirname) {
  const wagi = new Map();
  try {
    const wyniki = JSON.parse(
      await readFile(path.join(dir, 'rolki', 'wyniki.json'), 'utf8')
    );
    const poFormie = new Map();
    for (const w of wyniki) {
      const forma = w.forma;
      const zasieg = w.dane?.reach;
      if (!forma || typeof zasieg !== 'number') continue;
      if (!poFormie.has(forma)) poFormie.set(forma, []);
      poFormie.get(forma).push(zasieg);
    }
    for (const [forma, xs] of poFormie) {
      if (xs.length < 2) continue;
      wagi.set(forma, xs.reduce((a, b) => a + b, 0) / xs.length);
    }
  } catch {
    // Нет замеров — ротация работает как раньше, по порядку банка.
  }
  return wagi;
}


// Форма последнего ролика в ленте (запланированного или вышедшего).
// Нужна ровно для одного: не пускать одну и ту же форму два дня подряд.
// Без этого предпочтение по цифрам выстраивает пять одинаковых роликов
// в ряд — охват у каждого может и вырастет, а лента станет одним шаблоном
// с подменёнными словами, то есть ровно тем, от чего мы уходили.
export async function ostatniaForma(dir = import.meta.dirname) {
  try {
    const kolejka = JSON.parse(
      await readFile(path.join(dir, 'rolki', 'kolejka.json'), 'utf8')
    );
    const zForma = kolejka.filter((p) => p.forma && (p.opublikowano || p.kiedy));
    if (!zForma.length) return null;
    zForma.sort(
      (a, b) =>
        Date.parse(b.opublikowano || b.kiedy) - Date.parse(a.opublikowano || a.kiedy)
    );
    return zForma[0].forma;
  } catch {
    return null;
  }
}

// Выбор: самый давний из свободных.
//
// `pozycje` — [{ id, idx }] в порядке банка. `zajete` — то, что уже ждёт
// выкладки (его пропускаем целиком: собирать второй ролик на ту же мысль
// бессмысленно). Если свободных нет вообще — берём из всех, потому что
// пустой день хуже повтора.
export function wybierzNajdawniejszy(pozycje, historia, zajete = new Set(), wagi = null, unikajFormy = null) {
  const wolne = pozycje.filter((p) => !zajete.has(p.id));
  const pula = wolne.length ? wolne : pozycje;
  const teraz = Date.now();
  const zWiekiem = pula.map((p) => {
    const ost = historia.get(p.id) ?? null;
    return { ...p, ost, dni: ost === null ? Infinity : (teraz - ost) / 86400000 };
  });
  // При равном возрасте — порядок банка: он задуман как последовательность
  // мыслей, и ломать его случайностью незачем.
  // При равном возрасте сначала смотрим на форму: если про неё есть цифры,
  // вперёд идёт та, которая у зрителя работает. И только потом порядок банка.
  const waga = (p) => (wagi && p.forma && wagi.has(p.forma) ? wagi.get(p.forma) : -1);
  // Штраф за повтор формы подряд идёт ПЕРЕД цифрами: лучшая форма всё равно
  // выиграет послезавтра, а лента не превратится в один шаблон.
  const kara = (p) => (unikajFormy && p.forma === unikajFormy ? 1 : 0);
  zWiekiem.sort(
    (a, b) => b.dni - a.dni || kara(a) - kara(b) || waga(b) - waga(a) || a.idx - b.idx
  );
  const wybor = zWiekiem[0];
  return {
    ...wybor,
    powtorka: wybor.dni < MIN_DNI,
    swiezych: zWiekiem.filter((x) => x.dni >= MIN_DNI).length,
  };
}

// Одна строка в лог — чтобы причина выбора была видна в ране, а не только в
// голове у того, кто писал код.
export function opiszWybor(w) {
  if (w.dni === Infinity) return `«${w.id}» — ни разу не выходил`;
  const dni = w.dni.toFixed(1);
  return w.powtorka
    ? `«${w.id}» выходил ${dni} дн. назад — БАНК КОНЧИЛСЯ, это повтор`
    : `«${w.id}» отдыхал ${dni} дн.`;
}
