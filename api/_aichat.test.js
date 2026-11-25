// Run: node api/_aichat.test.js
// Chat routing: portfolio questions must not name-search ordinary words into tickers, live data is planned for
// every question, charts come from retrieved data, and model-written chart figures are checked against it.
const assert = require("assert");
const agent = require("./_fin/agent");
const router = require("./_ai/router");
const tools = require("./_ai/tools");
const loop = require("./_ai/loop");

(async () => {
  // The reported bug: "outlook" was name-searched into OTLK, a stock the user does not own.
  const q = "Whats the outlook of my portfolio like";
  assert.deepStrictEqual(await agent.resolveSymbols(q, null, { names: false }), []);
  const p = await router.plan({ question: q, mode: "fast" });
  assert.deepStrictEqual(p.symbols, [], "no symbol may be invented from a portfolio question");
  assert.strictEqual(p.kind, "portfolio");
  assert.ok(p.calls.some((c) => c.tool === "get_market_pulse"), "live market snapshot is planned for portfolio questions");
  // an explicit ticker in a portfolio question still counts
  const p2 = await router.plan({ question: "How is NVDA doing in my portfolio?", mode: "fast" });
  assert.deepStrictEqual(p2.symbols, ["NVDA"]);
  assert.ok(p2.calls.some((c) => c.tool === "get_quote"));
  // the tool exists in the model-facing catalog
  assert.ok(tools.names().includes("get_market_pulse"));

  // Charts from the priced book: unpriced positions are excluded, shares sum to about 100.
  const ctx = { fetchedAt: "2026-11-24T10:00:00Z", rows: [
    { tk: "PLTR", priced: true, valUsd: 2305, costUsd: 2669 }, { tk: "NVDA", priced: true, valUsd: 1700, costUsd: 1200 },
    { tk: "CASH", priced: true, valUsd: 500, costUsd: 500 }, { tk: "LITEB", priced: false, valUsd: 0, costUsd: 2009 } ] };
  const charts = tools.portfolioCharts(ctx);
  assert.strictEqual(charts.length, 2);
  const alloc = charts[0], sum = alloc.items.reduce((a, r) => a + r.pct, 0);
  assert.ok(Math.abs(sum - 100) < 0.3, "allocation shares sum to 100");
  assert.ok(!alloc.items.some((r) => r.label === "LITEB"));
  assert.deepStrictEqual(charts[1].items.map((r) => r.label), ["NVDA", "PLTR"], "return on cost excludes cash and unpriced");
  assert.ok(charts[1].items[1].value < 0);
  assert.deepStrictEqual(tools.portfolioCharts(null), []);

  // Model-written chart figures must exist in the data the model saw.
  const src = "PLTR 34.0% of portfolio; NVDA 25.0% of portfolio";
  const good = "Intro\n```chart\n{\"type\":\"bar\",\"data\":[{\"label\":\"PLTR\",\"value\":34.0},{\"label\":\"NVDA\",\"value\":25}]}\n```";
  const bad = good.replace("34.0", "61.7");
  assert.strictEqual(loop.chartBlocks(good).length, 1);
  assert.deepStrictEqual(loop.unverifiedChartValues(good, src), []);
  assert.deepStrictEqual(loop.unverifiedChartValues(bad, src), [61.7]);
  assert.deepStrictEqual(loop.unverifiedChartValues("no chart here 99", src), []);
  assert.ok(/GitHub-flavoured Markdown/.test(loop.SYSTEM) && /```chart/.test(loop.SYSTEM));
  console.log("aichat ok: portfolio questions invent no ticker, live data planned, charts verified");
})().catch((e) => { console.error(e); process.exit(1); });
