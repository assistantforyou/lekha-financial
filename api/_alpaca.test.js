// Run: node api/_alpaca.test.js
// The data-layer quote must not present a stale extended-hours IEX print as the day's price.
const assert = require("assert");
const { pickPrice } = require("./_fin/providers/alpaca");
const bar = { c: 424.4, t: "2026-11-20T05:00:00Z" }, now = Date.parse("2026-11-22T16:29:00Z");
// weekend: the last print (after-hours, 21:56Z) is stale, so the session close is used
let r = pickPrice({ latestTrade: { p: 429.6, t: "2026-11-20T21:56:37Z" }, dailyBar: bar }, now);
assert.deepStrictEqual(r, { px: 424.4, ts: "2026-11-20T05:00:00Z", close: true });
// during the session a fresh print is the price
r = pickPrice({ latestTrade: { p: 426.1, t: "2026-11-20T18:00:00Z" }, dailyBar: bar }, Date.parse("2026-11-20T18:05:00Z"));
assert.deepStrictEqual(r, { px: 426.1, ts: "2026-11-20T18:00:00Z", close: false });
// a bar newer than the last print is the more current figure
r = pickPrice({ latestTrade: { p: 10, t: "2026-11-18T21:00:00Z" }, dailyBar: bar }, now);
assert.strictEqual(r.px, 424.4); assert.strictEqual(r.close, true);
// a bar from an earlier session than a stale print is not used for it
r = pickPrice({ latestTrade: { p: 11, t: "2026-11-21T01:00:00Z" }, dailyBar: { c: 9, t: "2026-11-19T05:00:00Z" } }, now);
assert.strictEqual(r.px, 11); assert.strictEqual(r.close, false);
// no trade at all: the bar is used
r = pickPrice({ dailyBar: bar }, now); assert.strictEqual(r.px, 424.4); assert.strictEqual(r.close, true);
console.log("alpaca tests ok");
