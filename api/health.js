// Health check for the built-in Alpha Vantage proxy. Datasets are added incrementally.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, name: "Portfolio Terminal proxy (Alpha Vantage)", datasets: [] });
};
