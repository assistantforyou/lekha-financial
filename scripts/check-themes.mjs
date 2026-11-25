#!/usr/bin/env node
// Verifies the 100 editor-style themes in public/v2/pt-themes.js: counts, ids, hex format, and WCAG contrast
// of every derived token on the page, panel and raised-panel backgrounds. Exits 1 on any failure.
//   node scripts/check-themes.mjs [--verbose]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const T = require(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "v2", "pt-themes.js"));
const verbose = process.argv.includes("--verbose");
const fails = [], notes = [];
const fail = (t, m) => fails.push(`${t.id}: ${m}`);

// ---- inventory ----
const dark = T.THEMES.filter((t) => t.kind === "dark").length, light = T.THEMES.filter((t) => t.kind === "light").length;
if (T.THEMES.length !== 100) fails.push(`expected 100 themes, found ${T.THEMES.length}`);
if (dark !== 74 || light !== 26) fails.push(`expected 74 dark + 26 light, found ${dark} + ${light}`);
const ids = new Set(), names = new Set();
for (const t of T.THEMES) {
  if (ids.has(t.id)) fail(t, "duplicate id"); ids.add(t.id);
  if (names.has(t.name)) fail(t, "duplicate name"); names.add(t.name);
  for (const [k, v] of Object.entries(t.c)) if (!/^#[0-9A-F]{6}$/i.test(v)) fail(t, `bad colour ${k}=${v}`);
}

// ---- contrast of the tokens the page actually uses ----
const ROWS = [ // [token, minimum ratio, why]
  ["--fg", 7, "body text"], ["--muted", 4.5, "secondary text"],
  ["--accent", 4.5, "accent text/buttons"], ["--up", 4.5, "gains"], ["--down", 4.5, "losses"], ["--warn", 4.5, "warnings"], ["--chart", 4.5, "chart line"],
  ["--s3", 3, "series 3"], ["--q1", 3, "category 1"], ["--q2", 3, "category 2"], ["--q3", 3, "category 3"], ["--q4", 3, "category 4"], ["--q5", 3, "category 5"], ["--q6", 3, "category 6"], ["--q7", 3, "category 7"],
];
let adjusted = 0;
for (const t of T.THEMES) {
  const v = T.vars(t.id), surfaces = [v["--bg"], v["--panel"], v["--panel-2"]];
  for (const [tok, min, why] of ROWS) for (const [i, s] of surfaces.entries()) {
    const r = T.ratio(v[tok], s);
    if (r < min) fail(t, `${tok} (${why}) ${r.toFixed(2)} < ${min} on ${["bg", "panel", "panel-2"][i]}`);
  }
  if (T.ratio(v["--accent"], v["--accent-soft"]) < 3.5) fail(t, `accent on accent-soft ${T.ratio(v["--accent"], v["--accent-soft"]).toFixed(2)} < 3.5`);
  if (T.ratio(v["--line"], v["--panel"]) < 1.15) fail(t, "panel borders are invisible (line vs panel < 1.15)");
  // up and down must not be the same colour (gain/loss readability)
  if (T.ratio(v["--up"], v["--down"]) < 1.1 && v["--up"] === v["--down"]) fail(t, "up and down are identical");
  const raw = t.c;
  for (const [tok, key] of [["--fg", "fg"], ["--muted", "muted"], ["--accent", "accent"], ["--up", "green"], ["--down", "red"], ["--chart", "blue"]]) if (v[tok].toUpperCase() !== raw[key].toUpperCase()) { adjusted++; if (verbose) notes.push(`${t.id}: ${tok} ${raw[key]} -> ${v[tok]}`); }
}
if (verbose && notes.length) console.log(notes.join("\n"));
console.log(`${T.THEMES.length} themes (${dark} dark, ${light} light); ${adjusted} colour(s) nudged for legibility`);
if (fails.length) { console.error(fails.join("\n")); console.error(`\n${fails.length} problem(s)`); process.exit(1); }
console.log("themes ok");
