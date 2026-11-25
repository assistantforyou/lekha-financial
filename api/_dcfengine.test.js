// Run: node api/_dcfengine.test.js
// The valuation engine (api/_fin/valuation/engine.mjs): closed forms, identities, monotonicity, round trips, and the cases that motivated it.
// Nothing here uses the network or a clock. Expected values are derived independently in the test (geometric sums, Gordon formula), not copied from the engine.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const near = (a, b, e = 1e-9, m = "") => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${m} ${a} !~ ${b}`);

(async () => {
  const E = await import(pathToFileURL(path.join(__dirname, "_fin", "valuation", "engine.mjs")).href);

  // ---- fixtures ----
  const hist = (n, o = {}) => Array.from({ length: n }, (_, i) => { const k = n - 1 - i, rev = (o.rev0 || 100) * (1 + (o.g || 0.08)) ** k, ic = (o.ic0 || 100) + (o.icStep == null ? 12 : o.icStep) * k;
    return { fy: 2025 - i, revenue: rev, ebit: rev * (o.margin || 0.25), da: rev * 0.04, netIncome: rev * 0.2, pretaxIncome: rev * 0.24, incomeTax: rev * 0.048, interestExpense: o.interest == null ? 2 : o.interest,
      equity: ic - 40 - 5 + 40, debt: 40, leases: 5, minority: 0, cash: 40, sti: 0, lti: 0, basicShares: 100, dilutedShares: 102, sbc: 9, ocf: rev * 0.3, ...(o.row || {}) }; });
  const pack = (o = {}) => ({ symbol: "T", currency: "USD", comparable: true, price: o.price == null ? 40 : o.price, shares: { basic: 100, dilution: 0.02 }, rf: 0.045, stub: 0,
    history: o.history || hist(6, o), bridge: { cash: 40, sti: 0, lti: 0, debt: 40, leases: 5, minority: 0, preferred: 0, ...(o.bridge || {}) }, beta: { raw: 1.1, adjusted: 1.07, se: 0.1, n: 260 }, isFinancial: !!o.fin });
  const deepFreeze = (x) => { if (x && typeof x === "object" && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(deepFreeze); } return x; };

  // ---- 1. closed form: steady state. With g1 = gT = g, constant margin and tax, and terminal ROIC equal to the explicit growth economics
  //         ((1+g) x s2c x margin x (1-tax)), FCFF grows exactly at g forever, so value = FCFF1 / (WACC - g) x (1 + WACC)^0.5 (mid-year). ----
  {
    const g = 0.03, m = 0.2, t = 0.25, s2c = 2, w = 0.09, R0 = 1000;
    const A = { model: "fcff", years: 10, g1: g, gT: g, marginStart: m, marginTarget: m, marginYears: 5, tax0: t, taxT: t, s2c, roicNow: null, roicT: (1 + g) * s2c * m * (1 - t), wacc: w, stub: 0, rev0: R0 };
    const P = { ...pack(), shares: { basic: 1, dilution: 0 }, bridge: {}, history: [{ revenue: R0, ebit: R0 * m, da: 0 }] };
    const r = E.value(P, A); assert.ok(r.ok, JSON.stringify(r));
    const fcff1 = R0 * ((1 + g) * m * (1 - t) - g / s2c);
    near(r.perShare, fcff1 / (w - g) * (1 + w) ** 0.5, 1e-9, "Gordon with mid-year convention");
    near(r.rows[0].fcff, fcff1, 1e-9, "year-1 FCFF"); near(r.rows[9].fcff, fcff1 * (1 + g) ** 9, 1e-9, "FCFF grows at g");
    // the stub rolls enterprise value forward at the discount rate, and nothing else
    near(E.value(P, { ...A, stub: 0.5 }).ev, r.ev * (1 + w) ** 0.5, 1e-12, "stub roll-forward");
    // terminal reinvestment is gT / ROIC_T, and the terminal value is Gordon on FCFF(N+1)
    near(r.terminal.reinvestmentRate, g / A.roicT, 1e-12); near(r.tv, r.terminal.fcff / (w - g), 1e-9);
    near(r.pvExplicit + r.pvTerminal, r.evAtFye, 1e-9, "EV is explicit plus terminal");
  }

  // ---- 2. a hand-checkable single year ----
  {
    const A = { model: "fcff", years: 1, g1: 0.10, gT: 0.02, marginStart: 0.30, marginTarget: 0.30, marginYears: 1, tax0: 0.20, taxT: 0.20, s2c: 2, roicT: 0.12, wacc: 0.10, stub: 0, rev0: 100 };
    const P = { ...pack(), shares: { basic: 1, dilution: 0 }, bridge: {}, history: [{ revenue: 100, ebit: 30, da: 0 }] };
    const r = E.value(P, A), nopat = 110 * 0.30 * 0.80, reinv = 10 / 2, f1 = nopat - reinv;                   // 26.4 - 5 = 21.4
    near(r.rows[0].nopat, 26.4); near(r.rows[0].reinv, 5); near(r.rows[0].fcff, f1);
    const nopat2 = 110 * 1.02 * 0.30 * 0.80, fT = nopat2 * (1 - 0.02 / 0.12), tv = fT / (0.10 - 0.02);
    near(r.perShare, f1 / 1.10 ** 0.5 + tv / 1.10 ** 0.5, 1e-12, "one explicit year plus terminal, both mid-year");
  }

  // ---- 3. identities and invariances ----
  const P = pack(), d = E.defaults(P), base = d.scenarios.base;
  assert.strictEqual(d.applicable, "fcff");
  const rb = E.value(P, base); assert.ok(rb.ok && rb.perShare > 0);
  { // bridge arithmetic, to the cent
    const sh = 100 * 1.02; near(rb.perShare, (rb.ev + 40 + 0 + 0 - 40 - 5 - 0 - 0) / sh, 1e-12); near(rb.bridge.shares, sh);
    const P2 = pack({ bridge: { cash: 40, sti: 10, lti: 20, debt: 40, leases: 5, minority: 7, preferred: 3 } }), r2 = E.value(P2, base);
    near(r2.equity, r2.ev + 40 + 10 + 20 - 40 - 5 - 7 - 3, 1e-12, "full bridge");
  }
  { // scale invariance: double revenue, shares and every balance-sheet item, same value per share
    const A2 = { ...base, rev0: base.rev0 * 2 }, P2 = { ...P, shares: { basic: 200, dilution: 0.02 }, bridge: Object.fromEntries(Object.entries(P.bridge).map(([k, v]) => [k, v * 2])) };
    near(E.value(P2, A2).perShare, rb.perShare, 1e-9, "scale invariance");
  }
  { // purity: no mutation of its inputs, same answer twice
    const fz = deepFreeze(pack()), dd = E.defaults(fz); const again = E.defaults(fz); assert.deepStrictEqual(dd.scenarios.base, again.scenarios.base);
    assert.deepStrictEqual(E.value(fz, dd.scenarios.base), E.value(fz, dd.scenarios.base));
  }
  { // stock compensation and cash-flow fields are not read: nothing is added back
    const P3 = pack({ row: { sbc: 99999, ocf: 1e9 } }); near(E.value(P3, E.defaults(P3).scenarios.base).perShare, rb.perShare, 1e-12, "sbc/ocf ignored");
  }

  // ---- 4. monotonicity ----
  {
    const v = (patch) => E.value(P, { ...base, ...patch }).perShare;
    assert.ok(v({ g1: 0.12 }) > v({ g1: 0.08 }) && v({ g1: 0.08 }) > v({ g1: 0.03 }), "value rises with growth");
    assert.ok(v({ marginTarget: 0.30 }) > v({ marginTarget: 0.25 }) && v({ marginTarget: 0.25 }) > v({ marginTarget: 0.15 }), "value rises with margin");
    assert.ok(v({ wacc: 0.07 }) > v({ wacc: 0.09 }) && v({ wacc: 0.09 }) > v({ wacc: 0.12 }), "value falls with the discount rate");
    assert.ok(v({ s2c: 4 }) > v({ s2c: 2 }) && v({ s2c: 2 }) > v({ s2c: 0.8 }), "value rises with capital efficiency");
    assert.ok(v({ roicT: 0.30 }) > v({ roicT: 0.12 }), "value rises with terminal return on capital");
  }

  // ---- 5. scenarios ----
  {
    const r = E.valueAll(P, d); assert.ok(r.bear.perShare < r.base.perShare && r.base.perShare < r.bull.perShare, "bear < base < bull");
    assert.ok(d.scenarios.bear.wacc > d.scenarios.base.wacc && d.scenarios.bull.wacc < d.scenarios.base.wacc);
    near(d.scenarios.bear.wacc - d.scenarios.base.wacc, E.CONST.SCENARIO_WACC, 1e-12);
    assert.ok(d.scenarios.bear.gT <= d.scenarios.base.gT && d.scenarios.base.gT <= d.scenarios.bull.gT);
    for (const k of ["bear", "base", "bull"]) assert.ok(d.scenarios[k].gT <= P.rf, "terminal growth never above the risk-free rate");
    assert.ok(d.scenarios.bear.g1 <= d.scenarios.base.g1 && d.scenarios.base.g1 <= d.scenarios.bull.g1);
  }

  // ---- 6. reverse DCF round trips ----
  {
    for (const g1 of [-0.05, 0.02, 0.09, 0.2, 0.35]) { const px = E.value(P, { ...base, g1 }).perShare, rv = E.reverseGrowth({ ...P, price: px }, base, px); assert.ok(rv.value != null, "solvable"); near(rv.value, g1, 1e-6, "implied growth"); }
    for (const m of [0.05, 0.18, 0.4]) { const px = E.value(P, { ...base, marginTarget: m }).perShare, rv = E.reverseMargin(P, base, px); near(rv.value, m, 1e-6, "implied margin"); }
    assert.strictEqual(E.reverseGrowth(P, base, 1e9).note, "above range"); assert.strictEqual(E.reverseGrowth(P, base, 0.01).note, "below range");
    assert.strictEqual(E.reverseGrowth(P, base, null).value, null); assert.strictEqual(E.reverseGrowth(P, base, -5).value, null);
  }

  // ---- 7. sensitivity ----
  {
    const s = E.sensitivity(P, base); near(s.a.cells[2][2], rb.perShare, 1e-12, "centre of grid A"); near(s.b.cells[2][2], rb.perShare, 1e-12, "centre of grid B");
    for (let c = 0; c < 5; c++) for (let r = 1; r < 5; r++) assert.ok(s.a.cells[r][c] < s.a.cells[r - 1][c], "higher WACC row, lower value");
    for (let r = 0; r < 5; r++) for (let c = 1; c < 5; c++) assert.ok(s.a.cells[r][c] > s.a.cells[r][c - 1], "higher terminal growth, higher value");
    for (let r = 0; r < 5; r++) for (let c = 1; c < 5; c++) assert.ok(s.b.cells[r][c] > s.b.cells[r][c - 1], "higher margin, higher value");
  }

  // ---- 8. errors are values, not exceptions ----
  {
    assert.strictEqual(E.value(P, { ...base, wacc: 0.02, gT: 0.025 }).error, "wacc_le_growth");
    assert.strictEqual(E.value(P, { ...base, rev0: 0 }).error, "no_revenue"); assert.strictEqual(E.value(P, { ...base, g1: undefined }).error, "missing_g1");
    assert.strictEqual(E.value(P, { ...base, s2c: 0 }).error, "bad_s2c"); assert.strictEqual(E.value(P, null).error, "no_assumptions");
    assert.strictEqual(E.value({ ...P, shares: null }, base).perShare, null, "no share count: no per-share value, enterprise value still reported");
  }

  // ---- 9. what the filings say: sales-to-capital, tax, dilution, coverage ----
  {
    // revenue 100 -> 146.9 over five years, invested capital 100 -> 160: pooled s2c = 46.9 / 60
    const h = hist(6, { g: 0.08, ic0: 100, icStep: 12 }), an = E.analyze({ history: h }); near(an.s2cRaw, (h[0].revenue - h[5].revenue) / (160 - 100), 1e-9, "pooled sales-to-capital");
    // capital that does not grow while revenue does: upper bound, with a warning that says so
    const light = E.analyze({ history: hist(6, { g: 0.11, icStep: 0 }) }); assert.strictEqual(light.s2c, E.CONST.S2C_BOUNDS[1]); assert.ok(light.warnings.some((w) => /did not grow while revenue did/.test(w)));
    // a tiny ratio is limited to the lower bound
    const heavy = E.analyze({ history: hist(6, { g: 0.01, icStep: 80 }) }); assert.strictEqual(heavy.s2c, E.CONST.S2C_BOUNDS[0]); assert.ok(heavy.warnings.some((w) => /limited to/.test(w)));
    // shrinking revenue: falls back to turnover with a warning
    const shr = E.analyze({ history: hist(6, { g: -0.05 }) }); assert.ok(shr.warnings.some((w) => /did not grow over the period/.test(w)));
    // effective tax: median of the last three, within bounds; marginal when there is no pre-tax income
    near(E.analyze({ history: hist(4) }).tax0, 0.048 / 0.24, 1e-9); assert.strictEqual(E.analyze({ history: hist(4, { row: { incomeTax: 0 } }) }).tax0, E.CONST.TAX_BOUNDS[0]);
    assert.strictEqual(E.analyze({ history: hist(4, { row: { pretaxIncome: -5 } }) }).tax0, E.CONST.MARGINAL_TAX);
    near(E.analyze({ history: hist(3) }).dilution, 0.02, 1e-12); assert.strictEqual(E.analyze({ history: hist(3, { row: { dilutedShares: 500 } }) }).dilution, E.CONST.DILUTION_BOUNDS[1]);
    { const h3 = hist(3, { interest: 5 }); near(E.analyze({ history: h3 }).coverage, (h3[0].ebit + h3[1].ebit + h3[2].ebit) / 3 / 5, 1e-12, "interest coverage is the mean of EBIT over interest"); }
  }
  { // tax converges from the effective rate to the marginal rate
    const r = E.value(P, base); near(r.rows[0].tax, base.tax0, 1e-12); near(r.rows[9].tax, base.taxT, 1e-12); assert.ok(r.rows[4].tax > Math.min(base.tax0, base.taxT) - 1e-12);
  }

  // ---- 10. the asset-light compounder (the Visa case) is not capped: growth is paid for with capital, so little capital means growth is cheap ----
  {
    const light = pack({ g: 0.11, icStep: 0 }), heavy = pack({ g: 0.11, icStep: 60 });
    const dl = E.defaults(light), dh = E.defaults(heavy);
    near(dl.scenarios.base.g1, 0.11, 1e-9, "starting growth is the measured median, not capped by reinvestment"); assert.ok(dl.scenarios.base.g1 > 0.10);
    assert.ok(dl.scenarios.base.s2c > dh.scenarios.base.s2c, "asset-light has a higher sales-to-capital");
    const vl = E.value(light, dl.scenarios.base).perShare, vh = E.value(heavy, dh.scenarios.base).perShare; assert.ok(vl > vh, "the same growth is worth more when it needs less capital");
  }

  // ---- 11. applicability ----
  {
    const loss = pack({ margin: -0.05 }); const dl = E.defaults(loss); assert.strictEqual(dl.applicable, "none"); assert.strictEqual(dl.needsTargetMargin, true); assert.match(dl.reason, /target margin/);
    // with a margin supplied the model runs
    const A = { model: "fcff", years: 10, g1: 0.2, gT: 0.025, marginStart: -0.05, marginTarget: 0.18, marginYears: 7, tax0: 0.25, taxT: 0.25, s2c: 2, roicNow: null, roicT: null, wacc: 0.10, stub: 0, rev0: 100 };
    assert.ok(E.value(loss, A).ok);
    assert.strictEqual(E.defaults({ history: hist(1) }).applicable, "none"); assert.strictEqual(E.defaults({ history: [] }).applicable, "none"); assert.strictEqual(E.defaults(null).applicable, "none");
    assert.strictEqual(E.defaults(pack({ fin: true })).applicable, "ri");
  }

  // ---- 12. warnings ----
  {
    const r = E.value(P, { ...base, wacc: 0.0701, gT: 0.0501 }); assert.ok(r.warnings.some((w) => /only 2\.0 points/.test(w)) || r.warnings.some((w) => /very sensitive/.test(w)));
    const hi = E.value(P, { ...base, wacc: 0.05, gT: 0.03, g1: 0 }); assert.ok(hi.tvShare > 0.75 && hi.warnings.some((w) => /terminal value is/.test(w)));
    const neg = E.defaults({ ...pack(), beta: { raw: -0.3, adjusted: 0.13, se: 0.4, n: 80 } }); assert.ok(neg.warnings.some((w) => /negative/.test(w)) && neg.warnings.some((w) => /uncertain/.test(w)) && neg.warnings.some((w) => /Only 80 weeks/.test(w)));
    assert.ok(neg.cost.beta >= E.CONST.BETA_BOUNDS[0], "an unusable beta is bounded");
  }

  // ---- 13. cost of capital ----
  {
    const cc = E.costOfCapital(P, E.analyze(P)); near(cc.ke, 0.045 + 1.07 * E.CONST.ERP, 1e-12); near(cc.wE + cc.wD, 1, 1e-12);
    near(cc.wacc, cc.wE * cc.ke + cc.wD * cc.kd * (1 - 0.25), 1e-12); near(cc.E, 40 * 100, 1e-9); near(cc.D, 45, 1e-12);
    near(cc.kd, cc.rf + cc.spread, 1e-12);
    const nm = E.costOfCapital({ ...P, price: null }, E.analyze(P)); assert.strictEqual(nm.wD, 0); assert.ok(nm.warnings.some((w) => /market capitalisation/.test(w)));
    near(E.costOfCapital(P, E.analyze(P), { erp: 0.06 }).ke, 0.045 + 1.07 * 0.06, 1e-12, "erp override");
  }
  { // synthetic rating spreads (Damodaran, large firms, January 2026)
    assert.deepStrictEqual(E.spreadFor(10), { rating: "Aaa/AAA", spread: 0.0040 }); assert.deepStrictEqual(E.spreadFor(8.5), { rating: "Aa2/AA", spread: 0.0055 }, "bounds are exclusive below");
    assert.strictEqual(E.spreadFor(2.6).rating, "Baa2/BBB"); assert.strictEqual(E.spreadFor(1.0).rating, "Caa/CCC"); assert.strictEqual(E.spreadFor(-3).rating, "D2/D"); assert.strictEqual(E.spreadFor(null).rating, null);
    for (let i = 1; i < E.SPREADS.length; i++) assert.ok(E.SPREADS[i][2] > E.SPREADS[i - 1][2], "spreads rise as coverage falls");
  }

  // ---- 14. beta from weekly prices ----
  {
    const monday = Date.UTC(2020, 0, 6); let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const weeks = 300, mkt = [100], stk = [50], noise = [];
    for (let w = 1; w < weeks; w++) { const r = (rnd() - 0.5) * 0.06; mkt.push(mkt[w - 1] * (1 + r)); stk.push(stk[w - 1] * (1 + 1.4 * r)); }
    const daily = (series) => { const bars = []; for (let w = 0; w < weeks; w++) for (let d = 0; d < 5; d++) { const c = d === 4 ? series[w] : series[w] * (1 + 0.002 * (d - 2)); bars.push([new Date(monday + (w * 7 + d) * 864e5).toISOString().slice(0, 10), c, c, c, c, 1]); } return bars; };
    const b = E.betaWeekly(daily(stk), daily(mkt)); near(b.raw, 1.4, 1e-9, "weekly beta recovers the true beta"); assert.ok(b.se < 1e-9 && b.n === weeks - 1); near(b.adjusted, 0.67 * 1.4 + 0.33, 1e-9);
    assert.ok(Math.abs(E.betaWeekly(daily(stk).reverse(), daily(mkt)).raw - 1.4) < 1e-9, "order of the bars does not matter");
    assert.strictEqual(E.betaWeekly(daily(stk).slice(0, 5 * 40), daily(mkt)), null, "fewer than 52 paired weeks");
    assert.strictEqual(E.betaWeekly([], []), null); assert.strictEqual(E.betaWeekly(null, undefined), null);
    // noisy stock: the standard error is positive and beta is near the truth
    const noisy = stk.map((v, i) => v * (1 + (rnd() - 0.5) * 0.04)); const bn = E.betaWeekly(daily(noisy), daily(mkt)); assert.ok(bn.se > 0 && bn.r2 < 1 && Math.abs(bn.raw - 1.4) < 0.5);
  }

  // ---- 15. residual income (financials) ----
  {
    const fh = (o = {}) => Array.from({ length: 6 }, (_, i) => ({ fy: 2025 - i, revenue: 100, ebit: 0, netIncome: o.ni == null ? 12 : o.ni, equity: 100 + 6 * (5 - i), dividends: 3, buybacks: 3, basicShares: 10, dilutedShares: 10.1, preferred: 0 }));
    const F = { symbol: "B", comparable: true, price: 12, shares: { basic: 10, dilution: 0 }, rf: 0.045, stub: 0, history: fh(), bridge: {}, beta: { raw: 1, adjusted: 1, se: 0.1, n: 260 }, isFinancial: true };
    const df = E.defaults(F); assert.strictEqual(df.applicable, "ri"); const A = df.scenarios.base;
    // ROE equal to the cost of equity creates no value: equity value is book value
    const flat = E.value(F, { ...A, roe0: A.ke, roeT: A.ke }); near(flat.equity, A.bv0, 1e-12, "no excess return, value is book"); near(flat.perShare, A.bv0 / 10, 1e-12);
    // constant ROE above ke: independent geometric-series formula
    const ke = 0.09, roe = 0.15, p = 0.4, gT = 0.025, bv0 = 100, N = 10, h = roe * (1 - p);
    const Ar = { model: "ri", years: N, ke, roe0: roe, roeT: roe, payout: p, gT, bv0, stub: 0 };
    let pv = 0; for (let t = 1; t <= N; t++) pv += (roe - ke) * bv0 * (1 + h) ** (t - 1) / (1 + ke) ** t;
    const tv = (roe - ke) * bv0 * (1 + h) ** N / (ke - gT), want = bv0 + pv + tv / (1 + ke) ** N; near(E.value(F, Ar).equity, want, 1e-9, "residual income closed form");
    assert.ok(E.value(F, { ...Ar, roe0: 0.18, roeT: 0.18 }).equity > want && E.value(F, { ...Ar, ke: 0.11 }).equity < want, "monotone in roe and ke");
    const sc = E.valueAll(F, df); assert.ok(sc.bear.perShare <= sc.base.perShare && sc.base.perShare <= sc.bull.perShare, "residual-income scenarios are ordered");
    const px = E.value(F, { ...A, roe0: 0.14 }).perShare, rv = E.reverseGrowth({ ...F, price: px }, A, px); assert.strictEqual(rv.what, "roe"); near(rv.value, 0.14, 1e-6, "implied ROE");
    assert.strictEqual(E.value(F, { ...Ar, ke: 0.02 }).error, "ke_le_growth"); assert.strictEqual(E.value(F, { ...Ar, bv0: -1 }).error, "no_book_value");
    const s = E.sensitivity(F, A); near(s.a.cells[2][2], E.value(F, A).perShare, 1e-12);
    assert.strictEqual(E.defaults({ ...F, history: fh({ ni: -5 }).map((r) => ({ ...r, equity: -1 })) }).applicable, "none");
  }

  // ---- 16. evaluate(): everything a screen needs in one call ----
  {
    const ev = E.evaluate(P); assert.ok(ev.defaults && ev.results.base.ok && ev.assumptions.scenario === "base" && ev.reverse.growth && ev.sensitivity.a);
    assert.strictEqual(E.evaluate({ ...P, comparable: false }).reverse.growth.value, null, "no reverse DCF across currencies");
    assert.strictEqual(E.evaluate({ history: [] }).assumptions, null);
  }
  console.log("_dcfengine.test.js ok");
})().catch((e) => { console.error(e); process.exit(1); });
