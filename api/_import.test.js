// Run: node api/_import.test.js
const assert = require("assert");
const { checkUpload, normalizeResult, maskDigits, RESPONSE_SCHEMA } = require("./_import");

assert.ok(checkUpload({ mime: "application/x-msdownload", size: 10 }));
assert.ok(checkUpload({ mime: "application/pdf", size: 0 }));
assert.ok(checkUpload({ mime: "application/pdf", size: 5 * 1024 * 1024 }));
assert.strictEqual(checkUpload({ mime: "application/pdf", size: 1000 }), null);

const r = normalizeResult({
  account: "Broker A  ", as_of: "2026-11-13", reported_total_value: 1750, total_currency: "USD",
  positions: [
    { kind: "security", ticker: " nvda ", quantity: 10, total_cost: 1000, price: 150, currency: "usd", evidence: "NVDA 10 sh" },
    { kind: "security", ticker: "NVDA", quantity: 5, price: 150, currency: "USD" },         // duplicate -> combined
    { kind: "security", ticker: "'; DROP TABLE--", quantity: 1, currency: "USD" },          // sanitised to a symbol-safe string
    { kind: "security", ticker: "", name: "Some Fund", quantity: 3 },                       // no ticker -> warning
    { kind: "security", ticker: "BAD", quantity: -4 },                                      // invalid quantity
    { kind: "security", ticker: "TOYOTA", quantity: 2, currency: "JPY", price: 10 },       // unsupported currency
    { kind: "cash", quantity: 250, currency: "USD" },
  ],
  warnings: ["Page 2 is blurry"],
});
assert.strictEqual(r.account, "Broker A");
const nv = r.positions.find((p) => p.tk === "NVDA");
assert.strictEqual(nv.qty, 15); assert.strictEqual(nv.cost, 1000); assert.strictEqual(nv.cur, "USD");
assert.ok(r.positions.some((p) => /^[A-Z0-9.\-:]+$/.test(p.tk) && p.tk.startsWith("DROPTABLE")));
assert.ok(r.positions.every((p) => /^[A-Z0-9.\-:]{1,16}$/.test(p.tk)));
assert.strictEqual(r.cash.length, 1); assert.strictEqual(r.cash[0].qty, 250);
assert.ok(r.warnings.some((w) => w.includes("no ticker")));
assert.ok(r.warnings.some((w) => w.includes("JPY")));
assert.ok(r.warnings.some((w) => w.includes("blurry")));
// 15*150 + 1*? (no price) -> incomplete cross-check warning rather than a false mismatch
assert.ok(r.warnings.some((w) => w.includes("cross-checked")));

const exact = normalizeResult({ reported_total_value: 2500, total_currency: "USD", positions: [{ kind: "security", ticker: "SPY", quantity: 10, price: 225, currency: "USD" }, { kind: "cash", quantity: 250, currency: "USD" }] });
assert.ok(!exact.warnings.length);
const off = normalizeResult({ reported_total_value: 5000, total_currency: "USD", positions: [{ kind: "security", ticker: "SPY", quantity: 10, price: 225, currency: "USD" }, { kind: "cash", quantity: 250, currency: "USD" }] });
assert.ok(off.warnings.some((w) => w.includes("add up to")));
assert.ok(normalizeResult({ positions: [] }).warnings.some((w) => w.includes("No holdings")));
assert.ok(normalizeResult(null).warnings.length >= 1);
assert.strictEqual(maskDigits("acct 123456789012 qty 100"), "acct ********9012 qty 100");
assert.ok(RESPONSE_SCHEMA.properties.positions.items.required.includes("quantity"));
console.log("import ok");
assert.strictEqual(normalizeResult({ account: "Demo Account 123456789012", positions: [] }).account, "Demo Account ********9012");
console.log("account mask ok");
