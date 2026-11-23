// Run: node api/_scripts-parse.test.js
// Every browser script must parse. A syntax error in one classic script (for example a missing ";" in an
// engine patch) silently stops every panel that script drives, and no handler test would notice.
// Classic scripts and the inline <script> blocks of the HTML shells are compiled with vm.Script; ES modules
// are checked with `node --check` on a module copy.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const files = [];
for (const dir of ["public", "public/v2", "public/v3", "public/app", "public/core"]) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) if (f.endsWith(".js") && !f.startsWith("._")) files.push(path.join(dir, f));
}
assert.ok(files.length > 20, "found the browser scripts");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lekha-parse-"));
let n = 0;
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (/^\s*(import|export)\s/m.test(src)) {
    const copy = path.join(tmp, rel.replace(/[\\/]/g, "_") + ".mjs");
    fs.writeFileSync(copy, src);
    try { execFileSync(process.execPath, ["--check", copy], { stdio: "pipe" }); }
    catch (e) { assert.fail(rel + " does not parse: " + String(e.stderr).split("\n").slice(0, 5).join(" ")); }
  } else {
    try { new vm.Script(src, { filename: rel }); } catch (e) { assert.fail(rel + " does not parse: " + e.message); }
  }
  n++;
}
for (const rel of ["public/v2/index.html", "public/v3/index.html", "public/index.html"]) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type="(?:module|application\/(?:ld\+)?json)")[^>]*>([\s\S]*?)<\/script>/g;
  let m, k = 0;
  while ((m = re.exec(html))) { k++; try { new vm.Script(m[1], { filename: rel + "#inline" + k }); } catch (e) { assert.fail(rel + " inline script " + k + " does not parse: " + e.message); } }
  n += k;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log("scripts parse ok (" + n + ")");
