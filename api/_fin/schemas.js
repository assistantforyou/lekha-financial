// Internal financial schemas. The UI and the AI agent only ever see these shapes, never a provider's own JSON.
//
// UNIT POLICY (nothing is ever mixed silently):
//   money in statements/market cap/EV ......... plain currency units (USD, not thousands or millions), unit "USD" (or the ISO code)
//   per-share values (EPS, price) .............. unit "USD/share"
//   ratios / multiples (P/E, D/E, current) ..... plain numbers, unit "x"
//   rates / growth / margins / yields .......... FRACTIONS (0.18 = 18 %), unit "fraction"; the UI formats them as percentages
//   index levels, rates published as % ......... macro series keep the publisher's unit, stated in `unit` ("percent", "index", ...)
// Every datum carries a `meta` block: source, asOf (when the provider says it is true), fetchedAt, kind, freshness, and optionally
// period / currency / unit / filingDate. `kind` is "reported" (taken as published) or "calculated" (our deterministic code).

const num = (v) => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const iso = (t) => { const d = t instanceof Date ? t : new Date(t); return Number.isNaN(+d) ? null : d.toISOString(); };

function meta({ source, asOf = null, kind = "reported", freshness = "delayed", currency = "USD", unit = null, period = null, filingDate = null, delaySec = null, note = null } = {}) {
  return { source, asOf: asOf ? iso(asOf) : null, fetchedAt: new Date().toISOString(), kind, freshness, currency, unit, period, filingDate, delaySec, note };
}

// Quote: freshness is "realtime" (exchange/IEX trade seconds old), "delayed" (15 min+) or "historical" (last close).
function quote(o) {
  const price = num(o.price), prev = num(o.previousClose);
  const change = o.change != null ? num(o.change) : price != null && prev != null ? price - prev : null;
  const changePercent = o.changePercent != null ? num(o.changePercent) : change != null && prev ? change / prev : null; // fraction
  return { symbol: String(o.symbol || "").toUpperCase(), name: o.name || null, price, change, changePercent, previousClose: prev, open: num(o.open), high: num(o.high), low: num(o.low),
    volume: num(o.volume), marketCap: num(o.marketCap), currency: o.currency || "USD", exchange: o.exchange || null, timestamp: iso(o.timestamp), delay: o.delay != null ? o.delay : null,
    source: o.source, meta: meta({ source: o.source, asOf: o.timestamp, freshness: o.freshness || "delayed", currency: o.currency || "USD", unit: "USD/share", delaySec: o.delay != null ? o.delay : null }) };
}

// One reporting period. Money fields are in plain currency units.
const STMT_FIELDS = ["revenue", "costOfRevenue", "grossProfit", "operatingIncome", "ebitda", "netIncome", "eps", "dilutedShares", "interestExpense", "incomeTax", "rAndD", "sgAndA",
  "cash", "shortTermInvestments", "totalCurrentAssets", "totalAssets", "totalCurrentLiabilities", "totalLiabilities", "totalDebt", "shareholdersEquity", "inventory", "receivables",
  "operatingCashFlow", "capex", "freeCashFlow", "dividendsPaid", "buybacks"];
function statement(o) {
  const out = { company: { symbol: String(o.symbol || "").toUpperCase(), name: o.name || null, cik: o.cik || null }, period: o.period, periodType: o.periodType || "annual",
    fiscalPeriod: o.fiscalPeriod || null, fiscalYear: o.fiscalYear || null, periodStart: o.periodStart || null, periodEnd: o.periodEnd || o.period, filingDate: o.filingDate || null,
    form: o.form || null, accession: o.accession || null, currency: o.currency || "USD", unit: "USD", source: o.source };
  for (const k of STMT_FIELDS) out[k] = num(o[k]);
  if (out.grossProfit == null && out.revenue != null && out.costOfRevenue != null) out.grossProfit = out.revenue - out.costOfRevenue;
  if (out.freeCashFlow == null && out.operatingCashFlow != null && out.capex != null) out.freeCashFlow = out.operatingCashFlow - Math.abs(out.capex);
  out.meta = meta({ source: o.source, asOf: o.periodEnd || o.period, kind: "reported", freshness: "historical", currency: out.currency, unit: "USD", period: `${out.fiscalYear || ""}${out.fiscalPeriod ? " " + out.fiscalPeriod : ""}`.trim() || o.period, filingDate: o.filingDate || null });
  return out;
}

function profile(o) {
  return { symbol: String(o.symbol || "").toUpperCase(), name: o.name || null, exchange: o.exchange || null, currency: o.currency || "USD", sector: o.sector || null, industry: o.industry || null,
    description: o.description || null, website: o.website || null, country: o.country || null, employees: num(o.employees), cik: o.cik || null, marketCap: num(o.marketCap), sharesOutstanding: num(o.sharesOutstanding),
    ipoDate: o.ipoDate || null, assetType: o.assetType || "equity", source: o.source, meta: meta({ source: o.source, asOf: new Date(), freshness: "delayed" }) };
}

function filing(o) {
  return { symbol: o.symbol ? String(o.symbol).toUpperCase() : null, cik: o.cik || null, form: o.form, filingDate: o.filingDate, reportDate: o.reportDate || null, accession: o.accession,
    description: o.description || null, url: o.url, source: o.source, meta: meta({ source: o.source, asOf: o.filingDate, freshness: "historical", filingDate: o.filingDate }) };
}

function newsItem(o) {
  return { id: o.id, headline: String(o.headline || "").trim(), publisher: o.publisher || null, publishedAt: iso(o.publishedAt), url: o.url, tickers: (o.tickers || []).map((t) => String(t).toUpperCase()),
    summary: o.summary ? String(o.summary).replace(/\s+/g, " ").trim().slice(0, 400) : null, category: o.category || "general", source: o.source, meta: meta({ source: o.source, asOf: o.publishedAt, freshness: "realtime" }) };
}

function earningsEvent(o) {
  return { symbol: String(o.symbol || "").toUpperCase(), date: o.date, fiscalPeriod: o.fiscalPeriod || null, epsActual: num(o.epsActual), epsEstimate: num(o.epsEstimate),
    surprise: num(o.epsActual) != null && num(o.epsEstimate) ? (num(o.epsActual) - num(o.epsEstimate)) / Math.abs(num(o.epsEstimate)) : null, revenueActual: num(o.revenueActual), revenueEstimate: num(o.revenueEstimate),
    time: o.time || null, source: o.source, meta: meta({ source: o.source, asOf: o.date, freshness: o.epsActual != null ? "historical" : "delayed", unit: "USD/share" }) };
}

function macroSeries(o) {
  const points = (o.points || []).filter((p) => p && p[1] != null);
  const last = points[points.length - 1] || null, prev = points[points.length - 2] || null;
  return { id: o.id, name: o.name, unit: o.unit, frequency: o.frequency || null, group: o.group || null, transform: o.transform || "level", points, latest: last ? { date: last[0], value: last[1] } : null,
    previous: prev ? { date: prev[0], value: prev[1] } : null, source: o.source, meta: meta({ source: o.source, asOf: last && last[0], freshness: "historical", currency: null, unit: o.unit }) };
}

function bar(date, open, high, low, close, volume) { return [date, num(open), num(high), num(low), num(close), num(volume)]; }

module.exports = { num, iso, meta, quote, statement, profile, filing, newsItem, earningsEvent, macroSeries, bar, STMT_FIELDS };
