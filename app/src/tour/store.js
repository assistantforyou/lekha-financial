/* Onboarding state: not_started | in_progress | completed | skipped.
   Kept in localStorage (ptpub.v1.app.tour). Once finished it is also written into the account preferences
   (PT_UI.setPref, the same path theme and language use), so a signed-in user is not toured again on another device. */
const KEY = "ptpub.v1.app.tour", ROUTE_KEY = "ptpub.v1.app.route", EVT = "lekha:tour"
export const STATES = ["not_started", "in_progress", "completed", "skipped"]
const done = (s) => s === "completed" || s === "skipped"

/* Evaluated at import time, before the shell renders and records its first route: true only in a browser that has never opened the app. */
export const FRESH_BROWSER = (() => { try { return localStorage.getItem(ROUTE_KEY) === null } catch (e) { return false } })()

const local = () => { try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); return j && STATES.includes(j.status) ? j.status : null } catch (e) { return null } }
const account = () => { try { const t = window.PT_UI && window.PT_UI.getPref("tour"); return t && STATES.includes(t.status) ? t.status : null } catch (e) { return null } }
export function readStatus() { const l = local(), a = account(); if (done(l)) return l; if (done(a)) return a; return l || "not_started" }
export function writeStatus(status) {
  const rec = { v: 1, status, at: new Date().toISOString() }
  try { localStorage.setItem(KEY, JSON.stringify(rec)) } catch (e) {}
  if (done(status)) { try { window.PT_UI && window.PT_UI.setPref("tour", rec) } catch (e) {} }
}
/* The tour starts on its own for a brand-new browser, or resumes if it was interrupted; everyone else replays it on request. */
export const shouldAutoStart = () => { const s = readStatus(); return s === "in_progress" || (s === "not_started" && FRESH_BROWSER) }
export const startTour = (delay = 0) => setTimeout(() => window.dispatchEvent(new CustomEvent(EVT)), delay)
export const onStartTour = (fn) => { window.addEventListener(EVT, fn); return () => window.removeEventListener(EVT, fn) }
