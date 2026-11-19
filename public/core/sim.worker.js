import { CouncilRun } from "./engine.js";
self.onmessage = (e) => {
  const run = new CouncilRun(e.data); const t0 = performance.now();
  const loop = () => { const done = run.step(500); self.postMessage({ progress: run.done / run.paths }); if (done) { const r = run.result(); r.ms = performance.now() - t0; self.postMessage({ result: r }); } else setTimeout(loop, 0); };
  loop();
};
