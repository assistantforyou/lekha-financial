import { useEffect, useState } from "react"
import { COPY } from "./langprompt-copy"
import { TOURLANG, announceDone, offer, writeAnswer } from "../lib/langprompt"
import { funnel } from "../lib/pixel"

/* First-visit language prompt: when the browser prefers a language we ship and the page is English, ask once, in that language, whether to switch.
   Never switches on its own. Relative imports and plain inline styles so the same component works in the app and in the login bundle (different aliases and CSS). */
const S = {
  bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", padding: "8px 14px", fontSize: 13, lineHeight: 1.4, color: "var(--fg, var(--foreground, #e6edf3))", background: "var(--panel-2, var(--muted, #151b22))", borderBottom: "1px solid var(--line, var(--border, #2a3340))" },
  text: { flex: "1 1 220px", minWidth: 0, fontWeight: 500 },
  row: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" },
  yes: { font: "inherit", fontWeight: 600, height: 32, padding: "0 14px", borderRadius: 8, border: "1px solid var(--accent, var(--primary, #5eead4))", background: "var(--accent, var(--primary, #5eead4))", color: "var(--accent-fg, var(--primary-foreground, #06231f))", cursor: "pointer" },
  no: { font: "inherit", height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--line, var(--border, #2a3340))", background: "transparent", color: "inherit", cursor: "pointer" },
}

export default function LangPrompt() {
  const [code, setCode] = useState(null), [busy, setBusy] = useState(false)
  useEffect(() => {
    // the i18n script and the account preferences can land a moment after first paint, so look again once before giving up
    const look = () => { const c = offer(); if (c) { setCode(c); funnel("LangPromptShown", { lang: c }, { session: true }) } return !!c }
    if (look()) return
    const t = setTimeout(look, 1200); return () => clearTimeout(t)
  }, [])
  if (!code) return null
  const c = COPY[code]
  const accept = () => {
    setBusy(true)
    writeAnswer("accepted", code)
    try { localStorage.setItem(TOURLANG, code) } catch (e) {}                 // the tour keeps its own language choice; follow the page
    funnel("LangPromptAccepted", { lang: code })
    try { window.PT_I18N.setLang(code) } catch (e) { setBusy(false) }          // saves the preference and reloads shortly after
  }
  const dismiss = () => { writeAnswer("dismissed", code); funnel("LangPromptDismissed", { lang: code }); setCode(null); announceDone() }
  return (
    <div role="region" aria-label={c.title} lang={code} translate="no" className="notranslate" data-testid="lang-prompt" style={S.bar}>
      <span style={S.text}>{c.title}</span>
      <span style={S.row}>
        <button type="button" onClick={accept} disabled={busy} style={{ ...S.yes, opacity: busy ? 0.7 : 1 }}>{busy ? c.busy : c.yes}</button>
        <button type="button" onClick={dismiss} disabled={busy} style={S.no} aria-label={c.close}>{c.no}</button>
      </span>
    </div>)
}
