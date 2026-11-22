const assert = require("assert");
const a = require("./_audit");
assert.strictEqual(a.classify(200), "ok"); assert.strictEqual(a.classify(429), "rate_limited"); assert.strictEqual(a.classify(401), "denied");
assert.strictEqual(a.classify(402), "gated"); assert.strictEqual(a.classify(404), "client_error"); assert.strictEqual(a.classify(502), "server_error");
const e = a.buildEvent({ grp: "data", route: "statements", req: { method: "GET", query: { symbol: "amd", q: "secret question" } }, status: 200, ms: 12.6,
  seen: { code: null, attempts: [{ provider: "fmp", status: "error" }, { provider: "sec", status: "ok" }], cache: "shared" }, userId: "u1", client: "abc" });
assert.deepStrictEqual([e.symbol, e.ms, e.outcome, e.user_id], ["AMD", 13, "ok", "u1"]); assert.deepStrictEqual(e.meta, { provider_errors: ["fmp"], cache: "shared" });
assert.ok(!JSON.stringify(e).includes("secret question"), "request text is never stored");
assert.strictEqual(a.buildEvent({ grp: "data", route: "x", req: { query: { symbol: "bad symbol!" } }, status: 200, ms: 1 }).symbol, null);
assert.strictEqual(a.buildEvent({ grp: "data", route: "a b;c<d>", req: {}, status: 200, ms: 1 }).route, "abcd", "unsafe route chars are stripped");
const rows = [
  { ts: "2026-11-22T08:00:00Z", user_id: "aaaaaaaa-1", grp: "auth", route: "signup", status: 200, outcome: "ok", ms: 100 },
  { ts: "2026-11-22T08:01:00Z", user_id: "aaaaaaaa-1", grp: "data", route: "agent", status: 200, outcome: "ok", ms: 3000 },
  { ts: "2026-11-22T08:02:00Z", user_id: "aaaaaaaa-1", grp: "data", route: "agent", status: 429, outcome: "rate_limited", ms: 20, err: "ai_limit" },
  { ts: "2026-11-22T08:03:00Z", user_id: null, grp: "data", route: "statements", status: 502, outcome: "server_error", ms: 900, err: "no_provider_for_statements" },
];
const s = a.summarize(rows, new Date("2026-11-22T09:00:00Z"));
assert.strictEqual(s.total, 4); assert.strictEqual(s.activeUsers, 1); assert.strictEqual(s.funnel.signedUp, 1); assert.strictEqual(s.funnel.usersWhoAskedAI, 1); assert.strictEqual(s.funnel.usersWhoHitLimit, 1);
assert.strictEqual(s.byRoute[0].route, "data/statements"); assert.strictEqual(s.byRoute[0].errors, 1);
assert.ok(s.topErrors.some((x) => x.code === "ai_limit")); assert.strictEqual(s.byDay[0].serverErrors, 1);
console.log("_audit.test.js ok");

for (const [kind, flags, attempts] of [["fresh", {}, 2], ["cached", {cached:true}, 0], ["shared", {shared:true}, 0]]) {
  const row = a.buildEvent({grp:"ai", route:"council-v3", req:{}, status:200, ms:12,
    seen:{provider:"Gemini", requests:2, fallback:true, ...flags}});
  assert.deepStrictEqual(row.meta,{provider:"Gemini",fallback:true,generation:kind,provider_attempts:attempts});
}
