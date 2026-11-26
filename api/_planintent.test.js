// Run: node api/_planintent.test.js
// A visitor without a session picks a plan: the choice survives sign-up, sign-in and the e-mail confirmation round trip,
// is used once, and never sends someone to checkout who did not ask for it.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

const box = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), size: () => m.size }; };
const T = 1_800_000_000_000, MIN = 60e3;

(async () => {
  const P = await import(pathToFileURL(path.join(__dirname, "..", "app", "src", "lib", "planIntent.js")).href);

  // the route carries the plan
  const q = (s) => new URLSearchParams(s);
  assert.strictEqual(P.planFromQuery(q("plan=paid")), "paid");
  assert.strictEqual(P.planFromQuery(q("plan=premium")), "premium");
  assert.strictEqual(P.planFromQuery(q("plan=free")), "free");
  for (const bad of ["", "plan=", "plan=demo", "plan=PAID", "plan=constructor", "tab=x"]) assert.strictEqual(P.planFromQuery(q(bad)), null, bad);
  assert.strictEqual(P.planFromQuery(undefined), null);
  assert.strictEqual(P.planPath("premium"), "account/plans?plan=premium");
  assert.strictEqual(P.planPath(null), "account/plans");

  // remembered, then used exactly once
  let s = box();
  assert.strictEqual(P.pendingPlan(s, T), null);
  P.rememberPlan("paid", {}, s, T);
  assert.strictEqual(P.pendingPlan(s, T + MIN), "paid");
  assert.strictEqual(P.takePlan("premium", "a@x.test", s, T + MIN), false, "another plan does not consume it");
  assert.strictEqual(P.pendingPlan(s, T + MIN), "paid");
  // looking does not consume: the page may reload (state sync, language) before checkout opens, and must still carry on
  assert.strictEqual(P.isPicked("paid", "a@x.test", s, T + MIN), true);
  assert.strictEqual(P.isPicked("premium", "a@x.test", s, T + MIN), false);
  assert.strictEqual(P.pendingPlan(s, T + MIN), "paid");
  assert.strictEqual(P.takePlan("paid", "a@x.test", s, T + MIN), true);
  assert.strictEqual(P.takePlan("paid", "a@x.test", s, T + MIN), false, "a second tab or a reload cannot start checkout again");
  assert.strictEqual(s.size(), 0);

  // only plans that exist are stored
  P.rememberPlan("demo", {}, s, T);
  assert.strictEqual(s.size(), 0);

  // it expires, and damaged storage is ignored
  P.rememberPlan("paid", {}, s, T);
  assert.strictEqual(P.pendingPlan(s, T + P.TTL_MS - 1), "paid");
  assert.strictEqual(P.pendingPlan(s, T + P.TTL_MS + 1), null);
  assert.strictEqual(s.size(), 0, "an expired choice is removed");
  for (const junk of ["{", "null", "5", '{"plan":"demo","at":' + T + "}", '{"plan":"paid"}']) { s.setItem(P.KEY, junk); assert.strictEqual(P.pendingPlan(s, T), null, junk); }
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
  assert.doesNotThrow(() => { P.rememberPlan("paid", {}, broken, T); P.abandonPlan(broken, T); P.awaitEmail("a@x.test", broken, T); });
  assert.strictEqual(P.pendingPlan(broken, T), null);
  assert.strictEqual(P.pendingPlan(null, T), null);

  // closing the sign-up forgets the choice ...
  s = box(); P.rememberPlan("premium", {}, s, T); P.abandonPlan(s, T);
  assert.strictEqual(P.pendingPlan(s, T), null);
  // ... unless an e-mail link is on its way, in which case the choice waits for it, even if the visitor looks at another plan and closes that
  s = box(); P.rememberPlan("premium", {}, s, T); P.awaitEmail(" A@X.test ", s, T + 5 * MIN); P.abandonPlan(s, T + 6 * MIN);
  assert.strictEqual(P.pendingPlan(s, T + 6 * MIN), "premium");
  assert.strictEqual(P.awaitingEmail(s, T + 6 * MIN), "a@x.test");
  P.rememberPlan("paid", {}, s, T + 7 * MIN); P.abandonPlan(s, T + 7 * MIN);
  assert.strictEqual(P.pendingPlan(s, T + 7 * MIN), "paid");
  assert.strictEqual(P.awaitingEmail(s, T + 7 * MIN), "a@x.test");
  assert.strictEqual(P.pendingPlan(s, T + 7 * MIN + P.TTL_MS + 1), null);

  // a different account signing in on this browser is not sent to checkout
  assert.strictEqual(P.isPicked("paid", "someone-else@x.test", s, T + 8 * MIN), false);
  assert.strictEqual(P.takePlan("paid", "someone-else@x.test", s, T + 8 * MIN), false);
  assert.strictEqual(P.pendingPlan(s, T + 8 * MIN), null);
  s = box(); P.rememberPlan("paid", { email: "a@x.test" }, s, T);
  assert.strictEqual(P.takePlan("paid", "A@x.test", s, T), true);

  // what happens next for the account that just signed in (same rules as the buttons on the Plans page)
  const me = (tier, extra) => ({ tier, ...(extra || {}) });
  assert.strictEqual(P.nextStep("paid", me("free")), "checkout");
  assert.strictEqual(P.nextStep("premium", me("free")), "checkout");
  assert.strictEqual(P.nextStep("free", me("free")), "included");
  assert.strictEqual(P.nextStep("free", me("premium")), "included");
  assert.strictEqual(P.nextStep("paid", me("paid", { can_manage_billing: true })), "current");
  assert.strictEqual(P.nextStep("premium", me("premium")), "current");
  assert.strictEqual(P.nextStep("paid", me("premium")), "covered", "Premium already includes Paid");
  assert.strictEqual(P.nextStep("premium", me("paid", { can_manage_billing: true })), "portal", "a subscriber changes plan in the billing portal");
  for (const sub_status of ["past_due", "unpaid", "incomplete"]) assert.strictEqual(P.nextStep("paid", me("free", { sub_status, can_manage_billing: true })), "portal", sub_status);
  assert.strictEqual(P.nextStep("paid", me("free", { sub_status: "canceled", can_manage_billing: true })), "checkout", "a former subscriber can buy again");

  // a checkout started by hand forgets the choice, so coming back from Stripe cannot start it again
  s = box(); P.rememberPlan("paid", {}, s, T); P.awaitEmail("a@x.test", s, T); P.forgetPlan(s);
  assert.strictEqual(P.pendingPlan(s, T), null);

  // the Quick Tour must not navigate away while someone is on the way to a plan
  s = box();
  assert.strictEqual(P.planInProgress("#/portfolio/overview", s, T), false);
  assert.strictEqual(P.planInProgress("#/account/plans", s, T), false);
  assert.strictEqual(P.planInProgress("#/account/plans?plan=paid", s, T), true);
  P.rememberPlan("paid", {}, s, T);
  assert.strictEqual(P.planInProgress("#/portfolio/overview", s, T), true);

  // the tour chunk loads late, often after the choice was already used: what counts is how this page load began
  assert.strictEqual(P.arrivedForPlan, false);
  globalThis.window = { localStorage: box() }; globalThis.location = { hash: "#/account/plans" };
  P.rememberPlan("paid", {}, window.localStorage, Date.now());
  const again = await import(pathToFileURL(path.join(__dirname, "..", "app", "src", "lib", "planIntent.js")).href + "?booted");
  assert.strictEqual(again.arrivedForPlan, true);
  again.forgetPlan();
  assert.strictEqual(again.arrivedForPlan, true, "still true after the choice is used");
  delete globalThis.window; delete globalThis.location;

  console.log("plan intent tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
