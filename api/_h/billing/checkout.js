// POST /api/billing/checkout (signed in) -> {url} of a Stripe Checkout page for the Premium subscription ($60/month).
const { requireUser, profile, updateProfile } = require("../../_auth");
const { stripe } = require("../../_stripe");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const u = await requireUser(req, res); if (!u) return;
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_PREMIUM) return res.status(503).json({ error: "Payments are not set up on this site yet." });
  try {
    const p = await profile(u);
    if (p.premium) return res.status(409).json({ error: "You already have Premium." });
    let customer = p.stripe_customer_id;
    if (!customer) {
      const c = await stripe("POST", "customers", { email: u.email, metadata: { user_id: u.id } });
      customer = c.id; await updateProfile(u.id, { stripe_customer_id: customer });
    }
    const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const s = await stripe("POST", "checkout/sessions", {
      mode: "subscription", customer, client_reference_id: u.id,
      line_items: { 0: { price: process.env.STRIPE_PRICE_PREMIUM, quantity: 1 } },
      success_url: origin + "/?billing=success", cancel_url: origin + "/?billing=cancel",
      allow_promotion_codes: "true", subscription_data: { metadata: { user_id: u.id } },
    });
    return res.status(200).json({ url: s.url });
  } catch (e) {
    console.error("checkout failed:", e.message);
    return res.status(502).json({ error: "Could not start checkout. Try again shortly." });
  }
};
