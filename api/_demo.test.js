// Run: node api/_demo.test.js
// The DEMO simulation: deterministic, internally consistent, and shaped so every page parser
// accepts it. No network is touched — pt-demo.js is pure and runs in Node via its UMD wrapper.
const assert = require("assert");
const D = require("../public/pt-demo.js");

const serial = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / 864e5) + 25569;
const pairs = (s) => String(s || "").split(";").filter(Boolean).length;

(async () => {
  D._today("2026-11-18"); // pin the clock: the demo always ends "today", whatever today is

  // 1. Determinism: two builds are byte-identical (fixed seed, no Math.random, no Date.now() drift).
  const a = JSON.stringify(D.build());
  D._today("2026-11-18"); // repinning clears the series cache -> a true second build
  const b = JSON.stringify(D.build());
  assert.strictEqual(a, b);

  // 2. The demo never serves the same day twice for a different date pin (freshness without drift).
  D._today("2026-11-19");
  const c = D.build();
  assert.notStrictEqual(a, JSON.stringify(c));
  D._today("2026-11-18");

  const src = D.source();

  // 3. The demo is a full preview (owner decision, 23 Nov 2026): the page's data source serves every dataset,
  //    all simulated locally for the sample portfolio, and each passes the page's parser gates.
  const csv = {};
  for (const k of ["HISTORY", "ROTATION", "RISK", "BREADTH", "OBOS", "FACTOR", "VOLATILITY", "VALIN", "PEER"]) csv[k] = await src.fetchCsv(k);
  for (const k of Object.keys(csv)) assert.ok(typeof csv[k] === "string" && csv[k].length > 100, k + " missing");

  // BREADTH: >400 stocks with sector + above-50d/200d flags
  assert.ok(csv.BREADTH.split("\n").length > 401, "breadth needs >400 stocks");

  // OBOS: >400 stocks and ETF closes (SPY needs >60 points)
  const obRows = csv.OBOS.split("\n");
  assert.ok(obRows.filter((l) => /^[A-Z][A-Z0-9.]*,(?!ETF)/.test(l)).length > 400, "obos needs >400 stocks");
  const spyEtf = obRows.find((l) => /^SPY,ETF,/.test(l));
  assert.ok(spyEtf && pairs(spyEtf.split(",")[4]) > 60, "obos SPY ETF needs >60 points");

  // FACTOR: SPY needs >200 weekly points
  const spyFactor = obRows && csv.FACTOR.split("\n").find((l) => /^SPY,(Factor|Sector|Holding),/.test(l));
  assert.ok(spyFactor && pairs(spyFactor.split(",")[2]) > 200, "factor SPY needs >200 weekly closes");

  // VOLATILITY: VIX >500 daily points, VIXEQ >100 (VIXEQ only observed since 2024-11-04)
  const vixRow = csv.VOLATILITY.split("\n").find((l) => /^VIX,Index,/.test(l));
  const vixeqRow = csv.VOLATILITY.split("\n").find((l) => /^VIXEQ,Index,/.test(l));
  assert.ok(vixRow && pairs(vixRow.split(",")[2]) > 500, "VIX needs >500 points");
  assert.ok(vixeqRow && pairs(vixeqRow.split(",")[2]) > 100, "VIXEQ needs >100 points");

  // ROTATION / RISK shapes (parseRotation gates)
  assert.ok(/D\|SPY/.test(csv.ROTATION.split("\n")[0]) && /D\|XLE/.test(csv.ROTATION.split("\n")[0]));
  assert.ok(/D\|XLY/.test(csv.RISK.split("\n")[0]) && /D\|XLP/.test(csv.RISK.split("\n")[0]));

  // HISTORY: paired D|/W| columns, live 10Y, and the last trading day is exactly "today"
  assert.ok(/^D\|NVDA,,W\|NVDA,,/.test(csv.HISTORY.split("\n")[0]));
  assert.ok(/LIVE\|TNX10Y/.test(csv.HISTORY));
  const todaySerial = String(serial("2026-11-18"));
  assert.ok(csv.HISTORY.split("\n").some((l) => l.startsWith(todaySerial + ",")), "history must end at pinned today");

  // VALIN: header + NVDA row with a market-consistent beta
  assert.ok(csv.VALIN.startsWith("Ticker,Price,MarketCap,Shares,Beta,PE,EPS,Currency,Type"));
  const nvda = csv.VALIN.split("\n").find((l) => l.startsWith("NVDA,"));
  assert.ok(nvda, "VALIN needs NVDA");
  const beta = parseFloat(nvda.split(",")[4]);
  assert.ok(beta > 1 && beta < 2.5, "NVDA demo beta should look like a high-beta chip stock, got " + beta);

  // PEER: >400 members with GICS sector names
  assert.ok(csv.PEER.split("\n").length > 401, "peer needs >400 rows");
  assert.ok(/,Information Technology,Y,/.test(csv.PEER));

  // 4. Internal consistency: the live quote block comes from the same series as the charts.
  await src.fetchCsv("HISTORY"); // populates the live-quote globals, like the page does
  const G = typeof window !== "undefined" ? window : globalThis;
  assert.ok(G.PT_LIVE && G.PT_LIVE.NVDA, "PT_LIVE.NVDA set");
  assert.strictEqual(G.PT_LIVE.NVDA.px, 186.4); // the seeded price target
  assert.ok(G.PT_LIVE.NVDA.prev > 0 && G.PT_LIVE.NVDA.hi52 >= G.PT_LIVE.NVDA.px);
  assert.ok(Math.abs(G.PT_LIVE.NVDA.day - (G.PT_LIVE.NVDA.px / G.PT_LIVE.NVDA.prev - 1)) < 0.0005, "day change consistent with prev close (fraction units, like the app)");
  assert.ok(Array.isArray(G.PT_VAL_SKIPPED) && G.PT_VAL_SKIPPED.length === 0, "demo shows its full valuation set");

  // Extras: all-time highs + FX for every non-cash holding.
  const ex = D.extras();
  assert.strictEqual(ex.fx.usdthb, 34.25);
  assert.strictEqual(ex.fx.hkdusd, 0.1282);
  const hold = D.holdingsDoc();
  assert.strictEqual(hold.items.length, 14);
  for (const it of hold.items) {
    if (it.tk !== "CASH") assert.ok(ex.ath[it.tk] && ex.ath[it.tk].v > 0, "ATH missing for " + it.tk);
  }

  // 5. Market docs + collections exist and carry the simulated markers.
  const macro = await src.getDoc("meta/macro");
  assert.ok(macro && macro.cpiYoY.length === 180 && /imulated/i.test(macro.notes + " " + macro.source));
  const fred = await src.getDoc("meta/fredhist");
  assert.strictEqual(Object.keys(fred.series).length, 8); // the 8 regime series the HMM consumes
  const cftc = await src.getDoc("meta/cftc");
  for (const k of ["ES_AM", "ES_LF", "NQ_AM", "NQ_LF"]) {
    const rows = cftc.series[k].split(";").filter(Boolean);
    const sum = rows.reduce((acc, r) => acc + Number(r.split(",")[1]) + Number(r.split(",")[2]), 0);
    assert.strictEqual(cftc.check[k], sum, "cftc checksum " + k); // the page warns when these mismatch
  }
  const f13 = await src.getDoc("meta/f13");
  assert.ok(f13.latest && f13.latest.one && f13.backtest && f13.sample.length > 30);

  const news = await src.getCollection("news");
  assert.strictEqual(news.length, 4);
  assert.ok(/imulated/.test(news[0].data.macro), "demo news is labelled simulated");
  const fund = await src.getCollection("fund");
  assert.strictEqual(fund.length, 13); // 10 US stocks + SMH(nav) + PTT.BK/0700.HK missing-docs
  const rev = await src.getCollection("rev");
  assert.strictEqual(rev.length, 3); // today + -35d + -91d (revision trend needs the old snapshots)
  const etf = await src.getCollection("etf");
  assert.strictEqual(etf.length, 30);
  const ins = await src.getCollection("ins");
  assert.strictEqual(ins.length, 1);
  assert.strictEqual(ins[0].data.check.n, ins[0].data.cluster.length); // the page's integrity check
  assert.strictEqual(ins[0].data.check.value, ins[0].data.cluster.reduce((s, c) => s + c.value, 0));

  // 6. Demo holdings live in the demo namespace, never the real account docs.
  assert.ok(String(D._ns ? D._ns() : "ptpub.v1.demo.").startsWith("ptpub.v1.demo."));

  console.log("demo ok");
})().catch((e) => { console.error(e); process.exit(1); });
