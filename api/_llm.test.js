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

// Single provider: DeepSeek serves every JSON job. Overload is retried inside the transport; a bad
// answer is an error, never a silent empty result. The key is fake and fetch is stubbed, so no
// request leaves the machine.
const { generateJson } = require("./_llm");
process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
process.env.SUPABASE_URL = "";
const S = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] };
const ok = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) });
const seen = [];
global.fetch = async (url, init) => {
  seen.push(String(url));
  const body = JSON.parse(init.body);
  assert.strictEqual(body.response_format.type, "json_object");
  assert.strictEqual(body.thinking.type, "disabled");
  return ok('{"answer":"from deepseek"}');
};
(async () => {
  const info = {};
  const out = await generateJson({ system: "s", user: "u", info, schema: S });
  assert.strictEqual(out.answer, "from deepseek");
  assert.strictEqual(info.provider, "DeepSeek");
  assert.strictEqual(info.fallback, null);
  assert.strictEqual(info.requests, 1);
  assert.ok(seen[0].startsWith("https://api.deepseek.com/"), "one provider only");
  // A throttled first attempt is retried, not surfaced.
  let n = 0;
  global.fetch = async () => (++n === 1 ? { ok: false, status: 503, text: async () => "busy", json: async () => ({}) } : ok('{"answer":"after retry"}'));
  const retryInfo = {};
  assert.deepStrictEqual(await generateJson({ system: "s", user: "u", schema: S, info: retryInfo }), { answer: "after retry" });
  assert.strictEqual(n, 2);
  assert.strictEqual(retryInfo.requests, 2);
  assert.strictEqual(retryInfo.retries, 1);
  // An answer that fails accept() is rejected as unusable rather than shown.
  global.fetch = async () => ok('{"answer":"wrong"}');
  await assert.rejects(() => generateJson({ system: "s", user: "u", schema: S, accept: (a) => a.answer !== "wrong" }), (e) => e.message === "unusable_response");
  // Schema violations and empty content are errors.
  global.fetch = async () => ok('{"other":1}');
  await assert.rejects(() => generateJson({ system: "s", user: "u", schema: S }), (e) => e.message === "invalid_response");
  global.fetch = async () => ok("");
  await assert.rejects(() => generateJson({ system: "s", user: "u", schema: S }), (e) => e.message === "empty");
  // Without a key every job fails closed instead of pretending to have an answer.
  delete process.env.DEEPSEEK_API_KEY;
  await assert.rejects(() => generateJson({ system: "s", user: "u", schema: S }), (e) => e.message === "not_configured");
  console.log("deepseek json ok");
})().catch((e) => { console.error(e); process.exit(1); });
