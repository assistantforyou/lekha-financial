import { useEffect, useMemo, useRef, useState } from "react"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataState, EmptyBox, ErrorBox } from "@/components/common"
import { useData } from "@/lib/api"
import { RANGES, barLabel, daysFor, isIntraday, maxDrawdown, rebasePair, sliceRange, sma, windowReturn } from "@/lib/chartmath"
import { compact, num, pct, price, tone } from "@/lib/fmt"
import { cn } from "@/lib/utils"

const W = 700, PL = 6, PT = 8, PB = 18, VH = 44, GAP = 8, MAX_CANDLES = 180
const BENCH = "SPY", EMPTY = []
const bars$ = (s) => (s && s.status === "ok" && Array.isArray(s.data) ? s.data : null)
const Toggle = ({ on, onClick, children, title }) => <button type="button" title={title} aria-pressed={on} onClick={onClick} className={cn("rounded-md border px-2 py-1 text-xs", on ? "border-primary bg-accent font-semibold text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{children}</button>

/* Interactive price chart: ranges, line/candles, volume, SMA 50/200, benchmark comparison (rebased to 100),
   drag-to-zoom, zoom buttons, reset, crosshair with OHLC. `bars` are the 730 days that arrive with the company bundle;
   5Y / MAX and the benchmark are fetched on demand through the same data layer (cached server-side). */
export default function PriceChart({ symbol, bars, historyError, currency = "USD", prevClose = null }) {
  const [rk, setRk] = useState("1Y"), [mode, setMode] = useState("line"), [vol, setVol] = useState(true), [ma, setMa] = useState(false), [cmp, setCmp] = useState(false)
  const [zoom, setZoom] = useState(null), [hover, setHover] = useState(null), [drag, setDrag] = useState(null), ref = useRef(null)
  const [wpx, setWpx] = useState(700)
  useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setWpx(el.getBoundingClientRect().width || 700)); ro.observe(el); setWpx(el.getBoundingClientRect().width || 700); return () => ro.disconnect() }, [!!ref.current])
  const fs = Math.min(15, Math.max(10, (10 * W) / wpx)), PR = Math.round((54 * fs) / 10)   // keep axis text ~10px on screen however narrow the chart
  const range = RANGES.find((r) => r.k === rk), longNeeded = daysFor(range) > 730
  const intra = !!range.intra, long = useData("history", { symbol, days: daysFor(range) }, { enabled: longNeeded && !intra }), tick = useData("intraday", { symbol, days: range.intra || 1 }, { enabled: intra, refresh: 60000 })
  const bench = useData("history", { symbol: BENCH, days: Math.max(daysFor(range), 730) }, { enabled: cmp && symbol !== BENCH && !intra })
  const all = (intra ? bars$(tick) : longNeeded ? bars$(long) : null) || (intra ? null : bars) || EMPTY
  const visible = useMemo(() => sliceRange(all, range), [all, rk])
  const view = useMemo(() => (zoom ? visible.slice(zoom[0], zoom[1] + 1) : visible), [visible, zoom])
  const smaAll = useMemo(() => (ma && !intra ? { s50: sma(all.map((b) => b[4]), 50), s200: sma(all.map((b) => b[4]), 200) } : null), [all, ma])
  const off = all.length - visible.length + (zoom ? zoom[0] : 0)
  const reb = useMemo(() => (cmp && !intra && symbol !== BENCH && bars$(bench) ? rebasePair(view, bars$(bench)) : null), [cmp, view, bench.status, bench.data])
  const candles = mode === "candle" && !reb && view.length <= MAX_CANDLES
  const pick = (r) => { setRk(r); setZoom(null); setHover(null) }
  const cmpOn = cmp && !intra
  const RangeBar = () => <div className="flex flex-wrap rounded-md border border-border p-0.5" role="group" aria-label="Chart range">{RANGES.map((r) => <button key={r.k} type="button" onClick={() => pick(r.k)} aria-pressed={rk === r.k} className={cn("rounded px-2.5 py-1 text-xs", rk === r.k ? "bg-accent font-semibold" : "text-muted-foreground hover:text-foreground")}>{r.k}</button>)}</div>

  if (!all.length) {
    if (intra && tick.status === "loading") return <><RangeBar /><DataState s={tick} rows={5} /></>
    if (intra && tick.status === "error") return <><RangeBar /><EmptyBox>Intraday bars for {symbol} could not be loaded ({(tick.attempts || []).some((a) => /window/.test(a.error || "")) ? "the free provider for this kind of symbol only keeps about 60 days of intraday history, and this date is older" : tick.code === "no_provider_for_intraday" ? "no connected provider returned bars for this session" : "the data provider did not respond"}). <button className="underline" onClick={tick.reload}>Retry</button> or pick a longer range.</EmptyBox></>
    if (longNeeded && long.status === "loading") return <DataState s={long} rows={5} />
    if (longNeeded && long.status === "error") return <ErrorBox message={long.error} attempts={long.attempts} onRetry={long.reload} />
    return historyError ? <ErrorBox message={historyError} /> : <EmptyBox>No price history is available for {symbol} from the connected providers.</EmptyBox>
  }
  const n = view.length, plotW = W - PL - PR, H = wpx < 520 ? 320 : 230, volOn = vol && !reb && view.some((b) => b[5] > 0), ph = H - PT - PB - (volOn ? VH + GAP : 0)
  const series = reb ? reb.a : view.map((b) => b[4]), series2 = reb ? reb.b : null
  const ysAll = [...(candles ? view.flatMap((b) => [b[2] ?? b[4], b[3] ?? b[4]]) : series), ...(series2 || []), ...(ma && smaAll && !reb ? [smaAll.s50, smaAll.s200].flatMap((a) => a.slice(off, off + n)) : [])].filter((v) => v != null && Number.isFinite(v))
  if (n < 2 || !ysAll.length) return <EmptyBox>Not enough data points in this range. Pick a longer one.</EmptyBox>
  let lo = Math.min(...ysAll), hi = Math.max(...ysAll); const pad = (hi - lo || 1) * 0.06; lo -= pad; hi += pad
  const X = (i) => PL + (n === 1 ? 0 : (i / (n - 1)) * plotW), Y = (v) => PT + (1 - (v - lo) / (hi - lo)) * ph
  const path = (arr) => arr.map((v, i) => (v == null || !Number.isFinite(v) ? "" : `${i && arr[i - 1] != null ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).join("")
  const vmax = Math.max(...view.map((b) => b[5] || 0), 1), VY = (v) => H - PB - (v / vmax) * VH
  const vsPrev = range.intra === 1 && prevClose > 0, first = vsPrev ? prevClose : view[0][4], last = view[n - 1][4], ret = vsPrev ? last / first - 1 : windowReturn(view), up = (reb ? reb.a[n - 1] >= 100 : last >= first)
  const col = up ? "var(--up)" : "var(--down)", fmtY = reb ? (v) => `${(v - 100 >= 0 ? "+" : "") + (v - 100).toFixed(1)}%` : (v) => num(v, v < 10 ? 3 : 2)
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4), xt = [0, 0.33, 0.66, 1].map((f) => Math.round(f * (n - 1)))
  const idxAt = (e) => { const r = ref.current.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W; return Math.max(0, Math.min(n - 1, Math.round(((x - PL) / plotW) * (n - 1)))) }
  const down = (e) => { const i = idxAt(e); setHover(i); if (e.pointerType === "mouse" && e.button === 0) { setDrag({ a: i, b: i }); ref.current.setPointerCapture?.(e.pointerId) } }
  const move = (e) => { const i = idxAt(e); setHover(i); if (drag) setDrag({ a: drag.a, b: i }) }
  const up$ = () => { if (drag && Math.abs(drag.b - drag.a) >= 3) { const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b), base = zoom ? zoom[0] : 0; setZoom([base + a, base + b]); setHover(null) } setDrag(null) }
  const zoomBy = (dir) => { const c = hover ?? Math.floor(n / 2), base = zoom ? zoom[0] : 0, w = dir > 0 ? Math.max(8, Math.floor(n / 2)) : Math.min(visible.length, n * 2), a = Math.max(0, Math.min(visible.length - w, base + c - Math.floor(w / 2))); setZoom(w >= visible.length ? null : [a, a + w - 1]); setHover(null) }
  const key = (e) => { if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n - 1) - 1)) } else if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? n - 1) + 1)) } else if (e.key === "Escape") { setHover(null); setZoom(null) } }
  const hb = hover != null ? view[hover] : null, cw = Math.max(1, Math.min(10, (plotW / n) * 0.6)), tipLeft = hover != null && hover > n / 2
  const dd = maxDrawdown(view.map((b) => b[4])), hl = [Math.min(...view.map((b) => b[3] ?? b[4])), Math.max(...view.map((b) => b[2] ?? b[4]))]

  return (<div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <RangeBar />
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chart options">
        <Toggle on={mode === "line"} onClick={() => setMode("line")}>Line</Toggle><Toggle on={mode === "candle"} onClick={() => setMode("candle")} title={view.length > MAX_CANDLES ? `Candles show up to ${MAX_CANDLES} bars; zoom in or pick a shorter range` : "Candlesticks"}>Candles</Toggle>
        <Toggle on={vol} onClick={() => setVol(!vol)}>Volume</Toggle>{!intra && <Toggle on={ma} onClick={() => setMa(!ma)} title="50 and 200 day simple moving averages">SMA 50/200</Toggle>}
        {symbol !== BENCH && !intra && <Toggle on={cmp} onClick={() => setCmp(!cmp)} title={`Compare with ${BENCH}, both rebased to 100`}>vs {BENCH}</Toggle>}
        <Button size="icon" variant="outline" className="size-7" onClick={() => zoomBy(1)} aria-label="Zoom in" disabled={n <= 8}><Plus /></Button><Button size="icon" variant="outline" className="size-7" onClick={() => zoomBy(-1)} aria-label="Zoom out" disabled={!zoom}><Minus /></Button>
        <Button size="sm" variant="outline" className="h-7" onClick={() => setZoom(null)} disabled={!zoom}><RotateCcw />Reset zoom</Button></div></div>
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
      <span className={cn("num font-semibold", tone(ret))}>{reb ? `${symbol} ${pct(reb.a[n - 1] / 100 - 1, 1, true)} · ${BENCH} ${pct(reb.b[n - 1] / 100 - 1, 1, true)}` : `${pct(ret, 2, true)} (${last - first >= 0 ? "+" : ""}${num(last - first)})`}</span>
      <span className="text-muted-foreground">{barLabel(view[0][0])} → {barLabel(view[n - 1][0])} · {n} bars{zoom ? " (zoomed)" : ""}</span>
      <span className="text-muted-foreground">Range <span className="num">{price(hl[0], currency)}</span>–<span className="num">{price(hl[1], currency)}</span></span><span className="text-muted-foreground">Max drawdown <span className="num">{pct(dd, 1)}</span></span></div>
    {cmpOn && symbol !== BENCH && bench.status === "loading" && <p className="text-xs text-muted-foreground">Loading {BENCH} for comparison…</p>}
    {cmpOn && symbol !== BENCH && bench.status === "error" && <p className="text-xs text-[var(--down)]" role="alert">Could not load {BENCH}: {bench.error}. <button className="underline" onClick={bench.reload}>Retry</button></p>}
    {mode === "candle" && !candles && <p className="text-xs text-muted-foreground">{reb ? "Candles are off while comparing." : `Showing a line: ${n} bars is too many for candles (max ${MAX_CANDLES}). Zoom in or choose a shorter range.`}</p>}
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ touchAction: "pan-y" }} tabIndex={0} role="img"
        aria-label={`${symbol} price chart, ${rk}${zoom ? " zoomed" : ""}. ${hb ? `${barLabel(hb[0])} close ${num(hb[4])}.` : `Last close ${num(last)}, ${pct(ret, 2, true)} over the period.`} Use left and right arrow keys to move the crosshair, Escape to reset.`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up$} onPointerCancel={() => { setDrag(null); setHover(null) }} onPointerLeave={() => { if (!drag) setHover(null) }} onKeyDown={key}>
        {ticks.map((t, i) => <g key={i}><line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="var(--line)" opacity=".5" /><text x={W - PR + 4} y={Y(t) + 3} fontSize={fs} fill="var(--muted)" className="num">{fmtY(t)}</text></g>)}
        {xt.map((i, k) => <text key={k} x={X(i)} y={H - 4} fontSize={fs} fill="var(--muted)" textAnchor={k === 0 ? "start" : k === xt.length - 1 ? "end" : "middle"}>{barLabel(view[i][0], range.intra === 1)}</text>)}
        {reb && <line x1={PL} x2={W - PR} y1={Y(100)} y2={Y(100)} stroke="var(--muted)" strokeDasharray="4 4" opacity=".6" />}
        {candles ? view.map((b, i) => { const o = b[1] ?? b[4], c = b[4], u = c >= o, cl = u ? "var(--up)" : "var(--down)"; return <g key={i}><line x1={X(i)} x2={X(i)} y1={Y(b[2] ?? Math.max(o, c))} y2={Y(b[3] ?? Math.min(o, c))} stroke={cl} /><rect x={X(i) - cw / 2} y={Y(Math.max(o, c))} width={cw} height={Math.max(1, Math.abs(Y(o) - Y(c)))} fill={cl} /></g> })
          : <>{!reb && <path d={`${path(series)}L${X(n - 1)},${PT + ph}L${X(0)},${PT + ph}Z`} fill={col} opacity=".08" />}<path d={path(series)} fill="none" stroke={reb ? "var(--chart)" : col} strokeWidth="1.8" strokeLinejoin="round" />{series2 && <path d={path(series2)} fill="none" stroke="var(--warn)" strokeWidth="1.4" />}</>}
        {ma && smaAll && !reb && <><path d={path(smaAll.s50.slice(off, off + n))} fill="none" stroke="var(--warn)" strokeWidth="1.2" /><path d={path(smaAll.s200.slice(off, off + n))} fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeDasharray="5 3" /></>}
        {volOn && view.map((b, i) => <rect key={i} x={X(i) - Math.max(0.5, (plotW / n) * 0.35)} y={VY(b[5] || 0)} width={Math.max(1, (plotW / n) * 0.7)} height={Math.max(0, H - PB - VY(b[5] || 0))} fill={(b[4] >= (b[1] ?? view[Math.max(0, i - 1)][4])) ? "var(--up)" : "var(--down)"} opacity=".35" />)}
        {drag && Math.abs(drag.b - drag.a) > 0 && <rect x={X(Math.min(drag.a, drag.b))} y={PT} width={Math.abs(X(drag.b) - X(drag.a))} height={ph} fill="var(--accent)" opacity=".25" stroke="var(--primary)" strokeDasharray="3 3" />}
        {hb && hover != null && <g pointerEvents="none"><line x1={X(hover)} x2={X(hover)} y1={PT} y2={H - PB} stroke="var(--muted)" strokeDasharray="3 3" opacity=".7" /><circle cx={X(hover)} cy={Y(series[hover])} r="3.5" fill={reb ? "var(--chart)" : col} />{series2 && series2[hover] != null && <circle cx={X(hover)} cy={Y(series2[hover])} r="3.5" fill="var(--warn)" />}</g>}
      </svg>
      {hb && <div className={cn("pointer-events-none absolute top-1 min-w-40 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow", tipLeft ? "left-2" : "right-14")} role="status">
        <div className="mb-0.5 font-medium">{barLabel(hb[0])}{isIntraday(hb[0]) && <span className="ml-1 font-normal text-muted-foreground">local</span>}</div>
        {reb ? <div className="num space-y-0.5"><div>{symbol}: <b>{num(hb[4])}</b> <span className={tone(reb.a[hover] - 100)}>{pct(reb.a[hover] / 100 - 1, 2, true)}</span></div><div>{BENCH}: <span className={tone((reb.b[hover] ?? 100) - 100)}>{reb.b[hover] == null ? "–" : pct(reb.b[hover] / 100 - 1, 2, true)}</span></div></div>
          : <div className="num grid grid-cols-[auto_auto] gap-x-3"><span className="text-muted-foreground">Open</span><span>{num(hb[1])}</span><span className="text-muted-foreground">High</span><span>{num(hb[2])}</span><span className="text-muted-foreground">Low</span><span>{num(hb[3])}</span><span className="text-muted-foreground">Close</span><b>{num(hb[4])}</b><span className="text-muted-foreground">Volume</span><span>{hb[5] ? compact(hb[5], false) : "–"}</span><span className="text-muted-foreground">{vsPrev ? "From prev. close" : "From start"}</span><span className={tone(hb[4] - first)}>{pct(first ? hb[4] / first - 1 : null, 2, true)}</span></div>}
      </div>}
    </div>
    <p className="text-[11px] text-muted-foreground">{intra ? `${range.intra === 1 ? "5-minute" : "15-minute"} bars, refreshed every minute, shown in your local time. IEX/Yahoo volume only.` : "Daily bars, split-adjusted where the provider supports it."} {ma && !intra && !reb ? "Dashed grey = SMA 200, amber = SMA 50. " : ""}Drag on the chart to zoom, or use + / −. {longNeeded && long.status === "loading" ? "Loading longer history…" : ""}</p>
  </div>)
}
