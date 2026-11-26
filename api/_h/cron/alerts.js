"use strict";
// Vercel cron: check every user's price, news and earnings alerts once a day.
// Same bearer contract as the other scheduled jobs. No model call.

const { runAlerts } = require("../../_ai/alerts");

module.exports = async (req, res) => {
  const want = process.env.CRON_SECRET;
  if (!want || req.headers.authorization !== `Bearer ${want}`) return res.status(401).json({ error: "unauthorized" });
  try {
    return res.status(200).json(await runAlerts({ budgetMs: 52000 }));
  } catch (e) {
    // The message may carry a symbol, never a credential.
    console.error(JSON.stringify({ event: "scheduled_alerts_failed", job: "alerts", message: String((e && e.message) || e).slice(0, 200) }));
    return res.status(500).json({ error: "failed" });
  }
};
