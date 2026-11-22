// Run: node api/_licensing.test.js
// DATA_BLOCKED_SOURCES fails closed: a blocked provider is never called, and other providers or "no data" take its place.
const assert = require("assert");
process.env.DATA_BLOCKED_SOURCES = "Yahoo, ";
let fetched = 0; global.fetch = async () => { fetched++; throw new Error("network must not be used for a blocked source"); };
const L = require("./_licensing");
assert.strictEqual(L.allowed("yahoo"), false); assert.strictEqual(L.allowed("alpaca"), true);
assert.strictEqual(L.policyTag(), "|blocked:yahoo");
const svc = require("./_fin/service");
(async () => {
  let yahooRan = false;
  const r = await svc.chain("quote", [[{ name: "yahoo", configured: () => true }, async () => { yahooRan = true; return 1; }], [{ name: "fmp", configured: () => true }, async () => 2]]);
  assert.strictEqual(yahooRan, false); assert.strictEqual(r.source, "fmp"); assert.deepStrictEqual(r.attempts.map((a) => a.status), ["blocked", "ok"]);
  await assert.rejects(() => svc.chain("history", [[{ name: "yahoo", configured: () => true }, async () => [1]]]), /no_provider_for_history/);
  const intl = require("./_intl");
  assert.deepStrictEqual(await intl.intlSeries(["7203.T", "PTT.BK"]), {}, "non-US history is withheld, not fetched or read from cache");
  assert.deepStrictEqual(await require("./_fin/providers/news").company("AAPL"), []);
  assert.strictEqual(fetched, 0);
  process.env.DATA_BLOCKED_SOURCES = ""; assert.strictEqual(L.allowed("yahoo"), true); assert.strictEqual(L.policyTag(), "");
  console.log("licensing tests ok");
})().catch((e) => { console.error(e); process.exit(1); });
