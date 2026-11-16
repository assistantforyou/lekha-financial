// GET /api/admin/costs (admins only): what the site costs to run. Metered AI usage from pt_costs, fixed monthly
// lines from pt_cost_fixed (defaults in _pricing.js), Stripe revenue this month, and which AI model serves each job.
const { requireAdmin } = require("../_auth");
const { sb } = require("../_lib");
const { aggregate } = require("../_costs");
const { FIXED_DEFAULTS } = require("../_pricing");
const { stripe } = require("../_stripe");
const { describe } = require("../_llm");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!(await requireAdmin(req, res))) return;
  const now = new Date();
  const since = new Date(now.getTime() - 35 * 864e5).toISOString();
  const [rowsR, fixedR] = await Promise.all([
    sb(`pt_costs?ts=gte.${since}&select=ts,service,job,model,units,usd&order=ts.asc&limit=20000`),
    sb("pt_cost_fixed?select=service,usd_month,note"),
  ]);
  const rows = rowsR.ok ? await rowsR.json() : [];
  const dbFixed = fixedR.ok ? await fixedR.json() : [];
  const fixed = FIXED_DEFAULTS.map((d) => dbFixed.find((x) => x.service === d.service) || d).concat(dbFixed.filter((x) => !FIXED_DEFAULTS.some((d) => d.service === x.service)));
  let revenue = null;
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
      const inv = await stripe("GET", "invoices", { status: "paid", limit: 100, created: { gte: start } });
      const subs = await stripe("GET", "subscriptions", { status: "active", limit: 100 });
      revenue = { mtd: (inv.data || []).reduce((s, i) => s + (i.amount_paid || 0), 0) / 100, active: (subs.data || []).length, mode: process.env.STRIPE_SECRET_KEY.startsWith("sk_test") ? "test" : "live" };
    } catch (e) { revenue = { error: "Stripe unavailable" }; }
  }
  const agg = aggregate(rows, now);
  const fixedMonth = fixed.reduce((s, f) => s + (Number(f.usd_month) || 0), 0);
  return res.status(200).json({ ...agg, fixed, fixedMonth, revenue, models: describe(), asOf: now.toISOString(),
    jobs: rows.reduce((o, r) => { o[r.job || "other"] = (o[r.job || "other"] || 0) + 1; return o; }, {}) });
};
