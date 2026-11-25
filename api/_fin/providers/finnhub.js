// Finnhub (OPTIONAL: FINNHUB_API_KEY). Quotes, company news, earnings calendar, estimates, recommendations. Free tier 60 calls/min;
// displaying Finnhub data to end users in a product requires checking their plan terms. Activates only when the key is present.
const { request, notConfigured } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "finnhub";
const configured = () => !!process.env.FINNHUB_API_KEY;
const get = (op, path) => { if (!configured()) throw notConfigured(name); return obs.timed(name, op, () => request(name, `https://finnhub.io/api/v1/${path}${path.includes("?") ? "&" : "?"}token=${process.env.FINNHUB_API_KEY}`)); };
const day = (d) => d.toISOString().slice(0, 10);

async function quote(sym) {
  const j = await get("quote", `quote?symbol=${encodeURIComponent(sym)}`); if (!j || !(j.c > 0)) throw new Error("finnhub_empty");
  return S.quote({ symbol: sym, price: j.c, previousClose: j.pc, open: j.o, high: j.h, low: j.l, timestamp: j.t ? new Date(j.t * 1000) : null, freshness: "realtime", source: "Finnhub" });
}
// Finnhub keeps about a year of company news, so a window can be asked for by date: the demo uses this to read the
// headlines that were published around its cut-off instead of showing an empty list.
async function companyNews(sym, range = {}) {
  const days = typeof range === "number" ? range : 14;
  const from = (range && range.from) || day(new Date(Date.now() - days * 864e5));
  const to = (range && range.to) || day(new Date());
  const j = await get("company-news", `company-news?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}`);
  return (j || []).map((n) => S.newsItem({ id: "fh" + n.id, headline: n.headline, publisher: n.source, publishedAt: n.datetime * 1000, url: n.url, tickers: [sym], summary: n.summary, source: "Finnhub" }));
}
async function marketNews(cat = "general") {
  const j = await get("market-news", `news?category=${cat}`);
  return (j || []).map((n) => S.newsItem({ id: "fh" + n.id, headline: n.headline, publisher: n.source, publishedAt: n.datetime * 1000, url: n.url, tickers: (n.related || "").split(",").filter(Boolean), summary: n.summary, source: "Finnhub" }));
}
async function earnings(sym) {
  const j = await get("earnings", `stock/earnings?symbol=${encodeURIComponent(sym)}&limit=12`);
  return (j || []).map((e) => S.earningsEvent({ symbol: sym, date: e.period, epsActual: e.actual, epsEstimate: e.estimate, fiscalPeriod: e.quarter ? `Q${e.quarter} ${e.year}` : null, source: "Finnhub" }));
}
async function earningsCalendar(days = 14) {
  const j = await get("earnings-calendar", `calendar/earnings?from=${day(new Date())}&to=${day(new Date(Date.now() + days * 864e5))}`);
  return ((j && j.earningsCalendar) || []).map((e) => S.earningsEvent({ symbol: e.symbol, date: e.date, epsEstimate: e.epsEstimate, epsActual: e.epsActual, revenueEstimate: e.revenueEstimate, revenueActual: e.revenueActual, time: e.hour, source: "Finnhub" }));
}
async function recommendations(sym) { const j = await get("recommendation", `stock/recommendation?symbol=${encodeURIComponent(sym)}`); return (j && j[0]) || null; }
async function profile(sym) { const j = await get("profile2", `stock/profile2?symbol=${encodeURIComponent(sym)}`); if (!j || !j.name) return null; return S.profile({ symbol: sym, name: j.name, exchange: j.exchange, currency: j.currency, industry: j.finnhubIndustry, website: j.weburl, country: j.country, marketCap: (j.marketCapitalization || 0) * 1e6, sharesOutstanding: (j.shareOutstanding || 0) * 1e6, ipoDate: j.ipo, source: "Finnhub" }); }
async function peers(sym) { const j = await get("peers", `stock/peers?symbol=${encodeURIComponent(sym)}`); return (j || []).filter((x) => x !== sym).slice(0, 10); }
async function search(q) { const j = await get("search", `search?q=${encodeURIComponent(q)}`); return ((j && j.result) || []).slice(0, 8).map((x) => ({ symbol: x.symbol, name: x.description, exchange: null, type: /ETF/i.test(x.type) ? "etf" : "equity", source: "Finnhub" })); }
module.exports = { name, configured, license: "Free tier for development; verify plan terms before showing data to end users.", quote, companyNews, marketNews, earnings, earningsCalendar, recommendations, profile, peers, search };
