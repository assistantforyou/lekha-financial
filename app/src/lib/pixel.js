// Thin wrapper over window.ptTrack / window.ptTrackCustom (public/pt-meta-pixel.js). Parameters are plan, route and step
// names only, never user data: Meta prohibits financial and personal data (tickers, search text, holdings, e-mail addresses).

/* First-touch attribution: the UTM tags and click id the visitor arrived with, kept for the browser so a signup or purchase days later
   can still be tied to the ad. Written once; a later visit with new tags does not overwrite it. */
const AK = "ptpub.v1.attr"
const clean = (v) => String(v == null ? "" : v).replace(/[^\w .:\-+]/g, "").slice(0, 60)
export function captureAttribution() {
  try {
    if (localStorage.getItem(AK)) return
    const q = new URLSearchParams(location.search), a = {}
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) if (q.get(k)) a[k] = clean(q.get(k))
    if (q.get("fbclid")) a.fbclid = "1"                                   // only that one was present; the pixel itself reads the id
    if (Object.keys(a).length) localStorage.setItem(AK, JSON.stringify({ ...a, at: new Date().toISOString().slice(0, 10) }))
  } catch (e) {}
}
const attribution = () => { try { const a = JSON.parse(localStorage.getItem(AK) || "null"); if (!a) return {}; const { at, fbclid, ...rest } = a; return rest } catch (e) { return {} } }

export const track = (name, params, onceKey) => { try { window.ptTrack && window.ptTrack(name, { ...attribution(), ...(params || {}) }, onceKey) } catch (e) {} }
// Non-standard event names (AskAnalyst, ...) have to go through trackCustom or Meta drops them.
export const trackCustom = (name, params, onceKey) => { try { window.ptTrackCustom && window.ptTrackCustom(name, { ...attribution(), ...(params || {}) }, onceKey) } catch (e) {} }
export const planParams = (plan) => { try { return window.ptPlanValue ? window.ptPlanValue(plan) : null } catch (e) { return null } }

/* The funnel: custom events from the tour, the tools and the signup wall. Only these names and these parameters can leave the browser. */
const FUNNEL = new Set(["TourStart", "TourStep", "TourComplete", "TourSkip", "SimRun", "StressRun", "RotationScrub", "ValuationAdjust", "AnswerSeen", "WallShown", "WallClick", "PlansViewed"])
const PARAMS = { step: /^[a-z]{1,16}$/, platform: /^(mobile|desktop)$/, action: /^[a-z]{1,16}$/, count: /^\d{1,3}$/, from: /^(tour|site)$/ }
export function funnel(name, params = {}, { session = false } = {}) {
  if (!FUNNEL.has(name)) return
  const p = {}; for (const k of Object.keys(PARAMS)) if (params[k] != null && PARAMS[k].test(String(params[k]))) p[k] = params[k]
  if (session) { try { const k = "ptpub.v1.fx." + name; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1") } catch (e) {} }   // at most once per browser session
  trackCustom(name, p)
}
/* One listener for the tools, so they are counted wherever they are used, in the tour or on the site. */
export function watchTools() {
  const t = (e) => { const c = e.target && e.target.closest ? e.target : null; if (!c) return
    if (e.type === "click") { if (c.closest("#sim-go")) funnel("SimRun"); else if (c.closest("#ai-sim-run")) funnel("StressRun") }
    else if (c.closest("#rrg-asof")) funnel("RotationScrub", {}, { session: true })
    else if (c.closest("#dcf-growth, #dcf-discount, #dcf-terminalGrowth")) funnel("ValuationAdjust", {}, { session: true }) }
  for (const ev of ["click", "input", "change"]) document.addEventListener(ev, t, true)
}
