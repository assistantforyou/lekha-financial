/* The tour steps. Every target is an element the app really renders; nothing here is a mock-up.
   target: functions tried in order; the first one that returns a visible element wins. A match after the first one
   (a different layout at a narrower width, or an empty portfolio) switches the step to its alternative copy (`a`).
   A step with no target is a centred card. A step whose targets are all missing is skipped, never shown broken.

   Hands-on steps. act: true makes the step interactive: the app stays live inside the highlighted element (the visitor
   does the thing), everything outside it is still blocked, and the tour moves on by itself when done() turns true
   (it must be false when the step opens, so a step the visitor reaches with Back never fires on its own). act: "alt"
   is interactive only when the second target matched (a phone, where the menu button stands in for the sidebar).
   back() returns to the previous step when the visitor backs out (closes the search box without choosing).
   retarget: true re-resolves the target on every measure (the highlight follows a link that appears after a click).
   pill: the step shrinks to one line while the visitor asks (ask step only); skipTo: the step id its Next jumps to. quiet: no target, no dim.
   hint: the ui string shown under the copy (default "act"). hash: route to open (functions allowed); none keeps the current page. */
const byId = (id) => document.getElementById(id)
const sel = (s) => () => document.querySelector(s)
const panelOf = (id) => () => { const e = byId(id); return e && e.closest("section") }
export const EXAMPLE = "AAPL"

export const currentPath = () => location.hash.replace(/^#\/?/, "").split("?")[0]
export const fullPath = () => location.hash.replace(/^#\/?/, "")
export const tabNow = () => { const m = location.hash.match(/[?&]tab=([^&]+)/); return m ? decodeURIComponent(m[1]) : "overview" }
let LAST = EXAMPLE
/* the company the visitor opened (or the example, until they open one) */
export const lastSym = () => { const m = currentPath().match(/^company\/([^/]+)/); if (m) LAST = decodeURIComponent(m[1]).toUpperCase(); return LAST }
export const hashOf = (step) => (typeof step.hash === "function" ? step.hash() : step.hash)

const paletteOpen = () => !!document.querySelector("[cmdk-input]")
const paletteBox = () => { const i = document.querySelector("[cmdk-input]"); return i && i.closest('[role="dialog"]') }
const HOLD = 'a[href="#/portfolio/holdings"]'
const holdLink = () => document.querySelector('[role="dialog"] ' + HOLD) || document.querySelector(".shell aside " + HOLD)
/* the link when its group is open, otherwise the group heading that opens it */
const holdTarget = () => holdLink() || [...document.querySelectorAll('.shell aside button, [role="dialog"] button')].find((b) => /my portfolio/i.test(b.textContent || ""))

export const STEPS = [
  { id: "welcome", hash: "portfolio/overview", ready: () => !!byId("kpis") },
  { id: "summary", where: true, hash: "portfolio/overview", target: [() => byId("kpis")] },
  { id: "performance", where: true, hash: "portfolio/overview", target: [panelOf("pf-chart")] },
  { id: "search", hash: "portfolio/overview", target: [sel('[data-tour="search"]'), sel('[data-tour="search-icon"]')], act: true, done: paletteOpen },
  { id: "pick", target: [paletteBox], act: true, done: () => /^company\//.test(currentPath()), back: () => !paletteOpen() && !/^company\//.test(currentPath()) },
  { id: "company", where: true, hash: () => "company/" + lastSym(), target: [sel('[data-tour="company-head"]')] },
  { id: "tabs", where: true, hash: () => "company/" + lastSym(), target: [sel('[data-tour="company-tabs"]')], act: true, done: () => tabNow() !== "overview" },
  { id: "askai", hash: () => "company/" + lastSym(), target: [sel('[data-tour="ask-ai"]')], act: true, done: () => tabNow() === "ai" },
  { id: "ask", hash: () => "company/" + lastSym() + "?tab=ai", target: [sel('[data-tour="ask-box"]')], act: true, hint: "tryit", pill: true, skipTo: "nav" },
  { id: "answer", quiet: true },
  { id: "nav", target: [sel('[data-tour="nav"]'), sel('[data-tour="menu"]')], prefer: ["right"], act: "alt", done: () => !!document.querySelector('[role="dialog"] nav[aria-label="Main navigation"]') },
  { id: "gohold", target: [holdTarget], act: true, retarget: true, nav: true, done: () => currentPath() === "portfolio/holdings" },
  { id: "holdings", where: true, hash: "portfolio/holdings", target: [panelOf("tbl"), panelOf("ph-form")] },
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
export const isAct = (step, alt) => !!step && !!step.act && (step.act !== "alt" || !!alt)
/* card: explains, dims and blocks. coach: a compact card and a pulsing ring while the visitor does the thing, nothing dimmed or blocked. quiet: a small card beside the page, nothing dimmed. */
export const modeOf = (step, alt) => (step.quiet ? "quiet" : isAct(step, alt) ? "coach" : "card")
