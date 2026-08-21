// Стикеры поверх живого кадра.
//
// Захар 22.08: «надо разбавлять живые видосы, где люди, анимациями — типа
// выезжающими стикерами. Но остаться в этой реальности и не скатиться в
// чрезмерную простоту, надо чувствовать грань».
//
// Грань здесь проходит по трём правилам, и они важнее самой анимации:
//
//  1. НЕ НА КАЖДУЮ ФРАЗУ. Больше двух стикеров на ролик — это уже не приём,
//     а мультик поверх съёмки. Живой кадр должен остаться главным.
//  2. ТОЛЬКО ПО СМЫСЛУ. Если для фразы нет предмета, который её называет,
//     стикера нет вовсе. Случайная картинка сбоку хуже пустого места:
//     зритель ищет в ней смысл и не находит.
//  3. СБОКУ И ВЫШЕ ПОДПИСИ. Подпись живёт снизу, лицо — в середине. Стикер
//     идёт в верхнюю треть и к краю, иначе он спорит и с тем, и с другим.
//
// Предметы — те же Fluent Emoji 3D, что и в рисованных роликах: один набор
// на оба типа, иначе лента распадается на два разных мира.

// Слово во фразе → предмет. Первое совпадение выигрывает, поэтому порядок
// не случайный: сначала узкие понятия, потом общие.
const SLOWNIK = [
  [/\bczas|godzin|minut|tydzień|tygodn|miesiąc|dzień|dni\b/i, 'alarm_clock_3d'],
  [/\bsekund|szybko|natychmiast|zaraz\b/i, 'stopwatch_3d'],
  [/\bcen|kosztuje|złot|zł|budżet|płac|pieniądz|drogo|tanio\b/i, 'money_bag_3d'],
  [/\bzarab|zysk|sprzeda|klient.*płac|wycen\b/i, 'money_with_wings_3d'],
  [/\bzasięg|wzrost|rośnie|więcej|statystyk|wynik\b/i, 'chart_increasing_3d'],
  [/\bwykres|liczb|dane|procent\b/i, 'bar_chart_3d'],
  [/\bpomysł|pomysłów|wymyśl|kreatyw|inspirac\b/i, 'light_bulb_3d'],
  [/\bwiadomoś|napis|odpisz|odpowiedz|dm\b/i, 'envelope_3d'],
  [/\btelefon|profil|opis|bio|instagram|rolk|post|feed|ekran\b/i, 'mobile_phone_3d'],
  [/\bkalendarz|plan|harmonogram|rozkład|regularn\b/i, 'calendar_3d'],
  [/\bbłąd|błęd|źle|nie działa|traci|strat\b/i, 'cross_mark_3d'],
  [/\bdobrze|działa|gotow|zrobion|efekt\b/i, 'check_mark_button_3d'],
  [/\bmyśl|zastanaw|pytanie|dlaczego|czemu\b/i, 'thinking_face_3d'],
  [/\bpatrz|widz|ogląda|zobacz|uwag\b/i, 'eyes_3d'],
  [/\bszybciej|start|rusz|zaczyn|nowy\b/i, 'rocket_3d'],
  [/\blaptop|strona|www|sajt|komputer\b/i, 'laptop_3d'],
];

/** Предмет под фразу или null, если ничего не подошло по смыслу. */
export function dobierzNaklejke(tekst) {
  const t = String(tekst || '');
  for (const [re, plik] of SLOWNIK) if (re.test(t)) return plik;
  return null;
}

/**
 * Раскладка стикеров по фразам ролика.
 *
 * @param {Array<{tekst:string, rola:string}>} czesci — куски сценария
 * @param {Array<{a:number,b:number}>} frazy — их время в озвучке
 * @param {number} maks — сколько стикеров максимум (грань: два)
 */
export function rozlozNaklejki(czesci, frazy, maks = 2) {
  const kandydaci = [];
  for (const [i, c] of czesci.entries()) {
    // Хук и призыв не трогаем: в хуке всё внимание на первую мысль, в
    // призыве — на то, что человек должен сделать.
    if (c.rola === 'hak' || c.rola === 'cta') continue;
    const f = frazy[i];
    if (!f) continue;
    const plik = dobierzNaklejke(`${c.tytul || ''} ${c.tekst || ''}`);
    if (!plik) continue;
    kandydaci.push({ i, plik, a: f.a, b: frazy[i + 1]?.a ?? f.b });
  }

  // Из подошедших берём равномерно по ролику, а не первые подряд: два
  // стикера в начале и пусто дальше — это не разнообразие, а комок.
  if (kandydaci.length <= maks) return oznacz(kandydaci);
  const krok = (kandydaci.length - 1) / (maks - 1 || 1);
  const wybrane = [];
  for (let k = 0; k < maks; k++) wybrane.push(kandydaci[Math.round(k * krok)]);
  return oznacz([...new Set(wybrane)]);
}

// Стороны чередуются: два стикера подряд с одного края читаются как ошибка
// вёрстки, а не как приём.
function oznacz(lista) {
  return lista.map((n, k) => ({
    // Имя файла с расширением: движок читает его прямо с диска.
    plik: n.plik.endsWith('.png') ? n.plik : n.plik + '.png',
    start: +(n.a - 0.10).toFixed(2),
    dlugosc: +Math.min(2.6, Math.max(1.4, n.b - n.a + 0.2)).toFixed(2),
    strona: k % 2 === 0 ? 'prawo' : 'lewo',
  }));
}
