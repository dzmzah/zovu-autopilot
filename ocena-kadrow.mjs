// Отбор кадров глазами. 20.10.2026 Захар: «может где-то кадры лучше
// подобрать». До этого сток выбирался только по словам в НАЗВАНИИ клипа —
// сам кадр никто не видел, и в ролик шли улыбки в офисе и рукопожатия.
//
// Теперь превью всех кандидатов уходят одним запросом в Gemini вместе с
// фразой, под которой кадр будет стоять. Модель ставит каждому оценку 0–10.
// Нет ключа, лимит, сеть — возвращаем null, и выбор идёт по-старому.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function klucz() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const raw = await readFile(path.join(import.meta.dirname, '.env'), 'utf8');
    return raw.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m)?.[1].trim() || null;
  } catch {
    return null;
  }
}

const ZASADY =
  'Jesteś montażystą krótkich pionowych filmów dla agencji marketingowej. ' +
  'Dostajesz zdanie, które lektor mówi w tej chwili, i kilka klatek ze stocku (ponumerowanych od 0). ' +
  'Oceń każdą klatkę 0–10: jak dobrze pasuje jako tło do TEGO zdania. ' +
  'Wysoko: konkretna, prawdziwa sytuacja z tematu zdania, naturalne światło, coś się dzieje, ' +
  'kadr czytelny w pionie, wygląda jak z życia, nie jak z reklamy. ' +
  'Nisko: banał stockowy (uścisk dłoni, sztuczny uśmiech do kamery, wskazywanie palcem, ' +
  'ludzie w garniturach przy laptopie bez powodu), kadr nie na temat, widoczne cudze logo lub napisy, ' +
  'zielony ekran, ciemny lub rozmazany obraz. ' +
  'Odpowiedz samym JSON: {"oceny":[{"nr":0,"ocena":7,"czemu":"krótko"}]}';

/**
 * @param {string} fraza — что звучит, пока кадр на экране
 * @param {string} zapytanie — поисковый запрос сценария (подсказка о теме)
 * @param {{id:number, podglad?:string}[]} kandydaci
 * @returns {Promise<Map<number,{ocena:number,czemu:string}> | null>} по id клипа
 */
export async function ocenKadry(fraza, zapytanie, kandydaci) {
  const key = await klucz();
  const zPodgladem = kandydaci.filter((k) => k.podglad).slice(0, 8);
  if (!key || zPodgladem.length < 2) return null;
  try {
    const obrazy = await Promise.all(
      zPodgladem.map(async (k) => {
        // Превью стока — 1200+ px; модели хватает маленького.
        const u = k.podglad.includes('?') ? k.podglad : `${k.podglad}?auto=compress&w=360`;
        const r = await fetch(u);
        if (!r.ok) throw new Error(`podgląd ${r.status}`);
        return Buffer.from(await r.arrayBuffer()).toString('base64');
      })
    );
    const parts = [{ text: `Zdanie lektora: „${fraza}”\nTemat ujęcia: ${zapytanie}` }];
    obrazy.forEach((b, nr) => {
      parts.push({ text: `Klatka ${nr}:` });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: b } });
    });
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ZASADY }] },
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
    const tekst = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const oceny = JSON.parse(tekst).oceny || [];
    const mapa = new Map();
    for (const o of oceny) {
      const k = zPodgladem[o.nr];
      if (k && Number.isFinite(+o.ocena)) mapa.set(k.id, { ocena: +o.ocena, czemu: String(o.czemu || '') });
    }
    return mapa.size ? mapa : null;
  } catch (e) {
    console.warn(`[kadry] ocena nie wyszła (${e.message}) — wybieram po nazwach`);
    return null;
  }
}
