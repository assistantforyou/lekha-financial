// Run: node api/_parse.test.js   (handler tests with a mocked LLM; no network)
const assert = require("assert");
const Module = require("module");
const orig = Module._load;
let calls = 0, counter = 0;
Module._load = function (req, parent, isMain) {
  if (req === "./_llm") return { extractStatement: async (i) => { calls++; if (i.text && i.text.includes("FAIL")) throw Object.assign(new Error("x"), { status: 502 });
    return { account: "T", positions: [{ kind: "security", ticker: "SPY", quantity: 2, price: 100, currency: "USD", evidence: i.text ? i.text.slice(0, 30) : "pdf" }] }; } };
  if (req === "./_lib") return { rateHit: async (k, limit) => { if (counter >= limit) return false; counter++; return true; } };
  return orig.apply(this, arguments);
};
// two-reader mode: the mock returns a second, slightly different reading for image uploads
let second = null;
const base = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "./_llm") { const m = base.call(this, req, parent, isMain); return { ...m, extractVerified: async (i) => ({ raw: await m.extractStatement(i), second: i.images || i.mime ? second : null }) }; }
  return base.apply(this, arguments);
};
const handler = require("./parse-positions");
const run = async (method, headers, body) => { const out = {}; await handler({ method, headers, body }, { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.body = j; return this; } }); return out; };
(async () => {
  assert.strictEqual((await run("GET", {}, {})).status, 405);
  const ok = await run("POST", {}, { text: "acct 123456789012 SPY 2" });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.positions[0].tk, "SPY");
  assert.ok(ok.body.positions[0].evidence.includes("********9012"), "account number masked before the model saw it");
  assert.strictEqual((await run("POST", {}, { mime: "application/exe", data: "AAAA" })).status, 400);
  const pdf = await run("POST", {}, { mime: "application/pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") });
  assert.strictEqual(pdf.status, 200);
  assert.strictEqual((await run("POST", {}, { text: "FAIL" })).status, 502);
  counter = 40; // daily cap reached
  assert.strictEqual((await run("POST", {}, { text: "x" })).status, 429);
  // second reader disagrees on quantity and finds an extra line: both surface, nothing is dropped
  counter = 0; second = { account: "T", positions: [{ kind: "security", ticker: "SPY", quantity: 3, price: 100, currency: "USD", evidence: "SPY 3" }, { kind: "security", ticker: "QQQ", quantity: 1, price: 50, currency: "USD", evidence: "QQQ 1" }] };
  const two = await run("POST", {}, { mime: "application/pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") });
  assert.strictEqual(two.status, 200);
  const spy = two.body.positions.find((p) => p.tk === "SPY"), qqq = two.body.positions.find((p) => p.tk === "QQQ");
  assert.ok(spy.flags.some((f) => f.includes("disagree on quantity")), "quantity disagreement flagged");
  assert.ok(qqq && qqq.flags.some((f) => f.includes("second reader only")), "line only the second reader saw is kept and flagged");
  assert.ok(two.body.warnings.some((w) => w.includes("independent readers")));
  second = null;
  console.log("parse handler ok, llm calls:", calls);
})();
