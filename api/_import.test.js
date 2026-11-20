// Run: node api/_import.test.js
const assert = require("assert");
const { checkUpload, normalizeResult, crossCheck, fillQuantities, isSparse, maskDigits, RESPONSE_SCHEMA } = require("./_import");

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
// quantity may be null (Dime US stocks show only a value) but the field must be present, or lazy models return bare tickers
const req = RESPONSE_SCHEMA.properties.positions.items.required;
for (const f of ["quantity", "market_value", "price", "avg_cost", "unrealized_pl", "evidence"]) assert.ok(req.includes(f), f);
assert.strictEqual(RESPONSE_SCHEMA.properties.positions.items.properties.quantity.nullable, true);
assert.ok(isSparse({ positions: [{ kind: "security", ticker: "PG" }, { kind: "security", ticker: "AAPL" }] }), "bare tickers are a failed reading");
assert.ok(!isSparse({ positions: [{ kind: "security", ticker: "HACK", market_value: 481.27 }, { kind: "security", ticker: "X", quantity: 2 }] }));
console.log("import ok");
assert.strictEqual(normalizeResult({ account: "Demo Account 123456789012", positions: [] }).account, "Demo Account ********9012");
console.log("account mask ok");

// line arithmetic: a misread digit shows as qty x price != printed market value
const bad = normalizeResult({ positions: [{ kind: "security", ticker: "AAPL", quantity: 10, price: 200, market_value: 2800, currency: "USD", evidence: "AAPL 10" }, { kind: "security", ticker: "MSFT", quantity: 5, price: 400, market_value: 2000, currency: "USD" }] });
assert.ok(bad.positions.find((p) => p.tk === "AAPL").flags.some((f) => f.includes("line shows 2800")));
assert.deepStrictEqual(bad.positions.find((p) => p.tk === "MSFT").flags, ["no source quote"]);
// totals use printed line values when prices are missing, and unresolved lines count towards the total
const mv = normalizeResult({ reported_total_value: 3000, total_currency: "USD", positions: [{ kind: "security", ticker: "FUND1", quantity: 100, market_value: 2000, currency: "USD", evidence: "x" }, { kind: "security", ticker: "", name: "Thai Fund", quantity: 50, market_value: 1000, currency: "USD", evidence: "y" }] });
assert.ok(!mv.warnings.some((w) => w.includes("add up to")), mv.warnings.join("|"));
assert.strictEqual(mv.unresolved.length, 1);
assert.ok(mv.warnings.some((w) => w.includes("Thai Fund") && w.includes("quantity 50")), "unresolved line is reported with its numbers, not silently dropped");
// cross-check: union, never drop
const A = normalizeResult({ positions: [{ kind: "security", ticker: "X", quantity: 10, price: 5, currency: "USD", evidence: "x" }, { kind: "cash", quantity: 100, currency: "USD" }] });
const B = normalizeResult({ positions: [{ kind: "security", ticker: "X", quantity: 10, price: 5.2, currency: "USD", evidence: "x" }, { kind: "security", ticker: "Y", quantity: 2, currency: "USD", evidence: "y" }, { kind: "cash", quantity: 90, currency: "USD" }] });
crossCheck(A, B);
assert.ok(A.positions.find((p) => p.tk === "X").flags.some((f) => f.includes("price")));
assert.ok(A.positions.some((p) => p.tk === "Y"));
assert.ok(A.warnings.some((w) => w.includes("Cash in USD")));
console.log("verification checks ok");

// ---- the user's real screenshots ----
// Webull-style: value + qty stacked, last price + avg cost stacked; cost must come from qty x avg, partial/logo rows never become holdings
const webull = normalizeResult({ account: "Individual Cash", reported_count: 10, positions: [
  { kind: "security", ticker: "PG", quantity: 5.66822, market_value: 966.77, price: 170.56, avg_cost: 148.37, unrealized_pl: 125.77, currency: "USD", evidence: "PG 966.77 5.66822" },
  { kind: "security", ticker: "AAPL", quantity: 0.30858, market_value: 108.93, price: 352.99, avg_cost: 226.84, currency: "USD", evidence: "AAPL 108.93 DRIP 0.30858" },
] });
assert.strictEqual(webull.reportedCount, 10);
const pg = webull.positions.find((p) => p.tk === "PG");
assert.strictEqual(pg.cost, Math.round(5.66822 * 148.37 * 100) / 100); assert.deepStrictEqual(pg.flags, []);
// Dime US stocks: value + P/L amount only. cost = value - P/L; share count is filled from a live price and flagged
const dime = normalizeResult({ account: "Dime", reported_count: 10, positions: [
  { kind: "security", ticker: "HACK", market_value: 481.27, unrealized_pl: 142.49, currency: "USD", evidence: "HACK 481.27 +142.49 USD" },
  { kind: "security", ticker: "AVAV", market_value: 183.49, unrealized_pl: -183.92, currency: "USD", evidence: "AVAV 183.49" },
] });
const hk = dime.positions.find((p) => p.tk === "HACK");
assert.strictEqual(hk.qty, null); assert.strictEqual(hk.cost, 338.78);
assert.ok(!dime.warnings.some((w) => w.includes("skipped")), "value-only lines are no longer skipped");
(async () => {
  await fillQuantities(dime, async () => ({ data: { HACK: { price: 60, currency: "USD" }, AVAV: { price: 0 } } }));
  assert.strictEqual(dime.positions.find((p) => p.tk === "HACK").qty, Math.round((481.27 / 60) * 1e5) / 1e5);
  assert.ok(dime.positions.find((p) => p.tk === "HACK").flags.some((f) => f.includes("ESTIMATED")));
  const av = dime.positions.find((p) => p.tk === "AVAV");
  assert.strictEqual(av.qty, null); assert.ok(dime.warnings.some((w) => w.includes("AVAV") && w.includes("enter the share count")));
  console.log("real-screenshot cases ok");
})();
// Dime Thai stock: THB, qty + cost per share printed; saved with the .BK exchange suffix
const thai = normalizeResult({ account: "Dime", positions: [{ kind: "security", ticker: "TRUE", quantity: 800, price: 12.85, avg_cost: 11.2, market_value: 10280, unrealized_pl: 1320, currency: "THB", evidence: "Outstanding Shares 800" }] });
assert.strictEqual(thai.positions[0].tk, "TRUE.BK"); assert.strictEqual(thai.positions[0].cost, 8960);
assert.ok(thai.positions[0].flags.some((f) => f.includes(".BK")));
