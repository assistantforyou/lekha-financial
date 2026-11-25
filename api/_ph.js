// Server-side PostHog capture (api/_ph.js). Mirrors the browser events for things the client cannot see:
// subscription changes, account lifecycle and API traffic. It talks to PostHog's public capture endpoint with
// the project key, times out quickly and never throws into a request.
//
// Privacy: no e-mails, names, prompts, questions, search text, holdings or balances. `clean()` drops those keys
// and truncates strings; pass only ids, plan names, route names and numbers.

const KEY = () => process.env.POSTHOG_KEY || process.env.POSTHOG_PROJECT_KEY || "";
const HOST = () => (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
const SENSITIVE = /^(email|e_mail|phone|name|full_name|password|passcode|token|access_token|refresh_token|secret|authorization|cookie|prompt|question|answer|message|content|body|text|query|q|holdings|positions|balance|balances|cost_basis|api_key)$/i;

function enabled() {
  return !!(KEY() && process.env.POSTHOG_DISABLED !== "1");
}

function clean(value, depth) {
  if (depth === undefined) depth = 0;
  if (value == null) return value;
  if (typeof value === "string") return value.length > 160 ? value.slice(0, 160) : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return depth > 2 ? undefined : value.slice(0, 20).map((v) => clean(v, depth + 1));
  if (typeof value !== "object") return undefined;
  // beyond two levels the shape is unknown: drop it rather than risk a nested e-mail or balance
  if (depth > 2) return undefined;
  const out = {};
  for (const k of Object.keys(value)) {
    if (SENSITIVE.test(k)) continue;
    const v = clean(value[k], depth + 1);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// Fire-and-forget. Callers should not await it on a request path.
function capture(event, distinctId, properties, opts) {
  if (!enabled() || !event || !distinctId) return Promise.resolve(false);
  const o = opts || {};
  const body = {
    api_key: KEY(),
    event: String(event).slice(0, 80),
    timestamp: new Date().toISOString(),
    properties: Object.assign(
      { distinct_id: String(distinctId).slice(0, 120), $lib: "lekha-server" },
      clean(properties || {}, 0)
    ),
  };
  try {
    return fetch(HOST() + "/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(200, Math.min(4000, o.timeoutMs || 1500))),
    })
      .then((r) => r.ok)
      .catch(() => false);
  } catch (e) {
    return Promise.resolve(false);
  }
}

// Person properties arrive once the account is known (signup, login, billing webhook).
function identify(distinctId, properties) {
  return capture("$identify", distinctId, { $set: clean(properties || {}, 0) });
}

module.exports = { enabled, capture, identify, clean, host: HOST };
