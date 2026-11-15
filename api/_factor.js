// FACTOR dataset: weekly closes for the factor ETFs, sector/industry ETFs and (optionally) the user's holdings,
// in the layout parseFactor() reads. ETF history is cached daily; holdings are fetched on demand (POST body, rate-limited).
const { getSeries } = require("./_prices");
const { cached } = require("./_lib");
const { weeklyFrom } = require("./_mappers");
const { cleanSymbols, seriesFor, rateLimited } = require("./_history");

const FACTORS = ["SPY", "IWM", "IWD", "IWF", "SPMO", "IEF"];
const GROUPS = ["XLB", "XLC", "XLE", "XLF", "XLI", "XLK", "XLP", "XLRE", "XLU", "XLV", "XLY", "SMH", "ITA"];
const H12 = 12 * 36e5;
const y6 = (d) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);

function factorCsv(entries, calcAt) {
  const lines = ["Ticker,Kind,Weekly closes (yymmdd:close),Calculated at (sheet time)"];
  for (const { tk, kind, weekly } of entries) {
    if (!weekly || weekly.length < 2) continue;
    lines.push(`${tk},${kind},${weekly.map(([d, c]) => `${y6(d)}:${c}`).join(";")},${calcAt}`);
  }
  return lines.length > 1 ? lines.join("\n") : null;
}

// ~10 years of daily bars -> weekly closes, for all factor and group ETFs (one cached refresh per 12h)
const etfWeekly = () => cached("free/factor/etf", H12, async () => {
  const { data } = await getSeries([...FACTORS, ...GROUPS], 3700, { fallback: false });
  const out = {};
  for (const s of [...FACTORS, ...GROUPS]) if (data[s] && data[s].length) out[s] = weeklyFrom(data[s]);
  return out.SPY ? out : null;
});

async function factor(req, res) {
  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const holdings = cleanSymbols(body.symbols).filter((s) => !FACTORS.includes(s) && !GROUPS.includes(s));
  const etf = await etfWeekly();
  if (!etf) return res.status(204).end();
  const entries = [];
  for (const s of FACTORS) if (etf[s]) entries.push({ tk: s, kind: "Factor", weekly: etf[s] });
  for (const s of GROUPS) if (etf[s]) entries.push({ tk: s, kind: "Sector", weekly: etf[s] });
  if (holdings.length) {
    if (await rateLimited(req)) { res.setHeader("Cache-Control", "no-store"); return res.status(429).end(); }
    const data = await seriesFor(holdings); // ~5.5 years of daily bars each
    for (const s of holdings) if (data[s]) entries.push({ tk: s, kind: "Holding", weekly: weeklyFrom(data[s]) });
  }
  const csv = factorCsv(entries, new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
  if (!csv) return res.status(204).end();
  res.setHeader("Cache-Control", holdings.length ? "no-store" : "public, s-maxage=900, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(csv);
}

module.exports = { factor, factorCsv, FACTORS, GROUPS };
