// One set of number/date/currency formats for every React screen. Rates arrive as fractions; money as plain currency units.
const nf = (o) => new Intl.NumberFormat("en-US", o)
export const dash = "–"
export const num = (v, d = 2) => (v == null || !Number.isFinite(v) ? dash : nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(v))
export const price = (v, ccy = "USD") => (v == null ? dash : new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 }).format(v))
export const compact = (v, ccy) => { if (v == null || !Number.isFinite(v)) return dash; const a = Math.abs(v), s = v < 0 ? "-" : "", p = ccy === false ? "" : "$"; return a >= 1e12 ? `${s}${p}${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${s}${p}${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}${p}${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}${p}${(a / 1e3).toFixed(1)}K` : `${s}${p}${a.toFixed(0)}` }
export const pct = (f, d = 2, sign = false) => (f == null || !Number.isFinite(f) ? dash : `${sign && f > 0 ? "+" : ""}${(f * 100).toFixed(d)}%`)
export const mult = (v, d = 1) => (v == null || !Number.isFinite(v) ? dash : `${v.toFixed(d)}x`)
export const tone = (v) => (v > 0 ? "up-t" : v < 0 ? "down-t" : "")
export const date = (d) => { if (!d) return dash; const x = new Date(d); return Number.isNaN(+x) ? String(d) : x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) }
export const dateTime = (d) => { if (!d) return dash; const x = new Date(d); return Number.isNaN(+x) ? String(d) : x.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) }
export const ago = (d) => { const s = (Date.now() - Date.parse(d)) / 1000; if (!Number.isFinite(s)) return dash; return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago` }
// format a metric object from the calculation engine according to its unit
export const metric = (m) => (m.value == null ? dash : m.unit === "fraction" ? pct(m.value) : m.unit === "USD" ? compact(m.value) : m.unit === "x" ? mult(m.value) : num(m.value))
