const { newsDocs } = require("../../_news");
const { etfCollection } = require("../../_etf");
const { fundCollection } = require("../../_valuation");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const name = String((req.query && req.query.name) || "");
  try {
    if (name === "etf") return res.status(200).json(await etfCollection());
    if (name === "fund") return await fundCollection(req, res);
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
