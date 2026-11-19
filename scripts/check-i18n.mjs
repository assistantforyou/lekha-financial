#!/usr/bin/env node
// Fails (exit 1) when any translated string used by the v2+ front ends (public/v2, public/core) is missing from any language
// file in public/core/i18n/, so a new sentence can never ship untranslated. `--list` prints the keys; `--json` dumps them.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const LANGS = ["th", "zh-Hans", "zh-Hant", "ja", "ko", "es", "hi", "vi", "fr"];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "i18n" ? [] : walk(p)) : /\.js$/.test(f) ? [p] : []; });
export function keys() {
  const set = new Set();
  const re = /\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.)*`)/g;
  for (const f of [...walk(join(ROOT, "v2")), ...walk(join(ROOT, "v3")), ...walk(join(ROOT, "core"))]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) { const q = m[1][0]; set.add(JSON.parse(q === '"' ? m[1] : '"' + m[1].slice(1, -1).replace(/"/g, '\\"').replace(/\\'/g, "'") + '"')); }
  }
  return [...set].sort();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const K = keys();
  if (process.argv.includes("--list")) { console.log(K.join("\n")); process.exit(0); }
  if (process.argv.includes("--json")) { console.log(JSON.stringify(K, null, 1)); process.exit(0); }
  let bad = 0;
  for (const l of LANGS) {
    const f = join(ROOT, "core", "i18n", l + ".js");
    if (!existsSync(f)) { console.log(`${l}: file missing`); bad++; continue; }
    const D = (await import(pathToFileURL(f).href)).default;
    const miss = K.filter((k) => !(k in D) || !String(D[k]).trim()), extra = Object.keys(D).filter((k) => !K.includes(k));
    const ph = K.filter((k) => k in D && JSON.stringify((k.match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((String(D[k]).match(/\{\w+\}/g) || []).sort()));
    console.log(`${l}: ${K.length - miss.length}/${K.length} keys${miss.length ? `, missing ${miss.length}` : ""}${ph.length ? `, placeholder mismatch ${ph.length}` : ""}${extra.length ? `, ${extra.length} unused` : ""}`);
    miss.slice(0, 8).forEach((k) => console.log("   missing:", k)); ph.slice(0, 8).forEach((k) => console.log("   placeholders:", k, "=>", D[k]));
    if (miss.length || ph.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
