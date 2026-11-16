// Analyst consensus for the user's holdings from Alpha Vantage (free key, 25 calls/day shared budget):
// EARNINGS_ESTIMATES (EPS + revenue consensus with 7/30/60/90-day history and revision counts) and
// OVERVIEW (analyst target price). Cached per symbol so each holding costs about 2 calls a week.
const { av, cacheGetMany, cached } = require("./_lib");

const EST_TTL = 7 * 864e5, OV_TTL = 14 * 864e5;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const today = () => new Date().toISOString().slice(0, 10);

// AV estimates -> {cy, ny} fiscal-year rows (cy = first fiscal year ending today or later)
function fiscalYears(est, asOf = today()) {
  const fy = (est || []).filter((e) => e && e.horizon === "fiscal year" && e.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const i = fy.findIndex((e) => e.date >= asOf);
  return i < 0 ? { cy: null, ny: null } : { cy: fy[i], ny: fy[i + 1] || null };
}

// One snapshot item in the shape the page's revision model reads (rvTicker in index.html).
function revItem(est, asOf) {
  const { cy, ny } = fiscalYears(est, asOf);
  if (!cy || !ny) return null;
  const hist = (e) => [num(e.eps_estimate_average), num(e.eps_estimate_average_7_days_ago), num(e.eps_estimate_average_30_days_ago), num(e.eps_estimate_average_60_days_ago), num(e.eps_estimate_average_90_days_ago)];
  const cnt = (k) => [0, 0, num(cy[k]) || 0, num(ny[k]) || 0];
  return {
    eps: { cy: hist(cy), ny: hist(ny) },
    up30: cnt("eps_estimate_revision_up_trailing_30_days"), dn30: cnt("eps_estimate_revision_down_trailing_30_days"),
    rev: { cy: { avg: num(cy.revenue_estimate_average), lo: num(cy.revenue_estimate_low), hi: num(cy.revenue_estimate_high) }, ny: { avg: num(ny.revenue_estimate_average) } },
    periods: { cy: cy.date, ny: ny.date }, n: num(cy.eps_estimate_analyst_count),
  };
}

// Consensus fields merged into the free-tier fundamentals doc (fc) for the valuation model.
function consensusFc(est, overview, asOf) {
  const { cy, ny } = fiscalYears(est, asOf);
  const out = {};
  if (cy) {
    const m = (v) => (num(v) == null ? null : Math.round(num(v) / 1e4) / 100); // USD -> USD millions
    out.fy = "FY" + cy.date.slice(0, 4); out.end = cy.date;
    out.rev = [m(cy.revenue_estimate_low), m(cy.revenue_estimate_average), m(cy.revenue_estimate_high)];
    out.eps = [null, num(cy.eps_estimate_average), ny ? num(ny.eps_estimate_average) : null];
    out.ratings30 = { up: num(cy.eps_estimate_revision_up_trailing_30_days) || 0, down: num(cy.eps_estimate_revision_down_trailing_30_days) || 0 };
    out.basis = "consensus";
    out.note = `Analyst consensus from Alpha Vantage (${num(cy.revenue_estimate_analyst_count) || "?"} revenue estimates for ${out.fy}).`;
  }
  const pt = overview && num(overview.AnalystTargetPrice);
  if (pt && pt > 0) out.pt = pt;
  return out;
}

const SYM = /^[A-Z][A-Z.\-]{0,9}$/;
// Cached estimates/overview for up to `fresh` uncached symbols per call (each costs one budgeted AV call).
async function estimatesFor(symbols, { fresh = 3, overview = true } = {}) {
  const syms = symbols.filter((s) => SYM.test(s) && !/\.(HK|BK)$/.test(s));
  const keys = syms.flatMap((s) => ["av/est/" + s, "av/ov/" + s]);
  const have = await cacheGetMany(keys);
  const out = {};
  let left = fresh;
  for (const s of syms) {
    const e = have["av/est/" + s], o = have["av/ov/" + s];
    let est = e && e.payload, ov = o && o.payload;
    if ((!e || Date.now() - e.fetchedAt > EST_TTL) && left > 0) {
      left--; est = await cached("av/est/" + s, EST_TTL, async () => { const j = await av({ function: "EARNINGS_ESTIMATES", symbol: s }); return Array.isArray(j.estimates) && j.estimates.length ? j.estimates : null; }).catch(() => est);
    }
    if (overview && (!o || Date.now() - o.fetchedAt > OV_TTL) && left > 0) {
      left--; ov = await cached("av/ov/" + s, OV_TTL, async () => { const j = await av({ function: "OVERVIEW", symbol: s }); return j && j.Symbol ? { AnalystTargetPrice: j.AnalystTargetPrice, ForwardPE: j.ForwardPE } : null; }).catch(() => ov);
    }
    if (est || ov) out[s] = { est: est || null, ov: ov || null };
  }
  return out;
}

// Revision snapshot collection [{id, data:{date, items}}]: today's snapshot plus stored ones (kept for 4W/12W history)
function revDoc(estBySym, asOf = today()) {
  const items = {};
  for (const [s, x] of Object.entries(estBySym)) { const it = x.est && revItem(x.est, asOf); if (it) items[s] = it; }
  return Object.keys(items).length ? { id: asOf, data: { date: asOf, at: Date.now(), src: "Alpha Vantage EARNINGS_ESTIMATES", items } } : null;
}

module.exports = { fiscalYears, revItem, consensusFc, estimatesFor, revDoc };
