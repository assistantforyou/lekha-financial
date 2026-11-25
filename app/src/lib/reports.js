// Saved research reports. Kept in this browser for everyone, and mirrored to the account store when signed in.
import { api } from "./api"
import { session } from "./engine"

const LKEY = "ptpub.v1.reports"
const MAX = 40

const signedIn = () => { const s = session(); return !!(s && s.access_token) }

function readLocal() {
  try { const v = JSON.parse(localStorage.getItem(LKEY) || "[]"); return Array.isArray(v) ? v : [] } catch (e) { return [] }
}
function writeLocal(list) {
  try { localStorage.setItem(LKEY, JSON.stringify(list.slice(0, MAX))) } catch (e) { /* quota or private mode */ }
}

export function localReports() { return readLocal() }

export async function loadReports() {
  const local = readLocal()
  if (!signedIn()) return local
  try {
    const j = await api("/api/state", { auth: true })
    const server = (j.docs || [])
      .filter((d) => /^reports\//.test(d.key) && d.data && typeof d.data === "object")
      .map((d) => ({ ...d.data, id: d.data.id || d.key.slice(8) }))
    const seen = new Set(server.map((r) => r.id))
    return [...server, ...local.filter((r) => !seen.has(r.id))].sort((a, b) => String(b.at).localeCompare(String(a.at)))
  } catch (e) { return local }
}

export async function saveReport(report) {
  if (!report || !report.id) return
  const list = readLocal().filter((r) => r.id !== report.id)
  list.unshift(report)
  writeLocal(list)
  if (!signedIn()) return
  try {
    await api("/api/state", { method: "POST", auth: true, body: { docs: [{ key: `reports/${report.id}`, data: report }] } })
  } catch (e) { /* the browser copy is already saved */ }
}

export async function removeReport(id) {
  writeLocal(readLocal().filter((r) => r.id !== id))
  if (!signedIn()) return
  try { await api(`/api/state?key=${encodeURIComponent(`reports/${id}`)}`, { method: "DELETE", auth: true }) } catch (e) { /* ignore */ }
}

export const newReportId = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
