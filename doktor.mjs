// Сторож автопилота: проверяет, что система ЖИВА, а не что последний ран зелёный.
//
// Зачем отдельно от run-once.mjs. Блокировку 31.07 не заметили девять дней:
// ранны были зелёные, потому что скрипт честно отрабатывал — просто без поста.
// Тревогу тогда научили кричать про блокировку Meta, но это лечение одной
// болезни. Молчание бывает и от квоты Gemini, и от протухшего токена, и от
// того, что планировщик GitHub вообще не запустил основной воркфлоу.
//
// Поэтому сторож смотрит не на причину, а на РЕЗУЛЬТАТ: вышел ли пост за
// последние сутки с небольшим. Не вышел — ран красный, письмо приходит.
// Сторож живёт в своём воркфлоу и в своё время: если основной не запустился
// вовсе, сторож всё равно проснётся и крикнет.
//
//   node doktor.mjs           — проверить и упасть, если плохо
//   node doktor.mjs --json    — то же, но отдать результат машине
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const JSON_OUT = process.argv.includes('--json');

// Сколько часов без поста считаем нормой.
//
// Считается вместе с временем запуска сторожа (12:00 UTC) и утреннего слота
// (07:00 UTC). В здоровый день сторож видит пост пятичасовой давности. Если
// утро сорвалось, вчерашний пост к полудню имеет возраст 29 часов — поэтому
// потолок в 30 промолчал бы ровно в тот день, ради которого всё и делалось,
// и крикнул бы только назавтра. 26 ловит пропуск в тот же день и при этом с
// запасом переживает щадящий режим: там сутки между постами ровно 24 часа.
const LIMIT_GODZIN = 26;

async function env(key) {
  if (process.env[key]) return process.env[key].trim();
  try {
    const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8');
    const m = raw.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.+)\\s*$', 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const wyniki = [];
// waga: 'blad' — ран красный и приходит письмо; 'uwaga' — только в логе.
function zapisz(nazwa, ok, opis, waga = 'blad') {
  wyniki.push({ nazwa, ok, opis, waga });
}

// ── 1. Когда последний раз реально вышел пост ────────────────────
// state.posted пишется ТОЛЬКО после удачной публикации, поэтому это
// единственный источник правды. Формат слота: YYYY-MM-DD-am|pm.
async function ostatniPost() {
  let s = {};
  try {
    s = JSON.parse(await readFile(path.join(import.meta.dirname, 'state.json'), 'utf8'));
  } catch {
    zapisz('state.json', false, 'nie da się odczytać state.json');
    return null;
  }
  const slot = String(s.posted || '');
  const m = /^(\d{4}-\d{2}-\d{2})-(am|pm)$/.exec(slot);
  if (!m) {
    zapisz('ostatni post', false, `state.posted wygląda dziwnie: "${slot}"`);
    return null;
  }
  // Слот отмечается по факту публикации; час берём по границе слота — так
  // оценка возраста получается консервативной, тревога не срабатывает раньше.
  const kiedy = Date.parse(`${m[1]}T${m[2] === 'am' ? '07' : '16'}:00:00Z`);
  const godzin = (Date.now() - kiedy) / 3600_000;
  const ok = godzin <= LIMIT_GODZIN;
  zapisz(
    'ostatni post',
    ok,
    ok
      ? `slot ${slot}, ${godzin.toFixed(1)} h temu`
      : `PUBLIKACJA STOI: ostatni post to slot ${slot}, czyli ${Math.floor(godzin / 24)} dni temu`
  );
  return { slot, godzin, stan: s };
}

// ── 2. Токен Instagram: жив ли и сколько ему осталось ────────────
// Проверяем ДО того, как он умрёт: 60-дневный токен продлевается каждой
// публикацией, но если публикации почему-то встали, продление встаёт тоже —
// и через два месяца всё умирает окончательно, уже без права на починку.
async function tokenInstagrama() {
  let token = null;
  try {
    const store = await import('./token-store.mjs');
    token = (await store.loadInstagramToken()).token;
  } catch (e) {
    zapisz('token Instagrama', false, 'nie da się wczytać: ' + e.message);
    return;
  }
  try {
    const r = await fetch(
      `https://graph.instagram.com/v23.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`
    );
    const j = await r.json();
    if (!r.ok || !j.id) {
      zapisz('token Instagrama', false, 'Instagram odrzuca token: ' + JSON.stringify(j).slice(0, 200));
      return;
    }
    zapisz('token Instagrama', true, `działa, konto @${j.username || j.id}`);
  } catch (e) {
    zapisz('token Instagrama', false, 'sieć nie odpowiada: ' + e.message);
  }
}

// ── 3. Токен страницы Facebook ───────────────────────────────────
// Page-токен бессрочный, но его можно отозвать сменой пароля или правами.
// Падение Facebooka не останавливает Instagram, поэтому это предупреждение.
async function tokenFacebooka() {
  const token = await env('FACEBOOK_PAGE_TOKEN');
  const pageId = (await env('FACEBOOK_PAGE_ID')) || '1104225396116061';
  if (!token) {
    zapisz('token Facebooka', false, 'brak FACEBOOK_PAGE_TOKEN', 'uwaga');
    return;
  }
  try {
    const r = await fetch(
      `https://graph.facebook.com/v23.0/${pageId}?fields=id,name&access_token=${encodeURIComponent(token)}`
    );
    const j = await r.json();
    if (!r.ok || !j.id) {
      zapisz('token Facebooka', false, 'Facebook odrzuca token: ' + JSON.stringify(j).slice(0, 200), 'uwaga');
      return;
    }
    zapisz('token Facebooka', true, `działa, strona „${j.name}"`);
  } catch (e) {
    zapisz('token Facebooka', false, 'sieć nie odpowiada: ' + e.message, 'uwaga');
  }
}

// ── 4. Gemini: есть ключ и остались ли квоты ─────────────────────
// Бесплатный тир кончается тихо: ключ рабочий, а ответ — 429. Для автопилота
// это равно «текста нет», то есть поста не будет. Проверяем самым дешёвым
// запросом, какой есть: список моделей.
async function mozgTekstowy() {
  const key = await env('GEMINI_API_KEY');
  if (!key) {
    zapisz('Gemini', false, 'brak GEMINI_API_KEY — nie ma z czego pisać tekstu');
    return;
  }
  // Спрашиваем НАСТОЯЩУЮ генерацию, а не список моделей. Список отдаётся и при
  // исчерпанной дневной квоте — то есть проверка была бы зелёной ровно в том
  // случае, ради которого её писали: ключ жив, модели на месте, а 429 на
  // генерации оставляет автопилот без текста и без поста.
  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' +
        encodeURIComponent(key),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Odpowiedz jednym słowem: tak' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5 },
        }),
      }
    );
    const j = await r.json();
    if (r.status === 429) {
      zapisz('Gemini', false, 'WYCZERPANY LIMIT dziennego darmowego tiera — autopilot nie ma z czego pisać tekstu');
      return;
    }
    if (!r.ok) {
      zapisz('Gemini', false, `generowanie nie działa (${r.status}): ` + JSON.stringify(j).slice(0, 200));
      return;
    }
    const ok = Boolean(j.candidates?.length);
    zapisz('Gemini', ok, ok ? 'generowanie działa' : 'pusta odpowiedź modelu: ' + JSON.stringify(j).slice(0, 160));
  } catch (e) {
    zapisz('Gemini', false, 'sieć nie odpowiada: ' + e.message);
  }
}

// ── 5. Pexels: живые фото в постах ───────────────────────────────
// Без ключа движок молча откатывается на генерённые фоны — те самые
// 3D-заглушки, от которых мы ушли по фидbacku Мити. Тихий откат хуже ошибки:
// посты продолжают выходить, просто в стиле, который забраковали.
async function zdjecia() {
  const key = await env('PEXELS_KEY');
  if (!key) {
    zapisz('Pexels', false, 'brak PEXELS_KEY — posty wrócą do generowanych teł', 'uwaga');
    return;
  }
  try {
    const r = await fetch('https://api.pexels.com/v1/search?query=office&per_page=1', {
      headers: { Authorization: key },
    });
    if (!r.ok) {
      zapisz('Pexels', false, `klucz nie działa (${r.status})`, 'uwaga');
      return;
    }
    const j = await r.json();
    zapisz('Pexels', Boolean(j.photos?.length), j.photos?.length ? 'klucz działa, zdjęcia się znajdują' : 'pusta odpowiedź', 'uwaga');
  } catch (e) {
    zapisz('Pexels', false, 'sieć nie odpowiada: ' + e.message, 'uwaga');
  }
}

// ── 6. Очередь: не копится ли неопубликованное ───────────────────
async function kolejka(stan) {
  let q = [];
  try {
    q = JSON.parse(await readFile(path.join(import.meta.dirname, 'pending.json'), 'utf8'));
  } catch {
    q = [];
  }
  if (!Array.isArray(q)) q = [];
  if (!q.length) {
    zapisz('kolejka', true, 'pusta — wszystko opublikowane');
    return;
  }
  // Очередь сама по себе не беда: так задумано на время блокировки. Бедой
  // становится, когда она стоит и не убывает.
  const najstarszy = q[0]?.dodano ? (Date.now() - Date.parse(q[0].dodano)) / 86400_000 : 0;
  const ok = najstarszy < 2;
  zapisz(
    'kolejka',
    ok,
    `${q.length} postów czeka, najstarszy ${najstarszy.toFixed(1)} dnia` +
      (stan?.blokadaOd ? ` (blokada od ${stan.blokadaOd})` : ''),
    'uwaga'
  );
}

// ── 7. Рилсы: есть ли чем закрыть завтрашний день ────────────────
// Сторож умел смотреть только на посты, а конвейер рилсов был для него
// невидим целиком. Значит его поломка проходила бы ровно так же, как
// блокировка 31.07: ранны зелёные, лента пустая, никто не кричит.
//
// Смотрим на РЕЗУЛЬТАТ, а не на то, отработала ли сборка: лежит ли в
// очереди неопубликованный ролик на ближайшие двое суток. Запас в два дня
// на то и заведён — если он проеден, значит сборка молчит уже день, и это
// надо знать сегодня, а не в день пустой ленты.
async function rolki() {
  let q = [];
  try {
    q = JSON.parse(
      await readFile(path.join(import.meta.dirname, 'rolki', 'kolejka.json'), 'utf8')
    );
  } catch {
    zapisz('rolki', false, 'nie da się odczytać rolki/kolejka.json');
    return;
  }
  if (!Array.isArray(q)) q = [];

  const czekaja = q
    .filter((p) => !p.opublikowano && p.kiedy)
    .map((p) => ({ plik: p.plik, kiedy: Date.parse(p.kiedy) }))
    .filter((p) => Number.isFinite(p.kiedy))
    .sort((a, b) => a.kiedy - b.kiedy);

  if (!czekaja.length) {
    zapisz('rolki', false, 'KOLEJKA ROLEK PUSTA — jutro nie ma czego opublikować');
    return;
  }

  // Здоровое состояние: сборка идёт каждый день и кладёт ролик на послезавтра,
  // значит в очереди всегда лежат ДВА — на завтра и на послезавтра. Дыра видна
  // не по числу роликов, а по ближайшему: если ближайший дальше, чем через
  // сутки с небольшим, завтрашний день пустой. Ровно так вышло 13.08, и
  // прежний сторож этого не увидел бы — он смотрел только на посты.
  const doNajblizszej = (czekaja[0].kiedy - Date.now()) / 3600_000;
  const naDwieDoby = czekaja.filter((p) => p.kiedy - Date.now() < 48 * 3600_000).length;
  const ok = doNajblizszej <= 26;
  zapisz(
    'rolki',
    ok,
    ok
      ? `${czekaja.length} w kolejce, najbliższa za ${doNajblizszej.toFixed(1)} h, na dwie doby ${naDwieDoby}`
      : `DZIURA W LENCIE: najbliższa rolka dopiero za ${doNajblizszej.toFixed(1)} h — jutro nie ma czego opublikować`
  );

  // ТикТок отдаёт идентификатор и тогда, когда ролик всего лишь доехал до
  // приложения черновиком: без аудита приложения публиковать напрямую нельзя.
  // Панель считала это выкладкой, поэтому три ролика провисели неопубликованными
  // и никто не заметил — та же тихая деградация, что стоила нам девяти дней
  // с Meta. Пусть будет видно числом.
  const szkice = q.filter((p) => /^v_inbox_file/.test(String(p.wynik?.tiktok ?? '')));
  zapisz(
    'tiktok-szkice',
    szkice.length === 0,
    szkice.length
      ? `${szkice.length} rolek czeka w aplikacji TikTok na ręczne opublikowanie`
      : 'brak nieopublikowanych szkiców',
    'uwaga'
  );

  // Buffer отвечает «принято» сразу, а публикует позже. Если ТикТок откажет,
  // пост зависнет в `scheduled` или упадёт в `error` — и мы этого не увидим,
  // потому что в очереди у нас уже стоит отметка об успехе. Это ровно та
  // тихая поломка, из-за которой три ролика провисели неделю.
  const token = await env('BUFFER_TOKEN');
  const przezBufor = q
    .filter((p) => String(p.wynik?.tiktok ?? '').startsWith('bufor:'))
    .filter((p) => Date.now() - Date.parse(p.opublikowano || p.kiedy) < 7 * 24 * 3600_000);

  if (!token || !przezBufor.length) {
    zapisz('bufor', true, token ? 'nic świeżego do sprawdzenia' : 'brak BUFFER_TOKEN', 'uwaga');
    return;
  }

  try {
    const { losPosta } = await import('./bufor.mjs');
    const zle = [];
    for (const p of przezBufor) {
      const id = String(p.wynik.tiktok).slice('bufor:'.length);
      const post = await losPosta(token, id);
      // `sent` — вышел. `sending` и `scheduled` до срока — нормально.
      const spozniony = post && post.status === 'scheduled' && Date.parse(post.dueAt) < Date.now() - 3600_000;
      if (!post || post.status === 'error' || spozniony) {
        zle.push(`${p.plik}: ${post ? post.status : 'нет такого поста'}`);
      }
    }
    zapisz(
      'bufor',
      zle.length === 0,
      zle.length
        ? `Bufor nie opublikował: ${zle.join('; ')}`
        : `${przezBufor.length} postów przez Bufor — wszystkie w porządku`
    );
  } catch (e) {
    zapisz('bufor', false, 'nie da się sprawdzić Bufora: ' + e.message.slice(0, 160), 'uwaga');
  }
}

// ── 8. ElevenLabs: остались ли символы на озвучку ────────────────
// Бесплатный тариф — 10 тысяч символов в месяц, это около сорока дублей.
// Кончатся — сборка рилса упадёт целиком, потому что подменять голос на
// Piper нельзя: Захар забраковал его как машинный. Узнать об этом надо
// заранее, а не в момент падения.
async function glos() {
  const klucz = await env('ELEVENLABS_KEY');
  if (!klucz) {
    zapisz('ElevenLabs', false, 'brak ELEVENLABS_KEY — rolki zostaną bez głosu', 'uwaga');
    return;
  }
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': klucz },
    });
    const j = await r.json();
    if (!r.ok) {
      zapisz('ElevenLabs', false, `klucz nie działa (${r.status})`, 'uwaga');
      return;
    }
    const zostalo = (j.character_limit ?? 0) - (j.character_count ?? 0);
    // Дубль на ролик — около 250 символов. Порог в пять роликов выбран не
    // наугад: столько Захару нужно, чтобы спокойно завести другой аккаунт и
    // подставить новый ключ. Поэтому тревога КРАСНАЯ — письмо приходит.
    // Строчка в логе тут не работает: логи никто не читает каждый день.
    const NA_ILE_ROLEK = 5;
    const rolek = Math.floor(zostalo / 250);
    // Квота обнуляется САМА раз в месяц, и без даты сброса тревога врёт в обе
    // стороны: «нужен новый ключ» накануне сброса — лишний час работы, а
    // спокойное «хватает» за неделю до конца лимита — день без рилса.
    // Поэтому считаем не остаток, а дотянем ли до сброса нашим темпом —
    // один ролик в сутки.
    const resetUnix = Number(j.next_character_count_reset_unix) || null;
    const doResetu = resetUnix
      ? Math.max(0, Math.ceil((resetUnix * 1000 - Date.now()) / 86400000))
      : null;
    const kiedy = resetUnix
      ? new Date(resetUnix * 1000).toISOString().slice(0, 10)
      : null;
    const dojedziemy = doResetu !== null && rolek > doResetu;
    const ok = rolek > NA_ILE_ROLEK || dojedziemy;
    const ogon = kiedy ? `, limit odnawia się ${kiedy} (za ${doResetu} dni)` : '';
    zapisz(
      'ElevenLabs',
      ok,
      ok
        ? `zostało ${zostalo} znaków (~${rolek} rolek)${ogon}`
        : `CZAS NA NOWY KLUCZ: zostało ${zostalo} znaków, starczy na ${rolek} rolek${ogon}`
    );
  } catch (e) {
    zapisz('ElevenLabs', false, 'sieć nie odpowiada: ' + e.message, 'uwaga');
  }
}

// ── 9. Запас текстов на день без модели ──────────────────────────
// Запас включается ровно тогда, когда всё остальное сломалось, — поэтому
// проверять его надо в спокойный день. Битая заготовка, найденная в момент
// её единственного применения, это тот же день без поста.
async function zapas() {
  try {
    const { sprawdzRezerwe } = await import('./content-engine.mjs');
    const zle = await sprawdzRezerwe();
    if (zle.length) {
      zapisz('Rezerwa', false, 'zapasowe teksty nie przechodzą kontroli: ' +
        zle.map((z) => `${z.gdzie} (${z.problemy.join(', ')})`).join(' | ').slice(0, 240));
      return;
    }
    zapisz('Rezerwa', true, 'zapasowe teksty gotowe — dzień bez modelu nie zostawi lenty pustej');
  } catch (e) {
    zapisz('Rezerwa', false, 'nie udało się sprawdzić zapasu: ' + e.message);
  }
}

// ── 10. Не пошла ли лента по второму кругу ───────────────────────
// Самая дорогая поломка августа была не в коде: банк сценариев кончился, и
// лента девять раз повторила текст слово в слово. Ротация чинилась, но
// проверка нужна отдельная и на РЕЗУЛЬТАТ — банк можно исчерпать снова,
// просто дописав меньше, чем выкладываем. Смотрим не на размер банка, а на
// саму ленту: вышла ли одна и та же мысль дважды за месяц.
async function powtorkiWLencie() {
  try {
    const { idZrodla, MIN_DNI } = await import('./historia-scenariuszy.mjs');
    const kolejka = JSON.parse(
      await readFile(path.join(import.meta.dirname, 'rolki', 'kolejka.json'), 'utf8')
    );
    const wyszlo = kolejka
      .filter((p) => p.opublikowano && idZrodla(p.zrodlo))
      .map((p) => ({ id: idZrodla(p.zrodlo), kiedy: Date.parse(p.opublikowano) }))
      .filter((p) => Number.isFinite(p.kiedy))
      .sort((a, b) => a.kiedy - b.kiedy);

    // Смотрим только свежий хвост: повторы августа уже разобраны, кричать о
    // них каждый день — значит приучить себя не читать эту строку.
    const OKNO_DNI = 14;
    // Повторы до 31.08 — уже разобранная история: ротация тогда не помнила
    // выложенного и честно ходила по кругу. Считать их каждый день заново
    // значит приучить себя пролистывать эту строку, а она нужна для
    // СЛЕДУЮЩЕГО раза, когда банк кончится.
    const OD_NAPRAWY = Date.parse('2026-09-01T00:00:00Z');
    const granica = Math.max(Date.now() - OKNO_DNI * 86400000, OD_NAPRAWY);
    const powtorki = [];
    for (let n = 1; n < wyszlo.length; n++) {
      if (wyszlo[n].kiedy < granica) continue;
      const wczesniej = wyszlo
        .slice(0, n)
        .filter((p) => p.id === wyszlo[n].id)
        .pop();
      if (!wczesniej) continue;
      const dni = (wyszlo[n].kiedy - wczesniej.kiedy) / 86400000;
      if (dni < MIN_DNI) powtorki.push(`${wyszlo[n].id} (co ${dni.toFixed(0)} dni)`);
    }
    if (powtorki.length) {
      zapisz(
        'bank scenariuszy',
        false,
        'lenta powtarza się: ' + powtorki.join(', ') + ' — trzeba dopisać scenariusze'
      );
      return;
    }
    zapisz('bank scenariuszy', true, `bez powtórek w ostatnich ${OKNO_DNI} dniach`);
  } catch (e) {
    zapisz('bank scenariuszy', false, 'nie udało się sprawdzić: ' + e.message, 'uwaga');
  }
}

// ── 11. Не выпала ли площадка ────────────────────────────────────
// YouTube умер 29.08 и молчал два дня: токен обновления был отозван, потому
// что экран согласия в Google Cloud остался в режиме «Testing» — там ключ
// живёт ровно семь дней. Ролики при этом выходили, значит и сторож молчал:
// он смотрел «вышел ли пост», а не «на всех ли площадках».
//
// Смотрим три последние выложенные ролики. Один промах бывает от сети,
// три подряд означают отвалившуюся площадку. Сравниваем не с фантазией, а
// с тем, что сама запись обещала в `sieci`.
async function kanalyRolek() {
  const NAZWY = { ig: 'instagram', fb: 'facebook', yt: 'youtube', tt: 'tiktok' };
  try {
    const kolejka = JSON.parse(
      await readFile(path.join(import.meta.dirname, 'rolki', 'kolejka.json'), 'utf8')
    );
    const wyszlo = kolejka
      .filter((p) => p.opublikowano && p.wynik)
      .sort((a, b) => Date.parse(a.opublikowano) - Date.parse(b.opublikowano))
      .slice(-3);
    if (wyszlo.length < 3) {
      zapisz('kanały rolek', true, 'za mało wyłożonych rolek, żeby porównywać');
      return;
    }
    const brakuje = [];
    for (const [skrot, klucz] of Object.entries(NAZWY)) {
      const oczekiwane = wyszlo.filter((p) => (p.sieci || []).includes(skrot));
      if (oczekiwane.length < 3) continue;
      const puste = oczekiwane.filter((p) => !p.wynik[klucz]);
      if (puste.length === oczekiwane.length) brakuje.push(klucz);
    }
    if (brakuje.length) {
      zapisz(
        'kanały rolek',
        false,
        'KANAŁ WYPADŁ: ' + brakuje.join(', ') + ' — trzy ostatnie rolki tam nie wyszły'
      );
      return;
    }
    zapisz('kanały rolek', true, 'ostatnie trzy rolki wyszły wszędzie, gdzie miały');
  } catch (e) {
    zapisz('kanały rolek', false, 'nie udało się sprawdzić: ' + e.message, 'uwaga');
  }
}

// ── поехали ──────────────────────────────────────────────────────
const ostatni = await ostatniPost();
await Promise.all([tokenInstagrama(), tokenFacebooka(), mozgTekstowy(), zdjecia(), glos(), zapas()]);
await kolejka(ostatni?.stan);
await rolki();
await powtorkiWLencie();
await kanalyRolek();

const bledy = wyniki.filter((w) => !w.ok && w.waga === 'blad');
const uwagi = wyniki.filter((w) => !w.ok && w.waga === 'uwaga');

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: !bledy.length, wyniki }, null, 1));
} else {
  for (const w of wyniki) {
    console.log(`${w.ok ? '  OK  ' : w.waga === 'blad' ? ' BŁĄD ' : ' UWAGA'} ${w.nazwa}: ${w.opis}`);
  }
}

// ::error:: в логе GitHub Actions — это то, что попадает в письмо и в
// аннотацию рана. Пишем ОДНОЙ строкой самое важное: человек читает
// заголовок письма, а не лог.
if (bledy.length) {
  console.log(
    '::error::ZOVU autopilot ma problem — ' + bledy.map((b) => `${b.nazwa}: ${b.opis}`).join(' | ')
  );
  process.exit(1);
}
if (uwagi.length) {
  console.log('::warning::' + uwagi.map((b) => `${b.nazwa}: ${b.opis}`).join(' | '));
}
console.log('[doktor] wszystko działa');
