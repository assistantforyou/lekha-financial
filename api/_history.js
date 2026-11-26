// Free-tier HISTORY dataset for the user's own holdings: daily + weekly closes, benchmark proxies and the live 10y yield.
// Tickers arrive in a POST body (never in the URL) and are not stored or logged; each request is a fresh Alpaca read.
const crypto = require("crypto");
const { getSeries } = require("./_prices");
const { cached, rateHit } = require("./_lib");
const { fredSeries } = require("./_fred");
const { historyCsv } = require("./_mappers");
const { isIntl, intlSeries } = require("./_intl");

const SYMBOL = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;
const MAX_SYMBOLS = 25;
const RATE = { windowMs: 10 * 60 * 1000, max: 12 };   // per client, per 10 minutes
const MEM_TTL = 10 * 60 * 1000, MEM_MAX = 200;            // per-instance symbol cache
const BENCH = { "INDEXSP:.INX": "SPY", "INDEXNASDAQ:.IXIC": "QQQ" }; // price-return ETF proxies for the page's two benchmark lines

// cap: how many symbols to keep (default MAX_SYMBOLS — also the per-request ceiling everywhere)
function cleanSymbols(list, cap = MAX_SYMBOLS) {
  const lim = Math.max(1, Math.min(cap | 0 || MAX_SYMBOLS, MAX_SYMBOLS));
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const t = String(s || "").trim().toUpperCase();
    if (t !== "CASH" && SYMBOL.test(t) && !out.includes(t)) out.push(t);
    if (out.length >= lim) break;
  }
  return out;
}

async function tnx() {
  try {
    const rows = await cached("free/tnx", 3 * 36e5, async () => {
      const r = await fredSeries("DGS10", new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10));
      return r.length ? r.slice(-3) : null;
    });
    return rows && rows.length ? rows[rows.length - 1][1] : null;
  } catch (e) { return null; }
}

// per-client limiter: hashed IP + 10-minute bucket, counted atomically in the database
function clientId(req) {
  const ip = String((req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0]).trim() || "unknown";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// Demo quota identity: a random id the browser keeps (not a cookie, not the IP), so one free question
// belongs to one browser instead of everyone behind the same NAT. The IP remains the fallback.
const DEMO_ID = /^[A-Za-z0-9_-]{16,64}$/;
function demoId(req, body) {
  const raw = String((req && req.headers && req.headers["x-demo-id"]) || (body && body.demoId) || "").trim();
  const id = DEMO_ID.test(raw) ? raw : String((req && req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) || "").split(",")[0].trim() || "unknown";
  return crypto.createHash("sha256").update("demo:" + id).digest("hex").slice(0, 16);
}
async function rateLimited(req) {
  const key = `rl/hist/${clientId(req)}/${Math.floor(Date.now() / RATE.windowMs)}`;
  return !(await rateHit(key, RATE.max));
}

const mem = new Map(); // symbol -> {at, rows}
async function seriesFor(symbols) {
  const now = Date.now(), data = {}, need = [];
  for (const s of symbols) { const m = mem.get(s); if (m && now - m.at < MEM_TTL) data[s] = m.rows; else need.push(s); }
  if (need.length) {
    const us = need.filter((s) => !isIntl(s));
    const [usData, intl] = await Promise.all([us.length ? getSeries(us, 2000, { fallback: false }).then((x) => x.data) : {}, intlSeries(need.filter(isIntl))]);
    const r = { ...usData, ...intl };
    for (const s of need) if (r[s] && r[s].length) { data[s] = r[s]; if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value); mem.set(s, { at: now, rows: r[s] }); }
  }
  return data;
}

// Keep only the last `days` calendar days of a [date, close] series (tier entitlement, server-side).
function withinDays(rows, days) {
  if (!days || !Array.isArray(rows) || !rows.length) return rows;
  const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  let i = 0;
  while (i < rows.length && rows[i][0] < cut) i++;
  return i ? rows.slice(i) : rows;
}

async function history(req, res, opts = {}) {
  if (await rateLimited(req)) { res.setHeader("Cache-Control", "no-store"); return res.status(429).end(); }
  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const symbols = cleanSymbols(body.symbols);
  const fetchList = [...new Set([...symbols, ...Object.values(BENCH)])];
  const [data, y] = await Promise.all([seriesFor(fetchList), tnx()]);
  const labelled = {};
  for (const s of symbols) if (data[s] && data[s].length) labelled[s] = withinDays(data[s], opts.days);
  for (const [label, etf] of Object.entries(BENCH)) if (data[etf] && data[etf].length) labelled[label] = withinDays(data[etf], opts.days);
  const csv = historyCsv(labelled, y);
  if (!csv) return res.status(204).end();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(csv);
}

module.exports = { history, cleanSymbols, MAX_SYMBOLS, seriesFor, rateLimited, clientId, demoId };
