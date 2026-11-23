// GET /api/data/diag (admins only): provider health, latency, error rates, cache hit rate, tool failures, token usage, and which integrations are configured (booleans only).
const { requireAdmin } = require("../../_auth");
const { sb, cacheGet, cacheSet } = require("../../_lib");
const svc = require("../../_fin/service");
const obs = require("../../_fin/obs");
const cache = require("../../_fin/cache");

const KEYS = ["SEC_USER_AGENT", "FMP_API_KEY", "FINNHUB_API_KEY", "AV_API_KEY", "TWELVEDATA_API_KEY", "ALPACA_API_KEY_ID", "ALPACA_API_SECRET_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "STRIPE_SECRET_KEY", "FRED_API_KEY", "MASSIVE_API_KEY", "NEWS_API_KEY"];
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!(await requireAdmin(req, res))) return;
  const snap = obs.snapshot(), day = new Date().toISOString().slice(0, 10);
  let tokens7d = [], history = [];
  try { const r = await sb(`pt_costs?ts=gte.${new Date(Date.now() - 7 * 864e5).toISOString()}&select=job,model,units,usd&limit=5000`); if (r.ok) { const by = {}; for (const x of await r.json()) { const k = `${x.job} · ${x.model}`; const o = (by[k] = by[k] || { job: x.job, model: x.model, calls: 0, in: 0, out: 0, usd: 0 }); o.calls++; o.in += (x.units && x.units.in) || 0; o.out += (x.units && x.units.out) || 0; o.usd += x.usd || 0; } tokens7d = Object.values(by).sort((a, b) => b.calls - a.calls); } } catch (e) { /* table optional */ }
  try { await cacheSet("fin/stats/" + day, { at: new Date().toISOString(), providers: snap.providers.map((p) => ({ name: p.name, calls: p.calls, fail: p.fail, avgMs: p.avgMs })), cache: snap.cache, tools: snap.tools.map((t) => ({ name: t.name, calls: t.calls, fail: t.fail })) });
    for (let i = 1; i <= 6; i++) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), h = await cacheGet("fin/stats/" + d); if (h) history.push({ day: d, ...h.payload }); } } catch (e) { /* optional */ }
  const stats = Object.fromEntries(snap.providers.map((p) => [p.name, p]));
  const providerTable = svc.status().map((p) => ({ name: p.name, configured: p.configured, license: p.license, calls: (stats[p.name] || {}).calls || 0, fail: (stats[p.name] || {}).fail || 0, errorRate: (stats[p.name] || {}).errorRate || 0, avgMs: (stats[p.name] || {}).avgMs || 0, lastError: (stats[p.name] || {}).lastError || null }));
  return res.status(200).json({ generatedAt: new Date().toISOString(), note: "Counters are per serverless instance since it started; the daily rollup in `history` is the last snapshot written per day.", providers: svc.status(), providerTable,
    env: Object.fromEntries(KEYS.map((k) => [k, !!process.env[k]])), cacheEntries: cache.size(), ...snap, tokens7d, history });
};
