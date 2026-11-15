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
    try { return JSON.parse(t); } catch (e) { throw Object.assign(new Error("bad_json"), { status: 502 }); }
  } catch (e) {
    if (e && e.name === "AbortError") throw Object.assign(new Error("aborted"), { status: 502 });
    throw e;
  } finally { clearTimeout(timer); }
}

module.exports = { extractWithGemini };

// Generic structured-JSON call (no tools, no web access): used where the facts are supplied in the prompt.
async function generateJson({ system, user, schema, timeoutMs = 55000 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("not_configured"), { status: 503 });
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schema },
      }),
      signal: ctl.signal,
    });
    if (!r.ok) throw Object.assign(new Error("upstream_" + r.status), { status: r.status === 429 ? 429 : 502 });
    const j = await r.json();
    const p = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    const t = p && p[0] && p[0].text;
    if (!t) throw Object.assign(new Error("empty"), { status: 502 });
    try { return JSON.parse(t); } catch (e) { throw Object.assign(new Error("bad_json"), { status: 502 }); }
  } catch (e) {
    if (e && e.name === "AbortError") throw Object.assign(new Error("aborted"), { status: 502 });
    throw e;
  } finally { clearTimeout(timer); }
}
module.exports.generateJson = generateJson;
