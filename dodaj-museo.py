# Модель MUSEO из LABOCA: та же механика, свои тексты и палитра.
# Museo — приложение для музеев: наводишь камеру на картину, слышишь её историю.
import io

P = 'rolka-autoszkola-seria.mjs'
s = io.open(P, encoding='utf-8').read()

if 'const MUSEO = {' in s:
    raise SystemExit('MUSEO уже есть')

start = s.index('const LABOCA = {')
end = s.index('const LINGUA = {')
blok = s[start:end]

z = [
    ('const LABOCA = {', 'const MUSEO = {'),
    ("plik: 'LaBoca_LipFlip'", "plik: 'Museo_ScanListen'"),
    ("wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/kliniki/LaBoca_LipFlip.mp4'",
     "wyjscie: 'D:/My AI/Zovu.pl/Sprzedaz/museo/Museo_ScanListen.mp4'"),
    ("szkola: 'LA BOCA'", "szkola: 'MUSEO'"),

    # ── хук: боль посетителя, а не описание технологии
    ('GÓRNA WARGA ZNIKA PRZY UŚMIECHU?', 'STOISZ PRZED OBRAZEM'),
    ('<div id="eL1">LIP FLIP</div>', '<div id="eL1">I NIE WIESZ,</div>'),
    ("${hl('15 MINUT', 'eHl')}", "${hl('NA CO PATRZYSZ', 'eHl')}"),
    ('Bez wypełniaczy. Sama warga się unosi.',
     'Tabliczka ma trzy zdania. I tyle.'),

    # ── таблица: как это выглядит сегодня
    ('JAK TO DZIAŁA W CZASIE', 'JAK JEST TERAZ'),
    ("${wiersz(0, 'ZABIEG TRWA', '15–30 MIN')}", "${wiersz(0, 'TABLICZKA', '3 ZDANIA')}"),
    ("${wiersz(1, 'PIERWSZY EFEKT', '3–5 DNI')}", "${wiersz(1, 'AUDIOPRZEWODNIK', 'PRZY WEJŚCIU')}"),
    ("${wiersz(2, 'PEŁNY EFEKT', '10–14 DNI')}", "${wiersz(2, 'OPROWADZANIE', 'O PEŁNEJ')}"),
    ("${wiersz(3, 'UTRZYMUJE SIĘ', '3–5 MIES.')}", "${wiersz(3, 'TELEFON W RĘKU', 'ZAWSZE')}"),
    ('>JAK CZĘSTO<', '>A WYSTARCZY<'),
    ('>2–3 RAZY W ROKU<', '>SKIEROWAĆ APARAT<'),
    ('>BEZ ZWOLNIENIA<', '>I SŁUCHAĆ<'),
    ('Zaczerwienienie schodzi w kilka godzin.',
     'Obraz sam opowiada swoją historię.'),

    # ── цифры приложения
    ('<div id="ceKicker" class="kicker">LIP FLIP</div>',
     '<div id="ceKicker" class="kicker">MUSEO</div>'),
    ("${karta(0, '<span class=\"licz\" data-do=\"15\">0</span>', ' min', 'ZABIEG', false)}",
     "${karta(0, '<span class=\"licz\" data-do=\"20\">0</span>', '+', 'JĘZYKÓW', false)}"),
    ("${karta(1, '<span class=\"licz\" data-do=\"350\">0</span>', ' zł', 'OD', false)}",
     "${karta(1, '<span class=\"licz\" data-do=\"3\">0</span>', ' sek', 'ROZPOZNANIE', false)}"),
    ("${karta(2, '<span class=\"licz\" data-do=\"5\">0</span>', ' mies.', 'EFEKTU', true)}",
     "${karta(2, '<span class=\"licz\" data-do=\"0\">0</span>', ' zł', 'DLA CIEBIE', true)}"),
    ('W PRZELICZENIU NA MIESIĄC', 'TWÓJ PRZEWODNIK'),
    ('<span class="licz" data-do="70">0</span><span class="od"></span>',
     '<span class="od">w </span>KIESZENI'),
    ('i <b>zero rekonwalescencji</b>', 'i <b>zero kolejek po sprzęt</b>'),

    # ── финал
    ('MEDYCYNA ESTETYCZNA', 'SCAN · LISTEN · DISCOVER'),
    ("${hl('STAWOWA 10', 'finHl')}", "${hl('MUSEO', 'finHl')}"),
    ('Katowice · 572 663 208', 'iOS i Android'),
    ('<div class="nazwa">LA BOCA</div>', '<div class="nazwa">MUSEO</div>'),
    ('<div class="pod">CLINIC</div>', '<div class="pod">AUDIO GUIDE</div>'),
    ('<div class="miasto">KATOWICE</div>', '<div class="miasto">20+ JĘZYKÓW</div>'),
    ('<div class="www">labocaclinic.pl</div>', '<div class="www">themuseo.ai</div>'),
]

for a, b in z:
    if a not in blok:
        raise SystemExit('НЕ НАЙДЕНО: ' + a[:70])
    blok = blok.replace(a, b, 1)

# Палитра музея: тёплый песок и глубокий графит вместо винно-розового клиники.
blok = blok.replace('#2b141c 0%,#1a0d12 58%,#120709 100%', '#1b1a26 0%,#12111a 58%,#0a0910 100%')
blok = blok.replace('rgba(231,185,174,.30)', 'rgba(214,178,120,.26)')
blok = blok.replace('rgba(200,140,130,.16)', 'rgba(150,140,190,.14)')
blok = blok.replace('#e7b9ae', '#d6b278')
blok = blok.replace('#f0d3c4', '#e8cf9a')
blok = blok.replace('240,211,196', '232,207,154')
blok = blok.replace('231,185,174', '214,178,120')
blok = blok.replace('#b3766a', '#8a7bbf')

s = s[:end] + blok + s[end:]
s = s.replace('const SZKOLY = { laboca: LABOCA,', 'const SZKOLY = { museo: MUSEO, laboca: LABOCA,')

io.open(P, 'w', encoding='utf-8').write(s)
print('MUSEO добавлена')
