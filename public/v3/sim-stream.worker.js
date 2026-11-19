/* LEKHA V3 simulation worker (module worker). Receives the model input once, then runs chunks of paths on request.
   Protocol (main -> worker):  { type: "init", input, horizons }   { type: "chunk", idx, seed, n }
             (worker -> main):  { type: "progress", idx, done }     every 1000 paths inside a chunk
                                { type: "chunk", idx, n, ms, agg }  the chunk's sealed aggregate (buffers transferred)
                                { type: "error", idx, message }
   Each chunk's seed is derived from the run's base seed and the chunk index (chunkSeed), so a chunk gives the same
   paths whichever worker runs it. */
import { runChunk, buffers } from "./sim-aggregate.js";

let input = null, horizons;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") { input = m.input; horizons = m.horizons; return; }
  if (m.type !== "chunk") return;
  try {
    const t0 = performance.now();
    const agg = runChunk(input, { seed: m.seed, idx: m.idx, n: m.n, horizons, onProgress: (done) => self.postMessage({ type: "progress", idx: m.idx, done }) });
    self.postMessage({ type: "chunk", idx: m.idx, n: m.n, ms: performance.now() - t0, agg }, buffers(agg));
  } catch (err) {
    self.postMessage({ type: "error", idx: m.idx, message: String((err && err.message) || err) });
  }
};
