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
