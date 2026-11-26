// Insider open-market purchases (SEC Form 4, transaction code P) at S&P 500 companies, straight from SEC EDGAR.
// A daily job reads EDGAR's daily form index, fetches each S&P 500 issuer's Form 4 and stores that day's purchases
// (free/f4/YYYY-MM-DD). The page's "cluster buys" are computed from the last 60 days: 2+ different insiders of the same
// company buying within 7 days. SEC asks automated readers to identify themselves and stay under 10 requests/second.
const { cacheGetMany, persistJobData } = require("./_lib");
const CIK = require("./_data/sp500_cik.json");
const SECTOR = Object.fromEntries(require("./_data/sp500.json").stocks);

const UA = process.env.SEC_USER_AGENT || "PortfolioTerminal assistantforyou999@gmail.com";
const SPDR = { "Communication Services": "XLC", "Consumer Discretionary": "XLY", "Consumer Staples": "XLP", Energy: "XLE", Financials: "XLF", "Health Care": "XLV", Industrials: "XLI", "Information Technology": "XLK", Materials: "XLB", "Real Estate": "XLRE", Utilities: "XLU" };
const BY_CIK = {};
for (const [t, c] of Object.entries(CIK)) if (!BY_CIK[c]) BY_CIK[c] = t; // GOOG/GOOGL share a CIK: first ticker wins
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// request starts are serialised 125 ms apart (<= 8/second) while responses overlap
let gate = Promise.resolve();
async function sec(url, tries = 3) {
  for (let i = 0; ; i++) {
    const slot = gate.then(() => sleep(125));
    gate = slot;
    await slot;
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
    if (r.status === 404) return null;
    if ((r.status === 503 || r.status === 429) && i < tries - 1) { await sleep(1500 * (i + 1)); continue; }
    if (!r.ok) throw new Error("sec_" + r.status);
    return r.text();
  }
}

const ymd = (d) => d.toISOString().slice(0, 10);
const qtr = (d) => Math.floor(d.getUTCMonth() / 3) + 1;

// daily form index -> [{cik, ticker, path}] Form 4 filings whose filer CIK is an S&P 500 issuer
function parseIndex(text) {
  const out = [], seen = new Set();
  for (const line of String(text || "").split("\n")) {
    if (!/^4\s/.test(line)) continue; // "4" only (amendments 4/A skipped)
    const m = /\s(\d{3,10})\s+(\d{8})\s+(edgar\/data\/\S+\.txt)\s*$/.exec(line);
    if (!m) continue;
    const t = BY_CIK[Number(m[1])];
    if (!t || seen.has(m[3].split("/").pop())) continue;
    seen.add(m[3].split("/").pop());
    out.push({ ticker: t, cik: Number(m[1]), path: m[3] });
  }
  return out;
}

const tag = (xml, name) => { const r = new RegExp(`<${name}>\\s*(?:<value>)?\\s*([^<]*)`, "i").exec(xml); return r ? r[1].trim() : ""; };
// Form 4 XML -> open-market purchases [{owner, trade, shares, px, value}]
function parseForm4(txt) {
  const doc = /<ownershipDocument>[\s\S]*?<\/ownershipDocument>/i.exec(String(txt || ""));
  if (!doc) return { issuer: null, buys: [] };
  const x = doc[0], issuer = Number(tag(x, "issuerCik")) || null, owner = tag(x, "rptOwnerName");
  const buys = [];
  for (const m of x.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)) {
    const t = m[1];
    if (tag(t, "transactionCode") !== "P" || tag(t, "transactionAcquiredDisposedCode") !== "A") continue;
    const shares = parseFloat(tag(t, "transactionShares")), px = parseFloat(tag(t, "transactionPricePerShare"));
    if (!(shares > 0)) continue;
    buys.push({ owner, trade: tag(t, "transactionDate").slice(0, 10), shares, px: px > 0 ? px : null, value: px > 0 ? Math.round(shares * px) : 0 });
  }
  return { issuer, buys };
}

// Process one filing date: returns purchases [{t, owner, trade, filing, value}] ([] = processed, none found)
async function processDay(date, deadline) {
  const d = new Date(date + "T00:00:00Z");
  const dir = `https://www.sec.gov/Archives/edgar/daily-index/${d.getUTCFullYear()}/QTR${qtr(d)}/`;
  let idx;
  try { idx = await sec(dir + `form.${date.replace(/-/g, "")}.idx`, 1); }
  catch (e) {
    // EDGAR answers 403 (not 404) for a day with no index (holiday): confirm via the directory listing
    const list = await sec(dir);
    if (list && !list.includes(`form.${date.replace(/-/g, "")}.idx`)) return { none: true };
    throw e;
  }
  if (idx == null) return { none: true };
  // resumable: a run that hits its time budget saves what it did, the next run continues
  const part = (await cacheGetMany(["free/f4part/" + date]))["free/f4part/" + date];
  const state = part ? part.payload : { done: [], rows: [] };
  const doneSet = new Set(state.done), out = state.rows;
  const todo = parseIndex(idx).filter((f) => !doneSet.has(f.path));
  let partial = false;
  const worker = async () => {
    for (let f = todo.shift(); f; f = todo.shift()) {
      if (Date.now() > deadline) { partial = true; return; }
      let txt;
      try { txt = await sec("https://www.sec.gov/Archives/" + f.path); } catch (e) { partial = true; continue; }
      doneSet.add(f.path);
      const { issuer, buys } = parseForm4(txt);
      if (!issuer || CIK[f.ticker] !== issuer) continue; // only filings where the S&P 500 company is the issuer
      for (const b of buys) out.push({ t: f.ticker, owner: b.owner.slice(0, 60), trade: b.trade, filing: date, value: b.value });
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  if (partial) { await persistJobData("free/f4part/" + date, { done: [...doneSet], rows: out }); return { partial: true }; }
  return { rows: out };
}

const lastDays = (n, from = new Date()) => { const a = []; for (let i = 1; i <= n; i++) { const d = new Date(from.getTime() - i * 864e5); if (d.getUTCDay() % 6) a.push(ymd(d)); } return a; };

// Cron: fill in any missing business days of the last 62 days, newest first, within the time budget.
async function runInsiders({ budgetMs = 50000, days = 62 } = {}) {
  const deadline = Date.now() + budgetMs;
  const dates = lastDays(days);
  const have = await cacheGetMany(dates.map((d) => "free/f4/" + d));
  const done = [], skipped = [];
  for (const date of dates) {
    if (have["free/f4/" + date]) continue;
    if (Date.now() > deadline - 5000) break;
    const r = await processDay(date, deadline - 2000).catch((e) => ({ error: e.message }));
    if (r.rows) { await persistJobData("free/f4/" + date, r.rows); done.push(date); }
    else if (r.none) { await persistJobData("free/f4/" + date, []); skipped.push(date); }
    else break; // partial or error: try again next run
  }
  return { done, skipped };
}

// 60-day purchases -> cluster rows the page renders
function clusters(rows, asOf = ymd(new Date())) {
  const by = {};
  for (const r of rows) (by[r.t] || (by[r.t] = [])).push(r);
  const out = [];
  for (const [t, list] of Object.entries(by)) {
    list.sort((a, b) => (a.trade < b.trade ? -1 : 1));
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const win = list.filter((r) => r.trade >= list[i].trade && (Date.parse(r.trade) - Date.parse(list[i].trade)) / 864e5 <= 7);
      const owners = new Set(win.map((r) => r.owner));
      if (owners.size >= 2 && (!best || owners.size > best.owners.size)) best = { win, owners };
    }
    if (!best) continue;
    const sector = SECTOR[t] || null;
    out.push({ ticker: t, industry: sector || "", sec: sector ? SPDR[sector] || null : null, ins: best.owners.size,
      value: best.win.reduce((s, r) => s + (r.value || 0), 0), trade: best.win[best.win.length - 1].trade, filing: best.win.map((r) => r.filing).sort().pop() });
  }
  return out.sort((a, b) => (a.filing < b.filing ? 1 : -1));
}

async function insiderCollection() {
  const dates = lastDays(62);
  const have = await cacheGetMany(dates.map((d) => "free/f4/" + d));
  const got = dates.filter((d) => have["free/f4/" + d]);
  if (!got.length) return [];
  const rows = got.flatMap((d) => have["free/f4/" + d].payload || []);
  const cl = clusters(rows);
  const today = ymd(new Date());
  return [{ id: today, data: { date: today, cluster: cl, check: { n: cl.length, value: cl.reduce((s, r) => s + (r.value || 0), 0) }, src: "SEC EDGAR Form 4 (S&P 500 issuers)", days: got.length, coverFrom: got[got.length - 1], purchases: rows.length } }];
}

// Per-symbol lookups do not have to wait for the daily cache: EDGAR full-text search returns the
// issuer's Form 4 filings for a date range, and each hit is parsed directly.
async function recentForSymbol(ticker, { days = 60, limit = 20 } = {}) {
  const t = String(ticker || "").toUpperCase(), cik = CIK[t];
  if (!cik) return [];
  const end = new Date(), start = new Date(Date.now() - days * 864e5);
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${t}"`)}&forms=4&startdt=${ymd(start)}&enddt=${ymd(end)}`;
  let j;
  try { j = JSON.parse(await sec(url)); } catch { return []; }
  const pad = String(cik).padStart(10, "0"), rows = [];
  for (const h of ((j.hits && j.hits.hits) || []).slice(0, limit)) {
    if (!((h._source && h._source.ciks) || []).includes(pad)) continue;
    const [accn, file] = String(h._id || "").split(":");
    if (!accn || !file) continue;
    let txt;
    try { txt = await sec(`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/${file}`); } catch { continue; }
    const { issuer, buys } = parseForm4(txt || "");
    if (issuer !== cik) continue;
    for (const b of buys) rows.push({ t, owner: b.owner, value: b.value, trade: b.trade, filing: accn });
  }
  return rows;
}

module.exports = { parseIndex, parseForm4, clusters, processDay, runInsiders, insiderCollection, recentForSymbol, lastDays };
