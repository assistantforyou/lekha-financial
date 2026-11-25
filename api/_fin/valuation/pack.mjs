/* From filings, a quote and price history to the engine's input (the "pack"): pure mapping, no I/O, no clock (the caller passes `today`).
   The pack is plain JSON, so the server can hand it to the browser, which then recomputes every slider move locally with the same engine. */
import { betaWeekly, dilutionOf, CONST } from "./engine.mjs";

const fin = (x) => typeof x === "number" && Number.isFinite(x);
export const FIN_LEVERAGE = 0.85;     // liabilities / assets at or above which a financial's balance sheet is its business (banks, insurers, lenders)
export const FIN_TURNOVER = 0.30;     // ... and revenue / assets below which it is a balance-sheet business: payment networks earn 0.4 to 0.6 of assets in revenue, banks about 0.04, insurers 0.1 to 0.3
export const SHARES_MAX_AGE_DAYS = 460;   // a cover-page share count older than this (the latest 10-K cover is at most about 15 months old) is not trusted

/* A balance-sheet financial is valued on book equity and returns (residual income), not on operating free cash flow. The sector alone is not enough: payment
   networks (Visa, Mastercard) sit in the Financials sector but are asset-light operating businesses, so the balance sheet has to look like a bank's or insurer's. */
export function isBalanceSheetFinancial({ sector, industry, row }) {
  const named = sector === "Financials" || /\b(bank|banks|savings|credit|insurance|insurer|surety|loan|lending|mortgage|broker|brokerage)\b/i.test(String(industry || ""));
  if (!named || !row || !fin(row.totalAssets) || !fin(row.totalLiabilities) || !(row.totalAssets > 0)) return false;
  if (row.totalLiabilities / row.totalAssets < FIN_LEVERAGE) return false;
  return !(fin(row.revenue) && row.revenue / row.totalAssets >= FIN_TURNOVER);
}

/* Operating income as reported; some filers (JNJ) do not tag it, so it is rebuilt as pre-tax income plus interest expense, which is the same quantity before financing */
const ebitOf = (r) => (fin(r.operatingIncome) ? r.operatingIncome : fin(r.pretaxIncome) ? r.pretaxIncome + (fin(r.interestExpense) ? Math.abs(r.interestExpense) : 0) : null);
const historyRow = (r) => ({ fy: r.fiscalYear || null, period: r.periodEnd || r.period || null, revenue: r.revenue, ebit: ebitOf(r), eps: r.eps, da: r.da, netIncome: r.netIncome, pretaxIncome: r.pretaxIncome, incomeTax: r.incomeTax,
  interestExpense: r.interestExpense, equity: r.shareholdersEquity, debt: r.totalDebt, leases: r.leaseLiabilities, minority: r.minorityInterest, preferred: r.preferredEquity, cash: r.cash, sti: r.shortTermInvestments,
  lti: r.longTermInvestments, dividends: r.dividendsPaid, buybacks: r.buybacks, basicShares: r.basicShares, dilutedShares: r.dilutedShares, totalAssets: r.totalAssets, totalLiabilities: r.totalLiabilities });
const num = (x) => (fin(x) ? x : null);

const days = (a, b) => { const x = Date.parse(String(a || "").slice(0, 10) + "T00:00:00Z"), y = Date.parse(String(b || "").slice(0, 10) + "T00:00:00Z"); return fin(x) && fin(y) ? (y - x) / 864e5 : null; };
/* Which share count to value per share on. The cover-page count is the best (point-in-time, basic) but is wrong in two known ways: for multi-class issuers the data feed carries one
   class, and for some filers it is years stale (Visa's was a 2010 value). So it is used only when recent and consistent with the weighted-average count; otherwise the weighted
   average from the income statement, otherwise net income over diluted EPS. A weighted diluted count already includes dilution, so no dilution is added on top of it. */
export function shareCount({ cover, coverAsOf, today, row }) {
  const r = row || {}, wBasic = fin(r.basicShares) && r.basicShares > 0 ? r.basicShares : null, wDil = fin(r.dilutedShares) && r.dilutedShares > 0 ? r.dilutedShares : null;
  // net income is missing for some filers in recent years (Visa, Mastercard); pre-tax income less tax is the same figure before minorities
  const ni = fin(r.netIncome) ? r.netIncome : fin(r.pretaxIncome) && fin(r.incomeTax) ? r.pretaxIncome - r.incomeTax : null;
  const implied = fin(ni) && ni > 0 && fin(r.eps) && r.eps > 0 ? ni / r.eps : null;
  const dil = dilutionOf({ basicShares: wBasic, dilutedShares: wDil });
  const ref = wBasic || wDil || implied, refIsDiluted = !wBasic && (!!wDil || !!implied);
  const age = coverAsOf ? days(coverAsOf, today) : null, fresh = fin(cover) && cover > 0 && (age == null || age <= SHARES_MAX_AGE_DAYS);
  if (fresh) {
    if (ref && (cover / ref < 0.75 || cover / ref > 1.25)) return fallback(`The cover-page share count (${(cover / 1e6).toFixed(0)}M) does not match the weighted average (${(ref / 1e6).toFixed(0)}M), which happens when an issuer has several share classes; the weighted average is used.`);
    return { count: cover, dilution: dil, basis: "cover page" + (coverAsOf ? ` (${String(coverAsOf).slice(0, 10)})` : ""), note: null };
  }
  return fallback(fin(cover) && cover > 0 ? `The latest cover-page share count in the data is from ${String(coverAsOf).slice(0, 10)}, too old to rely on; reported weighted-average shares are used.` : null);
  function fallback(note) {
    if (wBasic) return { count: wBasic, dilution: dil, basis: "weighted average basic", note };
    if (wDil) return { count: wDil, dilution: 0, basis: "weighted average diluted", note };
    if (implied) return { count: implied, dilution: 0, basis: "net income / diluted EPS", note: note || "No share count was reported; it is inferred as net income over diluted EPS." };
    return { count: null, dilution: 0, basis: null, note: (note ? note + " " : "") + "No reliable share count is available for this company (issuers with several share classes often report none in the data feed), so the value is shown in total rather than per share." };
  }
}

/* makePack({ symbol, name, statements (annual, newest first), quote, rf (fraction), stockBars, marketBars, basicShares, sector, industry, today (ISO date), erp }) */
export function makePack(i) {
  const A = (i.statements || []).filter(Boolean), a0 = A[0] || {}, q = i.quote || null;
  const currency = a0.currency || null, quoteCurrency = q ? q.currency : null, price = q && fin(q.price) ? q.price : null;
  const comparable = !!currency && currency === quoteCurrency && price != null;
  const sh = shareCount({ cover: i.basicShares, coverAsOf: i.sharesAsOf, today: i.today, row: a0 });
  const beta = betaWeekly(i.stockBars, i.marketBars);
  const t = Date.parse(String(i.today || "").slice(0, 10) + "T00:00:00Z"), p = Date.parse(String(a0.periodEnd || a0.period || "").slice(0, 10) + "T00:00:00Z");
  const stub = fin(t) && fin(p) ? Math.min(1, Math.max(0, (t - p) / (365.25 * 864e5))) : 0;
  const history = A.slice(0, 8).map(historyRow);
  return {
    symbol: i.symbol || null, name: i.name || null, currency, quoteCurrency, comparable, price, asOf: i.asOf || null, today: i.today || null, sector: i.sector || null,
    isFinancial: isBalanceSheetFinancial({ sector: i.sector, industry: i.industry, row: a0 }),
    shares: { basic: sh.count, dilution: sh.dilution, basis: sh.basis }, sharesNote: sh.note, rf: fin(i.rf) ? i.rf : null, erp: fin(i.erp) ? i.erp : CONST.ERP,
    beta: beta ? { raw: beta.raw, adjusted: beta.adjusted, se: beta.se, n: beta.n, r2: beta.r2 } : null, stub,
    history, bridge: { cash: num(a0.cash), sti: num(a0.shortTermInvestments), lti: num(a0.longTermInvestments), debt: num(a0.totalDebt), leases: num(a0.leaseLiabilities), minority: num(a0.minorityInterest), preferred: num(a0.preferredEquity) },
    latestFiscalYearEnd: a0.periodEnd || a0.period || null,
  };
}
