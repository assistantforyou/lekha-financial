import { useState } from "react"
import { Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DataState, LineChart, PageHeader, SourceTag, Spark } from "@/components/common"
import { useData } from "@/lib/api"
import { date, num, pct } from "@/lib/fmt"
import { cn } from "@/lib/utils"

const fmt = (s, v) => (v == null ? "–" : s.unit === "fraction" ? pct(v, 2) : s.unit === "percent" ? `${num(v)}%` : s.unit === "claims" ? Math.round(v).toLocaleString("en-US") : s.unit.startsWith("thousands") ? `${Math.round(v).toLocaleString("en-US")}k` : num(v))
export default function MacroPage({ item, navigate }) {
  const s = useData("macro", {}), [open, setOpen] = useState(null)
  const d = s.data, series = d ? d.series : []
  return (<div><PageHeader title={item.title} description={item.desc}><Button onClick={() => navigate("research/agent?q=" + encodeURIComponent("What is the macro backdrop: rates, inflation, jobs and the yield curve?"))}><Bot />Ask AI about this</Button></PageHeader>
    <DataState s={s} rows={6}>{d && <div className="space-y-6">
      {d.derived && d.derived.inverted != null && <Alert variant={d.derived.inverted ? "warn" : "success"}><div><AlertTitle>Yield curve is {d.derived.inverted ? "inverted" : "not inverted"}{d.derived.realFedFunds != null ? ` · real fed funds ${pct(d.derived.realFedFunds, 2, true)}` : ""}</AlertTitle><AlertDescription>{d.derived.note} The AI analyst reads this same data through its macro tool.</AlertDescription></div></Alert>}
      {d.groups.map((g) => <section key={g}><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{series.filter((x) => x.group === g).map((x) => { const delta = x.latest && x.previous ? x.latest.value - x.previous.value : null; return (
          <button key={x.id} onClick={() => setOpen(x)} className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none">
            <div className="flex items-start justify-between gap-2"><div className="text-[12.5px] text-muted-foreground">{x.name}</div><Badge variant="outline">{x.frequency}</Badge></div>
            <div className="mt-1 flex items-end justify-between gap-2"><div><div className="num text-2xl font-semibold">{fmt(x, x.latest && x.latest.value)}</div><div className="text-[11px] text-muted-foreground">{x.latest ? date(x.latest.date) : ""}{delta != null ? ` · prev ${fmt(x, x.previous.value)}` : ""}</div></div><Spark points={x.points.slice(-36)} up={null} w={110} h={34} /></div></button>) })}</div></section>)}
      <p className="text-[11.5px] text-muted-foreground">Source: FRED (Federal Reserve Bank of St. Louis). Inflation, M2 and GDP are shown as year-over-year change calculated by the app; payrolls as month-over-month change. Consumer sentiment © University of Michigan. Data are revised by their publishers.</p></div>}</DataState>
    <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}><DialogContent className="max-w-2xl">{open && <><DialogHeader><DialogTitle>{open.name}</DialogTitle><DialogDescription>{open.frequency} · {open.unit} · latest {fmt(open, open.latest && open.latest.value)} on {open.latest && date(open.latest.date)}</DialogDescription></DialogHeader><LineChart points={open.points.slice(-120)} format={(v) => fmt(open, v)} xLabel={(x) => date(x)} /><SourceTag meta={open.meta} /></>}</DialogContent></Dialog>
  </div>)
}
