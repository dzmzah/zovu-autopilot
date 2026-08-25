# Свой фон для клиники: дорожная разметка убрана (это тема автошкол),
# фиолет заменён на винно-розовый бренда La Boca, жёлтая плашка — на шампань.
import io

P = 'rolka-autoszkola-seria.mjs'
s = io.open(P, encoding='utf-8').read()

start = s.index('const LABOCA = {')
end = s.index('const LINGUA = {')
blok = s[start:end]

if 'LABOCA-TLO' in blok:
    raise SystemExit('фон уже заменён')

nakladka = """
/* ── LABOCA-TLO: клиника, а не автошкола ──────────────────────── */
.pas{display:none}
#tlo{background:linear-gradient(175deg,#2b141c 0%,#1a0d12 58%,#120709 100%)}
#lampa{background:radial-gradient(ellipse 46% 42% at 50% 45%,
  rgba(231,185,174,.30), rgba(231,185,174,0) 68%)}
#lampa2{background:radial-gradient(ellipse 40% 46% at 50% 50%,
  rgba(200,140,130,.16), rgba(0,0,0,0) 70%)}
#ziarno{opacity:.035}
.hl .nad{background:#f0d3c4;box-shadow:0 14px 34px rgba(240,211,196,.26)}
.hl .nad .in{color:#2b141c}
.kicker{color:#e7b9ae}
"""

blok = blok.replace('    const css = `', '    const css = `' + nakladka, 1)

s = s[:start] + blok + s[end:]
io.open(P, 'w', encoding='utf-8').write(s)
print('фон La Boca поставлен')
