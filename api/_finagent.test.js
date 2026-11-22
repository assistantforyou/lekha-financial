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
// headline guard: the model once called AAPL "below its DCF value with a large margin of safety" while the DCF said price 343 vs intrinsic 193 (margin of safety -78%)
const dcfEv = [{ id: "E6", label: "DCF AAPL", lines: ["DCF intrinsic value per share 192.79 vs price 343.4; margin of safety -78.13% (price is ABOVE the DCF value)"] }], dcfById = { E6: dcfEv[0] };
const bad = A.guardSummary("AAPL is trading significantly below its DCF intrinsic value, a large margin of safety.", dcfEv, dcfById);
assert.strictEqual(bad.note, "contradicted_dcf"); assert.ok(/above intrinsic value/.test(bad.text) && /overvalued/.test(bad.text));
const good = A.guardSummary("By the DCF the stock looks overvalued: price 343.4 against 192.79.", dcfEv, dcfById); assert.strictEqual(good.note, null);
const inv = A.guardSummary("AAPL trades at a P/E of 41.2x.", dcfEv, dcfById); assert.ok(/^unverified_numbers/.test(inv.note), "invented figures are flagged");
// portfolio documents never show a missing price as $0
const rag = require("./_fin/rag"), doc = rag.docText("holdings/all", { items: [{ tk: "NVDA", qty: 60, cost: 3994.2 }, { tk: "CASH", qty: 12000, cost: 12000, theme: "Cash" }] });
assert.ok(/NVDA.*price not stored/.test(doc) && !/last price \$0\b/.test(doc) && !/-100\.00%/.test(doc) && /CASH.*value \$12,000/.test(doc));
assert.strictEqual(A.staleZero("NVDA (Semis, USD): 60 units at cost $3,994.2, last price $0, value $0, unrealized P&L -100.00%, account Demo."), "NVDA (Semis, USD): 60 units at cost $3,994.2, price not stored, account Demo.");
console.log("_finagent.test.js ok");

assert.deepEqual(A.checkNumbers({text:"Price is 18450 USD", evidence:["E1"]}, byId), [18450]);
assert.deepEqual(A.checkNumbers({text:"Price rose 3.25%", evidence:["E1"]}, byId), [3.25]);
assert.deepEqual(A.checkNumbers({text:"Revenue was 130.5 million", evidence:["E2"]}, byId), [130.5]);
