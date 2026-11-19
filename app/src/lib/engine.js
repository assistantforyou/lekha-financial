import { useEffect, useState } from "react"
// Mirrors and proxies the hidden classic-engine controls (prices/news pills, currency, refresh, layout editing, tier, language).
const $ = (id) => document.getElementById(id)
function useObserved(id, read) {
  const [v, set] = useState(() => read($(id)))
  useEffect(() => { const el = $(id); if (!el) return; const f = () => set(read(el)); f(); const o = new MutationObserver(f); o.observe(el, { attributes: true, childList: true, characterData: true, subtree: true }); return () => o.disconnect() }, [id])
  return v
}
const pill = (el) => (el ? { text: el.textContent.trim(), cls: el.className } : { text: "", cls: "" })
export const usePricePill = () => useObserved("st-prices", pill)
export const useNewsPill = () => useObserved("st-news", pill)
export const useTier = () => useObserved("brand-tier", (el) => (el ? el.textContent.trim() : ""))
export const useCurrency = () => useObserved("cur-thb", (el) => (el && el.getAttribute("aria-pressed") === "true" ? "THB" : "USD"))
export const setCurrency = (c) => { const b = $(c === "THB" ? "cur-thb" : "cur-usd"); b && b.click() }
export const refreshPrices = () => { const b = $("refresh"); b && b.click() }
export const useCustomizing = () => useObserved("lay-toggle", (el) => !!el && el.getAttribute("aria-pressed") === "true")
export const toggleCustomize = () => { const b = $("lay-toggle"); b && b.click() }
export const isDemo = () => !!window.PT_DEMO_MODE
export const session = () => { try { return window.PT_AUTH && window.PT_AUTH.session() } catch (e) { return null } }
export function useSession() {
  const [s, set] = useState(session)
  useEffect(() => { const f = () => set(session()); window.addEventListener("pt:state-hydrated", f); window.addEventListener("storage", f); document.addEventListener("visibilitychange", f); return () => { window.removeEventListener("pt:state-hydrated", f); window.removeEventListener("storage", f); document.removeEventListener("visibilitychange", f) } }, [])
  return s
}
// /api/auth/me record (tier, limits, is_admin, prefs) for signed-in users
export function useMe() {
  const [me, set] = useState(null), s = useSession()
  useEffect(() => { let dead = false; if (!s || isDemo()) { set(null); return } window.PT_AUTH.fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((j) => !dead && set(j)).catch(() => {}); return () => { dead = true } }, [s && s.email])
  return me
}
export const reloadMe = () => window.dispatchEvent(new Event("storage"))
