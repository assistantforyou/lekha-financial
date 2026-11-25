import { api } from "@/lib/api"
import { capture, identify, reset } from "@/lib/analytics"
// Every account action goes through the existing /api/auth, /api/billing and /api/state endpoints (server-side entitlements; the browser decides nothing).
const post = (path, body, auth) => api(path, { method: "POST", body: body || {}, auth })
/* Events carry counts and plan names only. Identity is the Supabase user id, never the e-mail address. */
const signIn = (j, event) => { if (j && j.session && j.session.user_id) identify(j.session.user_id, { surface: "app" }); capture(event) }
export const login = async (email, password) => { const j = await post("/api/auth/login", { email, password }); window.PT_AUTH.setSession(j.session); signIn(j, "signed_in"); return j }
export const signup = async (email, password) => { const j = await post("/api/auth/signup", { email, password }); if (j.session) { window.PT_AUTH.setSession(j.session); signIn(j, "signup_completed") } return j }
export const recover = async (email) => { const j = await post("/api/auth/recover", { email }); capture("password_recovery_requested"); return j }
export const logout = async () => { await post("/api/auth/logout", {}, true).catch(() => {}); capture("signed_out"); window.PT_AUTH.setSession(null); reset(); try { window.PT_SYNC && PT_SYNC.reset() } catch (e) {} }
export const changePassword = async (password) => { const j = await post("/api/auth/password", { password }, true); capture("password_changed"); return j }
export const changeEmail = async (email, password) => { const j = await post("/api/auth/email", { email, password }, true); capture("email_change_requested"); return j }
export const deleteAccount = async (password, confirm) => { const j = await post("/api/auth/delete", { password, confirm }, true); capture("account_deleted"); reset(); return j }
export const checkout = async (plan) => { capture("checkout_started", { plan, surface: "app" }); return post("/api/billing/checkout", { plan }, true) }
export const portal = async () => { capture("billing_portal_opened"); return post("/api/billing/portal", {}, true) }
export const setPref = (k, v) => { try { window.PT_UI.setPref(k, v) } catch (e) {} }
export const getPref = (k, d) => { try { const v = window.PT_UI.getPref(k); return v == null ? d : v } catch (e) { return d } }
// Backups contain the current portfolio's documents. Version one used absolute storage keys.
export function exportAll() {
  const data = {}
  for (const key of window.PT_SYNC.keys()) {
    data[key] = JSON.parse(localStorage.getItem(window.PT_STORAGE_NS + "db." + key))
  }
  capture("data_exported", { documents: Object.keys(data).length })
  return { app: "LEKHA Financials", exportedAt: new Date().toISOString(), version: 2, data }
}
export function importAll(obj) {
  if (!obj || obj.app !== "LEKHA Financials" || !obj.data) throw new Error("This is not a LEKHA export file.")
  let count = 0
  for (const [stored, value] of Object.entries(obj.data)) {
    const key = obj.version === 1 ? stored.replace(/^ptpub\.v1\.(?:demo\.)?db\./, "") : stored
    if (!window.PT_SYNC.accepts(key)) continue
    localStorage.setItem(window.PT_STORAGE_NS + "db." + key, JSON.stringify(value))
    window.PT_SYNC.touch(key)
    count++
  }
  capture("data_imported", { documents: count })
  return count
}
