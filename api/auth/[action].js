// POST /api/auth/signup|login|refresh|logout|password|recover|prefs, GET /api/auth/me
// Session tokens are returned to the browser (stored in localStorage there); passwords are never stored or logged here.
const { gotrue, userFrom, profile, updateProfile, publicProfile, bearer } = require("../_auth");
const { rateHit } = require("../_lib");
const { clientId } = require("../_history");

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const session = (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user && j.user.email });
const msg = (j, fallback) => String((j && (j.msg || j.error_description || j.message || j.error)) || fallback).slice(0, 200);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const action = String((req.query && req.query.action) || "");
  const b = req.body && typeof req.body === "object" ? req.body : {};
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Accounts are not configured." });

  if (action === "me" && req.method === "GET") {
    const u = await userFrom(req);
    if (!u) return res.status(401).json({ error: "Not signed in." });
    return res.status(200).json(publicProfile(await profile(u)));
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  // brute-force guard: 20 auth attempts per client per 10 minutes
  if (["signup", "login", "recover"].includes(action) && !(await rateHit(`rl/auth/${clientId(req)}/${Math.floor(Date.now() / 6e5)}`, 20))) return res.status(429).json({ error: "Too many attempts. Wait a few minutes." });

  if (action === "signup" || action === "login") {
    const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
    if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Passwords are 8 to 72 characters." });
    const r = action === "signup"
      ? await gotrue("signup", { method: "POST", body: JSON.stringify({ email, password }) })
      : await gotrue("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 429 ? 429 : 400).json({ error: action === "login" ? "Wrong email or password, or the email is not confirmed yet." : msg(j, "Sign-up failed.") });
    if (!j.access_token) return res.status(200).json({ confirm: true, message: "Check your email for a confirmation link, then sign in." });
    return res.status(200).json({ session: session(j) });
  }
  if (action === "refresh") {
    const r = await gotrue("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: String(b.refresh_token || "") }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return res.status(401).json({ error: "Session expired. Sign in again." });
    return res.status(200).json({ session: session(j) });
  }
  if (action === "logout") {
    const tok = bearer(req);
    if (tok) await gotrue("logout", { method: "POST", headers: { Authorization: `Bearer ${tok}` } }).catch(() => {});
    return res.status(200).json({ ok: true });
  }
  if (action === "recover") {
    const email = String(b.email || "").trim().toLowerCase();
    if (EMAIL.test(email)) await gotrue("recover", { method: "POST", body: JSON.stringify({ email }) }).catch(() => {});
    return res.status(200).json({ ok: true, message: "If that email has an account, a reset link is on its way." });
  }
  if (action === "password") {
    const tok = bearer(req), password = String(b.password || "");
    if (!tok) return res.status(401).json({ error: "Sign in first." });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Passwords are 8 to 72 characters." });
    const r = await gotrue("user", { method: "PUT", headers: { Authorization: `Bearer ${tok}` }, body: JSON.stringify({ password }) });
    return r.ok ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Could not change the password." });
  }
  if (action === "prefs") {
    const u = await userFrom(req);
    if (!u) return res.status(401).json({ error: "Sign in first." });
    const prefs = b.prefs && typeof b.prefs === "object" ? b.prefs : null;
    if (!prefs || JSON.stringify(prefs).length > 20000) return res.status(400).json({ error: "Invalid preferences." });
    await profile(u);
    await updateProfile(u.id, { prefs });
    return res.status(200).json({ ok: true });
  }
  return res.status(404).json({ error: "Unknown action." });
};
