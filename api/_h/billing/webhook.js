// Stripe webhook: keeps pt_profiles.sub_status / period_end in step with the subscription. Signature-verified.
const { sb } = require("../../_lib");
const { stripe, verifySignature, periodEnd } = require("../../_stripe");

const raw = (req) => new Promise((resolve, reject) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => resolve(Buffer.concat(c).toString("utf8"))); req.on("error", reject); });
const patch = (filter, body) => sb(`pt_profiles?${filter}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });

// Price id -> plan on the profile. An unknown price (e.g. the legacy $60/month plan) maps to
// premium so existing subscribers keep everything they already had.
function planOf(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const price = item && item.price && item.price.id;
  if (price && price === process.env.STRIPE_PRICE_PAID) return "paid";
  return "premium";
}

async function applySub(sub, userId) {
  const body = { stripe_subscription_id: sub.id, sub_status: sub.status, period_end: periodEnd(sub), plan: ["active", "trialing"].includes(sub.status) ? planOf(sub) : "free", stripe_customer_id: sub.customer };
  if (userId) return patch(`user_id=eq.${encodeURIComponent(userId)}`, body);
  return patch(`stripe_customer_id=eq.${encodeURIComponent(sub.customer)}`, body);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const body = await raw(req);
  if (!verifySignature(body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error: "bad signature" });
  let ev; try { ev = JSON.parse(body); } catch (e) { return res.status(400).end(); }
  try {
    const o = ev.data && ev.data.object;
    if (ev.type === "checkout.session.completed" && o.mode === "subscription" && o.subscription) {
      const sub = await stripe("GET", "subscriptions/" + o.subscription);
      await applySub(sub, o.client_reference_id || (sub.metadata && sub.metadata.user_id));
    } else if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(ev.type) && o && o.id) {
      // events can arrive out of order: always store Stripe's current state, never the event's snapshot
      let sub;
      try { sub = await stripe("GET", "subscriptions/" + o.id); }
      catch (e) { if (ev.type === "customer.subscription.deleted") sub = { ...o, status: "canceled" }; else throw e; }
      await applySub(sub, sub.metadata && sub.metadata.user_id);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("webhook failed:", ev.type, e.message);
    return res.status(500).json({ error: "retry" });
  }
};
module.exports.config = { api: { bodyParser: false } };
module.exports.planOf = planOf; // exported for tests
