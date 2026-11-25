/* The tour: a short, hands-on showcase of the advanced tools, on the sample portfolio. Every target is an element the app really
   renders; nothing here is a mock-up. The visitor does the thing and the tool answers.

   Step fields
     target     functions tried in order; the first that returns a visible element wins. A step whose targets are all missing is skipped.
     hash       route to open (a function is allowed); none keeps the current page. A hash with ?tab= must match exactly.
     act        true = hands-on: the app stays live, nothing is dimmed or blocked, a ring pulses on the real control and the step
                moves on by itself when done() turns true. done() must be false when the step opens.
     arm        optional: called when a hands-on step is ready; prepares the page (so the payoff is fast) and returns
                { done, off } where done() reports that the visitor did the thing and off() removes any listeners.
     settle     ms to linger on the payoff after the visitor acts, before the next step (default 700).
     hint       the ui string shown under the title (default "act").
     retarget   re-resolve the target on every measure (the ring follows a control that appears or moves).
     pill/skipTo  the AI step shrinks to one line while the visitor asks; skipTo is the step id its Next jumps to.
     quiet      no target, no dim: a small card beside the page.
     back()     returns to the previous step when the visitor backs out. */
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
const clicked = (within) => () => listen(["click"], within)
const adjusted = (within) => () => listen(["input", "change", "pointerup"], within)

/* Monte Carlo: the page auto-runs 100K paths (about 10 s on a phone), which would leave the visitor staring at a progress bar.
   Stop that run and choose 10K paths (about a second), then ask the visitor to press Run and watch the fan chart and KPIs appear. */
const armSim = () => {
  const l = listen(["click"], "#sim-go"), kpi = () => { const e = document.querySelector("#sim-out .sim-kpis"); return e ? e.textContent : "" }
  let base = kpi(), t0 = performance.now()
  const prep = () => { const stop = byId("sim-stop"); if (stop && visible(stop)) stop.click(); const n = document.querySelector('#sim-n [data-n="10000"]'); if (n && !n.classList.contains("on") && n.getAttribute("aria-pressed") !== "true" && !l.done()) n.click() }
  prep(); const i = setInterval(() => { if (performance.now() - t0 > 4000 || l.done()) return clearInterval(i); prep() }, 450)
  return { done: () => l.done() && !!kpi() && kpi() !== base, off: () => { clearInterval(i); l.off() } }
}

const welcome = { id: "welcome", hash: "portfolio/overview", ready: () => !!byId("kpis") }
const sim = { id: "sim", hash: "simulation/main", target: [seen("#sim-go"), seen("#sim-hz")], retarget: true, act: true, hint: "hintSim", settle: 2600, arm: armSim }
const stress = { id: "stress", hash: "analysis/stress", target: [seen("#ai-sim-run")], act: true, hint: "hintStress", settle: 2600, arm: clicked("#ai-sim-run") }
const rrg = { id: "rrg", hash: "sector/now", target: [seen("#rrg-asof")], act: true, hint: "hintRrg", settle: 1800, arm: adjusted("#rrg-asof") }
const dcf = { id: "dcf", hash: "company/" + EXAMPLE + "?tab=valuation", target: [seen("#dcf-growth"), seen("#dcf-discount")], act: true, hint: "hintDcf", settle: 2200, arm: adjusted("#dcf-growth, #dcf-discount, #dcf-terminalGrowth") }
const ask = { id: "ask", hash: () => "company/" + lastSym() + "?tab=ai", target: [sel('[data-tour="ask-box"]')], act: true, hint: "tryit", pill: true, skipTo: "finish" }
const answer = { id: "answer", quiet: true }
const finish = { id: "finish", hash: "portfolio/overview", ready: () => !!byId("kpis") }

export const STEPS_DESKTOP = [welcome, sim, stress, rrg, dcf, ask, answer, finish]
/* phones: the rotation graph and the 900 px fan chart are cramped at 390 px, so the phone tour keeps the tools that read well on a small screen */
export const STEPS_MOBILE = [welcome, sim, stress, dcf, ask, answer, finish]
export const STEPS = STEPS_DESKTOP.slice()
/* chosen when the tour starts; the array is replaced in place so every importer keeps the same reference */
export const setPlatform = () => { let m = false; try { m = matchMedia("(max-width: 640px)").matches } catch (e) {} STEPS.splice(0, STEPS.length, ...(m ? STEPS_MOBILE : STEPS_DESKTOP)) }

/* -> { el, alt } | { el: null } for a targeted step; { el: null, none: true } when a target-less step is ready */
export function resolve(step) {
  if (!step.target) return { el: null, none: true, ok: !step.ready || step.ready() }
  for (let i = 0; i < step.target.length; i++) { let e = null; try { e = step.target[i]() } catch (x) {} if (visible(e)) return { el: e, alt: i > 0, ok: !step.ready || step.ready(e) } }
  return { el: null, ok: false }
}
export const isAct = (step, alt) => !!step && !!step.act && (step.act !== "alt" || !!alt)
/* card: explains, dims and blocks. coach: a compact card and a pulsing ring while the visitor does the thing, nothing dimmed or blocked. quiet: a small card beside the page, nothing dimmed. */
export const modeOf = (step, alt) => (step.quiet ? "quiet" : isAct(step, alt) ? "coach" : "card")
