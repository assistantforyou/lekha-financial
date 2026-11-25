// Read-only public surfaces; calc runs pure arithmetic. The local load check is opt-in.
import assert from "node:assert/strict";
const origin = new URL(process.argv[2] || "http://127.0.0.1:3456").origin;
const local = ["127.0.0.1", "localhost"].includes(new URL(origin).hostname);
const request = (path, opts = {}) => fetch(origin + path, {
  redirect: "error", signal: AbortSignal.timeout(10000), ...opts,
  headers: {
    ...opts.headers,
    ...(process.env.VERCEL_ENV === "preview" && origin.startsWith("https://") &&
      origin === process.env.SITE_URL && process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
  },
});
for (const path of ["/", "/login.html", "/auth-callback.html", "/v2", "/v3"]) {
  const r = await request(path);
  assert.equal(r.status, 200, path);
  assert.match(await r.text(), /LEKHA|Portfolio Terminal/i, path);
}
const health = await request("/api/free/health");
assert.equal(health.status, 200);
assert.equal((await health.json()).ok, true);
const calc = async () => {
  const r = await request("/api/data/calc", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn: "margin", args: [20, 100] }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).value, 0.2);
};
await calc();
console.log("PASS application, login, callback, classic routes, API liveness and financial calculation");
if (process.argv.includes("--local-load")) {
  assert.ok(local, "Load check is restricted to localhost");
  const samples = [];
  for (let batch = 0; batch < 3; batch++) {
    await Promise.all(Array.from({ length: 6 }, async () => {
      const start = performance.now();
      await calc();
      samples.push(performance.now() - start);
    }));
  }
  samples.sort((a,b) => a-b);
  console.log("18/18 calculations passed at concurrency 6; p95 " + Math.ceil(samples[Math.ceil(samples.length * .95) - 1]) + " ms");
}
