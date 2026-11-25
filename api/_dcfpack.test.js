// Run: node api/_dcfpack.test.js
// api/_fin/valuation/pack.mjs: filings and a quote to the engine's input. The cases are the real-world ones that went wrong:
// a 2010 cover-page share count (Visa), a multi-class mismatch, a filer that does not tag operating income (JNJ), payment networks filed under Financials (Visa, Mastercard).
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const near = (a, b, e = 1e-9, m = "") => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${m} ${a} !~ ${b}`);

(async () => {
  const P = await import(pathToFileURL(path.join(__dirname, "_fin", "valuation", "pack.mjs")).href), E = await import(pathToFileURL(path.join(__dirname, "_fin", "valuation", "engine.mjs")).href);

  // ---- who is a balance-sheet financial ----
  const fin = (sector, row, industry) => P.isBalanceSheetFinancial({ sector, industry, row });
  assert.strictEqual(fin("Financials", { totalAssets: 4000, totalLiabilities: 3650, revenue: 170 }), true, "a bank: liabilities 91% of assets, revenue 4% of assets");
  assert.strictEqual(fin("Financials", { totalAssets: 700, totalLiabilities: 640, revenue: 70 }), true, "an insurer");
  assert.strictEqual(fin("Financials", { totalAssets: 270, totalLiabilities: 245, revenue: 65 }), true, "a card lender: revenue is 24% of assets");
  assert.strictEqual(fin("Financials", { totalAssets: 90, totalLiabilities: 52, revenue: 40 }), false, "Visa: sector Financials, but an operating business");
  assert.strictEqual(fin("Financials", { totalAssets: 54, totalLiabilities: 46, revenue: 33 }), false, "Mastercard: leveraged by buybacks but earns 61% of assets in revenue");
  assert.strictEqual(fin("Information Technology", { totalAssets: 100, totalLiabilities: 95, revenue: 5 }), false, "sector decides first");
  assert.strictEqual(fin(null, { totalAssets: 100, totalLiabilities: 92, revenue: 4 }, "STATE COMMERCIAL BANKS"), true, "SIC text can name a bank when the sector is unknown");
  assert.strictEqual(fin("Financials", { totalAssets: 100, totalLiabilities: 92 }), true, "missing revenue does not exempt a leveraged financial");
  assert.strictEqual(fin("Financials", null), false); assert.strictEqual(fin("Financials", { totalAssets: 0, totalLiabilities: 0 }), false);

  // ---- share count ----
  const row = (o = {}) => ({ netIncome: 20e9, eps: 10, basicShares: null, dilutedShares: null, ...o });
  const sc = (o) => P.shareCount({ today: "2026-11-25", ...o });
  { // Visa: the data feed's latest cover-page value is from 2010, which is not trusted; net income over EPS gives about 2.0 billion
    const r = sc({ cover: 469280842, coverAsOf: "2010-01-27", row: row() }); assert.strictEqual(r.basis, "net income / diluted EPS"); near(r.count, 2e9, 1e-9); assert.strictEqual(r.dilution, 0); assert.match(r.note, /too old to rely on/);
    // with a weighted count reported, that is used instead
    const w = sc({ cover: 469280842, coverAsOf: "2010-01-27", row: row({ basicShares: 1.95e9, dilutedShares: 1.96e9 }) }); assert.strictEqual(w.basis, "weighted average basic"); assert.strictEqual(w.count, 1.95e9); near(w.dilution, 1.96 / 1.95 - 1, 1e-12);
  }
  { // a recent, consistent cover-page count is the best answer
    const r = sc({ cover: 15.0e9, coverAsOf: "2025-10-17", row: row({ basicShares: 14.9e9, dilutedShares: 15.0e9 }) }); assert.strictEqual(r.count, 15.0e9); assert.match(r.basis, /^cover page \(2025-10-17\)/); assert.strictEqual(r.note, null); near(r.dilution, 15.0 / 14.9 - 1, 1e-12);
    // no date given: treated as current
    assert.strictEqual(sc({ cover: 15.0e9, row: row({ basicShares: 14.9e9 }) }).count, 15.0e9);
    // a count just inside the age limit is fine, just outside is not
    assert.strictEqual(sc({ cover: 15.0e9, coverAsOf: "2025-08-23", row: row({ basicShares: 14.9e9 }) }).count, 15.0e9);
    assert.strictEqual(sc({ cover: 15.0e9, coverAsOf: "2025-08-26", row: row({ basicShares: 14.9e9 }) }).count, 15.0e9, "456 days is inside the 460-day limit");
    assert.strictEqual(sc({ cover: 15.0e9, coverAsOf: "2025-08-01", row: row({ basicShares: 14.9e9 }) }).count, 14.9e9, "481 days is outside it: falls back to the weighted average");
  }
  { // several share classes: the feed carries one class, so the cover count is far from the weighted average; the weighted average wins and says why
    const r = sc({ cover: 0.6e9, coverAsOf: "2025-11-01", row: row({ basicShares: 2.4e9, dilutedShares: 2.42e9 }) }); assert.strictEqual(r.count, 2.4e9); assert.match(r.note, /several share classes/);
    const hi = sc({ cover: 5e9, coverAsOf: "2025-11-01", row: row({ basicShares: 2.4e9 }) }); assert.strictEqual(hi.count, 2.4e9);
  }
  { // net income not reported: pre-tax income less tax stands in for it
    const r = sc({ cover: 469280842, coverAsOf: "2010-01-27", row: { netIncome: null, pretaxIncome: 26e9, incomeTax: 5e9, eps: 10.5 } }); assert.strictEqual(r.basis, "net income / diluted EPS"); near(r.count, 21e9 / 10.5, 1e-12);
  }
  { // nothing usable
    const n = sc({ cover: null, row: { netIncome: -5, eps: -1 } }); assert.strictEqual(n.count, null); assert.strictEqual(n.basis, null); assert.match(n.note, /shown in total rather than per share/);
    const stale = sc({ cover: 469280842, coverAsOf: "2010-01-27", row: { netIncome: 20e9, eps: null } }); assert.strictEqual(stale.count, null); assert.match(stale.note, /too old to rely on.*shown in total/);
    const only = sc({ cover: 3e9, coverAsOf: "2025-11-01", row: { netIncome: -5, eps: -1 } }); assert.strictEqual(only.count, 3e9, "no weighted reference to contradict it");
    assert.strictEqual(sc({ cover: undefined, row: row({ dilutedShares: 1e9 }) }).basis, "weighted average diluted");
  }

  // ---- the pack ----
  const stmt = (fy, o = {}) => ({ fiscalYear: fy, periodEnd: `${fy}-12-31`, currency: "USD", revenue: 100 + fy - 2020, operatingIncome: 30, pretaxIncome: 28, interestExpense: 4, incomeTax: 5, netIncome: 22, eps: 2.2, shareholdersEquity: 80, totalDebt: 20, leaseLiabilities: 3, minorityInterest: 1, preferredEquity: 2, cash: 15, shortTermInvestments: 5, longTermInvestments: 7, totalAssets: 200, totalLiabilities: 100, ...o });
  const A = [stmt(2025), stmt(2024), stmt(2023)];
  const pk = P.makePack({ symbol: "T", name: "T Inc", statements: A, quote: { price: 50, currency: "USD" }, rf: 0.045, basicShares: 10, sharesAsOf: "2026-02-01", sector: "Industrials", today: "2026-06-30", asOf: null });
  assert.strictEqual(pk.comparable, true); assert.strictEqual(pk.price, 50); assert.strictEqual(pk.rf, 0.045); assert.strictEqual(pk.currency, "USD"); assert.strictEqual(pk.isFinancial, false);
  assert.deepStrictEqual(pk.bridge, { cash: 15, sti: 5, lti: 7, debt: 20, leases: 3, minority: 1, preferred: 2 });
  assert.strictEqual(pk.history.length, 3); assert.strictEqual(pk.history[0].fy, 2025); assert.strictEqual(pk.history[0].equity, 80); assert.strictEqual(pk.history[0].lti, 7); assert.strictEqual(pk.history[0].leases, 3);
  near(pk.stub, (Date.parse("2026-06-30") - Date.parse("2025-12-31")) / (365.25 * 864e5), 1e-9, "years since the fiscal year end"); assert.strictEqual(pk.latestFiscalYearEnd, "2025-12-31");
  assert.strictEqual(pk.erp, E.CONST.ERP); assert.strictEqual(P.makePack({ statements: A, today: "2026-01-01", erp: 0.05 }).erp, 0.05);
  assert.strictEqual(pk.beta, null, "no price bars, no beta");
  JSON.stringify(pk);   // serialisable: the server hands it to the browser as is
  // currencies must match for a per-share comparison with the price
  assert.strictEqual(P.makePack({ statements: A, quote: { price: 50, currency: "HKD" }, today: "2026-01-01" }).comparable, false);
  assert.strictEqual(P.makePack({ statements: A, quote: null, today: "2026-01-01" }).comparable, false);
  assert.strictEqual(P.makePack({ statements: [], quote: null, today: "2026-01-01" }).history.length, 0, "empty filings do not throw");
  assert.strictEqual(P.makePack({}).history.length, 0);

  // ---- operating income rebuilt for filers that do not tag it (JNJ) ----
  { const j = P.makePack({ statements: [stmt(2025, { operatingIncome: null, pretaxIncome: 32.6, interestExpense: -1.2 }), stmt(2024, { operatingIncome: null, pretaxIncome: 16.7, interestExpense: null }), stmt(2023, { operatingIncome: 31 })], today: "2026-01-01" });
    near(j.history[0].ebit, 32.6 + 1.2, 1e-12, "pre-tax income plus interest expense"); near(j.history[1].ebit, 16.7, 1e-12, "no interest expense: pre-tax income"); assert.strictEqual(j.history[2].ebit, 31, "reported operating income wins");
    const none = P.makePack({ statements: [stmt(2025, { operatingIncome: null, pretaxIncome: null })], today: "2026-01-01" }); assert.strictEqual(none.history[0].ebit, null);
    // and the engine can now value it
    const big = Array.from({ length: 6 }, (_, i) => stmt(2025 - i, { operatingIncome: null, revenue: 100 * 1.06 ** (5 - i), pretaxIncome: 25 * 1.06 ** (5 - i), interestExpense: 1 })), jp = P.makePack({ statements: big, quote: { price: 40, currency: "USD" }, basicShares: 10, rf: 0.045, sector: "Health Care", today: "2026-01-01" });
    assert.strictEqual(E.defaults(jp).applicable, "fcff", "a filer without tagged operating income is no longer 'not applicable'"); }

  // ---- the share note reaches the engine's warnings ----
  { const w = P.makePack({ statements: A, quote: { price: 50, currency: "USD" }, basicShares: 4.7e8, sharesAsOf: "2010-01-27", today: "2026-01-01", rf: 0.045 }); assert.match(w.sharesNote, /too old/);
    assert.ok(E.defaults(w).warnings.some((x) => /too old/.test(x))); assert.strictEqual(w.shares.basis, "net income / diluted EPS"); near(w.shares.basic, 22 / 2.2, 1e-12); }
  console.log("_dcfpack.test.js ok");
})().catch((e) => { console.error(e); process.exit(1); });
