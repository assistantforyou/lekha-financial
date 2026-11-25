// Pure chart maths (no React): range slicing, moving averages, rebasing for comparison, 52-week stats.
// Bars are [date "YYYY-MM-DD", open, high, low, close, volume] as served by /api/data/history.

export const RANGES = [
  { k: "1D", intra: 1 }, { k: "5D", intra: 5 }, { k: "1M", bars: 21 }, { k: "3M", bars: 63 }, { k: "6M", bars: 126 },
  { k: "YTD", ytd: true }, { k: "1Y", bars: 252 }, { k: "5Y", bars: 1260, days: 1900 }, { k: "MAX", bars: Infinity, days: 3650 },
]

// calendar days the provider must cover for a range; the bundle already carries 730
export const daysFor = (r) => (r.days ? r.days : 730)

export function sliceRange(bars, r, today = new Date()) {
  if (!bars || !bars.length) return []
  if (r.intra) return bars.slice()                                  // intraday ranges are fetched as exactly the sessions they show
  if (r.ytd) { const y = `${today.getUTCFullYear()}-01-01`; const i = bars.findIndex((b) => b[0] >= y); return i < 0 ? bars.slice(-1) : bars.slice(Math.max(0, i - 1)) }  // include last close of prior year so YTD return is correct
  return r.bars === Infinity ? bars.slice() : bars.slice(-(r.bars + 1))                                                                                            // N bars of change need N+1 closes
}

// simple moving average over closes; null until a full window exists
export function sma(closes, n) {
  const out = new Array(closes.length).fill(null); let sum = 0
  for (let i = 0; i < closes.length; i++) { sum += closes[i]; if (i >= n) sum -= closes[i - n]; if (i >= n - 1) out[i] = sum / n }
  return out
}

// total return over a window of bars (fraction), null if not computable
export const windowReturn = (bars) => (bars.length > 1 && bars[0][4] > 0 ? bars[bars.length - 1][4] / bars[0][4] - 1 : null)

// Align `other` bars to `bars` by date (carry last known close forward over holidays) and rebase both to 100 at the first aligned date.
export function rebasePair(bars, other) {
  if (!bars.length || !other || !other.length) return null
  const m = new Map(other.map((b) => [b[0], b[4]])); let last = null, j = 0
  const sorted = other, aligned = bars.map((b) => { while (j < sorted.length && sorted[j][0] <= b[0]) { last = sorted[j][4]; j++ } return m.has(b[0]) ? m.get(b[0]) : last })
  const i0 = aligned.findIndex((v) => v != null && v > 0); if (i0 < 0) return null
  const a0 = bars[i0][4], b0 = aligned[i0]
  return { start: i0, a: bars.map((b, i) => (i < i0 ? null : (b[4] / a0) * 100)), b: aligned.map((v, i) => (i < i0 || v == null ? null : (v / b0) * 100)) }
}

// 52-week range, volume and day stats derived from daily bars (last 252 trading bars)
export function keyStats(bars) {
  if (!bars || bars.length < 2) return null
  const yr = bars.slice(-252), last = bars[bars.length - 1], prev = bars[bars.length - 2]
  const hi = Math.max(...yr.map((b) => b[2] ?? b[4])), lo = Math.min(...yr.map((b) => b[3] ?? b[4]))
  const v30 = bars.slice(-31, -1).map((b) => b[5]).filter((v) => v > 0)
  return { prevClose: prev[4], open: last[1], dayHigh: last[2], dayLow: last[3], volume: last[5], avgVolume: v30.length ? v30.reduce((s, v) => s + v, 0) / v30.length : null, hi52: hi, lo52: lo, fromHigh: last[4] / hi - 1, fromLow: last[4] / lo - 1, asOf: last[0] }
}

// max drawdown (fraction, negative) over closes
export function maxDrawdown(closes) { let peak = -Infinity, dd = 0; for (const c of closes) { if (c > peak) peak = c; const d = c / peak - 1; if (d < dd) dd = d } return dd }

// bar timestamps: "YYYY-MM-DD" for daily bars, full UTC ISO ("...T14:35:00Z") for intraday. Intraday is shown in the viewer's local time.
export const isIntraday = (d) => typeof d === "string" && d.length > 10 && d.includes("T")
export function barLabel(d, short = false) {
  if (!isIntraday(d)) { const x = new Date(d); return Number.isNaN(+x) ? String(d) : x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: short ? undefined : "numeric" }) }
  const x = new Date(d); if (Number.isNaN(+x)) return String(d)
  const t = x.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  return short ? t : `${x.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${t}`
}
