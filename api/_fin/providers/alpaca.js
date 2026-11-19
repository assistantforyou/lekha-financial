// Alpaca market data (free IEX feed): real-time IEX trades and daily bars for US symbols. Not the consolidated tape: volume is IEX-only.
// Terms: personal/dev use on the free plan; redistribution to third parties needs Alpaca's data agreement.
const { request, notConfigured } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "alpaca";
const configured = () => !!(process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY);
const H = () => ({ "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID, "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY });

async function quotes(symbols) {
  if (!configured()) throw notConfigured(name);
  return obs.timed(name, "snapshots", async () => {
    const j = await request(name, `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(","))}&feed=iex`, { headers: H() });
    const snaps = (j && j.snapshots) || j || {}, out = {};
    for (const [s, v] of Object.entries(snaps)) {
      if (!v) continue; const px = (v.latestTrade && v.latestTrade.p) || (v.dailyBar && v.dailyBar.c); if (!(px > 0)) continue;
      const ts = (v.latestTrade && v.latestTrade.t) || (v.dailyBar && v.dailyBar.t), age = ts ? Math.max(0, (Date.now() - Date.parse(ts)) / 1000) : null;
      out[s] = S.quote({ symbol: s, price: px, previousClose: v.prevDailyBar && v.prevDailyBar.c, open: v.dailyBar && v.dailyBar.o, high: v.dailyBar && v.dailyBar.h, low: v.dailyBar && v.dailyBar.l,
        volume: v.dailyBar && v.dailyBar.v, timestamp: ts, delay: age != null ? Math.round(age) : null, freshness: age != null && age < 900 ? "realtime" : "historical", source: "Alpaca IEX", exchange: "IEX" });
    }
    return out;
  });
}
async function history(symbol, { days = 365 } = {}) {
  if (!configured()) throw notConfigured(name);
  return obs.timed(name, "bars", async () => {
    const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), rows = []; let token = null;
    for (let i = 0; i < 6; i++) {
      const qs = new URLSearchParams({ timeframe: "1Day", start, limit: "10000", feed: "iex", adjustment: "split" }); if (token) qs.set("page_token", token);
      const j = await request(name, `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?${qs}`, { headers: H() });
      for (const b of (j && j.bars) || []) rows.push(S.bar(b.t.slice(0, 10), b.o, b.h, b.l, b.c, b.v));
      token = j && j.next_page_token; if (!token) break;
    }
    if (!rows.length) throw new Error("alpaca_empty");
    return rows;
  });
}
module.exports = { name, configured, license: "Free IEX feed for personal/dev use; redistribution requires an Alpaca data agreement.", quotes, history };
