// Pure extraction of valuation inputs from SEC XBRL "companyfacts" JSON (no network here, so it is unit-testable).
// Everything returned is derived from filings; nothing is estimated. Fields that cannot be sourced stay null.

const DAY = 864e5;
const dur = (f) => (Date.parse(f.end) - Date.parse(f.start)) / DAY;
const ANNUAL_FORMS = /^(10-K|20-F|40-F)(\/A)?$/;
const isAnnual = (f) => f.start && dur(f) > 340 && dur(f) < 390 && ANNUAL_FORMS.test(f.form || "");
const shift = (iso, days) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);

function unitFacts(facts, concept, unit) {
  const c = facts && facts["us-gaap"] && facts["us-gaap"][concept];
  return c && c.units && c.units[unit] ? c.units[unit] : [];
}

// annual duration facts for one concept: latest-filed value per period end, sorted newest first
function annualOf(facts, concept, unit) {
  const by = {};
  for (const f of unitFacts(facts, concept, unit)) {
    if (!isAnnual(f) || typeof f.val !== "number") continue;
    const cur = by[f.end];
    if (!cur || (f.filed || "") >= (cur.filed || "")) by[f.end] = f;
  }
  return Object.values(by).sort((a, b) => (a.end < b.end ? 1 : -1));
}

// first concept (in preference order) whose newest annual period is the most recent; filers change tags over time
function bestAnnual(facts, concepts, unit) {
  let best = null;
  for (const c of concepts) {
    const a = annualOf(facts, c, unit);
    if (a.length && (!best || a[0].end > best[0].end)) best = a;
  }
  return best || [];
}

// trailing twelve months of a flow concept: latest FY + current YTD - same YTD a year earlier
function ttmOf(facts, concepts, unit) {
  let best = null;
  for (const c of concepts) {
    const fy = annualOf(facts, c, unit);
    if (!fy.length) continue;
    const all = unitFacts(facts, c, unit).filter((f) => f.start && typeof f.val === "number");
    const last = fy[0];
    // YTD fact that starts right after the last fiscal year end and ends latest
    const ytds = all.filter((f) => f.start >= shift(last.end, 0) && f.end > last.end && dur(f) > 60 && dur(f) < 300 && /^10-Q/.test(f.form || ""));
    let val = last.val, end = last.end;
    if (ytds.length) {
      const y = ytds.reduce((a, b) => (b.end > a.end || (b.end === a.end && dur(b) > dur(a)) ? b : a));
      const py = all.find((f) => Math.abs(Date.parse(f.start) - (Date.parse(y.start) - 365.25 * DAY)) < 12 * DAY && Math.abs(Date.parse(f.end) - (Date.parse(y.end) - 365.25 * DAY)) < 12 * DAY && Math.abs(dur(f) - dur(y)) < 8);
      // no prior-year comparative to subtract: fall back to the last full fiscal year (its end date is returned so callers can see it)
      if (py) { val = last.val + y.val - py.val; end = y.end; }
    }
    if (!best || end > best.end) best = { val, end };
  }
  return best;
}

const REV = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "SalesRevenueGoodsNet"];
const OCF = ["NetCashProvidedByUsedInOperatingActivities"];
const CAPEX = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"];
const DA = ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"];
const SBC = ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"];
const EPS = ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"];

// latest instant (balance sheet) value of the first concept that has one
function instant(facts, concepts) {
  let best = null;
  for (const c of concepts) {
    const a = unitFacts(facts, c, "USD").filter((f) => !f.start && typeof f.val === "number");
    for (const f of a) if (!best || f.end > best.end || (f.end === best.end && (f.filed || "") > (best.filed || ""))) best = f;
  }
  return best;
}
const sumInstant = (facts, groups) => {
  // groups: list of concept lists; sum the latest value of each group that exists, all from the latest balance sheet date
  const vals = groups.map((g) => instant(facts, g)).filter(Boolean);
  if (!vals.length) return null;
  const end = vals.reduce((m, v) => (v.end > m ? v.end : m), "");
  return { val: vals.filter((v) => v.end === end).reduce((s, v) => s + v.val, 0), end };
};

function sharesOutstanding(facts) {
  const c = facts && facts.dei && facts.dei.EntityCommonStockSharesOutstanding;
  const a = c && c.units && c.units.shares ? c.units.shares.filter((f) => typeof f.val === "number" && f.val > 0) : [];
  if (!a.length) return null;
  // multi-class filers report one value per class on the same date: add them
  const end = a.reduce((m, f) => (f.end > m ? f.end : m), "");
  return a.filter((f) => f.end === end).reduce((s, f) => s + f.val, 0);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const mil = (v) => Math.round(v / 1e4) / 100; // dollars -> millions, 2 dp

// trailing EPS (diluted) for the peer E/P screen
function epsTtm(facts) {
  const t = ttmOf(facts, EPS, "USD/shares");
  return t ? { eps: Math.round(t.val * 100) / 100, end: t.end } : null;
}

// Heuristic style class used to pick the required margin of safety. Deliberately simple and disclosed in the notes.
function classify({ sector, sic, margins, growth }) {
  if (sector === "Energy" || sector === "Materials" || String(sic) === "3674" || /^37[01]/.test(String(sic))) return "cyclical";
  const med = median(margins);
  if (med <= 0 || margins.slice(0, 2).every((m) => m <= 0)) return "speculative";
  const range = Math.max(...margins) - Math.min(...margins);
  if (med >= 15 && range < 12 && growth != null && growth > -0.02) return "quality";
  return "growth";
}

/* Build the `fund` document the page's valuation model reads. units: millions of USD (rev/fcf/ocf/da/sbc/debt/netcash).
   Returns {doc, why}: doc is null with a reason when the filer is not valued by this model (banks/insurers, no revenue, too little history). */
function buildFund(t, facts, meta) {
  meta = meta || {};
  const rev = bestAnnual(facts, REV, "USD"), ocf = bestAnnual(facts, OCF, "USD");
  if (!rev.length || !ocf.length) return { doc: null, why: "no_revenue_or_cash_flow_tags" };
  const capex = bestAnnual(facts, CAPEX, "USD"), da = bestAnnual(facts, DA, "USD"), sbc = bestAnnual(facts, SBC, "USD");
  const at = (arr, end) => { const f = arr.find((x) => x.end === end); return f ? f.val : null; };
  const rows = [];
  for (const r of rev) {
    const o = at(ocf, r.end), cx = at(capex, r.end);
    if (o == null || cx == null || !(r.val > 0)) continue;
    rows.push({ end: r.end, rev: r.val, ocf: o, fcf: o - Math.abs(cx), da: at(da, r.end), sbc: at(sbc, r.end) });
    if (rows.length === 6) break;
  }
  if (rows.length < 3) return { doc: null, why: "fewer_than_3_years" };
  const first = rows[0];
  // the latest TTM is shown only when it is newer than the last fiscal year; the model needs annual periods
  const years = rows.slice(0, 5);
  const cur = "USD";
  const margins = years.map((r) => (100 * r.fcf) / r.rev);
  const n = years.length - 1;
  const cagr = Math.pow(years[0].rev / years[n].rev, 1 / n) - 1;
  // balance sheet at the latest cash date: cash + short-term securities (same date only) and borrowings
  const cashF = instant(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]);
  const E = cashF ? cashF.end : null;
  const atEnd = (concepts) => { for (const c of concepts) { const f = unitFacts(facts, c, "USD").filter((x) => !x.start && x.end === E && typeof x.val === "number").pop(); if (f) return f.val; } return null; };
  const sti = E ? atEnd(["MarketableSecuritiesCurrent", "ShortTermInvestments", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "DebtSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent"]) : null;
  let debtV = 0;
  if (E) {
    const ltd = atEnd(["LongTermDebt"]);
    if (ltd != null) debtV = ltd;
    else debtV = (atEnd(["LongTermDebtNoncurrent"]) || 0) + (atEnd(["LongTermDebtCurrent", "DebtCurrent"]) || 0);
    debtV += atEnd(["ShortTermBorrowings", "CommercialPaper"]) || 0;
  }
  const cashV = cashF ? cashF.val + (sti || 0) : null;
  const cls = classify({ sector: meta.sector, sic: meta.sic, margins, growth: cagr });
  const lastEnd = first.end;
  const nextFy = new Date(Date.parse(lastEnd) + 365.25 * DAY);
  const doc = {
    t, method: "dcf", cls, clsAuto: true, sector: meta.sector || meta.sicDescription || null, ai: false, cur, bsCur: "USD", basis: "fcf", shareMode: "mc",
    asOf: new Date().toISOString().slice(0, 10),
    cols: years.map((r) => "FY" + r.end.slice(0, 4)), ends: years.map((r) => r.end),
    rev: years.map((r) => mil(r.rev)), fcf: years.map((r) => mil(r.fcf)), ocf: years.map((r) => mil(r.ocf)),
    da: years.map((r) => (r.da == null ? null : mil(r.da))), sbc: years.map((r) => (r.sbc == null ? null : mil(r.sbc))),
    debt: mil(debtV), netcash: cashV == null ? null : mil(cashV - debtV),
    rev_ttm: null, fcf_ttm: null,
    // No analyst consensus on the free tier: year-1 growth falls back to the trailing revenue CAGR (page labels this)
    fc: { fy: "FY" + nextFy.getUTCFullYear(), end: shift(lastEnd, 365), rev: [null, null, null], g: Math.round(Math.max(-20, Math.min(40, cagr * 100)) * 10) / 10, glh: null, eps: null, pt: null, basis: "trailing", note: "No analyst consensus on the free tier: year-1 revenue growth is the trailing " + n + "-year revenue CAGR from SEC filings, limited to -20% to +40% (bear and bull are 3 points either side)." },
    src: { cf: "Annual cash-flow statements from SEC EDGAR XBRL filings (10-K); FCF = operating cash flow minus capex", bs: "latest SEC filing" },
  };
  if (doc.netcash == null) { doc.netcash = 0; doc.src.bs = "no balance sheet cash tag found; net cash taken as 0"; }
  const rt = ttmOf(facts, REV, "USD"), ot = ttmOf(facts, OCF, "USD"), ct = ttmOf(facts, CAPEX, "USD");
  if (rt && ot && ct) { doc.rev_ttm = mil(rt.val); doc.fcf_ttm = mil(ot.val - Math.abs(ct.val)); }
  return { doc, why: null };
}

const n6 = (v) => (v == null || !isFinite(v) ? "" : String(Math.round(v * 1e6) / 1e6));
const clean = (v) => String(v == null ? "" : v).replace(/[",\r\n]/g, " ").trim();

// Raw beta vs a benchmark: daily simple returns over the last ~2 years on dates both series share. null when under 120 overlapping returns.
function betaOf(series, bench, maxReturns) {
  if (!series || !bench) return null;
  const bm = new Map(bench.map((r) => [r[0], r[1]]));
  const a = [], b = [];
  let pa = null, pb = null;
  for (const [d, v] of series) {
    const w = bm.get(d);
    if (w == null) continue;
    if (pa != null) { a.push(v / pa - 1); b.push(w / pb - 1); }
    pa = v; pb = w;
  }
  const k = Math.min(a.length, maxReturns || 504);
  if (k < 120) return null;
  const x = a.slice(-k), y = b.slice(-k);
  const mx = x.reduce((s, v) => s + v, 0) / k, my = y.reduce((s, v) => s + v, 0) / k;
  let c = 0, vr = 0;
  for (let i = 0; i < k; i++) { c += (x[i] - mx) * (y[i] - my); vr += (y[i] - my) ** 2; }
  return vr > 0 ? Math.round((c / vr) * 100) / 100 : null;
}

// VALIN: the page's live-input sheet. Prices in USD, mcap in dollars, sh = shares outstanding (count).
function valinCsv(rows, at) {
  if (!rows || !rows.length) return null;
  const head = "Ticker,Price,MarketCap,Shares,Beta,PE,EPS,Currency,Type";
  const body = rows.map((r) => [clean(r.t), n6(r.px), n6(r.mcap), n6(r.sh), n6(r.beta), n6(r.pe), n6(r.eps), clean(r.cur || "USD"), clean(r.tt)].join(","));
  return [head, ...body, "UPDATED," + clean(at)].join("\n") + "\n";
}

// PEER: S&P 500 trailing EPS vs price for the sector-neutral E/P dispersion. rows: [{t, sector, eps, price, mcap}]
function peerCsv(rows, at) {
  const head = "Ticker,Sector,Member,EPS (ttm),Price,Market cap,Calculated at (sheet time)";
  const body = rows.map((r, i) => [clean(r.t), clean(r.sector), "Y", n6(r.eps), n6(r.price), n6(r.mcap), i === 0 ? clean(at) : ""].join(","));
  return [head, ...body].join("\n") + "\n";
}

module.exports = { betaOf, valinCsv, peerCsv, buildFund, epsTtm, sharesOutstanding, annualOf, ttmOf, classify, REV, EPS };
