// Tier entitlements — the single source of truth for what each plan gets.
// Commercial plans: free (THB 0), paid (THB 399/mo), premium (THB 599/mo). "demo" is the
// non-billable public preview for visitors without a session: it is not a plan and it is
// never entitled to a restricted feature.
// Pure module: no network — trivially testable. The browser only ever sees its tier through
// /api/auth/me (display only); every restricted endpoint re-resolves it server-side.

const ENT = require("./_data/entitlements.json");

const TIERS = ["demo", "free", "paid", "premium"];
const PLANS = ["free", "paid", "premium"]; // the three commercial subscription plans

// What each tier is entitled to. Numbers the backend enforces; also surfaced via
// /api/auth/me so the UI can show limits and upgrade hints (display only, never trusted).
// null means unlimited (no cap enforced; the data source's own depth applies).
// valSymbols: null = every holding is valued (the client sends batches; each request is still capped server-side).
// demo numbers are the shape of the sample dataset, not server-enforced budgets.
const LIMITS = {
  demo: {
    // the public preview shows Free-level screens on a sample portfolio; restricted features stay locked
    holdings: 14, historyDays: null, valSymbols: 14,
    av: false, ai: false, aiQuestions: 0, simulations: false, briefing: false,
  },
  free: {
    holdings: 20, historyDays: 1825, valSymbols: 12,
    av: false, ai: false, aiQuestions: 0, simulations: false, briefing: false,
  },
  paid: {
    holdings: null, historyDays: null, valSymbols: null,
    av: true, ai: true, aiQuestions: ENT.quotas.analystQuestionsPerDay.paid, simulations: false, briefing: true,
  },
  premium: {
    holdings: null, historyDays: null, valSymbols: null,
    av: true, ai: true, aiQuestions: ENT.quotas.analystQuestionsPerDay.premium, simulations: true, briefing: true,
  },
};

// Public pricing copy (THB, monthly, no invented discounts). Display only; Stripe prices are
// checked against these amounts by scripts/check-release-config.mjs before every deployment.
const PRICING = {
  free: { thb: 0, label: "0 THB/month" },
  paid: { thb: 399, label: "399 THB/month" },
  premium: { thb: 599, label: "599 THB/month" },
};

// Resolve the tier from a pt_profiles row. Server-authoritative: an inactive or
// expired subscription is always free, whatever the stored plan says; admins get premium.
function tierOf(p) {
  if (!p) return "demo";
  if (p.is_admin) return "premium";
  const active = ["active", "trialing"].includes(p.sub_status)
    && !!p.period_end && Date.parse(p.period_end) + 864e5 > Date.now();
  if (!active) return "free";
  // legacy subscribers keep plan "premium" from the old webhook; every mapped Paid price
  // (current and grandfathered) writes plan "paid". Unknown plans fall back to free.
  if (p.plan === "premium") return "premium";
  if (p.plan === "paid") return "paid";
  return "free";
}

const limitsOf = (p) => LIMITS[tierOf(p)];
const has = (p, feature) => !!limitsOf(p)[feature];

// ---- feature access matrix (api/_data/entitlements.json) ----
const FEATURES = Object.freeze(Object.fromEntries(Object.entries(ENT.features).map(([k, v]) => {
  const tiers = v.tiers.filter((t) => PLANS.includes(t)); // demo can never be listed
  if (tiers.length !== v.tiers.length) throw new Error(`entitlements: ${k} lists a non-plan tier`);
  return [k, Object.freeze(tiers)];
})));
const ROUTES = Object.freeze({ ...ENT.routes });
const GROUPS = Object.freeze({ ...ENT.groups });
for (const f of [...Object.values(ROUTES), ...Object.values(GROUPS)]) if (!FEATURES[f]) throw new Error(`entitlements: unknown feature ${f}`);

// the feature that guards an app route ("sector/lead", "simulation/main" ...), or null for unrestricted routes
const featureOfRoute = (key) => {
  const k = String(key || "");
  return ROUTES[k] || GROUPS[k.split("/")[0]] || null;
};
// tier string -> boolean; an unknown feature is a programming error, never "allowed"
function tierAllows(tier, feature) {
  const list = FEATURES[feature];
  if (!list) throw new Error(`unknown feature: ${feature}`);
  return list.includes(tier);
}
const canUse = (p, feature) => tierAllows(tierOf(p), feature);
const featuresOf = (tier) => Object.fromEntries(Object.keys(FEATURES).map((f) => [f, FEATURES[f].includes(tier)]));
// cheapest plan that unlocks a feature ("paid" | "premium")
const planFor = (feature) => (FEATURES[feature] || []).find((t) => t === "paid" || t === "premium") || "premium";
// finite daily quotas per tier; a tier without a configured quota gets 0 (deny)
const quota = (name, tier) => {
  const q = ENT.quotas[name];
  const n = q && q[tier];
  return Number.isInteger(n) && n > 0 ? n : 0;
};

module.exports = { TIERS, PLANS, LIMITS, PRICING, FEATURES, ROUTES, tierOf, limitsOf, has, featureOfRoute, tierAllows, canUse, featuresOf, planFor, quota };
