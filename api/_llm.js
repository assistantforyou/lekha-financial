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
const { SYSTEM_PROMPT, RESPONSE_SCHEMA, isSparse } = require("./_import");
const { logUsage } = require("./_costs");

const ZAI = "https://api.z.ai/api/paas/v4";
const GEMINI_DEFAULT = "gemini-3.5-flash-lite"; // gemini-3.5-flash was deprecated 2026-10-08
const DEPRECATED = new Set(["gemini-3.5-flash", "gemini-2.5-flash"]);
const geminiModel = () => (process.env.GEMINI_MODEL && !DEPRECATED.has(process.env.GEMINI_MODEL) ? process.env.GEMINI_MODEL : GEMINI_DEFAULT);
const err = (msg, status) => Object.assign(new Error(msg), { status });
// State is local to each warm serverless instance and contains no request content.
const circuits = new Map();
function setting(name, fallback, max) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.ceil(n)) : fallback;
}
function matches(value, schema) {
  if (value === null) return schema.nullable === true;
  if (schema.enum && !schema.enum.includes(value)) return false;
  switch (schema.type.toLowerCase()) {
    case "object":
      return typeof value === "object" && !Array.isArray(value) &&
        (schema.required || []).every(k => Object.hasOwn(value, k)) &&
        Object.entries(schema.properties || {}).every(([k, rule]) => !Object.hasOwn(value, k) || matches(value[k], rule));
    case "array":
      return Array.isArray(value) && value.length >= (schema.minItems || 0) &&
        value.length <= (schema.maxItems ?? Infinity) && value.every(v => matches(v, schema.items));
    case "number": return Number.isFinite(value);
    case "integer": return Number.isSafeInteger(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    default: return false;
  }
}
function hasContent(value) {
  if (typeof value === "string") return !!value.trim();
  if (value && typeof value === "object") return Object.values(value).some(hasContent);
  return value != null;
}
function readAnswer(text, schema) {
  const value = stripPictographs(parseJsonLoose(text));
  if (!matches(value, schema) || !hasContent(value)) throw err("invalid_response", 502);
  return value;
}

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

// Professional output only: nothing a model writes may contain emoji or pictograph symbols. Every model call is told so, and
// the parsed JSON is also scrubbed (belt and braces: models sometimes ignore style rules).
const PRO_STYLE = "\n\nStyle: write plainly and professionally for an audience of financial professionals. Never use emojis, emoticons, pictograph symbols or decorative characters in any text you produce.";
const PICTO = new RegExp("[" + [[0x1F000, 0x1FAFF], [0x2600, 0x27BF], [0x2B50, 0x2B50], [0x2B06, 0x2B06], [0xFE0F, 0xFE0F], [0x20E3, 0x20E3]].map(([a, b]) => String.fromCodePoint(a) + "-" + String.fromCodePoint(b)).join("") + "]", "gu"); // built from code points so this file itself holds no pictographs
function stripPictographs(v) {
  if (typeof v === "string") { const r = v.replace(PICTO, ""); return r === v ? v : r.replace(/ {2,}/g, " ").trim(); }
  if (Array.isArray(v)) return v.map(stripPictographs);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = stripPictographs(v[k]); return o; }
  return v;
}

async function timed(url, init, timeoutMs) {
  const ctl = new AbortController();
  if (timeoutMs <= 0) throw err("aborted", 502);
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: ctl.signal });
    const body = await response.json().catch(() => ({}));
    ctl.signal.throwIfAborted();
    return { ok: response.ok, status: response.status, body };
  }
  catch (e) { throw Object.assign(err(e && e.name === "AbortError" ? "aborted" : "network", 502), { cause: e?.cause?.code || e?.name }); }
  finally { clearTimeout(timer); }
}

// One Z.ai chat call returning validated JSON.
async function zaiJson({ job, model, system, content, schema, timeoutMs = 50000, maxTokens }) {
  const key = process.env.ZAI_API_KEY;
  if (!key) throw err("not_configured", 503);
  const sys = system + PRO_STYLE + "\n\nReply with ONE JSON object only, no prose, matching this JSON Schema:\n" + JSON.stringify(toJsonSchema(schema));
  const end = Date.now() + timeoutMs;
  const r = await timed(`${ZAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.1, thinking: { type: "disabled" }, response_format: { type: "json_object" },
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      messages: [{ role: "system", content: sys }, { role: "user", content }] }),
  }, timeoutMs);
  const j = r.body || {};
  const code = j && j.error && String(j.error.code);
  if (!r.ok || j.error) throw err("upstream_" + (code || r.status), r.status === 429 ? 429 : 502);
  const u = j.usage || {};
  await logUsage({ timeoutMs: Math.max(1, Math.min(1000, end - Date.now())), service: "Z.ai", job, model, inTok: u.prompt_tokens, outTok: u.completion_tokens });
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw err("empty", 502);
  return readAnswer(text, schema);
}

// GLM-OCR: image/PDF -> markdown. Needs a Z.ai balance; callers treat failure as "skip OCR".
async function zaiOcr({ mime, base64 }, timeoutMs) {
  const key = process.env.ZAI_API_KEY;
  if (!key) throw err("not_configured", 503);
  const end = Date.now() + timeoutMs;
  const r = await timed(`${ZAI}/layout_parsing`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "glm-ocr", file: `data:${mime};base64,${base64}` }),
  }, timeoutMs);
  const j = r.body || {};
  if (!r.ok || j.error || !j.md_results) throw err("ocr_failed", 502);
  const u = j.usage || {};
  await logUsage({ timeoutMs: Math.max(1, Math.min(1000, end - Date.now())), service: "Z.ai", job: "import-ocr", model: "glm-ocr", inTok: u.prompt_tokens, outTok: u.completion_tokens, extra: { pages: j.data_info && j.data_info.num_pages } });
  return j.md_results;
}

async function geminiJson({ job, model, system, parts, schema, temperature = 0.1, timeoutMs = 50000, maxTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw err("not_configured", 503);
  const m = model || geminiModel();
  const end = Date.now() + timeoutMs;
  const r = await timed(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system + PRO_STYLE }] }, contents: [{ role: "user", parts }],
        generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema, ...(maxTokens ? { maxOutputTokens: maxTokens } : {}) } }),
    }, timeoutMs);
  if (!r.ok) throw err("upstream_" + r.status, r.status === 429 ? 429 : 502);
  const j = r.body || {};
  const u = j.usageMetadata || {};
  await logUsage({ timeoutMs: Math.max(1, Math.min(1000, end - Date.now())), service: "Gemini", job, model: m, inTok: u.promptTokenCount, outTok: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) });
  const p = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const t = Array.isArray(p) && p.filter(part => !part.thought).map(part => part.text || "").join("");
  if (!t) throw err(j.promptFeedback && j.promptFeedback.blockReason ? "blocked" : "empty", 502);
  return readAnswer(t, schema);
}

const zaiReady = () => !!process.env.ZAI_API_KEY;
const geminiReady = () => !!process.env.GEMINI_API_KEY;

// Statement -> raw JSON (validated later by normalizeResult). Input: {text} or {mime, base64}.
function importTries(input) {
  const ask = "Extract the holdings and cash from this statement as JSON.";
  const tries = [];
  if (zaiReady()) {
    tries.push({ name: "zai", run: async (budget) => {
      const until = Date.now() + budget;
      let text = input.text;
      if (text == null && process.env.LLM_OCR === "1") { try { text = await zaiOcr(input, Math.floor(budget / 3)); } catch (e) { text = null; } }
      if (text != null) {
        return zaiJson({ job: "import", timeoutMs: until - Date.now(), model: process.env.LLM_TEXT_MODEL || "glm-4.6v-flash", system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA, content: "Statement text:\n" + text + "\n\n" + ask });
      }
      // scanned PDFs arrive as page images rendered in the browser (input.images); a raw PDF goes to the fallback
      const imgs = input.images || (/^image\//.test(input.mime) ? [{ mime: input.mime, base64: input.base64 }] : null);
      if (!imgs) throw err("pdf_needs_text", 502);
      return zaiJson({ job: "import", timeoutMs: until - Date.now(), model: process.env.LLM_VISION_MODEL || "glm-4.6v-flash", system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA,
        content: [...imgs.slice(0, 4).map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.base64}` } })), { type: "text", text: ask }] });
    } });
  }
  if (geminiReady()) {
    tries.push({ name: "gemini", run: (timeoutMs) => geminiJson({ timeoutMs, job: "import", system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA, temperature: 0,
      parts: [...(input.text != null ? [{ text: "Statement text:\n" + input.text }]
        : (input.images || [{ mime: input.mime, base64: input.base64 }]).slice(0, 4).map((im) => ({ inline_data: { mime_type: im.mime, data: im.base64 } }))), { text: ask }] }) });
  }
  if (!tries.length) throw err("not_configured", 503);
  // Gemini Flash-Lite reads images in a few seconds; the free Z.ai vision model can take 30-60 s. With both configured,
  // images go to Gemini first (Z.ai stays as the fallback). LLM_IMPORT_FIRST=zai|gemini overrides.
  const first = process.env.LLM_IMPORT_FIRST || (input.text == null ? "gemini" : "zai");
  if (tries.length === 2 && first === "gemini") tries.reverse();
  return tries;
}

async function extractStatement(input) {
  let last;
  const tries = importTries(input);
  const end = Date.now() + 46000;
  for (const [i, t] of tries.entries()) { try { const raw = await t.run(Math.floor((end - Date.now()) / (tries.length - i))); if (isSparse(raw)) throw err("sparse", 502); return raw; } catch (e) { last = e; } }
  throw last;
}

// Image/PDF-scan statements are read by BOTH providers in parallel (when both are configured) so the caller can compare
// them. Text/CSV is deterministic to read, so it uses one reader. Returns { raw, second|null }.
async function extractVerified(input) {
  const tries = importTries(input);
  if (tries.length < 2 || input.text != null) return { raw: await extractStatement(input), second: null };
  const [a, b] = (await Promise.allSettled(tries.map((t) => t.run(46000)))).map((r) => (r.status === "fulfilled" && isSparse(r.value) ? { status: "rejected", reason: err("sparse", 502) } : r));
  if (a.status === "fulfilled") return { raw: a.value, second: b.status === "fulfilled" ? b.value : null };
  if (b.status === "fulfilled") return { raw: b.value, second: null };
  throw a.reason;
}

// Take one attempt per configured provider. Reserve time for the backup, including body reads.
async function generateJson({ system, user, schema, model, timeoutMs = 50000, job = "news", maxTokens, deadlineMs, info = {}, accept }) {
  const budget = Math.min(deadlineMs || timeoutMs, setting("LLM_DEADLINE_MS", 50000, 55000));
  const end = Date.now() + budget;
  const zm = model || process.env.NEWS_MODEL || "glm-4.6v-flash";
  const gm = process.env.NEWS_GEMINI_MODEL;
  const backup = geminiReady();
  Object.assign(info, { provider: null, model: null, retries: 0, requests: 0, fallback: null });
  const circuit = circuits.get(zm);
  if (zaiReady() && (!backup || !circuit || Date.now() >= circuit.until)) {
    Object.assign(info, { provider: "Z.ai", model: zm, requests: 1 });
    try {
      const primaryBudget = Math.min(setting("LLM_PRIMARY_TIMEOUT_MS", 30000, 50000), backup ? Math.ceil(budget * 0.6) : budget);
      const answer = await zaiJson({ job, model: zm, system, schema, content: user, timeoutMs: primaryBudget, maxTokens });
      if (accept && !accept(answer)) throw err("unusable_response", 502);
      circuits.delete(zm);
      return answer;
    } catch (error) {
      const failures = (circuits.get(zm)?.failures || 0) + 1;
      if (!["invalid_response", "bad_json", "empty", "unusable_response"].includes(error.message))
        circuits.set(zm, { failures, until: failures >= 3 ? Date.now() + 30000 : 0 });
      if (!backup) throw error;
      info.fallback = error.message;
    }
  } else if (zaiReady()) {
    info.fallback = "circuit_open";
  }
  if (!backup) throw err("not_configured", 503);
  info.provider = "Gemini";
  info.model = gm && !DEPRECATED.has(gm) ? gm : geminiModel();
  info.requests++;
  const answer = await geminiJson({ job, model: info.model, system, schema, parts: [{ text: user }], temperature: 0.2, timeoutMs: end - Date.now(), maxTokens });
  if (accept && !accept(answer)) throw err("unusable_response", 502);
  return answer;
}

// Which provider/model serves each job (shown on the Settings page; no secrets).
function describe() {
  return {
    import: zaiReady() ? `Z.ai ${process.env.LLM_TEXT_MODEL || "glm-4.6v-flash"} (text) / ${process.env.LLM_VISION_MODEL || "glm-4.6v-flash"} (images)${process.env.LLM_OCR === "1" ? " + GLM-OCR" : ""}` : geminiReady() ? `Gemini ${geminiModel()}` : "not configured",
    news: zaiReady() ? `Z.ai ${process.env.NEWS_MODEL || "glm-4.6v-flash"}` : geminiReady() ? `Gemini ${GEMINI_DEFAULT}` : "not configured",
    fallback: geminiReady() ? `Gemini ${geminiModel()}` : "none",
  };
}

module.exports = { stripPictographs, extractStatement, extractVerified, generateJson, describe, toJsonSchema, parseJsonLoose,
  extractWithGemini: extractStatement /* old name kept for callers */ };
