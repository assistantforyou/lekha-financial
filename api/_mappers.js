// Pure mappers: Alpha Vantage responses -> the shapes the page's parsers read. No network, no secrets.
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// AV series ({data:[{date,value}]}, newest first) -> ascending [[date, value]]
function series(json) {
  const rows = (json && Array.isArray(json.data) ? json.data : [])
    .map((r) => [String(r.date), num(r.value)])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[1] !== null);
  return rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function cpiYoY(cpiJson) {
  const s = series(cpiJson);
  const out = [];
  for (let i = 12; i < s.length; i++) out.push([s[i][0], round((s[i][1] / s[i - 12][1] - 1) * 100)]);
  return out;
}

const tail = (a, n) => a.slice(Math.max(0, a.length - n));

// the page's macro panel reads m.sources.* for its footnote links
const MACRO_META = {
  source: "Alpha Vantage",
  sources: {
    cpi: "https://www.alphavantage.co/documentation/#cpi",
    fedFunds: "https://www.alphavantage.co/documentation/#fed-funds-rate",
    tenYear: "https://www.alphavantage.co/documentation/#treasury-yield",
  },
  notes: "Delivered by Alpha Vantage (monthly); CPI YoY is computed from the monthly CPI index.",
};

function macroFrom(cpiJson, ffJson, tyJson) {
  const cpiYoYS = tail(cpiYoY(cpiJson), 180);
  const fedFunds = tail(series(ffJson), 180).map(([d, v]) => [d, round(v)]);
  const tenYear = tail(series(tyJson), 180).map(([d, v]) => [d, round(v)]);
  if (!cpiYoYS.length && !fedFunds.length && !tenYear.length) return null;
  return { cpiYoY: cpiYoYS, fedFunds, tenYear, ...MACRO_META, asOf: new Date().toISOString().slice(0, 10) };
}

function impactOf(label) {
  const l = String(label || "").toLowerCase();
  return l.includes("bull") ? "Bullish" : l.includes("bear") ? "Bearish" : "Mixed";
}

// NEWS_SENTIMENT feed -> [{id:'YYYY-MM-DD', data:{date, macro, items[]}}], newest day first
function newsFrom(json) {
  const feed = json && Array.isArray(json.feed) ? json.feed : [];
  const byDay = new Map();
  for (const f of feed) {
    const m = /^(\d{4})(\d{2})(\d{2})T/.exec(String(f.time_published || ""));
    if (!m || !/^https?:\/\//i.test(String(f.url || ""))) continue;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const items = byDay.get(date) || [];
    if (items.length >= 12) continue;
    const score = num(f.overall_sentiment_score);
    items.push({
      headline: String(f.title || "").slice(0, 300),
      url: String(f.url),
      source: String(f.source || "").slice(0, 80),
      summary: String(f.summary || "").slice(0, 400),
      impact: impactOf(f.overall_sentiment_label),
      why: `Alpha Vantage sentiment: ${f.overall_sentiment_label || "n/a"}${score === null ? "" : " (" + round(score) + ")"}`,
      tickers: (Array.isArray(f.ticker_sentiment) ? f.ticker_sentiment : []).slice(0, 4).map((t) => String(t.ticker || "").slice(0, 12)).filter(Boolean),
    });
    byDay.set(date, items);
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ id: date, data: { date, macro: "Headlines and sentiment scores from Alpha Vantage News & Sentiment.", items } }));
}

// TIME_SERIES_DAILY -> ascending [[date, close]] (free tier returns the latest ~100 trading days)
function dailyFrom(json) {
  const ts = json && json["Time Series (Daily)"];
  if (!ts || typeof ts !== "object") return null;
  const rows = Object.entries(ts)
    .map(([d, v]) => [d, num(v && v["4. close"])])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[1] !== null && r[1] > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return rows.length ? rows : null;
}

// {SYM: [[date, close]]} -> the CSV layout parseRotation() reads:
// header "D|SYM" at column j with closes at j+1 (spreadsheet date serials, data from row 3),
// then LIVE|SYM / TDATE|SYM cells in row 2.
function rotationCsv(bySym) {
  const syms = Object.keys(bySym).filter((k) => bySym[k] && bySym[k].length);
  if (!syms.length) return null;
  const n = Math.max(...syms.map((k) => bySym[k].length));
  const header = [], row1 = [];
  for (const k of syms) {
    const s = bySym[k];
    header.push("D|" + k, ""); row1.push("", "");
    header.push("LIVE|" + k); row1.push(String(s[s.length - 1][1]));
    header.push("TDATE|" + k); row1.push(s[s.length - 1][0]);
  }
  const lines = [header, row1];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (const k of syms) {
      const s = bySym[k][i];
      row.push(s ? String(Math.round(Date.parse(s[0] + "T00:00:00Z") / 864e5) + 25569) : "", s ? String(s[1]) : "", "", "");
    }
    lines.push(row);
  }
  return lines.map((r) => r.join(",")).join("\n");
}

// ---- FRED (keyless fredgraph.csv) ----
// "observation_date,ID\n2026-10-01,5.24\n2026-10-12,\n" -> ascending [[date, value]] (blank = missing, skipped)
function fredRows(csv) {
  const out = [];
  for (const line of String(csv || "").split("\n").slice(1)) {
    const [d, v] = line.trim().split(",");
    const n = num(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || "") && n !== null) out.push([d, n]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function yoyRows(rows) {
  const byMonth = new Map(rows.map(([d, v]) => [d.slice(0, 7), v]));
  const out = [];
  for (const [d, v] of rows) {
    const prev = byMonth.get(`${Number(d.slice(0, 4)) - 1}-${d.slice(5, 7)}`);
    if (prev > 0) out.push([d, round((v / prev - 1) * 100)]);
  }
  return out;
}

// monthly CPI (NSA index), effective fed funds, 10y -> the meta/macro doc
function macroFromFred(cpiRows, ffRows, tyRows) {
  const cpiYoYS = tail(yoyRows(cpiRows), 180);
  const fedFunds = tail(ffRows, 180).map(([d, v]) => [d, round(v)]);
  const tenYear = tail(tyRows, 180).map(([d, v]) => [d, round(v)]);
  if (!cpiYoYS.length && !fedFunds.length && !tenYear.length) return null;
  return {
    cpiYoY: cpiYoYS, fedFunds, tenYear, source: "FRED",
    sources: {
      cpi: "https://fred.stlouisfed.org/series/CPIAUCNS",
      fedFunds: "https://fred.stlouisfed.org/series/FEDFUNDS",
      tenYear: "https://fred.stlouisfed.org/series/GS10",
    },
    notes: "CPI is the not-seasonally-adjusted index (CPIAUCNS), shown as 12-month change; the 10-year line is the monthly average (GS10).",
    asOf: new Date().toISOString().slice(0, 10),
  };
}

// {ID: rows} -> meta/fredhist doc: {series:{ID:{"YYYY-MM": value}}}
function fredHistFrom(byId) {
  const series = {};
  for (const [id, rows] of Object.entries(byId)) {
    const m = {};
    for (const [d, v] of rows) m[d.slice(0, 7)] = v;
    series[id] = m;
  }
  return Object.values(series).some((m) => Object.keys(m).length) ? { series, source: "FRED", asOf: new Date().toISOString().slice(0, 10) } : null;
}

// ---- breadth: per-stock "above the 50/200-day average" flags ----
// closes ascending. Flags are 10 chars: for offsets [0,5,21,63,126] trading days ago, [above 50d, above 200d];
// "x" = not enough history for that average. This is the encoding the page's parseBreadth() reads.
const BREADTH_OFFSETS = [0, 5, 21, 63, 126];
function breadthFlags(closes) {
  const L = closes.length;
  let flags = "";
  for (const off of BREADTH_OFFSETS) {
    const i = L - 1 - off;
    for (const n of [50, 200]) {
      if (i < n - 1) { flags += "x"; continue; }
      let sum = 0;
      for (let k = i - n + 1; k <= i; k++) sum += closes[k];
      flags += closes[i] > sum / n ? "1" : "0";
    }
  }
  return flags;
}

// [[ticker, sector, n, lastClose, flags, lastDate]] -> CSV in the layout parseBreadth() reads
function breadthCsv(rows, calcAt) {
  const lines = ["Ticker,Sector,Data,Last close date,Calculated at (sheet time)"];
  for (const [tk, sec, n, last, flags, date] of rows) lines.push(`${tk},${sec},${n};${last};${flags},${date},${calcAt}`);
  return lines.join("\n");
}

// ---- overbought/oversold: per-session RSI bucket + above-50d codes ----
// Wilder RSI(14): seed = simple mean of the first 14 gains/losses, then (prev*13+x)/14. null until 15 closes.
function wilderRSI(c) {
  const n = c.length, r = new Array(n).fill(null);
  if (n < 15) return r;
  let ag = 0, al = 0;
  for (let i = 1; i <= 14; i++) { const d = c[i] - c[i - 1]; ag += Math.max(d, 0); al += Math.max(-d, 0); }
  ag /= 14; al /= 14;
  r[14] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = 15; i < n; i++) {
    const d = c[i] - c[i - 1];
    ag = (ag * 13 + Math.max(d, 0)) / 14; al = (al * 13 + Math.max(-d, 0)) / 14;
    r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return r;
}

// bars [[date, close]] ascending, cal = SPY session dates ascending (the window to encode).
// Two chars per session: RSI bucket (o < 30, b > 70, n otherwise, x unavailable) then close above its 50d average (1/0/x).
// A session with no bar for this stock is "xx". Returns "lastDate|n|chars" as parseObos() reads it.
function obCodes(bars, cal) {
  const closes = bars.map((b) => b[1]);
  const rsi = wilderRSI(closes);
  const at = new Map(bars.map((b, i) => [b[0], i]));
  let chars = "";
  for (const d of cal) {
    const i = at.get(d);
    if (i === undefined) { chars += "xx"; continue; }
    chars += rsi[i] == null ? "x" : rsi[i] < 30 ? "o" : rsi[i] > 70 ? "b" : "n";
    if (i < 49) { chars += "x"; continue; }
    let sum = 0;
    for (let k = i - 49; k <= i; k++) sum += closes[k];
    chars += closes[i] > sum / 50 ? "1" : "0";
  }
  return `${cal[cal.length - 1]}|${cal.length}|${chars}`;
}

// stocks [[tk, sector, industry, codes]], etf {SYM: [[date, close]]} -> CSV parseObos() reads
function obosCsv(stocks, etf, calcAt, etfBars = 260) {
  const lines = ["Ticker,Group,Industry,Codes,Closes,Calculated at (sheet time)"];
  const q = (v) => (/[",]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  for (const [tk, sec, ind, codes] of stocks) lines.push(`${tk},${q(sec)},${q(ind || "")},${codes},,${calcAt}`);
  for (const [sym, rows] of Object.entries(etf)) {
    const closes = rows.slice(-etfBars).map(([d, c]) => `${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}:${c}`).join(";");
    lines.push(`${sym},ETF,,,${closes},${calcAt}`);
  }
  return lines.join("\n");
}

// ---- HISTORY: daily + weekly closes per symbol, in the layout parseHistory() reads ----
const serial = (d) => Math.round(Date.parse(d + "T00:00:00Z") / 864e5) + 25569;
// last close of each ISO week, ascending
function weeklyFrom(rows) {
  const out = [];
  let key = null;
  for (const [d, c] of rows) {
    const t = new Date(d + "T00:00:00Z");
    const wk = new Date(t); wk.setUTCDate(wk.getUTCDate() - ((t.getUTCDay() + 6) % 7)); // Monday of that week
    const k = wk.toISOString().slice(0, 10);
    if (k === key) out[out.length - 1] = [d, c]; else { out.push([d, c]); key = k; }
  }
  return out;
}
// labelled: {LABEL: [[date, close]]} (label is the symbol the page asks for), tnx: live 10y yield or null.
// Columns come in pairs: header "D|LABEL" / "W|LABEL" then closes in the next column; row 2 holds LIVE values.
function historyCsv(labelled, tnx) {
  const cols = [];
  for (const [label, rows] of Object.entries(labelled)) {
    if (!rows || !rows.length) continue;
    cols.push({ h: "D|" + label, rows }); cols.push({ h: "W|" + label, rows: weeklyFrom(rows) });
  }
  if (!cols.length) return null;
  const n = Math.max(...cols.map((c) => c.rows.length));
  const header = [], live = [];
  for (const c of cols) { header.push(c.h, ""); live.push("", ""); }
  if (tnx != null) { header.push("LIVE|TNX10Y", ""); live.push(String(tnx), ""); }
  const lines = [header.join(","), live.join(",")];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (const c of cols) { const r = c.rows[i]; row.push(r ? String(serial(r[0])) : "", r ? String(r[1]) : ""); }
    if (tnx != null) row.push("", "");
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

module.exports = { weeklyFrom, historyCsv, wilderRSI, obCodes, obosCsv, breadthFlags, breadthCsv, fredRows, yoyRows, macroFromFred, fredHistFrom, series, cpiYoY, macroFrom, newsFrom, impactOf, dailyFrom, rotationCsv };
