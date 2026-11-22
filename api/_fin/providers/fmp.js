// Financial Modeling Prep (OPTIONAL: FMP_API_KEY). Standardized statements, ratios, estimates, profile, peers, screener, transcripts.
// Free tier is ~250 calls/day and its terms restrict public display; use a paid plan with display rights before exposing FMP data to end users.
const { request, notConfigured } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const name = "fmp";
const configured = () => !!process.env.FMP_API_KEY;
const get = (op, path) => { if (!configured()) throw notConfigured(name); return obs.timed(name, op, () => request(name, `https://financialmodelingprep.com/stable/${path}${path.includes("?") ? "&" : "?"}apikey=${process.env.FMP_API_KEY}`)); };
const q = encodeURIComponent;

async function profile(sym) {
  const j = await get("profile", `profile?symbol=${q(sym)}`), x = Array.isArray(j) ? j[0] : j; if (!x) return null;
  return S.profile({ symbol: sym, name: x.companyName, exchange: x.exchange, currency: x.currency, sector: x.sector, industry: x.industry, description: x.description, website: x.website, country: x.country, employees: x.fullTimeEmployees, marketCap: x.marketCap, ipoDate: x.ipoDate, cik: x.cik, source: "FMP" });
}
async function quote(sym) {
  const j = await get("quote", `quote?symbol=${q(sym)}`), x = Array.isArray(j) ? j[0] : j; if (!x || !(x.price > 0)) throw new Error("fmp_empty");
  return S.quote({ symbol: sym, name: x.name, price: x.price, change: x.change, changePercent: x.changePercentage != null ? x.changePercentage / 100 : null, previousClose: x.previousClose, open: x.open, high: x.dayHigh, low: x.dayLow, volume: x.volume, marketCap: x.marketCap, exchange: x.exchange, timestamp: x.timestamp ? new Date(x.timestamp * 1000) : null, freshness: "delayed", source: "FMP" });
}
async function statements(sym, { type = "annual" } = {}) {
  const period = type === "annual" ? "annual" : "quarter", lim = type === "annual" ? 10 : 12;
  const [inc, bal, cf] = await Promise.all([get("income", `income-statement?symbol=${q(sym)}&period=${period}&limit=${lim}`), get("balance", `balance-sheet-statement?symbol=${q(sym)}&period=${period}&limit=${lim}`), get("cashflow", `cash-flow-statement?symbol=${q(sym)}&period=${period}&limit=${lim}`)]);
  const B = Object.fromEntries((bal || []).map((x) => [x.date, x])), C = Object.fromEntries((cf || []).map((x) => [x.date, x]));
  return (inc || []).map((i) => { const b = B[i.date] || {}, c = C[i.date] || {};
    return S.statement({ symbol: sym, period: i.date, periodType: type, fiscalYear: i.fiscalYear, fiscalPeriod: i.period, filingDate: i.filingDate || i.acceptedDate, currency: i.reportedCurrency, source: "FMP",
      revenue: i.revenue, costOfRevenue: i.costOfRevenue, grossProfit: i.grossProfit, operatingIncome: i.operatingIncome, ebitda: i.ebitda, netIncome: i.netIncome, eps: i.epsdiluted != null ? i.epsdiluted : i.epsDiluted, dilutedShares: i.weightedAverageShsOutDil,
      interestExpense: i.interestExpense, incomeTax: i.incomeTaxExpense, rAndD: i.researchAndDevelopmentExpenses, sgAndA: i.sellingGeneralAndAdministrativeExpenses,
      cash: b.cashAndCashEquivalents, shortTermInvestments: b.shortTermInvestments, totalCurrentAssets: b.totalCurrentAssets, totalAssets: b.totalAssets, totalCurrentLiabilities: b.totalCurrentLiabilities, totalLiabilities: b.totalLiabilities,
      totalDebt: b.totalDebt, shareholdersEquity: b.totalStockholdersEquity, inventory: b.inventory, receivables: b.netReceivables,
      operatingCashFlow: c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities, capex: c.capitalExpenditure != null ? Math.abs(c.capitalExpenditure) : null, freeCashFlow: c.freeCashFlow, dividendsPaid: c.commonDividendsPaid != null ? Math.abs(c.commonDividendsPaid) : null, buybacks: c.commonStockRepurchased != null ? Math.abs(c.commonStockRepurchased) : null }); });
}
async function earnings(sym) { const j = await get("earnings", `earnings?symbol=${q(sym)}&limit=12`); return (j || []).map((e) => S.earningsEvent({ symbol: sym, date: e.date, epsActual: e.epsActual, epsEstimate: e.epsEstimated, revenueActual: e.revenueActual, revenueEstimate: e.revenueEstimated, source: "FMP" })); }
async function estimates(sym) { const j = await get("estimates", `analyst-estimates?symbol=${q(sym)}&period=annual&limit=4`); return (j || []).map((e) => ({ symbol: sym, date: e.date, epsAvg: e.epsAvg, epsHigh: e.epsHigh, epsLow: e.epsLow, revenueAvg: e.revenueAvg, ebitdaAvg: e.ebitdaAvg, analysts: e.numAnalystsEps, source: "FMP", meta: S.meta({ source: "FMP", asOf: e.date, kind: "reported", freshness: "delayed" }) })); }
async function priceTarget(sym) { const j = await get("pt", `price-target-consensus?symbol=${q(sym)}`), x = Array.isArray(j) ? j[0] : j; return x ? { mean: x.targetConsensus, median: x.targetMedian, high: x.targetHigh, low: x.targetLow, source: "FMP" } : null; }
async function peers(sym) { const j = await get("peers", `stock-peers?symbol=${q(sym)}`); return (Array.isArray(j) ? j : []).map((x) => x.symbol).filter((x) => x && x !== sym).slice(0, 10); }
async function transcript(sym, year, quarter) { const j = await get("transcript", `earning-call-transcript?symbol=${q(sym)}&year=${year}&quarter=${quarter}`), x = Array.isArray(j) ? j[0] : j; return x ? { symbol: sym, year, quarter, date: x.date, content: String(x.content || "").slice(0, 20000), source: "FMP" } : null; }
async function screener(params) { const j = await get("screener", `company-screener?${new URLSearchParams(params)}`); return (j || []).slice(0, 50); }
async function search(text) { const j = await get("search", `search-name?query=${q(text)}&limit=8`); return (j || []).map((x) => ({ symbol: x.symbol, name: x.name, exchange: x.exchange, type: "equity", source: "FMP" })); }
module.exports = { name, configured, license: "Free tier restricts public display; paid plan required before showing FMP data to end users.", profile, quote, statements, earnings, estimates, priceTarget, peers, transcript, screener, search };
