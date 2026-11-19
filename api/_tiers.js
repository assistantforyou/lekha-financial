// Tier entitlements — the single source of truth for what each plan gets.
// Tiers: demo (public, simulated data), free, paid (฿699/mo), premium (฿1,299/mo).
// Pure module: no network, no imports — trivially testable. The browser only ever sees
// its tier through /api/auth/me; every restricted endpoint re-resolves it server-side.

const TIERS = ["demo", "free", "paid", "premium"];

// What each tier is entitled to. Numbers the backend enforces; also surfaced via
// /api/auth/me so the UI can show limits and upgrade hints (display only, never trusted).
// null means unlimited (no cap enforced; the data source's own depth applies).
// valSymbols: null = every holding is valued (the client sends batches; each request is still capped server-side).
// demo numbers are the shape of the simulated dataset, not server-enforced budgets.
const LIMITS = {
  demo: {
    // the public preview is deliberately open: every screen, the AI analyst and the simulations work
    holdings: 14, historyDays: null, valSymbols: 14,
    av: true, ai: true, aiQuestions: 40, simulations: true, briefing: true,
  },
  free: {
    holdings: 20, historyDays: 1825, valSymbols: 12,
    av: false, ai: false, aiQuestions: 0, simulations: false, briefing: false,
  },
  paid: {
    holdings: null, historyDays: null, valSymbols: null,
    av: true, ai: false, aiQuestions: 0, simulations: false, briefing: false,
  },
  premium: {
    holdings: null, historyDays: null, valSymbols: null,
    av: true, ai: true, aiQuestions: 40, simulations: true, briefing: true,
  },
};

// Public pricing copy (THB, monthly, no invented discounts). Display only.
const PRICING = {
  paid: { thb: 699, label: "699 THB/month" },
  premium: { thb: 1299, label: "1,299 THB/month" },
};

// Resolve the tier from a pt_profiles row. Server-authoritative: an inactive or
// expired subscription is always free, whatever the stored plan says; admins get premium.
function tierOf(p) {
  if (!p) return "demo";
  if (p.is_admin) return "premium";
  const active = ["active", "trialing"].includes(p.sub_status)
    && !!p.period_end && Date.parse(p.period_end) + 864e5 > Date.now();
  if (!active) return "free";
  // legacy $60/mo subscribers keep plan "premium" from the old webhook; the ฿699
  // price writes plan "paid". Unknown plans fall back to free.
  if (p.plan === "premium") return "premium";
  if (p.plan === "paid") return "paid";
  return "free";
}

const limitsOf = (p) => LIMITS[tierOf(p)];
const has = (p, feature) => !!limitsOf(p)[feature];

module.exports = { TIERS, LIMITS, PRICING, tierOf, limitsOf, has };
