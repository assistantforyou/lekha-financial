// Capital-flow sources, keyless: CFTC Traders in Financial Futures (Socrata) and Treasury TIC (slt_table1.txt).
const UA = { "User-Agent": "portfolio-terminal/1.0 (personal dashboard)" };

// rows: Socrata records for one contract -> "YYYY-MM-DD,long,short;..." (long/short for one trader class)
function cftcSeries(rows, longKey, shortKey) {
  const out = [];
  for (const r of rows || []) {
    const d = String(r.report_date_as_yyyy_mm_dd || "").slice(0, 10);
    const l = Number(r[longKey]), s = Number(r[shortKey]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(l) && Number.isFinite(s)) out.push([d, l, s]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return out.map((x) => x.join(",")).join(";");
}

const CONTRACTS = { ES: "13874A", NQ: "209742" }; // E-mini S&P 500, Nasdaq-100 mini (CME)
async function fetchCftc() {
  const series = {};
  const since = new Date(Date.now() - 5.2 * 365 * 864e5).toISOString().slice(0, 10);
  for (const [k, code] of Object.entries(CONTRACTS)) {
    const q = new URLSearchParams({ $where: `cftc_contract_market_code='${code}' AND report_date_as_yyyy_mm_dd>='${since}'`, $order: "report_date_as_yyyy_mm_dd DESC", $limit: "400" });
    const r = await fetch(`https://publicreporting.cftc.gov/resource/gpe5-46if.json?${q}`, { headers: UA });
    if (!r.ok) throw new Error("cftc_" + r.status);
    const rows = await r.json();
    const am = cftcSeries(rows, "asset_mgr_positions_long", "asset_mgr_positions_short");
    const lf = cftcSeries(rows, "lev_money_positions_long", "lev_money_positions_short");
    if (am) series[k + "_AM"] = am;
    if (lf) series[k + "_LF"] = lf;
  }
  return Object.keys(series).length ? { series, source: "CFTC", asOf: new Date().toISOString().slice(0, 10) } : null;
}

// slt_table1.txt (tab-separated, millions of USD) -> meta/tic doc. "Net U.S. Sales" to foreigners of
// U.S. corporate equity is the same thing as net foreign purchases. Private/official is not split in this file.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function ticFrom(text, nMonths = 6) {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    const c = line.split("\t");
    if (c[0] === "All Countries" && /^\d{4}-\d{2}$/.test(c[2] || "")) rows.push([c[2], Number(c[16])]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const last = rows.filter((r) => Number.isFinite(r[1])).slice(-nMonths);
  if (!last.length) return null;
  const months = {};
  for (const [ym, v] of last) months[`${MON[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`] = { total: Math.round(v / 100) / 10, private: null, official: null };
  return { months, source: "US Treasury TIC (slt_table1)", asOf: new Date().toISOString().slice(0, 10) };
}
async function fetchTic() {
  const r = await fetch("https://ticdata.treasury.gov/Publish/slt_table1.txt", { headers: UA });
  if (!r.ok) throw new Error("tic_" + r.status);
  return ticFrom(await r.text());
}

module.exports = { cftcSeries, fetchCftc, ticFrom, fetchTic };
