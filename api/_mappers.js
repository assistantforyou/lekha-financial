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

module.exports = { series, cpiYoY, macroFrom, newsFrom, impactOf };
