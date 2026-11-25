// Daily: delete audit rows older than the retention window (90 days). Bearer CRON_SECRET.
// pt_audit grows with every API call, so retention is enforced here rather than in the read path.
const { sb } = require("../../_lib");

const DAY_MS = 864e5;
const RETAIN_DAYS = 90;

// Exported so the test can pin the boundary without a database.
function cutoffIso(now = Date.now(), days = RETAIN_DAYS) {
  return new Date(now - days * DAY_MS).toISOString();
}

module.exports = async (req, res) => {
  const want = process.env.CRON_SECRET;
  if (!want || req.headers.authorization !== `Bearer ${want}`) return res.status(401).json({ error: "unauthorized" });
  const cutoff = cutoffIso();
  try {
    const r = await sb(`pt_audit?ts=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (!r.ok) throw new Error(`delete_failed_${r.status}`);
    return res.status(200).json({ ok: true, cutoff, retainDays: RETAIN_DAYS });
  } catch {
    console.error(JSON.stringify({ event: "scheduled_refresh_failed", job: "prune", cutoff }));
    return res.status(500).json({ error: "failed" });
  }
};

module.exports.cutoffIso = cutoffIso;
module.exports.RETAIN_DAYS = RETAIN_DAYS;
