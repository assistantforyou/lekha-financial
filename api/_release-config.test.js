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
  const issues = releaseIssues({ ...preview, VERCEL_ENV: "production" });
  for (const requirement of ["COMMERCIAL_DATA_APPROVAL", "VITE_PRIVACY_URL", "VITE_TERMS_URL"]) assert.ok(issues.includes(requirement));
});

test("price ids are checked against the configured Stripe account", async () => {
  const { stripePriceIssues } = await import("../scripts/check-release-config.mjs");
  const env = { VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_PRICE_PAID: "price_paid", STRIPE_PRICE_PREMIUM: "price_premium" };
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const monthly = { active: true, currency: "thb", livemode: false, billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };

  assert.deepEqual(await stripePriceIssues(env, async url => reply(200, { ...monthly, unit_amount: url.endsWith("price_paid") ? 29900 : 59900 })), []);
  assert.ok((await stripePriceIssues(env, async () => reply(200, { ...monthly, unit_amount: 59900 }))).some(entry => entry.startsWith("STRIPE_PRICE_PAID")));
  assert.deepEqual(await stripePriceIssues(env, async () => { throw new Error("network"); }), []);
  assert.deepEqual(await stripePriceIssues({ ...env, STRIPE_SECRET_KEY: "" }, async () => { throw new Error("should not be called"); }), []);

  const missing = await stripePriceIssues(env, async () => reply(404, { error: {} }));
  assert.equal(missing.length, 2);
  assert.ok(missing.every(entry => /not found/.test(entry)));

  const wrongMode = await stripePriceIssues(env, async () => reply(200, { livemode: true, recurring: { interval: "month" } }));
  assert.ok(wrongMode.some(entry => /wrong Stripe mode/.test(entry)));

  const oneOff = await stripePriceIssues(env, async () => reply(200, { livemode: false, recurring: null }));
  assert.ok(oneOff.some(entry => /recur monthly/.test(entry)));
});
