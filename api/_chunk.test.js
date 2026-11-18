// Unlimited valuation coverage: server per-request caps + client batching/merging helpers.
const assert = require("assert");
const { LIMITS } = require("./_tiers");
const { capOf, BATCH, symbolsOf } = require("./_valuation");
const { cleanSymbols, MAX_SYMBOLS } = require("./_history");
const C = require("../public/pt-chunk.js");

// server: every request is capped at BATCH; plans decide how many symbols they may value in total
assert.strictEqual(BATCH, 25);
assert.strictEqual(capOf(undefined), 12);              // handler passed no limit -> free default
assert.strictEqual(capOf(LIMITS.free.valSymbols), 12);
assert.strictEqual(capOf(LIMITS.demo.valSymbols), 14);
assert.strictEqual(capOf(LIMITS.paid.valSymbols), 25);     // null (unlimited) -> one batch per request
assert.strictEqual(capOf(LIMITS.premium.valSymbols), 25);
assert.strictEqual(capOf(100), 25);                    // a numeric limit can never exceed one batch

const tickers = Array.from({ length: 60 }, (_, i) => "T" + i);
const post = (symbols) => ({ method: "POST", body: { symbols } });
assert.strictEqual(symbolsOf(post(tickers), LIMITS.free.valSymbols).length, 12);
assert.strictEqual(symbolsOf(post(tickers), LIMITS.premium.valSymbols).length, 25);
assert.strictEqual(symbolsOf(post(tickers.slice(0, 7)), null).length, 7);
assert.strictEqual(cleanSymbols(tickers).length, MAX_SYMBOLS);
assert.strictEqual(cleanSymbols(tickers, 5).length, 5);
assert.strictEqual(cleanSymbols(tickers, 999).length, MAX_SYMBOLS); // cap can't exceed the ceiling
assert.deepStrictEqual(cleanSymbols(["a", "A", "cash", "b"], 5), ["A", "B"]);

// client: 60 holdings -> 3 batches (25 + 25 + 10); free plan would stop at 12
const batches = C.chunk(tickers, 25);
assert.deepStrictEqual(batches.map((b) => b.length), [25, 25, 10]);
assert.deepStrictEqual(C.chunk([], 25), []);

// merge collection docs (dedupe by id, skip failed batches)
const merged = C.mergeDocs([[{ id: "A", data: {} }, { id: "B", data: {} }], null, [{ id: "B", data: {} }, { id: "C", data: {} }]]);
assert.deepStrictEqual(merged.map((d) => d.id), ["A", "B", "C"]);

// merge VALIN CSVs: one header, all rows, first UPDATED stamp last
const head = "Ticker,Price,MarketCap,Shares,Beta,PE,EPS,Currency,Type";
const a = [head, "AAA,1,,,,,,USD,stock", "BBB,2,,,,,,USD,fund", "UPDATED,2026-11-18 00:00 UTC"].join("\n") + "\n";
const b = [head, "CCC,3,,,,,,USD,stock", "UPDATED,2026-11-18 00:01 UTC"].join("\n") + "\n";
const m = C.mergeValin([a, null, b]).trim().split("\n");
assert.deepStrictEqual(m, [head, "AAA,1,,,,,,USD,stock", "BBB,2,,,,,,USD,fund", "CCC,3,,,,,,USD,stock", "UPDATED,2026-11-18 00:00 UTC"]);
assert.strictEqual(C.mergeValin([null, ""]), null);

// pool keeps input order, caps concurrency, isolates failures
(async () => {
  let live = 0, peak = 0;
  const jobs = [1, 2, 3, 4, 5].map((n) => async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; if (n === 3) throw new Error("x"); return n; });
  const seen = [];
  const out = await C.pool(jobs, 2, (d, t) => seen.push(d + "/" + t));
  assert.ok(peak <= 2);
  assert.deepStrictEqual(out.map((x) => (x && x.error ? "err" : x)), [1, 2, "err", 4, 5]);
  assert.strictEqual(seen[seen.length - 1], "5/5");
  console.log("chunk ok");
})();
