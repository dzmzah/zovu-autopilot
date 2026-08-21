// Сливает отметки о выкладке в свежую очередь из main.
//
// Прогон выкладки редактирует `rolki/kolejka.json` и коммитит его. Если в
// это же время автопилот влил свой коммит в тот же файл, `git pull --rebase`
// падает на конфликте — и оставляет репозиторий в конфликтном состоянии, из
// которого следующие попытки цикла уже не выбираются («Pulling is not
// possible because you have unmerged files»). Так 21.08 отметка о выкладке
// не попала в main, и следующий прогон выложил тот же рилс второй раз.
//
// Текстового конфликта здесь быть не должно вовсе: наше изменение —
// не строки, а СМЫСЛ, «эта позиция выложена вот тогда». Значит и вливать
// надо смысл: берём свежий файл из main и переносим в него наши отметки.
//
//   node scal-kolejke.mjs <наша-версия.json>
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = import.meta.dirname;
const KOLEJKA = path.join(DIR, 'rolki', 'kolejka.json');

const nasza = process.argv[2];
if (!nasza) {
  console.error('нужен путь к нашей версии очереди');
  process.exit(1);
}

const [swieza, moja] = await Promise.all([
  readFile(KOLEJKA, 'utf8').then(JSON.parse),
  readFile(nasza, 'utf8').then(JSON.parse),
]);

// Ключ — имя файла: оно уникально в очереди и не меняется после постановки.
const moje = new Map(moja.map((p) => [p.plik, p]));

let przeniesione = 0;
for (const poz of swieza) {
  const m = moje.get(poz.plik);
  if (!m || !m.opublikowano) continue;
  // Чужую отметку не трогаем: если позиция уже закрыта в main, значит её
  // закрыл другой прогон, и его данные не хуже наших.
  if (poz.opublikowano) continue;
  poz.opublikowano = m.opublikowano;
  if (m.wynik) poz.wynik = m.wynik;
  przeniesione++;
}

// Позиции, которых в свежей очереди нет вовсе, дописываем: их могла добавить
// только наша же сборка, и потерять их значит потерять готовый ролик.
const znane = new Set(swieza.map((p) => p.plik));
for (const m of moja) {
  if (!znane.has(m.plik)) {
    swieza.push(m);
    przeniesione++;
  }
}

await writeFile(KOLEJKA, JSON.stringify(swieza, null, 2) + String.fromCharCode(10), 'utf8');
console.log(`[scal] перенёс отметок: ${przeniesione}, позиций в очереди: ${swieza.length}`);
