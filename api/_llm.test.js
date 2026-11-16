// Run: node api/_llm.test.js
const assert = require("assert");
const Module = require("module"); const orig = Module._load;
Module._load = function (r) { if (r === "./_lib") return { sb: async () => ({ ok: true }) }; return orig.apply(this, arguments); };
const { toJsonSchema, parseJsonLoose } = require("./_llm");
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
