// POST /api/free/street {symbols:[...]} -> {asOf, street:{SYM:{...}}, news:{SYM:{tone, items:[...]}}, earnings:{SYM:{date, eps}}}
// "What does the Street think": analyst rating mix, price target (mean / range where a provider gives it),
// recent headlines with a plain keyword tone, and the next earnings date. Everything is cached per symbol and
// shared between users, so each symbol costs upstream calls once per window, not once per visitor.
//   price target + rating mix, in order of preference (each is optional and used only if its key is set / budget allows):
//     FMP price-target-consensus (FMP_API_KEY)  ->  Finnhub recommendation trends (FINNHUB_API_KEY)  ->  Alpha Vantage OVERVIEW
//   headlines   Yahoo Finance per-ticker RSS (keyless)       earnings dates  Alpha Vantage EARNINGS_CALENDAR (one cached call)
const { requireTier } = require("../../_auth");
const { av, avCsv, cached, rateHit } = require("../../_lib");
const { cleanSymbols, clientId } = require("../../_history");
const { parseRss, toneOf } = require("../../_news");
const SP500 = new Set(require("../../_data/sp500.json").stocks.map((s) => s[0]));

const H12 = 12 * 36e5, H24 = 24 * 36e5, M30 = 30 * 6e4;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; };
const US = /^[A-Z][A-Z\-]{0,5}$/;      // analyst providers cover US listings only (BRK-B style dashes allowed)
const toAv = (s) => s.replace("-", ".");

async function fmpTarget(sym) {
  if (!process.env.FMP_API_KEY) return null;
  const r = await fetch(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${encodeURIComponent(sym)}&apikey=${process.env.FMP_API_KEY}`);
  if (!r.ok) return null;
  const j = await r.json();
  const x = Array.isArray(j) ? j[0] : j;
  if (!x) return null;
  const mean = num(x.targetConsensus), high = num(x.targetHigh), low = num(x.targetLow), median = num(x.targetMedian);
  return mean || median ? { mean: mean || median, median, high, low } : null;
}

async function finnhubRating(sym) {
  if (!process.env.FINNHUB_API_KEY) return null;
  const r = await fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(sym)}&token=${process.env.FINNHUB_API_KEY}`);
  if (!r.ok) return null;
  const a = await r.json();
  const x = Array.isArray(a) ? a[0] : null;
  return x ? { sb: int(x.strongBuy) || 0, b: int(x.buy) || 0, h: int(x.hold) || 0, s: int(x.sell) || 0, ss: int(x.strongSell) || 0, period: x.period || null } : null;
}

async function avOverview(sym) {
  const j = await av({ function: "OVERVIEW", symbol: toAv(sym) });
  if (!j || !j.Symbol) return null;
  const n = (k) => int(j[k]);
  const rating = [n("AnalystRatingStrongBuy"), n("AnalystRatingBuy"), n("AnalystRatingHold"), n("AnalystRatingSell"), n("AnalystRatingStrongSell")];
  return {
    name: j.Name || null, sector: j.Sector || null, industry: j.Industry || null,
    pt: num(j.AnalystTargetPrice), pe: num(j.PERatio), fpe: num(j.ForwardPE), beta: parseFloat(j.Beta) || null, dy: parseFloat(j.DividendYield) || null,
    hi52: num(j["52WeekHigh"]), lo52: num(j["52WeekLow"]),
    rating: rating.some((x) => x != null) ? { sb: rating[0] || 0, b: rating[1] || 0, h: rating[2] || 0, s: rating[3] || 0, ss: rating[4] || 0 } : null,
  };
}

// One symbol's analyst card. `fresh` = how many Alpha Vantage calls this request may still spend.
async function streetOne(sym, budget) {
  return cached("street/v1/" + sym, H24, async () => {
    const [fmp, fin] = await Promise.all([fmpTarget(sym).catch(() => null), finnhubRating(sym).catch(() => null)]);
    let ov = null;
    if ((!fmp || !fin) && budget.left > 0) { budget.left--; ov = await avOverview(sym).catch(() => null); }
    const rating = fin || (ov && ov.rating) || null;
    const mean = (fmp && fmp.mean) || (ov && ov.pt) || null;
    if (!rating && !mean && !(ov && ov.name)) return null;
    return {
      name: (ov && ov.name) || null, sector: (ov && ov.sector) || null,
      pt: mean ? { mean, median: (fmp && fmp.median) || null, high: (fmp && fmp.high) || null, low: (fmp && fmp.low) || null } : null,
      rating: rating ? { ...rating, n: rating.sb + rating.b + rating.h + rating.s + rating.ss } : null,
      fund: ov ? { pe: ov.pe, fpe: ov.fpe, beta: ov.beta, dy: ov.dy, hi52: ov.hi52, lo52: ov.lo52 } : null,
      src: [fmp && "FMP", fin && "Finnhub", ov && "Alpha Vantage"].filter(Boolean),
      asOf: new Date().toISOString().slice(0, 10),
    };
  });
}

async function headlinesOne(sym) {
  return cached("street/news/" + sym, M30, async () => {
    const r = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`, { headers: { "User-Agent": "portfolio-terminal personal-dashboard" } });
    if (!r.ok) return null;
    const items = parseRss(await r.text(), "Yahoo Finance").slice(0, 8);
    return { tone: toneOf(items), items };
  });
}

// Next earnings dates for S&P 500 names, from one cached Alpha Vantage CSV (symbol,name,reportDate,fiscalDateEnding,estimate,currency)
async function earningsMap() {
  const rows = await cached("street/earncal/v1", H12, async () => {
    const t = await avCsv({ function: "EARNINGS_CALENDAR", horizon: "3month" });
    const out = [];
    for (const l of t.split("\n").slice(1)) {
      const c = l.split(",");
      if (c.length >= 5 && SP500.has(c[0]) && /^\d{4}-\d{2}-\d{2}$/.test(c[2])) out.push([c[0], c[2], parseFloat(c[4]) || null]);
    }
    return out.length ? out : null;
  }).catch(() => null);
  const m = {};
  for (const r of rows || []) if (!m[r[0]] || r[1] < m[r[0]].date) m[r[0]] = { date: r[1], eps: r[2] };
  return m;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const p = await requireTier(req, res, ["free", "paid", "premium"]);
  if (!p) return;
  if (!(await rateHit(`rl/street/${clientId(req)}/${Math.floor(Date.now() / 6e5)}`, 20))) return res.status(429).json({ error: "Too many requests. Wait a few minutes." });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const symbols = cleanSymbols(body.symbols, 25).filter((s) => US.test(s));
  const budget = { left: 3 };
  const street = {}, news = {};
  const [em] = await Promise.all([
    earningsMap(),
    (async () => { for (const s of symbols) { const v = await streetOne(s, budget).catch(() => null); if (v) street[s] = v; } })(),
    Promise.all(symbols.slice(0, 12).map(async (s) => { const v = await headlinesOne(s).catch(() => null); if (v) news[s] = v; })),
  ]);
  const earnings = {};
  for (const s of symbols) if (em[s]) earnings[s] = em[s];
  res.setHeader("Cache-Control", "private, max-age=300");
  return res.status(200).json({ asOf: new Date().toISOString(), street, news, earnings });
};
