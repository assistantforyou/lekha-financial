const assert = require("node:assert/strict");
const { test } = require("node:test");

test("deployment checks hold an unprotected preview, shared database and live Stripe key", async () => {
  const { releaseIssues } = await import("../scripts/check-release-config.mjs");
  const preview = {
    VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "branch.example", SITE_URL: "https://branch.example",
    SUPABASE_URL: "https://test-db.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture",
    STAGING_SUPABASE_PROJECT_REF: "test-db", PRODUCTION_SUPABASE_PROJECT_REF: "other",
    STRIPE_PRICE_PAID: "p1", STRIPE_PRICE_PREMIUM: "p2", STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "fixture", PREVIEW_ACCESS_PROTECTED: "true",
  };
  assert.deepEqual(releaseIssues(preview), []);
  for (const override of [{ PREVIEW_ACCESS_PROTECTED: "" }, { STRIPE_SECRET_KEY: "sk_live_fixture" },
    { SUPABASE_URL: "https://other.supabase.co" }, { PRODUCTION_SUPABASE_PROJECT_REF: "test-db" },
    { SITE_URL: "https://lekhafinancial.com" }]) assert.ok(releaseIssues({ ...preview, ...override }).length);
  // a price that grants two plans holds the build: identical IDs, or the Paid price listed as legacy Premium
  assert.ok(releaseIssues({ ...preview, STRIPE_PRICE_PREMIUM: "p1" }).includes("distinct Paid and Premium prices"));
  assert.ok(releaseIssues({ ...preview, STRIPE_LEGACY_PREMIUM_PRICES: "old699,p1" }).some(i => /one plan only/.test(i)));
  assert.ok(releaseIssues({ ...preview, STRIPE_LEGACY_PAID_PRICES: "p2" }).some(i => /one plan only/.test(i)));
  assert.deepEqual(releaseIssues({ ...preview, STRIPE_LEGACY_PREMIUM_PRICES: "old699", STRIPE_LEGACY_PAID_PRICES: "old299" }), []);
  // the check runs before the Vercel build again: a failing check stops the deployment
  const vercel = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "../vercel.json"), "utf8"));
  assert.match(vercel.buildCommand, /^node scripts\/check-release-config\.mjs && /);
  const issues = releaseIssues({ ...preview, VERCEL_ENV: "production" });
  for (const requirement of ["COMMERCIAL_DATA_APPROVAL", "VITE_PRIVACY_URL", "VITE_TERMS_URL"]) assert.ok(issues.includes(requirement));
});

test("price ids are checked against the configured Stripe account", async () => {
  const { stripePriceIssues } = await import("../scripts/check-release-config.mjs");
  const env = { VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_PRICE_PAID: "price_paid", STRIPE_PRICE_PREMIUM: "price_premium" };
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const monthly = { active: true, currency: "thb", livemode: false, billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };

  // Paid THB 399 (39,900 satang), Premium THB 599 (59,900 satang): the same amounts api/_tiers.js advertises
  const { PRICING } = require("./_tiers");
  assert.equal(PRICING.paid.thb * 100, 39900);
  assert.equal(PRICING.premium.thb * 100, 59900);
  assert.deepEqual(await stripePriceIssues(env, async url => reply(200, { ...monthly, unit_amount: url.endsWith("price_paid") ? 39900 : 59900 })), []);
  assert.ok((await stripePriceIssues(env, async () => reply(200, { ...monthly, unit_amount: 59900 }))).some(entry => entry.startsWith("STRIPE_PRICE_PAID")));
  // the retired Premium amounts (THB 699 and THB 1,299) are no longer the advertised price: the deployment is held
  for (const old of [69900, 129900]) {
    const held = await stripePriceIssues(env, async url => reply(200, { ...monthly, unit_amount: url.endsWith("price_paid") ? 39900 : old }));
    assert.deepEqual(held, ["STRIPE_PRICE_PREMIUM (must match the active advertised THB subscription price)"]);
  }
  // wrong currency or an inactive price is held too
  assert.ok((await stripePriceIssues(env, async url => reply(200, { ...monthly, currency: "usd", unit_amount: url.endsWith("price_paid") ? 39900 : 59900 }))).length === 2);
  assert.ok((await stripePriceIssues(env, async url => reply(200, { ...monthly, active: false, unit_amount: url.endsWith("price_paid") ? 39900 : 59900 }))).length === 2);
  // fail closed: an outage, a Stripe 5xx, an unreadable answer or a missing key is not a verified price
  const outage = await stripePriceIssues(env, async () => { throw new Error("network"); });
  assert.equal(outage.length, 2); assert.ok(outage.every(e => /not verified/.test(e)));
  assert.equal((await stripePriceIssues(env, async () => reply(503, {}))).length, 2);
  assert.equal((await stripePriceIssues(env, async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }))).length, 2);
  assert.deepEqual(await stripePriceIssues({ ...env, STRIPE_SECRET_KEY: "" }, async () => { throw new Error("should not be called"); }), ["live Stripe check could not run (STRIPE_SECRET_KEY)"]);
  // a price with no livemode flag is not accepted as test mode
  assert.ok((await stripePriceIssues(env, async url => { const { livemode, ...rest } = monthly; return reply(200, { ...rest, unit_amount: url.endsWith("price_paid") ? 39900 : 59900 }); })).some(e => /wrong Stripe mode/.test(e)));
  // Paid and Premium on one Stripe product are held
  assert.deepEqual(await stripePriceIssues(env, async url => reply(200, { ...monthly, product: "prod_same", unit_amount: url.endsWith("price_paid") ? 39900 : 59900 })),
    ["Paid and Premium prices must belong to different Stripe products"]);
  assert.deepEqual(await stripePriceIssues(env, async url => reply(200, { ...monthly, product: url.endsWith("price_paid") ? "prod_p" : "prod_q", unit_amount: url.endsWith("price_paid") ? 39900 : 59900 })), []);

  const missing = await stripePriceIssues(env, async () => reply(404, { error: {} }));
  assert.equal(missing.length, 2);
  assert.ok(missing.every(entry => /not found/.test(entry)));

  const wrongMode = await stripePriceIssues(env, async () => reply(200, { livemode: true, recurring: { interval: "month" } }));
  assert.ok(wrongMode.some(entry => /wrong Stripe mode/.test(entry)));

  const oneOff = await stripePriceIssues(env, async () => reply(200, { livemode: false, recurring: null }));
  assert.ok(oneOff.some(entry => /recur monthly/.test(entry)));
});
