// Список польских мужских голосов из библиотеки ElevenLabs — С ПОМЕТКОЙ,
// разрешён ли голос бесплатному тарифу.
//
// Зачем отдельный шаг. Выбранный на слух `Adrian - Soft & Breezy Casual`
// оказался закрыт для free: и синтез, и добавление в библиотеку отвечают
// 400 free_users_not_allowed. Пробы при этом сгенерировались (старый аккаунт
// был другим), поэтому вслепую выбирать больше нельзя — сначала смотрим,
// что нам вообще разрешено, и только потом слушаем.
//
// Синтеза здесь нет: символы не тратятся.
//
//   node glosy-lista.mjs
const klucz = process.env.ELEVENLABS_KEY;
if (!klucz) throw new Error('нет ELEVENLABS_KEY');

const r = await fetch(
  'https://api.elevenlabs.io/v1/shared-voices?page_size=60&language=pl&gender=male',
  { headers: { 'xi-api-key': klucz } }
);
if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
const j = await r.json();

const wiersze = (j.voices || []).map((v) => ({
  nazwa: v.name,
  id: v.voice_id,
  free: v.free_users_allowed !== false,
  wiek: v.age || '',
  opis: (v.descriptive || v.description || '').slice(0, 40),
  zastosowanie: v.use_case || '',
}));

console.log(`[glosy] всего польских мужских: ${wiersze.length}, из них бесплатному тарифу доступны ${wiersze.filter((w) => w.free).length}`);
for (const w of wiersze) {
  console.log(
    `${w.free ? 'FREE' : 'PLAT'}  ${String(w.nazwa).padEnd(34)} ${w.id}  ${w.wiek.padEnd(12)} ${w.zastosowanie.padEnd(18)} ${w.opis}`
  );
}

// Что аккаунт может использовать УЖЕ СЕЙЧАС. Бесплатный тариф не пускает
// библиотечные голоса через API вообще («Free users cannot use library voices
// via the API»), но добавленные в свои голоса работают — именно так это было
// на старом аккаунте. Поэтому список «моих» важнее списка библиотеки.
const moje = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': klucz } });
if (moje.ok) {
  const lista = (await moje.json()).voices || [];
  console.log(`[glosy] в аккаунте своих голосов: ${lista.length}`);
  for (const v of lista) {
    console.log(`  ${String(v.name).padEnd(30)} ${v.voice_id}  ${v.category || ''} ${(v.labels?.language || '')}`);
  }
} else {
  console.log(`[glosy] свои голоса недоступны: ${moje.status}`);
}
