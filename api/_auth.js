// Accounts: Supabase Auth (GoTrue) called server-side with the service-role key, so the browser needs no Supabase key.
// Profiles (plan, Stripe ids, synced preferences) live in pt_profiles. Admins: env ADMIN_EMAILS (comma-separated).
const { sb } = require("./_lib");
const { TIERS, LIMITS, FEATURES, tierOf, featuresOf, planFor } = require("./_tiers");

const gotrue = (path, opts = {}) => fetch(`${process.env.SUPABASE_URL}/auth/v1/${path}`, {
  ...opts,
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) },
});

// Where account e-mail links (confirm sign-up, reset password, confirm new address) send people back to. GoTrue only honours it
// if it is on the Supabase project's redirect allow-list, otherwise it uses the project's Site URL. Only our own hosts are
// accepted from the request (never an arbitrary Host header); SITE_URL overrides.
const callbackUrl = (req) => {
  const base = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[a-z0-9.:-]+$/i.test(base)) return base + "/auth-callback.html";
  const host = String((req && req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim().toLowerCase();
  const ok = /^(www\.)?lekhafinancial\.com$/.test(host) || /^[a-z0-9-]+\.vercel\.app$/.test(host);
  return ok ? `https://${host}/auth-callback.html` : null;
};
const withRedirect = (path, url) => (url ? `${path}${path.includes("?") ? "&" : "?"}redirect_to=${encodeURIComponent(url)}` : path);

// GoTrue admin endpoints (create/list users) require the service role as a Bearer token, not just apikey.
const admin = (path, opts = {}) => gotrue(path, { ...opts, headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, ...(opts.headers || {}) } });

const admins = () => String(process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const isAdmin = (email) => admins().includes(String(email || "").toLowerCase());
const bearer = (req) => { const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ""); return m ? m[1].trim() : null; };

// Verify the caller's access token with Supabase; returns {id, email} or null.
async function userFrom(req) {
  const tok = bearer(req);
  if (!tok || tok.length > 4096) return null;
  try {
    const r = await gotrue("user", { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null;
    const u = await r.json();
    if (u && u.id) req.__uid = u.id; // read by api/_audit.js (verified id only)
    return u && u.id ? { id: u.id, email: u.email, confirmed: !!(u.email_confirmed_at || u.confirmed_at) } : null;
  } catch (e) { return null; }
}

async function profile(user) {
  const r = await sb(`pt_profiles?user_id=eq.${user.id}&select=*`);
  if (!r.ok) throw new Error("Account profile unavailable");
  let p = (await r.json())[0];
  if (!p) {
    const ins = await sb("pt_profiles", { method: "POST", headers: { Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify({ user_id: user.id, email: user.email }) });
    p = ins.ok && (await ins.json())[0];
    if (!p) throw new Error("Account profile unavailable");
  }
  // premium only while the paid period is current (1-day grace for renewal webhooks)
  const premium = ["active", "trialing"].includes(p.sub_status) && !!p.period_end && Date.parse(p.period_end) + 864e5 > Date.now();
  return { ...p, premium, is_admin: !!user.confirmed && isAdmin(user.email) };
}

async function updateProfile(userId, patch) {
  const r = await sb(`pt_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  if (!r.ok) return false;
  const rows = await r.json();
  return rows.length === 1 && rows[0].user_id === userId;
}

// Guards for route handlers: return the user/profile, or send the error response and return null.
async function requireUser(req, res) {
  const u = await userFrom(req);
  if (!u) { res.status(401).json({ error: "Sign in first." }); return null; }
  return u;
}

// Server-authoritative tier guard: resolves the caller's tier from their verified profile
// and refuses (402) unless it is on the allowed list. `need` in the response body tells the
// UI which plans would unlock the endpoint; the stored plan is never taken from the client.
async function requireTier(req, res, allowed, extra = null) {
  // the public sample portfolio (api/_h/free/demo.js) calls handlers on a synthetic request it alone can flag; it gets paid-tier depth
  if (req.__demoPublic === true) return { user_id: "demo-public", email: null, plan: "paid", sub_status: "active", period_end: "2999-01-01T00:00:00Z", is_admin: false };
  const list = Array.isArray(allowed) ? allowed.filter((t) => TIERS.includes(t)) : [];
  if (!list.length) throw new Error("requireTier: no valid tiers allowed");
  const u = await userFrom(req);
  // Anonymous visitors resolve to the demo profile only where a route explicitly lists "demo"
  // (the cited research agent and its knowledge base, with their own demo quotas). Demo is not a
  // plan: no restricted feature lists it. The demo profile never reaches Supabase.
  if (!u) {
    if (!list.includes("demo")) { res.status(401).json({ error: "This needs a signed-in account." }); return null; }
    return { user_id: "demo", email: null, plan: "demo", demo: true, sub_status: "active", period_end: "2999-01-01T00:00:00Z", is_admin: false, prefs: {} };
  }
  const p = await profile(u);
  const tier = tierOf(p);
  if (!list.includes(tier)) {
    // name the cheapest plan that unlocks this endpoint; a Paid-or-Premium gate must not read as Premium-only
    const want = list.includes("paid") ? (list.includes("premium") ? "Paid or Premium" : "Paid") : "Premium";
    res.status(402).json({ error: `${want} plan required.`, tier, need: list, ...(extra || {}) });
    return null;
  }
  return p;
}

// Feature guard (api/_data/entitlements.json): same contract as requireTier (401 anonymous, 402 with
// {tier, need}) plus `feature` and `plan` (the cheapest plan that unlocks it) for the upgrade screen.
// Demo is never entitled, so an anonymous caller always gets 401 here.
async function requireFeature(req, res, feature) {
  const names = Array.isArray(feature) ? feature : [feature];
  if (!names.length || names.some((f) => !FEATURES[f])) throw new Error("requireFeature: unknown feature " + names.join(","));
  const list = TIERS.filter((t) => names.some((f) => FEATURES[f].includes(t))); // any listed feature unlocks
  feature = names[0];
  // the synthetic sample-portfolio request (api/_h/free/demo.js) never unlocks a restricted feature
  if (req.__demoPublic === true) { res.status(402).json({ error: "Not available in the demo.", tier: "demo", need: list, feature, plan: planFor(feature) }); return null; }
  return requireTier(req, res, list, { feature, plan: planFor(feature) });
}

// Responses gated by a feature must never sit in a shared (CDN) or browser cache: a later caller
// without the entitlement could otherwise be served the stored answer. Forces every Cache-Control
// the handler sets afterwards to private, no-store.
function lockCache(res) {
  const set = res.setHeader.bind(res);
  res.setHeader = (k, v) => set(k, /^cache-control$/i.test(String(k)) ? "private, no-store" : v);
  set("Cache-Control", "private, no-store");
  return res;
}

async function requirePremium(req, res) {
  return requireTier(req, res, ["premium"]);
}
async function requireAdmin(req, res) {
  const u = await userFrom(req);
  // admin = a confirmed email on the server-side ADMIN_EMAILS list (an unconfirmed sign-up with that address gets nothing)
  if (!u || !u.confirmed || !isAdmin(u.email)) { res.status(u ? 403 : 401).json({ error: "Admins only." }); return null; }
  return u;
}

// public view of a profile (never Stripe ids). `tier` + `limits` drive UI hints only;
// `plan` stays as the legacy alias the login bundle reads.
const publicProfile = (p) => {
  const tier = tierOf(p);
  return {
    email: p.email,
    plan: tier === "paid" || tier === "premium" ? tier : "free",
    tier,
    limits: LIMITS[tier],
    features: featuresOf(tier),
    can_manage_billing: !!p.stripe_customer_id,
    sub_status: p.sub_status || null,
    period_end: p.period_end || null,
    is_admin: !!p.is_admin,
    prefs: p.prefs || {},
  };
};

module.exports = { gotrue, admin, userFrom, profile, updateProfile, requireUser, requireTier, requireFeature, lockCache, requirePremium, requireAdmin, publicProfile, isAdmin, bearer, callbackUrl, withRedirect };
