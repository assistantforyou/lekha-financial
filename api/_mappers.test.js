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

// --- breadth flags ---
const { breadthFlags, breadthCsv } = require("./_mappers");
const up = Array.from({ length: 330 }, (_, i) => 100 + i);      // steadily rising: always above both averages
assert.strictEqual(breadthFlags(up), "1111111111");
const down = Array.from({ length: 330 }, (_, i) => 500 - i);    // steadily falling: below both
assert.strictEqual(breadthFlags(down), "0000000000");
const short = Array.from({ length: 120 }, (_, i) => 100 + i);   // enough for 50d at offsets <=63, never for 200d
assert.strictEqual(breadthFlags(short)[0], "1"); // now vs 50d is computable with 120 bars
assert.strictEqual(breadthFlags(short)[1], "x");
assert.strictEqual(breadthFlags(short)[8], "x"); // 126 days ago: no 50d average yet either
const csvB = breadthCsv([["AAA", "Energy", 330, 429, "1111111111", "2026-11-13"]], "2026-11-16 12:00");
assert.strictEqual(csvB.split("\n")[1], "AAA,Energy,330;429;1111111111,2026-11-13,2026-11-16 12:00");
console.log("breadth ok");

// --- overbought/oversold ---
const { wilderRSI, obCodes, obosCsv } = require("./_mappers");
const flat = Array.from({ length: 20 }, () => 100);
assert.strictEqual(wilderRSI(flat)[14], 100);                       // no losses -> RSI 100
const rise = Array.from({ length: 60 }, (_, i) => 100 + i);
assert.strictEqual(wilderRSI(rise)[59], 100);
const fall = Array.from({ length: 60 }, (_, i) => 200 - i);
assert.ok(wilderRSI(fall)[59] < 1);
assert.strictEqual(wilderRSI([1, 2, 3])[2], null);
const dates = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const barsUp = dates.map((d, i) => [d, 100 + i]);
const cal = dates.slice(-3);
assert.strictEqual(obCodes(barsUp, cal), `${dates[69]}|3|b1b1b1`);  // RSI 100 -> overbought, above rising 50d
const missing = barsUp.filter((b) => b[0] !== dates[68]);
assert.strictEqual(obCodes(missing, cal), `${dates[69]}|3|b1xxb1`); // a session with no bar for the stock is xx
const early = obCodes(barsUp.slice(0, 20), dates.slice(17, 20));    // too little history for the 50d average
assert.ok(early.endsWith("|3|bxbxbx"));
const csvO = obosCsv([["AAA", "Information Technology", "", `${dates[69]}|3|b1b1b1`]], { SPY: [["2026-11-12", 757.12], ["2026-11-13", 754.37]] }, "2026-11-16 12:00 UTC");
const lo = csvO.split("\n");
assert.strictEqual(lo[0], "Ticker,Group,Industry,Codes,Closes,Calculated at (sheet time)");
assert.strictEqual(lo[2], "SPY,ETF,,,261112:757.12;261113:754.37,2026-11-16 12:00 UTC");
console.log("obos ok");
