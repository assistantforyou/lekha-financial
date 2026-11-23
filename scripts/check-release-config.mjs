// Runs before a Vercel build. Report setting names only, never values or secret fragments.
import { pathToFileURL } from "node:url";

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
 * A price ID that does not exist in the configured Stripe account only fails at the
 * customer's first click (checkout returns stripe_resource_missing), so the build asks
 * Stripe. Definitive answers (4xx) hold the deployment; a Stripe outage or a missing key
 * is not treated as proof of a bad configuration.
 */
export async function stripePriceIssues(env, fetchImpl = globalThis.fetch) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key || typeof fetchImpl !== "function") return [];
  const issues = [];
  for (const name of ["STRIPE_PRICE_PAID", "STRIPE_PRICE_PREMIUM"]) {
    const id = env[name]?.trim();
    if (!id) continue;
    let res;
    try {
      res = await fetchImpl("https://api.stripe.com/v1/prices/" + encodeURIComponent(id), {
        headers: { Authorization: "Bearer " + key },
      });
    } catch { continue; }
    if (res.status >= 400 && res.status < 500) { issues.push(name + " (not found in this Stripe account)"); continue; }
    if (!res.ok) continue;
    const price = await res.json().catch(() => null);
    if (!price) continue;
    const shouldBeLive = env.VERCEL_ENV === "production";
    if (typeof price.livemode === "boolean" && price.livemode !== shouldBeLive) issues.push(name + " (wrong Stripe mode)");
    if (!price.recurring || price.recurring.interval !== "month" || price.recurring.interval_count !== 1) issues.push(name + " (must recur monthly)");
    const amount = name === "STRIPE_PRICE_PAID" ? 39900 : 69900;
    if (!price.active || price.currency !== "thb" || price.unit_amount !== amount || price.billing_scheme !== "per_unit" || price.recurring?.usage_type !== "licensed") {
      issues.push(name + " (must match the active advertised THB subscription price)");
    }
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issues = [...releaseIssues(process.env), ...await stripePriceIssues(process.env)];
  if (issues.length) {
    console.error("Deployment held. Review " + issues.join(", ") + ". See docs/COMMERCIAL_RELEASE.md.");
    process.exitCode = 1;
  } else console.log("Deployment configuration checks passed.");
}
