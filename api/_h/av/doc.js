const { requirePremium } = require("../../_auth");
const { av, cached } = require("../../_lib");
const { macroFrom } = require("../../_mappers");

const DAY = 864e5;
module.exports = async (req, res) => {
  if (!(await requirePremium(req, res))) return; // Premium: signed-in subscribers only
  res.setHeader("Cache-Control", "private, no-store");
  const path = String((req.query && req.query.path) || "");
  try {
    if (path === "meta/macro") {
      const doc = await cached("meta/macro", 3 * DAY, async () => {
        const cpi = await av({ function: "CPI", interval: "monthly" });
        const ff = await av({ function: "FEDERAL_FUNDS_RATE", interval: "monthly" });
        const ty = await av({ function: "TREASURY_YIELD", interval: "monthly", maturity: "10year" });
        return macroFrom(cpi, ff, ty);
      });
      return res.status(200).json(doc || null);
    }
    return res.status(200).json(null); // not provided by Alpha Vantage: panel stays in its "no source" state
  } catch (e) {
    return res.status(200).json(null);
  }
};
