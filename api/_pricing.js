// Price table for metered services (USD). Used to turn logged usage into cost rows for the admin Costs page.
// Per-1M-token prices; check the provider pages when they change:
//   DeepSeek https://api-docs.deepseek.com/quick_start/pricing   Gemini https://ai.google.dev/gemini-api/docs/pricing
const TOKENS = {
  // DeepSeek: peak-hour list prices. Off-peak (outside 01:00-04:00 and 06:00-10:00 UTC, Mon-Fri) is half of these.
  "deepseek-flash": { in: 0.3, out: 1.2 },
  "deepseek-v4-pro": { in: 1.32, out: 3.96 },
  "glm-4.7-flash": { in: 0, out: 0 },
  "glm-4.5-flash": { in: 0, out: 0 },
  "glm-4.6v-flash": { in: 0, out: 0 },
  "glm-4.6v-flashx": { in: 0.04, out: 0.4 },
  "glm-ocr": { in: 0.03, out: 0.03 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "gemini-3.6-flash": { in: 0.75, out: 3.75 },
  "gemini-3.5-flash": { in: 0.75, out: 3.75 }, // deprecated alias, billed as 3.6 Flash
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
};

// Fixed monthly lines shown on the Costs page when the database has no override (pt_cost_fixed).
const FIXED_DEFAULTS = [
  { service: "Alpha Vantage", usd_month: 0, note: "Free key (25 calls/day). Premium 75/min is $49.99/mo." },
  { service: "Supabase", usd_month: 0, note: "Free plan. Pro is $25/mo." },
  { service: "Vercel", usd_month: 0, note: "Hobby plan. Pro is $20/user/mo." },
  { service: "DeepSeek", usd_month: 0, note: "Pay as you go, charged per token; off-peak hours cost half." },
  { service: "Twelve Data / Alpaca / SEC / FRED", usd_month: 0, note: "Free tiers." },
];

function tokenCost(model, inTok, outTok) {
  const p = TOKENS[String(model || "").toLowerCase()];
  if (!p) return null;
  return ((Number(inTok) || 0) * p.in + (Number(outTok) || 0) * p.out) / 1e6;
}

module.exports = { TOKENS, FIXED_DEFAULTS, tokenCost };
