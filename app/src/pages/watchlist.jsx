import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyBox, FreshBadge, PageHeader, Spark } from "@/components/common"
import { addToWatchlist, removeFromWatchlist, useWatchlist } from "@/lib/watchlist"
import { price, pct, tone, compact } from "@/lib/fmt"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export default function Watchlist({ item, navigate }) {
  const wl = useWatchlist(), [q, setQ] = useState(null), [add, setAdd] = useState(""), syms = wl.map((w) => w.symbol).join(",")
  useEffect(() => {
    setQ(null)
    if (!wl.length) return; let dead = false
    const pull = () => api("/api/data/quotes", { method: "POST", auth: true, body: { symbols: wl.map((w) => w.symbol) } }).then((j) => !dead && setQ(j.data || {})).catch(() => { if (!dead) setQ({}) })
    pull(); const t = setInterval(pull, 20000); return () => { dead = true; clearInterval(t) }
  }, [syms])
  return (<div><PageHeader title={item.title} description={item.desc} />
    <form onSubmit={(e) => { e.preventDefault(); const s = add.trim().toUpperCase(); if (s) { addToWatchlist(s); setAdd("") } }} className="mb-4 flex max-w-md gap-2"><Input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a ticker (AAPL, SPY, BTC-USD)" aria-label="Ticker to add" /><Button type="submit"><Plus />Add</Button></form>
    {!wl.length ? <EmptyBox>Your watchlist is empty. Add a ticker above, or press Watch on any company page.</EmptyBox> :
      <Card><CardContent className="pt-5"><Table><TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Today</TableHead><TableHead className="text-right">Volume</TableHead><TableHead>Data</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{wl.map((w) => { const x = q?.[w.symbol]; return <TableRow key={w.symbol} className="cursor-pointer" onClick={() => navigate("company/" + w.symbol)}><TableCell><div className="font-mono font-semibold">{w.symbol}</div><div className="text-[11px] text-muted-foreground">{x && x.name ? x.name : w.name || ""}</div></TableCell><TableCell className="num text-right">{x ? price(x.price, x.currency) : q ? "Unavailable" : "…"}</TableCell><TableCell className={cn("num text-right", x && tone(x.changePercent))}>{x ? pct(x.changePercent, 2, true) : ""}</TableCell><TableCell className="num text-right text-muted-foreground">{x && x.volume != null ? compact(x.volume, false) : "–"}</TableCell><TableCell>{x && <><FreshBadge meta={x.meta} /> <span className="text-[11px] text-muted-foreground">{x.source}</span></>}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={"Remove " + w.symbol} onClick={(e) => { e.stopPropagation(); removeFromWatchlist(w.symbol) }}><Trash2 /></Button></TableCell></TableRow> })}</TableBody></Table>
        <p className="mt-3 text-xs text-muted-foreground">Refreshes every 20 s. Quotes come from the first available provider (Alpaca IEX, then Finnhub, FMP, Yahoo, Twelve Data). Saved to your account when signed in.</p></CardContent></Card>}
  </div>)
}
