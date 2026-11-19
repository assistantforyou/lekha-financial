// /api/data/<route>: thin HTTP layer over FinancialDataService. No provider schema or key ever crosses this boundary.
// GET routes are public (demo visitors use them too) and rate limited per client; the AI agent and diagnostics have their own guards.
const svc = require("../../_fin/service");
const calc = require("../../_fin/calc");
const obs = require("../../_fin/obs");
const agent = require("../../_fin/agent");
const { clientId } = require("../../_history");

const buckets = new Map();
function limited(req, max) { const id = clientId(req), now = Date.now(); let b = buckets.get(id); if (!b || b.reset < now) { b = { n: 0, reset: now + 60000 }; buckets.set(id, b); if (buckets.size > 3000) buckets.clear(); } return ++b.n > max; }
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const list = (v) => (v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : []);
const SWR = "public, max-age=30, s-maxage=120, stale-while-revalidate=600";

function ok(res, r, cache) { res.setHeader("Cache-Control", cache || SWR); return res.status(200).json({ data: r.data, meta: r.meta }); }
function fail(res, e) {
  const status = e && e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error: status === 400 ? "Invalid request." : status === 404 ? "Not found." : "No data provider could serve this request right now.", code: (e && e.message) || "error", attempts: e && e.attempts || undefined });
}

const GET = {
  search: (q) => svc.search(q.q || q.query || "", { limit: num(q.limit, 12) }),
  quote: (q) => svc.getQuote(q.symbol), history: (q) => svc.getHistoricalPrices(q.symbol, { days: num(q.days, 365) }),
  company: async (q) => ({ data: await svc.getCompanyBundle(q.symbol), meta: { source: "bundle" } }),
  profile: (q) => svc.getCompanyProfile(q.symbol), statements: (q) => svc.getFinancialStatements(q.symbol, { type: q.type }), facts: (q) => svc.getCompanyFacts(q.symbol),
  filings: (q) => svc.getSecFilings(q.symbol, { forms: list(q.forms), limit: num(q.limit, 40) }), news: (q) => svc.getNews({ symbol: q.symbol || null, category: q.category || null, query: q.q || null, limit: num(q.limit, 25) }),
  earnings: (q) => svc.getEarnings(q.symbol), estimates: (q) => svc.getEstimates(q.symbol), peers: (q) => svc.getPeers(q.symbol), ratios: (q) => svc.getRatios(q.symbol),
  valuation: (q) => svc.getValuation(q.symbol, { growth: q.growth != null ? num(q.growth) : undefined, discount: q.discount != null ? num(q.discount) : undefined, terminalGrowth: q.terminalGrowth != null ? num(q.terminalGrowth) : undefined, years: q.years ? num(q.years) : undefined }),
  macro: (q) => (q.id ? svc.getMacroSeries(q.id, { years: num(q.years, 10) }) : svc.getMacroDashboard()), fx: (q) => svc.getFX(q.base || "USD"),
};
const NOSTORE = new Set(["quote"]);

function make(route) {
  if (GET[route]) return async (req, res) => {
    if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
    if (limited(req, 120)) return res.status(429).json({ error: "Too many requests. Slow down." });
    try { return ok(res, await GET[route](req.query || {}), NOSTORE.has(route) ? "no-store" : undefined); } catch (e) { return fail(res, e); }
  };
  if (route === "quotes") return async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
    if (limited(req, 60)) return res.status(429).json({ error: "Too many requests. Slow down." });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    try { return ok(res, await svc.getQuotes(Array.isArray(b.symbols) ? b.symbols.slice(0, 40) : []), "no-store"); } catch (e) { return fail(res, e); }
  };
  if (route === "calc") return async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
    const b = req.body && typeof req.body === "object" ? req.body : {}, fn = String(b.fn || "");
    if (!Object.prototype.hasOwnProperty.call(calc, fn) || typeof calc[fn] !== "function" || fn === "result") return res.status(400).json({ error: "Unknown calculation.", available: Object.keys(calc).filter((k) => typeof calc[k] === "function" && k !== "result") });
    const args = Array.isArray(b.args) ? b.args : [];
    try { const value = calc[fn](...args); res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ fn, value, kind: "calculated", note: "Deterministic server-side calculation. Rates are fractions." }); } catch (e) { return res.status(400).json({ error: "Invalid inputs." }); }
  };
  if (route === "agent") return require("./agent-route");
  if (route === "diag") return require("./diag");
  return null;
}
module.exports = { make, routes: [...Object.keys(GET), "quotes", "calc", "agent", "diag"] };
