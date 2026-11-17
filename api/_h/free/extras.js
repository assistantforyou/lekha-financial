// POST /api/free/extras {symbols:[...]} -> {ath:{SYM:{v,d,from}}, fx:{usdthb,hkdusd,asOf,source}}
// Tickers come in the POST body (not the URL) and are not stored; per-client rate limit shared with HISTORY.
const { requireTier } = require("../../_auth");
const { cleanSymbols, rateLimited } = require("../../_history");
const { allTimeHighs, fxRates } = require("../../_intl");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const p = await requireTier(req, res, ["free", "paid", "premium"]);
  if (!p) return;
  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const symbols = cleanSymbols(body.symbols);
  const fx = await fxRates().catch(() => null);
  if (!symbols.length) return res.status(200).json({ ath: {}, fx });
  if (await rateLimited(req)) return res.status(200).json({ ath: {}, fx });
  const ath = await allTimeHighs(symbols).catch(() => ({}));
  return res.status(200).json({ ath, fx });
};
