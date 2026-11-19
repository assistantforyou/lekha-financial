// AI provider adapter. Primary: Z.ai (OpenAI-compatible chat API; GLM Flash models are free, GLM-OCR is $0.03/1M tokens).
// Fallback: Google Gemini (existing key). Every call logs token usage and cost to pt_costs (no content is logged).
//
// Env:
//   ZAI_API_KEY                         Z.ai key (https://z.ai/manage-apikey/apikey-list)
//   LLM_TEXT_MODEL   default glm-4.6v-flash   statement text -> JSON
//   LLM_VISION_MODEL default glm-4.6v-flash   statement image -> JSON
//   LLM_OCR          "1" to OCR images/PDFs with glm-ocr first (needs a Z.ai balance)
//   NEWS_MODEL       default glm-4.6v-flash   news briefing (fastest free model in tests)
//   GEMINI_API_KEY, GEMINI_MODEL (default gemini-3.5-flash-lite)   fallback
const { SYSTEM_PROMPT, RESPONSE_SCHEMA } = require("./_import");
const { logUsage } = require("./_costs");

const ZAI = "https://api.z.ai/api/paas/v4";
const GEMINI_DEFAULT = "gemini-3.5-flash-lite"; // gemini-3.5-flash was deprecated 2026-10-08
const DEPRECATED = new Set(["gemini-3.5-flash", "gemini-2.5-flash"]);
const geminiModel = () => (process.env.GEMINI_MODEL && !DEPRECATED.has(process.env.GEMINI_MODEL) ? process.env.GEMINI_MODEL : GEMINI_DEFAULT);
const err = (msg, status) => Object.assign(new Error(msg), { status });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gemini's OpenAPI-subset schema (uppercase types, nullable) -> plain JSON Schema for prompts / OpenAI-style APIs.
function toJsonSchema(s) {
  if (!s || typeof s !== "object") return s;
  const out = {};
  const t = s.type ? String(s.type).toLowerCase() : undefined;
  if (t) out.type = s.nullable ? [t, "null"] : t;
  if (s.enum) out.enum = s.enum;
  if (s.properties) { out.properties = {}; for (const [k, v] of Object.entries(s.properties)) out.properties[k] = toJsonSchema(v); }
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.required) out.required = s.required;
  if (s.minItems != null) out.minItems = s.minItems;
  if (s.maxItems != null) out.maxItems = s.maxItems;
  return out;
}

// Models sometimes wrap JSON in prose or code fences: take the outermost {...}.
function parseJsonLoose(t) {
  const s = String(t || "");
  try { return JSON.parse(s); } catch (e) { /* fall through */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  throw err("bad_json", 502);
}

async function timed(url, init, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  catch (e) { throw err(e && e.name === "AbortError" ? "aborted" : "network", 502); }
  finally { clearTimeout(timer); }
}

// One Z.ai chat call returning parsed JSON. Retries "overloaded" (code 1305 / 429) a few times.
async function zaiJson({ job, model, system, content, schema, timeoutMs = 50000, maxTokens, info }) {
  const key = process.env.ZAI_API_KEY;
  if (!key) throw err("not_configured", 503);
  const sys = system + "\n\nReply with ONE JSON object only, no prose, matching this JSON Schema:\n" + JSON.stringify(toJsonSchema(schema));
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    const left = deadline - Date.now();
    if (left < 3000) throw err("aborted", 502);
    if (info) info.retries = attempt;
    const r = await timed(`${ZAI}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.1, thinking: { type: "disabled" }, response_format: { type: "json_object" },
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        messages: [{ role: "system", content: sys }, { role: "user", content }] }),
    }, left);
    const j = await r.json().catch(() => ({}));
    const code = j && j.error && String(j.error.code);
    if ((r.status === 429 || code === "1305" || code === "1302") && attempt < 4) { await sleep(1500 * (attempt + 1)); continue; }
    if (!r.ok || j.error) throw err("upstream_" + (code || r.status), r.status === 429 ? 429 : 502);
    const u = j.usage || {};
    await logUsage({ service: "Z.ai", job, model, inTok: u.prompt_tokens, outTok: u.completion_tokens });
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) throw err("empty", 502);
    return parseJsonLoose(text);
  }
}

// GLM-OCR: image/PDF -> markdown. Needs a Z.ai balance; callers treat failure as "skip OCR".
async function zaiOcr({ mime, base64 }) {
  const key = process.env.ZAI_API_KEY;
  if (!key) throw err("not_configured", 503);
  const r = await timed(`${ZAI}/layout_parsing`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "glm-ocr", file: `data:${mime};base64,${base64}` }),
  }, 40000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || !j.md_results) throw err("ocr_failed", 502);
  const u = j.usage || {};
  await logUsage({ service: "Z.ai", job: "import-ocr", model: "glm-ocr", inTok: u.prompt_tokens, outTok: u.completion_tokens, extra: { pages: j.data_info && j.data_info.num_pages } });
  return j.md_results;
}

async function geminiJson({ job, model, system, parts, schema, temperature = 0.1, timeoutMs = 50000, maxTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw err("not_configured", 503);
  const m = model || geminiModel();
  const r = await timed(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }],
      generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema, ...(maxTokens ? { maxOutputTokens: maxTokens } : {}) } }),
  }, timeoutMs);
  if (!r.ok) throw err("upstream_" + r.status, r.status === 429 ? 429 : 502);
  const j = await r.json();
  const u = j.usageMetadata || {};
  await logUsage({ service: "Gemini", job, model: m, inTok: u.promptTokenCount, outTok: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) });
  const p = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const t = p && p[0] && p[0].text;
  if (!t) throw err(j.promptFeedback && j.promptFeedback.blockReason ? "blocked" : "empty", 502);
  return parseJsonLoose(t);
}

const zaiReady = () => !!process.env.ZAI_API_KEY;
const geminiReady = () => !!process.env.GEMINI_API_KEY;

// Statement -> raw JSON (validated later by normalizeResult). Input: {text} or {mime, base64}.
async function extractStatement(input) {
  const ask = "Extract the holdings and cash from this statement as JSON.";
  const tries = [];
  if (zaiReady()) {
    tries.push(async () => {
      let text = input.text;
      if (text == null && process.env.LLM_OCR === "1") { try { text = await zaiOcr(input); } catch (e) { text = null; } }
      if (text != null) {
        return zaiJson({ job: "import", model: process.env.LLM_TEXT_MODEL || "glm-4.6v-flash", system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA, content: "Statement text:\n" + text + "\n\n" + ask });
      }
      // scanned PDFs arrive as page images rendered in the browser (input.images); a raw PDF goes to the fallback
      const imgs = input.images || (/^image\//.test(input.mime) ? [{ mime: input.mime, base64: input.base64 }] : null);
      if (!imgs) throw err("pdf_needs_text", 502);
      return zaiJson({ job: "import", model: process.env.LLM_VISION_MODEL || "glm-4.6v-flash", system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA,
        content: [...imgs.slice(0, 4).map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.base64}` } })), { type: "text", text: ask }] });
    });
  }
  if (geminiReady()) {
    tries.push(() => geminiJson({ job: "import", system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA, temperature: 0,
      parts: [...(input.text != null ? [{ text: "Statement text:\n" + input.text }]
        : (input.images || [{ mime: input.mime, base64: input.base64 }]).slice(0, 4).map((im) => ({ inline_data: { mime_type: im.mime, data: im.base64 } }))), { text: ask }] }));
  }
  if (!tries.length) throw err("not_configured", 503);
  let last;
  for (const t of tries) { try { return await t(); } catch (e) { last = e; if (e.status === 503) continue; } }
  throw last;
}

// Generic structured-JSON call for prompts whose facts are supplied inline (news briefing).
// Optional (all off by default, so existing callers behave exactly as before):
//   noFallback  use ONE provider only (Z.ai when configured, else Gemini); never a second provider call
//   maxTokens   cap on output tokens (max_tokens / maxOutputTokens)
//   deadlineMs  total time budget for the call, replacing the default 40 s (Z.ai) / 25 s (Gemini) caps
//   info        object filled with {provider, model, retries} (retries = Z.ai overload re-sends)
//   fallbackOn  with noFallback: a test (error -> bool); when it returns true for the Z.ai error, Gemini is tried once
//   fallbackDeadlineMs  time budget for that Gemini call
async function generateJson({ system, user, schema, model, timeoutMs = 50000, job = "news", noFallback = false, maxTokens, deadlineMs, info, fallbackOn, fallbackDeadlineMs }) {
  let last;
  const zm = model || process.env.NEWS_MODEL || "glm-4.6v-flash", gm = process.env.NEWS_GEMINI_MODEL || GEMINI_DEFAULT;
  if (info) Object.assign(info, { provider: null, model: null, retries: 0 });
  if (zaiReady()) {
    if (info) Object.assign(info, { provider: "Z.ai", model: zm });
    try { return await zaiJson({ job, model: zm, system, schema, content: user, timeoutMs: deadlineMs || Math.min(timeoutMs, 40000), maxTokens, info }); }
    catch (e) { last = e; if (noFallback && !(fallbackOn && fallbackOn(e) && geminiReady())) throw e; if (info && noFallback) info.fallback = String(e && (e.code || e.status) || "error").slice(0, 40); }
  }
  if (geminiReady()) {
    if (info) Object.assign(info, { provider: "Gemini", model: gm });
    return geminiJson({ job, model: gm, system, schema, parts: [{ text: user }], temperature: 0.2, timeoutMs: (info && info.fallback && fallbackDeadlineMs) || deadlineMs || 25000, maxTokens });
  }
  throw last || err("not_configured", 503);
}

// Which provider/model serves each job (shown on the Settings page; no secrets).
function describe() {
  return {
    import: zaiReady() ? `Z.ai ${process.env.LLM_TEXT_MODEL || "glm-4.6v-flash"} (text) / ${process.env.LLM_VISION_MODEL || "glm-4.6v-flash"} (images)${process.env.LLM_OCR === "1" ? " + GLM-OCR" : ""}` : geminiReady() ? `Gemini ${geminiModel()}` : "not configured",
    news: zaiReady() ? `Z.ai ${process.env.NEWS_MODEL || "glm-4.6v-flash"}` : geminiReady() ? `Gemini ${GEMINI_DEFAULT}` : "not configured",
    fallback: geminiReady() ? `Gemini ${geminiModel()}` : "none",
  };
}

module.exports = { extractStatement, generateJson, describe, toJsonSchema, parseJsonLoose,
  extractWithGemini: extractStatement /* old name kept for callers */ };
