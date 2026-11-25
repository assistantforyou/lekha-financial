import { useEffect, useRef, useState, useCallback } from "react"
// Every financial datum on screen comes through /api/data (the unified FinancialDataService). The UI never sees provider schemas.
export async function api(path, { method = "GET", body, auth = false, signal } = {}) {
  const headers = {}; if (body) headers["Content-Type"] = "application/json"
  const send = auth && window.PT_AUTH ? window.PT_AUTH.fetch : fetch
  const r = await send(path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status, code: j.code, attempts: j.attempts, body: j })
  return j
}
export const data = (route, params = {}) => { const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")); return api(`/api/data/${route}${q.toString() ? "?" + q : ""}`, { auth: true }) }
/* Stale-while-revalidate cache shared by every screen: a screen that has been opened before renders instantly from memory and refreshes quietly,
   identical in-flight requests are shared, and prefetch() warms the cache before the user clicks. Keyed by route + params, per page load. */
const CACHE = new Map(), INFLIGHT = new Map(), FRESH_MS = 60e3
/* News changes slowly and costs several publisher feeds to fetch, so it stays fresh for five minutes and is kept
   in a larger cache than quotes. Everything else defaults to one minute. */
const FRESH = { news: 300e3 }, FRESH_MAX = 400
const freshFor = (route) => FRESH[route] || FRESH_MS
const keyOf = (route, params) => route + JSON.stringify(params || {})
function load(route, params) {
  const k = keyOf(route, params); if (INFLIGHT.has(k)) return INFLIGHT.get(k)
  const p = data(route, params).then((j) => { CACHE.set(k, { t: Date.now(), data: j.data, meta: j.meta }); if (CACHE.size > FRESH_MAX) CACHE.delete(CACHE.keys().next().value); return CACHE.get(k) }).finally(() => INFLIGHT.delete(k))
  INFLIGHT.set(k, p); return p
}
export const prefetch = (route, params) => { const c = CACHE.get(keyOf(route, params)); if (c && Date.now() - c.t < freshFor(route)) return; load(route, params).catch(() => {}) }
// state machine shared by every panel: {status: "loading"|"ok"|"error", data, meta, error}
export function useData(route, params, { enabled = true, refresh = 0 } = {}) {
  const key = keyOf(route, params), hit = CACHE.get(key), [s, set] = useState(hit ? { status: "ok", data: hit.data, meta: hit.meta } : { status: "loading" }), force = useRef(false), [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return; let dead = false, f = force.current; force.current = false
    const c = CACHE.get(key)
    if (c) { set({ status: "ok", data: c.data, meta: c.meta }); if (!f && Date.now() - c.t < freshFor(route)) return; set((p) => ({ ...p, refreshing: true })) }   // cached: show it now, refresh behind it
    else set({ status: "loading" })
    load(route, params).then((c2) => !dead && set({ status: "ok", data: c2.data, meta: c2.meta })).catch((e) => !dead && set((p) => (p.status === "ok" && c ? { ...p, refreshing: false, stale: true } : { status: "error", error: e.message, attempts: e.attempts, code: e.code })))
    return () => { dead = true }
  }, [key, enabled, n])
  useEffect(() => { if (!refresh) return; const tickF = () => { if (!document.hidden) { force.current = true; setN((x) => x + 1) } }, i = setInterval(tickF, refresh); document.addEventListener("visibilitychange", tickF); return () => { clearInterval(i); document.removeEventListener("visibilitychange", tickF) } }, [refresh])
  const reload = useCallback(() => { force.current = true; setN((x) => x + 1) }, [])
  return { ...s, reload }
}
