// Free-tier Intrinsic value tab feeds: `fund` collection docs and the VALIN live-inputs CSV, for the caller's own holdings.
// Tickers arrive in a POST body (never the URL) and are neither stored nor logged; SEC-derived summaries live only in instance memory.
// No paid fallback is reachable from here.
const { companyFacts, submissions, cikOf } = require("./_edgar");
const { buildFund, epsTtm, sharesOutstanding } = require("./_fundamentals");
const { rateHit } = require("./_lib");
const { cleanSymbols, seriesFor, clientId } = require("./_history");
const { valinCsv, betaOf } = require("./_fundamentals");
const SP = Object.fromEntries(require("./_data/sp500.json").stocks);

const MAX = 12;
const RATE = { windowMs: 10 * 60 * 1000, max: 20 };
const MEM_TTL = 6 * 3600 * 1000, MEM_MAX = 100;
const mem = new Map();

async function limited(req) {
  return !(await rateHit(`rl/val/${clientId(req)}/${Math.floor(Date.now() / RATE.windowMs)}`, RATE.max));
}
function symbolsOf(req) {
  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  return cleanSymbols(body.symbols).slice(0, MAX);
}

// Alpaca asset record: used only to recognise ETFs/funds (SEC has no company filings for them)
async function alpacaAsset(sym) {
  try {
    const r = await fetch(`https://paper-api.alpaca.markets/v2/assets/${encodeURIComponent(sym)}`, { headers: { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID, "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY } });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

// one symbol -> {kind:"company", fund, eps, shares} | {kind:"fund", fund} | {kind:"none", why}
async function summary(sym) {
  const m = mem.get(sym);
  if (m && Date.now() - m.at < MEM_TTL) return m.v;
  let v;
  const cik = cikOf(sym);
  if (cik) {
    const [facts, sub] = await Promise.all([companyFacts(cik), submissions(cik).catch(() => null)]);
    if (!facts) v = { kind: "none", why: "no_filings" };
    else {
      const sector = SP[sym] || null;
      const { doc, why } = buildFund(sym, facts.facts, { sector, sic: sub && sub.sic, sicDescription: sub && sub.sicDescription });
      const e = epsTtm(facts.facts);
      v = doc ? { kind: "company", fund: doc, eps: e ? e.eps : null, shares: sharesOutstanding(facts.facts) } : { kind: "none", why, eps: e ? e.eps : null, shares: sharesOutstanding(facts.facts) };
    }
  } else {
    const a = await alpacaAsset(sym);
    if (a && a.status === "active" && /\b(ETF|ETN|Fund|Trust|Index|Shares)\b/i.test(a.name || "")) {
      v = { kind: "fund", fund: { t: sym, method: "nav", cls: "fund", sector: "Fund", ai: false, cur: "USD", asOf: new Date().toISOString().slice(0, 10), src: { cf: "n/a", bs: "n/a" } } };
    } else v = { kind: "none", why: "not_in_sec_universe" };
  }
  if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value);
  mem.set(sym, { at: Date.now(), v });
  return v;
}

async function many(symbols) {
  const out = {};
  // 3 at a time keeps each function instance well under SEC's request-rate limit
  for (let i = 0; i < symbols.length; i += 3) {
    await Promise.all(symbols.slice(i, i + 3).map(async (s) => { try { out[s] = await summary(s); } catch (e) { out[s] = { kind: "none", why: "fetch_failed" }; } }));
  }
  return out;
}

async function fundCollection(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(200).json([]);
  if (await limited(req)) return res.status(429).end();
  const syms = symbolsOf(req);
  if (!syms.length) return res.status(200).json([]);
  const s = await many(syms);
  return res.status(200).json(syms.filter((t) => s[t] && s[t].fund).map((t) => ({ id: t, data: s[t].fund })));
}

async function valinCsvHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(204).end();
  if (await limited(req)) return res.status(429).end();
  const syms = symbolsOf(req);
  if (!syms.length) return res.status(204).end();
  const [s, px] = await Promise.all([many(syms), seriesFor([...new Set([...syms, "SPY"])])]);
  const rows = [];
  for (const t of syms) {
    const x = s[t], ser = px[t];
    if (!ser || !ser.length) continue;
    const last = ser[ser.length - 1][1];
    const f = x && x.kind === "company";
    const shares = f ? x.shares : null;
    rows.push({ t, px: last, mcap: shares ? last * shares : null, sh: shares, beta: betaOf(ser, px.SPY), eps: f ? x.eps : null, pe: f && x.eps > 0 ? last / x.eps : null, cur: "USD", tt: x && x.kind === "fund" ? "fund" : "stock" });
  }
  const csv = valinCsv(rows, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
  if (!csv) return res.status(204).end();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(csv);
}

module.exports = { fundCollection, valinCsvHandler };
