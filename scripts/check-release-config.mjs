// Runs as the first step of the Vercel build (vercel.json buildCommand): a failure stops the build, so the
// deployment is never created and the current one keeps serving. Two separate stages:
//   1. Build configuration (releaseIssues): offline checks on the environment's settings: required names,
//      Supabase/Stripe isolation between Preview and Production, and a price map where each price grants one plan.
//   2. Live Stripe integration (stripePriceIssues): asks the configured Stripe account whether the Paid and
//      Premium prices exist, are in the right mode and match the advertised amounts. A Stripe outage holds the
//      deployment too: an unverified price is not treated as a valid one.
// Run locally without network with `--offline` (stage 1 only). Reports setting names only, never values or
// secret fragments. A successful Vercel build is NOT evidence that checkout, the webhook or the portal work:
// those are verified in the staged billing journey (docs/SUBSCRIPTION_ENTITLEMENTS_2026-11-23.md).
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { priceMap } = require("../api/_stripe.js");
const { PRICING } = require("../api/_tiers.js");

export function releaseIssues(env) {
  const issues = [];
  const need = key => { if (!env[key]?.trim()) issues.push(key); };
  const https = key => {
    try {
      const u = new URL(env[key]);
      if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) throw Error();
      return u;
    } catch { issues.push(key); return null; }
  };
  const target = env.VERCEL_ENV;
  if (target !== "preview" && target !== "production") return ["VERCEL_ENV (expected preview or production)"];
  const db = https("SUPABASE_URL");
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PAID", "STRIPE_PRICE_PREMIUM"]) need(key);
  if (env.STRIPE_PRICE_PAID && env.STRIPE_PRICE_PAID === env.STRIPE_PRICE_PREMIUM) issues.push("distinct Paid and Premium prices");
  else if (priceMap(env).issues.length) issues.push("each Stripe price may grant one plan only (STRIPE_LEGACY_PAID_PRICES / STRIPE_LEGACY_PREMIUM_PRICES)");
  const site = https("SITE_URL");
  if (target === "preview") {
    // These non-secret references are set independently from the Supabase connection string.
    need("PRODUCTION_SUPABASE_PROJECT_REF");
    need("STAGING_SUPABASE_PROJECT_REF");
    if (env.PRODUCTION_SUPABASE_PROJECT_REF === env.STAGING_SUPABASE_PROJECT_REF ||
        db?.hostname !== env.STAGING_SUPABASE_PROJECT_REF + ".supabase.co") issues.push("isolated staging Supabase project");
    if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || "")) issues.push("test-mode STRIPE_SECRET_KEY");
    if (env.PREVIEW_ACCESS_PROTECTED !== "true") issues.push("verified Vercel Deployment Protection");
    if (site && ![env.VERCEL_URL, env.VERCEL_BRANCH_URL].includes(site.host)) issues.push("SITE_URL must identify this preview");
  } else {
    need("COMMERCIAL_DATA_APPROVAL"); // Owner's evidence reference covering all retained providers, caches and static datasets.
    https("VITE_TERMS_URL");
    https("VITE_PRIVACY_URL");
    for (const key of ["CRON_SECRET", "DEEPSEEK_API_KEY"]) need(key);
    if (!/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || "")) issues.push("production Stripe configuration");
  }
  return issues;
}

/**
 * Live Stripe integration check. A price ID that does not exist in the configured account, or one whose amount
 * was edited, only fails at a customer's first click, so the build asks Stripe. Every answer that is not a
 * verified match holds the deployment, including a Stripe outage, a missing key or an unreadable response.
 */
export async function stripePriceIssues(env, fetchImpl = globalThis.fetch) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return ["live Stripe check could not run (STRIPE_SECRET_KEY)"];
  if (typeof fetchImpl !== "function") return ["live Stripe check could not run (no fetch)"];
  const issues = [], products = {};
  for (const [name, plan] of [["STRIPE_PRICE_PAID", "paid"], ["STRIPE_PRICE_PREMIUM", "premium"]]) {
    const id = env[name]?.trim();
    if (!id) { issues.push(name + " (not set)"); continue; }
    let res;
    try {
      res = await fetchImpl("https://api.stripe.com/v1/prices/" + encodeURIComponent(id), {
        headers: { Authorization: "Bearer " + key },
      });
    } catch { issues.push(name + " (Stripe unreachable; price not verified)"); continue; }
    if (res.status >= 400 && res.status < 500) { issues.push(name + " (not found in this Stripe account)"); continue; }
    if (!res.ok) { issues.push(name + " (Stripe error " + res.status + "; price not verified)"); continue; }
    const price = await res.json().catch(() => null);
    if (!price) { issues.push(name + " (unreadable Stripe response; price not verified)"); continue; }
    const shouldBeLive = env.VERCEL_ENV === "production";
    if (price.livemode !== shouldBeLive) issues.push(name + " (wrong Stripe mode)");
    if (!price.recurring || price.recurring.interval !== "month" || price.recurring.interval_count !== 1) issues.push(name + " (must recur monthly)");
    const amount = PRICING[plan].thb * 100; // THB 399 / THB 599 in satang (api/_tiers.js PRICING)
    if (!price.active || price.currency !== "thb" || price.unit_amount !== amount || price.billing_scheme !== "per_unit" || price.recurring?.usage_type !== "licensed") {
      issues.push(name + " (must match the active advertised THB subscription price)");
    }
    products[plan] = typeof price.product === "string" ? price.product : price.product?.id;
  }
  // the portal switches plans between products; one product for both plans would make Paid and Premium indistinguishable there
  if (products.paid && products.paid === products.premium) issues.push("Paid and Premium prices must belong to different Stripe products");
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const offline = process.argv.includes("--offline");
  const build = releaseIssues(process.env);
  // the live stage needs a valid target; it is skipped only when the build stage already failed on VERCEL_ENV
  const live = offline ? null : (/^VERCEL_ENV/.test(build[0] || "") ? [] : await stripePriceIssues(process.env));
  const report = (label, list) => console[list.length ? "error" : "log"](label + ": " + (list.length ? "HELD: " + list.join(", ") : "passed"));
  report("Build configuration", build);
  if (live) report("Live Stripe integration", live);
  else console.log("Live Stripe integration: not run (--offline)");
  // --warn-only (owner decision, 23 Nov 2026): report every issue but let the build continue. Checkout still refuses
  // a price that is not the advertised amount (api/_h/billing/checkout.js), so no customer is charged a mismatched price.
  // Remove the flag from vercel.json to make the check blocking again.
  const warnOnly = process.argv.includes("--warn-only");
  if (build.length || (live && live.length)) {
    if (warnOnly) console.error("WARNING: release checks failed (warn-only mode, deployment continues). Paid launch is not cleared. See docs/SUBSCRIPTION_ENTITLEMENTS_2026-11-23.md.");
    else {
      console.error("Deployment held. Nothing was deployed. See docs/COMMERCIAL_RELEASE.md and docs/SUBSCRIPTION_ENTITLEMENTS_2026-11-23.md.");
      process.exitCode = 1;
    }
  } else console.log("Release checks passed. This is configuration evidence only, not a billing test.");
}
