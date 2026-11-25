// Run: node api/_finvaluation.test.js
// getValuation: default growth, FCF base, discount inputs and the reverse DCF, on stubbed providers (no network, no database).
const assert = require("assert");
const S = require("./_fin/schemas"), C = require("./_fin/calc");
const P = { sec: require("./_fin/providers/sec"), alpaca: require("./_fin/providers/alpaca"), fred: require("./_fin/providers/fred") };
const svc = require("./_fin/service");
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

// ---- stubs ----
let ROWS = {}, PRICE = {};
const row = (y, o) => S.statement({ symbol: "T", period: `${y}-12-31`, fiscalYear: y, source: "test", ...o });
/* newest first. rev: revenue by year (oldest first), fm: FCF margin by year, to build 6 fiscal years */
const company = (rev, fm, extra = {}) => rev.map((r, i) => row(2020 + i, { revenue: r, operatingIncome: r * 0.3, ebitda: r * 0.35, operatingCashFlow: r * (fm[i] + 0.05), capex: -r * 0.05, rAndD: r * 0.08, totalDebt: 50, shareholdersEquity: 50, cash: 30, interestExpense: 2, ...extra })).reverse();
P.sec.cikFor = async () => "0000000001";
P.sec.companyFacts = async () => ({ entityName: "T", facts: { dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ val: 10, end: "2025-12-31", filed: "2026-01-30", form: "10-K" }] } } }, "us-gaap": {} } });
P.sec.statements = async (s, { type }) => (type === "annual" ? ROWS[s] : []);
P.alpaca.configured = () => true;
P.alpaca.quotes = async (list) => Object.fromEntries(list.map((s) => [s, S.quote({ symbol: s, price: PRICE[s], previousClose: PRICE[s], source: "test", timestamp: "2026-11-25T15:00:00Z" })]));
const days = Array.from({ length: 260 }, (_, i) => new Date(Date.UTC(2025, 10, 1) + i * 864e5).toISOString().slice(0, 10));
P.alpaca.history = async (s) => days.map((d, i) => S.bar(d, 100, 100, 100, 100 + Math.sin(i / 7) * (s === "SPY" ? 2 : 3) + i * 0.02, 1));
P.fred.series = async (id) => S.macroSeries({ id, name: id, unit: "%", frequency: "daily", points: [["2026-11-24", 4.5]], source: "test" });

const get = async (sym, rows, price, overrides) => { ROWS[sym] = rows; PRICE[sym] = price; return (await svc.getValuation(sym, overrides)).data; };

(async () => {
  // 1. steady grower: growth = median revenue growth (8%), FCF base = mean 3-year margin x latest revenue, shape is additive
  const rev = [100, 108, 116.64, 125.97, 136.05, 146.93];
  const d1 = await get("STEADY", company(rev, [0.18, 0.2, 0.2, 0.22, 0.2, 0.2]), 100);
  near(d1.assumptions.growth, 0.08, 1e-3); assert.match(d1.assumptions.growthBasis, /^median 5-year revenue growth 8\.0%/);
  near(d1.assumptions.freeCashFlow, 146.93 * ((0.22 + 0.2 + 0.2) / 3), 1e-6); assert.match(d1.assumptions.fcfBasis, /3-year average/);
  assert.ok(d1.dcf && d1.intrinsicPerShare > 0 && d1.assumptions.discount > 0.025);
  for (const k of ["price", "currency", "intrinsicPerShare", "marginOfSafety", "dcf", "assumptions", "kind", "note"]) assert.ok(k in d1, "existing field kept: " + k);
  for (const k of ["freeCashFlow", "growth", "growthBasis", "terminalGrowth", "discount", "riskFree", "beta", "costOfEquity", "costOfDebt", "netDebt", "shares", "years"]) assert.ok(k in d1.assumptions, "existing assumption kept: " + k);
  assert.strictEqual(d1.assumptions.equityRiskPremium, C.ERP_DEFAULT);
  // 2. reverse DCF: the implied growth reproduces the price on the same assumptions
  assert.ok(d1.impliedGrowth != null, "implied growth is reported");
  near(C.dcf({ fcf: d1.assumptions.freeCashFlow, growth: d1.impliedGrowth, years: 10, terminalGrowth: d1.assumptions.terminalGrowth, discount: d1.assumptions.discount, netDebt: d1.assumptions.netDebt, shares: d1.assumptions.shares }).perShare, d1.price, 1e-3);
  // 3. a price no growth can justify: no number, and the note says which side
  const d3 = await get("PRICEY", company(rev, [0.2, 0.2, 0.2, 0.2, 0.2, 0.2]), 1e7);
  assert.strictEqual(d3.impliedGrowth, null); assert.strictEqual(d3.impliedGrowthNote, "above 40%");
  // 4. fast grower is capped at 12% and says so
  const d4 = await get("FAST", company([100, 125, 156, 195, 244, 305], [0.2, 0.2, 0.2, 0.2, 0.2, 0.2]), 100);
  near(d4.assumptions.growth, 0.12, 1e-9); assert.match(d4.assumptions.growthBasis, /limited by the 12% cap/);
  // 5. capex-heavy latest year (AMZN-like): the smoothed base is far above the thin latest-year FCF
  const d5 = await get("THIN", company([100, 110, 121, 133, 146, 161], [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]).map((r, i) => (i === 0 ? { ...r, freeCashFlow: 1 } : r)), 100);
  assert.ok(d5.assumptions.freeCashFlow > 8, "base uses the 3-year margin, not the 1 of the thin year");
  // 6. a business that shrinks is floored at 0% growth and labelled
  const d6 = await get("SHRINK", company([150, 140, 130, 120, 110, 100], [0.2, 0.2, 0.2, 0.2, 0.2, 0.2]), 100);
  assert.strictEqual(d6.assumptions.growth, 0); assert.match(d6.assumptions.growthBasis, /floored at 0%/);
  // 7. negative cash flow: no DCF, no intrinsic value, no margin of safety
  const d7 = await get("LOSS", company(rev, [-0.1, -0.1, -0.1, -0.1, -0.1, -0.1]), 100);
  assert.strictEqual(d7.dcf, null); assert.strictEqual(d7.intrinsicPerShare, null); assert.strictEqual(d7.marginOfSafety, null); assert.strictEqual(d7.impliedGrowth, null);
  // 8. short history: latest fiscal-year FCF and the labelled default growth
  const d8 = await get("NEW", company([100, 120], [0.2, 0.2]), 100);
  assert.match(d8.assumptions.fcfBasis, /fewer than 3 years/); assert.strictEqual(d8.assumptions.growth, 0.05); assert.match(d8.assumptions.growthBasis, /fewer than 4 years/);
  // 9. overrides win and are named
  const d9 = await get("STEADY", company(rev, [0.2, 0.2, 0.2, 0.2, 0.2, 0.2]), 100, { growth: 0.03, discount: 0.09, fcf: 50 });
  assert.strictEqual(d9.assumptions.growth, 0.03); assert.strictEqual(d9.assumptions.growthBasis, "user override"); assert.strictEqual(d9.assumptions.discount, 0.09); assert.strictEqual(d9.assumptions.freeCashFlow, 50); assert.strictEqual(d9.assumptions.fcfBasis, "user override");
  // 10. Blume-adjusted beta feeds the cost of equity; the raw beta is still reported
  const a = d1.assumptions; assert.ok(a.beta != null && a.betaAdjusted != null); near(a.betaAdjusted, C.blumeBeta(a.beta));
  near(a.costOfEquity, a.riskFree + Math.max(0.6, Math.min(2, a.betaAdjusted)) * C.ERP_DEFAULT, 1e-9);
  // 11. the fundable-growth check: a business with a lot of capital and little reinvestment cannot be given growth its returns do not fund
  const d11 = await get("HEAVY", company(rev, [0.2, 0.2, 0.2, 0.2, 0.2, 0.2], { shareholdersEquity: 2000 }), 100);
  assert.ok(d11.assumptions.growth < 0.08 - 1e-3, "limited below the 8% revenue growth"); assert.match(d11.assumptions.growthBasis, /limited by fundable growth \d+\.\d%/);
  assert.ok(d11.assumptions.growthSources.fundableCeiling >= d11.assumptions.terminalGrowth, "never below the terminal rate");
  console.log("_finvaluation.test.js ok");
})().catch((e) => { console.error(e); process.exit(1); });
