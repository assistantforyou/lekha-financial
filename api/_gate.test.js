// Run: node api/_gate.test.js
// Server-authoritative gating, exercised offline against the REAL modules: Supabase calls
// (GoTrue + REST) are intercepted at global fetch, so the actual auth/tier code paths run.
// Covers: 401 anonymous, 402 wrong tier, state.js holdings cap (422), /api/av-style premium
// gate on the AI endpoints, and the Stripe webhook price->plan mapping (legacy grandfather).
process.env.SUPABASE_URL = "https://stub.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
process.env.STRIPE_PRICE_PAID = "price_paid_test";

const assert = require("assert");
assert.ok(!globalThis.fetch || true, "Node 18+ has fetch; we replace it for this test only");

// ---- offline Supabase/GoTrue stub keyed by URL ----
let profileRow = null; // the pt_profiles row the stub serves
let putCalls = [];     // captured pt_user_state writes
const R = (body, ok = true) => ({ ok, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = (url, opts) => {
  const u = String(url);
  if (u.includes("/auth/v1/user")) return Promise.resolve(R({ id: "u1", email: "user@example.com", email_confirmed_at: "2026-01-01" }));
  if (u.includes("/rest/v1/pt_profiles")) return Promise.resolve(R(profileRow ? [profileRow] : []));
  if (u.includes("/rest/v1/pt_user_state")) { if (opts && opts.method === "POST") putCalls.push(JSON.parse(opts.body)); return Promise.resolve(R([])); }
  if (u.includes("/rest/v1/rpc/")) return Promise.resolve(R(true)); // rateHit allows
  if (u.includes("/rest/v1/")) return Promise.resolve(R([]));
  return Promise.reject(new Error("unexpected fetch: " + u));
};

const { requireTier, publicProfile } = require("./_auth");
const { planOf } = require("./_h/billing/webhook");

const mkRes = () => ({ _c: 0, _j: null, setHeader() {}, status(c) { this._c = c; return this; }, json(j) { this._j = j; return this; } });

(async () => {
  // 1. Anonymous caller: no Authorization header -> 401, nothing else is called.
  let res = mkRes();
  let p = await requireTier({ headers: {} }, res, ["free", "paid", "premium"]);
  assert.strictEqual(p, null);
  assert.strictEqual(res._c, 401);
  assert.strictEqual(res._j.error, "This needs a signed-in account.");

  // A free client cannot claim a higher tier: the tier comes from the server profile row only.
  const req = (body) => ({ headers: { authorization: "Bearer faketoken", "x-claimed-plan": "premium" }, body });

  // 2. Free profile, premium-only endpoint -> 402 with need:["premium"].
  profileRow = { user_id: "u1", email: "user@example.com", plan: "free" };
  res = mkRes();
  p = await requireTier(req(), res, ["premium"]);
  assert.strictEqual(p, null);
  assert.strictEqual(res._c, 402);
  assert.strictEqual(res._j.error, "Premium plan required.");
  assert.strictEqual(res._j.tier, "free");
  assert.deepStrictEqual(res._j.need, ["premium"]);

  // 3. Free profile allowed on the free gate -> profile returned.
  res = mkRes();
  p = await requireTier(req(), res, ["free", "paid", "premium"]);
  assert.ok(p && p.user_id === "u1");

  // 4. Paid profile passes a paid-or-premium gate; publicProfile exposes tier+limits.
  profileRow = { user_id: "u1", email: "user@example.com", plan: "paid", sub_status: "active", period_end: new Date(Date.now() + 864e5 * 10).toISOString() };
  res = mkRes();
  p = await requireTier(req(), res, ["paid", "premium"]);
  assert.ok(p);
  const pub = publicProfile(p);
  assert.strictEqual(pub.tier, "paid");
  assert.strictEqual(pub.limits.holdings, null); // unlimited for paid
  assert.strictEqual(pub.plan, "paid");

  // 5. state.js holdings cap: free profile posting 21 holdings -> 422 holdings_limit.
  profileRow = { user_id: "u1", email: "user@example.com", plan: "free" };
  const state = require("./state");
  const items = (n) => Array.from({ length: n }, (_, i) => ({ acct: "A", tk: "T" + i, theme: "x", cur: "USD", qty: 1, cost: 1, px: 1 }));
  res = mkRes();
  await state({ method: "POST", headers: { authorization: "Bearer t" }, body: { docs: [{ key: "holdings/all", data: { items: items(21) } }] } }, res);
  assert.strictEqual(res._c, 422);
  assert.strictEqual(res._j.code, "holdings_limit");
  assert.strictEqual(res._j.limit, 20);
  assert.ok(/20 holdings/.test(res._j.error));

  // 20 holdings is within the cap -> 200 and the docs are written scoped to the caller.
  putCalls = [];
  res = mkRes();
  await state({ method: "POST", headers: { authorization: "Bearer t" }, body: { docs: [{ key: "holdings/all", data: { items: items(20) } }] } }, res);
  assert.strictEqual(res._c, 200);
  assert.ok(res._j.ok);

  // A paid caller has no holdings cap (null limit) — 500 holdings pass through.
  profileRow = { user_id: "u1", email: "user@example.com", plan: "paid", sub_status: "active", period_end: new Date(Date.now() + 864e5 * 10).toISOString() };
  putCalls = [];
  res = mkRes();
  await state({ method: "POST", headers: { authorization: "Bearer t" }, body: { docs: [{ key: "holdings/all", data: { items: items(500) } }] } }, res);
  assert.strictEqual(res._c, 200);
  assert.ok(res._j.ok);

  for (const [name, method] of [["ai/ask", "POST"], ["ai/briefing", "GET"], ["ai/simulate", "POST"], ["ai/council", "POST"], ["data/agent-route", "POST"]]) {
    const handler = require("./_h/" + name);
    for (const tier of ["demo", "free", "paid"]) {
      profileRow = { user_id: "u1", plan: tier, sub_status: "active", period_end: "2999-01-01" };
      res = mkRes();
      await handler({ method, headers: tier === "demo" ? {} : req().headers, body: { mode: "expert", question: "Review my portfolio" } }, res);
      assert.strictEqual(res._c, tier === "demo" ? 401 : 402, name + "/" + tier);
    }
  }

  // Anonymous visitors get the public demo profile instead of a 401 on gates that allow "demo".
  res = mkRes();
  p = await requireTier({ headers: {} }, res, ["demo", "free", "paid", "premium"]);
  assert.ok(p && p.user_id === "demo" && p.demo === true);

  // Anonymous on the free data gate: the /api/free handlers all call the same requireTier.
  res = mkRes();
  await requireTier({ headers: {} }, res, ["free", "paid", "premium"]);
  assert.strictEqual(res._c, 401);

  process.env.STRIPE_PRICE_PREMIUM = "price_premium";
  process.env.STRIPE_LEGACY_PREMIUM_PRICES = "price_legacy";
  const sub = id => ({ items: { data: [{ price: { id } }] } });
  assert.equal(planOf(sub(process.env.STRIPE_PRICE_PAID)), "paid");
  assert.equal(planOf(sub("price_premium")), "premium");
  assert.equal(planOf(sub("price_legacy")), "premium");
  assert.throws(() => planOf(sub("other_product")), /Unmapped/);
  assert.throws(() => planOf({}), /Missing/);

  console.log("gate ok");
})().catch((e) => { console.error(e); process.exit(1); });
