// Public PostHog configuration for the browser (api/ph.js). The project key is a public ingestion key, but it
// still comes from the environment so no deployment-specific value lives in the repository. When the key is
// absent every surface stays silent, which is the default in local development.
const KEY = () => process.env.POSTHOG_KEY || process.env.POSTHOG_PROJECT_KEY || "";
const HOST = () => (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
function uiHost(host) {
  if (process.env.POSTHOG_UI_HOST) return process.env.POSTHOG_UI_HOST.replace(/\/+$/, "");
  // us.i.posthog.com -> us.posthog.com, eu.i.posthog.com -> eu.posthog.com
  const m = /^https:\/\/([a-z0-9-]+)\.i\.posthog\.com$/i.exec(host);
  return m ? "https://" + m[1] + ".posthog.com" : "https://us.posthog.com";
}

module.exports = (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed." });
  const host = HOST(), key = KEY();
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({
    enabled: !!(key && process.env.POSTHOG_DISABLED !== "1"),
    key,
    host,
    uiHost: uiHost(host),
    environment: process.env.VERCEL_ENV || "development",
  });
};
