// Замеры дорожки посекундно.
//
// Средняя громкость куска — плохая мера для подложки. Захар поймал это
// дважды за один вечер: в одном ролике голос кончился и «дальше ничего не
// слышно», в другом «музыки нет вообще». Оба раза средняя по куску была
// приличной, а внутри лежала дырка: провал на две секунды до −38 дБ и
// целый трек, который тише остальных на семь децибел.
//
// Поэтому меряем ПОСЕКУНДНО и смотрим на худшую секунду. Одна дырка в
// середине слышна как обрыв, сколько бы ни было среднее.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Профиль громкости куска файла: средняя, худшая секунда и весь ряд.
 * Один проход ffmpeg: astats со сбросом раз в секунду.
 */
export async function profilGlosnosci(plik, od = 0, ile = 30) {
  try {
    // `ametadata=print:file=-` пишет в stdout, а не в stderr. На этом я и
    // споткнулся: замер молча возвращал пусто, и проверка «дырок нет»
    // означала «я ничего не измерил».
    const { stdout, stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-v', 'info', '-ss', String(od), '-t', String(ile), '-i', plik,
        '-af',
        'aresample=48000,asetnsamples=n=48000,astats=metadata=1:reset=1,' +
          'ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
        '-f', 'null', '-',
      ],
      { maxBuffer: 32 * 1024 * 1024 }
    );
    const rzad = [...String(stdout || stderr).matchAll(/RMS_level=(-?[\d.]+|-inf)/g)]
      .map((m) => (m[1] === '-inf' ? -90 : parseFloat(m[1])))
      .filter((x) => Number.isFinite(x));
    if (!rzad.length) return null;
    // Последнюю секунду отбрасываем: она почти всегда неполная и потому
    // тише остальных — по ней нельзя судить о куске.
    const bez = rzad.length > 2 ? rzad.slice(0, -1) : rzad;
    const srednia = bez.reduce((a, b) => a + b, 0) / bez.length;
    return { srednia, min: Math.min(...bez), rzad: bez };
  } catch {
    return null;
  }
}

/**
 * Выбор точки входа в трек. Кандидаты проверяются целиком, побеждает тот,
 * у которого САМАЯ ГРОМКАЯ худшая секунда — то есть кусок без провалов.
 *
 * Раньше выбор шёл по средней, и кусок с двухсекундной дыркой в середине
 * считался нормальным: средняя у него была не хуже, чем у ровного.
 */
export async function wybierzWejscie(
  plik,
  kandydaci,
  dlugoscRolki,
  dlugoscTracku,
  preferowany = null
) {
  const wyniki = [];
  for (const od of kandydaci) {
    if (od > 0 && (!dlugoscTracku || od + dlugoscRolki + 1 > dlugoscTracku)) continue;
    const p = await profilGlosnosci(plik, od, dlugoscRolki);
    if (p) wyniki.push({ od, ...p });
  }
  if (!wyniki.length) return null;
  wyniki.sort((a, b) => b.min - a.min);

  // Разнообразие важно, но не ценой дырки. Поэтому: если предпочтённый по
  // кругу кусок звучит почти так же ровно, как лучший (в пределах 3 дБ),
  // берём его — тогда один и тот же трек во второй раз звучит другой своей
  // частью. Если он заметно хуже, разнообразие уступает.
  if (preferowany !== null) {
    const p = wyniki.find((x) => x.od === preferowany);
    if (p && p.min >= wyniki[0].min - 3) return p;
  }
  return wyniki[0];
}
