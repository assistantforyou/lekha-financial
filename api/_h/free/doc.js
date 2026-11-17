const { requireTier } = require("../../_auth");
const { cached, cacheGet } = require("../../_lib");
const { fredSeries } = require("../../_fred");
const { fetchCftc, fetchTic } = require("../../_flows");
const { macroFromFred, fredHistFrom } = require("../../_mappers");
const { volData, backtestDoc } = require("../../_vol");
const { fetchFgi } = require("../../_fgi");

const H12 = 12 * 36e5;
// the monthly series the regime model reads (FRED ids)
const REGIME = ["SAHMREALTIME", "UNRATE", "CPIAUCNS", "CPILFENS", "FEDFUNDS", "GS10", "BAA", "USREC"];

module.exports = async (req, res) => {
  const p = await requireTier(req, res, ["free", "paid", "premium"]);
  if (!p) return;
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
    if (path === "meta/f13") { const h = await cacheGet("free/meta/f13"); return res.status(200).json((h && h.payload) || null); } // built quarterly by scripts/build-13f.mjs
    if (path === "meta/tic") return res.status(200).json((await cached("free/meta/tic", H12, fetchTic)) || null);
    if (path === "meta/fgi") return res.status(200).json((await cached("free/meta/fgi", 3 * 36e5, fetchFgi)) || null);
    if (path === "meta/vixeq_hist") {
      const d = await volData();
      return res.status(200).json((d && backtestDoc(d.vixeq)) || null);
    }
    return res.status(200).json(null);
  } catch (e) {
    return res.status(200).json(null);
  }
};
