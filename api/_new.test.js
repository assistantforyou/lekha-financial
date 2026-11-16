// Run: node api/_new.test.js  (insiders, estimates, Stripe signature, FX/ATH helpers; no network)
const assert = require("assert");
const crypto = require("crypto");
const Module = require("module"); const orig = Module._load;
Module._load = function (r) { if (r === "./_lib") return { sb: async () => ({ ok: true }), cacheGetMany: async () => ({}), cacheSet: async () => {}, cached: async (k, t, b) => b(), av: async () => ({}) }; return orig.apply(this, arguments); };
const I = require("./_insiders");
const E = require("./_estimates");
const { verifySignature, form } = require("./_stripe");
const { athOf, isIntl } = require("./_intl");

// --- Form 4 parsing: only open-market purchases (P + A)
const xml = `<SEC-DOCUMENT><ownershipDocument><issuer><issuerCik>0001086222</issuerCik></issuer><reportingOwner><reportingOwnerId><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-11-10</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>50.5</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionDate><value>2026-11-10</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>99</value></transactionShares><transactionPricePerShare><value>50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument></SEC-DOCUMENT>`;
const f = I.parseForm4(xml);
assert.strictEqual(f.issuer, 1086222); assert.strictEqual(f.buys.length, 1); assert.strictEqual(f.buys[0].value, 50500); assert.strictEqual(f.buys[0].owner, "DOE JANE");
assert.deepStrictEqual(I.parseForm4("garbage"), { issuer: null, buys: [] });

// --- clusters: 2+ distinct insiders within 7 days
const cl = I.clusters([
  { t: "AKAM", owner: "A", trade: "2026-11-01", filing: "2026-11-03", value: 100 },
  { t: "AKAM", owner: "B", trade: "2026-11-05", filing: "2026-11-06", value: 200 },
  { t: "AKAM", owner: "A", trade: "2026-11-30", filing: "2026-12-01", value: 999 },
  { t: "CAT", owner: "X", trade: "2026-11-01", filing: "2026-11-02", value: 5 },
  { t: "CAT", owner: "X", trade: "2026-11-02", filing: "2026-11-03", value: 5 },
]);
assert.strictEqual(cl.length, 1); assert.strictEqual(cl[0].ticker, "AKAM"); assert.strictEqual(cl[0].ins, 2); assert.strictEqual(cl[0].value, 300);
assert.strictEqual(cl[0].sec, "XLK");
const idx = "4                AKAMAI TECHNOLOGIES INC                                       1086222     20261113    edgar/data/1086222/0001-26-1.txt\n4                Someone Else                                                  9999999     20261113    edgar/data/9999999/0001-26-2.txt\n4/A              AKAMAI TECHNOLOGIES INC                                       1086222     20261113    edgar/data/1086222/0001-26-3.txt";
assert.deepStrictEqual(I.parseIndex(idx).map((x) => x.ticker), ["AKAM"]);

// --- estimates -> revision item + consensus fc
const est = [
  { date: "2026-01-31", horizon: "fiscal year", eps_estimate_average: "1" },
  { date: "2027-01-31", horizon: "fiscal year", eps_estimate_average: "9.3", eps_estimate_average_7_days_ago: "9.2", eps_estimate_average_30_days_ago: "9.0", eps_estimate_average_60_days_ago: "8.8", eps_estimate_average_90_days_ago: "8.5", eps_estimate_revision_up_trailing_30_days: "4", eps_estimate_revision_down_trailing_30_days: "1", revenue_estimate_average: "400000000000", revenue_estimate_low: "380000000000", revenue_estimate_high: "420000000000", revenue_estimate_analyst_count: "50" },
  { date: "2028-01-31", horizon: "fiscal year", eps_estimate_average: "15", eps_estimate_average_30_days_ago: "14", revenue_estimate_average: "600000000000" },
  { date: "2026-12-31", horizon: "fiscal quarter", eps_estimate_average: "2" },
];
const it = E.revItem(est, "2026-11-16");
assert.deepStrictEqual(it.eps.cy, [9.3, 9.2, 9.0, 8.8, 8.5]); assert.strictEqual(it.eps.ny[0], 15);
assert.deepStrictEqual(it.up30, [0, 0, 4, 0]); assert.strictEqual(it.periods.cy, "2027-01-31");
const fc = E.consensusFc(est, { AnalystTargetPrice: "250.5" }, "2026-11-16");
assert.strictEqual(fc.fy, "FY2027"); assert.deepStrictEqual(fc.rev, [380000, 400000, 420000]); assert.strictEqual(fc.eps[1], 9.3); assert.strictEqual(fc.pt, 250.5); assert.strictEqual(fc.basis, "consensus");
assert.strictEqual(E.revItem([], "2026-11-16"), null);
assert.strictEqual(E.revDoc({ NVDA: { est } }, "2026-11-16").data.items.NVDA.periods.ny, "2028-01-31");

// --- Stripe webhook signature
const secret = "whsec_test", body = '{"id":"evt_1"}', t = 1794800000;
const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
assert.ok(verifySignature(body, `t=${t},v1=${sig}`, secret, 300, t * 1000));
assert.ok(!verifySignature(body + " ", `t=${t},v1=${sig}`, secret, 300, t * 1000));
assert.ok(!verifySignature(body, `t=${t},v1=${sig}`, secret, 300, (t + 1000) * 1000)); // replay window
assert.ok(!verifySignature(body, `t=${t},v1=${sig}`, "other", 300, t * 1000));
assert.strictEqual(form({ line_items: { 0: { price: "p", quantity: 1 } }, mode: "subscription" }), "line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1&mode=subscription");

// --- ATH / intl helpers
assert.deepStrictEqual(athOf([["2020-01-01", 5], ["2021-01-01", 9], ["2022-01-01", 7]]), { v: 9, d: "2021-01-01", from: "2020-01-01" });
assert.ok(isIntl("0700.HK") && isIntl("PTT.BK") && !isIntl("BRK.B") && !isIntl("NVDA"));
console.log("new modules ok");
