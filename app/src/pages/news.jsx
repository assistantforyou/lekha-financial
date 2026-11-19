import { useEffect, useState } from "react"
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
  const s = useData("news", { symbol: applied.sym, q: applied.text, category: cat, limit: 40 })
  return (<div><PageHeader title={item.title} description={item.desc} />
    <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setApplied({ sym: sym.trim().toUpperCase(), text: text.trim() }) }}>
      <Input className="w-32" value={sym} onChange={(e) => setSym(e.target.value)} placeholder="Ticker" aria-label="Ticker" /><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder="Keyword (merger, tariffs, guidance…)" aria-label="Keyword" /></div><Button type="submit">Search</Button></form>
    <div className="mb-3 flex flex-wrap gap-1.5">{CATS.map(([k, l]) => <button key={k} onClick={() => setCat(k)} className={cn("rounded-full border px-3 py-1 text-xs", cat === k ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>
    <Card><CardContent className="pt-4"><DataState s={s} empty="No headlines found.">{s.status === "ok" && <><div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{s.data.length} stories{applied.sym ? ` for ${applied.sym}` : " across the market"}</span><SourceTag meta={s.meta} /></div><NewsList items={s.data} /></>}</DataState></CardContent></Card>
  </div>)
}
