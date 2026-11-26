#!/usr/bin/env node
// Agent evaluation harness.
//
//   npm run eval:agent                 run every case, print a report
//   npm run eval:agent -- --limit 10   run the first ten
//   npm run eval:agent -- --tag relationship
//   npm run eval:agent -- --id aapl-tsmc
//   npm run eval:agent -- --owner <uuid>   include portfolio cases for a real book
//
// A case fails when the answer breaks a contract: a company name that should
// have resolved did not, a claim cites evidence that does not exist, a number
// appears that is not in the evidence, an unanswerable question was answered
// anyway, a source that should have been consulted was not, or the request took
// too long. Numeric expectations are deliberately loose: figures move.
//
// The report is written to api/_fin/eval/report.json and report.md (both
// gitignored). Exit code is 1 when the pass rate is below --min (default 0.85),
// so a regression stops the line.

const fs = require("fs");
const path = require("path");

// Keys live outside the repo in development; load them before anything reads
// process.env. Production sets real environment variables and this is a no-op.
function loadEnv() {
  const file = process.env.PT_KEYS_ENV || path.join(process.env.HOME || "", ".config/portfolio-terminal/keys.env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnv();

const agent = require("../agent");
const { generateJson } = require("../../_llm");
const { scoreCase, summarise } = require("./score");

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const limit = Number(flag("limit", 0)) || 0;
const onlyId = flag("id", null);
const onlyTag = flag("tag", null);
const owner = flag("owner", null);
const concurrency = Math.max(1, Number(flag("concurrency", 3)) || 3);
const minRate = Number(flag("min", 0.85));
const outDir = path.join(__dirname);

const file = path.join(__dirname, "cases.json");
const all = JSON.parse(fs.readFileSync(file, "utf8")).cases;
let cases = all.slice();
if (onlyId) cases = cases.filter((c) => c.id === onlyId);
if (onlyTag) cases = cases.filter((c) => c.tag === onlyTag);
if (limit) cases = cases.slice(0, limit);

const needsOwner = cases.filter((c) => c.tag === "portfolio");
if (!owner && needsOwner.length) {
  cases = cases.filter((c) => c.tag !== "portfolio");
  console.log(`Skipping ${needsOwner.length} portfolio cases (no --owner supplied).`);
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("DEEPSEEK_API_KEY is not set; add it to ~/.config/portfolio-terminal/keys.env or PT_KEYS_ENV.");
  process.exit(2);
}
const llm = { json: (o) => generateJson(o) };

async function one(c) {
  const started = Date.now();
  try {
    const r = await agent.run({
      question: c.q,
      symbol: c.symbol || null,
      llm,
      owner: owner || null,
      hideReports: false,
      langHint: "en",
    });
    return scoreCase(c, r || {});
  } catch (e) {
    return {
      id: c.id, tag: c.tag, pass: false, ms: Date.now() - started,
      checks: { clean: false }, notes: [`threw ${e && e.message}`],
      claims: 0, cited: 0, unverified: 0, downgraded: 0, missing: 0, evidence: 0, calls: 0, summary: "",
    };
  }
}

async function main() {
  const rows = new Array(cases.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= cases.length) return;
      const c = cases[i];
      const row = await one(c);
      rows[i] = row;
      const mark = row.pass ? "PASS" : "FAIL";
      console.log(`${mark}  ${row.id.padEnd(22)} ${String(row.ms).padStart(6)} ms  ${row.claims} claims  ${row.notes.join("; ") || ""}`);
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));

  const done = rows.filter(Boolean);
  const sum = summarise(done);
  const wall = Date.now() - t0;

  console.log("");
  console.log(`Pass ${sum.pass}/${sum.n} (${(sum.rate * 100).toFixed(1)}%)  median ${sum.medianMs} ms  p90 ${sum.p90Ms} ms  wall ${(wall / 1000).toFixed(1)} s`);
  for (const [tag, t] of Object.entries(sum.byTag).sort()) {
    console.log(`  ${tag.padEnd(14)} ${t.pass}/${t.n}  ${(t.rate * 100).toFixed(0)}%`);
  }
  console.log(`Claims ${sum.claims}, uncited ${sum.uncited}, unverified numbers ${sum.unverified}, downgraded to interpretation ${sum.downgraded}`);
  for (const f of sum.failures) console.log(`  FAIL ${f.id} [${f.tag}] ${f.notes.join("; ")}`);

  const report = {
    at: new Date().toISOString(),
    cases: done.length,
    summary: sum,
    rows: done,
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  const md = [
    "# Agent evaluation",
    "",
    `Run ${report.at} · ${sum.pass}/${sum.n} passed (${(sum.rate * 100).toFixed(1)}%) · median ${sum.medianMs} ms · p90 ${sum.p90Ms} ms`,
    "",
    "| case | tag | result | ms | claims | uncited | unverified | downgraded | notes |",
    "|---|---|---|---|---|---|---|---|---|",
    ...done.map((r) => `| ${r.id} | ${r.tag} | ${r.pass ? "pass" : "FAIL"} | ${r.ms} | ${r.claims} | ${r.claims - r.cited} | ${r.unverified} | ${r.downgraded} | ${r.notes.join("; ").replace(/\|/g, "/")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "report.md"), md);

  const rate = sum.rate;
  if (rate < minRate) {
    console.error(`Pass rate ${(rate * 100).toFixed(1)}% is below the ${(minRate * 100).toFixed(0)}% floor.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e && e.stack || e);
  process.exit(2);
});
