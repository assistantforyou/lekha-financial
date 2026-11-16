// Non-US listings (Hong Kong .HK, Thailand .BK, ...) and long US history for all-time highs.
// Yahoo's public chart endpoint (unofficial, personal-use terms) is used only for non-US symbols; FX comes from
// Frankfurter (ECB reference rates, keyless). Everything is cached in pt_av_cache.
const { cached, cacheGetMany } = require("./_lib");
const { twelveSeries } = require("./_prices");

const INTL = /\.(HK|BK|T|L|TO|AX|SI|KS|KQ|SS|SZ|NS|BO|DE|PA|AS|SW|MI|MC|TW)$/;
const isIntl = (s) => INTL.test(String(s || ""));

async function yahooSeries(sym, range = "10y") {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0 (portfolio-terminal)" },
  });
  if (!r.ok) throw new Error("yahoo_" + r.status);
  const j = await r.json();
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !Array.isArray(res.timestamp)) return [];
  const close = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
  const out = [];
  res.timestamp.forEach((t, i) => { const c = close[i]; if (c > 0) out.push([new Date(t * 1000).toISOString().slice(0, 10), Math.round(c * 10000) / 10000]); });
  return out;
}

// {SYM: rows} for non-US symbols, cached 10 min per symbol
async function intlSeries(symbols) {
  const out = {};
  await Promise.all(symbols.filter(isIntl).slice(0, 10).map(async (s) => {
    try { const rows = await cached("free/intl/" + s, 10 * 6e4, async () => { const r = await yahooSeries(s, "10y"); return r.length ? r.slice(-2600) : null; }); if (rows) out[s] = rows; }
    catch (e) { /* skip */ }
  }));
  return out;
}

const athOf = (rows) => { let best = null; for (const r of rows || []) if (!best || r[1] > best[1]) best = r; return best ? { v: best[1], d: best[0], from: rows[0][0] } : null; };

// All-time highs (by daily close). US: Twelve Data 5000 bars (~20 years); non-US: Yahoo 10 years. Cached 7 days.
// At most `budget` uncached US symbols per call so the free 8-credit/minute limit is respected.
async function allTimeHighs(symbols, budget = 6) {
  const keys = symbols.map((s) => "free/ath/" + s);
  const have = await cacheGetMany(keys);
  const out = {}, need = [];
  for (const s of symbols) { const h = have["free/ath/" + s]; if (h && Date.now() - h.fetchedAt < 7 * 864e5) out[s] = h.payload; else need.push(s); }
  const us = need.filter((s) => !isIntl(s)).slice(0, budget), intl = need.filter(isIntl).slice(0, 6);
  await Promise.all([
    ...us.map((s) => cached("free/ath/" + s, 7 * 864e5, async () => athOf((await twelveSeries([s], 5000))[s])).then((v) => { if (v) out[s] = v; }).catch(() => {})),
    ...intl.map((s) => cached("free/ath/" + s, 7 * 864e5, async () => athOf(await yahooSeries(s, "10y"))).then((v) => { if (v) out[s] = v; }).catch(() => {})),
  ]);
  return out;
}

async function fxRates() {
  return cached("free/fx", 6 * 36e5, async () => {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB,HKD");
    if (!r.ok) throw new Error("fx_" + r.status);
    const j = await r.json();
    if (!(j.rates && j.rates.THB > 0 && j.rates.HKD > 0)) return null;
    return { usdthb: j.rates.THB, hkdusd: Math.round((1 / j.rates.HKD) * 1e6) / 1e6, asOf: j.date, source: "ECB via Frankfurter" };
  });
}

module.exports = { isIntl, yahooSeries, intlSeries, allTimeHighs, athOf, fxRates };
