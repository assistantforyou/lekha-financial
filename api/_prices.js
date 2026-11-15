// Free price providers: Alpaca (primary, IEX feed, multi-symbol bars) with Twelve Data as fallback.
// Both return {SYMBOL: [[YYYY-MM-DD, close], ...]} ascending. Server-only: keys come from env.

async function alpacaBars(symbols, startISO) {
  const H = { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID, "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY };
  const out = {};
  let token = null;
  for (let page = 0; page < 30; page++) {
    const qs = new URLSearchParams({ symbols: symbols.join(","), timeframe: "1Day", start: startISO, limit: "10000", feed: "iex", adjustment: "split" });
    if (token) qs.set("page_token", token);
    const r = await fetch(`https://data.alpaca.markets/v2/stocks/bars?${qs}`, { headers: H });
    if (!r.ok) throw new Error("alpaca_" + r.status);
    const j = await r.json();
    for (const [sym, bars] of Object.entries(j.bars || {})) {
      const a = out[sym] || (out[sym] = []);
      for (const b of bars) if (b && b.c > 0 && typeof b.t === "string") a.push([b.t.slice(0, 10), b.c]);
    }
    token = j.next_page_token;
    if (!token) break;
  }
  return out;
}

async function twelveSeries(symbols, outputsize) {
  const qs = new URLSearchParams({ symbol: symbols.join(","), interval: "1day", outputsize: String(outputsize), apikey: process.env.TWELVEDATA_API_KEY });
  const r = await fetch(`https://api.twelvedata.com/time_series?${qs}`);
  if (!r.ok) throw new Error("twelvedata_" + r.status);
  const j = await r.json();
  const one = symbols.length === 1 ? { [symbols[0]]: j } : j;
  const out = {};
  for (const [sym, v] of Object.entries(one)) {
    if (!v || !Array.isArray(v.values)) continue;
    out[sym] = v.values.map((x) => [x.datetime, parseFloat(x.close)]).filter((x) => x[1] > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  return out;
}

const daysAgoISO = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

// Alpaca first; Twelve Data (credit per symbol) only if Alpaca fails or returns nothing.
// opts.fallback === false disables Twelve Data (used by endpoints reachable by anyone, so they cannot drain its daily credits).
async function getSeries(symbols, calendarDays, opts = {}) {
  try {
    const r = await alpacaBars(symbols, daysAgoISO(calendarDays));
    if (Object.keys(r).length) return { data: r, via: "alpaca" };
  } catch (e) { /* fall back */ }
  if (opts.fallback === false) return { data: {}, via: "none" };
  const bars = Math.round(calendarDays * 0.69);
  return { data: await twelveSeries(symbols, bars), via: "twelvedata" };
}

module.exports = { alpacaBars, twelveSeries, getSeries };
