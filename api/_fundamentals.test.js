// Offline tests for SEC XBRL extraction and the VALIN / PEER CSV builders. Run: node api/_fundamentals.test.js
const assert = require("assert");
const { buildFund, epsTtm, sharesOutstanding, ttmOf, betaOf, valinCsv, peerCsv, classify } = require("./_fundamentals");

const ann = (end, val, extra) => ({ start: String(+end.slice(0, 4) - 1) + end.slice(4), end, val, form: "10-K", filed: end, ...extra });
const q = (start, end, val) => ({ start, end, val, form: "10-Q", filed: end });
const inst = (end, val) => ({ end, val, form: "10-Q", filed: end });
const facts = {
  "us-gaap": {
    Revenues: { units: { USD: [ann("2023-12-31", 100e9), ann("2024-12-31", 120e9), ann("2025-12-31", 150e9)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [ann("2023-12-31", 30e9), ann("2024-12-31", 36e9), ann("2025-12-31", 45e9)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [ann("2023-12-31", 5e9), ann("2024-12-31", 6e9), ann("2025-12-31", 8e9)] } },
    ShareBasedCompensation: { units: { USD: [ann("2024-12-31", 2e9), ann("2025-12-31", 3e9)] } },
    CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst("2025-12-31", 20e9)] } },
    MarketableSecuritiesCurrent: { units: { USD: [inst("2025-12-31", 10e9), inst("2024-12-31", 99e9)] } },
    LongTermDebt: { units: { USD: [inst("2025-12-31", 12e9)] } },
    EarningsPerShareDiluted: { units: { "USD/shares": [
      ann("2025-12-31", 4.0),
      q("2026-01-01", "2026-09-30", 3.5), q("2025-01-01", "2025-09-30", 3.0),
    ] } },
  },
  dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: "2026-10-20", val: 1e9 }, { end: "2026-10-20", val: 2e8 }] } } },
};

// fund document: newest first, millions of USD, FCF = OCF - capex
const { doc, why } = buildFund("TST", facts, { sector: "Health Care", sic: "2834" });
assert.strictEqual(why, null);
assert.deepStrictEqual(doc.rev, [150000, 120000, 100000]);
assert.deepStrictEqual(doc.fcf, [37000, 30000, 25000]);
assert.deepStrictEqual(doc.sbc, [3000, 2000, null]);
assert.deepStrictEqual(doc.cols, ["FY2025", "FY2024", "FY2023"]);
assert.strictEqual(doc.debt, 12000);
assert.strictEqual(doc.netcash, 18000);          // cash 20 + securities 10 (same date only) - debt 12; the 2024 securities value is ignored
assert.strictEqual(doc.method, "dcf");
assert.strictEqual(doc.fc.basis, "trailing");
assert.deepStrictEqual(doc.fc.rev, [null, null, null]);
assert.ok(doc.fc.g > 20 && doc.fc.g <= 40);       // 3 years of 22% CAGR, within the cap
assert.strictEqual(doc.fc.pt, null);

// too little history or missing tags -> no document, with a reason (the page then shows nothing rather than invented numbers)
assert.strictEqual(buildFund("X", { "us-gaap": {} }, {}).doc, null);
assert.strictEqual(buildFund("X", { "us-gaap": { Revenues: facts["us-gaap"].Revenues, NetCashProvidedByUsedInOperatingActivities: facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities } }, {}).why, "fewer_than_3_years");

// trailing EPS = FY + YTD - prior YTD
assert.deepStrictEqual(epsTtm(facts), { eps: 4.5, end: "2026-09-30" });
assert.strictEqual(ttmOf(facts, ["Revenues"], "USD").val, 150e9); // no quarters reported: the last fiscal year
assert.strictEqual(sharesOutstanding(facts), 1.2e9);              // multi-class filers add up
// a YTD fact with no prior-year comparative: use the last fiscal year, never a guess
const noPrior = { "us-gaap": { EarningsPerShareDiluted: { units: { "USD/shares": [ann("2025-12-31", 4.0), q("2026-01-01", "2026-09-30", 3.5)] } } } };
assert.strictEqual(epsTtm(noPrior).eps, 4);

// style class
assert.strictEqual(classify({ sector: "Energy", margins: [10, 12], growth: 0 }), "cyclical");
assert.strictEqual(classify({ sector: "Information Technology", sic: "3674", margins: [10, 12], growth: 0.1 }), "cyclical");
assert.strictEqual(classify({ sector: "Health Care", margins: [-3, -1, -2], growth: 0.2 }), "speculative");
assert.strictEqual(classify({ sector: "Health Care", margins: [25, 27, 24], growth: 0.1 }), "quality");
assert.strictEqual(classify({ sector: "Health Care", margins: [5, 20, 9], growth: 0.1 }), "growth");

// beta: a series that moves 1.5x the benchmark has beta 1.5; too short -> null
const dates = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10));
let b = 100, s = 100; const bench = [], stock = [];
dates.forEach((d, i) => { const r = Math.sin(i * 1.7) * 0.01; b *= 1 + r; s *= 1 + 1.5 * r; bench.push([d, b]); stock.push([d, s]); });
assert.ok(Math.abs(betaOf(stock, bench) - 1.5) < 0.02);
assert.strictEqual(betaOf(stock.slice(0, 50), bench), null);

// CSVs the page parsers read
const v = valinCsv([{ t: "AAA", px: 10.5, mcap: 2e9, sh: 1.9e8, beta: 1.1, eps: 2, pe: 5.25, cur: "USD", tt: "stock" }, { t: "FND", px: 50, tt: "fund" }], "2026-11-16 00:00 UTC");
const vl = v.trim().split("\n");
assert.strictEqual(vl[0], "Ticker,Price,MarketCap,Shares,Beta,PE,EPS,Currency,Type");
assert.strictEqual(vl[1], "AAA,10.5,2000000000,190000000,1.1,5.25,2,USD,stock");
assert.strictEqual(vl[2], "FND,50,,,,,,USD,fund");
assert.strictEqual(vl[3], "UPDATED,2026-11-16 00:00 UTC");
assert.strictEqual(valinCsv([], "x"), null);
const p = peerCsv([{ t: "AAA", sector: "Health Care", eps: 2, price: 10, mcap: 3e9 }, { t: "BBB", sector: "Energy", eps: null, price: 5, mcap: null }], "at");
assert.strictEqual(p.split("\n")[0], "Ticker,Sector,Member,EPS (ttm),Price,Market cap,Calculated at (sheet time)");
assert.strictEqual(p.split("\n")[1], "AAA,Health Care,Y,2,10,3000000000,at");
assert.strictEqual(p.split("\n")[2], "BBB,Energy,Y,,5,,");
// untrusted text cannot break out of a CSV cell
assert.ok(!valinCsv([{ t: 'A,"B\n', px: 1 }], "x").split("\n")[1].includes('"'));

console.log("fundamentals tests ok");
