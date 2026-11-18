// dev helper: show pass-3 (glossary/list) keys for a range of master entries
import fs from "node:fs"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const I = require("../../public/pt-i18n.js");
const master = JSON.parse(fs.readFileSync(new URL("./master.json", import.meta.url), "utf8"));
const gloss = JSON.parse(fs.readFileSync(new URL("./glossary.json", import.meta.url), "utf8"));
I.setGloss(gloss);
const [a, b] = [+process.argv[2], +process.argv[3]];
for (let i = a; i < Math.min(b, master.length); i++) {
  // master keys are normalised already; rebuild a raw-ish string by turning {n} back into a number so norm() re-slots it
  const raw = master[i].replace(/\{\d+\}/g, "7");
  const k3 = I.norm(raw, 2).key;
  console.log(i + "\t" + master[i] + (k3 !== master[i] ? "\n\t=> " + k3 : ""));
}
