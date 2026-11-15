// Free-tier HISTORY dataset for the user's own holdings: daily + weekly closes, benchmark proxies and the live 10y yield.
// Tickers arrive in a POST body (never in the URL) and are not stored or logged; each request is a fresh Alpaca read.
const { getSeries } = require("./_prices");
const { cached } = require("./_lib");
const { fredSeries } = require("./_fred");
const { historyCsv } = require("./_mappers");

const SYMBOL = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;
const MAX_SYMBOLS = 40;
const BENCH = { "INDEXSP:.INX": "SPY", "INDEXNASDAQ:.IXIC": "QQQ" }; // price-return ETF proxies for the page's two benchmark lines

function cleanSymbols(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const t = String(s || "").trim().toUpperCase();
    if (t !== "CASH" && SYMBOL.test(t) && !out.includes(t)) out.push(t);
    if (out.length >= MAX_SYMBOLS) break;
  }
  return out;
}

async function tnx() {
  try {
    const rows = await cached("free/tnx", 3 * 36e5, async () => {
      const r = await fredSeries("DGS10", new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10));
      return r.length ? r.slice(-3) : null;
    });
    return rows && rows.length ? rows[rows.length - 1][1] : null;
  } catch (e) { return null; }
}

async function history(req, res) {
  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const symbols = cleanSymbols(body.symbols);
  const fetchList = [...new Set([...symbols, ...Object.values(BENCH)])];
  const [{ data }, y] = await Promise.all([getSeries(fetchList, 2000), tnx()]);
  const labelled = {};
  for (const s of symbols) if (data[s] && data[s].length) labelled[s] = data[s];
  for (const [label, etf] of Object.entries(BENCH)) if (data[etf] && data[etf].length) labelled[label] = data[etf];
  const csv = historyCsv(labelled, y);
  if (!csv) return res.status(204).end();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  return res.status(200).send(csv);
}

module.exports = { history, cleanSymbols };
