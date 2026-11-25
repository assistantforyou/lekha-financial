// Alpaca market data (free IEX feed): real-time IEX trades and daily bars for US symbols. Not the consolidated tape: volume is IEX-only.
// Terms: personal/dev use on the free plan; redistribution to third parties needs Alpaca's data agreement.
const { request, notConfigured } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "alpaca";
const configured = () => !!(process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY);
const H = () => ({ "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID, "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY });

// Once the last IEX print is more than 15 minutes old, report the regular-session bar close instead of that print.
// Extended-hours prints (after 16:00 ET) otherwise stood in for the close on evenings and weekends: on 2026-11-20 the
// stale last prints were 0.25% to 2.9% away from the official closes, and valuation, P/E and DCF were computed from them.
function pickPrice(v, now = Date.now()) {
  const tr = v.latestTrade, bar = v.dailyBar, tt = tr && Date.parse(tr.t), bt = bar && Date.parse(bar.t);
  const stale = !(tt > 0) || now - tt >= 900e3, notOlder = bt > 0 && (!(tt > 0) || tt - bt < 864e5); // bar is from the print's session or later
  if (bar && bar.c > 0 && (!(tr && tr.p > 0) || (stale && notOlder))) return { px: bar.c, ts: bar.t, close: true };
  return { px: tr && tr.p, ts: tr && tr.t, close: false };
}
async function quotes(symbols) {
  if (!configured()) throw notConfigured(name);
  return obs.timed(name, "snapshots", async () => {
    const j = await request(name, `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(","))}&feed=iex`, { headers: H() });
    const snaps = (j && j.snapshots) || j || {}, out = {};
    for (const [s, v] of Object.entries(snaps)) {
      if (!v) continue; const { px, ts, close } = pickPrice(v); if (!(px > 0)) continue;
      const age = ts ? Math.max(0, (Date.now() - Date.parse(ts)) / 1000) : null;
      out[s] = S.quote({ symbol: s, price: px, previousClose: v.prevDailyBar && v.prevDailyBar.c, open: v.dailyBar && v.dailyBar.o, high: v.dailyBar && v.dailyBar.h, low: v.dailyBar && v.dailyBar.l,
        volume: v.dailyBar && v.dailyBar.v, timestamp: ts, delay: age != null ? Math.round(age) : null, freshness: !close && age != null && age < 900 ? "realtime" : "historical",
        source: close ? "Alpaca IEX (session close)" : "Alpaca IEX", exchange: "IEX" });
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
// Intraday IEX bars. The regular session is 13:30-21:00 UTC in every season, so the UTC date identifies the session.
async function intraday(symbol, { days = 1, asOf = null } = {}) {
  if (!configured()) throw notConfigured(name);
  const one = days <= 1, tf = one ? "5Min" : "15Min", sessions = one ? 1 : 5;
  return obs.timed(name, "intraday", async () => {
    // asOf (a pinned demo date, YYYY-MM-DD): the window ends at the end of that day, so the latest session is the one on or before it
    const endMs = asOf ? Date.parse(asOf + "T00:00:00Z") + 864e5 : Date.now(), start = new Date(endMs - (one ? 6 : 10) * 864e5).toISOString(), rows = []; let token = null;
    for (let i = 0; i < 5; i++) {
      const qs = new URLSearchParams({ timeframe: tf, start, limit: "10000", feed: "iex", adjustment: "split" }); if (asOf) qs.set("end", new Date(endMs).toISOString()); if (token) qs.set("page_token", token);
      const j = await request(name, `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?${qs}`, { headers: H() });
      for (const b of (j && j.bars) || []) rows.push([b.t, b.o, b.h, b.l, b.c, b.v]);
      token = j && j.next_page_token; if (!token) break;
    }
    const dates = [...new Set(rows.map((r) => r[0].slice(0, 10)))].sort().slice(-sessions), keep = rows.filter((r) => dates.includes(r[0].slice(0, 10)));
    if (!keep.length) throw new Error("alpaca_empty");
    return keep.map((r) => S.bar(r[0].slice(0, 16) + ":00Z", r[1], r[2], r[3], r[4], r[5]));
  });
}
module.exports = { pickPrice, name, configured, license: "Free IEX feed for personal/dev use; redistribution requires an Alpaca data agreement.", quotes, history, intraday };
