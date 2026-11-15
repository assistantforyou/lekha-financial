// Server-only helpers: Supabase REST cache, daily Alpha Vantage call budget, cached fetch.
// Env: AV_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set in Vercel, never sent to the browser).
const DAILY_LIMIT = 22; // free tier is 25/day; keep headroom for manual tests

function sb(path, opts = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
}

async function cacheGet(key) {
  const r = await sb(`pt_av_cache?key=eq.${encodeURIComponent(key)}&select=payload,fetched_at`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] ? { payload: rows[0].payload, fetchedAt: Date.parse(rows[0].fetched_at) } : null;
}

async function cacheSet(key, payload) {
  await sb("pt_av_cache", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key, payload, fetched_at: new Date().toISOString() }),
  });
}

async function spend() {
  const r = await sb("rpc/pt_av_spend", { method: "POST", body: JSON.stringify({ p_limit: DAILY_LIMIT }) });
  return r.ok && (await r.json()) === true;
}

// One budgeted Alpha Vantage call. Throws if over budget or if AV returns a note/error instead of data.
let lastCallAt = 0;
async function av(params) {
  if (!(await spend())) throw new Error("daily_budget_exhausted");
  // free tier allows 1 request/second: space calls made within one function run
  const wait = lastCallAt + 1200 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
  const qs = new URLSearchParams({ ...params, apikey: process.env.AV_API_KEY });
  const r = await fetch(`https://www.alphavantage.co/query?${qs}`);
  const j = await r.json();
  if (j.Note || j.Information || j["Error Message"]) throw new Error("alpha_vantage_refused");
  return j;
}

// Serve fresh cache; refresh when stale; fall back to stale data if the refresh fails or the budget is gone.
async function cached(key, ttlMs, build) {
  const hit = await cacheGet(key);
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return hit.payload;
  // after a failed refresh, wait 30 min before spending more budget on the same key
  const fail = await cacheGet("fail/" + key);
  if (fail && Date.now() - fail.fetchedAt < 30 * 60 * 1000) return hit ? hit.payload : null;
  try {
    const fresh = await build();
    if (fresh != null) { await cacheSet(key, fresh); return fresh; }
  } catch (e) { /* fall through to stale */ }
  await cacheSet("fail/" + key, { failed: true });
  return hit ? hit.payload : null;
}

module.exports = { av, cached, DAILY_LIMIT };
