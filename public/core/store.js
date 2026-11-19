/* Portfolio Terminal core: who you are (session, plan), your holdings, preferences, billing.
   Built on the same browser storage and server routes as the classic terminal, so an account, a plan and a
   portfolio carry over unchanged between versions. Mode is decided once per page load by pt-datasource.js:
   no session -> sample portfolio, a session -> your real data. */
const NSR = "ptpub.v1.", NSD = "ptpub.v1.demo.";
export const isDemo = () => !!window.PT_DEMO_MODE;
const ns = () => (isDemo() ? NSD : NSR);
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };

/* ---------- preferences (shared with the classic terminal) ---------- */
export const prefs = {
  get() { return Object.assign({ theme: "auto", size: "M", cur: "USD" }, ls.get(NSR + "prefs") || {}, ls.get(NSR + "v2.prefs") || {}); },
  set(patch) { const cur = ls.get(NSR + "v2.prefs") || {}; ls.set(NSR + "v2.prefs", Object.assign(cur, patch)); },
};

/* ---------- holdings: {items:[{acct,tk,theme,cur,qty,cost,px}], usdthb, hkdusd} ---------- */
const listeners = new Set();
export const onHoldings = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function loadHoldings() {
  const v = ls.get(ns() + "db.holdings/all"); if (!v || !Array.isArray(v.items)) return { items: [] };
  if (isDemo()) v.items = v.items.map((h) => { const cash = h.tk === "CASH" && h.qty === 1 && h.cost > 1; return { ...h, acct: String(h.acct || "").replace(/^demo\s+/i, ""), qty: cash ? h.cost : h.qty }; });  // sample portfolio: plain account names, real cash amount
  return v;
}
export function saveHoldings(doc) {
  const ok = ls.set(ns() + "db.holdings/all", doc);
  try { if (window.PT_SYNC) window.PT_SYNC.touch("holdings/all"); } catch (e) { /* offline */ }
  listeners.forEach((f) => { try { f(doc); } catch (e) { /* listener error */ } });
  return ok;
}
export const loadDoc = (key) => ls.get(ns() + "db." + key);

/* ---------- account ---------- */
export const session = () => { try { return window.PT_AUTH.session(); } catch (e) { return null; } };
export const signedIn = () => !isDemo() && !!session();
export async function me() { try { return (await window.PT_TIER_READY()) || null; } catch (e) { return null; } }
export const tierName = (m) => (isDemo() || !m ? "demo" : m.tier || "free");
async function post(url, body, auth) {
  const o = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) };
  const r = auth ? await window.PT_AUTH.fetch(url, o) : await fetch(url, o);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
export async function authenticate(mode, email, password) {          // mode: "login" | "signup"
  const r = await post("/api/auth/" + mode, { email, password });
  if (!r.ok) return { error: r.j.error || "failed" };
  if (r.j.session) { window.PT_AUTH.setSession(r.j.session); return { ok: true }; }
  return { confirm: true, message: r.j.message || "" };
}
export async function recover(email) { const r = await post("/api/auth/recover", { email }); return r.ok; }
export async function signOut() {
  try { await window.PT_AUTH.fetch("/api/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
  window.PT_AUTH.setSession(null);
  try { if (window.PT_SYNC) window.PT_SYNC.reset(); } catch (e) { /* ignore */ }
}
const retPath = () => (/^\/v3/.test(location.pathname) ? "/v3" : "/v2");
export async function checkout(plan) { const r = await post("/api/billing/checkout", { plan, ret: retPath() }, true); return r.ok && r.j.url ? { url: r.j.url } : { error: r.j.error || "failed", status: r.status }; }
export async function billingPortal() { const r = await post("/api/billing/portal", { ret: retPath() }, true); return r.ok && r.j.url ? { url: r.j.url } : { error: r.j.error || "failed", status: r.status }; }
export async function ai(path, body, method = "POST") {
  const r = await window.PT_AUTH.fetch("/api/ai/" + path, method === "GET" ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
