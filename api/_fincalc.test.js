const assert = require("assert"); const c = require("./_fin/calc");
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
near(c.cagr(100, 200, 5), 2 ** (1 / 5) - 1); assert.strictEqual(c.cagr(-1, 5, 3), null); assert.strictEqual(c.cagr(100, 0, 3), null);
near(c.growth(118, 100), 0.18); assert.strictEqual(c.growth(5, 0), null); assert.strictEqual(c.growth(5, -3), null);
near(c.margin(30, 120), 0.25); assert.strictEqual(c.margin(1, 0), null);
near(c.roe(20, 110, 90), 0.2); near(c.roe(20, 100), 0.2); assert.strictEqual(c.roe(20, -5, -5), null);
near(c.roic(100, 0.2, 300, 700, 0), 0.08); assert.strictEqual(c.roic(100, 0.2, 0, 0, 0), null);
near(c.debtToEquity(50, 100), 0.5); assert.strictEqual(c.debtToEquity(50, -1), null); near(c.currentRatio(300, 150), 2);
near(c.pe(150, 5), 30); assert.strictEqual(c.pe(150, -1), null); near(c.earningsYield(5, 100), 0.05);
near(c.fcfYield(40, 1000), 0.04); near(c.enterpriseValue(1000, 200, 150), 1050); near(c.evToEbitda(1050, 105), 10);
near(c.peg(30, 0.15), 2); assert.strictEqual(c.peg(30, -0.1), null);
near(c.costOfEquity(0.04, 1.2, 0.05), 0.10); near(c.wacc({ equity: 800, debt: 200, costEquity: 0.1, costDebt: 0.05, taxRate: 0.2 }), 0.8 * 0.1 + 0.2 * 0.05 * 0.8);
// DCF: flat 0 % growth, terminal 0 %, 10 % discount, FCF 100 => perpetuity value 1000 (10 explicit years + terminal sum to 1000)
const d = c.dcf({ fcf: 100, growth: 0, terminalGrowth: 0, discount: 0.1, years: 10, netDebt: 100, shares: 10 });
near(d.enterpriseValue, 1000, 1e-6); near(d.equityValue, 900, 1e-6); near(d.perShare, 90, 1e-6);
assert.strictEqual(c.dcf({ fcf: 100, growth: 0.05, terminalGrowth: 0.06, discount: 0.05 }), null);
const r = c.returnsFrom([100, 110, 99]); near(r[0], 0.1); near(r[1], -0.1);
near(c.volatility([0.01, -0.01, 0.01, -0.01], 252), c.stdev([0.01, -0.01, 0.01, -0.01]) * Math.sqrt(252));
near(c.beta([0.02, -0.02, 0.04, 0.0], [0.01, -0.01, 0.02, 0.0]), 2); assert.strictEqual(c.beta([1], [1]), null);
assert.ok(c.sharpe([0.01, 0.02, -0.005, 0.015, 0.0], 0.02) > 0); assert.strictEqual(c.sharpe([0.01, 0.01], 0), null);
const dd = c.drawdown([100, 120, 90, 110, 80]); near(dd.maxDrawdown, 80 / 120 - 1); assert.strictEqual(dd.peakIndex, 1); assert.strictEqual(dd.troughIndex, 4);
const al = c.portfolioAllocation([{ symbol: "A", value: 300 }, { symbol: "B", value: 100 }, { symbol: "C", value: 0 }]); near(al.weights[0].weight, 0.75); near(al.concentrationHHI, 0.75 ** 2 + 0.25 ** 2);
const pr = c.portfolioReturn([{ quantity: 10, price: 12, costBasis: 100, previousClose: 11 }]); near(pr.pnl, 20); near(pr.returnFraction, 0.2); near(pr.dayChange, 10);
near(c.ttm([{ period: "2025-03-31", x: 1 }, { period: "2025-06-30", x: 2 }, { period: "2025-09-30", x: 3 }, { period: "2025-12-31", x: 4 }, { period: "2024-12-31", x: 99 }], "x"), 10);
console.log("_fincalc.test.js ok");
const partial = c.portfolioReturn([{price:10, quantity:1, costBasis:10}, {price:100, quantity:1}]);
assert.equal(partial.value, 110);
for (const field of ["pnl", "cost", "returnFraction", "dayChange", "dayChangeFraction"]) assert.equal(partial[field], null);
assert.equal(c.portfolioReturn([{quantity:1, price:7, costBasis:0}]).pnl, 7);
for (const dates of [
  ["2026-03-31", "2026-03-31", "2025-12-31", "2025-09-30"],
  ["2026-03-31", "2025-09-30", "2025-06-30", "2025-03-31"]
]) assert.equal(c.ttm(dates.map(period => ({period, eps:10})), "eps"), null);
const bars = (entries) => entries.map(([date, close]) => [date, 0, 0, 0, close]);
const stock = bars([["2025-01-01",100],["2025-01-02",120],["2025-01-04",96],["2025-01-05",96]]);
const index = bars([["2025-01-01",100],["2025-01-02",110],["2025-01-03",115],["2025-01-04",99],["2025-01-05",99]]);
near(c.betaFromBars(stock, index), 2);

// ---- DCF default growth helpers ----
{
  // medianGrowth: median of year-over-year growth, newest first, needs 3 usable observations
  near(c.medianGrowth([160, 140, 120, 100, 90, 80], 5), 1 / 7, 1e-12);                       // growths 14.3, 16.7, 20, 11.1, 12.5 -> median 14.3%
  assert.strictEqual(c.medianGrowth([120, 100, 90], 5), null, "two observations are not enough");
  near(c.medianGrowth([100, 100, 100, 100], 5), 0);
  assert.ok(c.medianGrowth([90, 100, 110, 120, 130], 5) < 0, "a shrinking business has negative median growth");
  // normalizedFcf: mean FCF margin of 3 years x latest revenue
  near(c.normalizedFcf([100, 90, 80], [20, 18, 10], 3), 100 * ((0.2 + 0.2 + 0.125) / 3), 1e-9);
  assert.strictEqual(c.normalizedFcf([100, 90], [20, 18], 3), null, "fewer than 3 years");
  assert.strictEqual(c.normalizedFcf([100, 90, 80], [-5, -4, -3], 3), null, "non-positive average margin");
  // a thin latest year (AMZN-like) no longer decides the base
  assert.ok(c.normalizedFcf([100, 90, 80], [1, 9, 8], 3) > 5, "thin latest year is smoothed");
  // fundableGrowth: ROIC x net reinvestment (|capex| - D&A + R&D) / NOPAT, bounded 0..1; D&A from ebitda - operatingIncome
  const row = { operatingIncome: 100, ebitda: 110, capex: -30, rAndD: 20 };           // NOPAT 79, net reinvestment (30 - 10 + 20) / 79
  near(c.fundableGrowth([row, row, row], 0.5), 0.5 * (40 / 79), 1e-9);
  assert.strictEqual(c.fundableGrowth([{ operatingIncome: -5, capex: -1 }], 0.5), null, "no positive NOPAT");
  assert.strictEqual(c.fundableGrowth([row], null), null);
  assert.ok(c.fundableGrowth([{ operatingIncome: 10, ebitda: 10, capex: -500 }], 1) <= 1, "reinvestment is bounded at 100%");
  // impliedGrowth: running dcf() at the implied growth reproduces the price
  const base = { fcf: 98.767e9, years: 10, terminalGrowth: 0.025, discount: 0.083, netDebt: 3.6e10, shares: 14.59e9 };
  for (const g of [-0.05, 0.0, 0.04, 0.12, 0.3]) {
    const px = c.dcf({ ...base, growth: g }).perShare, ig = c.impliedGrowth({ ...base, price: px });
    near(ig, g, 1e-6); near(c.dcf({ ...base, growth: ig }).perShare, px, 1e-4);
  }
  assert.strictEqual(c.impliedGrowth({ ...base, price: 1e7 }), null, "price above anything 40% growth can justify");
  assert.strictEqual(c.impliedGrowth({ ...base, price: 1 }), null, "price below anything -10% growth gives");
  assert.strictEqual(c.impliedGrowth({ ...base, fcf: -1, price: 100 }), null);
  // discount inputs aligned with the classic Intrinsic value page
  near(c.blumeBeta(1), 1); near(c.blumeBeta(0), 0.33); near(c.blumeBeta(0.74), 0.67 * 0.74 + 0.33); assert.strictEqual(c.blumeBeta(null), null);
  assert.strictEqual(c.ERP_DEFAULT, 0.0441);
}

