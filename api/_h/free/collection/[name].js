const { requireTier } = require("../../../_auth");
const { limitsOf } = require("../../../_tiers");
const { newsDocs } = require("../../../_news");
const { etfCollection } = require("../../../_etf");
const { fundCollection } = require("../../../_valuation");
const { estimatesFor, revDoc } = require("../../../_estimates");
const { cleanSymbols, rateLimited } = require("../../../_history");
const { insiderCollection } = require("../../../_insiders");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const p = await requireTier(req, res, ["free", "paid", "premium"]);
  if (!p) return;
  const limits = limitsOf(p);
  const name = String((req.query && req.query.name) || "");
  try {
    if (name === "etf") return res.status(200).json(await etfCollection());
    if (name === "fund") return await fundCollection(req, res, { max: limits.valSymbols });
    if (name === "ins") {
      const list = await insiderCollection();
      if (list.length) res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=21600");
      return res.status(200).json(list);
    }
    if (name === "rev") {
      // revision snapshot for the caller's holdings (tickers in the POST body)
      // null = unlimited plan: revisions still go in batches of MAX_SYMBOLS (Alpha Vantage budget)
      const syms = cleanSymbols(req.method === "POST" && req.body && req.body.symbols, limits.valSymbols == null ? undefined : limits.valSymbols);
      if (!syms.length || (await rateLimited(req))) return res.status(200).json([]);
      const doc = revDoc(await estimatesFor(syms, { fresh: 2, overview: false }));
      return res.status(200).json(doc ? [doc] : []);
    }
    if (name === "news") {
      const docs = await newsDocs();
      const list = Array.isArray(docs) ? docs : [];
      // never let the CDN hold an empty answer: only successful briefings are cacheable
      if (list.length) res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
      return res.status(200).json(list);
    }
  } catch (e) { /* fall through: the panel stays in its "no source" state */ }
  return res.status(200).json([]);
};
