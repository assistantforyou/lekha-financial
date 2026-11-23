import { useState } from "react"
import { Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import MacroDetail, { fmtMacro } from "@/components/MacroDetail"
import { ChevronRight } from "lucide-react"
import { DataState, PageHeader, Spark } from "@/components/common"
import { useData } from "@/lib/api"
import { date, num, pct } from "@/lib/fmt"
import { cn } from "@/lib/utils"

const fmt = fmtMacro
/* Two numbers, one line each. The long explanations live in the MacroDetail dialog behind every card. */
function Backdrop({ d, open }) {
  const inv = d.derived.inverted, real = d.derived.realFedFunds, by = Object.fromEntries(d.series.map((x) => [x.id, x])), spread = by.T10Y2Y && by.T10Y2Y.latest ? by.T10Y2Y.latest.value : null, ff = by.FEDFUNDS && by.FEDFUNDS.latest ? by.FEDFUNDS.latest.value : null, cpi = by.CPIAUCSL && by.CPIAUCSL.latest ? by.CPIAUCSL.latest.value : null
  const line = (real == null ? "" : real > 0.005 ? "Restrictive: the Fed's rate is above inflation." : real < -0.005 ? "Accommodative: the Fed's rate is below inflation." : "Neutral: the Fed's rate is level with inflation.")
  return (<div className={"rounded-xl border p-4 " + (inv ? "border-[color-mix(in_srgb,var(--warn)_50%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]" : "border-[color-mix(in_srgb,var(--up)_40%,var(--border))] bg-[color-mix(in_srgb,var(--up)_7%,transparent)]")}>
    <div className="grid gap-4 md:grid-cols-2">
      <div><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Yield curve</div>
        <div className="mt-0.5 flex items-baseline gap-2"><span className="num text-xl font-semibold">{spread == null ? "–" : (spread >= 0 ? "+" : "") + spread.toFixed(2)}</span><span className="text-xs text-muted-foreground">10y minus 2y</span></div>
        <p className="mt-0.5 text-[13px]">{inv ? "Inverted. The bond market expects weaker growth." : "Positive. Normal shape; the recession signal is off."}</p>
        <button className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary hover:underline" onClick={() => open("T10Y2Y")}>History<ChevronRight className="size-3.5" /></button></div>
      <div><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Real fed funds rate</div>
        <div className="mt-0.5 flex items-baseline gap-2"><span className="num text-xl font-semibold">{real == null ? "–" : pct(real, 2, true)}</span><span className="text-xs text-muted-foreground">{ff != null && cpi != null ? `${ff.toFixed(2)}% less ${(cpi * 100).toFixed(2)}% inflation` : "policy rate less inflation"}</span></div>
        <p className="mt-0.5 text-[13px]">{line}</p>
        <span className="mt-1 inline-flex gap-3"><button className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline" onClick={() => open("FEDFUNDS")}>Policy rate<ChevronRight className="size-3.5" /></button><button className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline" onClick={() => open("CPIAUCSL")}>Inflation<ChevronRight className="size-3.5" /></button></span></div></div>
    <p className="mt-3 text-[11px] text-muted-foreground">Open any card for its history and definition. Not advice.</p></div>)
}
export default function MacroPage({ item, navigate }) {
  const s = useData("macro", {}), [open, setOpen] = useState(null)
  const d = s.data, series = d ? d.series : []
  return (<div><PageHeader title={item.title} description={item.desc}><Button onClick={() => navigate("research/agent?q=" + encodeURIComponent("What is the macro backdrop: rates, inflation, jobs and the yield curve?"))}><Bot />Ask AI about this</Button></PageHeader>
    <DataState s={s} rows={6}>{d && <div className="space-y-6">
      {d.derived && d.derived.inverted != null && <Backdrop d={d} open={(id) => setOpen(series.find((x) => x.id === id) || null)} />}
      {d.groups.map((g) => <section key={g}><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{series.filter((x) => x.group === g).map((x) => { const delta = x.latest && x.previous ? x.latest.value - x.previous.value : null; return (
          <button key={x.id} onClick={() => setOpen(x)} className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none">
            <div className="flex items-start justify-between gap-2"><div className="text-[12.5px] text-muted-foreground">{x.name}</div><Badge variant="outline">{x.frequency}</Badge></div>
            <div className="mt-1 flex items-end justify-between gap-2"><div><div className="num text-2xl font-semibold">{fmt(x, x.latest && x.latest.value)}</div><div className="text-[11px] text-muted-foreground">{x.latest ? date(x.latest.date) : ""}{delta != null ? ` · prev ${fmt(x, x.previous.value)}` : ""}</div></div><Spark points={x.points.slice(-36)} up={null} w={110} h={34} /></div></button>) })}</div></section>)}
      <p className="text-[11.5px] text-muted-foreground">Source: FRED (Federal Reserve Bank of St. Louis). Inflation, M2 and GDP are shown as year-over-year change calculated by the app; payrolls as month-over-month change. Consumer sentiment © University of Michigan. Data are revised by their publishers.</p></div>}</DataState>
    {open && <MacroDetail series={open} onClose={() => setOpen(null)} navigate={navigate} />}
  </div>)
}
