import { useEffect, useRef, useState, useCallback } from "react"
// Every financial datum on screen comes through /api/data (the unified FinancialDataService). The UI never sees provider schemas.
export async function api(path, { method = "GET", body, auth = false, signal } = {}) {
  const headers = {}; if (body) headers["Content-Type"] = "application/json"
  if (auth && window.PT_AUTH) { const t = await window.PT_AUTH.token(); if (t) headers.Authorization = "Bearer " + t }
  const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status, code: j.code, attempts: j.attempts, body: j })
  return j
}
export const data = (route, params = {}) => { const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")); return api(`/api/data/${route}${q.toString() ? "?" + q : ""}`, { auth: true }) }
// state machine shared by every panel: {status: "loading"|"ok"|"error", data, meta, error}
export function useData(route, params, { enabled = true, refresh = 0 } = {}) {
  const key = route + JSON.stringify(params || {}), [s, set] = useState({ status: "loading" }), tick = useRef(0), [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return; let dead = false; set((p) => (p.status === "ok" ? { ...p, refreshing: true } : { status: "loading" }))
    data(route, params).then((j) => !dead && set({ status: "ok", data: j.data, meta: j.meta })).catch((e) => !dead && set({ status: "error", error: e.message, attempts: e.attempts, code: e.code }))
    return () => { dead = true }
  }, [key, enabled, n])
  useEffect(() => { if (!refresh) return; const i = setInterval(() => setN((x) => x + 1), refresh); return () => clearInterval(i) }, [refresh])
  const reload = useCallback(() => setN((x) => x + 1), [])
  return { ...s, reload }
}
