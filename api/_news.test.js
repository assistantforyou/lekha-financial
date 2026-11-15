// Run: node api/_news.test.js
const assert = require("assert");
const Module = require("module"); const orig = Module._load;
Module._load = function (r) { if (r === "./_lib") return { cached: async () => null, cacheGet: async () => null }; if (r === "./_llm") return { generateJson: async () => ({}) }; return orig.apply(this, arguments); };
const { rssItems, briefingDoc } = require("./_news");
const now = Date.parse("2026-11-16T12:00:00Z");
const feed = { name: "CNBC", hosts: ["cnbc.com"] };
const xml = `<rss><channel><item><title><![CDATA[Nvidia &amp; AMD rally]]></title><link>https://www.cnbc.com/2026/11/16/a.html</link><pubDate>Mon, 16 Nov 2026 09:00:00 GMT</pubDate><description><![CDATA[<p>Chips <b>jump</b></p>]]></description></item>
<item><title>Evil</title><link>https://evil.example/x</link><pubDate>Mon, 16 Nov 2026 09:00:00 GMT</pubDate></item>
<item><title>Old</title><link>https://www.cnbc.com/old</link><pubDate>Mon, 01 Jun 2026 09:00:00 GMT</pubDate></item>
<item><title>Script</title><link>javascript:alert(1)</link><pubDate>Mon, 16 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
const items = rssItems(xml, feed, now);
assert.strictEqual(items.length, 1);
assert.strictEqual(items[0].headline, "Nvidia & AMD rally"); assert.strictEqual(items[0].desc, "Chips jump");
const more = [items[0], { headline: "Fed holds", url: "https://www.federalreserve.gov/x", source: "Federal Reserve", desc: "", at: now }];
const doc = briefingDoc(more, { macro: "Calm.", items: [
  { i: 0, impact: "Bullish", summary: "Chips rose.", why: "AI demand.", tickers: ["nvda", "FAKE", "AMD"] },
  { i: 0, impact: "Mixed", summary: "dup", why: "" },                 // duplicate index dropped
  { i: 9, impact: "Bearish", summary: "invented item", why: "" },     // out-of-range index dropped
  { i: 1, impact: "WEIRD", summary: "Hold.", why: "", url: "https://attacker.example", headline: "Injected" },
] }, "2026-11-16");
assert.strictEqual(doc.id, "2026-11-16"); assert.strictEqual(doc.data.items.length, 2);
assert.deepStrictEqual(doc.data.items[0].tickers, ["NVDA", "AMD"]);
assert.strictEqual(doc.data.items[1].headline, "Fed holds");              // headline/url come from the feed, not the model
assert.strictEqual(doc.data.items[1].url, "https://www.federalreserve.gov/x");
assert.strictEqual(doc.data.items[1].impact, "Mixed");
assert.ok(doc.data.macro.includes("Verify before acting"));
assert.strictEqual(briefingDoc(more, { macro: "x", items: [] }, "d"), null);
console.log("news ok");
