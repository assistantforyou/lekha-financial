import { api } from "@/lib/api"
// Every account action goes through the existing /api/auth, /api/billing and /api/state endpoints (server-side entitlements; the browser decides nothing).
const post = (path, body, auth) => api(path, { method: "POST", body: body || {}, auth })
export const login = async (email, password) => { const j = await post("/api/auth/login", { email, password }); window.PT_AUTH.setSession(j.session); return j }
export const signup = async (email, password) => { const j = await post("/api/auth/signup", { email, password }); if (j.session) window.PT_AUTH.setSession(j.session); return j }
export const recover = (email) => post("/api/auth/recover", { email })
export const logout = async () => { await post("/api/auth/logout", {}, true).catch(() => {}); window.PT_AUTH.setSession(null); try { window.PT_SYNC && PT_SYNC.reset() } catch (e) {} }
export const changePassword = (password) => post("/api/auth/password", { password }, true)
export const changeEmail = (email, password) => post("/api/auth/email", { email, password }, true)
export const deleteAccount = (password, confirm) => post("/api/auth/delete", { password, confirm }, true)
export const checkout = (plan) => post("/api/billing/checkout", { plan }, true)
export const portal = () => post("/api/billing/portal", {}, true)
export const setPref = (k, v) => { try { window.PT_UI.setPref(k, v) } catch (e) {} }
export const getPref = (k, d) => { try { const v = window.PT_UI.getPref(k); return v == null ? d : v } catch (e) { return d } }
// everything this browser stores for the app (never the session tokens), for export/backup
export function exportAll() {
  const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("ptpub.v1.") && !/session|importpass/.test(k)) { try { out[k] = JSON.parse(localStorage.getItem(k)) } catch (e) { out[k] = localStorage.getItem(k) } } }
  return { app: "LEKHA Financials", exportedAt: new Date().toISOString(), version: 1, data: out }
}
export function importAll(obj) { if (!obj || obj.app !== "LEKHA Financials" || !obj.data) throw new Error("This is not a LEKHA export file."); let n = 0; for (const [k, v] of Object.entries(obj.data)) { if (!k.startsWith("ptpub.v1.") || /session|importpass/.test(k)) continue; localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); n++ } return n }
