// Run: node api/_council.test.js
// v2 building blocks: headline tone + RSS parsing, the US session clock, the Council Monte Carlo engine
// (deterministic, ordered percentiles, persona rules), and translation completeness for every v2 string.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { toneOf, parseRss } = require("./_news");
const { sessionNow } = require("./_h/free/quotes");

(async () => {
  // ---- tone: plain keyword balance, -1..+1
  assert.strictEqual(toneOf([{ h: "Nvidia beats estimates, shares surge" }, { h: "Analyst upgrade lifts chip stocks" }]) > 0.4, true);
  assert.strictEqual(toneOf([{ h: "Company warns of weak demand, shares plunge" }]) < 0, true);
  assert.strictEqual(toneOf([]), 0);

  // ---- rss: items need a title and an http(s) link; very old items are dropped
  const xml = `<rss><channel><item><title>A &amp; B beat</title><link>https://example.com/a</link><pubDate>${new Date().toUTCString()}</pubDate></item>
    <item><title>No link</title><link>javascript:alert(1)</link></item>
    <item><title>Old</title><link>https://example.com/old</link><pubDate>Mon, 01 Jan 2001 00:00:00 GMT</pubDate></item></channel></rss>`;
  const items = parseRss(xml, "Test");
  assert.strictEqual(items.length, 1); assert.strictEqual(items[0].h, "A & B beat"); assert.strictEqual(items[0].src, "Test");

  // ---- session clock (New York): Wed 10:00 ET open, 07:00 pre, 17:00 post, 22:00 closed, Saturday closed
  assert.strictEqual(sessionNow(new Date("2026-11-18T15:00:00Z")), "open");
  assert.strictEqual(sessionNow(new Date("2026-11-18T12:00:00Z")), "pre");
  assert.strictEqual(sessionNow(new Date("2026-11-18T22:00:00Z")), "post");
  assert.strictEqual(sessionNow(new Date("2026-11-19T03:00:00Z")), "closed");
  assert.strictEqual(sessionNow(new Date("2026-11-21T15:00:00Z")), "closed");

  // ---- engine
  const { CouncilRun, PERSONAS, plan } = await import(pathToFileURL(path.join(__dirname, "../public/core/engine.js")).href);
  const A = (tk, w0, beta, vol, idio, upside, mom, dd, m1) => ({ tk, w0, beta, vol, idio, upside, mom, dd, m1, tone: 0, mos: null });
  const inp = () => ({ seed: 7, paths: 1500, start: 1, cash0: 0.1, market: { vol: 0.16, rf: 0.04, erp: 0.05, mood: 55, vix: 17 },
    assets: [A("AAA", 0.4, 1.6, 0.5, 0.4, 0.2, 0.6, -0.05, 0.04), A("BBB", 0.3, 1.0, 0.25, 0.15, 0.05, 0.1, -0.1, 0), A("CCC", 0.2, 0.5, 0.16, 0.1, 0.1, -0.1, -0.2, -0.03)],
    events: [{ kind: "fomc", day: 10, sigma: 0.011, lean: 0.2 }, { kind: "earnings", tk: "AAA", day: 15, sigma: 0.07, lean: -0.3 }] });
  const run = (i) => { const r = new CouncilRun(i); while (!r.step(500)); return r.result(); };
  const a = run(inp()), b = run(inp());
  assert.deepStrictEqual(a.personas.growth.hz["1Y"], b.personas.growth.hz["1Y"], "same seed, same futures, same answer");
  for (const id of PERSONAS) {
    const h = a.personas[id].hz["1Y"];
    assert.ok(h.p5 < h.p25 && h.p25 < h.p50 && h.p50 < h.p75 && h.p75 < h.p95, id + ": percentiles ordered");
    assert.ok(h.pGain > 0 && h.pGain < 1 && h.ddMed >= 0 && h.ddMed < 1, id + ": sane probabilities");
    const w = a.personas[id].w.reduce((s, x) => s + x, 0) + a.personas[id].cash; assert.ok(Math.abs(w - 1) < 1e-9, id + ": weights plus cash sum to 1");
  }
  const you = a.personas.you; assert.deepStrictEqual(you.w.map((x) => +x.toFixed(6)), [0.4, 0.3, 0.2], "'you' keeps current weights");
  assert.ok(a.personas.quant.cash > a.personas.growth.cash, "quant holds more cash than growth");
  assert.ok(a.personas.income.vol < a.personas.growth.vol, "income is calmer than growth");
  assert.ok(a.personas.quant.hz["1Y"].ddMed < a.personas.growth.hz["1Y"].ddMed, "vol-targeting shrinks the typical drawdown");
  assert.ok(a.personas.growth.fan.length > 40 && a.personas.growth.fan[0].p50 === 0, "fan starts at zero");
  // a very bearish earnings lean lowers the simulated median of the stock's own holder at the event horizon
  const base = inp(); base.events = [{ kind: "earnings", tk: "AAA", day: 15, sigma: 0.08, lean: 0 }];
  const bear = inp(); bear.events = [{ kind: "earnings", tk: "AAA", day: 15, sigma: 0.08, lean: -1 }];
  assert.ok(run(bear).personas.you.hz["21D"].p50 < run(base).personas.you.hz["21D"].p50, "bearish lean shifts the event jump down");

  // ---- every t("...") string in v2/core exists, with matching placeholders, in all nine language files
  const { keys } = await import(pathToFileURL(path.join(__dirname, "../scripts/check-i18n.mjs")).href);
  const K = keys();
  for (const l of ["th", "zh-Hans", "zh-Hant", "ja", "ko", "es", "hi", "vi", "fr"]) {
    const D = (await import(pathToFileURL(path.join(__dirname, "../public/core/i18n", l + ".js")).href)).default;
    const bad = K.filter((k) => !D[k] || JSON.stringify((k.match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((D[k].match(/\{\w+\}/g) || []).sort()));
    assert.deepStrictEqual(bad, [], l + ": untranslated or placeholder mismatch: " + bad.slice(0, 3).join(" | "));
  }
  console.log("council tests ok (" + K.length + " strings x 9 languages)");
})().catch((e) => { console.error(e); process.exit(1); });
