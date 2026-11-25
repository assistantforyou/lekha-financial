/* The eleven steps. Every target is an element the app really renders; nothing here is a mock-up.
   target: functions tried in order; the first one that returns a visible element wins. A match after the first one
   (a different layout at a narrower width, or an empty portfolio) switches the step to its alternative copy (`a`).
   A step with no target is a centred card. A step whose targets are all missing is skipped, never shown broken.
   interactive: the app stays live inside the highlighted element (the visitor does the thing), everything outside it is still blocked. */
const byId = (id) => document.getElementById(id)
const sel = (s) => () => document.querySelector(s)
const panelOf = (id) => () => { const e = byId(id); return e && e.closest("section") }
export const EXAMPLE = "AAPL"

export const STEPS = [
  { id: "welcome", hash: "portfolio/overview", ready: () => !!byId("kpis") },
  { id: "search", hash: "portfolio/overview", target: [sel('[data-tour="search"]'), sel('[data-tour="search-icon"]')] },
  { id: "nav", hash: "portfolio/overview", target: [sel('[data-tour="nav"]'), sel('[data-tour="menu"]')], prefer: ["right"] },
  { id: "summary", where: true, hash: "portfolio/overview", target: [() => byId("kpis")] },
  { id: "performance", where: true, hash: "portfolio/overview", target: [panelOf("pf-chart")] },
  { id: "holdings", where: true, hash: "portfolio/holdings", target: [panelOf("tbl"), panelOf("ph-form")] },
  { id: "company", where: true, hash: "company/" + EXAMPLE, target: [sel('[data-tour="company-head"]')] },
  { id: "tabs", where: true, hash: "company/" + EXAMPLE, target: [sel('[data-tour="company-tabs"]')] },
  { id: "ask", interactive: true, where: true, hash: "research/agent", target: [sel('[data-tour="ask"]')] },
  { id: "discover", where: true, hash: "sector/now", target: [() => byId("rot-sum"), sel('section[aria-labelledby="locked-title"]')] },   // Free and demo: the Paid lock screen
  { id: "finish", hash: "portfolio/overview", ready: () => !!byId("kpis") },
]

export function visible(el) {
  if (!el || !el.isConnected) return false
  const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false
  const s = getComputedStyle(el); return s.visibility !== "hidden" && s.display !== "none"
}
/* -> { el, alt } | { el: null } for a targeted step; { el: null, none: true } when a target-less step is ready */
export function resolve(step) {
  if (!step.target) return { el: null, none: true, ok: !step.ready || step.ready() }
  for (let i = 0; i < step.target.length; i++) { let e = null; try { e = step.target[i]() } catch (x) {} if (visible(e)) return { el: e, alt: i > 0, ok: !step.ready || step.ready(e) } }
  return { el: null, ok: false }
}
export const currentPath = () => location.hash.replace(/^#\/?/, "").split("?")[0]
