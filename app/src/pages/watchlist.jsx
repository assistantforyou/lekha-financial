import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyBox, ErrorBox, FreshBadge, PageHeader } from "@/components/common"
import { addToWatchlist, removeFromWatchlist, useWatchlist } from "@/lib/watchlist"
import { api } from "@/lib/api"
import { price, pct, tone, compact, ago } from "@/lib/fmt"
import { cn } from "@/lib/utils"
import { capture } from "@/lib/analytics"

const REFRESH_MS = 20000
// symbols the data layer understands: letters/digits plus . - ^ = (BRK.B, BTC-USD, ^GSPC, EURUSD=X)
const VALID = /^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/
const COLS = [["symbol", "Symbol", "left"], ["price", "Price", "right"], ["changePercent", "Today", "right"], ["volume", "Volume", "right"]]

export default function Watchlist({ item, navigate }) {
  const wl = useWatchlist(), [q, setQ] = useState({}), [add, setAdd] = useState(""), [addErr, setAddErr] = useState(null)
  const [state, setState] = useState({ loading: false, error: null, at: null }), [sort, setSort] = useState({ k: "symbol", dir: 1 }), [tick, setTick] = useState(0), syms = wl.map((w) => w.symbol).join(",")

  useEffect(() => {
    if (!syms) return; const ctrl = new AbortController(); let timer
    const pull = async () => {
      if (document.hidden) return                                  // no polling in background tabs
      setState((s) => ({ ...s, loading: true }))
      try { const j = await api("/api/data/quotes", { method: "POST", auth: true, body: { symbols: syms.split(",") }, signal: ctrl.signal }); setQ(j.data || {}); setState({ loading: false, error: null, at: new Date().toISOString() }) }
      catch (e) { if (e.name !== "AbortError") setState((s) => ({ ...s, loading: false, error: e.message })) }
    }
    pull(); timer = setInterval(pull, REFRESH_MS)
    const vis = () => { if (!document.hidden) pull() }; document.addEventListener("visibilitychange", vis)
    return () => { ctrl.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", vis) }
  }, [syms, tick])

  const rows = useMemo(() => {
    const val = (w) => (sort.k === "symbol" ? w.symbol : q[w.symbol] ? q[w.symbol][sort.k] : null)
    return [...wl].sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "string" ? x.localeCompare(y) : x - y) * sort.dir })   // missing values always sink to the bottom
  }, [wl, q, sort])
  const submit = useCallback((e) => {
    e.preventDefault(); const s = add.trim().toUpperCase().replace(/\s+/g, "")
    if (!s) return; if (!VALID.test(s)) { capture("watchlist_add_rejected", { reason: "invalid" }); return setAddErr(`“${add.trim()}” is not a valid ticker. Use letters and digits, e.g. AAPL, BRK.B, BTC-USD, ^GSPC.`) }
    if (wl.some((w) => w.symbol === s)) { capture("watchlist_add_rejected", { reason: "duplicate" }); return setAddErr(`${s} is already on your watchlist.`) }
    addToWatchlist(s); capture("watchlist_changed", { action: "add", source: "watchlist_page" }); setAdd(""); setAddErr(null)
  }, [add, wl])
  const missing = syms && !state.loading && state.at ? wl.filter((w) => !q[w.symbol]).map((w) => w.symbol) : []
  const th = (k, label, align) => <TableHead key={k} className={align === "right" ? "text-right" : ""} aria-sort={sort.k === k ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
    <button type="button" className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.k === k && "text-foreground")} onClick={() => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: k === "symbol" ? 1 : -1 }))}>{label}{sort.k === k && (sort.dir > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}</button></TableHead>

  return (<div><PageHeader title={item.title} description={item.desc} />
    <form onSubmit={submit} className="mb-1 flex max-w-md gap-2"><Input value={add} onChange={(e) => { setAdd(e.target.value); setAddErr(null) }} placeholder="Add a ticker (AAPL, SPY, BTC-USD)" aria-label="Ticker to add" aria-invalid={!!addErr} /><Button type="submit"><Plus />Add</Button></form>
    <div className="mb-4 min-h-5 text-xs text-[var(--down)]" role={addErr ? "alert" : undefined}>{addErr}</div>
    {!wl.length ? <EmptyBox>Your watchlist is empty. Add a ticker above, or press Watch on any company page.</EmptyBox> : <div className="space-y-3">
      {state.error && <ErrorBox message={state.error} onRetry={() => setTick((n) => n + 1)} />}
      {missing.length > 0 && !state.error && <p className="text-xs text-[var(--warn)]" role="status">No quote from any provider for {missing.join(", ")}. Check the spelling, or remove it.</p>}
      <Card><CardContent className="pt-5"><Table><TableHeader><TableRow>{COLS.map(([k, l, a]) => th(k, l, a))}<TableHead>Data</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{rows.map((w) => { const x = q[w.symbol]; return <TableRow key={w.symbol} tabIndex={0} className="cursor-pointer" onClick={() => { capture("company_opened", { source: "watchlist_row" }); navigate("company/" + w.symbol) }} onKeyDown={(e) => { if (e.key === "Enter") { capture("company_opened", { source: "watchlist_row" }); navigate("company/" + w.symbol) } }}>
          <TableCell><div className="font-mono font-semibold">{w.symbol}</div><div className="text-[11px] text-muted-foreground">{x && x.name ? x.name : w.name || ""}</div></TableCell>
          <TableCell className="num text-right">{x ? price(x.price, x.currency) : state.loading ? "…" : "–"}</TableCell>
          <TableCell className={cn("num text-right", x && tone(x.changePercent))}>{x ? pct(x.changePercent, 2, true) : ""}</TableCell>
          <TableCell className="num text-right text-muted-foreground">{x && x.volume != null ? compact(x.volume, false) : "–"}</TableCell>
          <TableCell>{x && <><FreshBadge meta={x.meta} /> <span className="text-[11px] text-muted-foreground">{x.source}</span></>}</TableCell>
          <TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={"Remove " + w.symbol} onClick={(e) => { e.stopPropagation(); capture("watchlist_changed", { action: "remove", source: "watchlist_page" }); removeFromWatchlist(w.symbol) }}><Trash2 /></Button></TableCell></TableRow> })}</TableBody></Table>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Button size="sm" variant="outline" className="h-7" onClick={() => setTick((n) => n + 1)} disabled={state.loading}><RefreshCw className={state.loading ? "animate-spin" : ""} />Refresh</Button>
          <span>{state.loading && !state.at ? "Loading quotes… · " : state.at ? `Updated ${ago(state.at)} · ` : ""}Auto-refresh every 20 s while this tab is visible. Quotes come from the first available provider (Alpaca IEX, then Finnhub, FMP, Yahoo, Twelve Data). Saved to your account when signed in.</span></div></CardContent></Card></div>}
  </div>)
}
