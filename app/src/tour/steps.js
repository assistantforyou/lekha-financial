/* The tour: a short walk through the app and two advanced tools, on the sample portfolio. Every target is an element the app really
   renders; nothing here is a mock-up. The visitor does the thing and the tool answers.

   Step fields
     target     functions tried in order; the first that returns a visible element wins. A step whose targets are all missing is skipped.
     hash       route to open (a function is allowed); none keeps the current page. A hash with ?tab= must match exactly.
     act        true = live: the app stays usable, nothing is dimmed or blocked, a ring marks the real control. The step never advances by itself.
     arm        optional: called when a live step is ready; prepares the page and returns { done, off }. done() reports that the visitor tried the control; it only changes the card's wording (hint -> hintDone). The tour never runs a tool for the visitor.
     hint       the ui string shown under the title (default "act").
     retarget   re-resolve the target on every measure (the ring follows a control that appears or moves).
     pill/skipTo  the AI step shrinks to one line while the visitor asks; skipTo is the step id its Next jumps to.
     quiet      no target, no dim: a small card beside the page.
     where      show where the page lives in the navigation. */
const byId = (id) => document.getElementById(id)
const sel = (s) => () => document.querySelector(s)
export const EXAMPLE = "AAPL"

export const currentPath = () => location.hash.replace(/^#\/?/, "").split("?")[0]
export const fullPath = () => location.hash.replace(/^#\/?/, "")
let LAST = EXAMPLE
/* the company the tour is on (the example, or the one the visitor opened) */
export const lastSym = () => { const m = currentPath().match(/^company\/([^/]+)/); if (m) LAST = decodeURIComponent(m[1]).toUpperCase(); return LAST }
export const hashOf = (step) => (typeof step.hash === "function" ? step.hash() : step.hash)

export function visible(el) {
  if (!el || !el.isConnected) return false
  const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false
  const s = getComputedStyle(el); return s.visibility !== "hidden" && s.display !== "none"
}
const seen = (s) => () => { const e = document.querySelector(s); return visible(e) ? e : null }

/* "did the visitor do it" signals. Each listens in the capture phase so the app's own handlers cannot hide the event. */
const listen = (types, within) => {
  let hit = false; const on = (e) => { if (e.target && e.target.closest && e.target.closest(within)) hit = true }
  types.forEach((t) => document.addEventListener(t, on, true))
  return { done: () => hit, off: () => types.forEach((t) => document.removeEventListener(t, on, true)) }
}
const SCEN = '[aria-label="Scenario"]'

/* Monte Carlo: the page auto-runs 100K paths (about 10 s on a phone), which would leave the visitor staring at a progress bar.
   Clear that run, choose 10K paths and leave the tool empty; the visitor then presses Run simulation themselves. */
const armSim = () => {
  const l = listen(["click"], "#sim-go"), kpi = () => { const e = document.querySelector("#sim-out .sim-kpis"); return e ? e.textContent : "" }
  const reset = () => {
    const api = window.LEKHA_SIM
    if (api && typeof api.resetForTour === "function") { api.resetForTour({ hz: "1Y", paths: 10000 }); return }
    const stop = byId("sim-stop"); if (stop && visible(stop)) stop.click()
    const n = document.querySelector('#sim-n [data-n="10000"]'); if (n && n.getAttribute("aria-pressed") !== "true") n.click()
  }
  reset()
  const base = kpi()
  let tries = 0
  const i = setInterval(() => { if (l.done() || ++tries > 20) return clearInterval(i); reset() }, 250)
  return { done: () => l.done() && !!kpi() && kpi() !== base, off: () => { clearInterval(i); l.off() } }
}
/* Stress test: the visitor presses Run simulation; done when the scenario table has been drawn after the press. */
const armStress = () => {
  const l = listen(["click"], "#ai-sim-run"); let changes = 0; const o = byId("ai-simout"), mo = new MutationObserver(() => { changes++ }); if (o) mo.observe(o, { childList: true, subtree: true, characterData: true })
  return { done: () => l.done() && changes > 0 && !!document.querySelector("#ai-simout table"), off: () => { l.off(); mo.disconnect() } }
}
const armDcf = () => listen(["click", "input", "change"], SCEN + ", #dcf-growth, #dcf-discount, #dcf-terminalGrowth")

/* Ten steps, the same on every screen size: orient (search, menu, portfolio), try two tools, see what a valuation is, meet the analyst, then a clear next step.
   Nothing blocks on the visitor: each step has Next, and trying a tool only changes the wording of the card. */
const welcome = { id: "welcome", hash: "portfolio/overview", ready: () => !!byId("kpis") }
const search = { id: "search", hash: "portfolio/overview", target: [sel('[data-tour="search"]'), sel('[data-tour="search-icon"]')], act: true, hint: "hintSearch" }
const nav = { id: "nav", hash: "portfolio/overview", target: [sel('[data-tour="nav"]'), sel('[data-tour="menu"]')], prefer: ["right"], act: true, hint: "hintNav" }
const summary = { id: "summary", where: true, hash: "portfolio/overview", target: [() => byId("kpis")] }
const sim = { id: "sim", hash: "simulation/main", target: [seen("#sim-go")], retarget: true, act: true, hint: "hintSim", hintDone: "hintSimDone", arm: armSim }
const stress = { id: "stress", hash: "analysis/stress", target: [seen("#ai-sim-run")], retarget: true, act: true, hint: "hintStress", hintDone: "hintStressDone", arm: armStress }
const dcf = { id: "dcf", hash: "company/" + EXAMPLE + "?tab=valuation", target: [seen(SCEN), seen("#dcf-growth")], act: true, hint: "hintDcf", hintDone: "hintTried", arm: armDcf }
const ask = { id: "ask", hash: () => "company/" + lastSym() + "?tab=ai", target: [sel('[data-tour="ask-box"]')], act: true, hint: "tryit", pill: true, skipTo: "finish" }
const answer = { id: "answer", quiet: true }
const finish = { id: "finish", hash: "portfolio/overview", ready: () => !!byId("kpis") }

export const STEPS_DESKTOP = [welcome, search, nav, summary, sim, stress, dcf, ask, answer, finish]
export const STEPS_MOBILE = STEPS_DESKTOP.slice()
export const STEPS = STEPS_DESKTOP.slice()
/* chosen when the tour starts; the array is replaced in place so every importer keeps the same reference */
export const setPlatform = () => { STEPS.splice(0, STEPS.length, ...STEPS_DESKTOP) }

/* -> { el, alt } | { el: null } for a targeted step; { el: null, none: true } when a target-less step is ready */
export function resolve(step) {
  if (!step.target) return { el: null, none: true, ok: !step.ready || step.ready() }
  for (let i = 0; i < step.target.length; i++) { let e = null; try { e = step.target[i]() } catch (x) {} if (visible(e)) return { el: e, alt: i > 0, ok: !step.ready || step.ready(e) } }
  return { el: null, ok: false }
}
export const isAct = (step, alt) => !!step && !!step.act && (step.act !== "alt" || !!alt)
/* card: explains, dims and blocks. coach: a compact card and a pulsing ring while the visitor does the thing, nothing dimmed or blocked. quiet: a small card beside the page, nothing dimmed. */
export const modeOf = (step, alt) => (step.quiet ? "quiet" : isAct(step, alt) ? "coach" : "card")
