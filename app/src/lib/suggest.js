import { useEffect, useMemo, useState } from "react"
import { api, useData } from "@/lib/api"
import { useWatchlist } from "@/lib/watchlist"

/* Suggested questions built from what is true right now: today's market, the macro readings, and (when there is one) the user's own portfolio.
   Nothing here is canned text: every number in a question was read from a live source a moment ago. */
const holdings = () => { try { return (window.PT_HOLD && window.PT_HOLD.load().items) || [] } catch (e) { return [] } }
const p1 = (f) => `${(Math.abs(f) * 100).toFixed(1)}%`

/* positions with live prices: weight, today's move and theme (USD lines only, so no currency guessing) */
export function usePortfolioFacts() {
  const [items, setItems] = useState(holdings), [quotes, setQuotes] = useState({})
  useEffect(() => { const f = () => setItems(holdings()); window.addEventListener("hashchange", f); window.addEventListener("pt:state-hydrated", f); return () => { window.removeEventListener("hashchange", f); window.removeEventListener("pt:state-hydrated", f) } }, [])
  const syms = items.filter((x) => x.tk && x.tk !== "CASH" && (x.cur || "USD") === "USD").map((x) => x.tk).slice(0, 25).join(",")
  useEffect(() => { if (!syms) { setQuotes({}); return } let dead = false; api("/api/data/quotes", { method: "POST", auth: true, body: { symbols: syms.split(",") } }).then((j) => !dead && setQuotes(j.data || {})).catch(() => {}); return () => { dead = true } }, [syms])
  return useMemo(() => {
    const usd = items.filter((x) => (x.cur || "USD") === "USD"), cash = usd.filter((x) => x.tk === "CASH").reduce((s, x) => s + (Number(x.qty) || 0), 0)
    const rows = usd.filter((x) => x.tk !== "CASH" && quotes[x.tk] && quotes[x.tk].price > 0).map((x) => ({ tk: x.tk, theme: x.theme || "Other", price: quotes[x.tk].price, value: (Number(x.qty) || 0) * quotes[x.tk].price, day: quotes[x.tk].changePercent }))
    const total = rows.reduce((s, r) => s + r.value, 0) + cash; if (!rows.length || !(total > 0)) return { count: items.length, rows: [], total: 0 }
    rows.forEach((r) => { r.w = r.value / total }); rows.sort((a, b) => b.value - a.value)
    const th = {}; rows.forEach((r) => { th[r.theme] = (th[r.theme] || 0) + r.w }); const themes = Object.entries(th).filter(([t]) => t !== "Other").sort((a, b) => b[1] - a[1])
    const mover = [...rows].sort((a, b) => Math.abs(b.day * b.w) - Math.abs(a.day * a.w))[0]
    return { count: items.length, rows, total, top: rows[0], theme: themes[0] ? { name: themes[0][0], w: themes[0][1] } : null, mover, cashW: cash / total }
  }, [items, quotes])
}

function macroFacts(d) {
  if (!d || !d.series) return null
  const by = Object.fromEntries(d.series.map((x) => [x.id, x])), v = (id) => (by[id] && by[id].latest ? by[id].latest.value : null)
  return { spread: v("T10Y2Y"), y10: v("DGS10"), ff: v("FEDFUNDS"), cpi: v("CPIAUCSL"), vix: v("VIXCLS"), unemp: v("UNRATE"), real: d.derived ? d.derived.realFedFunds : null }
}

/* kind: "agent" (research agent), "company" (one symbol's AI tab). Returns [{ text, tag }] */
export function useSuggestions(kind, { symbol } = {}) {
  const mv = useData("movers", {}, { refresh: 180000 }), mac = useData("macro", {}), pf = usePortfolioFacts(), wl = useWatchlist(), quote = useData("quote", { symbol: symbol || "" }, { enabled: kind === "company" && !!symbol })
  return useMemo(() => {
    const out = [], add = (text, tag) => { if (text && !out.some((o) => o.text === text)) out.push({ text, tag }) }
    const m = mv.status === "ok" ? mv.data : null, M = macroFacts(mac.status === "ok" ? mac.data : null)
    if (kind === "company" && symbol) {
      const q = quote.status === "ok" ? quote.data : null
      add(q && q.changePercent != null ? `Why did ${symbol} ${q.changePercent < 0 ? "fall" : "rise"} ${p1(q.changePercent)} ${q.freshness === "historical" ? "on its last session" : "today"}?` : `Why did ${symbol} move today?`, "Today")
      add(`Is ${symbol} cheap or expensive versus its own fundamentals?`, "Valuation")
      add(`Summarise ${symbol}'s latest earnings and filings.`, "Filings")
      if (M && M.y10 != null) add(`With the 10-year Treasury at ${M.y10.toFixed(2)}%${M.spread != null ? ` and the yield curve ${M.spread < 0 ? "inverted" : "not inverted"}` : ""}, how exposed is ${symbol} to rates?`, "Macro")
      if (M && M.vix != null && M.vix >= 20) add(`VIX is ${M.vix.toFixed(1)}: how much downside risk does ${symbol} carry in a volatile market?`, "Risk")
      const held = pf.rows.find((r) => r.tk === symbol); if (held) add(`${symbol} is ${p1(held.w)} of my portfolio: should I add, hold or trim?`, "Portfolio")
      return out.slice(0, 6)
    }
    // portfolio first: it is the most personal and the most useful
    if (pf.mover && Math.abs(pf.mover.day) >= 0.01) add(`Why did ${pf.mover.tk} ${pf.mover.day < 0 ? "fall" : "rise"} ${p1(pf.mover.day)} today, and what does it do to my portfolio (it is ${p1(pf.mover.w)} of it)?`, "Portfolio")
    if (pf.theme && pf.theme.w >= 0.3) add(`Am I too concentrated in ${pf.theme.name}? It is ${p1(pf.theme.w)} of my portfolio.`, "Portfolio")
    if (pf.top && pf.top.w >= 0.1) add(`${pf.top.tk} is my largest position at ${p1(pf.top.w)}: how risky is that concentration?`, "Portfolio")
    if (pf.rows.length && M && M.y10 != null) add(`With the 10-year yield at ${M.y10.toFixed(2)}%${M.real != null ? ` and the real policy rate ${M.real >= 0 ? "+" : "−"}${Math.abs(M.real * 100).toFixed(2)}%` : ""}, which of my holdings are most exposed to rates?`, "Portfolio + macro")
    // the market today
    if (m && m.breadth) { const t = m.breadth.up + m.breadth.down; if (t) add(m.breadth.down / t >= 0.6 ? `${m.breadth.down} of ${t} large caps are down: what is driving the sell-off?` : m.breadth.up / t >= 0.6 ? `${m.breadth.up} of ${t} large caps are up: what is driving the rally?` : "The market is split today: which sectors are leading and lagging, and why?", "Market") }
    if (m && m.losers && m.losers[0] && m.losers[0].changePercent <= -0.02) add(`Why is ${m.losers[0].symbol} down ${p1(m.losers[0].changePercent)}, the worst large-cap move today?`, "Market")
    if (m && m.gainers && m.gainers[0] && m.gainers[0].changePercent >= 0.02) add(`Why is ${m.gainers[0].symbol} up ${p1(m.gainers[0].changePercent)}, the best large-cap move today?`, "Market")
    // the economy
    if (M && M.vix != null) add(M.vix >= 25 ? `VIX is ${M.vix.toFixed(1)}: how stressed is the market and what should I watch?` : M.vix < 15 ? `VIX is only ${M.vix.toFixed(1)}: is the market too complacent?` : `VIX is ${M.vix.toFixed(1)}: is the market's risk appetite healthy?`, "Macro")
    if (M && M.spread != null) add(`The yield curve is ${M.spread < 0 ? "inverted" : `+${M.spread.toFixed(2)} points`}: what does that mean for stocks over the next year?`, "Macro")
    if (M && M.cpi != null) add(`Inflation is ${(M.cpi * 100).toFixed(1)}% against the Fed's 2% goal and fed funds are at ${M.ff != null ? M.ff.toFixed(2) + "%" : "n/a"}: what happens to rates next?`, "Macro")
    // what the user follows
    wl.slice(0, 2).forEach((w) => add(`What is the latest news and price action for ${w.symbol}, which is on my watchlist?`, "Watchlist"))
    if (!out.length) add("What is the macro backdrop: rates, inflation and jobs?", "Macro")   // only while the live data is still loading
    return out.slice(0, 7)
  }, [mv.status, mv.data, mac.status, mac.data, pf, wl, quote.status, quote.data, kind, symbol])
}
