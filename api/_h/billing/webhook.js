// Stripe webhook: keeps pt_profiles.sub_status / period_end in step with the subscription. Signature-verified.
const { sb } = require("../../_lib");
const { stripe, verifySignature, periodEnd } = require("../../_stripe");

const raw = (req) => new Promise((resolve, reject) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => resolve(Buffer.concat(c).toString("utf8"))); req.on("error", reject); });

// Only prices explicitly assigned to this product can grant paid access.
function planOf(sub) {
  const price = sub.items?.data?.[0]?.price?.id;
  if (!price) throw new Error("Missing subscription price");
  const list = (name) => (process.env[name] || "").split(",").map(s => s.trim()).filter(Boolean);
  if (price === process.env.STRIPE_PRICE_PAID || list("STRIPE_LEGACY_PAID_PRICES").includes(price)) return "paid";
  if (price === process.env.STRIPE_PRICE_PREMIUM || list("STRIPE_LEGACY_PREMIUM_PRICES").includes(price)) return "premium";
  throw new Error("Unmapped subscription price");
}

async function applySub(sub, userId) {
  const body = { stripe_subscription_id: sub.id, sub_status: sub.status, period_end: periodEnd(sub), plan: ["active", "trialing"].includes(sub.status) ? planOf(sub) : "free", stripe_customer_id: sub.customer };
  const key = userId ? "user_id" : "stripe_customer_id";
  const id = userId || sub.customer;
  if (!id) throw new Error("Missing billing profile identifier");
  const profile = `pt_profiles?${key}=eq.${encodeURIComponent(id)}`;
  // A late cancellation or failed renewal of an old subscription must leave its replacement intact.
  const inactive = body.plan === "free";
  const guard = inactive ? `&or=(stripe_subscription_id.is.null,stripe_subscription_id.eq.${encodeURIComponent(sub.id)})` : "";
  const response = await sb(`${profile}${guard}&select=${key}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Entitlement update failed (HTTP ${response.status})`);
  const rows = await response.json();
  if (inactive && Array.isArray(rows) && rows.length === 0) {
    const current = await sb(`${profile}&select=${key},stripe_subscription_id`);
    const matches = current.ok && await current.json();
    if (Array.isArray(matches) && matches.length === 1 && matches[0][key] === id &&
        matches[0].stripe_subscription_id && matches[0].stripe_subscription_id !== sub.id) return;
  }
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.[key] !== id) {
    throw new Error("Entitlement update did not confirm the intended profile");
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const body = await raw(req);
  if (!verifySignature(body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).json({ error: "bad signature" });
  let ev; try { ev = JSON.parse(body); } catch (e) { return res.status(400).end(); }
  try {
    if (process.env.VERCEL_ENV === "preview" && ev.livemode !== false) {
      return res.status(400).json({ error: "Preview accepts test-mode events only." });
    }
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
    console.error(JSON.stringify({ event: "billing_sync_failed", stripeEvent: ev.id, type: ev.type, reason: e instanceof TypeError ? "transport_error" : e instanceof SyntaxError ? "invalid_response" : e.message }));
    return res.status(500).json({ error: "retry" });
  }
};
module.exports.config = { api: { bodyParser: false } };
module.exports.planOf = planOf; // exported for tests
