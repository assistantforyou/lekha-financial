// Tests for app/src/lib/chartmath.js (ESM, loaded via dynamic import).
const assert = require("assert"), path = require("path"), { pathToFileURL } = require("url");
(async () => {
  const m = await import(pathToFileURL(path.join(__dirname, "../app/src/lib/chartmath.js")).href);
  const bars = Array.from({ length: 300 }, (_, i) => { const d = new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10), c = 100 + i; return [d, c, c + 1, c - 1, c, 1000 + i]; });
  // sma
  const s = m.sma([1, 2, 3, 4, 5], 3); assert.deepStrictEqual(s, [null, null, 2, 3, 4]);
  // range slicing: N bars of change need N+1 closes
  assert.strictEqual(m.sliceRange(bars, { bars: 5 }).length, 6);
  assert.strictEqual(m.sliceRange(bars, { bars: Infinity }).length, 300);
  // YTD includes prior-year last close
  const y = m.sliceRange(bars, { ytd: true }, new Date(Date.UTC(2025, 9, 1))); assert.strictEqual(y[0][0], "2025-01-01"); // first bar is already Jan 1, no prior bar
  const y2 = m.sliceRange(bars, { ytd: true }, new Date(Date.UTC(2026, 0, 15))); assert.strictEqual(y2.length, 1); // no 2026 bars -> last bar only
  // return
  assert.ok(Math.abs(m.windowReturn([["a", 0, 0, 0, 100, 0], ["b", 0, 0, 0, 110, 0]]) - 0.1) < 1e-12);
  assert.strictEqual(m.windowReturn([["a", 0, 0, 0, 0, 0], ["b", 0, 0, 0, 5, 0]]), null);
  // rebase: both start at 100; benchmark gap (holiday) carries forward
  const a = [["2025-01-01", 0, 0, 0, 50, 0], ["2025-01-02", 0, 0, 0, 55, 0], ["2025-01-03", 0, 0, 0, 60, 0]];
  const b = [["2025-01-01", 0, 0, 0, 200, 0], ["2025-01-03", 0, 0, 0, 220, 0]];
  const r = m.rebasePair(a, b), near = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-9); assert.ok(near(r.a, [100, 110, 120])); assert.ok(near(r.b, [100, 100, 110]));
  assert.strictEqual(m.rebasePair(a, []), null);
  // key stats
  const k = m.keyStats(bars); assert.strictEqual(k.prevClose, 398); assert.strictEqual(k.hi52, 400); assert.strictEqual(k.lo52, 147); // lowest low over the last 252 bars
  assert.ok(k.avgVolume > 0 && k.fromHigh <= 0);
  // drawdown
  assert.ok(Math.abs(m.maxDrawdown([100, 120, 90, 130]) - (90 / 120 - 1)) < 1e-12);
  // intraday ranges: bars are used as fetched; timestamps are classified and labelled
  const ib = [["2026-11-20T14:35:00Z", 1, 2, 0.5, 1.5, 10], ["2026-11-20T14:40:00Z", 1.5, 2, 1, 1.8, 20]];
  assert.strictEqual(m.sliceRange(ib, { intra: 1 }).length, 2);
  assert.ok(m.RANGES.find((r) => r.k === "1D").intra === 1 && m.RANGES.find((r) => r.k === "5D").intra === 5);
  assert.ok(m.isIntraday("2026-11-20T14:35:00Z") && !m.isIntraday("2026-11-20"));
  assert.ok(/\d{2}:\d{2}/.test(m.barLabel("2026-11-20T14:35:00Z", true)) && /20 Nov/.test(m.barLabel("2026-11-20")));
  assert.ok(Math.abs(m.windowReturn(ib) - 0.2) < 1e-12);
  console.log("chartmath tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
