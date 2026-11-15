// Run: node api/_mappers.test.js
const assert = require("assert");
const { cpiYoY, macroFrom, newsFrom } = require("./_mappers");
const cpi = { data: Array.from({ length: 14 }, (_, i) => ({ date: `2026-${String(14 - i).padStart(2, "0") > 12 ? "12" : String(14 - i).padStart(2, "0")}-01`, value: "x" })) };
const mk = (n) => ({ data: Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2025, 0, 1)); d.setUTCMonth(d.getUTCMonth() + (n - 1 - i)); return { date: d.toISOString().slice(0, 10), value: String(100 + (n - 1 - i)) }; }) });
const y = cpiYoY(mk(14));
assert.strictEqual(y.length, 2);
assert.strictEqual(y[0][1], 12.0); // 112/100 - 1 -> 12.00
const m = macroFrom(mk(14), { data: [{ date: "2026-10-01", value: "4.1" }, { date: "2026-09-01", value: "." }] }, { data: [] });
assert.deepStrictEqual(m.fedFunds, [["2026-10-01", 4.1]]);
assert.strictEqual(macroFrom({}, {}, {}), null);
const n = newsFrom({ feed: [
  { title: "A", url: "https://x.test/a", time_published: "20261115T120000", overall_sentiment_label: "Somewhat-Bullish", overall_sentiment_score: 0.21, ticker_sentiment: [{ ticker: "SPY" }], source: "S", summary: "s" },
  { title: "B", url: "javascript:alert(1)", time_published: "20261115T130000" },
  { title: "C", url: "https://x.test/c", time_published: "20261114T010000", overall_sentiment_label: "Bearish" },
] });
assert.deepStrictEqual(n.map((d) => d.id), ["2026-11-15", "2026-11-14"]);
assert.strictEqual(n[0].data.items.length, 1); // javascript: URL dropped
assert.strictEqual(n[0].data.items[0].impact, "Bullish");
assert.strictEqual(n[1].data.items[0].impact, "Bearish");
console.log("mappers ok");
