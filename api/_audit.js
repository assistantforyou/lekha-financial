// Audit trail (table pt_audit, see docs/sql/2026-11-22-audit-events.sql). One row per API call so usage and failures can be
// reported per user, route and day. Stores NO prompts, bodies, emails or tokens. Logging must never break a request.
const { sb } = require("./_lib");
const { clientId } = require("./_history");

const SYMBOL = /^[A-Z0-9.\-^=]{1,12}$/;

function classify(status) {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "denied";
  if (status === 402) return "gated";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "ok";
}

// Pure: build the row from what we observed. `seen` = {code, attempts, cache} captured from the JSON response.
function buildEvent({ grp, route, req, status, ms, seen = {}, userId = null, client = null }) {
  const q = (req && req.query) || {};
  const sym = String(q.symbol || "").toUpperCase();
  const providerErrors = Array.isArray(seen.attempts) ? seen.attempts.filter((a) => a && a.status === "error").map((a) => String(a.provider || "").slice(0, 24)).filter(Boolean).slice(0, 8) : [];
  const meta = {};
  if (grp === "ai" && route === "council-v3" && ["Z.ai", "Gemini"].includes(seen.provider)) {
    meta.provider = seen.provider;
    meta.fallback = !!seen.fallback;
    meta.generation = seen.cached ? "cached" : seen.shared ? "shared" : "fresh";
    meta.provider_attempts = meta.generation === "fresh" && Number.isInteger(seen.requests) ? seen.requests : 0;
  }
  if (providerErrors.length) meta.provider_errors = providerErrors;
  if (seen.cache) meta.cache = String(seen.cache).slice(0, 12);
  return {
    user_id: userId || null, grp: String(grp).slice(0, 24), route: String(route || "").replace(/[^A-Za-z0-9_./\-]/g, "").slice(0, 60) || "(none)",
    method: String((req && req.method) || "GET").slice(0, 8), status, outcome: classify(status), ms: Math.max(0, Math.round(ms)),
    err: seen.code ? String(seen.code).slice(0, 60) : null, client, symbol: SYMBOL.test(sym) ? sym : null, meta: Object.keys(meta).length ? meta : null,
  };
}

async function record(evt, timeoutMs = 1500) {
  if (process.env.AUDIT_DISABLED === "1" || !process.env.SUPABASE_URL) return false;
  try {
    const r = await sb("pt_audit", { method: "POST", signal: AbortSignal.timeout(timeoutMs), headers: { Prefer: "return=minimal" }, body: JSON.stringify(evt) });
    return r.ok;
  } catch (e) { return false; }
}

// Wrap a (req,res) handler. The row is written after the handler returns, so client latency is unaffected
// (the serverless function stays alive until this promise settles).
async function around(grp, route, req, res, run) {
  const t0 = Date.now(), seen = {}, json = res.json && res.json.bind(res);
  if (json) res.json = (body) => {
    if (body && typeof body === "object") {
      if (body.user_id && !req.__uid) req.__uid = body.user_id;
      if (body.code) seen.code = body.code;
      else if (body.error && res.statusCode >= 400) seen.code = "http_" + res.statusCode;
      const meta = body.meta;
      if (meta) Object.assign(seen, { attempts: meta.attempts, cache: meta.cache, provider: meta.provider,
        fallback: !!meta.fallback, requests: meta.llmRequests, cached: meta.cached, shared: meta.shared });
    }
    return json(body);
  };
  let thrown = null;
  try { return await run(); } catch (e) { thrown = e; throw e; }
  finally {
    const status = thrown ? 500 : res.statusCode || 200;
    if (thrown && !seen.code) seen.code = "exception";
    let client = null; try { client = clientId(req); } catch (e) { /* ignore */ }
    await record(buildEvent({ grp, route, req, status, ms: Date.now() - t0, seen, userId: req.__uid || null, client }));
  }
}

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

// Pure aggregation for the admin report: rows -> per-route health, top errors, per-user activity, daily trend, simple funnel.
function summarize(rows, now = new Date()) {
  const routes = {}, errs = {}, users = {}, days = {}, firstSeen = {};
  for (const r of rows || []) {
    const key = `${r.grp}/${r.route}`, ro = routes[key] || (routes[key] = { route: key, calls: 0, errors: 0, rateLimited: 0, denied: 0, ms: [] });
    ro.calls++; ro.ms.push(Number(r.ms) || 0);
    if (r.outcome === "server_error" || r.outcome === "client_error") ro.errors++;
    if (r.outcome === "rate_limited") ro.rateLimited++;
    if (r.outcome === "denied") ro.denied++;
    if (r.outcome !== "ok") { const ek = `${key}|${r.status}|${r.err || ""}`; errs[ek] = (errs[ek] || { route: key, status: r.status, code: r.err || null, n: 0 }); errs[ek].n++; }
    if (r.user_id) { const u = users[r.user_id] || (users[r.user_id] = { user: String(r.user_id).slice(0, 8), calls: 0, errors: 0, routes: new Set(), last: r.ts }); u.calls++; if (r.outcome !== "ok") u.errors++; u.routes.add(key); if (r.ts > u.last) u.last = r.ts; }
    const d = String(r.ts || "").slice(0, 10); if (d) { const dd = days[d] || (days[d] = { day: d, calls: 0, errors: 0, users: new Set() }); dd.calls++; if (r.outcome === "server_error") dd.errors++; if (r.user_id) dd.users.add(r.user_id); }
    if (r.user_id) { const f = firstSeen[r.user_id] || (firstSeen[r.user_id] = new Set()); f.add(key); }
  }
  const byRoute = Object.values(routes).map((r) => ({ route: r.route, calls: r.calls, errors: r.errors, errorRate: r.calls ? +(r.errors / r.calls).toFixed(3) : 0, rateLimited: r.rateLimited, denied: r.denied, p50: pct(r.ms, 50), p95: pct(r.ms, 95) })).sort((a, b) => b.errors - a.errors || b.calls - a.calls);
  const authed = Object.values(firstSeen);
  return {
    generatedAt: now.toISOString(), total: (rows || []).length, activeUsers: authed.length,
    byRoute, topErrors: Object.values(errs).sort((a, b) => b.n - a.n).slice(0, 20),
    topUsers: Object.values(users).map((u) => ({ user: u.user, calls: u.calls, errors: u.errors, routes: u.routes.size, last: u.last })).sort((a, b) => b.calls - a.calls).slice(0, 20),
    byDay: Object.values(days).map((d) => ({ day: d.day, calls: d.calls, serverErrors: d.errors, users: d.users.size })).sort((a, b) => (a.day < b.day ? -1 : 1)),
    funnel: { signedUp: (rows || []).filter((r) => r.grp === "auth" && r.route === "signup" && r.outcome === "ok").length, signedIn: (rows || []).filter((r) => r.grp === "auth" && r.route === "login" && r.outcome === "ok").length, usersWhoAskedAI: authed.filter((s) => [...s].some((k) => k.endsWith("/agent"))).length, usersWhoHitLimit: new Set((rows || []).filter((r) => r.outcome === "rate_limited" && r.user_id).map((r) => r.user_id)).size },
  };
}

module.exports = { classify, buildEvent, record, around, summarize };
