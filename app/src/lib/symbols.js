import ROWS from "./tickers.json"

/* Instant symbol search, no network: the S&P 500, the common ETFs, indices and crypto (tickers.json, built from SEC and the app's lists).
   Ranks exact ticker > ticker prefix > name prefix > word prefix > contains > in-order letters (so "aa" finds AAPL, AAL, AMAT...) > one typo.
   The server search (/api/data/search) fills in everything else a moment later. */
const POPULAR = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "JPM", "V", "WMT", "XOM", "UNH", "LLY", "COST", "NFLX", "AMD", "BRK.B", "SPY", "QQQ", "BTC-USD", "ORCL", "CRM", "ADBE", "KO", "PEP", "DIS", "BA", "INTC", "PYPL"]
const POP = Object.fromEntries(POPULAR.map((t, i) => [t, i]))
const index = ROWS.map(([symbol, name, type]) => ({ symbol, name, type, t: symbol.toLowerCase(), n: name.toLowerCase(), words: name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) }))

function subseq(q, s) { let i = 0, gaps = 0, last = -1; for (let k = 0; k < s.length && i < q.length; k++) if (s[k] === q[i]) { if (last >= 0 && k - last > 1) gaps++; last = k; i++ } return i === q.length ? gaps : -1 }
function oneTypo(q, s) { // true when q is within one edit of s's first q.length (+/-1) letters
  if (q.length < 3) return false
  for (const L of [q.length - 1, q.length, q.length + 1]) { const a = s.slice(0, L); if (Math.abs(a.length - q.length) > 1) continue
    let i = 0, j = 0, e = 0; while (i < q.length && j < a.length) { if (q[i] === a[j]) { i++; j++ } else { if (++e > 1) break; if (q.length > a.length) i++; else if (q.length < a.length) j++; else { i++; j++ } } }
    if (e + (q.length - i) + (a.length - j) <= 1) return true }
  return false
}
function score(q, r) {
  if (r.t === q) return 0
  if (r.t.startsWith(q)) return 1 + (r.t.length - q.length) * 0.02
  if (r.n.startsWith(q)) return 1.6
  if (r.words.some((w) => w.startsWith(q))) return 2
  if (r.t.includes(q)) return 3
  if (r.n.includes(q)) return 3.4
  if (q.length >= 2) { const g = subseq(q, r.t); if (g >= 0 && r.t.length <= q.length + 3) return 4 + g * 0.3 }
  if (q.length >= 3) { const g = subseq(q, r.n.replace(/[^a-z0-9]/g, "")); if (g >= 0 && g <= 1) return 5 + g }
  if (oneTypo(q, r.t) || r.words.some((w) => oneTypo(q, w))) return 5.5
  return null
}
export function searchLocal(query, limit = 8) {
  const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " "); if (!q) return []
  const out = []
  for (const r of index) { const s = score(q, r); if (s != null) out.push({ s: s - (POP[r.symbol] != null ? 0.5 - POP[r.symbol] * 0.01 : 0) + (r.type === "etf" ? 0.2 : 0), r }) }
  out.sort((a, b) => a.s - b.s || a.r.symbol.length - b.r.symbol.length)
  return out.slice(0, limit).map(({ r }) => ({ symbol: r.symbol, name: r.name, type: r.type, source: "local" }))
}
