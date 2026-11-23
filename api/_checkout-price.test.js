// Run: node api/_checkout-price.test.js
// Billing for the three plans (Free THB 0, Paid THB 399, Premium THB 599), offline. Stripe and Supabase are
// fixtures at global fetch; nothing leaves this machine. MOCKED: proves the handlers, not the Stripe account.
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { Readable } = require("node:stream");
Object.assign(process.env, {
  VERCEL_ENV: "preview", SITE_URL: "https://fixture.invalid", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture",
  STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_PRICE_PAID: "price_paid_399", STRIPE_PRICE_PREMIUM: "price_premium_599",
  // the THB 699 Premium price sold on 23 Nov stays mapped so anyone who bought it keeps Premium
  STRIPE_LEGACY_PAID_PRICES: "price_paid_old", STRIPE_LEGACY_PREMIUM_PRICES: "price_premium_699,price_premium_1299",
});
const DAY = 864e5;
const prices = {
  price_paid_399: { active: true, currency: "thb", unit_amount: 39900, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } },
  price_premium_599: { active: true, currency: "thb", unit_amount: 59900, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } },
};
let profile, stripeCalls, stripeDown = false, sub = null;
global.fetch = async (url, options = {}) => {
  const u = new URL(url), path = u.pathname;
  if (u.hostname === "fixture.invalid") {
    if (path === "/auth/v1/user") return Response.json({ id: "a", email: "a@example.test", email_confirmed_at: "2026-01-01" });
    if (path.endsWith("/pt_rate_hit")) return Response.json(true);
    if (path.endsWith("/pt_profiles")) {
      if (options.method === "PATCH") { Object.assign(profile, JSON.parse(options.body)); return Response.json([{ user_id: "a", stripe_customer_id: profile.stripe_customer_id }]); }
      return Response.json([profile]);
    }
    return Response.json([]);
  }
  if (u.hostname === "api.stripe.com") {
    stripeCalls.push(path);
    if (stripeDown) return Response.json({ error: { code: "api_error" } }, { status: 500 });
    const m = /\/v1\/prices\/(.+)$/.exec(path);
    if (m) return prices[decodeURIComponent(m[1])] ? Response.json({ id: m[1], ...prices[decodeURIComponent(m[1])] }) : Response.json({ error: { code: "resource_missing" } }, { status: 404 });
    if (path === "/v1/customers") return Response.json({ id: "cus_a" });
    if (path === "/v1/checkout/sessions") return Response.json({ url: "https://checkout.stripe.test/" + new URLSearchParams(options.body).get("line_items[0][price]") });
    if (path === "/v1/billing_portal/sessions") return Response.json({ url: "https://portal.stripe.test/", return_url: new URLSearchParams(options.body).get("return_url") });
    if (path.startsWith("/v1/subscriptions/")) return Response.json(sub);
  }
  throw new Error("unexpected request " + url);
};
const checkout = require("./_h/billing/checkout");
const portal = require("./_h/billing/portal");
const webhook = require("./_h/billing/webhook");
const { tierOf, canUse } = require("./_tiers");
const call = async (h, body) => { const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(d) { this.data = d; return this; } }; await h({ method: "POST", headers: { authorization: "Bearer t", host: "fixture.invalid" }, body }, res); return res; };
const fresh = () => { profile = { user_id: "a", email: "a@example.test", plan: "free" }; stripeCalls = []; checkout._resetPriceCache(); };
const deliver = async (type, s) => {
  sub = s;
  const event = { id: "evt_" + Math.random(), livemode: false, type, data: { object: type === "checkout.session.completed" ? { mode: "subscription", subscription: s.id, client_reference_id: "a" } : s } };
  const payload = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const req = Readable.from([Buffer.from(payload)]);
  Object.assign(req, { method: "POST", headers: { "stripe-signature": `t=${t},v1=` + createHmac("sha256", "whsec_fixture").update(t + "." + payload).digest("hex") } });
  const res = { setHeader() {}, status(c) { this.code = c; return this; }, json() { return this; }, end() { return this; } };
  await webhook(req, res);
  return res.code;
};
const subOf = (price, status = "active") => ({ id: "sub_a", status, customer: "cus_a", metadata: { user_id: "a" }, items: { data: [{ price: { id: price }, current_period_end: Math.floor((Date.now() + 30 * DAY) / 1000) }] } });

(async () => {
  // Free -> Paid and Free -> Premium open real Checkout sessions at the advertised prices
  fresh();
  let r = await call(checkout, { plan: "paid" });
  assert.equal(r.code, 200); assert.equal(r.data.url, "https://checkout.stripe.test/price_paid_399");
  assert.deepEqual(stripeCalls, ["/v1/prices/price_paid_399", "/v1/customers", "/v1/checkout/sessions"]);
  fresh();
  r = await call(checkout, { plan: "premium" });
  assert.equal(r.code, 200); assert.equal(r.data.url, "https://checkout.stripe.test/price_premium_599");

  // A Premium price that is not THB 599 (the retired THB 699 or THB 1,299, a USD price, an inactive or yearly
  // price, or a price missing from this account) holds Checkout: nothing is created and nobody is charged.
  for (const wrong of [
    { unit_amount: 69900 }, { unit_amount: 129900 }, { currency: "usd" }, { active: false },
    { recurring: { interval: "year", interval_count: 1 } }, { recurring: null },
  ]) {
    fresh(); prices.price_premium_599 = { ...prices.price_premium_599, ...wrong };
    r = await call(checkout, { plan: "premium" });
    assert.equal(r.code, 503, JSON.stringify(wrong)); assert.equal(r.data.code, "price_mismatch");
    assert.deepEqual(stripeCalls, ["/v1/prices/price_premium_599"], "no customer or session after a mismatch");
    prices.price_premium_599 = { active: true, currency: "thb", unit_amount: 59900, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
  }
  fresh(); delete prices.price_premium_599;
  r = await call(checkout, { plan: "premium" });
  assert.equal(r.code, 502, "a price id missing from the account fails closed");
  assert.deepEqual(stripeCalls, ["/v1/prices/price_premium_599"]);
  prices.price_premium_599 = { active: true, currency: "thb", unit_amount: 59900, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
  fresh(); stripeDown = true;
  r = await call(checkout, { plan: "paid" });
  assert.equal(r.code, 502, "a Stripe outage fails closed");
  stripeDown = false;
  // the verified price is remembered: the second checkout does not re-read it
  fresh(); await call(checkout, { plan: "paid" }); profile = { user_id: "a", email: "a@example.test", plan: "free" }; stripeCalls = [];
  await call(checkout, { plan: "paid" });
  assert.deepEqual(stripeCalls, ["/v1/customers", "/v1/checkout/sessions"]);

  // Paid -> Premium and Premium -> Paid never open a second subscription: Checkout refuses, the portal switches plans
  fresh(); Object.assign(profile, { plan: "paid", sub_status: "active", stripe_subscription_id: "sub_a", stripe_customer_id: "cus_a", period_end: new Date(Date.now() + 30 * DAY).toISOString() });
  r = await call(checkout, { plan: "premium" });
  assert.equal(r.code, 409);
  assert.ok(!stripeCalls.includes("/v1/checkout/sessions"));
  r = await call(portal, {});
  assert.equal(r.code, 200); assert.equal(r.data.url, "https://portal.stripe.test/");
  // re-subscribe after cancellation is a fresh Checkout
  Object.assign(profile, { plan: "free", sub_status: "canceled" });
  r = await call(checkout, { plan: "premium" });
  assert.equal(r.code, 200);

  // Entitlements change only through the signed webhook and always follow Stripe's current price
  fresh(); Object.assign(profile, { stripe_customer_id: "cus_a" });
  assert.equal(await deliver("checkout.session.completed", subOf("price_paid_399")), 200);
  assert.equal(tierOf(profile), "paid"); assert.equal(canUse(profile, "sectorRotation"), true); assert.equal(canUse(profile, "simulation"), false);
  assert.equal(await deliver("customer.subscription.updated", subOf("price_premium_599")), 200); // Paid -> Premium in the portal
  assert.equal(tierOf(profile), "premium"); assert.equal(canUse(profile, "council"), true);
  assert.equal(await deliver("customer.subscription.updated", subOf("price_paid_399")), 200); // Premium -> Paid
  assert.equal(tierOf(profile), "paid"); assert.equal(canUse(profile, "council"), false); assert.equal(canUse(profile, "councilReports"), false);
  // grandfathered prices keep their plan; THB 699 Premium buyers stay Premium
  assert.equal(await deliver("customer.subscription.updated", subOf("price_premium_699")), 200);
  assert.equal(tierOf(profile), "premium");
  assert.equal(await deliver("customer.subscription.updated", subOf("price_paid_old")), 200);
  assert.equal(tierOf(profile), "paid");
  // failed renewal: past_due loses paid access at once; recovery restores it
  assert.equal(await deliver("customer.subscription.updated", subOf("price_premium_599", "past_due")), 200);
  assert.equal(tierOf(profile), "free"); assert.equal(canUse(profile, "marketIntel"), false);
  assert.equal(await deliver("customer.subscription.updated", subOf("price_premium_599", "active")), 200);
  assert.equal(tierOf(profile), "premium");
  // an unknown price never grants access: the webhook asks Stripe to retry and the plan is unchanged
  const before = profile.plan;
  assert.equal(await deliver("customer.subscription.updated", subOf("price_from_another_product")), 500);
  assert.equal(profile.plan, before);
  // a live-mode event is refused on a Preview
  sub = subOf("price_premium_599");
  {
    const payload = JSON.stringify({ id: "evt_live", livemode: true, type: "customer.subscription.updated", data: { object: sub } }), t = Math.floor(Date.now() / 1000);
    const req = Readable.from([Buffer.from(payload)]);
    Object.assign(req, { method: "POST", headers: { "stripe-signature": `t=${t},v1=` + createHmac("sha256", "whsec_fixture").update(t + "." + payload).digest("hex") } });
    const res = { setHeader() {}, status(c) { this.code = c; return this; }, json() { return this; }, end() { return this; } };
    await webhook(req, res);
    assert.equal(res.code, 400);
  }
  // cancellation ends access; expiry beyond the one-day grace ends access even if the status lags
  assert.equal(await deliver("customer.subscription.deleted", subOf("price_premium_599", "canceled")), 200);
  assert.equal(tierOf(profile), "free");
  assert.equal(tierOf({ plan: "premium", sub_status: "active", period_end: new Date(Date.now() - 2 * DAY).toISOString() }), "free");

  // REGRESSION (cross-plan cache reuse): a price verified as Paid THB 399 must never pass Premium's THB 599 check,
  // even inside the 10-minute cache window on the same instance.
  fresh();
  r = await call(checkout, { plan: "paid" });
  assert.equal(r.code, 200, "THB 399 verified for Paid");
  {
    const keep = { paid: process.env.STRIPE_PRICE_PAID, premium: process.env.STRIPE_PRICE_PREMIUM };
    // no checkout._resetPriceCache() here: the Paid verification above is still cached
    profile = { user_id: "a", email: "a@example.test", plan: "free" }; stripeCalls = [];
    process.env.STRIPE_PRICE_PAID = "price_paid_new"; process.env.STRIPE_PRICE_PREMIUM = "price_paid_399";
    r = await call(checkout, { plan: "premium" });
    assert.equal(r.code, 503); assert.equal(r.data.code, "price_mismatch", "the cached Paid result is not reused for Premium");
    assert.deepEqual(stripeCalls, ["/v1/prices/price_paid_399"], "Premium re-reads the price and creates nothing");
    // identical Paid and Premium price IDs: both plans refuse before any Stripe call
    process.env.STRIPE_PRICE_PAID = "price_paid_399"; process.env.STRIPE_PRICE_PREMIUM = "price_paid_399";
    for (const plan of ["paid", "premium"]) {
      profile = { user_id: "a", email: "a@example.test", plan: "free" }; stripeCalls = [];
      r = await call(checkout, { plan });
      assert.equal(r.code, 503, plan); assert.equal(r.data.code, "price_conflict");
      assert.deepEqual(stripeCalls, [], "no Stripe request with an ambiguous price map");
    }
    // the current Paid price listed as a legacy Premium price is the same conflict
    Object.assign(process.env, { STRIPE_PRICE_PAID: keep.paid, STRIPE_PRICE_PREMIUM: keep.premium });
    const legacy = process.env.STRIPE_LEGACY_PREMIUM_PRICES;
    process.env.STRIPE_LEGACY_PREMIUM_PRICES = legacy + "," + keep.paid;
    profile = { user_id: "a", email: "a@example.test", plan: "free" }; stripeCalls = [];
    r = await call(checkout, { plan: "premium" });
    assert.equal(r.data.code, "price_conflict");
    // and the webhook grants nothing for an ambiguous price (Stripe retries after the configuration is fixed)
    Object.assign(profile, { stripe_customer_id: "cus_a" });
    assert.equal(await deliver("customer.subscription.updated", subOf(keep.paid)), 500);
    assert.equal(profile.plan, "free");
    process.env.STRIPE_LEGACY_PREMIUM_PRICES = legacy;
    assert.equal(await deliver("customer.subscription.updated", subOf(keep.paid)), 200);
    assert.equal(profile.plan, "paid");
  }

  // the portal returns with a marker so the app re-reads the verified plan (the marker itself grants nothing)
  fresh(); Object.assign(profile, { stripe_customer_id: "cus_a" });
  global.fetch = ((inner) => async (url, o) => {
    if (String(url).endsWith("/v1/billing_portal/sessions")) { assert.match(new URLSearchParams(o.body).get("return_url"), /\/\?billing=portal$/); }
    return inner(url, o);
  })(global.fetch);
  assert.equal((await call(portal, {})).code, 200);

  console.log("checkout prices and plan transitions ok");
})().catch((e) => { console.error(e); process.exit(1); });
