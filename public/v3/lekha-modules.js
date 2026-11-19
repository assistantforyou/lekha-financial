/* LEKHA V3 feature modules (ES modules): Intelligent Simulation, LLM Council, Holdings Deep Analysis.
   Each module is optional: a missing or failing module leaves an explicit notice, never a blank pane. */
const slots = [
  ["lekha-sim", "/v3/lekha-sim.js", "Intelligent Simulation"],
  ["lekha-council", "/v3/lekha-council.js", "LLM Council"],
  ["lekha-deep", "/v3/lekha-deep.js", "Holdings Deep Analysis"],
];
for (const [id, src, name] of slots) {
  const host = document.getElementById(id);
  if (!host) continue;
  import(src).then((m) => m.mount && m.mount(host)).catch((e) => {
    console.warn("[v3] module not available:", src, e && e.message);
    host.innerHTML = `<div class="panel"><div class="ph"><h2>${name}</h2></div><div class="empty">This V3 module is not built yet in this checkout (see V3_HANDOFF.md).</div></div>`;
  });
}
