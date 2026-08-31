// Текст ролика Nootri в одном месте: его читают и синтез голоса, и сборка.
// Держать два списка в двух файлах — верный способ развести подписи и звук.
//
// `tekst` — на экран, `mowa` — в ухо. Разные тексты, и это норма: Google
// на каждой точке даёт завершающую интонацию, поэтому диктору нужна связная
// речь, а подписям — рубленые куски.
export const FRAZY = [
  // `tekst` — то, что на экране. `mowa` — то, что в ухе. Это РАЗНЫЕ тексты,
  // и это норма: подписи живут рублеными, диктор ведёт одну мысль до конца.
  // Причина не вкусовая: Google на каждой точке даёт ЗАВЕРШАЮЩУЮ интонацию,
  // и дубль, собранный из отдельных предложений, звучит роботом — Захар
  // забраковал ровно это («полная хуйня»). Точки внутри фраз были лекарством
  // от скороговорки ElevenLabs, здесь они вредны.
  { tekst: 'Zadzwoniłem do żony. O dwudziestej trzeciej.', mowa: 'Zadzwoniłem do żony o dwudziestej trzeciej,', rola: 'hak', pauza: 0.3 },
  { tekst: 'Telefon odebrał. Dwudziestosiedmiolatek.', mowa: 'a telefon odebrał jakiś dwudziestosiedmiolatek.', rola: 'hak', pauza: 0.45 },
  { tekst: 'Zapytał, czy to ja jestem tym dziadkiem.', mowa: 'Zapytał, czy to ja jestem tym dziadkiem, o którym mówiła.', rola: 'tresc', pauza: 0.4 },
  { tekst: 'Nie krzyczałem. Usiadłem w kuchni.', mowa: 'Nie krzyczałem, po prostu usiadłem w kuchni,', rola: 'tresc', pauza: 0.35 },
  { tekst: 'A dziś. Piętnaście kilo więcej niż w dniu ślubu.', mowa: 'bo dziś mam piętnaście kilo więcej niż w dniu ślubu.', rola: 'tresc', pauza: 0.45 },
  { tekst: 'Po czterdziestce kortyzol w górę. Testosteron w dół.', mowa: 'Trener wytłumaczył mi, że po czterdziestce kortyzol idzie w górę, a testosteron w dół,', rola: 'tresc', pauza: 0.35 },
  { tekst: 'To nie brak silnej woli. To hormony.', mowa: 'więc to nie jest brak silnej woli, tylko hormony.', rola: 'tresc', pauza: 0.45 },
  { tekst: 'Jedna filiżanka kawy grzybowej.', mowa: 'Zamiast zwykłej kawy piję teraz jedną filiżankę kawy grzybowej:', rola: 'tresc', pauza: 0.3 },
  { tekst: 'Ashwagandha na kortyzol. Lion’s mane na mgłę.', mowa: 'ashwagandha na kortyzol, lion’s mane na mgłę w głowie.', rola: 'tresc', pauza: 0.45 },
  { tekst: 'Szósty tydzień. Koszula sprzed pięciu lat.', mowa: 'W szóstym tygodniu założyłem koszulę sprzed pięciu lat.', rola: 'tresc', pauza: 0.45 },
  { tekst: 'Wróciła po swoje pudła.', mowa: 'Wróciła po swoje pudła', rola: 'tresc', pauza: 0.3 },
  { tekst: 'Zapytała, co ja ze sobą zrobiłem.', mowa: 'i zapytała, co ja ze sobą zrobiłem.', rola: 'tresc', pauza: 0.45 },
  { tekst: 'Jeden kubek każdego ranka.', mowa: 'Jeden kubek każdego ranka.', rola: 'cta' },
];
