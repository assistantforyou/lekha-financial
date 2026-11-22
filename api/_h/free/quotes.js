// POST /api/free/quotes {symbols:[...]} -> {asOf, session, q:{SYM:{px, prev, t, src}}}
// Live-ish prices for the holdings list. Signed-in only (same entitlement as the history endpoint).
// Fan-in design: every browser asks this one endpoint; each instance keeps a few seconds of per-symbol
// cache, so N users watching the same ticker cost one upstream read per window, not N. Browsers on the
// same device additionally share one poller through BroadcastChannel (see public/core/live.js).
//   US symbols      Alpaca IEX snapshots (real-time IEX trades; free feed, batched)
//   Non-US symbols  Yahoo public chart meta (unofficial, personal-use; same dependency as _intl.js)
// Tickers travel in the POST body, never in the URL, and are not stored or logged.
const crypto = require("crypto");
const { userFrom, bearer } = require("../../_auth");
const { cleanSymbols, clientId } = require("../../_history");
const { isIntl } = require("../../_intl");

const US_TTL = 4000, INTL_TTL = 45000, MEM_MAX = 400;
const mem = new Map();                       // symbol -> {at, q}
const authMem = new Map();                   // sha256(token) -> expiry ms (verified signed-in user)
const buckets = new Map();                   // clientId -> {n, reset}
const MAX_PER_MIN = 60;

// US cash-session label from New York wall-clock time (holidays are not modelled; the browser also
// checks the age of the newest trade before it claims a market is "open").
function sessionNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return "closed";
  const m = (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10);
  if (m >= 570 && m < 960) return "open";
  if (m >= 240 && m < 570) return "pre";
  if (m >= 960 && m < 1200) return "post";
  return "closed";
}

async function verified(req) {
  if (req.__demoPublic === true) return true;
  const tok = bearer(req);
  if (!tok) return false;
  const k = crypto.createHash("sha256").update(tok).digest("hex");
  const hit = authMem.get(k);
  if (hit && hit > Date.now()) return true;
  const u = await userFrom(req);
  if (!u) return false;
  if (authMem.size > 500) authMem.clear();
  authMem.set(k, Date.now() + 60000);
  return true;
}

function limited(req) {
  const id = clientId(req), now = Date.now();
  let b = buckets.get(id);
  if (!b || b.reset < now) { b = { n: 0, reset: now + 60000 }; buckets.set(id, b); if (buckets.size > 2000) buckets.clear(); }
  return ++b.n > MAX_PER_MIN;
}

async function alpacaSnapshots(symbols) {
  const H = { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID, "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY };
  const r = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(","))}&feed=iex`, { headers: H });
  if (!r.ok) throw new Error("alpaca_" + r.status);
  const j = await r.json();
  const snaps = j && j.snapshots ? j.snapshots : j;
  const out = {};
  for (const [s, v] of Object.entries(snaps || {})) {
    if (!v) continue;
    const px = (v.latestTrade && v.latestTrade.p) || (v.dailyBar && v.dailyBar.c) || null;
    const prev = (v.prevDailyBar && v.prevDailyBar.c) || null;
    if (!(px > 0)) continue;
    out[s] = { px, prev: prev > 0 ? prev : null, t: (v.latestTrade && v.latestTrade.t) || (v.dailyBar && v.dailyBar.t) || null, src: "iex" };
  }
  return out;
}

async function yahooQuote(sym) {
  if (!require("../../_licensing").allowed("yahoo")) return null;
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1m`, { headers: { "User-Agent": "Mozilla/5.0 (portfolio-terminal)" } });
  if (!r.ok) throw new Error("yahoo_" + r.status);
  const j = await r.json();
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) return null;
  return { px: m.regularMarketPrice, prev: m.chartPreviousClose > 0 ? m.chartPreviousClose : null, t: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null, src: "yahoo" };
}

async function quotes(symbols) {
  const now = Date.now(), out = {}, needUs = [], needIntl = [];
  for (const s of symbols) {
    const m = mem.get(s);
    const ttl = isIntl(s) ? INTL_TTL : US_TTL;
    if (m && now - m.at < ttl) { if (m.q && (m.q.src !== "yahoo" || require("../../_licensing").allowed("yahoo"))) out[s] = m.q; }
    else (isIntl(s) ? needIntl : needUs).push(s);
  }
  const put = (s, q) => { if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value); mem.set(s, { at: Date.now(), q }); if (q) out[s] = q; };
  await Promise.all([
    needUs.length ? alpacaSnapshots(needUs).then((r) => needUs.forEach((s) => put(s, r[s] || null))).catch(() => {}) : null,
    ...needIntl.slice(0, 8).map((s) => yahooQuote(s).then((q) => put(s, q)).catch(() => {})),
  ]);
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!(await verified(req))) return res.status(401).json({ error: "This needs a signed-in account." });
  if (limited(req)) return res.status(429).json({ error: "Too many price requests. Slow down." });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const symbols = cleanSymbols(body.symbols, 25);
  const session = sessionNow();
  if (!symbols.length) return res.status(200).json({ asOf: new Date().toISOString(), session, q: {} });
  const q = await quotes(symbols).catch(() => ({}));
  return res.status(200).json({ asOf: new Date().toISOString(), session, q });
};
module.exports.sessionNow = sessionNow;
