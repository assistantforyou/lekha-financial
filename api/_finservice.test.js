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
// chain: skips unconfigured, falls back on error, reports attempts
(async () => {
  const r = await svc.chain("x", [[{ name: "a", configured: () => false }, async () => 1], [{ name: "b", configured: () => true }, async () => { throw new Error("boom"); }], [{ name: "c", configured: () => true }, async () => 42]]);
  assert.strictEqual(r.data, 42); assert.strictEqual(r.source, "c"); assert.deepStrictEqual(r.attempts.map((x) => x.status), ["skipped", "error", "ok"]);
  await assert.rejects(() => svc.chain("y", [[{ name: "a", configured: () => true }, async () => null]]), /no_provider_for_y/);
  assert.throws(() => svc.sym("bad symbol!"), /bad_symbol/);
  console.log("_finservice.test.js ok");
})();
const original = sec.buildStatements(f, "T", "annual", "2025-03-01")[0];
assert.equal(original.revenue, 100);
assert.equal(original.filingDate, "2025-02-01");
assert.equal(sec.buildStatements(f, "T", "annual", "2025-01-01").length, 0);
assert.equal(S.quote({price:20,currency:"THB"}).meta.unit, "THB/share");
assert.equal(S.statement({currency:"HKD"}).meta.unit, "HKD");
assert.equal(S.quote({timestamp:null}).timestamp, null);
