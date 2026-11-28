// Run: node api/_billingreturn.test.js
// Back from Stripe: the buyer is told the plan is active, and the purchase is reported, whether the webhook lands
// after the page has loaded or before it.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const { billingStep } = await import(pathToFileURL(path.join(__dirname, "..", "app", "src", "lib", "billingReturn.js")).href);
  const step = (result, tier, firstTier, unlocked = false, before) => billingStep({ result, tier, firstTier, unlocked, before });

  // the webhook landed before the first plan read: still an activation, and nothing needs reloading
  for (const tier of ["paid", "premium"]) assert.deepStrictEqual(step("success", tier, undefined), { activated: true, reload: false }, tier);
  // later polls of the same plan must not lose it either
  assert.deepStrictEqual(step("success", "paid", "paid"), { activated: true, reload: false });
  // the webhook has not landed yet: keep polling
  assert.strictEqual(step("success", "free", undefined), null);
  assert.strictEqual(step("success", "free", "free"), null);
  // it lands during polling: activation, and the page reloads onto the verified plan
  assert.deepStrictEqual(step("success", "paid", "free"), { activated: true, reload: true });
  // no verified plan yet, or no session: nothing to say
  assert.strictEqual(step("success", null, undefined), null);
  assert.strictEqual(step("success", "demo", undefined), null);

  // visiting the billing portal is not a purchase
  assert.strictEqual(step("portal", "paid", undefined), null);
  assert.strictEqual(step("portal", "paid", "paid"), null);
  assert.deepStrictEqual(step("portal", "premium", "paid"), { activated: true, reload: true });
  assert.deepStrictEqual(step("portal", "free", "paid"), { activated: false, reload: true });
  // already on an unlocked screen: confirm the plan, report nothing
  assert.deepStrictEqual(step("portal", "paid", undefined, true), { activated: false, reload: false });
  // a downgrade seen while polling is announced but is not a purchase
  assert.deepStrictEqual(step("portal", "paid", "premium"), { activated: false, reload: true });
  // the portal change landed before the page loaded: compare with the plan this tab showed before leaving
  assert.deepStrictEqual(step("portal", "premium", undefined, false, "paid"), { activated: true, reload: false });
  assert.deepStrictEqual(step("portal", "paid", undefined, false, "premium"), { activated: false, reload: false });
  assert.strictEqual(step("portal", "paid", undefined, false, "paid"), null);
  assert.strictEqual(step("portal", "paid", undefined, false, null), null);
  // the remembered plan never turns a checkout that is still unpaid into a result
  assert.strictEqual(step("success", "free", undefined, false, "premium"), null);
  console.log("billing return tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
