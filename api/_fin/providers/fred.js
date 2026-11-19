// FRED (St. Louis Fed). Keyless CSV endpoint; FRED_API_KEY is not needed. Free to display with attribution; some series carry third-party notices (e.g. UMCSENT, University of Michigan).
const { request } = require("../http");
const { fredRows } = require("../../_mappers");
const S = require("../schemas");
const obs = require("../obs");
const { cacheFetch } = require("../cache");
const name = "fred";

// id -> display metadata. `transform: "yoy"` turns an index level into a year-over-year fraction; `"diff"` is a first difference (e.g. payroll change in thousands).
const CATALOG = {
  FEDFUNDS: { name: "Federal funds effective rate", unit: "percent", frequency: "monthly", group: "Rates" },
  DGS3MO: { name: "3-month Treasury yield", unit: "percent", frequency: "daily", group: "Rates" },
  DGS2: { name: "2-year Treasury yield", unit: "percent", frequency: "daily", group: "Rates" },
  DGS10: { name: "10-year Treasury yield", unit: "percent", frequency: "daily", group: "Rates" },
  DGS30: { name: "30-year Treasury yield", unit: "percent", frequency: "daily", group: "Rates" },
  T10Y2Y: { name: "10y minus 2y Treasury spread", unit: "percent", frequency: "daily", group: "Rates" },
  MORTGAGE30US: { name: "30-year fixed mortgage rate", unit: "percent", frequency: "weekly", group: "Rates" },
  CPIAUCSL: { name: "CPI, all items (year over year)", unit: "fraction", frequency: "monthly", group: "Inflation", transform: "yoy", base: "CPIAUCSL" },
  CPILFESL: { name: "Core CPI (year over year)", unit: "fraction", frequency: "monthly", group: "Inflation", transform: "yoy", base: "CPILFESL" },
  PCEPILFE: { name: "Core PCE price index (year over year)", unit: "fraction", frequency: "monthly", group: "Inflation", transform: "yoy", base: "PCEPILFE" },
  PPIACO: { name: "PPI, all commodities (year over year)", unit: "fraction", frequency: "monthly", group: "Inflation", transform: "yoy", base: "PPIACO" },
  UNRATE: { name: "Unemployment rate", unit: "percent", frequency: "monthly", group: "Labor" },
  PAYEMS: { name: "Nonfarm payrolls, monthly change", unit: "thousands of jobs", frequency: "monthly", group: "Labor", transform: "diff", base: "PAYEMS" },
  ICSA: { name: "Initial jobless claims", unit: "claims", frequency: "weekly", group: "Labor" },
  GDPC1: { name: "Real GDP (year over year)", unit: "fraction", frequency: "quarterly", group: "Growth", transform: "yoy4", base: "GDPC1" },
  UMCSENT: { name: "Consumer sentiment (U. Michigan)", unit: "index", frequency: "monthly", group: "Sentiment" },
  M2SL: { name: "M2 money supply (year over year)", unit: "fraction", frequency: "monthly", group: "Money", transform: "yoy", base: "M2SL" },
  VIXCLS: { name: "CBOE Volatility Index (VIX)", unit: "index", frequency: "daily", group: "Markets" },
};
const raw = (id, since = "2000-01-01") => cacheFetch("macro", "raw/" + id, () => obs.timed(name, "csv", async () => {
  const t = await request("fred", `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${since}`, { text: true, headers: { "User-Agent": "portfolio-terminal/1.0 (research app)" } });
  const rows = fredRows(t); if (!rows.length) throw new Error("fred_empty"); return rows;
})).then((x) => x.value);

function transform(rows, kind) {
  if (kind === "yoy") return rows.map((r, i) => (i >= 12 && rows[i - 12][1] > 0 ? [r[0], r[1] / rows[i - 12][1] - 1] : null)).filter(Boolean);
  if (kind === "yoy4") return rows.map((r, i) => (i >= 4 && rows[i - 4][1] > 0 ? [r[0], r[1] / rows[i - 4][1] - 1] : null)).filter(Boolean);
  if (kind === "diff") return rows.map((r, i) => (i >= 1 ? [r[0], r[1] - rows[i - 1][1]] : null)).filter(Boolean);
  return rows;
}
async function series(id, { years = 10 } = {}) {
  const c = CATALOG[id]; if (!c) throw new Error("fred_unknown_series");
  const rows = transform(await raw(c.base || id), c.transform), keep = c.frequency === "daily" ? years * 260 : c.frequency === "weekly" ? years * 52 : c.frequency === "monthly" ? years * 12 : years * 4;
  return S.macroSeries({ id, name: c.name, unit: c.unit, frequency: c.frequency, group: c.group, transform: c.transform || "level", points: rows.slice(-keep).map((r) => [r[0], Math.round(r[1] * 1e6) / 1e6]), source: "FRED" });
}
module.exports = { name, configured: () => true, license: "Free with attribution to FRED; third-party series (e.g. UMCSENT) keep their owners' terms. No resale.", CATALOG, series };
