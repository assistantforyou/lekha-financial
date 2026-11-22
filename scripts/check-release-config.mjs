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
    for (const key of ["CRON_SECRET", "ZAI_API_KEY", "GEMINI_API_KEY"]) need(key);
    if (!/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || "")) issues.push("production Stripe configuration");
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const issues = releaseIssues(process.env);
  if (issues.length) {
    console.error("Deployment held. Review " + issues.join(", ") + ". See docs/COMMERCIAL_RELEASE.md.");
    process.exitCode = 1;
  } else console.log("Deployment configuration checks passed.");
}
