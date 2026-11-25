import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { DataState, PageHeader, SourceTag } from "@/components/common"
import { NewsList } from "@/pages/company"
import { useData } from "@/lib/api"
import { cn } from "@/lib/utils"

const CATS = [["", "All"], ["earnings", "Earnings"], ["m&a", "M&A"], ["regulatory", "Regulatory"], ["macro", "Macro"]]
export default function NewsPage({ item, route, navigate }) {
  const [sym, setSym] = useState(""), [text, setText] = useState(route.query ? route.query.get("q") || "" : ""), [cat, setCat] = useState(""), [applied, setApplied] = useState({ sym: "", text: route.query ? route.query.get("q") || "" : "" })
  const [outlet, setOutlet] = useState("")
  /* The feed fans out to several publishers, so it waits until this card is on screen and the page has painted,
     then stays fresh for ten minutes. Searching arms it immediately. */
  const [armed, setArmed] = useState(() => !!(route.query && route.query.get("q")))
  const wrap = useRef(null)
  useEffect(() => {
    if (armed || !wrap.current) return
    if (typeof IntersectionObserver !== "function") { setArmed(true); return }
    let t = 0
    const io = new IntersectionObserver((rows) => {
      if (!rows.some((r) => r.isIntersecting)) return
      io.disconnect(); t = setTimeout(() => setArmed(true), 700)
    }, { rootMargin: "200px" })
    io.observe(wrap.current)
    return () => { io.disconnect(); clearTimeout(t) }
  }, [armed])
  const s = useData("news", { symbol: applied.sym, q: applied.text, category: cat, limit: 150 }, { enabled: armed, refresh: 600000 })
  const outlets = useMemo(() => { const m = {}; if (s.status === "ok" && Array.isArray(s.data)) s.data.forEach((n) => { const p = n.publisher || n.source; if (p) m[p] = (m[p] || 0) + 1 }); return Object.entries(m).sort((a, b) => b[1] - a[1]) }, [s.status, s.data])
  const shown = useMemo(() => (s.status === "ok" && Array.isArray(s.data) ? s.data.filter((n) => !outlet || (n.publisher || n.source) === outlet) : []), [s.status, s.data, outlet])
  return (<div ref={wrap}><PageHeader title={item.title} description={item.desc} />
    <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setArmed(true); setApplied({ sym: sym.trim().toUpperCase(), text: text.trim() }) }}>
      <Input className="w-32" value={sym} onChange={(e) => setSym(e.target.value)} placeholder="Ticker" aria-label="Ticker" /><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder="Keyword (merger, tariffs, guidance…)" aria-label="Keyword" /></div><Button type="submit">Search</Button></form>
    <div className="mb-3 flex flex-wrap gap-1.5">{CATS.map(([k, l]) => <button key={k} onClick={() => { setArmed(true); setCat(k) }} className={cn("rounded-full border px-3 py-1 text-xs", cat === k ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>
    <Card><CardContent className="pt-4"><DataState s={armed ? s : { status: "loading" }} empty="No headlines found.">{s.status === "ok" && <><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{shown.length} stories from {outlet ? outlet : `${outlets.length} outlets`}{applied.sym ? ` for ${applied.sym}` : " across the market"}</span>
        <span className="flex items-center gap-2"><label className="flex items-center gap-1">Outlet<select value={outlet} onChange={(e) => setOutlet(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground" aria-label="Filter by outlet"><option value="">All outlets</option>{outlets.map(([p, n]) => <option key={p} value={p}>{p} ({n})</option>)}</select></label><SourceTag meta={s.meta} /></span></div><NewsList items={shown} /></>}</DataState></CardContent></Card>
  </div>)
}
