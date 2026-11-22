// Vercel cron target (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET"; anything else is refused.
const crypto = require("crypto");
const { runEtf } = require("../../_etf");

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  const got = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (!secret || !got || !same(got, secret)) return res.status(401).json({ error: "unauthorized" });
  try {
    const etf = await runEtf();
    if (!etf.funds && etf.failed?.length) throw new Error("All ETF sources failed");
    return res.status(200).json({ etf });
  }
  catch { console.error(JSON.stringify({ event: "scheduled_refresh_failed", job: "flows" })); return res.status(500).json({ error: "job_failed" }); }
};
