# Собираю модель LABOCA из LACLAVE: те же тайминги и анимации,
# но цифры Lip Flip и фирменный пудрово-розовый вместо фиолетового.
import io, re

P = 'rolka-autoszkola-seria.mjs'
s = io.open(P, encoding='utf-8').read()

start = s.index('const LACLAVE = {')
end = s.index('const LINGUA = {')
blok = s[start:end]

if 'const LABOCA = {' in s:
    raise SystemExit('LABOCA уже есть — ничего не делаю')

z = [
    ('const LACLAVE = {', 'const LABOCA = {'),
    ("plik: 'LaClave_bezterminowo'", "plik: 'LaBoca_LipFlip'"),
    ("wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/szkoly-tanca/LaClave_bezterminowo.mp4'",
     "wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/kliniki/LaBoca_LipFlip.mp4'"),
    ("szkola: 'LA CLAVE'", "szkola: 'LA BOCA'"),

    # ── хук
    ('KARNET, KTÓRY NIE PRZEPADA', 'GÓRNA WARGA ZNIKA PRZY UŚMIECHU?'),
    ('<div id="eL1">BEZ TERMINU</div>', '<div id="eL1">LIP FLIP</div>'),
    ("${hl('WAŻNOŚCI', 'eHl')}", "${hl('15 MINUT', 'eHl')}"),
    ('Chorujesz, wyjeżdżasz — wejścia czekają.',
     'Bez wypełniaczy. Sama warga się unosi.'),

    # ── таблица
    ('CZTERY SPOSOBY WEJŚCIA', 'JAK TO DZIAŁA W CZASIE'),
    ("${wiersz(0, 'START · 4 WEJŚCIA', '109 ZŁ')}", "${wiersz(0, 'ZABIEG TRWA', '15–30 MIN')}"),
    ("${wiersz(1, 'EKO · 8 WEJŚĆ', '189 ZŁ')}", "${wiersz(1, 'PIERWSZY EFEKT', '3–5 DNI')}"),
    ("${wiersz(2, 'PRO · 10 WEJŚĆ', '219 ZŁ')}", "${wiersz(2, 'PEŁNY EFEKT', '10–14 DNI')}"),
    ("${wiersz(3, 'OPEN · 4 TYGODNIE', '300 ZŁ')}", "${wiersz(3, 'UTRZYMUJE SIĘ', '3–5 MIES.')}"),
    ('>JEDNORAZOWO<', '>JAK CZĘSTO<'),
    ('>WEJŚCIE 30 ZŁ<', '>2–3 RAZY W ROKU<'),
    ('>GOTÓWKA I BLIK<', '>BEZ ZWOLNIENIA<'),
    ('Karnety Start, Eko i Pro — bezterminowe.',
     'Zaczerwienienie schodzi w kilka godzin.'),

    # ── цена
    ('<div id="ceKicker" class="kicker">KARNET PRO</div>',
     '<div id="ceKicker" class="kicker">LIP FLIP</div>'),
    ("${karta(0, '<span class=\"licz\" data-do=\"10\">0</span>', '', 'WEJŚĆ', false)}",
     "${karta(0, '<span class=\"licz\" data-do=\"15\">0</span>', ' min', 'ZABIEG', false)}"),
    ("${karta(1, '<span class=\"licz\" data-do=\"219\">0</span>', ' zł', 'ZA CAŁOŚĆ', false)}",
     "${karta(1, '<span class=\"licz\" data-do=\"350\">0</span>', ' zł', 'OD', false)}"),
    ("${karta(2, '0', ' dni', 'TERMINU', true)}",
     "${karta(2, '<span class=\"licz\" data-do=\"5\">0</span>', ' mies.', 'EFEKTU', true)}"),
    ('WYCHODZI ZA JEDNO WEJŚCIE', 'W PRZELICZENIU NA MIESIĄC'),
    ('<span class="licz" data-do="21">0</span><span class="od">,90</span>',
     '<span class="licz" data-do="70">0</span><span class="od"></span>'),
    ('i <b>żadne nie przepadnie</b>', 'i <b>zero rekonwalescencji</b>'),

    # ── финал
    ('SALSA W DWÓCH MIASTACH', 'MEDYCYNA ESTETYCZNA'),
    ("${hl('KATOWICE I GLIWICE', 'finHl')}", "${hl('STAWOWA 10', 'finHl')}"),
    ('Chorzowska 11 · Wyszyńskiego 14D', 'Katowice · 572 663 208'),
    ('<div class="nazwa">LA CLAVE</div>', '<div class="nazwa">LA BOCA</div>'),
    ('<div class="pod">SZKOŁA TAŃCA</div>', '<div class="pod">CLINIC</div>'),
    ('<div class="miasto">KATOWICE · GLIWICE</div>', '<div class="miasto">KATOWICE</div>'),
    ('<div class="www">laclave.pl</div>', '<div class="www">labocaclinic.pl</div>'),
]

for a, b in z:
    if a not in blok:
        raise SystemExit('НЕ НАЙДЕНО: ' + a[:70])
    blok = blok.replace(a, b, 1)

# Фирменный цвет клиники вместо фиолетового движка — пудрово-розовый.
blok = blok.replace('${KOLOR.jasny}', "'#e7b9ae'")
blok = blok.replace('167,139,250', '231,185,174')
blok = blok.replace('#a78bfa', '#e7b9ae')
blok = blok.replace('#7c3aed', '#b3766a')

s = s[:end] + blok + s[end:]
s = s.replace('const SZKOLY = { silesia: SILESIA,',
              'const SZKOLY = { laboca: LABOCA, silesia: SILESIA,')

io.open(P, 'w', encoding='utf-8').write(s)
print('LABOCA добавлена, строк в блоке:', blok.count(chr(10)))
