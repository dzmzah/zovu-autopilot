// Кладовая: НАШ материал вместо покупного стока.
//
// Разбор ролика, который показал Захар (`promo (marketing).mp4`, 33 с):
// двадцать одна склейка, средний план 1,6 с, и режется он не к разному
// стоку, а к разному РОДУ материала — запись экрана, рисованная вставка,
// свои съёмки с проектов, стена логотипов, общий план студии, улица.
// Постоянная там одна: подпись внизу.
//
// Наши ролики режут только к покупному стоку с чужими людьми. Отсюда и
// ощущение «живое, но слишком просто»: материал один и тот же по роду,
// сколько его ни меняй.
//
// Здесь лежит то, что снято НАМИ. Пока это фрагменты из портфолио — три
// проекта, где в кадре нет чужих подписей. Остальные работы в портфолио
// идут с вшитыми субтитрами и как подложка не годятся: чужой текст поверх
// нашего читается как ошибка сборки.
import path from 'node:path';
import { existsSync } from 'node:fs';

const DIR = import.meta.dirname;

// `rodzaj` важнее тега: он нужен, чтобы два соседних куска не оказались
// одного рода. Разнообразие — это смена РОДА, а не смена файла.
export const SPIZARNIA = [
  // Свои съёмки: барбершоп.
  { plik: 'barber-wnetrze.mp4', rodzaj: 'wlasne', tagi: /\bsalon|wnętrz|miejsc|lokal|firma|biznes\b/i },
  { plik: 'barber-praca.mp4', rodzaj: 'wlasne', tagi: /\brobot|prac|rzemios|robisz|usług|fach\b/i },
  { plik: 'barber-strzyzenie.mp4', rodzaj: 'wlasne', tagi: /\bklient|obsług|wizyt|umaw|rezerwac\b/i },

  // Свои съёмки: джелато.
  { plik: 'gelato-produkt.mp4', rodzaj: 'wlasne', tagi: /\bprodukt|zdjęci|jedzen|smak|ofert\b/i },
  { plik: 'gelato-dostawa.mp4', rodzaj: 'wlasne', tagi: /\bdostaw|zamów|wysył|kurier|paczk\b/i },
  { plik: 'gelato-klientka.mp4', rodzaj: 'wlasne', tagi: /\bludzi|klientk|kupuj|zadowol|poleca\b/i },

  // Свои съёмки: человек в кадре говорит. Это ближе всего к тому формату,
  // который Захар назвал главным, — живой человек как основа.
  { plik: 'osoba-mowi-1.mp4', rodzaj: 'osoba', tagi: /\bmów|opowiad|tłumacz|wyjaśni|pytanie\b/i },
  { plik: 'osoba-mowi-2.mp4', rodzaj: 'osoba', tagi: /\bekspert|wiedz|kurs|uczy|szkolen\b/i },
  { plik: 'osoba-mowi-3.mp4', rodzaj: 'osoba', tagi: /\bmark|wizerun|zaufan|twarz|osobist\b/i },
];

/**
 * Подбор из кладовой по смыслу фразы.
 *
 * @param {string} tekst — фраза
 * @param {Set<string>} zajete — что уже занято в этом ролике
 * @param {string|null} poprzedniRodzaj — род предыдущего куска
 */
export function zeSpizarni(tekst, zajete = new Set(), poprzedniRodzaj = null) {
  const t = String(tekst || '');
  const pasujace = SPIZARNIA.filter(
    (x) => x.tagi.test(t) && !zajete.has(x.plik) && existsSync(path.join(DIR, 'wlasne', x.plik))
  );
  if (!pasujace.length) return null;

  // Два куска одного рода подряд — это уже не разнообразие. Если есть
  // выбор, берём другой род; если нет — лучше свой материал того же рода,
  // чем чужой сток.
  const inny = pasujace.filter((x) => x.rodzaj !== poprzedniRodzaj);
  const wybor = (inny.length ? inny : pasujace)[0];
  return { plik: path.join(DIR, 'wlasne', wybor.plik), rodzaj: wybor.rodzaj, nazwa: wybor.plik };
}
