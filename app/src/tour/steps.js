/* The tour: a short walk through the app and two advanced tools, on the sample portfolio. Every target is an element the app really
   renders; nothing here is a mock-up. The visitor does the thing and the tool answers.

   Step fields
     target     functions tried in order; the first that returns a visible element wins. A step whose targets are all missing is skipped.
     hash       route to open (a function is allowed); none keeps the current page. A hash with ?tab= must match exactly.
     act        true = live: the app stays usable, nothing is dimmed or blocked, a ring marks the real control. The step never advances by itself.
     run        optional: the tour runs the tool itself once the step is ready; returns { done, off } (done() = the result is on the page).
     try        optional: a listener factory ({ done, off }) that reports the visitor tried the control; it only changes the card's wording.
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
  let hit = false; const on = (e) => { if (e.isTrusted !== false && e.target && e.target.closest && e.target.closest(within)) hit = true }
  types.forEach((t) => document.addEventListener(t, on, true))
  return { done: () => hit, off: () => types.forEach((t) => document.removeEventListener(t, on, true)) }
}
const adjusted = (within) => () => listen(["input", "change", "pointerup"], within)

/* Demonstrations: the tour runs the tool itself on the sample portfolio, so nobody has to find a button to see what it does.
   run() starts the work once the step is on screen; it returns { done, off } where done() reports that the result is on the page. */
const runSim = () => {
  const kpi = () => { const e = document.querySelector("#sim-out .sim-kpis"); return e ? e.textContent : "" }, base = kpi(), t0 = performance.now()
  let off = false, started = false, cut = false, timer = 0
  const tick = () => {
    if (off) return
    const stop = byId("sim-stop"), running = !!stop && visible(stop)
    if (running && !started) { stop.click(); cut = true }                                  // the page starts its own 100K run: stop it, a 10K run answers in about a second
    const n = document.querySelector('#sim-n [data-n="10000"]'), on = !!n && (n.classList.contains("on") || n.getAttribute("aria-pressed") === "true")
    if (n && !on && !started) n.click()
    const go = byId("sim-go")
    if (!started && !running && on && go && visible(go) && (cut || performance.now() - t0 > 2200)) { started = true; go.click() }
    timer = setTimeout(tick, 300)
  }
  tick()
  return { done: () => started && !!kpi() && kpi() !== base, off: () => { off = true; clearTimeout(timer) } }
}
const runStress = () => {
  let off = false, started = false, changes = 0, timer = 0; const mo = new MutationObserver(() => { changes++ })
  const tick = () => { if (off) return; const b = byId("ai-sim-run"), o = byId("ai-simout"); if (b && o && visible(b) && !b.disabled) { started = true; mo.observe(o, { childList: true, subtree: true, characterData: true }); setTimeout(() => { if (!off) b.click() }, 250) } else timer = setTimeout(tick, 200) }
  tick()
  return { done: () => started && changes > 0 && !!document.querySelector("#ai-simout table"), off: () => { off = true; clearTimeout(timer); mo.disconnect() } }
}

/* Ten steps, the same on every screen size: orient (search, menu, portfolio), watch two tools work, try one, meet the analyst, then a clear next step.
   Nothing blocks on the visitor: each step has Next, and the tools run themselves. */
const welcome = { id: "welcome", hash: "portfolio/overview", ready: () => !!byId("kpis") }
const search = { id: "search", hash: "portfolio/overview", target: [sel('[data-tour="search"]'), sel('[data-tour="search-icon"]')] }
const nav = { id: "nav", hash: "portfolio/overview", target: [sel('[data-tour="nav"]'), sel('[data-tour="menu"]')], prefer: ["right"] }
const summary = { id: "summary", where: true, hash: "portfolio/overview", target: [() => byId("kpis")] }
const sim = { id: "sim", hash: "simulation/main", target: [seen("#sim-out .sim-kpis"), seen("#sim-out"), seen("#sim-go")], retarget: true, act: true, hint: "hintSim", run: runSim }
const stress = { id: "stress", hash: "analysis/stress", target: [seen("#ai-simout table"), seen("#ai-sim-run")], retarget: true, act: true, hint: "hintStress", run: runStress }
/* the one hands-on step that is entirely optional: Next is always there, and trying it only changes the wording */
const dcf = { id: "dcf", hash: "company/" + EXAMPLE + "?tab=valuation", target: [seen("#dcf-growth"), seen("#dcf-discount")], act: true, hint: "hintDcf", try: adjusted("#dcf-growth, #dcf-discount, #dcf-terminalGrowth") }
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
