import { useState } from "react"
import { HelpCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HELP } from "@/lib/help"

const store = (key) => `ptpub.v1.help.${key}`

// A short "what is this screen" note shown the first time someone opens a section, then collapsed to a Guide button.
export default function PageHelp({ routeKey }) {
  const h = HELP[routeKey]
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(store(routeKey)) !== "seen" } catch (e) { return true }
  })
  if (!h) return null
  const seen = () => { try { localStorage.setItem(store(routeKey), "seen") } catch (e) { /* private mode */ } }
  const close = () => { setOpen(false); seen() }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground">
        <HelpCircle className="size-3.5" /> Guide
      </button>
    )
  }
  return (
    <section className="mb-3 rounded-lg border border-border bg-[var(--panel)] px-4 py-3" aria-label="How to use this screen">
      <div className="flex items-start gap-3">
        <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">What this screen is</div>
          <p className="mt-1 text-[13.5px] leading-relaxed">{h.what}</p>
          <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {h.dos.map((d) => <li key={d} className="flex gap-2"><span aria-hidden="true" className="text-primary">-</span><span>{d}</span></li>)}
          </ul>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Hide this guide" onClick={close}><X className="size-3.5" /></Button>
      </div>
    </section>
  )
}
