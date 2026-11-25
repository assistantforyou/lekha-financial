/* State and rules for the first-visit language prompt (the component is app/src/components/LangPrompt.jsx).
   One answer per visitor: stored in this browser (ptpub.v1.app.langprompt) and mirrored into the account preferences, so a second device or the
   sign-in preference overwrite (lekha-ui.js loadMe) does not ask again. No imports, so the login bundle and the tour can both use it. */
import { promptLang } from "./langdetect"

export const KEY = "ptpub.v1.app.langprompt", DONE = "lekha:langprompt-done", TOURLANG = "ptpub.v1.app.tourlang", TOUR = "ptpub.v1.app.tour"
const ls = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null") } catch (e) { return null } }
const pref = (k) => { try { return window.PT_UI && window.PT_UI.getPref ? window.PT_UI.getPref(k) : undefined } catch (e) { return undefined } }

export const readAnswer = () => { const l = ls(KEY); return l && (l.a === "accepted" || l.a === "dismissed") ? l : null }
export function writeAnswer(a, lang) {
  const rec = { v: 1, a, lang, at: new Date().toISOString().slice(0, 10) }
  try { localStorage.setItem(KEY, JSON.stringify(rec)) } catch (e) {}
  try { window.PT_UI && window.PT_UI.setPref && window.PT_UI.setPref("langPrompt", rec) } catch (e) {}
}

/* the language to offer right now, or null (also null when the prompt must not show) */
export function offer() {
  try {
    const I = window.PT_I18N; if (!I || I.lang !== "en") return null                       // already non-English, or the i18n script is missing
    if (navigator.webdriver) return null                                                  // automation and crawlers
    if (readAnswer()) return null
    const p = pref("langPrompt"); if (p && (p.a === "accepted" || p.a === "dismissed")) return null
    // a language the visitor (or their account, synced into the same key) actually chose. PT_UI.getPref("lang") cannot be used here: it returns the default "en" when nothing was chosen.
    const stored = ls("ptpub.v1.prefs"); if (stored && stored.lang) return null
    const t = ls(TOUR); if (t && t.status === "in_progress") return null                  // never over a running tour
    return promptLang(navigator.languages && navigator.languages.length ? Array.from(navigator.languages) : navigator.language ? [navigator.language] : [])
  } catch (e) { return null }
}

/* the Quick Tour waits for the answer, then starts */
export const pending = () => offer() != null
export const announceDone = () => { try { window.dispatchEvent(new CustomEvent(DONE)) } catch (e) {} }
