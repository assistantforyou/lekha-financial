import { useEffect, useMemo, useState } from "react"
import { Bot, Building2, ExternalLink, Search, Star, StarOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Bars, DataState, EmptyBox, ErrorBox, FreshBadge, PageHeader, SourceTag, Stat } from "@/components/common"
import AgentPanel from "@/components/AgentPanel"
import PriceChart from "@/components/PriceChart"
import { keyStats } from "@/lib/chartmath"
import { recent, remember } from "@/components/CommandPalette"
import { usePortfolioFacts } from "@/lib/suggest"
import { Skeleton } from "@/components/ui/skeleton"
import { useWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/watchlist"
import { api, data as fetchData, prefetch, useData } from "@/lib/api"
import { compact, date, dateTime, metric, mult, num, pct, price, tone } from "@/lib/fmt"
import { cn } from "@/lib/utils"

const unwrap = (p) => (p && p.ok ? p.data : null)

/* One tile: symbol, name, live price and today's move. Everything on the home screen comes from live data or from the user's own lists; nothing is a fixed list. */
function Tile({ symbol, name, price: px, chg, ccy, navigate }) {
  return <button onClick={() => navigate("company/" + encodeURIComponent(symbol))} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary">
    <div className="min-w-0"><div className="font-mono text-sm font-semibold">{symbol}</div><div className="truncate text-xs text-muted-foreground">{name || " "}</div></div>
    {px != null && <div className="shrink-0 text-right"><div className="num text-sm">{price(px, ccy)}</div>{chg != null && <div className={cn("num text-xs", tone(chg))}>{pct(chg, 2, true)}</div>}</div>}</button>
}
function Section({ title, sub, children }) { return <div><div className="mb-2 flex flex-wrap items-baseline gap-x-2"><h2 className="text-sm font-semibold">{title}</h2>{sub && <span className="text-xs text-muted-foreground">{sub}</span>}</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div></div> }
function Home({ navigate }) {
  const [q, setQ] = useState(""), wl = useWatchlist(), pf = usePortfolioFacts(), mv = useData("movers", {}, { refresh: 180000 }), rc = recent()
  const m = mv.status === "ok" ? mv.data : null
  return (<div className="space-y-6">
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate("company/" + encodeURIComponent(q.trim().toUpperCase())) }} className="flex max-w-xl gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker, e.g. AAPL, SPY, BTC-USD (or press ⌘K to search by name)" className="pl-9" aria-label="Ticker" /></div><Button type="submit">Open</Button></form>
    {pf.rows.length > 0 && <Section title="Your holdings" sub="live prices, largest first">{pf.rows.slice(0, 8).map((r) => <Tile key={r.tk} symbol={r.tk} chg={r.day} price={r.price} navigate={navigate} />)}</Section>}
    {wl.length > 0 && <Section title="Your watchlist">{wl.slice(0, 12).map((w) => <Tile key={w.symbol} symbol={w.symbol} name={w.name} navigate={navigate} />)}</Section>}
    {rc.length > 0 && <Section title="Recently viewed">{rc.map((r) => <Tile key={r.symbol} symbol={r.symbol} name={r.name} navigate={navigate} />)}</Section>}
    {mv.status === "loading" && <div className="space-y-2" aria-busy="true"><Skeleton className="h-5 w-64" /><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div></div>}
    {mv.status === "error" && <ErrorBox message={mv.error} attempts={mv.attempts} onRetry={mv.reload} />}
    {m && <>
      <Section title="Biggest gainers" sub={`among ${m.universe}${m.asOf ? `, as of ${date(m.asOf)}` : " today"} · ${m.breadth.up} up, ${m.breadth.down} down`}>{m.gainers.map((x) => <Tile key={x.symbol} symbol={x.symbol} name={x.name} price={x.price} chg={x.changePercent} ccy={x.currency} navigate={navigate} />)}</Section>
      <Section title="Biggest decliners">{m.losers.map((x) => <Tile key={x.symbol} symbol={x.symbol} name={x.name} price={x.price} chg={x.changePercent} ccy={x.currency} navigate={navigate} />)}</Section>
      <Section title="Most traded" sub="by dollar volume">{m.actives.map((x) => <Tile key={x.symbol} symbol={x.symbol} name={x.name} price={x.price} chg={x.changePercent} ccy={x.currency} navigate={navigate} />)}</Section>
      <p className="text-[11.5px] text-muted-foreground">Computed from live quotes of {m.universe} (the most liquid US stocks), not a full-market screener. Any ticker, ETF, index or crypto symbol can be opened from the box above.</p></>}
  </div>)
}

function Overview({ b, setTab, symbol }) {
  const q = unwrap(b.quote), prof = unwrap(b.profile), hist = unwrap(b.history), ratios = unwrap(b.ratios), ks = useMemo(() => keyStats(hist), [hist]), ccy = (q && q.currency) || "USD"
  const mt = (id) => ratios && ratios.metrics.find((m) => m.id === id)
  return (<div className="space-y-4">
    <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><div><CardTitle>Price</CardTitle><CardDescription>{b.history.ok ? <SourceTag meta={b.history.meta} /> : "History unavailable"}</CardDescription></div></CardHeader>
      <CardContent><PriceChart symbol={symbol} bars={hist} prevClose={ks && ks.prevClose} historyError={b.history.ok ? null : b.history.error} currency={ccy} /></CardContent></Card>
    {ks && <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
      <Stat label="Prev. close" value={price(ks.prevClose, ccy)} sub={`as of ${date(ks.asOf)}`} /><Stat label="Day range" value={`${num(ks.dayLow)} – ${num(ks.dayHigh)}`} sub={`open ${num(ks.open)}`} />
      <Stat label="52-wk range" value={`${num(ks.lo52)} – ${num(ks.hi52)}`} sub={`${pct(ks.fromHigh, 1, true)} from high`} tone={tone(ks.fromHigh)} /><Stat label="Volume" value={compact(ks.volume, false)} sub={ks.avgVolume ? `avg 30d ${compact(ks.avgVolume, false)}` : "daily bar"} />
    </div>}
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
      <Stat label="Market cap" value={compact(mt("marketCap") && mt("marketCap").value)} sub="price × shares (SEC)" /><Stat label="P/E" value={mult(mt("pe") && mt("pe").value)} sub="calculated" />
      <Stat label="EV/EBITDA" value={mult(mt("evEbitda") && mt("evEbitda").value)} sub="calculated" /><Stat label="FCF yield" value={pct(mt("fcfYield") && mt("fcfYield").value)} sub="calculated" />
      <Stat label="Op. margin" value={pct(mt("operatingMargin") && mt("operatingMargin").value)} sub={mt("operatingMargin") && mt("operatingMargin").period} /><Stat label="ROIC" value={pct(mt("roic") && mt("roic").value)} sub="calculated" />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Profile</CardTitle></CardHeader><CardContent className="space-y-2 text-[13.5px]">{prof ? <>
        <p className="text-muted-foreground">{prof.description || "No description from the available providers."}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1"><dt className="text-muted-foreground">Exchange</dt><dd>{prof.exchange || "–"}</dd><dt className="text-muted-foreground">Sector</dt><dd>{prof.sector || "–"}</dd><dt className="text-muted-foreground">Industry</dt><dd>{prof.industry || "–"}</dd><dt className="text-muted-foreground">CIK</dt><dd className="num">{prof.cik || "–"}</dd>{prof.website && <><dt className="text-muted-foreground">Website</dt><dd><a className="text-primary hover:underline" href={prof.website} target="_blank" rel="noopener noreferrer">{prof.website.replace(/^https?:\/\//, "")}</a></dd></>}</dl>
        <SourceTag meta={b.profile.meta} /></> : <EmptyBox>No profile available.</EmptyBox>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Latest news</CardTitle><CardDescription><button className="text-primary hover:underline" onClick={() => setTab("news")}>All news →</button></CardDescription></CardHeader><CardContent>{b.news.ok ? <ul className="space-y-2">{b.news.data.slice(0, 5).map((n) => <li key={n.id} className="text-[13px]"><a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">{n.headline}</a><div className="text-[11px] text-muted-foreground">{n.publisher} · {dateTime(n.publishedAt)}</div></li>)}</ul> : <EmptyBox>No news.</EmptyBox>}</CardContent></Card>
    </div></div>)
}

const ROWS = [["revenue", "Revenue", "m"], ["grossProfit", "Gross profit", "m"], ["operatingIncome", "Operating income", "m"], ["netIncome", "Net income", "m"], ["eps", "Diluted EPS", "ps"], ["operatingCashFlow", "Operating cash flow", "m"], ["capex", "Capex", "m"], ["freeCashFlow", "Free cash flow", "m"], ["cash", "Cash & equivalents", "m"], ["totalDebt", "Total debt", "m"], ["shareholdersEquity", "Shareholders' equity", "m"], ["totalAssets", "Total assets", "m"]]
function Financials({ b }) {
  const [type, setType] = useState("annual"), [metricKey, setMetricKey] = useState("revenue"), s = type === "annual" ? b.annual : b.quarterly
  const rows = (s.ok ? s.data : []).slice(0, type === "annual" ? 8 : 8)
  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><div className="flex rounded-md border border-border p-0.5">{[["annual", "Annual"], ["quarterly", "Quarterly"]].map(([k, l]) => <button key={k} onClick={() => setType(k)} aria-pressed={type === k} className={cn("rounded px-3 py-1 text-xs", type === k ? "bg-accent font-semibold" : "text-muted-foreground")}>{l}</button>)}</div>{s.ok && <SourceTag meta={s.meta} />}<Badge variant="outline">USD · reported</Badge></div>
    {!s.ok ? <ErrorBox message={s.error} attempts={s.attempts} /> : !rows.length ? <EmptyBox>No statements. SEC XBRL covers US-GAAP filers; add FMP_API_KEY for foreign issuers.</EmptyBox> : <>
      <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><CardTitle>Trend</CardTitle><div className="flex flex-wrap gap-1">{ROWS.filter((r) => r[2] === "m" || r[0] === "eps").slice(0, 8).map(([k, l]) => <button key={k} onClick={() => setMetricKey(k)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", metricKey === k ? "border-primary text-primary" : "border-border text-muted-foreground")}>{l}</button>)}</div></CardHeader>
        <CardContent><Bars rows={[...rows].reverse().map((r) => ({ label: type === "annual" ? String(r.fiscalYear || r.period.slice(0, 4)) : `${r.fiscalPeriod || ""} ${String(r.fiscalYear || "").slice(2)}`.trim() || r.period.slice(2, 7), v: r[metricKey] == null ? null : metricKey === "eps" ? r[metricKey] : r[metricKey] / 1e9 }))} format={(v) => (metricKey === "eps" ? v.toFixed(2) : `$${v.toFixed(1)}B`)} /></CardContent></Card>
      <Card><CardContent className="pt-5"><Table><TableHeader><TableRow><TableHead>USD</TableHead>{rows.map((r) => <TableHead key={r.period} className="text-right"><div>{r.period}</div><div className="font-normal normal-case">{r.fiscalPeriod || ""} {r.fiscalYear || ""}</div></TableHead>)}</TableRow></TableHeader>
        <TableBody>{ROWS.map(([k, l, t]) => <TableRow key={k}><TableCell className="whitespace-nowrap font-medium">{l}</TableCell>{rows.map((r) => <TableCell key={r.period} className="num text-right">{r[k] == null ? "–" : t === "ps" ? num(r[k]) : compact(r[k], true)}</TableCell>)}</TableRow>)}
          <TableRow><TableCell className="text-muted-foreground">Filed</TableCell>{rows.map((r) => <TableCell key={r.period} className="text-right text-[11px] text-muted-foreground">{r.filingDate || "–"}<div>{r.form}</div></TableCell>)}</TableRow></TableBody></Table></CardContent></Card></>}
  </div>)
}

function Valuation({ symbol, b }) {
  const r = unwrap(b.ratios), [a, setA] = useState({}), [run, setRun] = useState(0)
  const v = useData("valuation", { symbol, growth: a.growth, discount: a.discount, terminalGrowth: a.terminalGrowth }, { enabled: true, refresh: 0 })
  const d = v.status === "ok" ? v.data : null, as = d && d.assumptions
  return (<div className="space-y-4">
    <Card><CardHeader><CardTitle>Multiples & quality</CardTitle><CardDescription>Every figure is calculated by the app from SEC filings and the live quote. Hover a row for the formula and inputs.</CardDescription></CardHeader><CardContent>
      {!r ? <ErrorBox message={b.ratios.error} attempts={b.ratios.attempts} /> : <Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Formula</TableHead></TableRow></TableHeader><TableBody>{r.metrics.map((m) => <TableRow key={m.id}><TableCell className="font-medium">{m.label}</TableCell><TableCell className="num text-right">{metric(m)}</TableCell><TableCell className="text-xs text-muted-foreground" title={JSON.stringify(m.inputs)}>{m.formula}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Discounted cash flow</CardTitle><CardDescription>Two-stage DCF. Defaults come from reported free cash flow and market data; override any assumption. This is a model, not a price target.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">{[["growth", "FCF growth (10y fade)", as && as.growth], ["discount", "Discount rate", as && as.discount], ["terminalGrowth", "Terminal growth", as && as.terminalGrowth]].map(([k, l, dv]) => <div key={k} className="space-y-1.5"><Label htmlFor={"dcf-" + k}>{l}</Label><div className="flex items-center gap-2"><Input id={"dcf-" + k} type="number" step="0.5" value={a[k] != null ? a[k] * 100 : ""} placeholder={dv != null ? (dv * 100).toFixed(1) : ""} onChange={(e) => setA({ ...a, [k]: e.target.value === "" ? undefined : parseFloat(e.target.value) / 100 })} /><span className="text-sm text-muted-foreground">%</span></div></div>)}</div>
      <DataState s={v}>{d && (d.dcf ? <div className="space-y-3"><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Stat label="Intrinsic / share" value={price(d.intrinsicPerShare)} sub="DCF (calculated)" /><Stat label="Price" value={price(d.price)} /><Stat label="Margin of safety" value={pct(d.marginOfSafety, 1, true)} tone={tone(d.marginOfSafety)} /><Stat label="Terminal value share" value={pct(d.dcf.terminalShare, 0)} hint="Share of enterprise value that comes from the terminal value: high means the result is sensitive to long-run assumptions." /></div>
        <p className="text-xs text-muted-foreground">Assumptions: FCF {compact(as.freeCashFlow)}, growth {pct(as.growth, 1)} ({as.growthBasis}), discount {pct(as.discount, 1)}, risk-free {pct(as.riskFree, 2)}, beta {as.beta != null ? as.beta.toFixed(2) : "n/a"}, net debt {compact(as.netDebt)}, shares {compact(as.shares, false)}.</p></div> : <Alert variant="warn"><AlertTitle>DCF not applicable</AlertTitle><AlertDescription>Free cash flow is not positive or inputs are missing, so a discounted-cash-flow value would be meaningless. Use the multiples above.</AlertDescription></Alert>)}</DataState>
    </CardContent></Card></div>)
}

function Growth({ b }) {
  const r = unwrap(b.ratios), ann = b.annual.ok ? b.annual.data : []
  if (!r) return <ErrorBox message={b.ratios.error} attempts={b.ratios.attempts} />
  const groups = [["Revenue", "revenue"], ["Net income", "netIncome"], ["EPS", "eps"], ["Free cash flow", "freeCashFlow"]]
  return (<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{groups.map(([l, k]) => { const y = r.growth.find((m) => m.id === k + "Yoy"), c = r.growth.find((m) => m.id === k + "Cagr"); return <Card key={k}><CardContent className="space-y-1 pt-5"><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{l}</div><div className={cn("num text-xl font-semibold", tone(y && y.value))}>{pct(y && y.value, 1, true)}<span className="ml-1 text-xs font-normal text-muted-foreground">YoY</span></div><div className="text-xs text-muted-foreground">{c && c.value != null ? `${pct(c.value, 1, true)} CAGR (${c.inputs.years}y)` : "CAGR n/a"}</div></CardContent></Card> })}</div>
    <Card><CardHeader><CardTitle>Year-over-year growth</CardTitle><CardDescription>Calculated from consecutive fiscal years. {b.annual.ok && <SourceTag meta={b.annual.meta} />}</CardDescription></CardHeader><CardContent><Bars rows={ann.slice(0, 8).reverse().map((x, i, a) => { const prev = ann.slice(0, 8).reverse()[i - 1]; return { label: String(x.fiscalYear || x.period.slice(0, 4)), v: prev && prev.revenue > 0 && x.revenue != null ? (x.revenue / prev.revenue - 1) * 100 : null } })} format={(v) => `${v.toFixed(1)}%`} /><p className="mt-1 text-center text-xs text-muted-foreground">Revenue growth, %</p></CardContent></Card></div>)
}

const CATS = [["all", "All"], ["earnings", "Earnings"], ["m&a", "M&A"], ["regulatory", "Regulatory"], ["macro", "Macro"]]
export function NewsList({ items }) {
  if (!items.length) return <EmptyBox>No headlines match.</EmptyBox>
  return <ul className="divide-y divide-border">{items.map((n) => <li key={n.id} className="py-3"><div className="flex flex-wrap items-start gap-2"><a href={n.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-[14px] font-medium hover:text-primary hover:underline">{n.headline}<ExternalLink className="ml-1 inline size-3 opacity-60" /></a>{n.category !== "general" && n.category !== "company" && <Badge variant="outline">{n.category}</Badge>}</div>
    {n.summary && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{n.summary}</p>}<div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground"><span>{n.publisher || n.source}</span><span>{dateTime(n.publishedAt)}</span>{n.tickers.length > 0 && <span className="font-mono">{n.tickers.slice(0, 4).join(" ")}</span>}<span>via {n.source}{n.alsoReportedBy ? ` +${n.alsoReportedBy.length}` : ""}</span></div></li>)}</ul>
}
function News({ b }) { const [c, setC] = useState("all"), [o, setO] = useState(""); if (!b.news.ok) return <ErrorBox message={b.news.error} attempts={b.news.attempts} />; const pubs = [...new Set(b.news.data.map((n) => n.publisher || n.source).filter(Boolean))].sort(), items = b.news.data.filter((n) => (c === "all" || n.category === c) && (!o || (n.publisher || n.source) === o))
  return <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><div><CardTitle>News</CardTitle><CardDescription><SourceTag meta={b.news.meta} /> · de-duplicated across providers</CardDescription></div><div className="flex flex-wrap items-center gap-1"><select value={o} onChange={(e) => setO(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1 text-xs" aria-label="Filter by outlet"><option value="">All outlets ({pubs.length})</option>{pubs.map((p) => <option key={p} value={p}>{p}</option>)}</select>{CATS.map(([k, l]) => <button key={k} onClick={() => setC(k)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", c === k ? "border-primary text-primary" : "border-border text-muted-foreground")}>{l}</button>)}</div></CardHeader><CardContent><NewsList items={items} /></CardContent></Card> }

function Filings({ b, symbol }) { const [f, setF] = useState("all"); if (!b.filings.ok) return <ErrorBox message={b.filings.error} attempts={b.filings.attempts} />; const all = b.filings.data, forms = ["all", ...new Set(all.map((x) => x.form))], rows = all.filter((x) => f === "all" || x.form === f)
  return <Card><CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><div><CardTitle>SEC filings</CardTitle><CardDescription><SourceTag meta={b.filings.meta} /> · primary documents on sec.gov</CardDescription></div><div className="flex flex-wrap gap-1">{forms.slice(0, 8).map((k) => <button key={k} onClick={() => setF(k)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", f === k ? "border-primary text-primary" : "border-border text-muted-foreground")}>{k === "all" ? "All" : k}</button>)}</div></CardHeader>
    <CardContent><Table><TableHeader><TableRow><TableHead>Form</TableHead><TableHead>Filed</TableHead><TableHead>Period</TableHead><TableHead>Description</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.map((x) => <TableRow key={x.accession}><TableCell><Badge variant="secondary">{x.form}</Badge></TableCell><TableCell className="num whitespace-nowrap">{x.filingDate}</TableCell><TableCell className="num whitespace-nowrap">{x.reportDate || "–"}</TableCell><TableCell className="max-w-[28ch] truncate text-muted-foreground">{x.description}</TableCell><TableCell className="text-right"><a className="inline-flex items-center gap-1 text-primary hover:underline" href={x.url} target="_blank" rel="noopener noreferrer">Open<ExternalLink className="size-3" /></a></TableCell></TableRow>)}</TableBody></Table>
      <p className="mt-3 text-xs text-muted-foreground">Insider forms (3/4/5) are hidden by default. Ask the agent about a specific 10-K or 8-K for a summary with a citation.</p></CardContent></Card> }

function Earnings({ b }) { if (!b.earnings.ok) return <ErrorBox message={b.earnings.error} attempts={b.earnings.attempts} />; const rows = b.earnings.data, hasEst = rows.some((r) => r.epsEstimate != null)
  return <Card><CardHeader><CardTitle>Earnings history</CardTitle><CardDescription><SourceTag meta={b.earnings.meta} /></CardDescription></CardHeader><CardContent className="space-y-3">
    {!hasEst && <Alert variant="warn"><AlertTitle>Estimates and transcripts not connected</AlertTitle><AlertDescription>Reported EPS comes from SEC filings. Analyst estimates, surprise and call transcripts need an optional FMP or Finnhub key (see Account → About → integrations).</AlertDescription></Alert>}
    <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Period</TableHead><TableHead className="text-right">EPS actual</TableHead><TableHead className="text-right">EPS estimate</TableHead><TableHead className="text-right">Surprise</TableHead></TableRow></TableHeader><TableBody>{rows.map((r, i) => <TableRow key={i}><TableCell className="num">{r.date}</TableCell><TableCell>{r.fiscalPeriod || "–"}</TableCell><TableCell className="num text-right">{num(r.epsActual)}</TableCell><TableCell className="num text-right">{num(r.epsEstimate)}</TableCell><TableCell className={cn("num text-right", tone(r.surprise))}>{pct(r.surprise, 1, true)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card> }

function Peers({ b, navigate }) {
  const peers = b.peers.ok ? b.peers.data : [], [q, setQ] = useState({}), [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!peers.length) return; const ctrl = new AbortController()
    const pull = () => { if (document.hidden) return; setLoading(true); api("/api/data/quotes", { method: "POST", auth: true, body: { symbols: peers.slice(0, 10) }, signal: ctrl.signal }).then((j) => { setQ(j.data || {}); setLoading(false) }).catch((e) => { if (e.name !== "AbortError") setLoading(false) }) }
    pull(); const t = setInterval(pull, 30000)
    return () => { ctrl.abort(); clearInterval(t) }
  }, [peers.join()])
  if (!b.peers.ok) return <ErrorBox message={b.peers.error} attempts={b.peers.attempts} />
  return <Card><CardHeader><CardTitle>Comparable companies</CardTitle><CardDescription><SourceTag meta={b.peers.meta} /> · peers come from the provider, or the same S&P 500 sector when no provider is configured</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Today</TableHead><TableHead /></TableRow></TableHeader><TableBody>{peers.slice(0, 10).map((p) => { const x = q[p]; return <TableRow key={p} className="cursor-pointer" onClick={() => navigate("company/" + p)}><TableCell className="font-mono font-semibold">{p}</TableCell><TableCell className="num text-right">{x ? price(x.price, x.currency) : (loading ? "…" : "–")}</TableCell><TableCell className={cn("num text-right", x && tone(x.changePercent))}>{x ? pct(x.changePercent, 2, true) : ""}</TableCell><TableCell className="text-right text-primary">Open →</TableCell></TableRow> })}</TableBody></Table>{loading && <p className="mt-2 text-xs text-muted-foreground">Loading peer quotes…</p>}</CardContent></Card>
}

const TABS = [["overview", "Overview"], ["financials", "Financials"], ["valuation", "Valuation"], ["growth", "Growth"], ["news", "News"], ["filings", "Filings"], ["earnings", "Earnings"], ["peers", "Peers"], ["ai", "AI analyst"]]
function Workspace({ symbol, route, navigate }) {
  const s = useData("company", { symbol }), wl = useWatchlist(), tab = (route.query && route.query.get("tab")) || "overview"
  const setTab = (t) => navigate(`company/${encodeURIComponent(symbol)}?tab=${t}`)
  const hasQuote = s.status === "ok" && s.data && s.data.quote && s.data.quote.ok, live = useData("quote", { symbol }, { refresh: 15000, enabled: s.status === "ok" && !!hasQuote }), liveNews = useData("news", { symbol, limit: 60 }, { refresh: 300000 }), b0 = s.data, b = b0 && liveNews.status === "ok" && Array.isArray(liveNews.data) ? { ...b0, news: { ok: true, data: liveNews.data, meta: liveNews.meta } } : b0, q = (live.status === "ok" && live.data) || (b && unwrap(b.quote)), prof = b && unwrap(b.profile), watched = wl.some((w) => w.symbol === symbol)
  useEffect(() => { if (b && prof) remember({ symbol, name: prof.name }) }, [b && prof && prof.name])
  useEffect(() => { if (s.status === "ok") { prefetch("valuation", { symbol }); prefetch("history", { symbol, days: 1900 }) } }, [symbol, s.status])   // warm the tabs people click next so they open instantly
  if (s.status === "loading") return <DataState s={s} rows={6} />
  if (s.status === "error") return <ErrorBox message={s.error} attempts={s.attempts} onRetry={s.reload} />
  const nothing = !q && !prof && !b.annual.ok
  return (<div className="space-y-4">
    <div data-tour="company-head" className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{(prof && prof.name) || (q && q.name) || symbol}</h1><Badge variant="secondary" className="font-mono">{symbol}</Badge>{prof && prof.exchange && <Badge variant="outline">{prof.exchange}</Badge>}{prof && prof.sector && <Badge variant="outline">{prof.sector}</Badge>}</div>
        {q ? <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="num text-3xl font-semibold">{price(q.price, q.currency)}</span><span className={cn("num text-base", tone(q.change))}>{q.change != null ? (q.change > 0 ? "+" : "") + num(q.change) : ""} ({pct(q.changePercent, 2, true)})</span><FreshBadge meta={q.meta} /><SourceTag source={q.source} asOf={q.timestamp} />{live.status === "ok" && <span className="text-[11px] text-muted-foreground" title="Price refreshes every 15 s while this tab is visible">● auto-refresh 15s</span>}</div> : <p className="mt-1 text-sm text-muted-foreground">No live quote available from any provider.</p>}</div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => (watched ? removeFromWatchlist(symbol) : addToWatchlist(symbol, prof && prof.name))}>{watched ? <><StarOff />Unwatch</> : <><Star />Watch</>}</Button><Button onClick={() => setTab("ai")}><Bot />Ask AI</Button></div></div>
    {nothing && <Alert variant="warn"><AlertTitle>No data found for {symbol}</AlertTitle><AlertDescription>Check the ticker. US companies resolve through SEC EDGAR; ETFs, indices and crypto use market data providers (examples: SPY, ^GSPC, BTC-USD, 0700.HK).</AlertDescription></Alert>}
    <Tabs value={tab} onValueChange={setTab}><TabsList data-tour="company-tabs" className="h-auto flex-wrap">{TABS.map(([k, l]) => <TabsTrigger key={k} value={k} className="h-8">{l}</TabsTrigger>)}</TabsList>
      <TabsContent value="overview"><Overview b={b} setTab={setTab} symbol={symbol} /></TabsContent><TabsContent value="financials"><Financials b={b} /></TabsContent>
      <TabsContent value="valuation"><Valuation symbol={symbol} b={b} /></TabsContent><TabsContent value="growth"><Growth b={b} /></TabsContent><TabsContent value="news"><News b={b} /></TabsContent>
      <TabsContent value="filings"><Filings b={b} symbol={symbol} /></TabsContent><TabsContent value="earnings"><Earnings b={b} /></TabsContent><TabsContent value="peers"><Peers b={b} navigate={navigate} /></TabsContent>
      <TabsContent value="ai"><AgentPanel symbol={symbol} key={symbol} /></TabsContent></Tabs>
  </div>)
}
export default function CompanyPage({ route, item, navigate }) {
  const symbol = route.param ? route.param.toUpperCase() : null
  return symbol ? <Workspace key={symbol} symbol={symbol} route={route} navigate={navigate} /> : <><PageHeader title={item.title} description={item.desc} /><Home navigate={navigate} /></>
}
