const { cached } = require("../_lib");
const { fredSeries } = require("../_fred");
const { fetchCftc, fetchTic } = require("../_flows");
const { macroFromFred, fredHistFrom } = require("../_mappers");
const { volData, backtestDoc } = require("../_vol");

const H12 = 12 * 36e5;
// the monthly series the regime model reads (FRED ids)
const REGIME = ["SAHMREALTIME", "UNRATE", "CPIAUCNS", "CPILFENS", "FEDFUNDS", "GS10", "BAA", "USREC"];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  const path = String((req.query && req.query.path) || "");
  try {
    if (path === "meta/macro") {
      const doc = await cached("free/meta/macro", H12, async () => {
        const [cpi, ff, ty] = await Promise.all([fredSeries("CPIAUCNS"), fredSeries("FEDFUNDS"), fredSeries("GS10")]);
        return macroFromFred(cpi, ff, ty);
      });
      return res.status(200).json(doc || null);
    }
    if (path === "meta/fredhist") {
      const doc = await cached("free/meta/fredhist", H12, async () => {
        const rows = await Promise.all(REGIME.map((id) => fredSeries(id)));
        return fredHistFrom(Object.fromEntries(REGIME.map((id, i) => [id, rows[i]])));
      });
      return res.status(200).json(doc || null);
    }
    if (path === "meta/cftc") return res.status(200).json((await cached("free/meta/cftc", H12, fetchCftc)) || null);
    if (path === "meta/tic") return res.status(200).json((await cached("free/meta/tic", H12, fetchTic)) || null);
    if (path === "meta/vixeq_hist") {
      const d = await volData();
      return res.status(200).json((d && backtestDoc(d.vixeq)) || null);
    }
    return res.status(200).json(null);
  } catch (e) {
    return res.status(200).json(null);
  }
};
