// Run: node api/_pricing-presentation.test.js
// Exactly three subscription plans are presented (Free THB 0, Paid THB 399, Premium THB 599) in the React shell,
// the classic /v2 card and the generated /v3 and app bundles. The Demo is offered separately as a preview,
// never as a fourth priced card. Static source checks only: they do not render the pages.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const { PRICING } = require("./_tiers");

assert.deepStrictEqual(Object.fromEntries(Object.entries(PRICING).map(([k, v]) => [k, v.thb])), { free: 0, paid: 399, premium: 599 });

// React Plans page
const acct = read("app/src/pages/account.jsx");
const plansBlock = acct.slice(acct.indexOf("const PLANS = ["), acct.indexOf("export function Plans("));
assert.deepStrictEqual([...plansBlock.matchAll(/^\s{4}id: "([a-z]+)"/gm)].map((m) => m[1]), ["free", "paid", "premium"]);
assert.ok(/const PRICE = \{ free: "฿0\/mo", paid: "฿399\/mo", premium: "฿599\/mo" \}/.test(acct), "React prices");
assert.ok(/data-plan-cards="3"/.test(acct) && /data-demo-preview/.test(acct), "three cards and a separate demo preview");
assert.ok(!/id: "demo"/.test(acct), "no Demo plan card");
// Quotas come from the one entitlements file, never from literals that can drift from what the server enforces.
assert.ok(/Q\("researchQuestionsPerDay", "free"\)/.test(plansBlock), "Free research quota is read from entitlements");
assert.ok(/Q\("chatTurnsPerDay", "free"\)/.test(plansBlock), "Free chat quota is read from entitlements");
for (const tier of ["paid", "premium"]) {
  assert.ok(new RegExp(`Q\\("analystQuestionsPerDay", "${tier}"\\)`).test(plansBlock), tier + " analyst quota");
  assert.ok(new RegExp(`Q\\("chatTurnsPerDay", "${tier}"\\)`).test(plansBlock), tier + " chat quota");
  assert.ok(new RegExp(`Q\\("researchQuestionsPerDay", "${tier}"\\)`).test(plansBlock), tier + " research quota");
  assert.ok(new RegExp(`Q\\("briefingGenerationsPerDay", "${tier}"\\)`).test(plansBlock), tier + " briefing quota");
}
assert.ok(!/\b(30|80) cited research questions/.test(plansBlock), "no hardcoded research quota");
assert.ok(/opens every screen on a simulated sample portfolio/.test(acct), "demo copy says every screen is open");
assert.ok(/plays pre-written sample reports/.test(acct), "demo Council is described honestly");
assert.ok(!/features stay locked in the demo/.test(acct), "demo copy no longer contradicts the open preview");

// classic card source and every generated copy of it
for (const f of ["public/v2/pt-ui.js", "public/v3/lekha-ui.js", "public/app/lekha-ui.js"]) {
  const s = read(f);
  assert.ok(s.includes(`["free", "paid", "premium"].map(function (t) { return planCell(t, cur, signed); })`), f + " renders three plan cells");
  assert.ok(!/demo:\s+\[/.test(s.slice(s.indexOf("var PLAN_VALS"), s.indexOf("function planCell"))), f + " has no Demo plan column");
  assert.ok(s.includes("data-plan-cards='3'") && s.includes("data-demo-preview"), f + " offers the demo separately");
  assert.ok(!/four levels|All four tiers/.test(s), f + " no four-tier copy");
  assert.ok(s.includes("฿399<span class='per'>/mo</span>") && s.includes("฿599<span class='per'>/mo</span>"), f + " prices");
  assert.ok(!/฿(299|699|1,?299)\b/.test(s), f + " no retired price");
  assert.ok(s.includes("grid-template-columns:repeat(3,minmax(0,1fr))"), f + " three-column grid");
}
console.log("pricing presentation ok");
