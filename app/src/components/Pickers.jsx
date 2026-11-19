import { useEffect, useMemo, useState } from "react"
import { Check, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/* Theme picker: the 100 editor-style themes + LEKHA Teal / Navy / Light, with live preview. Reads and writes through the classic engine (PT_THEMES / PT_UI) so both stay in step. */
export function ThemeDialog({ open, onOpenChange }) {
  const T = window.PT_THEMES, [q, setQ] = useState(""), [cur, setCur] = useState("lekha-teal")
  useEffect(() => { if (open) { setQ(""); try { setCur((window.PT_UI && PT_UI.getPref("theme")) || "lekha-teal") } catch (e) {} } }, [open])
  const items = useMemo(() => {
    if (!T) return []
    const lekha = T.THEMES.filter((t) => /^lekha-/.test(t.id)).map((t) => ({ id: t.id, name: t.name, group: "LEKHA", c: [t.c.bg, t.c.panel, t.c.accent, t.c.green] }))
    const rest = T.THEMES.filter((t) => !/^lekha-/.test(t.id)).map((t) => ({ id: t.id, name: t.name, group: t.kind === "dark" ? "Dark themes" : "Light themes", c: [t.c.bg, t.c.panel, t.c.accent, t.c.green] }))
    return [...lekha, ...rest]
  }, [T])
  const ql = q.trim().toLowerCase(), shown = items.filter((i) => !ql || i.name.toLowerCase().includes(ql) || i.id.includes(ql))
  const pick = (id) => { try { PT_UI.setPref("theme", id) } catch (e) {} setCur(id); T && T.label && T.label() }
  const preview = (id) => { try { T.apply(id, { preview: true }) } catch (e) {} }
  const restore = () => { try { T.apply(cur, { preview: true }) } catch (e) {} }
  const groups = [...new Set(shown.map((i) => i.group))]
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) restore(); onOpenChange(v) }}>
      <DialogContent className="max-w-md" onPointerLeave={restore}>
        <DialogHeader><DialogTitle>Color theme</DialogTitle><DialogDescription>{items.length} themes. Hover to preview, click to apply. Applies to the whole app and syncs to your account.</DialogDescription></DialogHeader>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search themes…" className="pl-8" /></div>
        <div className="max-h-[46dvh] overflow-y-auto pr-1">
          {groups.map((g) => <div key={g}><div className="sticky top-0 bg-popover px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</div>
            {shown.filter((i) => i.group === g).map((i) => <button key={i.id} onMouseEnter={() => preview(i.id)} onFocus={() => preview(i.id)} onClick={() => { pick(i.id); onOpenChange(false) }} className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent", cur === i.id && "font-semibold")}>
              <span className="flex gap-0.5">{i.c.map((c, k) => <i key={k} className="size-3 rounded-full border border-black/20" style={{ background: c }} />)}</span><span className="min-w-0 flex-1 truncate">{i.name}</span>{cur === i.id && <Check className="size-4 text-primary" />}</button>)}</div>)}
          {!shown.length && <p className="py-6 text-center text-sm text-muted-foreground">No theme matches.</p>}
        </div>
      </DialogContent>
    </Dialog>)
}
export function LangDialog({ open, onOpenChange }) {
  const I = window.PT_I18N, langs = I ? I.LANGS : [], cur = I ? I.lang : "en"
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Language</DialogTitle><DialogDescription>Changes every label and the language the AI analyst answers in. Live headlines and filings stay in their original language.</DialogDescription></DialogHeader>
        <div className="grid gap-1">{langs.map((l) => <button key={l.code} onClick={() => { onOpenChange(false); if (l.code !== cur) I.setLang(l.code) }} className={cn("flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent notranslate", l.code === cur && "bg-accent font-semibold")} translate="no">{l.native}{l.code === cur && <Check className="size-4 text-primary" />}</button>)}</div>
      </DialogContent>
    </Dialog>)
}
