// Gemini через Google Cloud (Vertex AI) — теми же ключами, что и голос.
//
// Зачем отдельно от ключа Gemini. Бесплатная квота ключа общая на весь
// автопилот, и на ней пишутся тексты постов. 20.10 отбор кадров и генератор
// сценариев выбрали её к обеду, и сторож покраснел: «nie ma z czego pisać
// tekstu». У облака дневного потолка нет, платится из пробного кредита
// (до 30.11.2026); наши запросы — центы.

let token = null;

async function dostep() {
  if (token && token.do > Date.now() + 60000) return token.t;
  const { GCP_CLIENT_ID: id, GCP_CLIENT_SECRET: sekret, GCP_REFRESH_TOKEN: odswiez } = process.env;
  if (!id || !sekret || !odswiez || !process.env.GCP_PROJECT) throw new Error('нет ключей Google Cloud');
  const j = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: sekret, refresh_token: odswiez, grant_type: 'refresh_token' }),
  }).then((r) => r.json());
  if (!j.access_token) throw new Error('токен Google: ' + JSON.stringify(j).slice(0, 160));
  token = { t: j.access_token, do: Date.now() + (j.expires_in || 3600) * 1000 };
  return token.t;
}

/**
 * @param {{model?:string, system:string, parts:object[], temperatura?:number, json?:boolean}} o
 * @returns {Promise<string>} текст ответа
 */
export async function vertex({ model = 'gemini-2.5-flash', system, parts, temperatura = 0.4, json = true }) {
  const projekt = process.env.GCP_PROJECT;
  for (let proba = 0; ; proba++) {
    const r = await fetch(
      `https://aiplatform.googleapis.com/v1/projects/${projekt}/locations/global/publishers/google/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await dostep()}`, 'x-goog-user-project': projekt },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: temperatura, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }),
      }
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok) return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    // 429 у облака — «нет свободной мощности» в общем пуле, проходит за секунды.
    if ((r.status === 429 || r.status === 503) && proba < 2) {
      await new Promise((res) => setTimeout(res, 15000 * (proba + 1)));
      continue;
    }
    throw new Error(`Vertex ${model} ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  }
}
