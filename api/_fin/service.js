// FinancialDataService: the ONLY entry point the UI, the API routes and the AI agent use for financial data.
// It owns provider ordering, fallbacks, caching, unit-safe normalization and the calculated metrics. Providers never leak their own schemas.
//
//   MarketDataProvider ....... alpaca -> finnhub -> fmp -> yahoo -> twelvedata -> alphavantage   (quotes, history)
//   FundamentalsProvider ..... sec -> fmp                                                       (statements, profile)
//   SECProvider .............. sec                                                              (filings, company facts)
//   NewsProvider ............. finnhub + yahoo rss + publisher rss (merged, de-duplicated)
//   MacroProvider ............ fred
//   FXProvider ............... frankfurter          CryptoProvider ... coingecko -> alphavantage
//   AlternativeDataProvider .. existing keyless pipelines (CFTC, ETF flows, insiders, 13F) stay behind /api/free
const P = {
  sec: require("./providers/sec"), fred: require("./providers/fred"), alpaca: require("./providers/alpaca"), yahoo: require("./providers/yahoo"), twelvedata: require("./providers/twelvedata"),
  finnhub: require("./providers/finnhub"), fmp: require("./providers/fmp"), alphavantage: require("./providers/alphavantage"), fx: require("./providers/fx"), coingecko: require("./providers/coingecko"), news: require("./providers/news"),
};
const S = require("./schemas");
const C = require("./calc");
const obs = require("./obs");
const { cacheFetch } = require("./cache");

const SP = Object.fromEntries(require("../_data/sp500.json").stocks);
const isCrypto = (s) => /-USD$/i.test(s) || /^(BTC|ETH|SOL|XRP|DOGE|ADA)$/i.test(s);
const isIntl = (s) => /\.(HK|BK|T|L|TO|AX|SI|KS|KQ|SS|SZ|NS|BO|DE|PA|AS|SW|MI|MC|TW)$/i.test(s) || /^\^/.test(s);
// As-of mode (demo): every datum is cut off at a past date, so a demo visitor never sees live data. See _fin/asof.js.
const DAYMS = 864e5, gapDays = (a) => Math.max(0, Math.ceil((Date.now() - Date.parse(a + "T00:00:00Z")) / DAYMS)), shift = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * DAYMS).toISOString().slice(0, 10), day = (x) => String(x == null ? "" : x).slice(0, 10);
const clean = (s) => String(s || "").trim().toUpperCase();
const sym = (s) => { const v = clean(s); if (!/^[A-Z0-9^][A-Z0-9.\-^=]{0,14}$/.test(v)) throw Object.assign(new Error("bad_symbol"), { status: 400 }); return v; };

// Run providers in order until one works. Returns {data, source, attempts}. Providers that are not configured are skipped silently (listed as "skipped").
async function chain(op, attempts) {
  const log = [];
  for (const [prov, run] of attempts) {
    if (prov.configured && !prov.configured()) { log.push({ provider: prov.name, status: "skipped" }); continue; }
    try { const data = await run(); if (data != null && !(Array.isArray(data) && !data.length)) { log.push({ provider: prov.name, status: "ok" }); return { data, source: prov.name, attempts: log }; } log.push({ provider: prov.name, status: "empty" }); }
    catch (e) { log.push({ provider: prov.name, status: "error", error: String(e && e.message || e).slice(0, 100) }); }
  }
  const err = new Error(`no_provider_for_${op}`); err.attempts = log; err.status = 502; throw err;
}
const wrap = (r, c) => ({ data: r.data, meta: { source: r.source, attempts: r.attempts, cache: c ? c.cache : "miss", stale: c ? !!c.stale : false, ageMs: c ? c.ageMs : 0 } });
async function cached(cls, key, producer, opts) { const c = await cacheFetch(cls, key, producer, opts); return wrap(c.value, c); }

// ---------------- market data ----------------
async function quoteAsOf(symbol, asOf) {
  const s = sym(symbol), [h, live] = await Promise.all([getHistoricalPrices(s, { days: 12, asOf }), getQuote(s).catch(() => null)]);
  const bars = h.data; if (!bars.length) throw Object.assign(new Error("no_history_at_date"), { status: 404, attempts: h.meta.attempts });
  const b = bars[bars.length - 1], p = bars[bars.length - 2], l = live && live.data;
  return { data: S.quote({ symbol: s, name: l && l.name, price: b[4], previousClose: p ? p[4] : null, open: b[1], high: b[2], low: b[3], volume: b[5], currency: l && l.currency, exchange: l && l.exchange, timestamp: day(b[0]) + "T20:00:00Z", source: h.meta.source, freshness: "historical" }), meta: { ...h.meta, asOf } };
}
async function getQuote(symbol, { asOf } = {}) {
  if (asOf) return quoteAsOf(symbol, asOf);
  const s = sym(symbol);
  return cached("quote", s, () => {
    if (isCrypto(s)) return chain("quote", [[P.coingecko, () => P.coingecko.quote(s)], [P.alphavantage, () => P.alphavantage.cryptoQuote(s)]]);
    if (isIntl(s)) return chain("quote", [[P.yahoo, () => P.yahoo.quote(s)], [P.fmp, () => P.fmp.quote(s)], [P.finnhub, () => P.finnhub.quote(s)], [P.twelvedata, () => P.twelvedata.quote(s)]]);
    return chain("quote", [[P.alpaca, async () => (await P.alpaca.quotes([s]))[s]], [P.finnhub, () => P.finnhub.quote(s)], [P.fmp, () => P.fmp.quote(s)], [P.yahoo, () => P.yahoo.quote(s)], [P.twelvedata, () => P.twelvedata.quote(s)], [P.alphavantage, () => P.alphavantage.quote(s)]]);
  });
}
async function getQuotes(symbols, { asOf } = {}) {
  const list = [...new Set(symbols.map(sym))].slice(0, 40), out = {}, meta = {};
  if (asOf) { await Promise.all(list.map(async (s) => { try { const r = await quoteAsOf(s, asOf); out[s] = r.data; meta[s] = r.meta; } catch (e) { meta[s] = { error: e.message }; } })); return { data: out, meta: { source: "mixed", asOf, perSymbol: meta } }; }
  const us = list.filter((s) => !isCrypto(s) && !isIntl(s));
  if (us.length && P.alpaca.configured()) { try { const q = await obs.timed("alpaca", "batch", () => P.alpaca.quotes(us)); Object.assign(out, q); } catch (e) { /* individual fallbacks below */ } }
  await Promise.all(list.filter((s) => !out[s]).map(async (s) => { try { const r = await getQuote(s); out[s] = r.data; meta[s] = r.meta; } catch (e) { meta[s] = { error: e.message }; } }));
  return { data: out, meta: { source: "mixed", perSymbol: meta } };
}
async function getHistoricalPrices(symbol, { days = 365, asOf } = {}) {
  const s = sym(symbol), d = Math.max(5, Math.min(3650, +days || 365));
  if (asOf) { const r = await getHistoricalPrices(s, { days: Math.min(3650, d + gapDays(asOf) + 7) }), from = shift(asOf, -d); return { data: r.data.filter((b) => day(b[0]) <= asOf && day(b[0]) >= from), meta: { ...r.meta, asOf } }; }
  return cached("history", `${s}/${d}`, () => {
    if (isCrypto(s)) return chain("history", [[P.coingecko, () => P.coingecko.history(s, { days: d })]]);
    if (isIntl(s)) return chain("history", [[P.yahoo, () => P.yahoo.history(s, { days: d })], [P.twelvedata, () => P.twelvedata.history(s, { days: d })]]);
    return chain("history", [[P.alpaca, () => P.alpaca.history(s, { days: d })], [P.twelvedata, () => P.twelvedata.history(s, { days: d })], [P.yahoo, () => P.yahoo.history(s, { days: d })]]);
  });
}

async function getIntradayPrices(symbol, { days = 1, asOf } = {}) {
  const s = sym(symbol), d = +days <= 1 ? 1 : 5, k = `${s}/${d}${asOf ? "/" + asOf : ""}`;
  return cached("intraday", k, () => {
    if (isCrypto(s) || isIntl(s)) return chain("intraday", [[P.yahoo, () => P.yahoo.intraday(s, { days: d, asOf })]]);
    return chain("intraday", [[P.alpaca, () => P.alpaca.intraday(s, { days: d, asOf })], [P.yahoo, () => P.yahoo.intraday(s, { days: d, asOf })]]);
  });
}

// ---------------- company ----------------
async function getCompanyProfile(symbol) {
  const s = sym(symbol);
  return cached("profile", s, async () => {
    const r = await chain("profile", [[P.fmp, () => P.fmp.profile(s)], [P.finnhub, () => P.finnhub.profile(s)], [P.sec, () => P.sec.profile(s)]]);
    if (r.source !== "sec" && P.sec.configured()) { try { const sp = await P.sec.profile(s); if (sp) { r.data.cik = r.data.cik || sp.cik; r.data.industry = r.data.industry || sp.industry; } } catch (e) { /* optional */ } }
    if (!r.data.sector && SP[s]) r.data.sector = SP[s];
    return r;
  });
}
async function getFinancialStatements(symbol, { type = "annual", asOf } = {}) {
  const s = sym(symbol), t = type === "quarterly" ? "quarterly" : "annual";
  if (asOf) { const r = await getFinancialStatements(s, { type: t }); // the SEC feed keeps the latest filing per period (restated figures), so a row's filing date can be after the cut-off even though the period was reported long before it;
    // such a row is kept when its first report was due (10-K 75 days, 10-Q 50 days after the period end) and its date is shown as that due date
    const due = (x) => shift(day(x.period), t === "annual" ? 75 : 50), rows = r.data.filter((x) => day(x.filingDate || due(x)) <= asOf || due(x) <= asOf).map((x) => (x.filingDate && day(x.filingDate) > asOf ? { ...x, filingDate: due(x) } : x));
    return { data: rows, meta: { ...r.meta, asOf } }; }
  return cached("statements", `${s}/${t}`, () => chain("statements", [[P.sec, () => P.sec.statements(s, { type: t })], [P.fmp, () => P.fmp.statements(s, { type: t })]]), { ttl: 6 * 36e5, shared: true });
}
async function getCompanyFacts(symbol, { asOf } = {}) {
  if (asOf) { const r = await getCompanyFacts(symbol), so = r.data.sharesOutstanding; return { data: { ...r.data, sharesOutstanding: so && so.filed && day(so.filed) > asOf ? null : so }, meta: { ...r.meta, asOf } }; }
  const s = sym(symbol), cik = await P.sec.cikFor(s); if (!cik) throw Object.assign(new Error("no_cik"), { status: 404 });
  return cached("facts", `facts/${s}`, async () => ({ data: await (async () => {
    const f = await P.sec.companyFacts(cik); if (!f) return null;
    const dei = f.facts && f.facts.dei || {}, last = (c, u) => { const a = c && c.units && c.units[u]; return a && a.length ? a.slice().sort((x, y) => (x.end < y.end ? 1 : -1))[0] : null; };
    const so = last(dei.EntityCommonStockSharesOutstanding, "shares"), pf = last(dei.EntityPublicFloat, "USD");
    return { cik, entityName: f.entityName, sharesOutstanding: so ? { value: so.val, asOf: so.end, form: so.form, filed: so.filed } : null, publicFloat: pf ? { value: pf.val, unit: "USD", asOf: pf.end } : null,
      concepts: Object.keys((f.facts && f.facts["us-gaap"]) || {}).length, source: "SEC EDGAR", meta: S.meta({ source: "SEC EDGAR", asOf: so && so.end, freshness: "historical" }) };
  })(), source: "sec", attempts: [{ provider: "sec", status: "ok" }] }));
}
async function getSecFilings(symbol, opts = {}) {
  const s = sym(symbol);
  if (opts.asOf) { const r = await getSecFilings(s, { ...opts, asOf: undefined, limit: Math.max(150, opts.limit || 40) }); return { data: r.data.filter((f) => day(f.filingDate) <= opts.asOf).slice(0, opts.limit || 40), meta: { ...r.meta, asOf: opts.asOf } }; }
  return cached("filings", `${s}/${(opts.forms || []).join(",")}/${opts.limit || 40}`, () => chain("filings", [[P.sec, () => P.sec.filings(s, opts)]])); }

// ---------------- news ----------------
const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
const urlKey = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, ""); } catch (e) { return u; } };
function dedupe(items) {
  const seenH = new Map(), seenU = new Set(), out = [];
  for (const it of items.sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))) {
    const h = norm(it.headline), u = urlKey(it.url);
    if (seenU.has(u)) continue; const dup = seenH.get(h); if (dup) { dup.alsoReportedBy = [...new Set([...(dup.alsoReportedBy || []), it.source])]; seenU.add(u); continue; }
    seenU.add(u); seenH.set(h, it); out.push(it);
  }
  return out;
}
// text is cleaned on the way out as well as on the way in, so rows already sitting in the shared cache are fixed too
const cleanText = (t) => (t == null ? t : P.news.decode(t));
async function getNews(opts = {}) {
  const { asOf = null } = opts, limit = Math.max(1, Math.min(60, +opts.limit || 25));
  if (asOf) { const r = await getNews({ symbol: opts.symbol, category: opts.category, query: opts.query, limit: 150 }); return { data: r.data.filter((n) => day(n.publishedAt) <= asOf).slice(0, limit), meta: { ...r.meta, asOf, note: "Headlines are not archived for the demo date." } }; }
  const r = await getNewsCached(opts);
  return { ...r, data: (r.data || []).slice(0, limit).map((n) => ({ ...n, headline: cleanText(n.headline), summary: cleanText(n.summary) })) };
}
async function getNewsCached({ symbol = null, category = null, query = null } = {}) {
  const s = symbol ? sym(symbol) : null, key = `${s || "market"}/${category || "all"}/${query || ""}`;   // limit is applied after the cache so every caller shares one upstream fetch
  return cached("news", key, async () => {
    const parts = [], attempts = [];
    const add = async (prov, run) => { if (prov.configured && !prov.configured()) { attempts.push({ provider: prov.name, status: "skipped" }); return; } try { const r = await run(); parts.push(...r); attempts.push({ provider: prov.name, status: r.length ? "ok" : "empty" }); } catch (e) { attempts.push({ provider: prov.name, status: "error", error: String(e.message).slice(0, 80) }); } };
    if (s) await Promise.all([add(P.finnhub, () => P.finnhub.companyNews(s)), add(P.news, () => P.news.company(s)), add({ name: "rss-market", configured: () => true }, () => P.news.mentioning(s))]);
    else await Promise.all([add(P.finnhub, () => P.finnhub.marketNews("general")), add(P.news, () => P.news.market())]);
    if (!parts.length) { const e = new Error("no_provider_for_news"); e.attempts = attempts; e.status = 502; throw e; }
    let items = dedupe(parts); if (category) items = items.filter((n) => n.category === category); if (query) { const q = query.toLowerCase(); items = items.filter((n) => (n.headline + " " + (n.summary || "")).toLowerCase().includes(q)); }
    return { data: items.slice(0, 150), source: "merged", attempts };
  }, { ttl: 10 * 6e4 });
}

// ---------------- earnings / estimates / peers ----------------
async function getEarnings(symbol, { asOf } = {}) {
  const s = sym(symbol);
  if (asOf) { const r = await getEarnings(s); return { data: r.data.filter((x) => day(x.date) <= asOf), meta: { ...r.meta, asOf } }; }
  return cached("earnings", s, async () => {
    const r = await chain("earnings", [[P.fmp, () => P.fmp.earnings(s)], [P.finnhub, () => P.finnhub.earnings(s)], [P.sec, async () => {
      const q = await P.sec.statements(s, { type: "quarterly" });   // reported EPS only: no estimates are available from SEC
      return q.filter((x) => x.eps != null).slice(0, 12).map((x) => S.earningsEvent({ symbol: s, date: x.filingDate || x.period, fiscalPeriod: `${x.fiscalPeriod || ""} ${x.fiscalYear || ""}`.trim(), epsActual: x.eps, source: "SEC EDGAR" }));
    }]]);
    return r;
  });
}
async function getEstimates(symbol, { asOf } = {}) {
  const s = sym(symbol);
  if (asOf) throw Object.assign(new Error("not_available_in_demo"), { status: 404 });
  return cached("estimates", s, async () => {
    const r = await chain("estimates", [[P.fmp, async () => ({ annual: await P.fmp.estimates(s), priceTarget: await P.fmp.priceTarget(s).catch(() => null) })],
      [P.finnhub, async () => { const rec = await P.finnhub.recommendations(s); return rec ? { annual: [], recommendations: rec } : null; }]]);
    return r;
  });
}
async function getPeers(symbol) {
  const s = sym(symbol);
  return cached("peers", s, async () => {
    const r = await chain("peers", [[P.fmp, () => P.fmp.peers(s)], [P.finnhub, () => P.finnhub.peers(s)], [{ name: "sp500-sector", configured: () => true }, async () => { const sec = SP[s]; return sec ? Object.keys(SP).filter((t) => SP[t] === sec && t !== s).slice(0, 8) : null; }]]);
    return r;
  });
}

// ---------------- macro / fx / crypto ----------------
async function getMacroSeries(id, { years = 10, asOf } = {}) {
  const key = String(id).toUpperCase(); if (!P.fred.CATALOG[key]) throw Object.assign(new Error("unknown_series"), { status: 404 });
  if (asOf) {   // only observations that had been published by the date: monthly data lands about six weeks after its period
    const r = await getMacroSeries(key, { years: years + Math.ceil(gapDays(asOf) / 365) + 1 }), lag = { daily: 3, weekly: 10, monthly: 45, quarterly: 100 }[r.data.frequency] || 45, hi = shift(asOf, -lag), lo = shift(asOf, -Math.round(years * 366));
    return { data: S.macroSeries({ ...r.data, points: r.data.points.filter((p) => p[0] <= hi && p[0] >= lo) }), meta: { ...r.meta, asOf } };
  }
  return cached("macro", `${key}/${years}`, () => chain("macro", [[P.fred, () => P.fred.series(key, { years })]])); }
async function getMacroDashboard({ asOf } = {}) {
  const run = (build) => (asOf ? build().then((r) => ({ data: r.data, meta: { source: r.source, asOf, attempts: r.attempts } })) : cached("macro", "dashboard", build, { ttl: 6 * 36e5 }));
  return run(async () => {
    const ids = Object.keys(P.fred.CATALOG), res = await Promise.all(ids.map((id) => getMacroSeries(id, { years: 6, asOf }).then((r) => r.data).catch(() => null))), series = res.filter(Boolean);
    const by = Object.fromEntries(series.map((x) => [x.id, x])), v = (id) => by[id] && by[id].latest ? by[id].latest.value : null;
    const curve = v("T10Y2Y"); const regime = { inverted: curve != null ? curve < 0 : null, realFedFunds: v("FEDFUNDS") != null && v("CPIAUCSL") != null ? v("FEDFUNDS") / 100 - v("CPIAUCSL") : null };
    return { data: { series, groups: [...new Set(series.map((x) => x.group))], derived: { ...regime, note: "Real fed funds = effective rate minus CPI year over year (calculated)." } }, source: "fred", attempts: [{ provider: "fred", status: "ok" }] };
  });
}
async function getFX(base = "USD", { asOf } = {}) { if (asOf) return cached("fx", `${base}@${asOf}`, () => chain("fx", [[P.fx, () => P.fx.rates(base, undefined, asOf)]]), { ttl: 36e5 }); return cached("fx", base, () => chain("fx", [[P.fx, () => P.fx.rates(base)]])); }

// ---------------- search ----------------
const ETFS = [["SPY", "SPDR S&P 500 ETF Trust"], ["QQQ", "Invesco QQQ Trust"], ["IWM", "iShares Russell 2000 ETF"], ["DIA", "SPDR Dow Jones Industrial Average ETF"], ["VTI", "Vanguard Total Stock Market ETF"], ["VOO", "Vanguard S&P 500 ETF"], ["XLK", "Technology Select Sector SPDR"], ["XLF", "Financial Select Sector SPDR"], ["XLE", "Energy Select Sector SPDR"], ["XLV", "Health Care Select Sector SPDR"], ["SMH", "VanEck Semiconductor ETF"], ["TLT", "iShares 20+ Year Treasury Bond ETF"], ["GLD", "SPDR Gold Shares"], ["ARKK", "ARK Innovation ETF"]];
const INDICES = [["^GSPC", "S&P 500 index"], ["^IXIC", "Nasdaq Composite index"], ["^DJI", "Dow Jones Industrial Average"], ["^RUT", "Russell 2000 index"], ["^VIX", "CBOE Volatility Index"], ["^TNX", "10-year Treasury yield"]];
const CRYPTO = [["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["SOL-USD", "Solana"], ["XRP-USD", "XRP"], ["DOGE-USD", "Dogecoin"], ["ADA-USD", "Cardano"]];
const CONCEPTS = [
  { id: "pe", term: "P/E ratio", text: "Price divided by trailing earnings per share. Calculated by the app from the quote and reported EPS.", route: "company" }, { id: "dcf", term: "Discounted cash flow (DCF)", text: "Present value of projected free cash flow. Open Intrinsic Value for the app's models.", route: "analysis/value" },
  { id: "fcf-yield", term: "FCF yield", text: "Free cash flow divided by market cap.", route: "company" }, { id: "margin-of-safety", term: "Margin of safety", text: "Discount of price to intrinsic value.", route: "analysis/value" }, { id: "wacc", term: "WACC", text: "Blended cost of equity and debt used as the DCF discount rate.", route: "analysis/value" },
  { id: "drawdown", term: "Drawdown", text: "Decline from a prior peak.", route: "portfolio/risk" }, { id: "sharpe", term: "Sharpe ratio", text: "Excess return per unit of volatility.", route: "simulation/main" }, { id: "rotation", term: "Sector rotation", text: "Money moving between sectors over the cycle.", route: "sector/rrg" },
  { id: "yield-curve", term: "Yield curve", text: "Treasury yields across maturities; inversion (10y minus 2y below zero) has preceded recessions.", route: "macro/dashboard" }, { id: "cpi", term: "CPI inflation", text: "Consumer price index year over year.", route: "macro/dashboard" }, { id: "beta", term: "Beta", text: "Sensitivity of a stock to market moves.", route: "analysis/deep" }, { id: "roic", term: "ROIC", text: "After-tax operating profit divided by invested capital.", route: "company" },
];
async function search(query, { limit = 12 } = {}) {
  const q = String(query || "").trim(); if (q.length < 1) return { data: { query: q, results: [] }, meta: { source: "local" } };
  const ql = q.toLowerCase(), results = [], seen = new Set(), push = (r) => { const k = r.symbol + "|" + r.type; if (!seen.has(k)) { seen.add(k); results.push(r); } };
  const base = (r) => (r.symbol.toLowerCase() === ql ? 0 : r.symbol.toLowerCase().startsWith(ql) ? 1 : r.name.toLowerCase().startsWith(ql) ? 2 : r.name.toLowerCase().includes(ql) ? 3 : 4);
  // tie-breakers: S&P 500 members first, then plain US tickers, then SEC-registered names; exchange-suffixed and OTC lines last
  const score = (r) => base(r) * 10 + (SP[r.symbol] ? 0 : /[.=^]/.test(r.symbol) ? 6 : r.cik ? 2 : 4) + (/otc/i.test(r.exchange || "") ? 3 : 0);
  const attempts = [];
  try { const dir = await P.sec.directory(); for (const x of dir) { if (x.ticker.toLowerCase().startsWith(ql) || x.name.toLowerCase().includes(ql)) push({ symbol: x.ticker, name: x.name, exchange: null, type: "equity", cik: x.cik, source: "SEC EDGAR" }); if (results.length > 80) break; } attempts.push({ provider: "sec", status: "ok" }); } catch (e) { attempts.push({ provider: "sec", status: "error" }); }
  for (const [t, n] of ETFS) if (t.toLowerCase().startsWith(ql) || n.toLowerCase().includes(ql)) push({ symbol: t, name: n, exchange: "NYSE Arca", type: "etf", source: "built-in list" });
  for (const [t, n] of INDICES) if (t.toLowerCase().includes(ql) || n.toLowerCase().includes(ql)) push({ symbol: t, name: n, exchange: null, type: "index", source: "built-in list" });
  for (const [t, n] of CRYPTO) if (t.toLowerCase().startsWith(ql) || n.toLowerCase().includes(ql)) push({ symbol: t, name: n, exchange: "Crypto", type: "crypto", source: "built-in list" });
  if (results.length < 6) for (const prov of [P.finnhub, P.fmp, P.yahoo]) { if (prov.configured && !prov.configured()) continue; try { (await prov.search(q)).forEach(push); attempts.push({ provider: prov.name, status: "ok" }); break; } catch (e) { attempts.push({ provider: prov.name, status: "error" }); } }
  results.sort((a, b) => score(a) - score(b));
  const concepts = CONCEPTS.filter((c) => c.term.toLowerCase().includes(ql) || c.id.includes(ql)).slice(0, 3);
  const top = results[0];
  const intents = top && top.type !== "index" ? [{ kind: "company", symbol: top.symbol, label: `${top.name} (${top.symbol}) · company workspace`, route: `company/${top.symbol}` }, { kind: "filings", symbol: top.symbol, label: `SEC filings for ${top.symbol}`, route: `company/${top.symbol}?tab=filings` }, { kind: "news", symbol: top.symbol, label: `News about ${top.symbol}`, route: `company/${top.symbol}?tab=news` }] : [];
  return { data: { query: q, results: results.slice(0, limit), concepts, intents }, meta: { source: "merged", attempts } };
}

// ---------------- derived: ratios, growth, valuation (all deterministic, via calc.js) ----------------
const m = (id, label, value, unit, formula, inputs, extra = {}) => ({ id, label, ...C.result(label, value, unit, formula, inputs), ...extra });
async function getRatios(symbol, { asOf } = {}) {
  const s = sym(symbol);
  const [ann, qtr, qt] = await Promise.all([getFinancialStatements(s, { type: "annual", asOf }).catch(() => null), getFinancialStatements(s, { type: "quarterly", asOf }).catch(() => null), getQuote(s, { asOf }).catch(() => null)]);
  const A = (ann && ann.data) || [], Q = (qtr && qtr.data) || [], quote = qt && qt.data, a0 = A[0] || {}, a1 = A[1] || {};
  const facts = await getCompanyFacts(s, { asOf }).then((r) => r.data).catch(() => null);
  const shares = (facts && facts.sharesOutstanding && facts.sharesOutstanding.value) || a0.dilutedShares || null, price = quote ? quote.price : null;
  const marketCap = price != null && shares ? price * shares : null;
  const ttm = (f) => (Q.length >= 4 ? C.ttm(Q.map((x) => ({ period: x.period, [f]: x[f] })), f) : null);
  const epsTtm = ttm("eps") != null ? ttm("eps") : a0.eps, fcfTtm = ttm("freeCashFlow") != null ? ttm("freeCashFlow") : a0.freeCashFlow, ebitdaTtm = ttm("ebitda") != null ? ttm("ebitda") : a0.ebitda, revTtm = ttm("revenue") != null ? ttm("revenue") : a0.revenue;
  const ev = C.enterpriseValue(marketCap, a0.totalDebt, (a0.cash || 0) + (a0.shortTermInvestments || 0));
  const taxRate = a0.incomeTax != null && a0.netIncome != null && a0.netIncome + a0.incomeTax > 0 ? a0.incomeTax / (a0.netIncome + a0.incomeTax) : 0.21;
  const basis = ttm("eps") != null ? "trailing four quarters" : "latest fiscal year", per = a0.period;
  const metrics = [
    m("marketCap", "Market cap", marketCap, "USD", "price × shares outstanding", { price, shares }),
    m("ev", "Enterprise value", ev, "USD", "market cap + total debt − cash and short-term investments", { marketCap, debt: a0.totalDebt, cash: a0.cash }),
    m("pe", "P/E", C.pe(price, epsTtm), "x", `price ÷ diluted EPS (${basis})`, { price, eps: epsTtm }), m("earningsYield", "Earnings yield", C.earningsYield(epsTtm, price), "fraction", "EPS ÷ price", { eps: epsTtm, price }),
    m("evEbitda", "EV/EBITDA", C.evToEbitda(ev, ebitdaTtm), "x", `EV ÷ EBITDA (${basis}; EBITDA = operating income + D&A)`, { ev, ebitda: ebitdaTtm }), m("fcfYield", "FCF yield", C.fcfYield(fcfTtm, marketCap), "fraction", "free cash flow ÷ market cap", { fcf: fcfTtm, marketCap }),
    m("ps", "Price/Sales", C.priceToSales(marketCap, revTtm), "x", "market cap ÷ revenue", { marketCap, revenue: revTtm }), m("pb", "Price/Book", C.priceToBook(marketCap, a0.shareholdersEquity), "x", "market cap ÷ shareholders' equity", { marketCap, equity: a0.shareholdersEquity }),
    m("grossMargin", "Gross margin", C.margin(a0.grossProfit, a0.revenue), "fraction", "gross profit ÷ revenue", { grossProfit: a0.grossProfit, revenue: a0.revenue }, { period: per }),
    m("operatingMargin", "Operating margin", C.margin(a0.operatingIncome, a0.revenue), "fraction", "operating income ÷ revenue", { operatingIncome: a0.operatingIncome, revenue: a0.revenue }, { period: per }),
    m("netMargin", "Net margin", C.margin(a0.netIncome, a0.revenue), "fraction", "net income ÷ revenue", { netIncome: a0.netIncome, revenue: a0.revenue }, { period: per }),
    m("fcfMargin", "FCF margin", C.margin(a0.freeCashFlow, a0.revenue), "fraction", "free cash flow ÷ revenue", { fcf: a0.freeCashFlow, revenue: a0.revenue }, { period: per }),
    m("roe", "Return on equity", C.roe(a0.netIncome, a0.shareholdersEquity, a1.shareholdersEquity), "fraction", "net income ÷ average equity", { netIncome: a0.netIncome, equityEnd: a0.shareholdersEquity, equityBegin: a1.shareholdersEquity }, { period: per }),
    m("roic", "Return on invested capital", C.roic(a0.operatingIncome, taxRate, a0.totalDebt, a0.shareholdersEquity, a0.cash), "fraction", "operating income × (1 − tax rate) ÷ (debt + equity − cash)", { ebit: a0.operatingIncome, taxRate, debt: a0.totalDebt, equity: a0.shareholdersEquity, cash: a0.cash }, { period: per }),
    m("debtEquity", "Debt/Equity", C.debtToEquity(a0.totalDebt, a0.shareholdersEquity), "x", "total debt ÷ shareholders' equity", { debt: a0.totalDebt, equity: a0.shareholdersEquity }, { period: per }),
    m("currentRatio", "Current ratio", C.currentRatio(a0.totalCurrentAssets, a0.totalCurrentLiabilities), "x", "current assets ÷ current liabilities", { ca: a0.totalCurrentAssets, cl: a0.totalCurrentLiabilities }, { period: per }),
    m("interestCoverage", "Interest coverage", C.interestCoverage(a0.operatingIncome, a0.interestExpense), "x", "operating income ÷ interest expense", { ebit: a0.operatingIncome, interest: a0.interestExpense }, { period: per }),
  ];
  const growth = [["revenue", "Revenue"], ["netIncome", "Net income"], ["eps", "EPS"], ["freeCashFlow", "Free cash flow"]].flatMap(([f, label]) => {
    const yearsBack = Math.min(5, A.length - 1), old = A[yearsBack] || {};
    return [m(f + "Yoy", `${label} growth (YoY)`, C.yoy(a0[f], a1[f]), "fraction", `${label.toLowerCase()} ÷ prior-year ${label.toLowerCase()} − 1`, { current: a0[f], prior: a1[f] }, { period: per }),
      m(f + "Cagr", `${label} CAGR (${yearsBack}y)`, yearsBack >= 2 ? C.cagr(old[f], a0[f], yearsBack) : null, "fraction", "(end ÷ start)^(1 ÷ years) − 1", { start: old[f], end: a0[f], years: yearsBack }, { period: per })];
  });
  const qgrowth = Q.length >= 2 ? [m("revenueQoq", "Revenue growth (QoQ)", C.qoq(Q[0].revenue, Q[1].revenue), "fraction", "latest quarter revenue ÷ prior quarter − 1", { current: Q[0].revenue, prior: Q[1].revenue }, { period: Q[0].period })] : [];
  const pegV = C.peg(C.pe(price, epsTtm), C.yoy(a0.eps, a1.eps)); metrics.push(m("peg", "PEG", pegV, "x", "P/E ÷ (EPS growth % )", { pe: C.pe(price, epsTtm), epsGrowth: C.yoy(a0.eps, a1.eps) }));
  return { data: { symbol: s, price, asOf: quote ? quote.timestamp : null, metrics, growth: [...growth, ...qgrowth], sources: { quote: qt && qt.meta.source, statements: ann && ann.meta.source }, units: "money in USD; ratios in x; rates as fractions" }, meta: { source: "calculated", attempts: [] } };
}
async function getValuation(symbol, overrides = {}) {
  const s = sym(symbol), asOf = overrides.asOf || undefined;
  const [ann, qt, rf, hist, mkt] = await Promise.all([getFinancialStatements(s, { asOf }).catch(() => null), getQuote(s, { asOf }).catch(() => null), getMacroSeries("DGS10", { years: 1, asOf }).catch(() => null), getHistoricalPrices(s, { days: 380, asOf }).catch(() => null), getHistoricalPrices("SPY", { days: 380, asOf }).catch(() => null)]);
  const A = (ann && ann.data) || [], a0 = A[0] || {}, facts = await getCompanyFacts(s, { asOf }).then((r) => r.data).catch(() => null);
  const shares = (facts && facts.sharesOutstanding && facts.sharesOutstanding.value) || a0.dilutedShares, price = qt && qt.data.price;
  const rfRate = rf && rf.data.latest ? rf.data.latest.value / 100 : 0.04;
  let b = null; if (hist && mkt) { const closes = (r) => r.data.map((x) => x[4]); b = C.beta(C.returnsFrom(closes(hist)), C.returnsFrom(closes(mkt))); }
  const fcf = overrides.fcf != null ? overrides.fcf : a0.freeCashFlow;
  const hg = A.length >= 4 ? C.cagr(A[Math.min(4, A.length - 1)].freeCashFlow, a0.freeCashFlow, Math.min(4, A.length - 1)) : null;
  const g = overrides.growth != null ? overrides.growth : Math.max(0, Math.min(0.15, hg != null ? hg : 0.05));
  const ke = C.costOfEquity(rfRate, b != null ? Math.max(0.6, Math.min(2, b)) : 1, overrides.erp != null ? overrides.erp : 0.05), debt = a0.totalDebt || 0, mc = price && shares ? price * shares : null;
  const kd = a0.interestExpense && debt ? Math.min(0.12, Math.abs(a0.interestExpense) / debt) : 0.05;
  const w = overrides.discount != null ? overrides.discount : (mc && ke != null ? C.wacc({ equity: mc, debt, costEquity: ke, costDebt: kd }) : ke);
  const netDebt = (a0.totalDebt || 0) - (a0.cash || 0) - (a0.shortTermInvestments || 0);
  const out = w != null ? C.dcf({ fcf, growth: g, years: overrides.years || 10, terminalGrowth: overrides.terminalGrowth != null ? overrides.terminalGrowth : 0.025, discount: w, netDebt, shares }) : null;
  const assumptions = { freeCashFlow: fcf, growth: g, growthBasis: overrides.growth != null ? "user override" : hg != null ? "historical FCF CAGR, capped 0–15%" : "default 5% (history unavailable)", terminalGrowth: overrides.terminalGrowth != null ? overrides.terminalGrowth : 0.025, discount: w, riskFree: rfRate, beta: b, costOfEquity: ke, costOfDebt: kd, netDebt, shares, years: overrides.years || 10 };
  return { data: { symbol: s, price, intrinsicPerShare: out && out.perShare, marginOfSafety: out && out.perShare && price ? 1 - price / out.perShare : null, dcf: out, assumptions, kind: "calculated", note: "Model output, not a price target. Every assumption is listed and editable; free cash flow and shares come from SEC filings.", meta: S.meta({ source: "calculated from SEC EDGAR + market data", kind: "calculated", freshness: "delayed" }) }, meta: { source: "calculated", attempts: [] } };
}

// ---------------- the whole company workspace in one round trip ----------------
async function getCompanyBundle(symbol, { asOf } = {}) {
  const s = sym(symbol), safe = async (fn) => { try { const r = await fn(); return { ok: true, data: r.data, meta: r.meta }; } catch (e) { return { ok: false, error: e.message, attempts: e.attempts }; } };
  const [quote, profile, annual, quarterly, ratios, filings, news, earnings, peers, history] = await Promise.all([
    safe(() => getQuote(s, { asOf })), safe(() => getCompanyProfile(s)), safe(() => getFinancialStatements(s, { type: "annual", asOf })), safe(() => getFinancialStatements(s, { type: "quarterly", asOf })), safe(() => getRatios(s, { asOf })),
    safe(() => getSecFilings(s, { limit: 25, asOf })), safe(() => getNews({ symbol: s, limit: 20, asOf })), safe(() => getEarnings(s, { asOf })), safe(() => getPeers(s)), safe(() => getHistoricalPrices(s, { days: 730, asOf })) ]);
  return { symbol: s, generatedAt: asOf ? asOf + "T20:00:00Z" : new Date().toISOString(), asOf: asOf || null, quote, profile, annual, quarterly, ratios, filings, news, earnings, peers, history };
}

function status() {
  return Object.values(P).map((p) => ({ name: p.name, configured: p.configured(), license: p.license || null }));
}

module.exports = { getQuote, getQuotes, getHistoricalPrices, getIntradayPrices, getCompanyProfile, getFinancialStatements, getCompanyFacts, getSecFilings, getNews, getEarnings, getEstimates, getPeers, getMacroSeries, getMacroDashboard, getFX, search, getRatios, getValuation, getCompanyBundle,
  status, providers: P, dedupe, norm, chain, sym, CONCEPTS };
