const { av, cached } = require("../../_lib");
const { newsFrom } = require("../../_mappers");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  try {
    // NEWS_SENTIMENT is a premium endpoint: only enabled when AV_PREMIUM=1 is set in Vercel
    if (req.query.name === "news" && process.env.AV_PREMIUM === "1") {
      const docs = await cached("collection/news", 6 * 36e5, async () => {
        const j = await av({ function: "NEWS_SENTIMENT", topics: "financial_markets,economy_macro", sort: "LATEST", limit: "50" });
        return newsFrom(j);
      });
      return res.status(200).json(docs || []);
    }
    return res.status(200).json([]);
  } catch (e) {
    return res.status(200).json([]);
  }
};
