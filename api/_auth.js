// Accounts: Supabase Auth (GoTrue) called server-side with the service-role key, so the browser needs no Supabase key.
// Profiles (plan, Stripe ids, synced preferences) live in pt_profiles. Admins: env ADMIN_EMAILS (comma-separated).
const { sb } = require("./_lib");

const gotrue = (path, opts = {}) => fetch(`${process.env.SUPABASE_URL}/auth/v1/${path}`, {
  ...opts,
  headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", ...(opts.headers || {}) },
});

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
    return u && u.id ? { id: u.id, email: u.email, confirmed: !!(u.email_confirmed_at || u.confirmed_at) } : null;
  } catch (e) { return null; }
}

async function profile(user) {
  const r = await sb(`pt_profiles?user_id=eq.${user.id}&select=*`);
  let p = r.ok ? (await r.json())[0] : null;
  if (!p) {
    const ins = await sb("pt_profiles", { method: "POST", headers: { Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify({ user_id: user.id, email: user.email }) });
    p = ins.ok ? (await ins.json())[0] : { user_id: user.id, email: user.email, plan: "free", prefs: {} };
  }
  // premium only while the paid period is current (1-day grace for renewal webhooks)
  const premium = ["active", "trialing"].includes(p.sub_status) && !!p.period_end && Date.parse(p.period_end) + 864e5 > Date.now();
  return { ...p, premium, is_admin: !!user.confirmed && isAdmin(user.email) };
}

async function updateProfile(userId, patch) {
  return sb(`pt_profiles?user_id=eq.${userId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}

// Guards for route handlers: return the user/profile, or send the error response and return null.
async function requireUser(req, res) {
  const u = await userFrom(req);
  if (!u) { res.status(401).json({ error: "Sign in first." }); return null; }
  return u;
}
async function requirePremium(req, res) {
  const u = await userFrom(req);
  if (!u) { res.status(401).json({ error: "Premium data needs a signed-in account." }); return null; }
  const p = await profile(u);
  if (!p.premium && !p.is_admin) { res.status(402).json({ error: "Premium subscription required." }); return null; }
  return p;
}
async function requireAdmin(req, res) {
  const u = await userFrom(req);
  // admin = a confirmed email on the server-side ADMIN_EMAILS list (an unconfirmed sign-up with that address gets nothing)
  if (!u || !u.confirmed || !isAdmin(u.email)) { res.status(u ? 403 : 401).json({ error: "Admins only." }); return null; }
  return u;
}

// public view of a profile (never Stripe ids)
const publicProfile = (p) => ({ email: p.email, plan: p.premium ? "premium" : "free", sub_status: p.sub_status || null, period_end: p.period_end || null, is_admin: !!p.is_admin, prefs: p.prefs || {} });

module.exports = { gotrue, admin, userFrom, profile, updateProfile, requireUser, requirePremium, requireAdmin, publicProfile, isAdmin, bearer };
