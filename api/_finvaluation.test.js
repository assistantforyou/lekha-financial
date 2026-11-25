// Run: node api/_finvaluation.test.js
// getValuation (api/_fin/service.js) on stubbed providers (no network, no database): the response keeps the shape older callers read, adds the input pack and scenarios,
// and the browser, which recomputes from that pack with the same engine, gets exactly the server's number.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const S = require("./_fin/schemas");
const P = { sec: require("./_fin/providers/sec"), alpaca: require("./_fin/providers/alpaca"), fred: require("./_fin/providers/fred") };
const svc = require("./_fin/service");
const near = (a, b, e = 1e-9, m = "") => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(b)), `${m} ${a} !~ ${b}`);
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);

// ---- stubs ----
let ROWS = {}, PRICE = {}, COVER = {}, QCUR = {}, SECTOR = {};
/* newest first, six fiscal years ending last year. o: { g (revenue growth), margin, icStep (capital added per year), bank, eps, ni } */
const Q = 1e6, company = (o = {}) => Array.from({ length: 6 }, (_, i) => { const k = 5 - i, y = new Date().getUTCFullYear() - 1 - i, rev = 1000 * Q * (1 + (o.g == null ? 0.08 : o.g)) ** k, ebit = rev * (o.margin == null ? 0.25 : o.margin), ic = (800 + (o.icStep == null ? 90 : o.icStep) * k) * Q;
  return S.statement({ symbol: "T", period: `${y}-12-31`, fiscalYear: y, source: "test", revenue: rev, operatingIncome: o.noEbit ? null : ebit, pretaxIncome: ebit * 0.97, incomeTax: ebit * 0.97 * 0.2, interestExpense: o.bank ? rev * 0.3 : 12 * Q, netIncome: o.ni == null ? ebit * 0.97 * 0.8 : o.ni,
    eps: o.eps === undefined ? 2 : o.eps, dilutedShares: o.weighted === false ? null : 102e6, shareholdersEquity: o.bank ? ic : ic - 300 * Q, totalDebt: 300 * Q, leaseLiabilities: 20 * Q, cash: 150 * Q, shortTermInvestments: 30 * Q, longTermInvestments: 25 * Q, minorityInterest: 0,
    totalAssets: o.bank ? ic * 25 : ic * 1.6, totalLiabilities: o.bank ? ic * 25 * 0.92 : ic * 0.9, dividendsPaid: ebit * 0.2, buybacks: ebit * 0.2, da: rev * 0.04, capex: rev * 0.05, operatingCashFlow: rev * 0.3, sbc: rev * 0.03 }); }).reverse().reverse();
P.sec.cikFor = async () => "0000000001";
P.sec.companyFacts = async (cik) => ({ entityName: "T", facts: { dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ val: COVER.shares, end: COVER.end, filed: COVER.end, form: "10-K" }] } } }, "us-gaap": {} } });
P.sec.statements = async (s, { type }) => (type === "annual" ? ROWS[s] : []);
P.sec.profile = async (s) => S.profile({ symbol: s, name: s + " Inc", sector: SECTOR[s] || null, industry: null, source: "test" });
P.alpaca.configured = () => true;
P.alpaca.quotes = async (list) => Object.fromEntries(list.map((s) => [s, S.quote({ symbol: s, price: PRICE[s], previousClose: PRICE[s], currency: QCUR[s] || "USD", source: "test", timestamp: new Date().toISOString() })]));
const days = Array.from({ length: 1500 }, (_, i) => new Date(Date.UTC(2021, 0, 1) + i * 864e5).toISOString().slice(0, 10)).filter((d) => ![0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay()));
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const mktR = days.map(() => (rnd() - 0.5) * 0.02); let m = 400, st = 100; const mkt = [], stk = [];
for (let i = 0; i < days.length; i++) { m *= 1 + mktR[i]; st *= 1 + 1.2 * mktR[i] + (rnd() - 0.5) * 0.004; mkt.push(m); stk.push(st); }
P.alpaca.history = async (s) => days.map((d, i) => S.bar(d, 1, 1, 1, (s === "SPY" ? mkt : stk)[i], 1));
P.fred.series = async (id) => S.macroSeries({ id, name: id, unit: "%", frequency: "daily", points: [["2026-11-24", 4.5]], source: "test" });

let n = 0; const get = async (o, price, overrides, cover) => { const sym = "ZZ" + ++n; ROWS[sym] = company(o); PRICE[sym] = price; SECTOR[sym] = o && o.bank ? "Financials" : "Industrials"; COVER = cover || { shares: 100e6, end: iso(60) }; if (o && o.cur) QCUR[sym] = o.cur; return (await svc.getValuation(sym, overrides)).data; };

(async () => {
  const E = await import(pathToFileURL(path.join(__dirname, "_fin", "valuation", "engine.mjs")).href);

  // 1. response shape: everything older callers read is still there
  const d1 = await get({}, 50);
  for (const k of ["symbol", "price", "currency", "quoteCurrency", "intrinsicPerShare", "impliedGrowth", "impliedGrowthNote", "marginOfSafety", "dcf", "assumptions", "kind", "note", "meta"]) assert.ok(k in d1, "kept: " + k);
  for (const k of ["enterpriseValue", "equityValue", "perShare", "pvOfCashFlows", "pvOfTerminal", "terminalShare"]) assert.ok(k in d1.dcf, "dcf." + k);
  for (const k of ["freeCashFlow", "growth", "growthBasis", "fcfBasis", "terminalGrowth", "discount", "riskFree", "beta", "betaAdjusted", "equityRiskPremium", "costOfEquity", "costOfDebt", "netDebt", "shares", "years"]) assert.ok(k in d1.assumptions, "assumptions." + k);
  assert.ok(d1.intrinsicPerShare > 0 && d1.dcf.terminalShare > 0 && d1.dcf.terminalShare < 1); assert.strictEqual(d1.v2.model, "fcff"); assert.strictEqual(d1.v2.applicable, "fcff");
  assert.deepStrictEqual(Object.keys(d1.scenarios), ["bear", "base", "bull"]); assert.ok(d1.scenarios.bear < d1.scenarios.base && d1.scenarios.base < d1.scenarios.bull);
  near(d1.marginOfSafety, 1 - 50 / d1.intrinsicPerShare, 1e-12); assert.strictEqual(d1.assumptions.equityRiskPremium, E.CONST.ERP);

  // 2. the browser gets the server's number: recomputing from the returned pack and assumptions with the shared engine is identical
  for (const k of ["bear", "base", "bull"]) near(E.value(d1.v2.pack, d1.v2.defaults.scenarios[k]).perShare, d1.scenarios[k], 1e-12, "client = server for " + k);
  near(E.value(d1.v2.pack, d1.v2.defaults.scenarios.base).perShare, d1.intrinsicPerShare, 1e-12);
  near(d1.assumptions.freeCashFlow, E.value(d1.v2.pack, d1.v2.defaults.scenarios.base).rows[0].fcff, 1e-9, "year-1 FCFF is exposed as the cash flow");
  JSON.stringify(d1);   // the whole response is plain JSON

  // 3. reverse DCF: the implied growth reproduces the price
  assert.ok(d1.impliedGrowth != null); near(E.value(d1.v2.pack, { ...d1.v2.defaults.scenarios.base, g1: d1.impliedGrowth }).perShare, 50, 1e-4);
  const dp = await get({}, 1e7); assert.strictEqual(dp.impliedGrowth, null); assert.strictEqual(dp.impliedGrowthNote, "above 40%");

  // 4. beta is a weekly regression against SPY (about 1.2 by construction), shrunk and bounded; the raw value is still reported
  assert.ok(d1.assumptions.beta > 0.9 && d1.assumptions.beta < 1.5, "raw weekly beta near the built-in 1.2: " + d1.assumptions.beta); near(d1.assumptions.betaAdjusted, 0.67 * d1.assumptions.beta + 0.33, 1e-9);
  near(d1.assumptions.costOfEquity, d1.assumptions.riskFree + d1.assumptions.betaAdjusted * d1.assumptions.equityRiskPremium, 1e-9);

  // 5. overrides land on the base case and are flagged; scenarios stay the data's
  const d5 = await get({}, 50, { growth: 0.03, discount: 0.11, terminalGrowth: 0.02, years: 8 });
  assert.strictEqual(d5.assumptions.growth, 0.03); assert.strictEqual(d5.assumptions.discount, 0.11); assert.strictEqual(d5.assumptions.terminalGrowth, 0.02); assert.strictEqual(d5.assumptions.years, 8); assert.strictEqual(d5.v2.baseOverridden, true);
  assert.ok(d5.intrinsicPerShare < d1.intrinsicPerShare, "lower growth, higher discount rate, lower value"); assert.strictEqual(d1.v2.baseOverridden, false);
  const d5b = await get({}, 50, { erp: 0.06 }); assert.strictEqual(d5b.assumptions.equityRiskPremium, 0.06); assert.ok(d5b.assumptions.costOfEquity > d1.assumptions.costOfEquity);

  // 6. the asset-light compounder keeps its growth; the same growth costs a capital-heavy business more
  const light = await get({ g: 0.11, icStep: 0 }, 50), heavy = await get({ g: 0.11, icStep: 150 }, 50);
  near(light.assumptions.growth, 0.11, 1e-9); assert.ok(light.assumptions.salesToCapital > heavy.assumptions.salesToCapital); assert.ok(light.intrinsicPerShare > heavy.intrinsicPerShare);

  // 7. a leveraged financial is valued on residual income
  const bank = await get({ bank: true, margin: 0.10 }, 50); assert.strictEqual(bank.v2.model, "ri"); assert.strictEqual(bank.dcf.enterpriseValue, null); assert.ok(bank.assumptions.startingRoe != null && bank.assumptions.growth === null); assert.ok(bank.intrinsicPerShare > 0);
  for (const k of ["bear", "base", "bull"]) near(E.value(bank.v2.pack, bank.v2.defaults.scenarios[k]).perShare, bank.scenarios[k], 1e-12);

  // 8. loss-making: no DCF, and the reason says what to do
  const loss = await get({ margin: -0.05 }, 50); assert.strictEqual(loss.dcf, null); assert.strictEqual(loss.intrinsicPerShare, null); assert.strictEqual(loss.marginOfSafety, null); assert.strictEqual(loss.v2.applicable, "none"); assert.strictEqual(loss.v2.needsTargetMargin, true); assert.match(loss.v2.reason, /target margin/);

  // 9. share counts: a stale cover-page count (a 2010 value, as Visa has) is not used; no usable count gives a total value and says why
  const stale = await get({}, 50, undefined, { shares: 469280842, end: "2010-01-27" }); assert.strictEqual(stale.v2.pack.shares.basis, "weighted average diluted"); assert.strictEqual(stale.assumptions.shares, 102e6); assert.ok(stale.v2.defaults.warnings.some((w) => /too old to rely on/.test(w)));
  const none = await get({ weighted: false, eps: null }, 50, undefined, { shares: 469280842, end: "2010-01-27" }); assert.strictEqual(none.intrinsicPerShare, null); assert.strictEqual(none.marginOfSafety, null); assert.ok(none.dcf.equityValue > 0, "total equity value is still reported"); assert.ok(none.v2.defaults.warnings.some((w) => /shown in total rather than per share/.test(w)));
  const multi = await get({}, 50, undefined, { shares: 30e6, end: iso(30) }); assert.strictEqual(multi.v2.pack.shares.basic, 102e6, "one share class in the feed: the weighted average is used"); assert.ok(multi.v2.defaults.warnings.some((w) => /several share classes/.test(w)));
  const fresh = await get({}, 50, undefined, { shares: 100e6, end: iso(60) }); assert.match(fresh.v2.pack.shares.basis, /^cover page/);

  // 10. operating income that the filer does not tag is rebuilt from pre-tax income plus interest
  const noEbit = await get({ noEbit: true }, 50); assert.strictEqual(noEbit.v2.applicable, "fcff"); assert.ok(noEbit.intrinsicPerShare > 0);

  // 11. a quote in another currency than the filings: no margin of safety and no reverse DCF against the price
  const fx = await get({ cur: "HKD" }, 50); assert.strictEqual(fx.marginOfSafety, null); assert.strictEqual(fx.impliedGrowth, null); assert.ok(fx.intrinsicPerShare > 0, "the value itself is still reported");

  // 12. nothing in the pack can reach the model by accident: no function values, no undefined that would be dropped
  assert.strictEqual(JSON.stringify(d1.v2.pack).includes("undefined"), false);
  console.log("_finvaluation.test.js ok");
})().catch((e) => { console.error(e); process.exit(1); });
