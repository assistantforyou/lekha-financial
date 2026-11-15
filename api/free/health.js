// Free public-data tier: FRED (keyless), more providers are added per dataset.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, name: "Free public data (FRED + Alpaca)", datasets: ["meta/macro", "meta/fredhist", "csv/ROTATION", "csv/RISK", "csv/BREADTH"] });
};
