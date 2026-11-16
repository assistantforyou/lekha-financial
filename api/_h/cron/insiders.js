// Daily: store SEC Form 4 open-market purchases for S&P 500 issuers (see api/_insiders.js). Bearer CRON_SECRET.
const { runInsiders } = require("../../_insiders");
module.exports = async (req, res) => {
  const want = process.env.CRON_SECRET;
  if (!want || req.headers.authorization !== `Bearer ${want}`) return res.status(401).json({ error: "unauthorized" });
  try { return res.status(200).json(await runInsiders({ budgetMs: 52000 })); }
  catch (e) { return res.status(500).json({ error: "failed" }); }
};
