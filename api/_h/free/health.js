// Free public-data tier: FRED (keyless), more providers are added per dataset.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, name: "FRED + Alpaca", datasets: ["meta/macro", "meta/fredhist", "meta/cftc", "meta/tic", "csv/ROTATION", "csv/RISK", "csv/BREADTH", "csv/OBOS", "csv/HISTORY", "csv/VOLATILITY", "csv/FACTOR", "collection/news", "meta/vixeq_hist"] });
};
