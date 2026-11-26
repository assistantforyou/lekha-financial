// Tests for the deterministic agent scorer. No model, no network.
const assert = require("assert");
const { scoreCase, summarise, norm } = require("./_fin/eval/score");

const ev = (id, extra = {}) => ({ id, label: `label ${id}`, source: "SEC EDGAR", asOf: "2026-01-01", kind: "fact", url: "https://sec.gov/x", lines: ["revenue 391,035 million"], ...extra });

function ok(over = {}) {
  return {
    summary: "Apple reported revenue of $391.04 billion in the last fiscal year, up 6.4% year over year.",
    symbols: ["AAPL"],
    claims: [{ text: "Revenue was 391.04 billion USD.", type: "fact", evidence: ["E1"] }],
    missing: [],
    evidence: [ev("E1")],
    ms: 8000,
    plan: { calls: [["get_financial_statements", { symbol: "AAPL" }]] },
    llmError: null,
    ...over,
  };
}

const base = { id: "t", tag: "company", q: "revenue?", expect: { symbols: ["AAPL"], all: ["revenue"], sources: ["sec"], maxMs: 45000 } };

let n = 0;
function t(name, fn) { fn(); n += 1; console.log("ok " + name); }

t("a clean answer passes", () => {
  const r = scoreCase(base, ok());
  assert.strictEqual(r.pass, true, JSON.stringify(r));
  assert.deepStrictEqual(r.notes, []);
});

t("a claim without an evidence id fails citation", () => {
  const r = scoreCase(base, ok({ claims: [{ text: "Revenue was 391.04 billion.", type: "fact", evidence: [] }] }));
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.checks.cited, false);
});

t("a claim citing a missing evidence id fails", () => {
  const r = scoreCase(base, ok({ claims: [{ text: "Revenue was 391.04 billion.", type: "fact", evidence: ["E9"] }] }));
  assert.strictEqual(r.checks.cited, false);
});

t("an unverified number fails traceability", () => {
  const r = scoreCase(base, ok({ claims: [{ text: "Revenue was 999 billion.", type: "fact", evidence: ["E1"], flags: ["unverified_numbers"] }] }));
  assert.strictEqual(r.checks.traceable, false);
});

t("a downgraded interpretation is not a traceability failure", () => {
  const r = scoreCase(base, ok({ claims: [{ text: "Revenue was 999 billion.", type: "interpretation", evidence: ["E1"], flags: ["unverified_numbers"] }] }));
  assert.strictEqual(r.checks.traceable, true);
  assert.strictEqual(r.downgraded, 1);
  assert.strictEqual(r.unverified, 0);
  const s = summarise([r]);
  assert.strictEqual(s.downgraded, 1);
});

t("the wrong symbol fails", () => {
  const r = scoreCase(base, ok({ symbols: ["MSFT"] }));
  assert.strictEqual(r.checks.symbols, false);
});

t("a missing expected fact fails", () => {
  const r = scoreCase({ ...base, expect: { ...base.expect, all: ["dividend"] } }, ok());
  assert.strictEqual(r.checks.facts, false);
});

t("any-of matches case and formatting", () => {
  const r = scoreCase({ ...base, expect: { ...base.expect, any: ["net sales", "REVENUE"] } }, ok());
  assert.strictEqual(r.checks.facts, true);
});

t("a missing source fails", () => {
  const r = scoreCase({ ...base, expect: { ...base.expect, sources: ["reuters.com"] } }, ok());
  assert.strictEqual(r.checks.sources, false);
});

t("an answer over the latency ceiling fails", () => {
  const r = scoreCase({ ...base, expect: { ...base.expect, maxMs: 1000 } }, ok());
  assert.strictEqual(r.checks.latency, false);
});

t("an unanswerable question answered confidently fails", () => {
  const c = { id: "u", tag: "unanswerable", q: "price in 2030?", expect: { answerable: false } };
  const r = scoreCase(c, ok({ summary: "Apple will trade at 500 USD on that date because of services growth and buybacks.", claims: [], evidence: [], symbols: [] }));
  assert.strictEqual(r.pass, false);
});

t("an unanswerable question refused passes", () => {
  const c = { id: "u", tag: "unanswerable", q: "price in 2030?", expect: { answerable: false } };
  const r = scoreCase(c, ok({ summary: "No source can state that price; nothing in the evidence supports a forecast.", claims: [], evidence: [], symbols: [] }));
  assert.strictEqual(r.pass, true, JSON.stringify(r));
});

t("an empty missing list with a refusal in the summary still passes", () => {
  const c = { id: "u", tag: "unanswerable", q: "private company revenue?", expect: { answerable: false } };
  const r = scoreCase(c, ok({ summary: "The revenue of a private company is not disclosed and no source reports it.", claims: [], evidence: [], symbols: [] }));
  assert.strictEqual(r.pass, true);
});

t("a short summary fails the answered check", () => {
  const r = scoreCase(base, ok({ summary: "Yes." }));
  assert.strictEqual(r.checks.answered, false);
});

t("forbidden text fails the clean check", () => {
  const r = scoreCase({ ...base, forbid: ["guaranteed return"] }, ok({ summary: "Apple offers a guaranteed return with no downside, revenue 391 billion." }));
  assert.strictEqual(r.checks.clean, false);
});

t("formatting differences do not break a numeric fact", () => {
  const r = scoreCase({ ...base, expect: { ...base.expect, all: ["391035"] } }, ok({ summary: "Apple revenue was 391,035 million USD in the last fiscal year, which is a large figure." }));
  assert.strictEqual(r.checks.facts, true);
});

t("summarise groups by tag and counts failures", () => {
  const rows = [
    scoreCase(base, ok()),
    scoreCase({ ...base, id: "b", tag: "macro" }, ok({ symbols: [] , summary: "Short." })),
  ];
  const s = summarise(rows);
  assert.strictEqual(s.n, 2);
  assert.strictEqual(s.pass, 1);
  assert.strictEqual(s.byTag.company.rate, 1);
  assert.strictEqual(s.byTag.macro.rate, 0);
  assert.strictEqual(s.failures.length, 1);
});

t("norm strips separators used by feeds", () => {
  assert.strictEqual(norm("$1,234.5"), "1234.5");
  assert.strictEqual(norm("6.4 %"), "6.4");
});

console.log(`\n${n} checks passed`);
