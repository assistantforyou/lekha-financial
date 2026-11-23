// AI provider adapter. Single provider: DeepSeek (OpenAI-compatible chat API, thinking mode supported).
// Every call logs token usage and cost to pt_costs (no content is logged).
//
// Env:
//   DEEPSEEK_API_KEY                      DeepSeek key
//   LLM_TEXT_MODEL   default deepseek-flash   statement text -> JSON
//   LLM_VISION_MODEL default deepseek-flash   statement image -> JSON (DeepSeek Flash is multimodal)
//   NEWS_MODEL       default deepseek-flash   news briefing
//   LLM_DEADLINE_MS  default 50000 (max 55000) overall JSON budget
const { SYSTEM_PROMPT, RESPONSE_SCHEMA, isSparse } = require("./_import");
const ds = require("./_ai/ds");
const { stripPictographs } = require("./_ai/style");

const err = (msg, status) => Object.assign(new Error(msg), { status });
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

// Gemini-style schema (uppercase types, nullable) -> plain JSON Schema for prompts / OpenAI-style APIs.
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

// One DeepSeek chat call returning validated JSON. Retries on overload live in ds.complete.
async function dsJson({ job, model, system, content, schema, timeoutMs = 50000, maxTokens, temperature = 0.1 }) {
  if (!ds.ready()) throw err("not_configured", 503);
  const sys = system + PRO_STYLE + "\n\nReply with ONE JSON object only, no prose, matching this JSON Schema:\n" + JSON.stringify(toJsonSchema(schema));
  const out = await ds.complete({
    model,
    job,
    timeoutMs,
    maxTokens,
    temperature,
    thinking: false,
    responseFormat: "json",
    messages: [{ role: "system", content: sys }, { role: "user", content }],
  });
  if (!out.text) throw err("empty", 502);
  return readAnswer(out.text, schema);
}

const ready = () => ds.ready();

// Statement -> raw JSON (validated later by normalizeResult). Input: {text} or {mime, base64} or {images:[{mime,base64}]}.
function importTries(input) {
  if (!ready()) throw err("not_configured", 503);
  const ask = "Extract the holdings and cash from this statement as JSON.";
  return [{ name: "deepseek", run: async (budget) => {
    const timeoutMs = Math.max(1000, budget);
    if (input.text != null) {
      return dsJson({ job: "import", timeoutMs, temperature: 0, model: process.env.LLM_TEXT_MODEL || ds.MODELS.fast, system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA, content: "Statement text:\n" + input.text + "\n\n" + ask });
    }
    // scanned PDFs arrive as page images rendered in the browser (input.images); a raw PDF cannot be read here
    const imgs = input.images || (/^image\//.test(input.mime) ? [{ mime: input.mime, base64: input.base64 }] : null);
    if (!imgs) throw err("pdf_needs_text", 502);
    return dsJson({ job: "import", timeoutMs, temperature: 0, model: process.env.LLM_VISION_MODEL || ds.MODELS.vision, system: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA,
      content: [...imgs.slice(0, 4).map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.base64}` } })), { type: "text", text: ask }] });
  } }];
}

async function extractStatement(input) {
  let last;
  const tries = importTries(input);
  const end = Date.now() + 46000;
  for (const [i, t] of tries.entries()) {
    try {
      const raw = await t.run(Math.floor((end - Date.now()) / (tries.length - i)));
      if (isSparse(raw)) throw err("sparse", 502);
      return raw;
    } catch (e) { last = e; }
  }
  throw last;
}

// Statements used to be read by two providers in parallel so the caller could compare them. With one provider the second
// reading is always null; callers already treat that as "no cross-check available".
async function extractVerified(input) {
  return { raw: await extractStatement(input), second: null };
}

// One JSON answer for a structured job (news briefing, council, agent plan/answer, expert analysis, chat helpers).
async function generateJson({ system, user, schema, model, timeoutMs = 50000, job = "news", maxTokens, deadlineMs, info = {}, accept }) {
  if (!ready()) throw err("not_configured", 503);
  const budget = Math.min(deadlineMs || timeoutMs, setting("LLM_DEADLINE_MS", 50000, 55000));
  const m = model || process.env.NEWS_MODEL || ds.MODELS.fast;
  Object.assign(info, { provider: "DeepSeek", model: m, retries: 0, requests: 0, fallback: null });
  const answer = await ds.complete({
    job,
    model: m,
    maxTokens,
    timeoutMs: Math.max(1000, budget),
    temperature: 0.2,
    thinking: false,
    responseFormat: "json",
    messages: [{ role: "system", content: system + PRO_STYLE + "\n\nReply with ONE JSON object only, no prose, matching this JSON Schema:\n" + JSON.stringify(toJsonSchema(schema)) }, { role: "user", content: user }],
  });
  info.requests = answer.attempts;
  info.retries = Math.max(0, answer.attempts - 1);
  if (!answer.text) throw err("empty", 502);
  const value = readAnswer(answer.text, schema);
  if (accept && !accept(value)) throw err("unusable_response", 502);
  return value;
}

// Which model serves each job (shown on the Settings page; no secrets).
function describe() {
  if (!ready()) return { import: "not configured", news: "not configured", fallback: "none" };
  const text = process.env.LLM_TEXT_MODEL || ds.MODELS.fast;
  const vision = process.env.LLM_VISION_MODEL || ds.MODELS.vision;
  const news = process.env.NEWS_MODEL || ds.MODELS.fast;
  return {
    import: `DeepSeek ${text} (text) / ${vision} (images)`,
    news: `DeepSeek ${news}`,
    fallback: "none (single provider; retries on overload)",
  };
}

module.exports = { stripPictographs, extractStatement, extractVerified, generateJson, describe, toJsonSchema, parseJsonLoose,
  extractWithGemini: extractStatement /* old name kept for callers */ };
