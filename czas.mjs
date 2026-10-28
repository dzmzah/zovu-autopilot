// Время слотов по Варшаве с учётом перевода часов.
//
// До 28.10.2026 do-kolejki.mjs писал слоты с жёстким «+02:00» (летнее время).
// С 25.10 в Польше +01:00, и «13:00» выходило в 12:00. Смещение теперь
// считается для каждой даты через Intl (Europe/Warsaw, longOffset).
export function offsetWarszawy(data, godz = 12) {
  // Полдень UTC этой даты — заведомо не на границе перевода часов (он в 01–03 UTC).
  const probe = new Date(`${data}T${String(godz).padStart(2, '0')}:00:00Z`);
  const czesc = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+01:00';
  const m = czesc.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] || '00'}` : '+01:00';
}

// Дата YYYY-MM-DD по Варшаве для момента `d`.
export const dataWarszawy = (d = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);

// «2026-10-30» + 13 → «2026-10-30T13:00:00+01:00».
export function slotWarszawa(data, godz) {
  const g = String(godz).padStart(2, '0');
  return `${data}T${g}:00:00${offsetWarszawy(data, godz)}`;
}
