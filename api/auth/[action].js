// POST /api/auth/signup|login|refresh|logout|password|email|delete|recover|prefs, GET /api/auth/me
// Session tokens are returned to the browser (stored in localStorage there); passwords are never stored or logged here.
const { gotrue, admin, userFrom, profile, updateProfile, publicProfile, bearer, callbackUrl, withRedirect } = require("../_auth");
const { rateHit, sb } = require("../_lib");
const { clientId } = require("../_history");

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const session = (j) => ({ user_id: j.user && j.user.id, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user && j.user.email });

// password re-check for sensitive actions: rate limited per user as well as per client, then verified against GoTrue
async function reauth(u, password, res) {
  if (!(await rateHit(`rl/auth-user/${u.id}/${Math.floor(Date.now() / 6e5)}`, 8))) { res.status(429).json({ error: "Too many attempts. Wait a few minutes." }); return false; }
  if (password.length < 8 || password.length > 72) { res.status(400).json({ error: "Enter your current password to confirm." }); return false; }
  const chk = await gotrue("token?grant_type=password", { method: "POST", body: JSON.stringify({ email: u.email, password }) });
  if (!chk.ok) { res.status(400).json({ error: "That password is not correct." }); return false; }
  return true;
}

const audit = require("../_audit");
const handle = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const route = String((req.query && req.query.action) || "");
  const action = route === "setup" && req.method === "POST" ? "signup" : route;
  const b = req.body && typeof req.body === "object" ? req.body : {};
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Accounts are not configured." });

  if (action === "me" && req.method === "GET") {
    const u = await userFrom(req);
    if (!u) return res.status(401).json({ error: "Not signed in." });
    return res.status(200).json(publicProfile(await profile(u)));
  }

  // Is this a brand-new install with no account yet? The owner sign-in page uses this to show
  // its one-time "create your account" panel without ever revealing whether a given email exists.
  if (action === "setup" && req.method === "GET") {
    const r = await admin("admin/users?page=1&per_page=2");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(503).json({ error: "Could not check the account store." });
    return res.status(200).json({ needed: !(j.users && j.users.length), owner_list: !!String(process.env.ADMIN_EMAILS || "").trim() });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  // brute-force guard: 20 auth attempts per client per 10 minutes
  if (["signup", "login", "recover", "password", "email", "delete"].includes(action) && !(await rateHit(`rl/auth/${clientId(req)}/${Math.floor(Date.now() / 6e5)}`, 20))) return res.status(429).json({ error: "Too many attempts. Wait a few minutes." });

  if (action === "signup" || action === "login") {
    const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
    if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Passwords are 8 to 72 characters." });
    const r = action === "signup"
      ? await gotrue(withRedirect("signup", callbackUrl(req)), { method: "POST", body: JSON.stringify({ email, password }) })
      : await gotrue("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) return res.status(429).json({ error: "Too many attempts. Wait a few minutes." });
    if (r.status >= 500) return res.status(503).json({ error: "Account service temporarily unavailable. Try again shortly." });
    if (action === "login" && !r.ok) return res.status(400).json({ error: "Wrong email or password, or the email is not confirmed yet." });
    // sign-up never says whether an address is already registered: same answer either way
    if (action === "signup" && (!r.ok || !j.access_token)) {
      if (!r.ok) console.error("signup refused:", r.status);
      return res.status(200).json({ confirm: true, message: "If this email can be used, a confirmation link is on its way. Confirm it, then sign in." });
    }
    return res.status(200).json({ session: session(j) });
  }
  if (action === "refresh") {
    const r = await gotrue("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: String(b.refresh_token || "") }) });
    const j = await r.json().catch(() => ({}));
    if (r.status >= 500 || r.status === 429) return res.status(503).json({ error: "Session service temporarily unavailable." });
    if (!r.ok || !j.access_token) return res.status(401).json({ error: "Session expired. Sign in again." });
    return res.status(200).json({ session: session(j) });
  }
  if (action === "logout") {
    const tok = bearer(req);
    if (tok) {
      const r = await gotrue("logout", { method: "POST", headers: { Authorization: `Bearer ${tok}` } }).catch(() => null);
      if (!r || (!r.ok && r.status !== 401)) return res.status(503).json({ error: "Could not confirm sign-out with the account service." });
    }
    return res.status(200).json({ ok: true });
  }
  if (action === "recover") {
    const email = String(b.email || "").trim().toLowerCase();
    if (EMAIL.test(email)) {
      const r = await gotrue(withRedirect("recover", callbackUrl(req)), { method: "POST", body: JSON.stringify({ email }) }).catch(() => null);
      if (!r || r.status >= 500) return res.status(503).json({ error: "Recovery email is temporarily unavailable. Try again shortly." });
      if (r.status === 429) return res.status(429).json({ error: "Too many requests. Wait a few minutes." });
    }
    return res.status(200).json({ ok: true, message: "If that email has an account, a reset link is on its way." });
  }
  if (action === "password") {
    const tok = bearer(req), password = String(b.password || "");
    if (!tok) return res.status(401).json({ error: "Sign in first." });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Passwords are 8 to 72 characters." });
    const r = await gotrue("user", { method: "PUT", headers: { Authorization: `Bearer ${tok}` }, body: JSON.stringify({ password }) });
    return r.ok ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Could not change the password." });
  }
  // change the sign-in email: GoTrue sends a confirmation link to the new address; nothing changes until it is clicked
  if (action === "email") {
    const u = await userFrom(req), email = String(b.email || "").trim().toLowerCase();
    if (!u) return res.status(401).json({ error: "Sign in first." });
    if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!(await reauth(u, String(b.password || ""), res))) return;
    const r = await gotrue(withRedirect("user", callbackUrl(req)), { method: "PUT", headers: { Authorization: `Bearer ${bearer(req)}` }, body: JSON.stringify({ email }) });
    return r.ok ? res.status(200).json({ ok: true, message: "Check the new address for a confirmation link. Your sign-in email changes when you confirm it." }) : res.status(400).json({ error: "Could not start the email change." });
  }
  // permanently delete the account and its stored state. Re-checks the password, requires the typed word DELETE, and refuses while a paid plan is active.
  if (action === "delete") {
    const u = await userFrom(req); if (!u) return res.status(401).json({ error: "Sign in first." });
    if (String(b.confirm || "") !== "DELETE") return res.status(400).json({ error: "Type DELETE to confirm." });
    if (!(await reauth(u, String(b.password || ""), res))) return;
    const p = await profile(u);
    if ((p.plan === "paid" || p.plan === "premium") && p.sub_status && !/^(canceled|cancelled|incomplete_expired)$/.test(p.sub_status)) return res.status(409).json({ error: "Cancel your subscription first (Plans & billing, Manage subscription), then delete the account.", code: "active_subscription" });
    // Profiles and state cascade from auth.users. Retrieval documents also support demo owners and use a text key.
    const cleanup = await sb(`pt_rag_docs?owner=eq.${encodeURIComponent(u.id)}`, { method: "DELETE" });
    if (!cleanup.ok && cleanup.status !== 404) return res.status(503).json({ error: "Could not remove account documents. Retry deletion shortly." });
    const d = await admin(`admin/users/${u.id}`, { method: "DELETE" });
    return d.ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: "The account could not be deleted. Please retry or contact support." });
  }
  if (action === "prefs") {
    const u = await userFrom(req);
    if (!u) return res.status(401).json({ error: "Sign in first." });
    const prefs = b.prefs && typeof b.prefs === "object" ? b.prefs : null;
    if (!prefs || JSON.stringify(prefs).length > 20000) return res.status(400).json({ error: "Invalid preferences." });
    await profile(u);
    if (!(await updateProfile(u.id, { prefs }))) return res.status(503).json({ error: "Could not save preferences." });
    return res.status(200).json({ ok: true });
  }
  return res.status(404).json({ error: "Unknown action." });
};
module.exports = (req, res) => audit.around("auth", String((req.query && req.query.action) || ""), req, res, () => handle(req, res));
