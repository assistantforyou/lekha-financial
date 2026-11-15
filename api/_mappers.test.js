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

// --- daily series + rotation CSV ---
const { dailyFrom, rotationCsv } = require("./_mappers");
const ts = { "Time Series (Daily)": { "2026-11-13": { "4. close": "754.37" }, "2026-11-12": { "4. close": "757.12" }, "2026-11-11": { "4. close": "0" } } };
const d = dailyFrom(ts);
assert.deepStrictEqual(d, [["2026-11-12", 757.12], ["2026-11-13", 754.37]]);
assert.strictEqual(dailyFrom({}), null);
const csv = rotationCsv({ SPY: d, XLK: [["2026-11-13", 200]] });
const lines = csv.split("\n");
assert.strictEqual(lines[0], "D|SPY,,LIVE|SPY,TDATE|SPY,D|XLK,,LIVE|XLK,TDATE|XLK");
assert.strictEqual(lines[1], ",,754.37,2026-11-13,,,200,2026-11-13");
assert.strictEqual(lines[2].split(",")[0], String(Math.round(Date.parse("2026-11-12T00:00:00Z") / 864e5) + 25569)); // 46308-ish serial
assert.strictEqual(lines[3].split(",").slice(4, 6).join(","), ","); // shorter series padded blank
// round-trip through the page's own expectations: serial -> same UTC day
const serial = Number(lines[2].split(",")[0]);
assert.strictEqual(new Date(Math.floor(serial - 25569) * 86400000).toISOString().slice(0, 10), "2026-11-12");
console.log("series + csv ok");

// --- FRED ---
const { fredRows, yoyRows, macroFromFred, fredHistFrom } = require("./_mappers");
const fr = fredRows("observation_date,X\n2025-10-01,100\n2025-11-01,\n2026-10-01,103.5\nbad,1\n");
assert.deepStrictEqual(fr, [["2025-10-01", 100], ["2026-10-01", 103.5]]);
assert.deepStrictEqual(yoyRows(fr), [["2026-10-01", 3.5]]);
const mf = macroFromFred(fr, [["2026-10-01", 4.1]], [["2026-10-01", 5.1]]);
assert.strictEqual(mf.source, "FRED"); assert.ok(mf.sources.cpi.includes("fred.stlouisfed.org")); assert.deepStrictEqual(mf.cpiYoY, [["2026-10-01", 3.5]]);
const fh = fredHistFrom({ UNRATE: [["2026-09-01", 4.3]], USREC: [] });
assert.strictEqual(fh.series.UNRATE["2026-09"], 4.3);
assert.strictEqual(fredHistFrom({ A: [] }), null);
console.log("fred ok");
