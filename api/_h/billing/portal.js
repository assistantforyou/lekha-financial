// POST /api/billing/portal (signed in) -> {url} of the Stripe customer portal (cancel, change card, invoices).
const { requireUser, profile } = require("../../_auth");
const { stripe } = require("../../_stripe");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const u = await requireUser(req, res); if (!u) return;
  try {
    const p = await profile(u);
    if (!p.stripe_customer_id) return res.status(404).json({ error: "No billing account yet." });
    const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const s = await stripe("POST", "billing_portal/sessions", { customer: p.stripe_customer_id, return_url: origin + ((req.body && ["/v2", "/v3"].includes(req.body.ret)) ? req.body.ret : "/") });
    return res.status(200).json({ url: s.url });
  } catch (e) {
    console.error("portal failed:", e.message);
    return res.status(502).json({ error: "Could not open billing. Try again shortly." });
  }
};
