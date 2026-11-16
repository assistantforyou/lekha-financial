// GET /api/free/status: when each free dataset was last refreshed (for the Settings page freshness chart). No secrets.
const { cacheGetMany } = require("../_lib");
const { lastDays } = require("../_insiders");

const SETS = [
  ["Rates & inflation (FRED)", "free/meta/macro"], ["Regime inputs (FRED)", "free/meta/fredhist"], ["Futures positioning (CFTC)", "free/meta/cftc"],
  ["Foreign flows (Treasury TIC)", "free/meta/tic"], ["News briefing (RSS + AI)", "free/news"], ["Exchange rates (ECB)", "free/fx"],
  ["ETF prices (Alpaca)", "free/ts/SPY"], ["Breadth (S&P 500)", "free/br/0"], ["Overbought / oversold", "free/ob/etf"], ["13F holders (SEC)", "free/meta/f13"],
];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  const days = lastDays(62);
  const have = await cacheGetMany(SETS.map((s) => s[1]).concat(days.map((d) => "free/f4/" + d)));
  const out = SETS.map(([name, key]) => ({ name, at: have[key] ? new Date(have[key].fetchedAt).toISOString() : null }));
  const f4 = days.filter((d) => have["free/f4/" + d]);
  out.push({ name: "Insider filings (SEC Form 4)", at: f4.length ? new Date(have["free/f4/" + f4[0]].fetchedAt).toISOString() : null, note: `${f4.length} of ${days.length} business days stored` });
  return res.status(200).json({ asOf: new Date().toISOString(), sets: out });
};
