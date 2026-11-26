const assert = require("assert");
const A = require("./_fin/agent");
// web search planning and symbol resolution: the regression this guards against is a question that
// names two companies ("apple ... tsmc") resolving only the first, and a search query made of the raw
// sentence ("how much is apples net worth tied to tsmc") returning nothing useful.
const W = require("./_fin/providers/web");

(async () => {
  assert.deepStrictEqual(await A.resolveSymbols("how much is apple's revenue tied to tsmc", null), ["AAPL", "TSM"]);
  assert.deepStrictEqual(await A.resolveSymbols("what percent of tsmc revenue comes from apple", null), ["AAPL", "TSM"]);
  assert.ok(!(await A.resolveSymbols("what is the net worth of apple", null)).includes("NET"), "'net' is a word, not Cloudflare");
  assert.ok((await A.resolveSymbols("nvda", null)).includes("NVDA"));

  assert.strictEqual(A.webQuery("how much is apples net worth tied to tsmc", ["AAPL", "TSM"]), "Apple TSMC revenue share");
  assert.ok(/supplier/.test(A.webQuery("who supplies tsmc with equipment", ["TSM"])));

  // a company question consults the web; a relationship between two companies is searched twice
  const plan = A.heuristicPlan("how much is apples revenue tied to tsmc", ["AAPL", "TSM"]).map((c) => c.tool);
  assert.ok(plan.includes("web_search"), "company questions get web evidence");
  assert.strictEqual(plan.filter((t) => t === "web_search").length, 2, "relationships get a second, fact-shaped query");
  const book = A.heuristicPlan("what is my portfolio allocation", []).map((c) => c.tool);
  assert.ok(!book.includes("web_search"), "the user's own book needs no web search");

  // Brave's results page: title from the title attribute, publisher, date, snippet, no invented URL
  const html = `<div data-type="web"><a href="/go/v1/abc"><div class="site-name-wrapper"><div class="desktop-small-semibold t-secondary text-ellipsis">SemiAnalysis</div><cite class="snippet-url">https://newsletter.semianalysis.com <span> › apple-tsmc: the partn…</span></cite></div><div class="title search-snippet-title" title="Apple-TSMC: The Partnership That Built Modern Semiconductors">Apple-TSMC</div><div class="generic-snippet"><div class="content"><span class="t-secondary">January 9, 2026 -</span> by 2025, Apple alone represents roughly a quarter of revenue.</div></div></a></div>`;
  const rows = W.parseBrave(html, 3);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].title, "Apple-TSMC: The Partnership That Built Modern Semiconductors");
  assert.strictEqual(rows[0].domain, "semianalysis");
  assert.strictEqual(rows[0].url, null, "a truncated cite is not a link");
  assert.ok(/quarter of revenue/.test(rows[0].snippet));
  assert.strictEqual(rows[0].publishedAt.slice(0, 10), "2026-01-09");

  console.log("_finweb.test.js ok");
})().catch((e) => { console.error(e); process.exit(1); });
