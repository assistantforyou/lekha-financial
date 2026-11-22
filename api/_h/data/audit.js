// GET /api/data/audit?days=7 (admins only): usage and failure report built from pt_audit (api/_audit.js).
// Per-route error rate and latency, top errors, most active users (short ids), daily trend and a signup -> AI funnel.
const { requireAdmin } = require("../../_auth");
const { sb } = require("../../_lib");
const { summarize } = require("../../_audit");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!(await requireAdmin(req, res))) return;
  const days = Math.min(30, Math.max(1, parseInt((req.query || {}).days, 10) || 7));
  try {
    const r = await sb(`pt_audit?ts=gte.${encodeURIComponent(new Date(Date.now() - days * 864e5).toISOString())}&select=ts,user_id,grp,route,status,outcome,ms,err&order=ts.desc&limit=20000`);
    if (!r.ok) return res.status(502).json({ error: "Audit log unavailable.", code: "audit_read_failed" });
    const rows = await r.json();
    return res.status(200).json({ days, truncated: rows.length >= 20000, ...summarize(rows) });
  } catch (e) { return res.status(502).json({ error: "Audit log unavailable.", code: "audit_read_failed" }); }
};
