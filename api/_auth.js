// Accounts: Supabase Auth (GoTrue) called server-side with the service-role key, so the browser needs no Supabase key.
// Profiles (plan, Stripe ids, synced preferences) live in pt_profiles. Admins: env ADMIN_EMAILS (comma-separated).
const { sb } = require("./_lib");
const { TIERS, LIMITS, tierOf } = require("./_tiers");

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
async function requireTier(req, res, allowed) {
  // the public sample portfolio (api/_h/free/demo.js) calls handlers on a synthetic request it alone can flag; it gets paid-tier depth
  if (req.__demoPublic === true) return { user_id: "demo-public", email: null, plan: "paid", sub_status: "active", period_end: "2999-01-01T00:00:00Z", is_admin: false };
  const list = Array.isArray(allowed) ? allowed.filter((t) => TIERS.includes(t)) : [];
  if (!list.length) throw new Error("requireTier: no valid tiers allowed");
  const u = await userFrom(req);
  // Demo is a real entitlement: while the product is in preview every plan is open to anonymous
  // visitors, so a request with no signed-in user resolves to the demo profile instead of a 401.
  // The token-on-disk demo profile never reaches Supabase and is created fresh per request.
  if (!u) {
    if (!list.includes("demo")) { res.status(401).json({ error: "This needs a signed-in account." }); return null; }
    return { user_id: "demo", email: null, plan: "demo", demo: true, sub_status: "active", period_end: "2999-01-01T00:00:00Z", is_admin: false, prefs: {} };
  }
  const p = await profile(u);
  const tier = tierOf(p);
  if (!list.includes(tier)) {
    const want = list.includes("premium") ? "Premium" : "Paid";
    res.status(402).json({ error: `${want} plan required.`, tier, need: list });
    return null;
  }
  return p;
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
    can_manage_billing: !!p.stripe_customer_id,
    sub_status: p.sub_status || null,
    period_end: p.period_end || null,
    is_admin: !!p.is_admin,
    prefs: p.prefs || {},
  };
};

module.exports = { gotrue, admin, userFrom, profile, updateProfile, requireUser, requireTier, requirePremium, requireAdmin, publicProfile, isAdmin, bearer, callbackUrl, withRedirect };
