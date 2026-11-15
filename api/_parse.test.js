// Run: node api/_parse.test.js   (handler tests with a mocked LLM; no network)
const assert = require("assert");
process.env.PT_IMPORT_PASSCODE = "pass-123";
const Module = require("module");
const orig = Module._load;
let calls = 0, counter = 0;
Module._load = function (req, parent, isMain) {
  if (req === "./_llm") return { extractWithGemini: async (i) => { calls++; if (i.text && i.text.includes("FAIL")) throw Object.assign(new Error("x"), { status: 502 });
    return { account: "T", positions: [{ kind: "security", ticker: "SPY", quantity: 2, price: 100, currency: "USD", evidence: i.text ? i.text.slice(0, 30) : "pdf" }] }; } };
  if (req === "./_lib") return { cacheGet: async () => ({ payload: { n: counter } }), cacheSet: async (k, v) => { counter = v.n; } };
  return orig.apply(this, arguments);
};
const handler = require("./parse-positions");
const run = async (method, headers, body) => { const out = {}; await handler({ method, headers, body }, { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.body = j; return this; } }); return out; };
(async () => {
  assert.strictEqual((await run("GET", {}, {})).status, 405);
  assert.strictEqual((await run("POST", {}, { text: "x" })).status, 401);
  assert.strictEqual((await run("POST", { "x-pt-passcode": "nope" }, { text: "x" })).status, 401);
  const ok = await run("POST", { "x-pt-passcode": "pass-123" }, { text: "acct 123456789012 SPY 2" });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.positions[0].tk, "SPY");
  assert.ok(ok.body.positions[0].evidence.includes("********9012"), "account number masked before the model saw it");
  assert.strictEqual((await run("POST", { "x-pt-passcode": "pass-123" }, { mime: "application/exe", data: "AAAA" })).status, 400);
  const pdf = await run("POST", { "x-pt-passcode": "pass-123" }, { mime: "application/pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") });
  assert.strictEqual(pdf.status, 200);
  assert.strictEqual((await run("POST", { "x-pt-passcode": "pass-123" }, { text: "FAIL" })).status, 502);
  counter = 40; // daily cap reached
  assert.strictEqual((await run("POST", { "x-pt-passcode": "pass-123" }, { text: "x" })).status, 429);
  console.log("parse handler ok, llm calls:", calls);
})();
