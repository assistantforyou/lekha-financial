const { requirePremium } = require("../../../_auth");
const { av, cached } = require("../../../_lib");
const { newsFrom } = require("../../../_mappers");
const { estimatesFor, revDoc } = require("../../../_estimates");
const { cleanSymbols } = require("../../../_history");
const { newsDocs } = require("../../../_news");

module.exports = async (req, res) => {
  if (!(await requirePremium(req, res))) return; // Premium: signed-in subscribers only
  res.setHeader("Cache-Control", "private, no-store");
  try {
    // NEWS_SENTIMENT is a premium endpoint: only enabled when AV_PREMIUM=1 is set in Vercel
    if (req.query.name === "news" && process.env.AV_PREMIUM === "1") {
      const docs = await cached("collection/news", 6 * 36e5, async () => {
        const j = await av({ function: "NEWS_SENTIMENT", topics: "financial_markets,economy_macro", sort: "LATEST", limit: "50" });
        return newsFrom(j);
      });
      return res.status(200).json(docs || []);
    }
    if (req.query.name === "news") return res.status(200).json((await newsDocs()) || []); // until AV news is enabled
    if (req.query.name === "rev") {
      // Premium: more fresh Alpha Vantage calls per request than the free tier
      const syms = cleanSymbols(req.method === "POST" && req.body && req.body.symbols).slice(0, 25);
      const doc = syms.length ? revDoc(await estimatesFor(syms, { fresh: process.env.AV_PREMIUM === "1" ? 12 : 3, overview: false })) : null;
      return res.status(200).json(doc ? [doc] : []);
    }
    return res.status(200).json([]);
  } catch (e) {
    return res.status(200).json([]);
  }
};
