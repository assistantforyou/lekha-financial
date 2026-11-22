// Verify the financial facts actually included in the prompts sent to both providers.
const assert = require("node:assert/strict");
const { portfolioBlock, userContext } = require("./_h/ai/_ctx");
const rows = [
  {tk:"A", cur:"USD", px:80, base:100, valUsd:80, costUsd:null, weightPct:100},
  {tk:"B", cur:"THB", priced:false, costUsd:40, valUsd:0}
];
const block = portfolioBlock({rows,total:80,invested:80,cash:0});
assert.match(block, /margin of safety 20%/);
assert.match(block, /Priced subtotal/);
assert.match(block, /100% of priced holdings and cash/);
assert.match(block, /cost basis unknown/);
assert.doesNotMatch(block, /Total portfolio value/);
(async () => {
const demo = await userContext("demo");
assert.match(portfolioBlock(demo), /Simulated sample prices/);
assert.equal(demo.rows.find(r=>r.tk==="PTT.BK").valUsd,200);
assert.equal(demo.rows.find(r=>r.tk==="0700.HK").valUsd,5320.3);
})().catch(e => {console.error(e);process.exitCode=1;});
