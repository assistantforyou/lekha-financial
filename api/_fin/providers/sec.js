// SEC EDGAR: the authoritative source for reported fundamentals and filings. Keyless, official, public domain.
// Needs a declared User-Agent (SEC_USER_AGENT) and stays under 10 requests/second. US-GAAP filers only (20-F/IFRS filers return no statements).
const { request, SEC_UA, notConfigured } = require("../http");
const S = require("../schemas");
const obs = require("../obs");
const { cacheFetch } = require("../cache");

const name = "sec";
let last = 0;
async function get(url, opts = {}) {
  const slot = Math.max(Date.now(), last + 120); last = slot;
  if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
  return request("sec", url, { headers: { "User-Agent": SEC_UA(), "Accept-Encoding": "gzip, deflate", Accept: opts.text ? "text/html" : "application/json" }, timeoutMs: opts.timeoutMs || 20000, text: opts.text });
}
const pad = (cik) => String(cik).padStart(10, "0");

// ---- ticker directory (all SEC registrants that have a ticker): powers search and ticker -> CIK for every US company ----
async function directory() {
  const { value } = await cacheFetch("search", "sec-tickers", () => obs.timed(name, "tickers", async () => {
    const j = await get("https://www.sec.gov/files/company_tickers.json");
    return Object.values(j || {}).map((x) => ({ cik: String(x.cik_str), ticker: String(x.ticker).toUpperCase(), name: x.title }));
  }), { shared: true, ttl: 24 * 36e5 });
  return value;
}
async function cikFor(symbol) {
  const sym = String(symbol).toUpperCase().replace(".", "-");
  try { const { cikOf } = require("../../_edgar"); const c = cikOf(String(symbol).toUpperCase()); if (c) return String(c); } catch (e) { /* fall through */ }
  const d = await directory(); const hit = d.find((x) => x.ticker === sym || x.ticker === String(symbol).toUpperCase());
  return hit ? hit.cik : null;
}

async function submissions(cik) {
  const { value } = await cacheFetch("filings", "sub/" + cik, () => obs.timed(name, "submissions", () => get(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`)));
  return value;
}
async function companyFacts(cik) {
  const { value } = await cacheFetch("facts", "facts/" + cik, () => obs.timed(name, "companyfacts", () => get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`, { timeoutMs: 40000 })), { shared: false });
  return value;
}

async function profile(symbol) {
  const cik = await cikFor(symbol); if (!cik) return null;
  const s = await submissions(cik); if (!s) return null;
  return S.profile({ symbol, name: s.name, exchange: (s.exchanges && s.exchanges[0]) || null, sector: null, industry: s.sicDescription || null, website: s.website || null,
    country: s.addresses && s.addresses.business && s.addresses.business.stateOrCountry || null, cik, description: s.sicDescription ? `SEC SIC: ${s.sicDescription}` : null, source: "SEC EDGAR" });
}

const FORMS = /^(10-K|10-Q|8-K|20-F|6-K|DEF 14A|S-1|S-3|424B\d|SC 13[DG]|40-F)(\/A)?$/;   // insider Forms 3/4/5 are excluded by default (noise); ask for them with forms=4
async function filings(symbol, { forms, limit = 40 } = {}) {
  const cik = await cikFor(symbol); if (!cik) return [];
  const s = await submissions(cik); if (!s || !s.filings || !s.filings.recent) return [];
  const r = s.filings.recent, out = [], want = forms && forms.length ? new Set(forms.map((f) => f.toUpperCase())) : null;
  for (let i = 0; i < r.accessionNumber.length && out.length < limit; i++) {
    const form = r.form[i]; if (want ? !want.has(form) : !FORMS.test(form)) continue;
    const acc = r.accessionNumber[i], doc = r.primaryDocument[i];
    out.push(S.filing({ symbol, cik, form, filingDate: r.filingDate[i], reportDate: r.reportDate[i] || null, accession: acc, description: r.primaryDocDescription[i] || form,
      url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${acc.replace(/-/g, "")}/${doc}`, source: "SEC EDGAR" }));
  }
  return out;
}

// ---- XBRL -> normalized statements ----
const FLOW = {
  revenue: [["us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"], ["us-gaap", "Revenues"], ["us-gaap", "SalesRevenueNet"], ["us-gaap", "RevenueFromContractWithCustomerIncludingAssessedTax"]],
  costOfRevenue: [["us-gaap", "CostOfRevenue"], ["us-gaap", "CostOfGoodsAndServicesSold"], ["us-gaap", "CostOfGoodsSold"]],
  grossProfit: [["us-gaap", "GrossProfit"]],
  operatingIncome: [["us-gaap", "OperatingIncomeLoss"]],
  netIncome: [["us-gaap", "NetIncomeLoss"], ["us-gaap", "ProfitLoss"]],
  interestExpense: [["us-gaap", "InterestExpense"], ["us-gaap", "InterestExpenseNonoperating"]],
  incomeTax: [["us-gaap", "IncomeTaxExpenseBenefit"]],
  rAndD: [["us-gaap", "ResearchAndDevelopmentExpense"]],
  sgAndA: [["us-gaap", "SellingGeneralAndAdministrativeExpense"]],
  da: [["us-gaap", "DepreciationDepletionAndAmortization"], ["us-gaap", "DepreciationAndAmortization"], ["us-gaap", "DepreciationAmortizationAndAccretionNet"]],
  operatingCashFlow: [["us-gaap", "NetCashProvidedByUsedInOperatingActivities"]],
  capex: [["us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment"], ["us-gaap", "PaymentsToAcquireProductiveAssets"]],
  dividendsPaid: [["us-gaap", "PaymentsOfDividends"], ["us-gaap", "PaymentsOfDividendsCommonStock"]],
  buybacks: [["us-gaap", "PaymentsForRepurchaseOfCommonStock"]],
};
const PERSHARE = { eps: [["us-gaap", "EarningsPerShareDiluted"], ["us-gaap", "EarningsPerShareBasicAndDiluted"], ["us-gaap", "EarningsPerShareBasic"]] };
const SHARES = { dilutedShares: [["us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding"], ["us-gaap", "WeightedAverageNumberOfSharesOutstandingBasic"]] };
const INSTANT = {
  cash: [["us-gaap", "CashAndCashEquivalentsAtCarryingValue"], ["us-gaap", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]],
  shortTermInvestments: [["us-gaap", "MarketableSecuritiesCurrent"], ["us-gaap", "ShortTermInvestments"], ["us-gaap", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"]],
  totalCurrentAssets: [["us-gaap", "AssetsCurrent"]], totalAssets: [["us-gaap", "Assets"]], totalCurrentLiabilities: [["us-gaap", "LiabilitiesCurrent"]], totalLiabilities: [["us-gaap", "Liabilities"]],
  shareholdersEquity: [["us-gaap", "StockholdersEquity"], ["us-gaap", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]],
  inventory: [["us-gaap", "InventoryNet"]], receivables: [["us-gaap", "AccountsReceivableNetCurrent"]],
  debtLT: [["us-gaap", "LongTermDebtNoncurrent"], ["us-gaap", "LongTermDebt"]], debtCur: [["us-gaap", "LongTermDebtCurrent"], ["us-gaap", "ShortTermBorrowings"]],
};
const DAY = 864e5, dur = (f) => (Date.parse(f.end) - Date.parse(f.start)) / DAY;

function series(facts, defs, unit, asOf) {
  for (const [tax, concept] of defs) { const c = facts.facts && facts.facts[tax] && facts.facts[tax][concept]; const u = c && c.units && c.units[unit]; if (u && u.length) {
    const available = asOf ? u.filter(f => f.filed && f.filed <= asOf && f.end <= asOf) : u;
    if (available.length) return available;
  } }
  return [];
}
// pick, for each period key, the most recently FILED fact (restatements win)
function pick(rows, keyOf) { const m = new Map(); for (const f of rows) { const k = keyOf(f); if (k == null) continue; const o = m.get(k); if (!o || f.filed > o.filed) m.set(k, f); } return m; }

function buildStatements(facts, symbol, type, asOf) {
  const annual = type === "annual", lo = annual ? 340 : 80, hi = annual ? 390 : 100, forms = annual ? /^(10-K|10-K\/A)$/ : /^(10-Q|10-Q\/A)$/;
  const flows = {}, ps = {}, sh = {};
  for (const [k, d] of Object.entries(FLOW)) flows[k] = pick(series(facts, d, "USD", asOf).filter((f) => f.start && dur(f) > lo && dur(f) < hi && forms.test(f.form || "")), (f) => f.end);
  for (const [k, d] of Object.entries(PERSHARE)) ps[k] = pick(series(facts, d, "USD/shares", asOf).filter((f) => f.start && dur(f) > lo && dur(f) < hi && forms.test(f.form || "")), (f) => f.end);
  for (const [k, d] of Object.entries(SHARES)) sh[k] = pick(series(facts, d, "shares", asOf).filter((f) => f.start && dur(f) > lo && dur(f) < hi && forms.test(f.form || "")), (f) => f.end);
  const inst = {};
  for (const [k, d] of Object.entries(INSTANT)) inst[k] = pick(series(facts, d, "USD", asOf).filter((f) => !f.start && forms.test(f.form || "")), (f) => f.end);
  const anchor = flows.revenue.size ? flows.revenue : flows.netIncome;
  const ends = [...anchor.keys()].sort().reverse().slice(0, annual ? 12 : 16), name = facts.entityName || null, cik = facts.cik ? String(facts.cik) : null, out = [];
  for (const end of ends) {
    const a = anchor.get(end), row = { symbol, name, cik, period: end, periodType: annual ? "annual" : "quarterly", fiscalYear: a.fy || null, fiscalPeriod: a.fp || null, periodStart: a.start, periodEnd: end,
      filingDate: a.filed, form: a.form, accession: a.accn, source: "SEC EDGAR" };
    for (const k of Object.keys(flows)) { const f = flows[k].get(end); if (f) row[k] = f.val; }
    for (const k of Object.keys(ps)) { const f = ps[k].get(end); if (f) row[k] = f.val; }
    for (const k of Object.keys(sh)) { const f = sh[k].get(end); if (f) row[k] = f.val; }
    for (const k of Object.keys(inst)) { const f = inst[k].get(end); if (f) row[k] = f.val; }
    row.totalDebt = (row.debtLT != null || row.debtCur != null) ? (row.debtLT || 0) + (row.debtCur || 0) : null;
    row.capex = row.capex != null ? Math.abs(row.capex) : null;
    if (row.da != null && row.operatingIncome != null) row.ebitda = row.operatingIncome + row.da;
    const st = S.statement(row); st.derived = []; if (row.da != null) st.derived.push("ebitda"); if (a.fp) st.fiscalPeriod = a.fp; out.push(st);
  }
  return out;
}

// Statements are cached by the latest accession number, so they live until a new filing appears.
async function statements(symbol, { type = "annual", asOf } = {}) {
  const cik = await cikFor(symbol); if (!cik) return [];
  const sub = await submissions(cik).catch(() => null);
  const latest = sub && sub.filings && sub.filings.recent && (sub.filings.recent.accessionNumber || [])[0] || "na";
  const { value } = await cacheFetch("statements", `${cik}/${type}/${latest}/${asOf || "latest"}`, async () => buildStatements(await companyFacts(cik), String(symbol).toUpperCase(), type, asOf), { shared: true });
  return value;
}

module.exports = { name, configured: () => true, license: "Public domain (US government). Declared User-Agent required.", directory, cikFor, submissions, companyFacts, profile, filings, statements, buildStatements };
