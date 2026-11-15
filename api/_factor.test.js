// Run: node api/_factor.test.js
const assert = require("assert");
const Module = require("module"); const orig = Module._load;
Module._load = function (r) {
  if (r === "./_prices") return { getSeries: async () => ({ data: {} }) };
  if (r === "./_lib") return { cached: async (k, t, f) => f(), rateHit: async () => true };
  return orig.apply(this, arguments);
};
const { factorCsv } = require("./_factor");
const csv = factorCsv([
  { tk: "SPY", kind: "Factor", weekly: [["2026-11-06", 750], ["2026-11-13", 754.27]] },
  { tk: "NVDA", kind: "Holding", weekly: [["2026-11-13", 162.84]] },          // one point: skipped
  { tk: "XLK", kind: "Sector", weekly: [["2026-11-06", 300], ["2026-11-13", 290]] },
], "now");
const L = csv.split("\n");
assert.strictEqual(L[0], "Ticker,Kind,Weekly closes (yymmdd:close),Calculated at (sheet time)");
assert.strictEqual(L[1], "SPY,Factor,261106:750;261113:754.27,now");
assert.strictEqual(L.length, 3);
assert.strictEqual(factorCsv([], "x"), null);
// the page's own parser rules: header startsWith "Weekly closes", Kind column, yymmdd:close pairs
const head = L[0].split(","); assert.ok(head.findIndex((x) => /^Weekly closes/.test(x)) === 2 && head.indexOf("Kind") === 1);
console.log("factor ok");
