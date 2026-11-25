// On-demand translation. The generated dictionaries in public/i18n cover the classic panels; anything written
// later (new React copy, new review flags, new model output) misses them. The browser queues those misses and
// posts them here in batches; each answer is stored permanently in the shared cache, so a string is translated
// once and served instantly afterwards. English is never requested.
const crypto = require("crypto");
const { cacheGet, cacheSet } = require("../../_lib");
const { generateJson } = require("../../_llm");
const { NAMES } = require("../ai/_lang");

const LANGS = Object.keys(NAMES).filter((c) => c !== "en");
const MAX_TEXTS = 80;
const MAX_LEN = 400;
const MAX_MAP = 4000;
const STORE_TTL = 365 * 24 * 60 * 60 * 1000;
const inflight = new Map();

function clean(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
}

function keyOf(s) {
  return s.toLowerCase();
}

async function load(lang) {
  const hit = await cacheGet("i18n/" + lang).catch(() => null);
  return hit && hit.map && typeof hit.map === "object" ? hit.map : {};
}

async function save(lang, map) {
  const keys = Object.keys(map);
  if (keys.length > MAX_MAP) for (const k of keys.slice(0, keys.length - MAX_MAP)) delete map[k];
  await cacheSet("i18n/" + lang, { map, at: new Date().toISOString(), ttl: STORE_TTL }).catch(() => null);
}

async function translate(lang, texts) {
  const answer = await generateJson({
    system: [
      "You translate the interface of a financial analysis terminal.",
      `Translate each string into ${NAMES[lang]} (${lang}).`,
      "Keep placeholders such as {0} and {1}, tickers, numbers, percentages, dates and any HTML tags exactly as they appear.",
      "Keep the tone neutral and professional. No emoji, no exclamation marks.",
      "Return exactly one translation per input, in the same order, and nothing else.",
      'Reply with JSON shaped as {"values": string[]}.',
    ].join(" "),
    user: JSON.stringify({ strings: texts }),
    schema: {
      type: "object",
      required: ["values"],
      properties: { values: { type: "array", items: { type: "string" }, minItems: texts.length, maxItems: texts.length } },
    },
    job: "i18n",
    timeoutMs: 30000,
    maxTokens: Math.min(4000, 64 + texts.length * 24),
  });
  const values = answer && Array.isArray(answer.values) ? answer.values : [];
  return values.length === texts.length ? values.map((v) => clean(v)) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");

  if (req.method === "GET") {
    const lang = String((req.query && req.query.lang) || "");
    if (!LANGS.includes(lang)) return res.status(400).json({ error: "Unsupported language.", code: "bad_lang" });
    const map = await load(lang);
    return res.status(200).json({ data: { lang, count: Object.keys(map).length } });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST.", code: "method" });

  const body = req.body || {};
  const lang = String(body.lang || "");
  if (!LANGS.includes(lang)) return res.status(400).json({ error: "Unsupported language.", code: "bad_lang" });
  const texts = Array.isArray(body.texts) ? body.texts.map(clean).filter((s) => s.length >= 2) : [];
  if (!texts.length) return res.status(400).json({ error: "No text to translate.", code: "empty" });
  if (texts.length > MAX_TEXTS) return res.status(400).json({ error: `Send at most ${MAX_TEXTS} strings.`, code: "too_many" });

  const uniq = [...new Set(texts)];
  const map = await load(lang);
  const missing = uniq.filter((s) => !map[keyOf(s)]);
  const out = {};
  for (const s of uniq) if (map[keyOf(s)]) out[s] = map[keyOf(s)];

  if (missing.length) {
    const stamp = crypto.createHash("sha1").update(lang + "|" + missing.join("|")).digest("hex").slice(0, 16);
    let job = inflight.get(stamp);
    if (!job) {
      job = translate(lang, missing).finally(() => setTimeout(() => inflight.delete(stamp), 30000));
      inflight.set(stamp, job);
    }
    const values = await job.catch(() => null);
    if (values) {
      missing.forEach((src, i) => {
        const v = values[i];
        if (!v || v === src) return;
        map[keyOf(src)] = v;
        out[src] = v;
      });
      await save(lang, map);
    }
  }

  return res.status(200).json({ data: { lang, map: out } });
};
