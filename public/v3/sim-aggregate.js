/* LEKHA V3 simulation: streaming aggregation of Monte Carlo paths. Pure computation, no DOM, no Worker APIs; runs in a
   worker, on the page, or in node. Nothing per-path is kept: every path is folded into fixed-bin histograms as it is made.

   Per horizon: a histogram of log(value) (2500 bins of width 0.002, ~0.2% return resolution, from -95% to +639%, plus an
   underflow and an overflow bin), a histogram of max drawdown (1000 bins over 0..100%), exact counts of gains, losses,
   losses over 10% and drawdowns over 10%, and the path count, sum and sum of squares of the simple return.
   Every 5 trading days (plus the last day): a log(value) histogram for the fan chart.

   Counts are integers, so merge() is exactly order-independent. Sums are floats, so they are kept per chunk and added up in
   chunk-index order by summarize(): the result depends only on which chunks went in, never on the order they arrived.
   Percentiles are read from the histograms by linear interpolation inside a bin; mean and sd are exact. */
import { runStream, STREAM_DAYS, STREAM_MODEL_VERSION } from "../core/engine.js";

export const AGG_VERSION = 1;
export const MODEL_VERSION = STREAM_MODEL_VERSION + "/agg" + AGG_VERSION;
/* trading days; 1M is one trading month (21 sessions), the same length as 21D */
export const DEFAULT_HORIZONS = [["21D", 21], ["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 252]];
export const CHECK = 5;
const LO = -3, HI = 2, BINS = 2500, W = (HI - LO) / BINS, RB = BINS + 2; // log-value bins + underflow (0) + overflow (BINS+1)
const DDB = 1000;
const QS = [["p5", 0.05], ["p10", 0.1], ["p25", 0.25], ["p50", 0.5], ["p75", 0.75], ["p90", 0.9], ["p95", 0.95]];

const checkDays = (days) => { const out = []; for (let d = CHECK; d <= days; d += CHECK) out.push(d); if (out[out.length - 1] !== days) out.push(days); return out; };
const binOf = (v) => { if (!(v > 0)) return 0; const b = 1 + Math.floor((Math.log(v) - LO) / W); return b < 1 ? 0 : b > BINS ? BINS + 1 : b; };

export function createAgg(horizons = DEFAULT_HORIZONS, days = STREAM_DAYS) {
  const H = horizons.length, cp = checkDays(days);
  for (const [, d] of horizons) if (!(d >= 1 && d <= days)) throw new Error("horizon out of range: " + d);
  return {
    v: AGG_VERSION, horizons: horizons.map(([c, d]) => [c, d]), days, cp, n: 0,
    ret: new Uint32Array(H * RB), dd: new Uint32Array(H * DDB),
    gain: new Uint32Array(H), loss: new Uint32Array(H), loss10: new Uint32Array(H), dd10: new Uint32Array(H),
    fan: new Uint32Array(cp.length * RB),
    sum: new Float64Array(H), sumsq: new Float64Array(H), // running sums of the chunk being built (sealed into parts)
    parts: [],                                            // [{ idx, n, seed, sum: number[], sumsq: number[] }]
  };
}

/* fold one path: value[d] = portfolio value after day d (value[0] = 1), dd[d] = max drawdown so far */
export function addPath(a, value, dd) {
  const hz = a.horizons, H = hz.length;
  for (let h = 0; h < H; h++) {
    const d = hz[h][1], v = value[d], r = v - 1, x = dd[d];
    a.ret[h * RB + binOf(v)]++;
    a.dd[h * DDB + Math.min(DDB - 1, Math.max(0, Math.floor(x * DDB)))]++;
    if (v > 1) a.gain[h]++; else if (v < 1) a.loss[h]++;
    if (v < 0.9) a.loss10[h]++;
    if (x > 0.1) a.dd10[h]++;
    a.sum[h] += r; a.sumsq[h] += r * r;
  }
  const cp = a.cp;
  for (let c = 0; c < cp.length; c++) a.fan[c * RB + binOf(value[cp[c]])]++;
  a.n++;
}

/* close the running sums into a chunk record; called once per chunk */
export function seal(a, idx, seed) {
  const n = a.n - a.parts.reduce((s, p) => s + p.n, 0);
  a.parts.push({ idx, n, seed, sum: Array.from(a.sum), sumsq: Array.from(a.sumsq) });
  a.sum.fill(0); a.sumsq.fill(0);
  return a;
}

const sameShape = (a, b) => a.v === b.v && a.days === b.days && JSON.stringify(a.horizons) === JSON.stringify(b.horizons);
/* merge b into a (in place) and return a; order-independent */
export function merge(a, b) {
  if (!sameShape(a, b)) throw new Error("cannot merge aggregates of different shape");
  const have = new Set(a.parts.map((p) => p.idx));
  for (const p of b.parts) if (have.has(p.idx)) throw new Error("chunk merged twice: " + p.idx);
  for (const k of ["ret", "dd", "gain", "loss", "loss10", "dd10", "fan"]) { const x = a[k], y = b[k]; for (let i = 0; i < x.length; i++) x[i] += y[i]; }
  for (let h = 0; h < a.sum.length; h++) { a.sum[h] += b.sum[h]; a.sumsq[h] += b.sumsq[h]; }
  a.parts.push(...b.parts.map((p) => ({ ...p, sum: p.sum.slice(), sumsq: p.sumsq.slice() })));
  a.n += b.n;
  return a;
}

/* typed-array buffers of an aggregate, for postMessage transfer */
export const buffers = (a) => [a.ret, a.dd, a.gain, a.loss, a.loss10, a.dd10, a.fan, a.sum, a.sumsq].map((x) => x.buffer);

/* ---------- reading the histograms ---------- */
function retQuantile(hist, off, n, q) {
  const target = q * n; let cum = 0;
  for (let b = 0; b < RB; b++) {
    const c = hist[off + b]; if (!c) continue;
    if (cum + c >= target) {
      if (b === 0) return Math.exp(LO) - 1;
      if (b === BINS + 1) return Math.exp(HI) - 1;
      const f = Math.min(1, Math.max(0, (target - cum) / c));
      return Math.exp(LO + (b - 1 + f) * W) - 1;
    }
    cum += c;
  }
  return Math.exp(HI) - 1;
}
function ddQuantile(hist, off, n, q) {
  const target = q * n; let cum = 0;
  for (let b = 0; b < DDB; b++) { const c = hist[off + b]; if (!c) continue; if (cum + c >= target) return (b + Math.min(1, Math.max(0, (target - cum) / c))) / DDB; cum += c; }
  return 1;
}
/* mean simple return of the worst q share of paths (bins taken from the bottom, the last one partially) */
function tailMean(hist, off, n, q) {
  const target = q * n; let cum = 0, acc = 0;
  for (let b = 0; b < RB && cum < target; b++) {
    const c = hist[off + b]; if (!c) continue;
    const take = Math.min(c, target - cum), f = take / c;
    const r = b === 0 ? Math.exp(LO) - 1 : b === BINS + 1 ? Math.exp(HI) - 1 : Math.exp(LO + (b - 1 + f / 2) * W) - 1;
    acc += take * r; cum += take;
  }
  return cum > 0 ? acc / cum : 0;
}

/* everything the UI needs, as fractions (0.05 = +5%). var5 / cvar5 are losses, positive = money lost. */
export function summarize(a) {
  const n = a.n, parts = a.parts.slice().sort((x, y) => x.idx - y.idx);
  const sealed = parts.reduce((s, p) => s + p.n, 0);
  const out = { n, horizons: {}, fan: [] };
  if (!n) return out;
  a.horizons.forEach(([code, days], h) => {
    let sum = 0, sumsq = 0; for (const p of parts) { sum += p.sum[h]; sumsq += p.sumsq[h]; }
    if (sealed !== n) { sum += a.sum[h]; sumsq += a.sumsq[h]; }
    const off = h * RB, m = sum / n, o = { days, n };
    for (const [k, q] of QS) o[k] = retQuantile(a.ret, off, n, q);
    o.mean = m; o.median = o.p50; o.sd = n > 1 ? Math.sqrt(Math.max(0, (sumsq - n * m * m) / (n - 1))) : 0;
    o.pGain = a.gain[h] / n; o.pLoss = a.loss[h] / n; o.pLoss10 = a.loss10[h] / n;
    o.var5 = -o.p5; o.cvar5 = -tailMean(a.ret, off, n, 0.05);
    const doff = h * DDB;
    o.dd = { median: ddQuantile(a.dd, doff, n, 0.5), p95: ddQuantile(a.dd, doff, n, 0.95), pOver10: a.dd10[h] / n };
    out.horizons[code] = o;
  });
  out.fan.push({ day: 0, p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 });
  a.cp.forEach((day, c) => { const row = { day }; for (const [k, q] of QS) row[k] = retQuantile(a.fan, c * RB, n, q); out.fan.push(row); });
  return out;
}

/* ---------- one chunk of paths: the unit of work a worker does ---------- */
/* distinct, well-mixed 32-bit seed per chunk (murmur3 finaliser over base seed and chunk index) */
export function chunkSeed(base, idx) {
  let h = (base >>> 0) ^ Math.imul((idx + 1) >>> 0, 0x9E3779B1);
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
  return h >>> 0;
}
/* run paths [idx*size, idx*size+n) of a run: returns a sealed aggregate for exactly this chunk */
export function runChunk(input, { seed, idx, n, horizons = DEFAULT_HORIZONS, onProgress, progressEvery = 1000 }) {
  const a = createAgg(horizons), s = chunkSeed(seed, idx);
  runStream(input, s, n, (p, value, dd) => { addPath(a, value, dd); if (onProgress && (p + 1) % progressEvery === 0 && p + 1 < n) onProgress(p + 1); });
  return seal(a, idx, s);
}
