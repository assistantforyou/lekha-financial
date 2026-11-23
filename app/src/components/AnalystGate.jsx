import { ArrowRight, Lock, Newspaper, ShieldAlert, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DataState, ErrorBox } from "@/components/common"
import AgentPanel from "@/components/AgentPanel"
import { useData } from "@/lib/api"
import { compact, date, num, pct, tone } from "@/lib/fmt"
import { cn } from "@/lib/utils"

const TIER = { free: "Free", paid: "Paid" }
const PREMIUM = "฿599/month"

/* The three analyst screens (Ask, Daily briefing, Stress test) used to show ONE identical "go Premium" panel to Free and Paid users.
   Each now says what it is, what Premium adds, and gives something real that works on the user's current plan. */
function Banner({ tier, what, navigate }) {
  return (<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
    <Lock className="size-5 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1 text-[13.5px]"><div className="font-medium">{what}</div><div className="text-muted-foreground">Premium feature · you are on the {TIER[tier] || tier} plan. Premium is {PREMIUM}.</div></div>
    <Button onClick={() => navigate("account/plans")}>See plans<ArrowRight /></Button></div>)
}

function Ask({ tier, navigate }) {
  return (<div className="space-y-4">
    <Banner tier={tier} what="Ask the analyst answers questions about YOUR portfolio: positions, weights, P&L, concentration and drawdown." navigate={navigate} />
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />Ask the research agent now, included in your plan</CardTitle><CardDescription>It answers questions about any company, the market and the economy from live quotes, filings, news and macro data, with every figure cited. Suggested questions below come from today's market{tier ? " and your holdings" : ""}.</CardDescription></CardHeader>
      <CardContent><AgentPanel /></CardContent></Card></div>)
}

function Brief({ tier, navigate }) {
  const mv = useData("movers", {}, { refresh: 180000 }), mac = useData("macro", {}), news = useData("news", { limit: 8 }, { refresh: 300000 })
  const m = mv.status === "ok" ? mv.data : null, by = mac.status === "ok" && mac.data ? Object.fromEntries(mac.data.series.map((x) => [x.id, x])) : {}, v = (id) => (by[id] && by[id].latest ? by[id].latest.value : null)
  const read = [["VIX", v("VIXCLS"), (x) => num(x, 1)], ["10-year yield", v("DGS10"), (x) => `${num(x)}%`], ["Yield curve 10y−2y", v("T10Y2Y"), (x) => `${x >= 0 ? "+" : ""}${num(x)} pts`], ["Inflation (CPI y/y)", v("CPIAUCSL"), (x) => pct(x, 1)], ["Unemployment", v("UNRATE"), (x) => `${num(x, 1)}%`], ["Fed funds", v("FEDFUNDS"), (x) => `${num(x)}%`]].filter((r) => r[1] != null)
  return (<div className="space-y-4">
    <Banner tier={tier} what="The Daily briefing is a written summary of what moved in YOUR portfolio today, what changed and what to watch." navigate={navigate} />
    <Card><CardHeader><CardTitle>Market briefing, live now</CardTitle><CardDescription>Built from live data, not written by a model. Premium adds the personal layer: what this means for your own holdings.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <DataState s={mv} rows={3}>{m && <div className="space-y-3">
          <p className="text-[14px]"><b>{m.breadth.up} of {m.breadth.up + m.breadth.down}</b> large caps are up today{m.asOf ? ` (as of ${date(m.asOf)})` : ""}. Leaders: {m.gainers.slice(0, 3).map((x) => <span key={x.symbol}><b className="font-mono">{x.symbol}</b> <span className={tone(x.changePercent)}>{pct(x.changePercent, 1, true)}</span></span>).reduce((a, b) => [a, ", ", b])}. Laggards: {m.losers.slice(0, 3).map((x) => <span key={x.symbol}><b className="font-mono">{x.symbol}</b> <span className={tone(x.changePercent)}>{pct(x.changePercent, 1, true)}</span></span>).reduce((a, b) => [a, ", ", b])}.</p></div>}</DataState>
        {read.length > 0 && <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">{read.map(([l, val, f]) => <div key={l} className="rounded-lg border border-border px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</div><div className="num text-lg font-semibold">{f(val)}</div></div>)}</div>}
        <div><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Newspaper className="size-4" />Headlines driving the day</h3>
          <DataState s={news} rows={4} empty="No headlines.">{news.status === "ok" && <ul className="divide-y divide-border">{news.data.slice(0, 6).map((n) => <li key={n.id} className="py-2 text-[13.5px]"><a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">{n.headline}</a><div className="text-[11px] text-muted-foreground">{n.publisher || n.source}</div></li>)}</ul>}</DataState></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => navigate("macro/intel")}>Market intelligence</Button><Button variant="outline" size="sm" onClick={() => navigate("macro/dashboard")}>Macro dashboard</Button><Button variant="outline" size="sm" onClick={() => navigate("research/news")}>All news</Button></div></CardContent></Card></div>)
}

const SCENARIOS = [["Rate shock +100bp", "Higher discount rates compress equity multiples; long-duration growth stocks are hit hardest."], ["Tech / semiconductor drawdown", "Megacap tech and semiconductor themes take an extra hit on top of the market."], ["Risk-off rotation", "Broad de-risking, proportional to each holding's market beta."], ["Recession", "A cyclical drawdown where high-beta holdings fall further."]]
function Stress({ tier, navigate }) {
  return (<div className="space-y-4">
    <Banner tier={tier} what="The Stress test runs Monte Carlo and four scenarios on YOUR holdings, using each position's own price history and market beta." navigate={navigate} />
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4 text-primary" />What it tests</CardTitle><CardDescription>Premium shows your portfolio's estimated loss in each of these, a one-year forward distribution (5th to 95th percentile) and the chance of a loss.</CardDescription></CardHeader>
      <CardContent className="space-y-4"><ul className="grid gap-2 md:grid-cols-2">{SCENARIOS.map(([t, d]) => <li key={t} className="rounded-lg border border-border p-3 text-[13.5px]"><b>{t}</b><div className="text-muted-foreground">{d}</div></li>)}</ul>
        <div className="rounded-lg border border-border bg-background/40 p-3 text-[13.5px]"><b>Free on your plan:</b> the Risk screen shows where your money is concentrated, which themes dominate, drawdown alerts and today's biggest movers, computed from your holdings.
          <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => navigate("portfolio/risk")}>Open Risk</Button><Button size="sm" variant="outline" onClick={() => navigate("macro/regime")}>Macro regime</Button></div></div></CardContent></Card></div>)
}

export default function AnalystGate({ kind, tier, navigate }) {
  return kind === "chat" ? <Ask tier={tier} navigate={navigate} /> : kind === "brief" ? <Brief tier={tier} navigate={navigate} /> : <Stress tier={tier} navigate={navigate} />
}
