/* Valuation engine: pure, dependency-free ES module used by the server (api/_fin/service.js, through import()) and by the browser (app, alias @fin),
   so the numbers a visitor moves a slider on are computed by exactly the code that produced the defaults. No I/O, no clock, no globals.

   Industrial companies: free cash flow to the firm (FCFF) over `years`, a terminal value that ties growth to reinvestment, equity bridge.
   Financials (banks, insurers, ...): residual income. Everything returns plain numbers and strings; failures return { ok: false, error } and never throw.

   Method, in one place (the page repeats it):
   - Operating profit is GAAP operating income, which is already after stock compensation and R&D: nothing is added back.
   - Revenue grows at g1 in year 1 and fades linearly to the terminal rate gT in the last year; the EBIT margin moves linearly from its latest value to a target.
   - Net reinvestment = change in revenue / sales-to-capital, so growth is paid for with capital: asset-light firms need little, capital-heavy firms a lot.
   - Terminal value = NOPAT x (1 - gT / ROIC_T) / (WACC - gT): terminal growth needs reinvestment unless ROIC_T is infinite. ROIC_T fades toward WACC.
   - Mid-year discounting; the valuation is struck at the last fiscal year end and rolled forward by the time elapsed since (`stub`).
   Units: money in the reporting currency, rates as fractions, shares as counts. */

// ------------------------------------------------------------------ constants (named so they can be read, tested and cited)
export const CONST = Object.freeze({
  YEARS: 10,
  MARGINAL_TAX: 0.25,            // long-run marginal tax rate (US federal 21% plus state), the rate the effective rate converges to
  TAX_BOUNDS: [0.10, 0.30],      // bounds on the observed effective rate
  ERP: 0.0441,                   // equity risk premium: the same implied ERP the classic Intrinsic value page uses (Damodaran). Editable; not refreshed automatically.
  GT_CAP: 0.025,                 // base terminal growth is min(risk-free rate, this)
  G1_BOUNDS: [-0.05, 0.25],      // bounds on starting growth
  MARGIN_YEARS: 5,               // years for the margin to reach its target
  S2C_BOUNDS: [0.3, 10],         // sales-to-capital bounds
  ROIC_T_SHARE: 0.5,             // terminal ROIC = WACC + this share of the current excess return over WACC ...
  ROIC_T_CAP: 0.10,              // ... capped at WACC + 10 points, floored at WACC
  ROIC_T_UNKNOWN: 0.05,          // when invested capital is not positive the excess return is unmeasurable: WACC + 5 points
  SCENARIO_WACC: 0.0075,         // bear +, bull - (as the classic page)
  GT_BEAR: 0.02, GT_BULL_CAP: 0.03,
  BETA_BOUNDS: [0.5, 2.0], BLUME: [0.67, 0.33],
  BETA_MIN_WEEKS: 104, BETA_SE_WARN: 0.25,
  DILUTION_BOUNDS: [0, 0.10],
  TV_SHARE_WARN: 0.75,
  RI_ROE_T_SHARE: 0.25,          // residual income: terminal ROE = ke + this share of the current excess ROE
  RI_PAYOUT_BOUNDS: [0, 1],
  REVERSE_G1: [-0.10, 0.40], REVERSE_MARGIN: [0.005, 0.80], REVERSE_ROE: [-0.20, 0.60],
});

/* Interest-coverage to synthetic rating and default spread: Damodaran, "Ratings, interest coverage ratios and default spreads", large non-financial firms,
   data as of January 2026 (pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html). Rows: [coverage lower bound (exclusive), rating, spread]. */
export const SPREADS = Object.freeze([
  [8.5, "Aaa/AAA", 0.0040], [6.5, "Aa2/AA", 0.0055], [5.5, "A1/A+", 0.0070], [4.25, "A2/A", 0.0078], [3, "A3/A-", 0.0089], [2.5, "Baa2/BBB", 0.0111],
  [2.25, "Ba1/BB+", 0.0138], [2, "Ba2/BB", 0.0184], [1.75, "B1/B+", 0.0275], [1.5, "B2/B", 0.0321], [1.25, "B3/B-", 0.0509], [0.8, "Caa/CCC", 0.0885],
  [0.65, "Ca2/CC", 0.1261], [0.2, "C2/C", 0.16], [-Infinity, "D2/D", 0.19],
]);
export const spreadFor = (coverage) => { if (!fin(coverage)) return { rating: null, spread: 0.0111 }; for (const [lo, rating, spread] of SPREADS) if (coverage > lo) return { rating, spread }; return { rating: "D2/D", spread: 0.19 }; };

// ------------------------------------------------------------------ helpers
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sorted = (a) => a.filter(fin).slice().sort((x, y) => x - y);
const median = (a) => { const s = sorted(a); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/* linear-interpolated quantile, p in 0..1 */
export const quantile = (a, p) => { const s = sorted(a); if (!s.length) return null; if (s.length === 1) return s[0]; const i = clamp(p, 0, 1) * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const first = (a, n, f) => a.slice(0, n).map(f).filter(fin);
const fail = (error, message) => ({ ok: false, error, message });

// ------------------------------------------------------------------ beta from price history (weekly, five years)
/* Bars are [date, open, high, low, close, volume], oldest first or newest first (sorted here). Weekly closes, simple returns, ordinary least squares against the market.
   Returns { raw, adjusted (Blume), se, r2, n } or null when there are fewer than 52 paired weeks. Pure, so it is testable without a network. */
export function betaWeekly(stockBars, marketBars) {
  const week = (d) => { const t = Date.parse(String(d).slice(0, 10) + "T00:00:00Z"); if (!fin(t)) return null; const day = Math.floor(t / 864e5), wd = (day + 3) % 7; return day - wd; };   // Monday of that week, as a day number
  const weekly = (bars) => { const m = new Map(); for (const b of bars || []) { const k = week(b && b[0]), c = b && b[4]; if (k == null || !fin(c) || c <= 0) continue; const o = m.get(k); if (!o || String(b[0]) > o.d) m.set(k, { d: String(b[0]), c }); } return m; };
  const s = weekly(stockBars), mk = weekly(marketBars), keys = [...s.keys()].filter((k) => mk.has(k)).sort((a, b) => a - b);
  const x = [], y = [];
  for (let i = 1; i < keys.length; i++) { if (keys[i] - keys[i - 1] > 14) continue; const a = s.get(keys[i - 1]).c, b = s.get(keys[i]).c, c = mk.get(keys[i - 1]).c, d = mk.get(keys[i]).c; y.push(b / a - 1); x.push(d / c - 1); }
  const n = x.length; if (n < 52) return null;
  const mx = mean(x), my = mean(y); let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); syy += (y[i] - my) ** 2; }
  if (!(sxx > 0)) return null;
  const raw = sxy / sxx; let rss = 0; for (let i = 0; i < n; i++) rss += (y[i] - my - raw * (x[i] - mx)) ** 2;   // residuals directly: no cancellation error
  const se = Math.sqrt(rss / (n - 2) / sxx), r2 = syy > 0 ? 1 - rss / syy : null;
  return { raw, adjusted: CONST.BLUME[0] * raw + CONST.BLUME[1], se, r2, n };
}

// ------------------------------------------------------------------ what the filings say (history -> growth, margins, capital, returns)
/* dilution from the latest year: weighted diluted over weighted basic shares, bounded 0 to 10% (the cover-page count is basic) */
export const dilutionOf = (r) => { const x = r && fin(r.dilutedShares) && fin(r.basicShares) && r.basicShares > 0 ? r.dilutedShares / r.basicShares - 1 : null; return x == null ? 0 : clamp(x, CONST.DILUTION_BOUNDS[0], CONST.DILUTION_BOUNDS[1]); };
const icOf = (r) => (r && fin(r.equity) ? r.equity + (r.minority || 0) + (r.debt || 0) + (r.leases || 0) - (r.cash || 0) - (r.sti || 0) - (r.lti || 0) : null);

/* analyze(pack): the observable facts a valuation starts from. `pack.history` is newest first, one row per fiscal year:
   { revenue, ebit, da, netIncome, pretaxIncome, incomeTax, interestExpense, equity, debt, leases, minority, cash, sti, lti, dividends, buybacks, basicShares, dilutedShares } */
export function analyze(pack) {
  const H = ((pack && pack.history) || []).slice(0, 8), warnings = [], n = H.length;
  const rev = H.map((r) => (fin(r.revenue) ? r.revenue : null));
  const growths = []; for (let i = 0; i < Math.min(5, n - 1); i++) if (fin(rev[i]) && fin(rev[i + 1]) && rev[i + 1] > 0) growths.push(rev[i] / rev[i + 1] - 1);
  const margins = H.map((r) => (fin(r.ebit) && fin(r.revenue) && r.revenue > 0 ? r.ebit / r.revenue : null));
  const m3 = first(margins.map((m, i) => m), 3, (m) => m), m5 = first(margins, 5, (m) => m);
  const marginBase = m3.length >= 2 ? mean(m3) : m3.length ? m3[0] : null;
  const ic = H.map(icOf);
  // effective tax: median of the last three years where pre-tax income is positive, within bounds; otherwise the marginal rate
  const eff = []; for (const r of H.slice(0, 3)) if (fin(r.incomeTax) && fin(r.pretaxIncome) && r.pretaxIncome > 0) eff.push(r.incomeTax / r.pretaxIncome);
  const tax0 = eff.length ? clamp(median(eff), CONST.TAX_BOUNDS[0], CONST.TAX_BOUNDS[1]) : CONST.MARGINAL_TAX;
  // sales-to-capital, pooled over up to five years: what one dollar of revenue growth actually cost in invested capital
  let s2c = null, s2cNote = null;
  const k = Math.min(5, n - 1);
  if (k >= 1 && fin(rev[0]) && fin(rev[k]) && fin(ic[0]) && fin(ic[k])) {
    const dRev = rev[0] - rev[k], dIc = ic[0] - ic[k];
    if (dRev > 0 && dIc > 0) s2c = dRev / dIc;
    else if (dRev > 0 && dIc <= 0) { s2c = CONST.S2C_BOUNDS[1]; s2cNote = "invested capital did not grow while revenue did, so sales-to-capital is set to its upper bound"; }
  }
  if (s2c == null && fin(rev[0]) && fin(ic[0]) && ic[0] > 0) { s2c = rev[0] / ic[0]; s2cNote = "revenue did not grow over the period, so the current revenue to invested capital ratio is used"; }
  if (s2c == null) { s2c = 2; s2cNote = "invested capital is not available, so a neutral sales-to-capital of 2 is used"; }
  const s2cRaw = s2c; s2c = clamp(s2c, CONST.S2C_BOUNDS[0], CONST.S2C_BOUNDS[1]);
  if (s2c !== s2cRaw) s2cNote = `sales-to-capital ${s2cRaw.toFixed(2)} is outside ${CONST.S2C_BOUNDS[0]} to ${CONST.S2C_BOUNDS[1]}, so it is limited to ${s2c}`;
  if (s2cNote) warnings.push(s2cNote.charAt(0).toUpperCase() + s2cNote.slice(1));
  const ebit0 = H[0] && H[0].ebit, nopat0 = fin(ebit0) ? ebit0 * (1 - tax0) : null;
  const icAvg = fin(ic[0]) && fin(ic[1]) ? (ic[0] + ic[1]) / 2 : fin(ic[0]) ? ic[0] : null;
  const roicNow = fin(nopat0) && fin(icAvg) && icAvg > 0 ? nopat0 / icAvg : null;
  // interest coverage over three years (EBIT / interest expense) for the synthetic rating
  const cov = []; for (const r of H.slice(0, 3)) if (fin(r.ebit) && fin(r.interestExpense) && r.interestExpense !== 0) cov.push(r.ebit / Math.abs(r.interestExpense));
  const coverage = cov.length ? mean(cov) : null;
  const dilution = dilutionOf(H[0]);
  // returns on equity (financials)
  const roes = []; for (let i = 0; i < Math.min(5, n); i++) { const r = H[i], p = H[i + 1]; const bv = fin(r.equity) ? (fin(p && p.equity) ? (r.equity + p.equity) / 2 : r.equity) : null; if (fin(r.netIncome) && fin(bv) && bv > 0) roes.push(r.netIncome / bv); }
  const pay = []; for (const r of H.slice(0, 3)) if (fin(r.netIncome) && r.netIncome > 0) pay.push(((r.dividends || 0) + (r.buybacks || 0)) / r.netIncome);
  const payout = pay.length ? clamp(mean(pay), CONST.RI_PAYOUT_BOUNDS[0], CONST.RI_PAYOUT_BOUNDS[1]) : 0.5;
  return { n, rev0: rev[0], growths, margins, marginBase, margin5min: m5.length ? Math.min(...m5) : null, margin5max: m5.length ? Math.max(...m5) : null, marginLatest: margins[0],
    ic, ic0: ic[0], tax0, s2c, s2cRaw, roicNow, nopat0, coverage, dilution, roes, roe3: roes.length ? mean(roes.slice(0, 3)) : null, roe5min: roes.length ? Math.min(...roes) : null, roe5max: roes.length ? Math.max(...roes) : null, payout, warnings };
}

// ------------------------------------------------------------------ cost of capital
/* costOfCapital(pack, an, o): cost of equity from the beta (Blume-adjusted, bounded) and the equity risk premium; cost of debt from the risk-free rate plus a
   synthetic-rating spread keyed on interest coverage; weights from market capitalisation and debt including leases. */
export function costOfCapital(pack, an, o = {}) {
  const warnings = [];
  const rf = fin(o.rf) ? o.rf : fin(pack.rf) ? pack.rf : (warnings.push("The risk-free rate was not available; 4% is assumed."), 0.04);
  const erp = fin(o.erp) ? o.erp : fin(pack.erp) ? pack.erp : CONST.ERP;
  const b = pack.beta || null;
  let beta = fin(o.beta) ? o.beta : b && fin(b.adjusted) ? b.adjusted : (warnings.push("No usable beta; 1.0 is assumed."), 1);
  if (b) {
    if (fin(b.raw) && b.raw < 0) warnings.push(`The regression beta is negative (${b.raw.toFixed(2)}), which is not economically meaningful; the adjusted, bounded beta is used.`);
    if (fin(b.se) && b.se > CONST.BETA_SE_WARN) warnings.push(`The beta is uncertain (standard error ${b.se.toFixed(2)} over ${b.n} weeks).`);
    if (fin(b.n) && b.n < CONST.BETA_MIN_WEEKS) warnings.push(`Only ${b.n} weeks of price history were available for the beta.`);
  }
  const betaUsed = clamp(beta, CONST.BETA_BOUNDS[0], CONST.BETA_BOUNDS[1]);
  const ke = rf + betaUsed * erp;
  const { rating, spread } = spreadFor(an && an.coverage), kd = rf + spread, tax = CONST.MARGINAL_TAX;
  const H0 = (pack.history || [])[0] || {}, D = (fin(H0.debt) ? H0.debt : 0) + (fin(H0.leases) ? H0.leases : 0);
  const E = pack.comparable !== false && fin(pack.price) && pack.shares && fin(pack.shares.basic) ? pack.price * pack.shares.basic : null;
  let wE = 1, wD = 0;
  if (fin(E) && E > 0) { wE = E / (E + D); wD = D / (E + D); } else warnings.push("A market capitalisation was not available, so the discount rate is the cost of equity alone.");
  const wacc = wE * ke + wD * kd * (1 - tax);
  return { rf, erp, beta: betaUsed, betaInput: beta, ke, kd, rating, spread, wE, wD, tax, wacc, E, D, warnings };
}

// ------------------------------------------------------------------ defaults and scenarios
const gtFor = (rf, scenario) => { const r = fin(rf) ? rf : CONST.GT_CAP, base = Math.min(r, CONST.GT_CAP); return scenario === "bear" ? Math.min(base, CONST.GT_BEAR) : scenario === "bull" ? Math.min(r, Math.max(base, CONST.GT_BULL_CAP)) : base; };

/* defaults(pack): { applicable: "fcff" | "ri" | "none", reason, scenarios: { bear, base, bull }, provenance, warnings, analysis, cost }
   Every number in a scenario's assumptions says where it came from in `provenance`. Scenarios are data-driven: growth at the 25th / 50th / 75th percentile of the last five
   years' revenue growth, margin at the five-year minimum / three-year mean / five-year maximum, discount rate +/- 0.75 points. */
export function defaults(pack) {
  pack = pack || {};
  const an = analyze(pack), cc = costOfCapital(pack, an), warnings = [...an.warnings, ...cc.warnings, ...(pack.sharesNote ? [pack.sharesNote] : [])], prov = {}, years = CONST.YEARS;
  const stub = fin(pack.stub) ? clamp(pack.stub, 0, 1) : 0;
  if (an.n < 2) return { applicable: "none", reason: "Fewer than two fiscal years of filings are available.", scenarios: null, provenance: prov, warnings, analysis: an, cost: cc };
  if (pack.isFinancial) return financialDefaults(pack, an, cc, warnings);
  // (the margin check comes after the scenario builders below, so a skeleton can be returned for the user to complete)
  const g = an.growths, haveG = g.length >= 3;
  const gBase = haveG ? median(g) : g.length ? mean(g) : 0.05, gBear = haveG ? quantile(g, 0.25) : gBase - 0.03, gBull = haveG ? quantile(g, 0.75) : gBase + 0.03;
  const gc = (x) => clamp(x, CONST.G1_BOUNDS[0], CONST.G1_BOUNDS[1]);
  prov.g1 = haveG ? `median of the last ${g.length} years' revenue growth (${(gBase * 100).toFixed(1)}%), bounded ${CONST.G1_BOUNDS[0] * 100}% to ${CONST.G1_BOUNDS[1] * 100}%` : "fewer than three growth observations: a simple default with a 3-point band";
  if (!haveG) warnings.push("Fewer than three years of revenue growth are available, so the growth range is a default band, not measured dispersion.");
  prov.margin = fin(an.marginBase) ? `mean EBIT margin of the last ${Math.min(3, an.margins.filter(fin).length)} years (${(an.marginBase * 100).toFixed(1)}%); bear and bull use the five-year low and high` : "no operating margin could be measured";
  prov.s2c = `pooled change in revenue over change in invested capital, up to five years (${an.s2cRaw.toFixed(2)})`;
  prov.tax = `effective rate from the last years' filings (${(an.tax0 * 100).toFixed(1)}%) converging to ${(CONST.MARGINAL_TAX * 100).toFixed(0)}%`;
  prov.wacc = `cost of equity ${(cc.ke * 100).toFixed(2)}% (risk-free ${(cc.rf * 100).toFixed(2)}% + beta ${cc.beta.toFixed(2)} x ${(cc.erp * 100).toFixed(2)}%), cost of debt ${(cc.kd * 100).toFixed(2)}% (${cc.rating || "assumed BBB"}), weights ${(cc.wE * 100).toFixed(0)}/${(cc.wD * 100).toFixed(0)}`;
  prov.gT = "the lower of the risk-free rate and 2.5%; 2.0% in the bear case, up to 3.0% (never above the risk-free rate) in the bull case";
  prov.roicT = `WACC plus ${CONST.ROIC_T_SHARE * 100}% of the current excess return over WACC, capped at +${CONST.ROIC_T_CAP * 100} points`;
  const mk = (sc, g1, mT, wAdj) => ({ model: "fcff", scenario: sc, years, g1: gc(g1), gT: gtFor(cc.rf, sc), marginStart: an.marginLatest, marginTarget: mT, marginYears: CONST.MARGIN_YEARS, tax0: an.tax0, taxT: CONST.MARGINAL_TAX,
    s2c: an.s2c, roicNow: an.roicNow, roicT: null, wacc: cc.wacc + wAdj, ke: cc.ke + wAdj, kd: cc.kd, rf: cc.rf, erp: cc.erp, beta: cc.beta, stub, rev0: an.rev0 });
  if (!(an.marginBase > 0)) return { applicable: "none", reason: "The average operating margin is not positive, so there is no margin to project from. Enter a target margin to run the model.", scenarios: null, skeleton: mk("base", gBase, null, 0), provenance: prov, warnings, analysis: an, cost: cc, needsTargetMargin: true };
  const mBear = Math.min(an.marginBase, an.margin5min == null ? an.marginBase : an.margin5min), mBull = Math.max(an.marginBase, an.margin5max == null ? an.marginBase : an.margin5max);
  const sc = { bear: mk("bear", Math.min(gBear, gBase), mBear, CONST.SCENARIO_WACC), base: mk("base", gBase, an.marginBase, 0), bull: mk("bull", Math.max(gBull, gBase), mBull, -CONST.SCENARIO_WACC) };
  return { applicable: "fcff", reason: null, scenarios: sc, provenance: prov, warnings, analysis: an, cost: cc };
}

function financialDefaults(pack, an, cc, warnings) {
  const prov = {}, years = CONST.YEARS, H0 = (pack.history || [])[0] || {};
  if (!(fin(H0.equity) && H0.equity > 0) || an.roe3 == null) return { applicable: "none", reason: "Book equity or return on equity could not be computed from the filings.", scenarios: null, provenance: prov, warnings, analysis: an, cost: cc };
  prov.model = "residual income: book equity plus the present value of earnings above the cost of equity";
  prov.roe0 = `mean return on average equity of the last ${Math.min(3, an.roes.length)} years (${(an.roe3 * 100).toFixed(1)}%); bear and bull use the five-year low and high`;
  prov.roeT = `the cost of equity plus ${CONST.RI_ROE_T_SHARE * 100}% of the current excess return`;
  prov.payout = `dividends plus buybacks over net income, last three years (${(an.payout * 100).toFixed(0)}%); the rest is retained and grows book value`;
  prov.ke = `risk-free ${(cc.rf * 100).toFixed(2)}% + beta ${cc.beta.toFixed(2)} x ${(cc.erp * 100).toFixed(2)}%`;
  const stub = fin(pack.stub) ? clamp(pack.stub, 0, 1) : 0;
  const mk = (sc, roe0, kAdj) => ({ model: "ri", scenario: sc, years, ke: cc.ke + kAdj, roe0, roeT: null, payout: an.payout, gT: gtFor(cc.rf, sc), bv0: H0.equity - (H0.preferred || 0), stub, rf: cc.rf, erp: cc.erp, beta: cc.beta, wacc: cc.ke + kAdj });
  const lo = Math.min(an.roe3, an.roe5min == null ? an.roe3 : an.roe5min), hi = Math.max(an.roe3, an.roe5max == null ? an.roe3 : an.roe5max);
  return { applicable: "ri", reason: null, scenarios: { bear: mk("bear", lo, CONST.SCENARIO_WACC), base: mk("base", an.roe3, 0), bull: mk("bull", hi, -CONST.SCENARIO_WACC) }, provenance: prov, warnings, analysis: an, cost: cc };
}

// ------------------------------------------------------------------ the valuation of one scenario
const bridgeOf = (pack) => { const b = pack.bridge || {}, z = (x) => (fin(x) ? x : 0); return { cash: z(b.cash), sti: z(b.sti), lti: z(b.lti), debt: z(b.debt), leases: z(b.leases), minority: z(b.minority), preferred: z(b.preferred) }; };
const sharesOf = (pack) => { const s = pack.shares || {}; return fin(s.basic) && s.basic > 0 ? s.basic * (1 + (fin(s.dilution) ? s.dilution : 0)) : null; };

/* value(pack, A): dispatches on A.model. Returns { ok: true, perShare, ... } or { ok: false, error, message } */
export function value(pack, A) { return A && A.model === "ri" ? valueRI(pack, A) : valueFCFF(pack, A); }

export function valueFCFF(pack, A) {
  if (!A) return fail("no_assumptions", "No assumptions.");
  const N = Math.max(1, Math.min(40, Math.floor(A.years || CONST.YEARS))), w = A.wacc, gT = A.gT;
  for (const [k, v] of [["rev0", A.rev0], ["g1", A.g1], ["gT", gT], ["wacc", w], ["s2c", A.s2c], ["marginTarget", A.marginTarget], ["marginStart", fin(A.marginStart) ? A.marginStart : A.marginTarget], ["tax0", A.tax0], ["taxT", A.taxT]]) if (!fin(v)) return fail("missing_" + k, `The ${k} assumption is missing.`);
  if (!(A.rev0 > 0)) return fail("no_revenue", "Latest revenue is not positive.");
  if (!(w > gT)) return fail("wacc_le_growth", "The discount rate must be above terminal growth.");
  if (!(A.s2c > 0)) return fail("bad_s2c", "Sales-to-capital must be positive.");
  const m0 = fin(A.marginStart) ? A.marginStart : A.marginTarget, my = Math.max(1, A.marginYears || CONST.MARGIN_YEARS), stub = fin(A.stub) ? A.stub : 0;
  const rows = []; let rev = A.rev0, pvSum = 0, lastNopat = 0, lastRev = A.rev0, lastMargin = m0;
  for (let t = 1; t <= N; t++) {
    const g = N === 1 ? A.g1 : A.g1 + (gT - A.g1) * ((t - 1) / (N - 1)), prev = rev; rev = prev * (1 + g);
    const margin = m0 + (A.marginTarget - m0) * Math.min(1, t / my), tax = N === 1 ? A.taxT : A.tax0 + (A.taxT - A.tax0) * ((t - 1) / (N - 1));
    const ebit = rev * margin, nopat = ebit >= 0 ? ebit * (1 - tax) : ebit, reinv = (rev - prev) / A.s2c, fcff = nopat - reinv, df = (1 + w) ** -(t - 0.5), pv = fcff * df;
    rows.push({ t, rev, g, margin, ebit, tax: ebit >= 0 ? tax : 0, nopat, reinv, fcff, df, pv, reinvRate: nopat > 0 ? reinv / nopat : null });
    pvSum += pv; lastNopat = nopat; lastRev = rev; lastMargin = margin;
  }
  // terminal: revenue grows at gT, margin stays at target, tax at the marginal rate; reinvestment = gT / ROIC_T
  const roicT = fin(A.roicT) ? A.roicT : autoRoicT(A.roicNow, w);
  if (!(roicT > 0)) return fail("bad_roic", "Terminal return on capital must be positive.");
  const nopatT1 = lastRev * (1 + gT) * A.marginTarget * (1 - A.taxT), rr = gT / roicT, fcffT1 = nopatT1 * (1 - rr), tv = fcffT1 / (w - gT), pvTv = tv * (1 + w) ** -(N - 0.5);
  const evAtFye = pvSum + pvTv, ev = evAtFye * (1 + w) ** stub, br = bridgeOf(pack), sh = sharesOf(pack);
  const equity = ev + br.cash + br.sti + br.lti - br.debt - br.leases - br.minority - br.preferred, perShare = sh ? equity / sh : null;
  const da = (pack.history && pack.history[0] && fin(pack.history[0].da) && fin(pack.history[0].revenue) && pack.history[0].revenue > 0) ? pack.history[0].da / pack.history[0].revenue : null;
  const ebitN = lastRev * lastMargin, warnings = [];
  const tvShare = evAtFye !== 0 ? pvTv / evAtFye : null;
  if (tvShare != null && tvShare > CONST.TV_SHARE_WARN) warnings.push(`The terminal value is ${(tvShare * 100).toFixed(0)}% of enterprise value, so the result leans on long-run assumptions.`);
  if (w - gT < 0.03) warnings.push(`Discount rate less terminal growth is only ${((w - gT) * 100).toFixed(1)} points, which makes the value very sensitive.`);
  if (Math.abs(A.marginTarget - m0) > 0.10) warnings.push(`The margin moves ${(Math.abs(A.marginTarget - m0) * 100).toFixed(0)} points from its latest level to the target.`);
  if (A.g1 < 0) warnings.push("Starting growth is negative, so the model releases capital as revenue shrinks.");
  if (equity < 0) warnings.push("Equity value is negative: claims on the firm exceed its enterprise value.");
  return { ok: true, model: "fcff", perShare, ev, equity, evAtFye, pvExplicit: pvSum, pvTerminal: pvTv, tv, tvShare, rows,
    terminal: { nopat: nopatT1, reinvestmentRate: rr, roic: roicT, fcff: fcffT1, g: gT }, bridge: { ev, ...br, equity, shares: sh },
    diagnostics: { exitEvEbit: ebitN > 0 ? tv / ebitN : null, exitEvEbitda: ebitN > 0 && da != null ? tv / (ebitN + da * lastRev) : null, roicT, year1Fcff: rows[0].fcff, year1Nopat: rows[0].nopat, lastMargin },
    warnings };
}
export const autoRoicT = (roicNow, w) => (fin(roicNow) ? w + Math.min(CONST.ROIC_T_CAP, CONST.ROIC_T_SHARE * Math.max(0, roicNow - w)) : w + CONST.ROIC_T_UNKNOWN);

export function valueRI(pack, A) {
  if (!A) return fail("no_assumptions", "No assumptions.");
  const N = Math.max(1, Math.min(40, Math.floor(A.years || CONST.YEARS))), ke = A.ke, gT = A.gT;
  for (const [k, v] of [["ke", ke], ["gT", gT], ["roe0", A.roe0], ["bv0", A.bv0], ["payout", A.payout]]) if (!fin(v)) return fail("missing_" + k, `The ${k} assumption is missing.`);
  if (!(ke > gT)) return fail("ke_le_growth", "The cost of equity must be above terminal growth.");
  if (!(A.bv0 > 0)) return fail("no_book_value", "Book equity is not positive.");
  const roeT = fin(A.roeT) ? A.roeT : ke + CONST.RI_ROE_T_SHARE * (A.roe0 - ke), stub = fin(A.stub) ? A.stub : 0;
  const rows = []; let bv = A.bv0, pvSum = 0;
  for (let t = 1; t <= N; t++) {
    const roe = N === 1 ? roeT : A.roe0 + (roeT - A.roe0) * ((t - 1) / (N - 1)), ni = roe * bv, ri = ni - ke * bv, df = (1 + ke) ** -t, pv = ri * df, open = bv;
    bv = bv + ni * (1 - A.payout); rows.push({ t, roe, ni, bvOpen: open, ri, df, pv, bvClose: bv }); pvSum += pv;
  }
  const riT1 = (roeT - ke) * bv, tv = riT1 / (ke - gT), pvTv = tv * (1 + ke) ** -N, eqAtFye = A.bv0 + pvSum + pvTv, equity = eqAtFye * (1 + ke) ** stub;
  const sh = sharesOf(pack), warnings = [];
  if (equity < 0) warnings.push("Equity value is negative.");
  if (A.roe0 > 0.30) warnings.push("Starting return on equity is above 30%, which is unusual for a financial and may reflect a one-off.");
  return { ok: true, model: "ri", perShare: sh ? equity / sh : null, equity, ev: null, bookValue: A.bv0, pvExplicit: pvSum, pvTerminal: pvTv, tv, tvShare: eqAtFye !== 0 ? pvTv / eqAtFye : null, rows,
    terminal: { roe: roeT, ri: riT1, g: gT }, bridge: { bookValue: A.bv0, pvResidualIncome: pvSum, pvTerminal: pvTv, equity, shares: sh }, diagnostics: { roeT, impliedPriceToBook: equity / A.bv0 }, warnings };
}

/* values for bear, base and bull at once, with the position of the price on that range */
export function valueAll(pack, d) {
  const out = {};
  if (!d || !d.scenarios) return out;
  for (const k of ["bear", "base", "bull"]) out[k] = value(pack, d.scenarios[k]);
  return out;
}

// ------------------------------------------------------------------ reverse DCF: what does the price assume?
function bisect(f, lo, hi, target, iters = 70) {
  let vLo = f(lo), vHi = f(hi); if (!fin(vLo) || !fin(vHi)) return { value: null, note: "not solvable" };
  if (target < vLo) return { value: null, note: "below range", lo, hi }; if (target > vHi) return { value: null, note: "above range", lo, hi };
  for (let i = 0; i < iters; i++) { const mid = (lo + hi) / 2, v = f(mid); if (!fin(v)) return { value: null, note: "not solvable" }; if (v < target) lo = mid; else hi = mid; }
  return { value: (lo + hi) / 2, note: null, lo, hi };
}
const ps = (pack, A) => { const r = value(pack, A); return r.ok ? r.perShare : null; };
/* the starting growth (FCFF) or starting ROE (residual income) at which the model reproduces `price`, other assumptions unchanged */
export function reverseGrowth(pack, A, price) {
  if (!fin(price) || price <= 0 || !A) return { value: null, note: "no price" };
  return A.model === "ri" ? { ...bisect((x) => ps(pack, { ...A, roe0: x, roeT: null }), CONST.REVERSE_ROE[0], CONST.REVERSE_ROE[1], price), what: "roe" }
    : { ...bisect((x) => ps(pack, { ...A, g1: x }), CONST.REVERSE_G1[0], CONST.REVERSE_G1[1], price), what: "growth" };
}
/* the target operating margin at which the model reproduces `price` (FCFF only) */
export function reverseMargin(pack, A, price) {
  if (!fin(price) || price <= 0 || !A || A.model === "ri") return { value: null, note: "not applicable" };
  return { ...bisect((x) => ps(pack, { ...A, marginTarget: x }), CONST.REVERSE_MARGIN[0], CONST.REVERSE_MARGIN[1], price), what: "margin" };
}

// ------------------------------------------------------------------ sensitivity grids
const STEPS = [-2, -1, 0, 1, 2];
/* two 5x5 grids of value per share around A: discount rate x terminal growth, and starting growth x target margin (FCFF) / cost of equity x starting ROE (residual income). null where the inputs are invalid. */
export function sensitivity(pack, A) {
  if (!A) return null;
  const cell = (patch) => ps(pack, { ...A, ...patch });
  if (A.model === "ri") {
    const ke = STEPS.map((s) => A.ke + s * 0.005), g = STEPS.map((s) => A.gT + s * 0.005), roe = STEPS.map((s) => A.roe0 + s * 0.02);
    return { a: { rows: ke, cols: g, rowLabel: "ke", colLabel: "gT", cells: ke.map((k) => g.map((x) => cell({ ke: k, gT: x }))) }, b: { rows: ke, cols: roe, rowLabel: "ke", colLabel: "roe0", cells: ke.map((k) => roe.map((x) => cell({ ke: k, roe0: x, roeT: null }))) } };
  }
  const w = STEPS.map((s) => A.wacc + s * 0.005), g = STEPS.map((s) => A.gT + s * 0.005), g1 = STEPS.map((s) => A.g1 + s * 0.02), m = STEPS.map((s) => A.marginTarget + s * 0.02);
  return { a: { rows: w, cols: g, rowLabel: "wacc", colLabel: "gT", cells: w.map((x) => g.map((y) => cell({ wacc: x, gT: y }))) }, b: { rows: g1, cols: m, rowLabel: "g1", colLabel: "marginTarget", cells: g1.map((x) => m.map((y) => cell({ g1: x, marginTarget: y }))) } };
}

/* convenience for callers: everything a screen needs for a pack, in one call (defaults, the three scenario values, the reverse solves and the grids for `which`) */
export function evaluate(pack, which = "base") {
  pack = pack || {};
  const d = defaults(pack), all = valueAll(pack, d), A = d.scenarios && d.scenarios[which], price = pack.comparable === false ? null : pack.price;
  return { defaults: d, results: all, assumptions: A || null, reverse: A ? { growth: reverseGrowth(pack, A, price), margin: reverseMargin(pack, A, price) } : null, sensitivity: A ? sensitivity(pack, A) : null };
}
