import { useMemo, useState } from "react"
import { AlertTriangle, Database, Inbox, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ago, date } from "@/lib/fmt"

/* Source attribution used everywhere: where a datum came from, when, whether it is reported or calculated, how fresh it is. */
export function SourceTag({ meta, source, asOf, kind, className }) {
  const m = meta || {}, src = source || m.source || (m.meta && m.meta.source), k = kind || (m.meta && m.meta.kind) || m.kind
  if (!src) return null
  const t = asOf || (m.meta && m.meta.asOf) || m.asOf
  const tip = [`Source: ${src}`, t ? `As of ${date(t)}` : null, k ? (k === "calculated" ? "Calculated by the app" : "Reported / provider data") : null, m.stale ? "Showing cached data (provider unavailable)" : null, m.cache ? `Cache: ${m.cache}` : null].filter(Boolean).join(" · ")
  return <Tooltip content={tip}><span className={cn("inline-flex items-center gap-1 text-[11px] text-muted-foreground", className)}><Database className="size-3" />{src}{t ? ` · ${ago(t)}` : ""}{k === "calculated" ? " · calc" : ""}{m.stale ? " · stale" : ""}</span></Tooltip>
}
export const PageHeader = ({ title, description, children, meta }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>{description && <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">{description}</p>}{meta}</div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>)
// loading / error / empty are identical on every screen
export function DataState({ s, empty, children, rows = 4 }) {
  if (!s || s.status === "loading") return <div className="space-y-2" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-5" style={{ width: `${95 - i * 12}%` }} />)}</div>
  if (s.status === "error") return <ErrorBox message={s.error} attempts={s.attempts} onRetry={s.reload} />
  if (empty && (s.data == null || (Array.isArray(s.data) && !s.data.length))) return <EmptyBox>{empty}</EmptyBox>
  return children
}
export const ErrorBox = ({ message, attempts, onRetry }) => (
  <div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,var(--down)_40%,var(--border))] bg-[color-mix(in_srgb,var(--down)_8%,transparent)] p-3 text-sm" role="alert">
    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--down)]" />
    <div className="min-w-0 flex-1"><div className="font-medium">This data could not be loaded</div><div className="text-[13px] text-muted-foreground">{message}</div>
      {attempts && attempts.length ? <div className="mt-1 text-[11px] text-muted-foreground">Tried: {attempts.map((a) => `${a.provider} (${a.status})`).join(" → ")}</div> : null}</div>
    {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw />Retry</Button>}
  </div>)
export const EmptyBox = ({ children }) => <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"><Inbox className="size-4" />{children}</div>
export const Stat = ({ label, value, sub, tone, hint }) => (
  <div className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3"><div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}{hint && <Tooltip content={hint}><span className="cursor-help rounded-full border border-border px-1 text-[9px] normal-case">i</span></Tooltip>}</div>
    <div className={cn("num mt-1 truncate text-lg font-semibold", tone)}>{value}</div>{sub && <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{sub}</div>}</div>)
export const FreshBadge = ({ meta }) => { const f = meta && meta.freshness; if (!f) return null; return <Badge variant={f === "realtime" ? "up" : f === "delayed" ? "warn" : "outline"}>{f}</Badge> }

/* Line / area chart with crosshair tooltip. points: [[x(label), value], ...] */
export function LineChart({ points, height = 220, format = (v) => v.toFixed(2), color = "var(--chart)", area = true, ref0, xLabel = (x) => x }) {
  const [hover, setHover] = useState(null)
  const W = 700, H = height, P = { l: 8, r: 8, t: 10, b: 20 }
  const g = useMemo(() => {
    const ys = points.map((p) => p[1]).filter((v) => v != null); if (ys.length < 2) return null
    let lo = Math.min(...ys), hi = Math.max(...ys); if (ref0 != null) { lo = Math.min(lo, ref0); hi = Math.max(hi, ref0) } const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad
    const X = (i) => P.l + (i / (points.length - 1)) * (W - P.l - P.r), Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
    const d = points.map((p, i) => (p[1] == null ? "" : `${i && points[i - 1][1] != null ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`)).join("")
    return { X, Y, d, lo, hi }
  }, [points, H])
  if (!g) return <EmptyBox>Not enough data to chart.</EmptyBox>
  const hp = hover != null ? points[hover] : null
  return (<div className="relative">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" role="img" aria-label="Line chart" onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), i = Math.round(((e.clientX - r.left) / r.width * W - P.l) / (W - P.l - P.r) * (points.length - 1)); setHover(Math.max(0, Math.min(points.length - 1, i))) }} onTouchStart={(e) => { if (!e.touches.length) return; const r = e.currentTarget.getBoundingClientRect(), i = Math.round(((e.touches[0].clientX - r.left) / r.width * W - P.l) / (W - P.l - P.r) * (points.length - 1)); setHover(Math.max(0, Math.min(points.length - 1, i))) }} onTouchMove={(e) => { if (!e.touches.length) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(), i = Math.round(((e.touches[0].clientX - r.left) / r.width * W - P.l) / (W - P.l - P.r) * (points.length - 1)); setHover(Math.max(0, Math.min(points.length - 1, i))) }} onTouchEnd={() => setHover(null)}>
      {ref0 != null && <line x1={P.l} x2={W - P.r} y1={g.Y(ref0)} y2={g.Y(ref0)} stroke="var(--line)" strokeDasharray="4 4" />}
      {area && <path d={`${g.d}L${g.X(points.length - 1)},${H - P.b}L${g.X(0)},${H - P.b}Z`} fill={color} opacity=".1" />}
      <path d={g.d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {hp && hp[1] != null && <g><line x1={g.X(hover)} x2={g.X(hover)} y1={P.t} y2={H - P.b} stroke="var(--muted)" strokeDasharray="3 3" opacity=".6" /><circle cx={g.X(hover)} cy={g.Y(hp[1])} r="4" fill={color} /></g>}
      <text x={P.l} y={H - 4} fontSize="10" fill="var(--muted)">{xLabel(points[0][0])}</text><text x={W - P.r} y={H - 4} fontSize="10" fill="var(--muted)" textAnchor="end">{xLabel(points[points.length - 1][0])}</text>
    </svg>
    {hp && hp[1] != null && <div className="pointer-events-none absolute right-2 top-1 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow"><span className="text-muted-foreground">{xLabel(hp[0])}</span> <b className="num">{format(hp[1])}</b></div>}
  </div>)
}
/* Grouped bars for statements (values already in display units). rows: [{label, a, b?}] */
export function Bars({ rows, format = (v) => v.toFixed(1), height = 180, color = "var(--chart)" }) {
  const vals = rows.map((r) => r.v).filter((v) => v != null); if (!vals.length) return <EmptyBox>No data.</EmptyBox>
  const max = Math.max(...vals.map(Math.abs), 1e-9), W = 700, H = height, bw = Math.min(46, (W / rows.length) * 0.6)
  return (<svg viewBox={`0 0 ${W} ${H + 22}`} className="h-auto w-full" role="img">
    <line x1="0" x2={W} y1={H / 2 + (vals.some((v) => v < 0) ? 0 : H / 2)} y2={H / 2 + (vals.some((v) => v < 0) ? 0 : H / 2)} stroke="var(--line)" />
    {rows.map((r, i) => { const base = vals.some((v) => v < 0) ? H / 2 : H, h = r.v == null ? 0 : (Math.abs(r.v) / max) * (vals.some((v) => v < 0) ? H / 2 - 14 : H - 18), x = (i + 0.5) * (W / rows.length) - bw / 2, y = r.v != null && r.v < 0 ? base : base - h
      return <g key={i}><rect x={x} y={y} width={bw} height={Math.max(h, 0)} rx="3" fill={r.v != null && r.v < 0 ? "var(--down)" : color} opacity=".9"><title>{`${r.label}: ${r.v == null ? "n/a" : format(r.v)}`}</title></rect>
        <text x={x + bw / 2} y={r.v != null && r.v < 0 ? y + h + 11 : y - 4} fontSize="10.5" textAnchor="middle" fill="var(--fg)" className="num">{r.v == null ? "" : format(r.v)}</text>
        <text x={x + bw / 2} y={H + 16} fontSize="10.5" textAnchor="middle" fill="var(--muted)">{r.label}</text></g> })}
  </svg>)
}
export const Spark = ({ points, up, w = 96, h = 28 }) => { const v = points.map((p) => p[1]).filter((x) => x != null); if (v.length < 2) return null; const lo = Math.min(...v), hi = Math.max(...v), X = (i) => (i / (v.length - 1)) * w, Y = (x) => h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 4); return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d={v.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join("")} fill="none" stroke={up == null ? "var(--chart)" : up ? "var(--up)" : "var(--down)"} strokeWidth="1.6" /></svg> }
