import { useEffect, useRef, useState } from "react"
import { HelpCircle, X } from "lucide-react"
import { HELP } from "@/lib/help"

// Screen help lives in a corner so it never takes layout space: a small question mark in the
// bottom-left (bottom-right belongs to notifications) that opens a short note on demand.
export default function PageHelp({ routeKey }) {
  const h = HELP[routeKey]
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const btn = useRef(null)

  useEffect(() => { setOpen(false) }, [routeKey])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); try { btn.current && btn.current.focus() } catch (err) { /* ignore */ } } }
    const onClick = (e) => {
      if (box.current && box.current.contains(e.target)) return
      if (btn.current && btn.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClick)
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick) }
  }, [open])

  if (!h) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 print:hidden">
      {open && (
        <div ref={box} role="dialog" aria-label="How to use this screen" className="pointer-events-auto mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-[var(--panel)] p-3 shadow-lg">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">What this screen is</div>
              <p className="mt-1 text-[13px] leading-relaxed">{h.what}</p>
              <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
                {h.dos.map((d) => <li key={d} className="flex gap-1.5"><span aria-hidden="true" className="text-primary">-</span><span>{d}</span></li>)}
              </ul>
            </div>
            <button type="button" className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close help" onClick={() => setOpen(false)}>
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
      <button
        ref={btn}
        type="button"
        aria-label={h.what}
        aria-expanded={open}
        title="What this screen is"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-border bg-[var(--panel)] text-muted-foreground shadow-sm transition-colors hover:text-foreground"
      >
        <HelpCircle className="size-4" />
      </button>
    </div>
  )
}
