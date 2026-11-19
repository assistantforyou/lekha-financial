// Deterministic financial calculations. The AI never does arithmetic: it calls these (through the agent's tools) and explains the result.
// Conventions: rates/growth/margins/yields are FRACTIONS (0.18 = 18 %). Money is in whatever single currency unit the caller passes; callers must not mix units.
// Every function returns null (not NaN/Infinity) when an input is missing or the result would be meaningless (e.g. growth off a non-positive base).
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const ok = (...a) => a.every(fin);
const safe = (x) => (fin(x) ? x : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const stdev = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

// ---------- growth ----------
const cagr = (begin, end, years) => (ok(begin, end, years) && begin > 0 && end > 0 && years > 0 ? safe((end / begin) ** (1 / years) - 1) : null);
const growth = (curr, prev) => (ok(curr, prev) && prev > 0 ? safe(curr / prev - 1) : null);   // YoY or QoQ: depends on which periods the caller passes
const yoy = growth, qoq = growth;
// ---------- profitability ----------
const margin = (part, revenue) => (ok(part, revenue) && revenue !== 0 ? safe(part / revenue) : null);
const avg2 = (a, b) => (ok(a, b) ? (a + b) / 2 : fin(a) ? a : fin(b) ? b : null);
const roe = (netIncome, equityEnd, equityBegin) => { const e = avg2(equityEnd, equityBegin); return ok(netIncome) && e > 0 ? safe(netIncome / e) : null; };
const investedCapital = (debt, equity, cash) => (ok(debt, equity) ? debt + equity - (fin(cash) ? cash : 0) : null);
const roic = (ebit, taxRate, debt, equity, cash) => { const ic = investedCapital(debt, equity, cash), t = fin(taxRate) ? Math.min(Math.max(taxRate, 0), 0.5) : 0.21; return ok(ebit) && ic > 0 ? safe((ebit * (1 - t)) / ic) : null; };
// ---------- balance sheet ----------
const debtToEquity = (debt, equity) => (ok(debt, equity) && equity > 0 ? safe(debt / equity) : null);
const currentRatio = (ca, cl) => (ok(ca, cl) && cl > 0 ? safe(ca / cl) : null);
const interestCoverage = (ebit, interest) => (ok(ebit, interest) && interest !== 0 ? safe(ebit / Math.abs(interest)) : null);
// ---------- valuation ----------
const enterpriseValue = (marketCap, debt, cash) => (ok(marketCap) ? marketCap + (fin(debt) ? debt : 0) - (fin(cash) ? cash : 0) : null);
const pe = (price, eps) => (ok(price, eps) && eps > 0 ? safe(price / eps) : null);
const earningsYield = (eps, price) => (ok(eps, price) && price > 0 ? safe(eps / price) : null);
const fcfYield = (fcf, marketCap) => (ok(fcf, marketCap) && marketCap > 0 ? safe(fcf / marketCap) : null);
const evToEbitda = (ev, ebitda) => (ok(ev, ebitda) && ebitda > 0 ? safe(ev / ebitda) : null);
const priceToSales = (marketCap, revenue) => (ok(marketCap, revenue) && revenue > 0 ? safe(marketCap / revenue) : null);
const priceToBook = (marketCap, equity) => (ok(marketCap, equity) && equity > 0 ? safe(marketCap / equity) : null);
const peg = (peRatio, epsGrowthFraction) => (ok(peRatio, epsGrowthFraction) && epsGrowthFraction > 0 ? safe(peRatio / (epsGrowthFraction * 100)) : null);

const costOfEquity = (riskFree, beta, equityRiskPremium = 0.05) => (ok(riskFree, beta, equityRiskPremium) ? riskFree + beta * equityRiskPremium : null);
function wacc({ equity, debt, costEquity, costDebt, taxRate = 0.21 }) {
  if (!ok(equity, debt, costEquity, costDebt) || equity + debt <= 0) return null;
  const v = equity + debt; return safe((equity / v) * costEquity + (debt / v) * costDebt * (1 - taxRate));
}
// Two-stage free-cash-flow DCF: `years` of growth fading linearly from `growth` to `terminalGrowth`, then a Gordon terminal value.
function dcf({ fcf, growth: g, years = 10, terminalGrowth = 0.025, discount, netDebt = 0, shares }) {
  if (!ok(fcf, g, years, terminalGrowth, discount) || discount <= terminalGrowth || fcf <= 0 || years < 1) return null;
  years = Math.min(50, Math.floor(years));   // bounded: the loop below must never run on user-controlled huge counts
  let cf = fcf, pv = 0;
  for (let t = 1; t <= years; t++) { const gt = g + (terminalGrowth - g) * ((t - 1) / Math.max(1, years - 1)); cf *= 1 + gt; pv += cf / (1 + discount) ** t; }
  const tv = (cf * (1 + terminalGrowth)) / (discount - terminalGrowth), pvTv = tv / (1 + discount) ** years, ev = pv + pvTv, equity = ev - (fin(netDebt) ? netDebt : 0);
  return { enterpriseValue: ev, equityValue: equity, perShare: ok(shares) && shares > 0 ? equity / shares : null, pvOfCashFlows: pv, pvOfTerminal: pvTv, terminalShare: ev ? pvTv / ev : null };
}
// ---------- risk / return ----------
function returnsFrom(prices) { const r = []; for (let i = 1; i < prices.length; i++) if (ok(prices[i], prices[i - 1]) && prices[i - 1] > 0) r.push(prices[i] / prices[i - 1] - 1); return r; }
const volatility = (returns, periodsPerYear = 252) => { const s = stdev(returns); return s == null ? null : safe(s * Math.sqrt(periodsPerYear)); };
function beta(asset, market) {
  const n = Math.min(asset.length, market.length); if (n < 3) return null;
  const a = asset.slice(-n), m = market.slice(-n), ma = mean(a), mm = mean(m); let cov = 0, vr = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (m[i] - mm); vr += (m[i] - mm) ** 2; }
  return vr > 0 ? safe(cov / vr) : null;
}
function sharpe(returns, riskFreeAnnual = 0, periodsPerYear = 252) {
  if (returns.length < 2) return null; const ex = returns.map((r) => r - riskFreeAnnual / periodsPerYear), s = stdev(ex);
  return s > 0 ? safe((mean(ex) / s) * Math.sqrt(periodsPerYear)) : null;
}
function drawdown(prices) {
  let peak = -Infinity, peakI = 0, worst = 0, wp = 0, wt = 0; const series = [];
  prices.forEach((p, i) => { if (!fin(p)) { series.push(null); return; } if (p > peak) { peak = p; peakI = i; } const d = peak > 0 ? p / peak - 1 : 0; series.push(d); if (d < worst) { worst = d; wp = peakI; wt = i; } });
  return { maxDrawdown: worst, peakIndex: wp, troughIndex: wt, current: series.length ? series[series.length - 1] : null, series };
}
const maxDrawdown = (prices) => drawdown(prices).maxDrawdown;
const totalReturn = (first, last) => (ok(first, last) && first > 0 ? safe(last / first - 1) : null);
// ---------- portfolio ----------
function portfolioAllocation(positions) {
  const rows = positions.filter((p) => ok(p.value) && p.value > 0), total = rows.reduce((s, p) => s + p.value, 0);
  return { total, weights: rows.map((p) => ({ symbol: p.symbol, value: p.value, weight: total ? p.value / total : 0 })).sort((a, b) => b.weight - a.weight),
    concentrationHHI: total ? rows.reduce((s, p) => s + (p.value / total) ** 2, 0) : null };
}
function portfolioReturn(positions) {
  let value = 0, cost = 0, day = 0;
  for (const p of positions) { if (!ok(p.quantity, p.price)) continue; const v = p.quantity * p.price; value += v; if (fin(p.costBasis)) cost += p.costBasis; if (fin(p.previousClose)) day += p.quantity * (p.price - p.previousClose); }
  return { value, cost: cost || null, pnl: cost ? value - cost : null, returnFraction: cost > 0 ? value / cost - 1 : null, dayChange: day, dayChangeFraction: value - day > 0 ? day / (value - day) : null };
}
// Trailing-twelve-month sum over the latest four quarterly rows (newest first or last: sorted here by period).
function ttm(rows, field) { const q = rows.filter((r) => r && fin(r[field])).sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, 4); return q.length === 4 ? q.reduce((s, r) => s + r[field], 0) : null; }

// A calculation packaged with what an evidence trail needs: the value, its unit, the formula and the exact inputs.
const result = (name, value, unit, formula, inputs) => ({ name, value: safe(value), unit, kind: "calculated", formula, inputs });

module.exports = { cagr, growth, yoy, qoq, margin, roe, roic, investedCapital, debtToEquity, currentRatio, interestCoverage, enterpriseValue, pe, earningsYield, fcfYield, evToEbitda, priceToSales, priceToBook, peg,
  costOfEquity, wacc, dcf, returnsFrom, volatility, beta, sharpe, drawdown, maxDrawdown, totalReturn, portfolioAllocation, portfolioReturn, ttm, mean, stdev, result };
