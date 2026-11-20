// Run: node api/_style.test.js
// House style: this is a tool for financial professionals. No emoji, no pictograph "stickers", anywhere a user can see.
// Typographic symbols stay allowed (arrows, triangles for price direction, the middle dot, the check mark used in menus).
// \uXXXX escapes are decoded first so an emoji hidden behind an escape sequence is caught too.
const assert = require("assert"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const BAD = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{FE0F}\u{20E3}]/gu;
const ALLOWED = new Set(["✓"]); // check mark in theme/selection menus
const SKIP_DIRS = new Set(["node_modules", ".git", "docs", ".vercel", ".claude"]);
const EXTS = new Set([".js", ".jsx", ".mjs", ".html", ".css", ".json", ".svg"]);
const decode = (t) => t.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (m, a, b) => { try { return String.fromCodePoint(parseInt(a || b, 16)); } catch (e) { return m; } });

const found = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name), st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!EXTS.has(path.extname(name)) || /\.test\.js$/.test(name)) continue;
    const t = decode(fs.readFileSync(p, "utf8"));
    for (const ch of t.match(BAD) || []) if (!ALLOWED.has(ch)) found.push(path.relative(ROOT, p) + " U+" + ch.codePointAt(0).toString(16).toUpperCase());
  }
})(ROOT);
assert.deepStrictEqual([...new Set(found)], [], "emoji/pictographs are not allowed in the site's code: " + [...new Set(found)].join(", "));
console.log("style ok: no emoji or pictographs in the site's code");
