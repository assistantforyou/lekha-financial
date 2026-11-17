// Run: node api/_tiers.test.js
// Tier mapping: subscription state -> demo|free|paid|premium. Server-authoritative: the
// profile row from the database is the only input; nothing from the client is trusted here.
const assert = require("assert");
const { TIERS, LIMITS, PRICING, tierOf, limitsOf, has } = require("./_tiers");

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
assert.strictEqual(LIMITS.free.av, false);
assert.strictEqual(LIMITS.free.ai, false);
assert.strictEqual(LIMITS.paid.holdings, null); // null = unlimited
assert.strictEqual(LIMITS.paid.historyDays, null); // full history the source can serve
assert.strictEqual(LIMITS.paid.valSymbols, 25);
assert.strictEqual(LIMITS.paid.av, true);
assert.strictEqual(LIMITS.paid.ai, false);
assert.strictEqual(LIMITS.premium.holdings, null); // null = unlimited
assert.strictEqual(LIMITS.premium.historyDays, null);
assert.strictEqual(LIMITS.premium.valSymbols, 40); // the SEC/valuation pipeline ceiling
assert.strictEqual(LIMITS.premium.ai, true);
assert.strictEqual(LIMITS.premium.aiQuestions, 40);
assert.strictEqual(LIMITS.premium.simulations, true);
assert.strictEqual(LIMITS.premium.briefing, true);

// pricing as configured in Stripe (THB)
assert.strictEqual(PRICING.paid.thb, 699);
assert.strictEqual(PRICING.premium.thb, 1299);

// limitsOf/has derive from tierOf of the same profile
const freeProfile = { plan: "free" };
assert.strictEqual(limitsOf(freeProfile), LIMITS.free);
assert.strictEqual(has(freeProfile, "ai"), false);
assert.strictEqual(has(active("premium"), "ai"), true);
assert.strictEqual(has(active("paid"), "av"), true);
assert.strictEqual(has({ is_admin: true }, "ai"), true);

console.log("tiers ok");
