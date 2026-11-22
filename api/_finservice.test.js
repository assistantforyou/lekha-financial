const assert = require("assert");
const svc = require("./_fin/service"), S = require("./_fin/schemas"), news = require("./_fin/providers/news"), sec = require("./_fin/providers/sec");
// schema: units and derived fields
const q = S.quote({ symbol: "nvda", price: "110", previousClose: 100, source: "t", timestamp: "2026-01-02T15:00:00Z" });
assert.strictEqual(q.symbol, "NVDA"); assert.ok(Math.abs(q.changePercent - 0.1) < 1e-9); assert.ok(Math.abs(q.change - 10) < 1e-9); assert.strictEqual(q.meta.unit, "USD/share");
const st = S.statement({ symbol: "x", period: "2025-12-31", revenue: 100, costOfRevenue: 60, operatingCashFlow: 30, capex: -10, source: "t" });
assert.strictEqual(st.grossProfit, 40); assert.strictEqual(st.freeCashFlow, 20); assert.strictEqual(st.meta.kind, "reported"); assert.strictEqual(st.unit, "USD");
// dedupe: same headline across providers and same URL with tracking differences
const a = S.newsItem({ id: "1", headline: "Nvidia shares fall as chip stocks slide", publishedAt: "2026-01-01T10:00:00Z", url: "https://x.com/a", source: "Finnhub" });
const b = S.newsItem({ id: "2", headline: "Nvidia shares fall, as chip stocks slide!", publishedAt: "2026-01-01T10:05:00Z", url: "https://y.com/b", source: "RSS" });
const c = S.newsItem({ id: "3", headline: "Other story", publishedAt: "2026-01-01T09:00:00Z", url: "https://www.x.com/a/", source: "RSS" });
const d = svc.dedupe([a, b, c]); assert.strictEqual(d.length, 1, "same headline + same url collapse"); assert.ok(d[0].alsoReportedBy.length >= 1);
// news categoriser
assert.strictEqual(news.categorize("Company to acquire rival in $5B deal"), "m&a"); assert.strictEqual(news.categorize("Fed holds rates as inflation cools"), "macro"); assert.strictEqual(news.categorize("Quarterly results beat, EPS up"), "earnings");
// XBRL statements: annual vs quarterly selection, restatement (latest filed wins), unit-safe capex
const f = { entityName: "T", cik: 1, facts: { "us-gaap": {
  Revenues: { units: { USD: [{ start: "2024-01-01", end: "2024-12-31", val: 100, form: "10-K", filed: "2025-02-01", fy: 2024, fp: "FY", accn: "a1" }, { start: "2024-01-01", end: "2024-12-31", val: 105, form: "10-K/A", filed: "2025-04-01", fy: 2024, fp: "FY", accn: "a2" }, { start: "2024-01-01", end: "2024-03-31", val: 20, form: "10-Q", filed: "2024-05-01", fy: 2024, fp: "Q1", accn: "q1" }] } },
  PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [{ start: "2024-01-01", end: "2024-12-31", val: 7, form: "10-K", filed: "2025-02-01", fy: 2024, fp: "FY", accn: "a1" }] } },
  NetCashProvidedByUsedInOperatingActivities: { units: { USD: [{ start: "2024-01-01", end: "2024-12-31", val: 30, form: "10-K", filed: "2025-02-01", fy: 2024, fp: "FY", accn: "a1" }] } },
  EarningsPerShareDiluted: { units: { "USD/shares": [{ start: "2024-01-01", end: "2024-12-31", val: 2.5, form: "10-K", filed: "2025-02-01", fy: 2024, fp: "FY", accn: "a1" }] } },
  LongTermDebtNoncurrent: { units: { USD: [{ end: "2024-12-31", val: 50, form: "10-K", filed: "2025-02-01", fy: 2024, fp: "FY", accn: "a1" }] } },
} } };
const ann = sec.buildStatements(f, "T", "annual"); assert.strictEqual(ann.length, 1); assert.strictEqual(ann[0].revenue, 105, "amendment (later filed) wins");
assert.strictEqual(ann[0].freeCashFlow, 23); assert.strictEqual(ann[0].eps, 2.5); assert.strictEqual(ann[0].totalDebt, 50); assert.strictEqual(ann[0].accession, "a2");
const qq = sec.buildStatements(f, "T", "quarterly"); assert.strictEqual(qq.length, 1); assert.strictEqual(qq[0].revenue, 20); assert.strictEqual(qq[0].periodType, "quarterly");
// fiscal labels come from the ORIGINAL filing, not a later filing that repeats the period as a comparative
const g = { entityName: "T", cik: 2, facts: { "us-gaap": { Revenues: { units: { USD: [
  { start: "2025-04-01", end: "2025-06-30", val: 10, form: "10-Q", filed: "2025-08-01", fy: 2025, fp: "Q2", accn: "x1" },
  { start: "2025-04-01", end: "2025-06-30", val: 11, form: "10-Q", filed: "2026-08-01", fy: 2026, fp: "Q2", accn: "x2" },
  { start: "2026-04-01", end: "2026-06-30", val: 15, form: "10-Q", filed: "2026-08-01", fy: 2026, fp: "Q2", accn: "x2" }] } } } } };
const gq = sec.buildStatements(g, "T", "quarterly").sort((p, q) => p.period < q.period ? -1 : 1);
assert.strictEqual(gq.length, 2); assert.strictEqual(gq[0].fiscalYear, 2025, "comparative keeps its own fiscal year"); assert.strictEqual(gq[1].fiscalYear, 2026);
assert.strictEqual(gq[0].revenue, 11, "restated value still wins");
// filers that switch revenue concepts keep every year (NVDA moved from RevenueFromContract... to Revenues after FY2022);
// the higher-priority concept wins a period both report, and labels still come from the earliest filing
const sw = { entityName: "S", cik: 3, facts: { "us-gaap": {
  RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
    { start: "2021-02-01", end: "2022-01-30", val: 269, form: "10-K", filed: "2022-03-18", fy: 2022, fp: "FY", accn: "a1" }] } },
  Revenues: { units: { USD: [
    { start: "2021-02-01", end: "2022-01-30", val: 999, form: "10-K", filed: "2024-02-21", fy: 2024, fp: "FY", accn: "a3" },
    { start: "2025-01-27", end: "2026-01-25", val: 2159, form: "10-K", filed: "2026-02-25", fy: 2026, fp: "FY", accn: "a5" }] } } } } };
const swa = sec.buildStatements(sw, "S", "annual");
assert.deepStrictEqual(swa.map((r) => r.period), ["2026-01-25", "2022-01-30"], "the later concept's years are not dropped");
assert.strictEqual(swa[0].revenue, 2159); assert.strictEqual(swa[0].fiscalYear, 2026);
assert.strictEqual(swa[1].revenue, 269, "the first concept in the list wins a period both report");
assert.strictEqual(swa[1].fiscalYear, 2022);
// chain: skips unconfigured, falls back on error, reports attempts
(async () => {
  const r = await svc.chain("x", [[{ name: "a", configured: () => false }, async () => 1], [{ name: "b", configured: () => true }, async () => { throw new Error("boom"); }], [{ name: "c", configured: () => true }, async () => 42]]);
  assert.strictEqual(r.data, 42); assert.strictEqual(r.source, "c"); assert.deepStrictEqual(r.attempts.map((x) => x.status), ["skipped", "error", "ok"]);
  await assert.rejects(() => svc.chain("y", [[{ name: "a", configured: () => true }, async () => null]]), /no_provider_for_y/);
  assert.throws(() => svc.sym("bad symbol!"), /bad_symbol/);
  
// news text: typographic/numeric/double-encoded entities, embedded markup and teaser labels are cleaned
{ const { decode } = require("./_fin/providers/news");
  assert.strictEqual(decode("Key Points A manager couldn&rsquo;t beat the S&amp;P 500"), "A manager couldn\u2019t beat the S&P 500");
  assert.strictEqual(decode("Fed &amp;amp; markets &#8212; what&#x27;s next"), "Fed & markets \u2014 what's next");
  assert.strictEqual(decode("&lt;p&gt;Stocks &lt;b&gt;fall&lt;/b&gt;&lt;/p&gt;"), "Stocks fall");
  assert.strictEqual(decode("<![CDATA[Oil &amp; gas]]>"), "Oil & gas");
  assert.strictEqual(decode("Key Points of the plan"), "Key Points of the plan", "only a label, not a sentence, is removed"); }

// a very large feed is capped so it cannot drown the others
{ const N = require("./_fin/providers/news"); const xml = "<rss>" + Array.from({ length: 300 }, (_, i) => `<item><title>Story ${i}</title><link>https://example.com/${i}</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate><description>d</description></item>`).join("") + "</rss>";
  assert.strictEqual(N.parse(xml, "Big Feed", [], "market").length, 20); assert.ok(N.FEEDS.length >= 25 && new Set(N.FEEDS.map((f) => f.name)).size === N.FEEDS.length, "outlet names are unique"); }
console.log("_finservice.test.js ok");
})();
const original = sec.buildStatements(f, "T", "annual", "2025-03-01")[0];
assert.equal(original.revenue, 100);
assert.equal(original.filingDate, "2025-02-01");
assert.equal(sec.buildStatements(f, "T", "annual", "2025-01-01").length, 0);
assert.equal(S.quote({price:20,currency:"THB"}).meta.unit, "THB/share");
assert.equal(S.statement({currency:"HKD"}).meta.unit, "HKD");
assert.equal(S.quote({timestamp:null}).timestamp, null);
