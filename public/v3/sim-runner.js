/* LEKHA V3 simulation runner: fans chunks of Monte Carlo paths out to module workers and merges their aggregates.
   "LEKHA 1 BILLION SIMULATION ENGINE" is a product name only. One run is capped at MAX_PATHS (1,000,000) real paths, and
   every result reports completedPaths: the number of paths actually simulated and folded into the numbers shown.

   const job = run({ input, paths, seed, onProgress, horizons, chunkSize, workers });
   job.promise -> { summary, aggregate, completedPaths, requestedPaths, stopped, workers, chunks, ms, seed, modelVersion }
   job.stop()  -> terminates the workers; the promise resolves with the chunks finished so far (stopped: true).

   Determinism: the run is cut into fixed chunks (chunk i = paths [i*chunkSize, ...)), each with a seed derived from the base
   seed and i. Aggregates merge exactly in any order, so a finished run depends only on (input, seed, paths, chunkSize,
   horizons), never on how many workers there were or which finished first. A stopped run covers whichever whole chunks
   had finished; its completedPaths is exact. */
import { createAgg, merge, summarize, runChunk, DEFAULT_HORIZONS, MODEL_VERSION } from "./sim-aggregate.js";

export const MAX_PATHS = 1_000_000;
export const CHUNK = 10_000;
export const MAX_WORKERS = 8;
export { MODEL_VERSION, DEFAULT_HORIZONS };

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const cores = () => (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2;
export const workerCount = () => Math.max(1, Math.min(MAX_WORKERS, cores() - 1));

export function run({ input, paths = 100_000, seed, onProgress, horizons = DEFAULT_HORIZONS, chunkSize = CHUNK, workers } = {}) {
  if (!input || !Array.isArray(input.assets)) throw new Error("run: input with assets is required");
  const requestedPaths = Math.max(1, Math.min(MAX_PATHS, Math.floor(Number(paths) || 0)));
  const size = Math.max(1000, Math.min(CHUNK, Math.floor(chunkSize)));
  const baseSeed = (seed != null ? seed : input.seed != null ? input.seed : 1) >>> 0;
  const nChunks = Math.ceil(requestedPaths / size), chunkN = (i) => Math.min(size, requestedPaths - i * size);
  const W = Math.max(1, Math.min(workers || workerCount(), MAX_WORKERS, nChunks));
  const total = createAgg(horizons), t0 = now(), pool = [], inflight = new Map(); // worker -> { idx, done }
  let next = 0, finished = 0, settled = false, summary = summarize(total), resolve, reject, usedWorkers = 0;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });

  const result = (stopped) => ({ summary: summarize(total), aggregate: total, completedPaths: total.n, requestedPaths, stopped, workers: usedWorkers, chunks: { done: finished, total: nChunks, size }, ms: now() - t0, seed: baseSeed, modelVersion: MODEL_VERSION });
  const report = () => {
    if (!onProgress) return;
    let partial = 0; for (const f of inflight.values()) partial += f.done;
    try { onProgress({ completedPaths: total.n, simulatedPaths: total.n + partial, requestedPaths, fraction: (total.n + partial) / requestedPaths, chunksDone: finished, chunks: nChunks, workers: usedWorkers, ms: now() - t0, summary }); } catch (e) { /* a UI error must not kill the run */ }
  };
  const close = () => { for (const w of pool) w.terminate(); pool.length = 0; inflight.clear(); };
  const finish = (stopped) => { if (settled) return; settled = true; close(); resolve(result(stopped)); };
  const fail = (err) => { if (settled) return; settled = true; close(); const e = err instanceof Error ? err : new Error(String(err)); e.partial = result(true); reject(e); };
  const accept = (agg) => { merge(total, agg); finished++; summary = summarize(total); report(); if (finished === nChunks) finish(false); };

  const dispatch = (w) => {
    if (settled) return;
    if (next >= nChunks) { inflight.delete(w); return; }
    const idx = next++; inflight.set(w, { idx, done: 0 });
    w.postMessage({ type: "chunk", idx, seed: baseSeed, n: chunkN(idx) });
  };

  const startInline = () => { // no Worker support: same chunks on this thread, yielding between chunks
    usedWorkers = 0;
    const step = () => { if (settled) return; if (next >= nChunks) return; const idx = next++; try { accept(runChunk(input, { seed: baseSeed, idx, n: chunkN(idx), horizons })); } catch (e) { return fail(e); } setTimeout(step, 0); };
    setTimeout(step, 0);
  };

  let canWork = typeof Worker !== "undefined";
  if (canWork) {
    try {
      for (let i = 0; i < W; i++) {
        const w = new Worker(new URL("./sim-stream.worker.js", import.meta.url), { type: "module" });
        w.onmessage = (e) => {
          const m = e.data; if (settled) return;
          if (m.type === "progress") { const f = inflight.get(w); if (f && f.idx === m.idx) { f.done = m.done; report(); } }
          else if (m.type === "chunk") { inflight.delete(w); accept(m.agg); dispatch(w); }
          else if (m.type === "error") fail(new Error("chunk " + m.idx + ": " + m.message));
        };
        w.onerror = (ev) => { ev.preventDefault && ev.preventDefault(); fail(new Error("worker failed: " + (ev.message || "load error"))); };
        w.postMessage({ type: "init", input, horizons });
        pool.push(w);
      }
      usedWorkers = pool.length;
      for (const w of pool) dispatch(w);
    } catch (e) { close(); canWork = false; }
  }
  if (!canWork) startInline();
  report();

  return { promise, stop: () => finish(true), get completedPaths() { return total.n; } };
}
