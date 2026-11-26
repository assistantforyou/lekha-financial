// Deterministic scoring for the frozen agent evaluation set.
//
// No model judges anything here. Each case declares what a correct answer must
// contain (symbols, numbers already in the evidence, a named source), whether
// the question is answerable at all, and a latency ceiling. The runner feeds in
// the raw result of agent.run and this module decides pass or fail and why.
//
// Keeping the scorer pure and dependency-free means the harness itself can be
// tested without a model key, and a regression in the agent shows up as a real
// failure rather than a change of opinion.

const REFUSAL = /\b(cannot|can't|can not|unable|no (?:source|data|figure|public)|not (?:available|reported|disclosed|in the evidence)|does not (?:contain|report|disclose|publish)|insufficient|nothing in the evidence)\b/i;

// Formatting differs between feeds ("$1,234.5" vs "1234.5" vs "1.23B"), so
// comparisons strip currency marks, thousands separators, percent signs and
// whitespace. Numbers keep their decimal point.
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/[,\s$€£¥%]/g, "")
    .replace(/[\u2013\u2014]/g, "-");
}

function textsOf(result) {
  const parts = [result && result.summary];
  for (const c of (result && result.claims) || []) parts.push(c && c.text);
  return parts.filter(Boolean);
}

function evidenceText(result) {
  return ((result && result.evidence) || [])
    .map((e) => [e.label, e.source, ...(e.lines || [])].join(" "))
    .join(" ");
}

function citedClaims(result) {
  const claims = (result && result.claims) || [];
  const ids = new Set(((result && result.evidence) || []).map((e) => e.id));
  let cited = 0, unknown = 0;
  for (const c of claims) {
    const list = (c && c.evidence) || [];
    if (list.length) cited += 1;
    if (list.some((id) => !ids.has(id))) unknown += 1;
  }
  return { claims: claims.length, cited, unknown };
}

function checkSymbols(want, got) {
  if (!want || !want.length) return true;
  const have = new Set((got || []).map((s) => String(s).toUpperCase()));
  return want.every((s) => have.has(String(s).toUpperCase()));
}

// A claim is traceable when every number it states appears in the evidence it
// cites. agent.js catches offenders itself: a fact or calculated claim with an
// unverified number is downgraded to interpretation and flagged. The harness
// therefore fails only on a flag that survived on a fact or calculated claim,
// and counts the honest downgrades separately so a regression still shows.
function verifyFlags(result) {
  let hard = 0, soft = 0;
  for (const c of (result && result.claims) || []) {
    const flags = (c && c.flags) || [];
    if (!flags.includes("unverified_numbers") && !flags.includes("unverified_evidence")) continue;
    soft++;
    if (c.type === "fact" || c.type === "calculated") hard++;
  }
  return { hard, soft };
}

function mentions(result, words) {
  const text = norm(textsOf(result).join(" \n "));
  return (words || []).filter((w) => !text.includes(norm(w)));
}

function contains(result, words) {
  const text = norm(textsOf(result).join(" \n "));
  return (words || []).filter((w) => text.includes(norm(w)));
}

function sourcesMatch(result, want) {
  if (!want || !want.length) return true;
  const hay = ((result && result.evidence) || [])
    .map((e) => [e.url, e.source, e.label].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
  return want.some((s) => hay.includes(String(s).toLowerCase()));
}

function scoreCase(c, r) {
  const e = c.expect || {};
  const summary = String((r && r.summary) || "").trim();
  const claims = (r && r.claims) || [];
  const missing = (r && r.missing) || [];
  const { claims: nClaims, cited, unknown } = citedClaims(r);
  const flags = verifyFlags(r);
  const answerable = e.answerable !== false;

  const out = { symbols: true, answered: true, cited: true, traceable: true, facts: true, sources: true, latency: true, clean: true };
  const notes = [];

  if (!checkSymbols(e.symbols, r && r.symbols)) {
    out.symbols = false;
    notes.push(`symbols ${JSON.stringify((r && r.symbols) || [])} missing ${JSON.stringify(e.symbols)}`);
  }

  // Answerable questions need a real answer. Unanswerable ones need an explicit
  // statement of what is missing, not a confident invention.
  if (answerable) {
    if (summary.length < 40) { out.answered = false; notes.push("summary too short"); }
    if (r && r.llmError) { out.answered = false; notes.push(`model error ${r.llmError}`); }
  } else {
    const refused = REFUSAL.test(summary) || missing.length > 0 || (r && r.llmError);
    if (!refused) { out.answered = false; notes.push("answered an unanswerable question without saying what is missing"); }
  }

  if (nClaims > 0 && cited !== nClaims) {
    out.cited = false;
    notes.push(`${nClaims - cited} of ${nClaims} claims have no evidence id`);
  }
  if (unknown) { out.cited = false; notes.push(`${unknown} claims cite an evidence id that does not exist`); }
  if (e.mustCite && nClaims === 0) { out.cited = false; notes.push("no claims at all"); }

  if (flags.hard) { out.traceable = false; notes.push(`${flags.hard} fact or calculated claims contain numbers not in their evidence`); }

  const missingFacts = mentions(r, e.all);
  if (missingFacts.length) { out.facts = false; notes.push(`missing ${JSON.stringify(missingFacts)}`); }
  if (e.any && e.any.length && mentions(r, e.any).length === e.any.length) {
    out.facts = false;
    notes.push(`none of ${JSON.stringify(e.any)} appears`);
  }

  if (!sourcesMatch(r, e.sources)) { out.sources = false; notes.push(`no evidence from ${JSON.stringify(e.sources)}`); }

  const ms = Number((r && r.ms) || 0);
  if (e.maxMs && ms > e.maxMs) { out.latency = false; notes.push(`${ms} ms over ${e.maxMs} ms`); }

  if (c.forbid && c.forbid.length) {
    const hit = contains(r, c.forbid);
    if (hit.length) { out.clean = false; notes.push(`contains forbidden ${JSON.stringify(hit)}`); }
  }

  const pass = Object.values(out).every(Boolean);
  return {
    id: c.id, tag: c.tag || "general", pass, checks: out, notes,
    ms, claims: nClaims, cited, unverified: flags.hard, downgraded: flags.soft - flags.hard, missing: missing.length,
    evidence: ((r && r.evidence) || []).length,
    calls: ((r && r.plan && r.plan.calls) || []).length,
    summary: summary.slice(0, 400),
  };
}

function median(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function summarise(rows) {
  const n = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const byTag = {};
  for (const r of rows) {
    const t = (byTag[r.tag] = byTag[r.tag] || { n: 0, pass: 0 });
    t.n += 1;
    if (r.pass) t.pass += 1;
  }
  for (const t of Object.values(byTag)) t.rate = t.n ? +(t.pass / t.n).toFixed(3) : 0;
  const ms = rows.map((r) => r.ms).filter((x) => x > 0);
  return {
    n,
    pass: passed,
    rate: n ? +(passed / n).toFixed(3) : 0,
    byTag,
    medianMs: median(ms),
    p90Ms: ms.length ? [...ms].sort((a, b) => a - b)[Math.floor(ms.length * 0.9) - 1] || 0 : 0,
    claims: rows.reduce((a, r) => a + r.claims, 0),
    uncited: rows.reduce((a, r) => a + (r.claims - r.cited), 0),
    unverified: rows.reduce((a, r) => a + r.unverified, 0),
    downgraded: rows.reduce((a, r) => a + (r.downgraded || 0), 0),
    failures: rows.filter((r) => !r.pass).map((r) => ({ id: r.id, tag: r.tag, notes: r.notes })),
  };
}

module.exports = { norm, scoreCase, summarise, REFUSAL };
