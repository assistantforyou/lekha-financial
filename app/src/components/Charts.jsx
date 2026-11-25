import { useMemo, useState } from "react"
import { LineChart } from "@/components/common"
import { num, compact } from "@/lib/fmt"
import { cn } from "@/lib/utils"

/* Chart cards for AI answers. One entry point, <ChartCard chart={...} />, takes either a server part
   ({type:"chart", kind:"price"|"lines"|"bar"|"donut", ...}) or a spec the model wrote in a ```chart block
   ({type:"bar"|"pie"|"line", title, unit, data:[{label,value}]}). Everything is drawn with theme tokens, in SVG or
   plain elements, so it follows all themes and needs no chart library. */

const PALETTE = ["var(--chart)", "var(--s2)", "var(--s3)", "#5B9BD5", "#E07A5F", "#81B29A", "#C9A227", "#9A8C98", "#6C9A8B", "#B56576", "#7A8AA0"]
const CCY = { THB: "฿", HKD: "HK$", USD: "$" }

function fmtValue(v, unit) {
  if (v == null || !Number.isFinite(Number(v))) return "–"
  const n = Number(v)
  if (unit === "%") return `${n > 0 ? "+" : ""}${num(n, 2)}%`
  if (unit === "USD" || unit === "$") return compact(n)
  if (unit === "index") return num(n, 1)
  return `${Math.abs(n) >= 1000 ? num(n, 0) : num(n, 2)}${unit ? ` ${unit}` : ""}`
}

function Frame({ title, right, children, note }) {
  return (
    <figure className="rounded-lg border border-border bg-[var(--panel)] p-2.5">
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="font-medium">{title}</span>
        {right && <span className="shrink-0 text-muted-foreground">{right}</span>}
      </figcaption>
      {children}
      {note && <p className="mt-1.5 text-[10.5px] text-muted-foreground">{note}</p>}
    </figure>
  )
}

/* Horizontal bars. Handles negative values: the axis sits at zero and bars are coloured by sign. */
export function BarList({ items, unit }) {
  const rows = items.filter((r) => Number.isFinite(Number(r.value))).map((r) => ({ label: String(r.label), value: Number(r.value) }))
  const lo = Math.min(0, ...rows.map((r) => r.value)), hi = Math.max(0, ...rows.map((r) => r.value)), span = hi - lo || 1
  const signed = lo < 0
  const zero = (-lo / span) * 100
  return (
    <ul className="space-y-1" role="list">
      {rows.map((r, i) => {
        const w = (Math.abs(r.value) / span) * 100, left = r.value >= 0 ? zero : zero - w
        return (
          <li key={i} className="grid grid-cols-[4.5rem_1fr_4.75rem] items-center gap-2 text-xs">
            <span className="truncate font-medium" title={r.label}>{r.label}</span>
            <span className="relative h-4 rounded-sm bg-[var(--panel-2)]" aria-hidden="true">
              <span className="absolute inset-y-0 rounded-sm" style={{ left: `${left}%`, width: `${Math.max(w, 0.6)}%`, background: signed ? (r.value >= 0 ? "var(--up)" : "var(--down)") : "var(--chart)", opacity: 0.9 }} />
              {signed && <span className="absolute inset-y-0 w-px bg-[var(--muted)]/60" style={{ left: `${zero}%` }} />}
            </span>
            <span className={cn("num text-right", signed && (r.value > 0 ? "up-t" : r.value < 0 ? "down-t" : ""))}>{fmtValue(r.value, unit)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function Donut({ items, unit }) {
  const rows = items.filter((r) => Number(r.value) > 0).map((r) => ({ label: String(r.label), value: Number(r.value) }))
  const total = rows.reduce((a, r) => a + r.value, 0)
  const [hot, setHot] = useState(null)
  if (!rows.length || !(total > 0)) return null
  const R = 15.9155, C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 42 42" className="size-32 shrink-0 -rotate-90" role="img" aria-label={`Share chart: ${rows.map((r) => `${r.label} ${num((r.value / total) * 100, 1)}%`).join(", ")}`}>
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--panel-2)" strokeWidth="6" />
        {rows.map((r, i) => {
          const len = (r.value / total) * C, off = acc
          acc += len
          return <circle key={i} cx="21" cy="21" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={hot === i ? 7 : 6} strokeDasharray={`${Math.max(len - (rows.length > 1 ? 0.35 : 0), 0.01)} ${C}`} strokeDashoffset={-off} onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)} />
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-0.5 text-xs" role="list">
        {rows.map((r, i) => (
          <li key={i} className={cn("flex items-center gap-2 rounded px-1", hot === i && "bg-[var(--panel-2)]")} onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)}>
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate font-medium">{r.label}</span>
            <span className="num ml-auto">{num((r.value / total) * 100, 1)}%</span>
            <span className="num hidden w-16 text-right text-muted-foreground sm:inline">{fmtValue(r.value, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* Several series sharing one date axis, with a crosshair that reads every series at once. */
export function MultiLine({ series, unit, height = 170 }) {
  const [hover, setHover] = useState(null)
  const W = 700, H = height, P = { l: 8, r: 8, t: 10, b: 20 }
  const n = Math.max(0, ...series.map((s) => s.points.length))
  const g = useMemo(() => {
    const ys = series.flatMap((s) => s.points.map((p) => p[1])).filter((v) => Number.isFinite(v))
    if (n < 2 || ys.length < 2) return null
    let lo = Math.min(...ys), hi = Math.max(...ys)
    const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad
    const X = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r), Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
    return { X, Y, lines: series.map((s) => s.points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("")), lo, hi }
  }, [series, n, H])
  if (!g) return null
  const base = unit === "index" ? 100 : null
  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(), i = Math.round(((e.clientX - r.left) / r.width * W - P.l) / (W - P.l - P.r) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))) }
  const first = series[0].points, last = first[n - 1] || first[first.length - 1]
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none outline-none" style={{ touchAction: "pan-y" }} role="img" aria-label={`Line chart of ${series.map((s) => s.label).join(", ")}`} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)} onPointerDown={at} onPointerMove={at}>
        {base != null && g.lo < base && g.hi > base && <line x1={P.l} x2={W - P.r} y1={g.Y(base)} y2={g.Y(base)} stroke="var(--line)" strokeDasharray="4 4" />}
        {series.map((s, i) => <path key={s.label} d={g.lines[i]} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="2" strokeLinejoin="round" />)}
        {hover != null && <line x1={g.X(hover)} x2={g.X(hover)} y1={P.t} y2={H - P.b} stroke="var(--muted)" strokeDasharray="3 3" opacity=".6" />}
        {hover != null && series.map((s, i) => s.points[hover] && <circle key={s.label} cx={g.X(hover)} cy={g.Y(s.points[hover][1])} r="3.5" fill={PALETTE[i % PALETTE.length]} />)}
        <text x={P.l} y={H - 4} fontSize="10" fill="var(--muted)">{String(first[0][0]).slice(0, 10)}</text>
        <text x={W - P.r} y={H - 4} fontSize="10" fill="var(--muted)" textAnchor="end">{String(last[0]).slice(0, 10)}</text>
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute right-2 top-1 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow">
          <div className="text-muted-foreground">{String(series[0].points[hover][0]).slice(0, 10)}</div>
          {series.map((s, i) => s.points[hover] && <div key={s.label} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} /><span>{s.label}</span><b className="num ml-auto">{fmtValue(s.points[hover][1], unit)}</b></div>)}
        </div>
      )}
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" role="list">
        {series.map((s, i) => {
          const end = s.points[s.points.length - 1]
          return <li key={s.label} className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />{s.label}{end && <span className="num text-muted-foreground">{fmtValue(end[1], unit)}</span>}</li>
        })}
      </ul>
    </div>
  )
}

/* Normalise a model-written spec to the same shape the server sends, or return null when it is unusable. */
export function fromSpec(spec) {
  if (!spec || typeof spec !== "object") return null
  const type = String(spec.type || "bar").toLowerCase()
  const base = { type: "chart", title: spec.title ? String(spec.title).slice(0, 120) : null, unit: spec.unit ? String(spec.unit).slice(0, 12) : "", source: "figures from this answer" }
  const rows = (Array.isArray(spec.data) ? spec.data : []).map((r) => (Array.isArray(r) ? { label: r[0], value: Number(r[1]) } : { label: r && (r.label ?? r.name ?? r.x), value: Number(r && (r.value ?? r.y)) })).filter((r) => r.label != null && Number.isFinite(r.value)).slice(0, 40)
  if (type === "line" && Array.isArray(spec.series) && spec.series.length) {
    const series = spec.series.slice(0, 5).map((s) => ({ label: String(s.label || s.name || "Series"), points: (s.points || s.data || []).map((p) => (Array.isArray(p) ? [String(p[0]), Number(p[1])] : [String(p.label ?? p.x), Number(p.value ?? p.y)])).filter((p) => Number.isFinite(p[1])) })).filter((s) => s.points.length > 1)
    return series.length ? { ...base, kind: "lines", series } : null
  }
  if (!rows.length) return null
  if (type === "line") return rows.length > 1 ? { ...base, kind: "series", points: rows.map((r) => [String(r.label), r.value]) } : null
  if (type === "pie" || type === "donut") return { ...base, kind: "donut", items: rows }
  return { ...base, kind: "bar", items: rows }
}

export function ChartCard({ chart: c }) {
  if (!c) return null
  const kind = c.kind || (c.symbol ? "price" : null)
  if (kind === "price") {
    if (!Array.isArray(c.points) || c.points.length < 2) return null
    const sym = CCY[c.currency] || ""
    return (
      <Frame title={`${c.symbol} · last ${c.points.length} sessions`} right={c.asOf}>
        <LineChart points={c.points} height={148} format={(v) => `${sym}${Number(v).toFixed(2)}`} xLabel={(d) => String(d).slice(0, 7)} />
      </Frame>
    )
  }
  if (kind === "series") {
    return (
      <Frame title={c.title || "Trend"} right={c.asOf} note={c.source}>
        <LineChart points={c.points} height={148} format={(v) => fmtValue(v, c.unit)} xLabel={(d) => String(d).slice(0, 10)} />
      </Frame>
    )
  }
  if (kind === "lines" && Array.isArray(c.series) && c.series.length) {
    return <Frame title={c.title || "Comparison"} right={c.asOf} note={c.source}><MultiLine series={c.series} unit={c.unit} /></Frame>
  }
  if (kind === "bar" && Array.isArray(c.items) && c.items.length) {
    return <Frame title={c.title || "Chart"} right={c.asOf} note={c.source}><BarList items={c.items} unit={c.unit} /></Frame>
  }
  if (kind === "donut" && Array.isArray(c.items) && c.items.length) {
    return <Frame title={c.title || "Share"} right={c.asOf} note={c.source}><Donut items={c.items} unit={c.unit} /></Frame>
  }
  return null
}
