// Yahoo Finance public endpoints: UNOFFICIAL and personal-use only. Kept as a keyless fallback (non-US prices, search, per-ticker headlines).
// Do not rely on it for a commercial/redistributed product; diagnostics flags it so it can be replaced (FMP/Finnhub/Polygon) before launch.
const { request, BROWSER_UA } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "yahoo";
const H = { "User-Agent": BROWSER_UA, Accept: "application/json" };

async function chart(sym, range, interval) { return request(name, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`, { headers: H }); }
async function quote(sym) {
  return obs.timed(name, "chart", async () => {
    const j = await chart(sym, "1d", "1m"), m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
    if (!m || !(m.regularMarketPrice > 0)) throw new Error("yahoo_empty");
    const ts = m.regularMarketTime ? new Date(m.regularMarketTime * 1000) : null, age = ts ? (Date.now() - +ts) / 1000 : null;
    return S.quote({ symbol: sym, name: m.longName || m.shortName, price: m.regularMarketPrice, previousClose: m.chartPreviousClose, high: m.regularMarketDayHigh, low: m.regularMarketDayLow, volume: m.regularMarketVolume,
      currency: m.currency, exchange: m.fullExchangeName || m.exchangeName, timestamp: ts, delay: age != null ? Math.round(age) : null, freshness: age != null && age < 1200 ? "realtime" : "delayed", source: "Yahoo Finance" });
  });
}
async function history(sym, { days = 365 } = {}) {
  const range = days <= 31 ? "1mo" : days <= 95 ? "3mo" : days <= 190 ? "6mo" : days <= 400 ? "1y" : days <= 800 ? "2y" : days <= 1900 ? "5y" : "10y";
  return obs.timed(name, "history", async () => {
    const j = await chart(sym, range, "1d"), r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !Array.isArray(r.timestamp)) throw new Error("yahoo_empty");
    const q = r.indicators.quote[0], out = [];
    r.timestamp.forEach((t, i) => { if (q.close[i] > 0) out.push(S.bar(new Date(t * 1000).toISOString().slice(0, 10), q.open[i], q.high[i], q.low[i], q.close[i], q.volume[i])); });
    return out;
  });
}
// Intraday bars: 5-minute for the latest session (days<=1) or 15-minute for the latest 5 sessions. Timestamps are full UTC ISO strings.
async function intraday(sym, { days = 1, asOf = null } = {}) {
  const one = days <= 1;
  if (asOf && Date.now() - Date.parse(asOf + "T00:00:00Z") > 58 * 864e5) throw new Error("yahoo_intraday_window");   // Yahoo only keeps about 60 days of 5/15-minute bars
  return obs.timed(name, "intraday", async () => {
    const j = asOf ? await request(name, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${Math.floor((Date.parse(asOf + "T00:00:00Z") - (one ? 4 : 9) * 864e5) / 1000)}&period2=${Math.floor((Date.parse(asOf + "T00:00:00Z") + 864e5) / 1000)}&interval=${one ? "5m" : "15m"}`, { headers: H }) : await chart(sym, one ? "1d" : "5d", one ? "5m" : "15m"), r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !Array.isArray(r.timestamp)) throw new Error("yahoo_empty");
    const q = r.indicators.quote[0], out = [];
    r.timestamp.forEach((t, i) => { if (q.close[i] > 0) out.push(S.bar(new Date(t * 1000).toISOString().slice(0, 16) + ":00Z", q.open[i], q.high[i], q.low[i], q.close[i], q.volume[i])); });
    if (!out.length) throw new Error("yahoo_empty");
    if (asOf) { const ds = [...new Set(out.map((b) => b[0].slice(0, 10)))].sort().slice(-(one ? 1 : 5)); return out.filter((b) => ds.includes(b[0].slice(0, 10))); }
    return out;
  });
}
const KIND = { EQUITY: "equity", ETF: "etf", INDEX: "index", CRYPTOCURRENCY: "crypto", MUTUALFUND: "fund", CURRENCY: "fx", FUTURE: "future" };
async function search(q, limit = 8) {
  return obs.timed(name, "search", async () => {
    const j = await request(name, `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0&listsCount=0`, { headers: H, timeoutMs: 6000 });
    return ((j && j.quotes) || []).filter((x) => x.symbol && KIND[x.quoteType]).map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || x.exchange || null, type: KIND[x.quoteType], source: "Yahoo Finance" }));
  });
}
module.exports = { name, configured: () => true, license: "Unofficial, personal-use. Not licensed for commercial redistribution.", quote, history, intraday, search };
