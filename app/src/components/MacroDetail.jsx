import { useMemo, useState } from "react"
import { Bot, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DataState, LineChart, SourceTag, Stat } from "@/components/common"
import { useData } from "@/lib/api"
import { date, num, pct, tone } from "@/lib/fmt"

export const fmtMacro = (s, v) => (v == null ? "–" : s.unit === "fraction" ? pct(v, 2) : s.unit === "percent" ? `${num(v)}%` : s.unit === "claims" ? Math.round(v).toLocaleString("en-US") : s.unit.startsWith("thousands") ? `${Math.round(v).toLocaleString("en-US")}k` : num(v))
// difference between two values, in the series' own units (percentage points for rates, plain for levels)
const fmtDelta = (s, d) => (d == null ? "–" : (d > 0 ? "+" : d < 0 ? "−" : "") + (s.unit === "fraction" ? `${Math.abs(d * 100).toFixed(2)} pts` : s.unit === "percent" ? `${Math.abs(d).toFixed(2)} pts` : s.unit === "claims" ? Math.abs(Math.round(d)).toLocaleString("en-US") : s.unit.startsWith("thousands") ? `${Math.abs(Math.round(d)).toLocaleString("en-US")}k` : num(Math.abs(d))))

/* What each series is, why a portfolio cares, and (where the level itself carries a signal) how to read today's value. Written for a non-specialist. */
export const MEANING = {
  FEDFUNDS: { what: "The interest rate banks charge each other overnight. The Federal Reserve steers it, and it sets the floor for every other rate in the economy.", why: "Higher rates make borrowing and bonds more expensive or more attractive, which pulls down the value of future profits. Stocks (especially growth stocks) usually struggle when it rises quickly and rally when cuts arrive.", read: (v, r) => `${v.toFixed(2)}% is ${r.rank >= 0.66 ? "high" : r.rank <= 0.33 ? "low" : "middling"} compared with the last ${r.span}.` },
  DGS3MO: { what: "What the US government pays to borrow for 3 months. It moves almost one for one with expectations for the Fed's next decisions.", why: "It is the 'risk-free' cash rate. When it is above what stocks seem to offer, money market funds compete with equities for cash." },
  DGS2: { what: "The yield on a 2-year Treasury note. It reflects where the market thinks the Fed will take rates over the next two years.", why: "A falling 2-year yield means traders expect rate cuts (often because growth is weakening); a rising one means they expect rates to stay high." },
  DGS10: { what: "The yield on a 10-year Treasury note, the benchmark long-term interest rate.", why: "Mortgage rates, corporate borrowing costs and the discount rate used to value stocks all key off it. A fast rise is a headwind for valuations.", read: (v, r) => `${v.toFixed(2)}% is ${r.rank >= 0.66 ? "near the top" : r.rank <= 0.33 ? "near the bottom" : "mid-range"} of its ${r.span} range.` },
  DGS30: { what: "The yield on a 30-year Treasury bond, the longest-term government borrowing rate.", why: "It shows how much return investors demand for locking money up for decades, which reflects long-run inflation and debt worries." },
  T10Y2Y: { what: "The 10-year Treasury yield minus the 2-year yield, known as the yield curve. Normally it is positive: lending for longer pays more.", why: "When it turns negative (the curve 'inverts'), short rates exceed long rates. That has come before most US recessions, usually by 6 to 24 months, though the timing and the strength of the signal vary.", read: (v) => (v < 0 ? `At ${v.toFixed(2)} points the curve is inverted: short-term rates are above long-term rates.` : `At +${v.toFixed(2)} points the curve is not inverted: long-term rates are above short-term rates, the normal shape.`) },
  MORTGAGE30US: { what: "The average rate on a 30-year fixed mortgage, from Freddie Mac's weekly survey.", why: "It drives housing affordability and demand, and through it home builders, banks, furniture and building materials." },
  CPIAUCSL: { what: "Consumer prices for a broad basket of goods and services, as the percentage change from a year earlier.", why: "Inflation erodes what money buys and decides how long the Fed keeps rates high. Hot inflation prints tend to hit stocks and bonds; cooling ones help.", read: (v) => (v > 0.04 ? "Well above the Fed's 2% goal." : v > 0.025 ? "Above the Fed's 2% goal." : v >= 0.015 ? "Close to the Fed's 2% goal." : "Below the Fed's 2% goal.") },
  CPILFESL: { what: "The same consumer price measure with food and energy removed, because those swing wildly month to month.", why: "It shows the underlying trend in inflation, which is what the Fed watches most closely." },
  PCEPILFE: { what: "Core PCE prices, the Fed's own preferred inflation gauge (it adjusts for how people change what they buy).", why: "The Fed's 2% target is defined on PCE, so this is the number that decides policy." },
  PPIACO: { what: "Prices producers receive for commodities and goods, as the change from a year earlier.", why: "It leads consumer prices: rising input costs get passed on to shoppers, or squeeze company profit margins if they cannot." },
  UNRATE: { what: "The share of people looking for work who cannot find it.", why: "A very low rate means a tight job market that can push wages and inflation up; a quick rise is one of the surest recession warnings.", read: (v) => (v < 4.2 ? "A tight job market." : v < 5 ? "A healthy job market." : "A weakening job market.") },
  PAYEMS: { what: "How many jobs the US economy added or lost in the month (change in nonfarm payrolls), in thousands.", why: "It is the first read on the economy each month. Strong numbers support earnings but can keep rates high; weak ones raise recession fears." },
  ICSA: { what: "How many people filed for unemployment benefits for the first time that week.", why: "It is the fastest-moving labor indicator, published weekly. A sustained jump often shows layoffs starting." },
  GDPC1: { what: "Growth in the total output of the US economy, adjusted for inflation, versus a year earlier.", why: "It sets the backdrop for corporate sales and earnings. Two quarters of contraction is the common rule of thumb for a recession." },
  UMCSENT: { what: "A survey of how households feel about their finances and the economy.", why: "Consumer spending is about two thirds of the US economy, so a slump in confidence can foreshadow weaker spending." },
  M2SL: { what: "Growth in the broad money supply (cash, bank deposits and money market funds) versus a year earlier.", why: "Fast growth adds liquidity that can fuel asset prices and later inflation; shrinking M2 is rare and has accompanied tight money." },
  VIXCLS: { what: "The market's expected volatility of the S&P 500 over the next 30 days, often called the fear index.", why: "It jumps when investors rush for protection. Readings above about 30 mean stress; below about 15 means calm, sometimes complacency.", read: (v) => (v >= 30 ? "High fear." : v >= 20 ? "Elevated nervousness." : v >= 15 ? "Normal." : "Very calm.") },
}
const ord = (n) => { const k = n % 100, r = k >= 11 && k <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"); return n + r }
const LOOK = { daily: 126, weekly: 26, monthly: 6, quarterly: 2 }
const RANGES = [["1Y", 1], ["3Y", 3], ["5Y", 5], ["Max", 25]]
const PER_YEAR = { daily: 260, weekly: 52, monthly: 12, quarterly: 4 }

function stats(s, pts) {
  const v = pts.map((p) => p[1]).filter((x) => x != null); if (!v.length) return null
  let hi = pts[0], lo = pts[0]; for (const p of pts) { if (p[1] > hi[1]) hi = p; if (p[1] < lo[1]) lo = p }
  const last = pts[pts.length - 1][1], avg = v.reduce((a, b) => a + b, 0) / v.length, rank = (v.filter((x) => x <= last).length - 1) / Math.max(1, v.length - 1)
  const back = pts[Math.max(0, pts.length - 1 - (LOOK[s.frequency] || 6))]
  return { hi, lo, avg, rank, last, back, n: v.length }
}

export default function MacroDetail({ series, onClose, navigate }) {
  const [range, setRange] = useState("5Y"), s = series, longer = range === "Max"
  const full = useData("macro", { id: s ? s.id : "", years: 25 }, { enabled: !!s && longer })
  const base = s ? (longer && full.status === "ok" && full.data ? full.data.points : s.points) : []
  const yrs = (RANGES.find((r) => r[0] === range) || RANGES[2])[1]
  const pts = useMemo(() => (s ? (longer ? base : base.slice(-Math.round(yrs * (PER_YEAR[s.frequency] || 12)))) : []), [s, base, yrs, longer])
  const st = useMemo(() => (s && pts.length ? stats(s, pts) : null), [s, pts])
  if (!s) return null
  const m = MEANING[s.id], spanTxt = longer ? `${Math.round(pts.length / (PER_YEAR[s.frequency] || 12))} years of data` : `${yrs} year${yrs > 1 ? "s" : ""}`
  const delta = s.latest && s.previous ? s.latest.value - s.previous.value : null, sinceBack = st ? st.last - st.back[1] : null
  const readTxt = m && m.read && st ? m.read(st.last, { rank: st.rank, span: spanTxt }) : null
  const recent = [...pts].slice(-12).reverse()
  return (<Dialog open onOpenChange={(v) => !v && onClose()}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
    <DialogHeader><DialogTitle className="pr-6">{s.name}</DialogTitle>
      <DialogDescription className="flex flex-wrap items-center gap-2"><Badge variant="outline">{s.frequency}</Badge><span>latest <b className="num text-foreground">{fmtMacro(s, s.latest && s.latest.value)}</b> on {s.latest && date(s.latest.date)}</span>{delta != null && <span className={tone(delta)}>{fmtDelta(s, delta)} vs previous release</span>}</DialogDescription></DialogHeader>
    {m && <div className="grid gap-3 text-[13.5px] sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-3"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">What it is</div>{m.what}</div>
      <div className="rounded-lg border border-border bg-card p-3"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Why it matters to a portfolio</div>{m.why}</div></div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Chart range">{RANGES.map(([k]) => <button key={k} type="button" onClick={() => setRange(k)} aria-pressed={range === k} className={"rounded px-2.5 py-1 text-xs " + (range === k ? "bg-accent font-semibold" : "text-muted-foreground hover:text-foreground")}>{k}</button>)}</div>
      <span className="text-xs text-muted-foreground">{longer && full.status === "loading" ? "Loading the longer history…" : longer && full.status === "error" ? "Could not load the longer history; showing what is loaded." : `${pts.length} observations over ${spanTxt}`}</span></div>
    {pts.length > 1 ? <LineChart points={pts} height={300} format={(v) => fmtMacro(s, v)} xLabel={(x) => date(x)} ref0={s.unit !== "index" && s.unit !== "claims" && pts.some((p) => p[1] < 0) ? 0 : undefined} /> : <p className="text-sm text-muted-foreground">Not enough observations in this range.</p>}
    {st && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <Stat label="Latest" value={fmtMacro(s, st.last)} sub={s.latest && date(s.latest.date)} />
      <Stat label={`Change over ~${LOOK[s.frequency] || 6} ${s.frequency === "daily" ? "trading days" : s.frequency === "weekly" ? "weeks" : s.frequency === "monthly" ? "months" : "quarters"}`} value={fmtDelta(s, sinceBack)} tone={tone(sinceBack)} sub={`from ${fmtMacro(s, st.back[1])}`} />
      <Stat label="High in range" value={fmtMacro(s, st.hi[1])} sub={date(st.hi[0])} /><Stat label="Low in range" value={fmtMacro(s, st.lo[1])} sub={date(st.lo[0])} />
      <Stat label="Average in range" value={fmtMacro(s, st.avg)} sub={`latest is ${st.last >= st.avg ? "above" : "below"} it`} /><Stat label="Percentile in range" value={ord(Math.round(st.rank * 100))} hint="Share of observations in this range at or below the latest value. 90th means higher than 90% of the period." sub={st.rank >= 0.8 ? "near the top" : st.rank <= 0.2 ? "near the bottom" : "mid-range"} />
      <Stat label="Distance from the high" value={fmtDelta(s, st.last - st.hi[1])} tone={tone(st.last - st.hi[1])} sub="latest minus range high" /></div>}
    {(readTxt || st) && <div className="rounded-lg border border-border bg-card p-3 text-[13.5px]"><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reading today's value</div>
      {readTxt && <p>{readTxt}</p>}{st && <p className="text-muted-foreground">Over the last ~{LOOK[s.frequency] || 6} {s.frequency === "daily" ? "trading days" : s.frequency === "weekly" ? "weeks" : s.frequency === "monthly" ? "months" : "quarters"} it has {Math.abs(sinceBack) < 1e-9 ? "not changed" : sinceBack > 0 ? "risen" : "fallen"} by {fmtDelta(s, Math.abs(sinceBack)).replace(/^[+−]/, "")}, and sits at the {ord(Math.round(st.rank * 100))} percentile of the {spanTxt}.</p>}
      <p className="mt-1 text-[11.5px] text-muted-foreground">A description of the data, not a forecast or advice.</p></div>}
    {recent.length > 0 && <details className="rounded-lg border border-border bg-card p-3 text-[13px]"><summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent observations ({recent.length})</summary>
      <table className="mt-2 w-full"><thead><tr className="text-left text-[11px] text-muted-foreground"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">Value</th><th className="py-1 text-right font-medium">Change</th></tr></thead><tbody>{recent.map((p, i) => { const prev = recent[i + 1]; const d = prev ? p[1] - prev[1] : null; return <tr key={p[0]} className="border-t border-border"><td className="py-1">{date(p[0])}</td><td className="num py-1 text-right">{fmtMacro(s, p[1])}</td><td className={"num py-1 text-right " + tone(d)}>{d == null ? "–" : fmtDelta(s, d)}</td></tr> })}</tbody></table></details>}
    <div className="flex flex-wrap items-center justify-between gap-2"><SourceTag meta={s.meta} />
      <div className="flex gap-2"><Button size="sm" variant="outline" asChild><a href={`https://fred.stlouisfed.org/series/${s.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink />Open on FRED</a></Button>
        <Button size="sm" onClick={() => { onClose(); navigate("research/agent?q=" + encodeURIComponent(`Explain the latest ${s.name} reading and what it means for my portfolio and the market.`)) }}><Bot />Ask the AI about this</Button></div></div>
  </DialogContent></Dialog>)
}
