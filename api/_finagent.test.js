const assert = require("assert"); const A = require("./_fin/agent");
// number verification: figures must appear in the cited evidence (allowing %, B/M scaling), otherwise the claim is downgraded
const byId = { E1: { lines: ["NVDA last price 184.5 USD; change -6.2 (-3.25%) vs previous close 190.7"] }, E2: { lines: ["revenue 130.5B (USD)"] } };
assert.deepStrictEqual(A.checkNumbers({ text: "NVDA fell 3.25% to $184.50", evidence: ["E1"] }, byId), []);
assert.deepStrictEqual(A.checkNumbers({ text: "Revenue was $130.5 billion", evidence: ["E2"] }, byId), []);
assert.deepStrictEqual(A.checkNumbers({ text: "NVDA fell 9% today", evidence: ["E1"] }, byId), [9]);
assert.deepStrictEqual(A.checkNumbers({ text: "In 2025 it dropped", evidence: ["E1"] }, byId), [], "calendar years are not figures");
// heuristic planner picks the right tools without an LLM
const names = (q, s) => A.heuristicPlan(q, s).map((c) => c.tool);
assert.ok(names("Why did NVDA fall today?", ["NVDA"]).includes("get_news")); assert.ok(names("Why did NVDA fall today?", ["NVDA"]).includes("get_sector_market_context"));
assert.ok(names("Is AAPL overvalued?", ["AAPL"]).includes("calculate_valuation")); assert.ok(names("What did the Fed do to inflation?", []).includes("get_macro_data"));
assert.ok(names("show me AAPL 10-K filing", ["AAPL"]).includes("get_sec_filings"));
assert.ok(Object.keys(A.TOOLS).length >= 13);
console.log("_finagent.test.js ok");

assert.deepEqual(A.checkNumbers({text:"Price is 18450 USD", evidence:["E1"]}, byId), [18450]);
assert.deepEqual(A.checkNumbers({text:"Price rose 3.25%", evidence:["E1"]}, byId), [3.25]);
assert.deepEqual(A.checkNumbers({text:"Revenue was 130.5 million", evidence:["E2"]}, byId), [130.5]);
