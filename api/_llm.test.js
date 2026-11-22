// Run: node api/_llm.test.js
const assert = require("assert");
const Module = require("module"); const orig = Module._load;
Module._load = function (r) { if (r === "./_lib") return { sb: async () => ({ ok: true }) }; return orig.apply(this, arguments); };
const { toJsonSchema, parseJsonLoose, stripPictographs } = require("./_llm");
const { aggregate } = require("./_costs");
const { tokenCost } = require("./_pricing");

const js = toJsonSchema({ type: "OBJECT", properties: { a: { type: "NUMBER", nullable: true }, b: { type: "ARRAY", items: { type: "STRING", enum: ["x"] }, maxItems: 3 } }, required: ["a"] });
assert.deepStrictEqual(js, { type: "object", properties: { a: { type: ["number", "null"] }, b: { type: "array", items: { type: "string", enum: ["x"] }, maxItems: 3 } }, required: ["a"] });

assert.deepStrictEqual(parseJsonLoose('{"ok":true}'), { ok: true });
assert.deepStrictEqual(parseJsonLoose('\n```json\n{"ok":1}\n```\nEnd'), { ok: 1 });
assert.throws(() => parseJsonLoose("no json here"), /bad_json/);

assert.strictEqual(tokenCost("glm-ocr", 1e6, 1e6), 0.06);
assert.strictEqual(tokenCost("glm-4.6v-flash", 5e6, 5e6), 0);
assert.strictEqual(tokenCost("unknown-model", 1, 1), null);

const now = new Date("2026-11-10T12:00:00Z");
const a = aggregate([
  { ts: "2026-11-01T01:00:00Z", service: "Z.ai", model: "glm-ocr", units: { in: 100, out: 50 }, usd: 0.5 },
  { ts: "2026-11-09T01:00:00Z", service: "Z.ai", model: "glm-ocr", units: { in: 10, out: 5 }, usd: 0.5 },
  { ts: "2026-10-30T01:00:00Z", service: "Gemini", model: "gemini-3.5-flash-lite", units: { in: 1, out: 1 }, usd: 2 },
], now);
assert.strictEqual(a.mtd, 1); assert.strictEqual(a.calls, 2);
assert.strictEqual(Math.round(a.projected * 100) / 100, 3); // $1 over 10 days -> $3 for 30 days
assert.strictEqual(a.byModel[0].model, "gemini-3.5-flash-lite");
assert.strictEqual(a.byDay["2026-11-01"]["Z.ai"], 0.5);
console.log("llm ok");

// model output is scrubbed of emoji/pictographs (strings anywhere in the JSON), real symbols and scripts are untouched
assert.deepStrictEqual(stripPictographs({ a: "Strong quarter \u{1F680} \u2705 margins up", b: ["Risk \u26A0\uFE0F noted", 3, null], c: { d: "1\uFE0F\u20E3 first" } }), { a: "Strong quarter margins up", b: ["Risk noted", 3, null], c: { d: "1 first" } });
assert.strictEqual(stripPictographs("\u0E01\u0E32\u0E23\u0E25\u0E07\u0E17\u0E38\u0E19 \u2192 +2.5% \u25B2 \u0939\u093F\u0928\u094D\u0926\u0940 \u00A9 \u2122 \u2248"), "\u0E01\u0E32\u0E23\u0E25\u0E07\u0E17\u0E38\u0E19 \u2192 +2.5% \u25B2 \u0939\u093F\u0928\u094D\u0926\u0940 \u00A9 \u2122 \u2248");
assert.strictEqual(stripPictographs(42), 42);
console.log("pictograph scrub ok");

// Forced fallback: Z.ai answers 500, so the same job is served by Gemini and the switch is recorded.
// Both keys are present but fake; global fetch is stubbed, so no request leaves the machine.
const { generateJson } = require("./_llm");
process.env.ZAI_API_KEY = "test-zai-key";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.SUPABASE_URL = "";
const seen = [];
global.fetch = async (url) => {
  seen.push(String(url));
  if (String(url).includes("/chat/completions"))
    return { ok: false, status: 500, json: async () => ({ error: { message: "upstream down", code: "server_error" } }) };
  return {
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '{"answer":"from gemini"}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }),
  };
};
(async () => {
  const info = {};
  const out = await generateJson({
    system: "system", user: "user", info,
    schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
  });
  assert.strictEqual(out.answer, "from gemini");
  assert.strictEqual(info.provider, "Gemini");
  assert.strictEqual(info.fallback, "upstream_server_error");
  assert.ok(seen.some((u) => u.includes("/chat/completions")), "Z.ai was tried first");
  assert.ok(seen.some((u) => u.includes("generativelanguage.googleapis.com")), "Gemini was used as fallback");
  // With no Gemini key the same failure surfaces as 503 instead of a silent empty answer.
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(() => generateJson({
    system: "system", user: "user",
    schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
  }), (e) => e.message === "upstream_server_error");
  // Per-job routing: a listed job asks Gemini first; when Gemini's answer fails accept(), Z.ai is the backup and is
  // validated by the same check. Unlisted jobs keep Z.ai first.
  process.env.GEMINI_API_KEY = "test-gemini-key"; process.env.LLM_GEMINI_FIRST_JOBS = "ai-council-v3, agent-answer";
  const order = []; let zaiOk = true;
  global.fetch = async (url) => {
    const u = String(url); order.push(u.includes("/chat/completions") ? "zai" : "gemini");
    if (u.includes("/chat/completions")) return zaiOk ? { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"answer":"from zai"}' } }], usage: {} }) } : { ok: false, status: 500, json: async () => ({ error: { code: "server_error" } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"answer":"from gemini"}' }] } }], usageMetadata: {} }) };
  };
  const S1 = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] };
  let i1 = {}; let o1 = await generateJson({ system: "s", user: "u", schema: S1, job: "ai-council-v3", info: i1 });
  assert.strictEqual(o1.answer, "from gemini"); assert.deepStrictEqual(order, ["gemini"]); assert.strictEqual(i1.provider, "Gemini"); assert.strictEqual(i1.fallback, null);
  order.length = 0; i1 = {};
  o1 = await generateJson({ system: "s", user: "u", schema: S1, job: "agent-answer", info: i1, accept: (a) => a.answer !== "from gemini" });
  assert.strictEqual(o1.answer, "from zai"); assert.deepStrictEqual(order, ["gemini", "zai"]); assert.strictEqual(i1.provider, "Z.ai"); assert.strictEqual(i1.fallback, "unusable_response");
  order.length = 0; zaiOk = false;
  await assert.rejects(() => generateJson({ system: "s", user: "u", schema: S1, job: "agent-answer", accept: () => false }), (e) => e.message === "upstream_server_error");
  order.length = 0; zaiOk = true; i1 = {};
  o1 = await generateJson({ system: "s", user: "u", schema: S1, job: "agent-expert", info: i1 });
  assert.strictEqual(o1.answer, "from zai"); assert.deepStrictEqual(order, ["zai"], "unlisted jobs stay Z.ai-first");
  delete process.env.LLM_GEMINI_FIRST_JOBS;
  console.log("llm fallback ok");
})().catch((e) => { console.error(e); process.exit(1); });
