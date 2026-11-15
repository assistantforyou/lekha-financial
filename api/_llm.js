// Provider adapter for statement extraction. Gemini (free tier) first; other providers can be added behind the same function.
const { SYSTEM_PROMPT, RESPONSE_SCHEMA } = require("./_import");

async function extractWithGemini({ mime, base64, text }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("not_configured"), { status: 503 });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const parts = text != null ? [{ text: "Statement text:\n" + text }] : [{ inline_data: { mime_type: mime, data: base64 } }];
  parts.push({ text: "Extract the holdings and cash from this statement as JSON." });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 55000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: ctl.signal,
    });
    if (!r.ok) throw Object.assign(new Error("upstream_" + r.status), { status: r.status === 429 ? 429 : 502 });
    const j = await r.json();
    const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
    if (!t) throw Object.assign(new Error(j.promptFeedback && j.promptFeedback.blockReason ? "blocked" : "empty"), { status: 502 });
    return JSON.parse(t);
  } finally { clearTimeout(timer); }
}

module.exports = { extractWithGemini };
