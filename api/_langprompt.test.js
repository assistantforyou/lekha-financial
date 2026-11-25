// Run: node api/_langprompt.test.js
// First-visit language prompt: copy for every shipped language, house style, and which language a browser's preference list maps to.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const load = (f) => import(pathToFileURL(path.join(__dirname, "..", "app", "src", f)).href);

(async () => {
  const { COPY } = await load("components/langprompt-copy.js"), { SUPPORTED, matchLang, bestLang, promptLang } = await load("lib/langdetect.js");
  const I = require("../public/v2/pt-i18n.js"), codes = I.LANGS.map((l) => l.code);

  // copy: exactly the shipped languages, every field present, house style
  assert.deepStrictEqual(Object.keys(COPY).sort(), codes.slice().sort(), "prompt copy must cover exactly the languages the app ships");
  assert.deepStrictEqual(SUPPORTED.slice().sort(), codes.slice().sort(), "detection must know exactly the shipped languages");
  const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  for (const c of codes) {
    for (const k of ["title", "yes", "no", "busy", "close"]) assert.ok(typeof COPY[c][k] === "string" && COPY[c][k].trim(), `${c}.${k}`);
    assert.deepStrictEqual(Object.keys(COPY[c]).sort(), Object.keys(COPY.en).sort(), `${c}: same keys as English`);
    assert.ok(!PICTO.test(JSON.stringify(COPY[c])), `${c}: no pictographs (house style)`);
    assert.ok(!/!/.test(COPY[c].title + COPY[c].yes + COPY[c].no + COPY[c].busy + COPY[c].close), `${c}: no exclamation marks (house style)`);
    assert.ok(COPY[c].title.length <= 60, `${c}: the question stays short`);
  }

  // matchLang: one tag
  const m = (t) => matchLang(t);
  for (const [t, want] of [["th", "th"], ["th-TH", "th"], ["TH-th", "th"], ["ja-JP", "ja"], ["ko", "ko"], ["ko-KR", "ko"], ["es-MX", "es"], ["es-419", "es"], ["hi-IN", "hi"], ["vi", "vi"], ["fr-CA", "fr"], ["fr", "fr"], ["en", "en"], ["en-GB", "en"],
    ["zh", "zh-Hans"], ["zh-CN", "zh-Hans"], ["zh-SG", "zh-Hans"], ["zh-Hans", "zh-Hans"], ["zh-Hans-CN", "zh-Hans"], ["zh-TW", "zh-Hant"], ["zh-HK", "zh-Hant"], ["zh-MO", "zh-Hant"], ["zh-Hant", "zh-Hant"], ["zh-Hant-TW", "zh-Hant"], ["zh_tw", "zh-Hant"],
    ["de", null], ["de-DE", null], ["pt-BR", null], ["ar", null], ["", null], ["*", null], [null, null], [undefined, null]]) assert.strictEqual(m(t), want, `matchLang(${JSON.stringify(t)})`);

  // bestLang: the first supported tag in preference order
  assert.strictEqual(bestLang(["th-TH", "en-US", "en"]), "th");
  assert.strictEqual(bestLang(["de-DE", "fr-FR", "en"]), "fr", "unsupported tags are skipped");
  assert.strictEqual(bestLang(["en-US", "th"]), "en", "English first means English is preferred");
  assert.strictEqual(bestLang(["de", "pt"]), null);
  assert.strictEqual(bestLang([]), null); assert.strictEqual(bestLang(undefined), null); assert.strictEqual(bestLang("th"), null, "not a list");

  // promptLang: never offers English, never offers anything for English or unsupported browsers
  assert.strictEqual(promptLang(["th-TH", "en"]), "th"); assert.strictEqual(promptLang(["zh-TW"]), "zh-Hant"); assert.strictEqual(promptLang(["zh-CN", "zh"]), "zh-Hans");
  assert.strictEqual(promptLang(["en-US"]), null); assert.strictEqual(promptLang(["de-DE"]), null); assert.strictEqual(promptLang([]), null); assert.strictEqual(promptLang(["en-GB", "fr"]), null);
  console.log("langprompt tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
