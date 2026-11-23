// POST /api/billing/checkout {plan:"paid"|"premium"} (signed in) -> {url} of a Stripe Checkout page.
// Paid = ฿399/month (STRIPE_PRICE_PAID), Premium = ฿599/month (STRIPE_PRICE_PREMIUM).
// The redirect back (?billing=success) grants nothing: only the signed webhook changes the plan.
// One active subscription at a time: switching plans goes through the Stripe billing portal.
const { callbackUrl, requireUser, profile, updateProfile } = require("../../_auth");
const { rateHit } = require("../../_lib");
const { stripe } = require("../../_stripe");
const { PRICING } = require("../../_tiers");

// The configured Stripe price must be exactly the advertised plan price (api/_tiers.js PRICING): active,
// THB, monthly, licensed. The deployment checker (scripts/check-release-config.mjs) is not part of the
// Vercel build, so this is checked again before a customer is ever sent to Checkout. A mismatch fails
// closed (503, nothing created, nobody charged). Verified prices are remembered for 10 minutes per instance.
const verified = new Map();
async function priceMatches(plan, priceId) {
  const until = verified.get(priceId);
  if (until && until > Date.now()) return true;
  const p = await stripe("GET", "prices/" + encodeURIComponent(priceId));
  const ok = !!p && p.active === true && p.currency === "thb" && p.unit_amount === PRICING[plan].thb * 100
    && !!p.recurring && p.recurring.interval === "month" && p.recurring.interval_count === 1
    && (p.recurring.usage_type == null || p.recurring.usage_type === "licensed");
  if (ok) verified.set(priceId, Date.now() + 10 * 60e3);
  return ok;
}

const PLANS = {
  paid: { env: "STRIPE_PRICE_PAID", label: "Paid" },
  premium: { env: "STRIPE_PRICE_PREMIUM", label: "Premium" },
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const u = await requireUser(req, res); if (!u) return;
  if (!(await rateHit(`billing/sessions/${u.id}/${Math.floor(Date.now() / 600000)}`, 20))) {
    return res.status(429).json({ error: "Too many billing requests. Try again shortly." });
  }
  const plan = req.body?.plan ?? "premium";
  if (plan !== "paid" && plan !== "premium") return res.status(400).json({ error: "Choose Paid or Premium." });
  const priceId = process.env[PLANS[plan].env];
  if (!process.env.STRIPE_SECRET_KEY || !priceId) return res.status(503).json({ error: `Payments for the ${PLANS[plan].label} plan are not set up on this site yet.` });
  try {
    const p = await profile(u);
    if (p.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(p.sub_status)) {
      return res.status(409).json({ error: "You already have an active subscription. Use Manage subscription to switch plans." });
    }
    if (!(await priceMatches(plan, priceId))) {
      console.error(JSON.stringify({ event: "billing_price_mismatch", plan, expectedSatang: PRICING[plan].thb * 100 }));
      return res.status(503).json({ error: `Checkout for the ${PLANS[plan].label} plan is paused while its price is updated. Nothing was charged.`, code: "price_mismatch" });
    }
    let customer = p.stripe_customer_id;
    if (!customer) {
      const c = await stripe("POST", "customers", { email: u.email, metadata: { user_id: u.id } }, "lekha-customer-" + u.id);
      customer = c.id;
      if (!customer || !(await updateProfile(u.id, { stripe_customer_id: customer }))) throw new Error("Billing customer link unavailable");
    }
    const ret = req.body && ["/v2", "/v3"].includes(req.body.ret) ? req.body.ret : "/";
    const callback = callbackUrl(req);
    if (!callback) return res.status(503).json({ error: "Billing return address is not configured." });
    const origin = new URL(callback).origin;
    const s = await stripe("POST", "checkout/sessions", {
      mode: "subscription", customer, client_reference_id: u.id,
      line_items: { 0: { price: priceId, quantity: 1 } },
      success_url: origin + ret + "?billing=success", cancel_url: origin + ret + "?billing=cancel",
      allow_promotion_codes: "true", subscription_data: { metadata: { user_id: u.id, plan } },
    });
    return res.status(200).json({ url: s.url });
  } catch (e) {
    console.error("checkout failed:", e.message);
    return res.status(502).json({ error: "Could not start checkout. Try again shortly." });
  }
};
module.exports._resetPriceCache = () => verified.clear(); // tests
