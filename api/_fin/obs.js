// Observability for the data layer: every provider call, cache outcome, tool call and token count is recorded in memory
// (per serverless instance) and rolled up once a day into the shared cache table so the admin page can show history.
const MAX_RING = 300;
const st = { since: Date.now(), providers: {}, cache: { hit: 0, miss: 0, stale: 0, byClass: {} }, tools: {}, tokens: { in: 0, out: 0, calls: 0, byJob: {} }, ring: [], errors: [] };

const prov = (name) => (st.providers[name] = st.providers[name] || { calls: 0, ok: 0, fail: 0, ms: 0, maxMs: 0, ops: {}, lastError: null, lastOkAt: null, lastFailAt: null });

function call({ provider, op, ms, ok, err }) {
  const p = prov(provider); p.calls++; p.ms += ms; p.maxMs = Math.max(p.maxMs, ms);
  const o = (p.ops[op] = p.ops[op] || { calls: 0, fail: 0, ms: 0 }); o.calls++; o.ms += ms;
  if (ok) { p.ok++; p.lastOkAt = new Date().toISOString(); } else { p.fail++; o.fail++; p.lastError = String(err || "error").slice(0, 160); p.lastFailAt = new Date().toISOString(); }
  push({ t: Date.now(), kind: "provider", provider, op, ms: Math.round(ms), ok, err: ok ? undefined : String(err || "").slice(0, 120) });
}
function cache(cls, outcome) {
  const k = outcome === "miss" ? "miss" : outcome === "stale" ? "stale" : "hit"; st.cache[k]++;
  const c = (st.cache.byClass[cls] = st.cache.byClass[cls] || { hit: 0, miss: 0, stale: 0 }); c[k]++;
}
function tool(name, ok, ms, err) {
  const t = (st.tools[name] = st.tools[name] || { calls: 0, fail: 0, ms: 0, lastError: null }); t.calls++; t.ms += ms;
  if (!ok) { t.fail++; t.lastError = String(err || "").slice(0, 160); }
  push({ t: Date.now(), kind: "tool", tool: name, ms: Math.round(ms), ok, err: ok ? undefined : String(err || "").slice(0, 120) });
}
function tokens(job, inTok, outTok) { st.tokens.in += inTok || 0; st.tokens.out += outTok || 0; st.tokens.calls++; const j = (st.tokens.byJob[job] = st.tokens.byJob[job] || { in: 0, out: 0, calls: 0 }); j.in += inTok || 0; j.out += outTok || 0; j.calls++; }
function push(e) { st.ring.push(e); if (st.ring.length > MAX_RING) st.ring.shift(); }

function snapshot() {
  const providers = Object.entries(st.providers).map(([name, p]) => ({ name, calls: p.calls, ok: p.ok, fail: p.fail, errorRate: p.calls ? p.fail / p.calls : 0, avgMs: p.calls ? Math.round(p.ms / p.calls) : 0, maxMs: Math.round(p.maxMs),
    lastError: p.lastError, lastOkAt: p.lastOkAt, lastFailAt: p.lastFailAt, ops: Object.entries(p.ops).map(([op, o]) => ({ op, calls: o.calls, fail: o.fail, avgMs: o.calls ? Math.round(o.ms / o.calls) : 0 })) })).sort((a, b) => b.calls - a.calls);
  const total = st.cache.hit + st.cache.miss + st.cache.stale;
  return { sinceMs: Date.now() - st.since, providers, cache: { ...st.cache, hitRate: total ? (st.cache.hit + st.cache.stale) / total : null, total },
    tools: Object.entries(st.tools).map(([name, t]) => ({ name, calls: t.calls, fail: t.fail, failRate: t.calls ? t.fail / t.calls : 0, avgMs: t.calls ? Math.round(t.ms / t.calls) : 0, lastError: t.lastError })).sort((a, b) => b.calls - a.calls),
    tokens: st.tokens, recent: st.ring.slice(-60).reverse() };
}
function reset() { st.since = Date.now(); st.providers = {}; st.cache = { hit: 0, miss: 0, stale: 0, byClass: {} }; st.tools = {}; st.tokens = { in: 0, out: 0, calls: 0, byJob: {} }; st.ring = []; }

// time a provider operation and record it (rethrows)
async function timed(provider, op, fn) {
  const t0 = Date.now();
  try { const v = await fn(); call({ provider, op, ms: Date.now() - t0, ok: true }); return v; }
  catch (e) { call({ provider, op, ms: Date.now() - t0, ok: false, err: e && e.message }); throw e; }
}

module.exports = { call, cache, tool, tokens, snapshot, reset, timed };
