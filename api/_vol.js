// VIX and VIXEQ daily closes from Cboe's public history files (keyless). VIXEQ before its 4 Nov 2024 launch is Cboe's back-tested history.
const { cached } = require("./_lib");

const LAUNCH = "2024-11-04";
const H12 = 12 * 36e5;

// "06/19/2014,20.78" style rows -> ascending [[YYYY-MM-DD, value]]
function cboeRows(csv, col) {
  const lines = String(csv || "").split("\n");
  const head = (lines[0] || "").trim().split(",");
  const idx = head.indexOf(col);
  const out = [];
  if (idx < 0) return out;
  for (const l of lines.slice(1)) {
    const c = l.trim().split(",");
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(c[0] || "");
    const v = parseFloat(c[idx]);
    if (m && Number.isFinite(v) && v > 0) out.push([`${m[3]}-${m[1]}-${m[2]}`, v]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const y6 = (d) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);
const pairs = (rows) => rows.map(([d, v]) => `${y6(d)}:${v}`).join(";");

// {vix, vixeq} ascending rows -> CSV parseVol() reads; observed VIXEQ only from the launch date
function volatilityCsv(vix, vixeq, calcAt) {
  if (!vix.length || !vixeq.length) return null;
  const since = vixeq[0][0];
  const lines = ["Ticker,Segment,Data (yymmdd:close),Calculated at (sheet time)"]; // the page looks for the "Ticker,Segment" header
  lines.push(`VIX,Index,${pairs(vix.filter((r) => r[0] >= since))},${calcAt}`);
  lines.push(`VIXEQ,Index,${pairs(vixeq.filter((r) => r[0] >= LAUNCH))},${calcAt}`);
  return lines.join("\n");
}

function backtestDoc(vixeq) {
  const pre = vixeq.filter((r) => r[0] < LAUNCH);
  if (!pre.length) return null;
  return {
    data: pairs(pre),
    src: "Cboe VIXEQ history file (cdn.cboe.com), back-tested by Cboe before the 4 Nov 2024 launch",
    verification: "Published by Cboe and used as published; not independently reproduced here.",
  };
}

async function load() {
  const get = async (name) => {
    const r = await fetch(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${name}_History.csv`, { headers: { "User-Agent": "portfolio-terminal personal-dashboard" } });
    if (!r.ok) throw new Error("cboe_" + r.status);
    return r.text();
  };
  const [a, b] = await Promise.all([get("VIX"), get("VIXEQ")]);
  const vix = cboeRows(a, "CLOSE"), vixeq = cboeRows(b, "VIXEQ");
  if (!vix.length || !vixeq.length) throw new Error("cboe_empty");
  return { vix, vixeq };
}

const volData = () => cached("free/vol", H12, load);

module.exports = { cboeRows, volatilityCsv, backtestDoc, volData, LAUNCH };
