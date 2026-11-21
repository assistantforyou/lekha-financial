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
/* The banner used to be a one-liner ("Yield curve is not inverted · real fed funds -0.20%") with no explanation. This says what both numbers are, what today's values mean, and links to the history behind them. */
function Backdrop({ d, open }) {
  const inv = d.derived.inverted, real = d.derived.realFedFunds, by = Object.fromEntries(d.series.map((x) => [x.id, x])), spread = by.T10Y2Y && by.T10Y2Y.latest ? by.T10Y2Y.latest.value : null, ff = by.FEDFUNDS && by.FEDFUNDS.latest ? by.FEDFUNDS.latest.value : null, cpi = by.CPIAUCSL && by.CPIAUCSL.latest ? by.CPIAUCSL.latest.value : null
  const realTxt = real == null ? null : real > 0.005 ? "positive: the Fed's rate is above inflation, so money is expensive in real terms and policy is squeezing the economy (restrictive)." : real < -0.005 ? "negative: the Fed's rate is below inflation, so borrowing is cheap in real terms and policy is not holding the economy back (accommodative)." : "about zero: the Fed's rate roughly matches inflation, a neutral stance."
  return (<div className={"rounded-xl border p-4 text-[13.5px] " + (inv ? "border-[color-mix(in_srgb,var(--warn)_50%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)]" : "border-[color-mix(in_srgb,var(--up)_40%,var(--border))] bg-[color-mix(in_srgb,var(--up)_7%,transparent)]")}>
    <div className="text-sm font-semibold">Where the economy stands: {inv ? "the yield curve is inverted" : "the yield curve is not inverted"}{real != null ? `, real policy rate ${pct(real, 2, true)}` : ""}</div>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div><div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Yield curve{spread != null ? ` · ${spread >= 0 ? "+" : ""}${spread.toFixed(2)} points` : ""}</div>
        <p>The yield curve is the 10-year Treasury yield minus the 2-year yield. Normally lenders want more for tying money up longer, so the gap is positive. When it goes negative (inverted), the bond market is betting rates will fall because growth is expected to weaken; an inversion has come before most past US recessions, usually 6 to 24 months ahead, but it is a warning light, not a timer. {spread != null ? (inv ? `Today it is ${spread.toFixed(2)}: inverted.` : `Today it is +${spread.toFixed(2)}: the normal shape, so that particular warning is off.`) : ""}</p>
        <button className="mt-1 inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => open("T10Y2Y")}>See the spread history<ChevronRight className="size-3.5" /></button></div>
      <div><div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Real fed funds rate{real != null ? ` · ${pct(real, 2, true)}` : ""}</div>
        <p>The real rate is the Fed's policy rate minus inflation (CPI, year over year){ff != null && cpi != null ? `: ${ff.toFixed(2)}% minus ${(cpi * 100).toFixed(2)}%` : ""}. It shows how tight policy really is once rising prices are taken out. {realTxt ? `Today it is ${realTxt}` : ""} It is calculated by the app from the two series below.</p>
        <span className="mt-1 inline-flex gap-3"><button className="inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => open("FEDFUNDS")}>Fed funds history<ChevronRight className="size-3.5" /></button><button className="inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => open("CPIAUCSL")}>Inflation history<ChevronRight className="size-3.5" /></button></span></div></div>
    <p className="mt-3 text-[11.5px] text-muted-foreground">Click any card below for its full history, statistics and what it means. The AI research agent reads this same data through its macro tool. A description of conditions, not advice.</p></div>)
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
