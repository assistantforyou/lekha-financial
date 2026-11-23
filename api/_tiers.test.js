// Run: node api/_tiers.test.js
// Tier mapping: subscription state -> demo|free|paid|premium. Server-authoritative: the
// profile row from the database is the only input; nothing from the client is trusted here.
const assert = require("assert");
const { TIERS, PLANS, LIMITS, PRICING, FEATURES, tierOf, limitsOf, has, featureOfRoute, tierAllows, canUse, featuresOf, planFor, quota } = require("./_tiers");

const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
const DAY = 864e5;
const active = (plan) => ({ plan, sub_status: "active", period_end: iso(10 * DAY) });

assert.deepStrictEqual(TIERS, ["demo", "free", "paid", "premium"]);

// no session / no profile -> demo (public simulated experience)
assert.strictEqual(tierOf(null), "demo");
assert.strictEqual(tierOf(undefined), "demo");

// admins get premium (they also keep it while a sub lapses)
assert.strictEqual(tierOf({ is_admin: true }), "premium");
assert.strictEqual(tierOf({ is_admin: true, plan: "free", sub_status: "canceled" }), "premium");

// inactive or expired subscription -> free, whatever the stored plan says
assert.strictEqual(tierOf({ plan: "premium", sub_status: "canceled", period_end: iso(30 * DAY) }), "free");
assert.strictEqual(tierOf({ plan: "paid", sub_status: "active", period_end: iso(-3 * DAY) }), "free"); // beyond 1-day grace
assert.strictEqual(tierOf({ plan: "premium", sub_status: "past_due", period_end: iso(30 * DAY) }), "free");

// grace window: expired under a day ago still counts
assert.strictEqual(tierOf({ plan: "paid", sub_status: "active", period_end: iso(-3600e3) }), "paid");

// live subscriptions
assert.strictEqual(tierOf(active("paid")), "paid");
assert.strictEqual(tierOf(active("premium")), "premium");
assert.strictEqual(tierOf({ plan: "premium", sub_status: "trialing", period_end: iso(5 * DAY) }), "premium");

// legacy $60/month subscribers were stored with plan "premium" -> grandfathered to premium
assert.strictEqual(tierOf(active("premium")), "premium");

// unknown plan strings and missing plan -> free (never premium by default)
assert.strictEqual(tierOf(active("whatever")), "free");
assert.strictEqual(tierOf({ sub_status: "active", period_end: iso(10 * DAY) }), "free");

// limits per tier (the gating numbers the whole backend reads)
assert.strictEqual(LIMITS.demo.holdings, 14);
assert.strictEqual(LIMITS.free.holdings, 20);
assert.strictEqual(LIMITS.free.historyDays, 1825); // 5 years of own-portfolio history
assert.strictEqual(LIMITS.free.valSymbols, 12);
assert.strictEqual(LIMITS.demo.ai, false); // the demo is a preview, not an open Premium account
assert.strictEqual(LIMITS.demo.simulations, false);
assert.strictEqual(LIMITS.demo.av, false);
assert.strictEqual(LIMITS.free.av, false);
assert.strictEqual(LIMITS.free.ai, false);
assert.strictEqual(LIMITS.paid.holdings, null); // null = unlimited
assert.strictEqual(LIMITS.paid.historyDays, null); // full history the source can serve
assert.strictEqual(LIMITS.paid.valSymbols, null); // unlimited valuation coverage (client batches)
assert.strictEqual(LIMITS.paid.av, true);
assert.strictEqual(LIMITS.paid.ai, true); // the portfolio analyst + briefing are Paid features since 23 Nov 2026
assert.strictEqual(LIMITS.paid.aiQuestions, 20);
assert.strictEqual(LIMITS.paid.briefing, true);
assert.strictEqual(LIMITS.paid.simulations, false);
assert.strictEqual(LIMITS.premium.holdings, null); // null = unlimited
assert.strictEqual(LIMITS.premium.historyDays, null);
assert.strictEqual(LIMITS.premium.valSymbols, null); // unlimited valuation coverage (client batches)
assert.strictEqual(LIMITS.demo.valSymbols, 14);
assert.strictEqual(LIMITS.premium.ai, true);
assert.strictEqual(LIMITS.premium.aiQuestions, 40);
assert.strictEqual(LIMITS.premium.simulations, true);
assert.strictEqual(LIMITS.premium.briefing, true);

// pricing as configured in Stripe (THB)
assert.strictEqual(PRICING.paid.thb, 399);
assert.strictEqual(PRICING.premium.thb, 599);
assert.strictEqual(PRICING.free.thb, 0);
assert.deepStrictEqual(PLANS, ["free", "paid", "premium"]); // exactly three commercial plans
assert.deepStrictEqual(Object.keys(PRICING).sort(), ["free", "paid", "premium"]);

// limitsOf/has derive from tierOf of the same profile
const freeProfile = { plan: "free" };
assert.strictEqual(limitsOf(freeProfile), LIMITS.free);
assert.strictEqual(has(freeProfile, "ai"), false);
assert.strictEqual(has(active("premium"), "ai"), true);
assert.strictEqual(has(active("paid"), "av"), true);
assert.strictEqual(has({ is_admin: true }, "ai"), true);

// ---- feature access matrix (23 Nov 2026) ----
const M = {
  "macro/rotation": "paid", "macro/intel": "paid", "macro/appetite": "paid",
  "analysis/value": "paid", "analysis/deep": "paid", "analysis/ask": "paid", "analysis/briefing": "paid",
  "analysis/council": "premium", "analysis/reports": "premium", "analysis/stress": "premium",
  "sector/now": "paid", "sector/rrg": "paid", "sector/lead": "paid", "sector/breadth": "paid", "sector/anything-new": "paid",
  "simulation/main": "premium", "simulation/projection": "premium", "simulation/anything-new": "premium",
};
for (const [route, cheapest] of Object.entries(M)) {
  const f = featureOfRoute(route);
  assert.ok(f, route + " must be restricted");
  assert.strictEqual(planFor(f), cheapest, route);
  assert.strictEqual(tierAllows("demo", f), false, route + " demo");
  assert.strictEqual(tierAllows("free", f), false, route + " free");
  assert.strictEqual(tierAllows("paid", f), cheapest === "paid", route + " paid");
  assert.strictEqual(tierAllows("premium", f), true, route + " premium");
}
// Free features stay unrestricted (distinct from Risk appetite and Market intelligence)
for (const route of ["portfolio/overview", "portfolio/holdings", "portfolio/risk", "portfolio/watchlist", "research/company", "research/agent", "research/news",
  "macro/dashboard", "macro/regime", "account/plans", "account/profile", "account/data"]) assert.strictEqual(featureOfRoute(route), null, route + " is Free");
// demo is never listed in any feature; unknown features are an error, never "allowed"
for (const [f, tiers] of Object.entries(FEATURES)) assert.ok(!tiers.includes("demo") && tiers.includes("premium"), f);
assert.throws(() => tierAllows("premium", "noSuchFeature"), /unknown feature/);
// canUse resolves from the verified profile: expired / past_due / cancelled lose access at once, admins keep it
assert.strictEqual(canUse(active("paid"), "marketIntel"), true);
assert.strictEqual(canUse(active("paid"), "simulation"), false);
assert.strictEqual(canUse(active("paid"), "council"), false);
assert.strictEqual(canUse(active("premium"), "council"), true);
assert.strictEqual(canUse({ plan: "premium", sub_status: "past_due", period_end: iso(30 * DAY) }, "simulation"), false);
assert.strictEqual(canUse({ plan: "premium", sub_status: "canceled", period_end: iso(30 * DAY) }, "council"), false);
assert.strictEqual(canUse({ plan: "paid", sub_status: "active", period_end: iso(-3 * DAY) }, "sectorRotation"), false);
assert.strictEqual(canUse(null, "marketRotation"), false);
assert.strictEqual(canUse({ is_admin: true }, "simulation"), true);
// featuresOf is what /api/auth/me shows the UI
assert.ok(Object.values(featuresOf("free")).every((v) => v === false));
assert.ok(Object.values(featuresOf("demo")).every((v) => v === false));
assert.ok(Object.values(featuresOf("premium")).every((v) => v === true));
assert.strictEqual(featuresOf("paid").analyst, true);
assert.strictEqual(featuresOf("paid").councilReports, false);
// finite AI quotas: Paid gets fewer than Premium; tiers without the feature get 0
assert.strictEqual(quota("analystQuestionsPerDay", "paid"), 20);
assert.strictEqual(quota("analystQuestionsPerDay", "premium"), 40);
assert.strictEqual(quota("briefingGenerationsPerDay", "paid"), 1);
assert.strictEqual(quota("briefingGenerationsPerDay", "premium"), 3);
assert.strictEqual(quota("expertQuestionsPerDay", "paid"), 30);
assert.strictEqual(quota("expertQuestionsPerDay", "premium"), 80);
for (const t of ["demo", "free"]) for (const q of ["analystQuestionsPerDay", "briefingGenerationsPerDay", "expertQuestionsPerDay"]) assert.strictEqual(quota(q, t), 0);
assert.strictEqual(quota("noSuchQuota", "premium"), 0);

console.log("tiers ok");
