// Run: node api/_simstream.test.js
// V3 streaming simulation: engine.runStream reuses the Council daily-return model, chunk aggregates are deterministic and
// merge in any order, percentiles are ordered and match exact sorting, a stopped run reports its true path count, and the
// existing CouncilRun output is byte-for-byte what it was before runStream was added.
const assert = require("assert");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const imp = (p) => import(pathToFileURL(path.join(__dirname, p)).href);

(async () => {
  const E = await imp("../public/core/engine.js");
  const G = await imp("../public/v3/sim-aggregate.js");
  const R = await imp("../public/v3/sim-runner.js");

  const A = (tk, w0, beta, vol, idio, upside, mom, dd, m1) => ({ tk, w0, beta, vol, idio, upside, mom, dd, m1, tone: 0, mos: null });
  const inp = (extra = true) => ({ seed: 7, paths: 1500, start: 1, cash0: 0.1, market: { vol: 0.16, rf: 0.04, erp: 0.05, mood: 55, vix: 17 },
    assets: [A("AAA", 0.4, 1.6, 0.5, 0.4, 0.2, 0.6, -0.05, 0.04), A("BBB", 0.3, 1.0, 0.25, 0.15, 0.05, 0.1, -0.1, 0), A("CCC", 0.2, 0.5, 0.16, 0.1, 0.1, -0.1, -0.2, -0.03)]
      .concat(extra ? [A("SPY", 0, 1, 0.18, 0.05, null, 0.2, -0.02, 0.01), A("XLE", 0, 0.8, 0.25, 0.2, 0.1, -0.1, -0.1, 0.02)] : []),
    events: [{ kind: "fomc", day: 10, sigma: 0.011, lean: 0.2 }, { kind: "earnings", tk: "AAA", day: 15, sigma: 0.07, lean: -0.3 }, { kind: "cpi", day: 15, sigma: 0.009, lean: -0.1 }, { kind: "earnings", tk: "XLE", day: 80, sigma: 0.05, lean: 0.4 }, { kind: "jobs", day: 200, sigma: 0.008, lean: 0.1 }] });

  // ---- 1. CouncilRun is unchanged: same-seed output hashed before engine.js was edited
  const council = new E.CouncilRun(inp()); while (!council.step(333));
  const snap = crypto.createHash("sha256").update(JSON.stringify(council.result())).digest("hex");
  assert.strictEqual(snap, "1d3d8237382067b8215c9901ea559e9d2fae0c740fdc45db4ff47dc9ba1517ce", "CouncilRun output differs from the pre-change snapshot");
  assert.strictEqual(council.result().personas.fomo.hz["1Y"].p50, 0.04732322692871094);

  // ---- 2. runStream is the same model: with every asset held, it reproduces CouncilRun's "you" persona path for path
  {
    const i = inp(false); i.paths = 300; const r = new E.CouncilRun(i); while (!r.step(300));
    const k = E.PERSONAS.indexOf("you"), got = { 21: [], 252: [] }, ddGot = [];
    E.runStream(i, i.seed, 300, (p, v, dd) => { got[21].push(Math.fround(v[21])); got[252].push(Math.fround(v[252])); ddGot.push(Math.fround(dd[252])); });
    assert.deepStrictEqual(got[21], Array.from(r.fin[0][k]), "21D values match CouncilRun 'you'");
    assert.deepStrictEqual(got[252], Array.from(r.fin[3][k]), "1Y values match CouncilRun 'you'");
    assert.deepStrictEqual(ddGot, Array.from(r.dd[3][k]), "1Y drawdowns match CouncilRun 'you'");
  }

  // ---- 3. same seed -> identical histograms; different chunk index -> different paths
  const H = G.DEFAULT_HORIZONS.map((h) => h.slice());
  const c0 = G.runChunk(inp(), { seed: 99, idx: 0, n: 5000, horizons: H }), c0b = G.runChunk(inp(), { seed: 99, idx: 0, n: 5000, horizons: H });
  for (const k of ["ret", "dd", "fan", "gain", "loss", "loss10", "dd10"]) assert.deepStrictEqual(c0[k], c0b[k], "same seed, same " + k);
  assert.deepStrictEqual(c0.parts, c0b.parts); assert.strictEqual(c0.n, 5000);
  const c1 = G.runChunk(inp(), { seed: 99, idx: 1, n: 5000, horizons: H });
  assert.notDeepStrictEqual(c0.ret, c1.ret, "chunks get distinct seeds");
  assert.notStrictEqual(G.chunkSeed(99, 0), G.chunkSeed(99, 1)); assert.notStrictEqual(G.chunkSeed(99, 0), G.chunkSeed(100, 0));

  // ---- 4. percentiles are monotone, probabilities sane, fan starts at zero
  const s0 = G.summarize(c0);
  const ORDER = ["p5", "p10", "p25", "p50", "p75", "p90", "p95"];
  for (const [code] of H) {
    const h = s0.horizons[code];
    for (let j = 1; j < ORDER.length; j++) assert.ok(h[ORDER[j - 1]] < h[ORDER[j]], code + ": " + ORDER[j - 1] + " < " + ORDER[j]);
    assert.strictEqual(h.median, h.p50); assert.ok(h.sd > 0);
    assert.ok(h.pGain > 0 && h.pGain < 1 && h.pLoss > 0 && Math.abs(h.pGain + h.pLoss - 1) < 1e-3 && h.pLoss10 <= h.pLoss);
    assert.ok(h.var5 === -h.p5 && h.cvar5 >= h.var5, code + ": CVaR is at least VaR");
    assert.ok(h.dd.median >= 0 && h.dd.median <= h.dd.p95 && h.dd.p95 < 1);
  }
  assert.ok(s0.horizons["1Y"].p95 - s0.horizons["1Y"].p5 > s0.horizons["21D"].p95 - s0.horizons["21D"].p5, "spread widens with time");
  assert.deepStrictEqual(s0.horizons["21D"], s0.horizons["1M"], "21D and 1M are both 21 trading days");
  assert.strictEqual(s0.fan[0].day, 0); assert.strictEqual(s0.fan[0].p50, 0); assert.strictEqual(s0.fan[s0.fan.length - 1].day, 252);
  for (const row of s0.fan.slice(1)) for (let j = 1; j < ORDER.length; j++) assert.ok(row[ORDER[j - 1]] <= row[ORDER[j]], "fan day " + row.day + " ordered");
  const last = s0.fan[s0.fan.length - 1], y = s0.horizons["1Y"];
  for (const k of ORDER) assert.strictEqual(last[k], y[k], "fan end = 1Y histogram " + k);

  // ---- 5. histogram percentiles agree with exact sorting (bins are ~0.2% wide)
  {
    const vals = [], dds = [];
    E.runStream(inp(), G.chunkSeed(99, 0), 5000, (p, v, dd) => { vals.push(v[252] - 1); dds.push(dd[252]); });
    vals.sort((a, b) => a - b); dds.sort((a, b) => a - b);
    const q = (s, f) => s[Math.round(f * (s.length - 1))];
    for (const [k, f] of [["p5", 0.05], ["p25", 0.25], ["p50", 0.5], ["p75", 0.75], ["p95", 0.95]]) assert.ok(Math.abs(y[k] - q(vals, f)) < 0.005 * (1 + Math.abs(q(vals, f))), k + " close to exact");
    const m = vals.reduce((s, x) => s + x, 0) / vals.length; assert.ok(Math.abs(y.mean - m) < 1e-12, "mean is exact");
    assert.ok(Math.abs(y.dd.median - q(dds, 0.5)) < 0.002 && Math.abs(y.dd.p95 - q(dds, 0.95)) < 0.002, "drawdown quantiles close to exact");
    const tail = vals.slice(0, 250), cv = -tail.reduce((s, x) => s + x, 0) / tail.length; assert.ok(Math.abs(y.cvar5 - cv) < 0.005, "CVaR5 close to exact");
  }

  // ---- 6. merge order does not matter (exactly), and merging a chunk twice is refused
  const chunks = [0, 1, 2, 3].map((idx) => G.runChunk(inp(), { seed: 5, idx, n: 2000 + idx * 500, horizons: H }));
  const fold = (order) => order.reduce((acc, i) => G.merge(acc, chunks[i]), G.createAgg(H));
  const m1 = fold([0, 1, 2, 3]), m2 = fold([3, 1, 0, 2]), m3 = G.merge(G.merge(G.createAgg(H), G.merge(G.merge(G.createAgg(H), chunks[2]), chunks[0])), G.merge(G.merge(G.createAgg(H), chunks[3]), chunks[1]));
  assert.deepStrictEqual(G.summarize(m1), G.summarize(m2)); assert.deepStrictEqual(G.summarize(m1), G.summarize(m3));
  for (const k of ["ret", "dd", "fan"]) assert.deepStrictEqual(m1[k], m2[k]);
  assert.strictEqual(m1.n, 2000 + 2500 + 3000 + 3500);
  assert.throws(() => G.merge(m1, chunks[0]), /merged twice/);

  // ---- 7. runner (no Worker in node -> same chunks inline): full run = merge of its chunks; cap; true partial count
  assert.strictEqual(typeof Worker, "undefined", "node test runs the inline path");
  {
    const job = R.run({ input: inp(), paths: 12000, seed: 5, chunkSize: 5000 });
    const res = await job.promise;
    assert.strictEqual(res.completedPaths, 12000); assert.strictEqual(res.requestedPaths, 12000); assert.strictEqual(res.stopped, false);
    assert.strictEqual(res.seed, 5); assert.strictEqual(res.modelVersion, G.MODEL_VERSION); assert.ok(res.ms >= 0); assert.strictEqual(res.chunks.total, 3);
    const manual = [0, 1, 2].map((idx) => G.runChunk(inp(), { seed: 5, idx, n: idx < 2 ? 5000 : 2000, horizons: H })).reduce((a, c) => G.merge(a, c), G.createAgg(H));
    assert.deepStrictEqual(res.summary, G.summarize(manual), "runner result = chunks merged");
    const again = await R.run({ input: inp(), paths: 12000, seed: 5, chunkSize: 5000 }).promise;
    assert.deepStrictEqual(again.summary, res.summary, "same seed and count, same answer");
  }
  {
    const capped = R.run({ input: inp(), paths: 5e9, seed: 1 }); capped.stop(); const r = await capped.promise;
    assert.strictEqual(r.requestedPaths, R.MAX_PATHS, "hard cap at 1,000,000 paths"); assert.strictEqual(r.completedPaths, 0); assert.strictEqual(r.stopped, true);
  }
  {
    let job; const seen = [];
    const done = new Promise((ok) => {
      job = R.run({ input: inp(), paths: 40000, seed: 3, chunkSize: 5000, onProgress: (p) => { seen.push(p.completedPaths); if (p.chunksDone === 2) ok(); } });
    });
    await done; job.stop(); const r = await job.promise;
    assert.strictEqual(r.stopped, true); assert.strictEqual(r.completedPaths, 10000, "stopped after two chunks reports exactly 10,000 paths");
    assert.strictEqual(r.summary.n, 10000); assert.strictEqual(r.summary.horizons["1Y"].n, 10000); assert.strictEqual(r.requestedPaths, 40000);
    assert.ok(seen.every((x, i) => i === 0 || x >= seen[i - 1]), "progress never goes backwards");
    await new Promise((ok) => setTimeout(ok, 30)); assert.strictEqual(job.completedPaths, 10000, "no work after stop()");
  }
  console.log("simstream tests ok");
})().catch((e) => { console.error(e); process.exit(1); });
