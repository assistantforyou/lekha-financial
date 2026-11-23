// Run: node api/_entitlements.test.js
// The Free / Paid / Premium feature matrix (api/_data/entitlements.json), exercised offline against the REAL
// handlers. Supabase (GoTrue + REST) is intercepted at global fetch, so the actual auth and tier code runs; every
// other host is refused, so nothing leaves this machine. These are MOCKED integration tests: they prove the server
// code paths, not a deployed environment.
process.env.SUPABASE_URL = "https://stub.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
delete process.env.ZAI_API_KEY; delete process.env.GEMINI_API_KEY; // no model call can happen

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// ---- offline stub ----
const DAY = 864e5;
let profileRow = null;      // pt_profiles row for the signed-in caller
let stateRows = [];         // pt_user_state rows the stub serves
let rate = true;            // pt_rate_hit answer
const seen = [];            // every Supabase URL requested
const rateCalls = [];       // {p_key, p_limit}
const R = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith("https://stub.example/")) return Promise.reject(new Error("offline test: refused " + u));
  seen.push(u);
  if (u.includes("/auth/v1/user")) {
    const auth = (opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || "";
    if (auth === "Bearer good") return Promise.resolve(R({ id: "u1", email: "user@example.com", email_confirmed_at: "2026-01-01" }));
    return Promise.resolve(R({ error: "bad jwt" }, false, 401));
  }
  if (u.includes("/rest/v1/pt_profiles")) return Promise.resolve(R(profileRow ? [profileRow] : []));
  if (u.includes("/rest/v1/pt_user_state")) return Promise.resolve(R(stateRows));
  if (u.includes("/rest/v1/rpc/pt_rate_hit")) { rateCalls.push(JSON.parse(opts.body)); return Promise.resolve(R(rate)); }
  if (u.includes("/rest/v1/rpc/")) return Promise.resolve(R(true));
  return Promise.resolve(R([]));
};

const { requireFeature, publicProfile } = require("./_auth");
const T = require("./_tiers");

const future = new Date(Date.now() + 30 * DAY).toISOString();
const PROFILES = {
  free: { user_id: "u1", email: "user@example.com", plan: "free" },
  paid: { user_id: "u1", email: "user@example.com", plan: "paid", sub_status: "active", period_end: future },
  premium: { user_id: "u1", email: "user@example.com", plan: "premium", sub_status: "active", period_end: future },
  premiumExpired: { user_id: "u1", email: "user@example.com", plan: "premium", sub_status: "active", period_end: new Date(Date.now() - 3 * DAY).toISOString() },
  premiumCanceled: { user_id: "u1", email: "user@example.com", plan: "premium", sub_status: "canceled", period_end: future },
  premiumPastDue: { user_id: "u1", email: "user@example.com", plan: "premium", sub_status: "past_due", period_end: future },
  premiumUnpaid: { user_id: "u1", email: "user@example.com", plan: "premium", sub_status: "unpaid", period_end: future },
  paidTrialing: { user_id: "u1", email: "user@example.com", plan: "paid", sub_status: "trialing", period_end: future },
};
const mkRes = () => ({ _c: 200, _j: undefined, _sent: undefined, h: {},
  setHeader(k, v) { this.h[String(k).toLowerCase()] = v; }, status(c) { this._c = c; return this; },
  json(j) { this._j = j; return this; }, send(b) { this._sent = b; return this; }, end() { return this; } });
// forged client claims ride along on every signed-in request: none of them may change the decision
const forged = { "x-claimed-plan": "premium", "x-plan": "premium", "x-tier": "premium", "x-lekha-demo-key": "f".repeat(64), cookie: "plan=premium" };
const reqFor = (who, extra = {}) => ({
  method: extra.method || "GET", query: extra.query || {}, body: { plan: "premium", tier: "premium", is_admin: true, ...(extra.body || {}) },
  headers: who === "anon" ? { ...forged } : { authorization: who === "badtoken" ? "Bearer forged.jwt.value" : "Bearer good", ...forged },
});
async function call(handler, who, extra) {
  profileRow = PROFILES[who] || null;
  const res = mkRes();
  await handler(reqFor(who, extra), res);
  return res;
}

const csv = require("./_h/free/csv/[key].js");
const collection = require("./_h/free/collection/[name].js");
const doc = require("./_h/free/doc.js");
const demo = require("./_h/free/demo.js");
const state = require("./state");
const rag = require("./rag");

(async () => {
  // ---- 1. datasets that feed only restricted screens: who may read them, and that they never sit in a shared cache
  const GATED = [
    ["csv ROTATION", csv, { query: { key: "ROTATION" } }, "paid"],
    ["csv RISK", csv, { query: { key: "RISK" } }, "paid"],
    ["csv VOLATILITY", csv, { query: { key: "VOLATILITY" } }, "paid"],
    ["csv BREADTH", csv, { query: { key: "BREADTH" } }, "paid"],
    ["csv OBOS", csv, { query: { key: "OBOS" } }, "paid"],
    ["csv PEER", csv, { query: { key: "PEER" } }, "paid"],
    ["csv FACTOR", csv, { method: "POST", query: { key: "FACTOR" }, body: { symbols: ["AAPL"] } }, "paid"],
    ["csv VALIN", csv, { method: "POST", query: { key: "VALIN" }, body: { symbols: ["AAPL"] } }, "paid"],
    ["collection news", collection, { query: { name: "news" } }, "paid"],
    ["collection fund", collection, { method: "POST", query: { name: "fund" }, body: { symbols: ["AAPL"] } }, "paid"],
    ["collection rev", collection, { method: "POST", query: { name: "rev" }, body: { symbols: ["AAPL"] } }, "paid"],
    ["doc vixeq_hist", doc, { query: { path: "meta/vixeq_hist" } }, "paid"],
  ];
  for (const [name, h, extra] of GATED) {
    let r = await call(h, "anon", extra);
    assert.strictEqual(r._c, 401, name + " anonymous");
    assert.strictEqual(r.h["cache-control"], "private, no-store", name + " 401 must not be cacheable");
    r = await call(h, "badtoken", extra);
    assert.strictEqual(r._c, 401, name + " forged token");
    for (const who of ["free", "premiumExpired", "premiumCanceled", "premiumPastDue", "premiumUnpaid"]) {
      r = await call(h, who, extra);
      assert.strictEqual(r._c, 402, `${name} ${who}`);
      assert.strictEqual(r._j.tier, "free", `${name} ${who} resolves to free whatever the stored plan and forged headers say`);
      assert.deepStrictEqual(r._j.need, ["paid", "premium"]);
      assert.ok(r._j.feature && r._j.plan === "paid", name + " names the feature and the plan");
      assert.strictEqual(r.h["cache-control"], "private, no-store");
    }
    for (const who of ["paid", "paidTrialing", "premium"]) {
      r = await call(h, who, extra);
      assert.ok(![401, 402, 403].includes(r._c), `${name} ${who} passes the gate (got ${r._c})`);
      assert.strictEqual(r.h["cache-control"], "private, no-store", `${name} ${who}: an entitled answer never goes to a shared cache`);
    }
  }

  // ---- 2. shared Free data keeps its existing entitlement
  let r = await call(doc, "anon", { query: { path: "meta/macro" } });
  assert.ok(![401, 402].includes(r._c), "macro doc stays public (Free macro dashboard / regime)");
  r = await call(doc, "anon", { query: { path: "meta/fgi" } });
  assert.ok(![401, 402].includes(r._c), "Fear & Greed stays public (Free regime and overview summary)");
  r = await call(collection, "anon", { query: { name: "etf" } });
  assert.ok(![401, 402].includes(r._c), "etf collection stays public");
  r = await call(csv, "anon", { method: "POST", query: { key: "HISTORY" }, body: { symbols: ["AAPL"] } });
  assert.strictEqual(r._c, 401, "HISTORY still needs an account");
  r = await call(csv, "free", { method: "POST", query: { key: "HISTORY" }, body: { symbols: ["AAPL"] } });
  assert.ok(![401, 402].includes(r._c), "HISTORY stays Free (portfolio overview, holdings, risk)");

  // ---- 3. the public sample-portfolio endpoint serves only Free-level data
  for (const k of ["VALIN", "FACTOR", "fund", "rev"]) {
    const res = mkRes();
    await demo({ query: { k }, headers: {} }, res);
    assert.strictEqual(res._c, 404, "demo endpoint no longer serves " + k);
  }
  // and its synthetic request can never unlock a feature, even though requireTier gives it paid-depth history
  for (const f of Object.keys(T.FEATURES)) {
    const res = mkRes();
    assert.strictEqual(await requireFeature({ __demoPublic: true, headers: {} }, res, f), null, f);
    assert.strictEqual(res._c, 402);
  }

  // ---- 4. AI endpoints per tier (mode expert = the analyst chat on /api/data/agent)
  const AI = [
    ["ai/ask", "POST", ["paid", "premium"]], ["ai/briefing", "GET", ["paid", "premium"]],
    ["ai/simulate", "POST", ["premium"]], ["ai/council", "POST", ["premium"]], ["data/agent-route", "POST", ["paid", "premium"]],
  ];
  for (const [name, method, allowed] of AI) {
    const h = require("./_h/" + name);
    for (const who of ["anon", "free", "paid", "premium", "premiumCanceled", "premiumPastDue"]) {
      const tier = who === "anon" ? "demo" : T.tierOf(PROFILES[who]);
      r = await call(h, who, { method, body: { mode: "expert", question: "Review my portfolio" } });
      if (allowed.includes(tier)) assert.ok(![401, 402, 403].includes(r._c), `${name} ${who} passes (got ${r._c})`);
      else assert.strictEqual(r._c, who === "anon" ? 401 : 402, `${name} ${who}`);
    }
  }
  // Council v3 keeps its documented 403 contract below Premium, with no quota spent
  const council3 = require("./_h/ai/council-v3");
  for (const who of ["anon", "free", "paid"]) {
    rateCalls.length = 0;
    r = await call(council3, who, { method: "POST", body: { question: "Is my portfolio too concentrated?" } });
    assert.strictEqual(r._c, 403, "council-v3 " + who);
    assert.strictEqual(r._j.code, "premium_required");
    assert.strictEqual(rateCalls.length, 0, "no quota or model work before the entitlement check");
  }

  // ---- 5. finite quotas per plan
  rate = false;
  r = await call(require("./_h/ai/ask"), "paid", { method: "POST", body: { question: "Which position is my biggest risk?" } });
  assert.strictEqual(r._c, 429);
  assert.strictEqual(r._j.limit, 20);
  assert.ok(/20\/day on Paid/.test(r._j.error));
  assert.strictEqual(rateCalls[rateCalls.length - 1].p_limit, 20);
  r = await call(require("./_h/ai/ask"), "premium", { method: "POST", body: { question: "Which position is my biggest risk?" } });
  assert.strictEqual(rateCalls[rateCalls.length - 1].p_limit, 40);
  r = await call(require("./_h/ai/briefing"), "paid", { method: "GET" });
  assert.strictEqual(r._c, 429);
  assert.strictEqual(rateCalls[rateCalls.length - 1].p_limit, 1);
  r = await call(require("./_h/ai/briefing"), "premium", { method: "GET" });
  assert.strictEqual(rateCalls[rateCalls.length - 1].p_limit, 3);
  rate = true;

  // ---- 6. saved Council reports: withheld from accounts without the Council entitlement, never deleted
  stateRows = [
    { key: "holdings/all", data: { items: [] }, updated_at: "2026-11-23T00:00:00Z" },
    { key: "reports/0a1b", data: { ceo: { verdict: "Hold" }, question: "q" }, updated_at: "2026-11-23T00:00:00Z" },
  ];
  seen.length = 0;
  r = await call(state, "paid", { method: "GET" });
  assert.strictEqual(r._c, 200);
  assert.deepStrictEqual(r._j.docs.map((d) => d.key), ["holdings/all"]);
  assert.deepStrictEqual(r._j.withheld, { reports: 1, feature: "councilReports" });
  assert.ok(seen.some((u) => /pt_user_state\?user_id=eq\.u1&/.test(u)), "state is read for the verified caller only");
  assert.ok(!seen.some((u) => /pt_user_state/.test(u) && !/user_id=eq\.u1/.test(u)), "no other account's state is read");
  r = await call(state, "free", { method: "GET" });
  assert.deepStrictEqual(r._j.docs.map((d) => d.key), ["holdings/all"]);
  r = await call(state, "premium", { method: "GET" });
  assert.deepStrictEqual(r._j.docs.map((d) => d.key), ["holdings/all", "reports/0a1b"]);
  assert.strictEqual(r._j.withheld, undefined);
  r = await call(state, "anon", { method: "GET" });
  assert.strictEqual(r._c, 401);
  stateRows = [];

  // indexing a Council report into the research agent's knowledge base needs the same entitlement
  const ingest = { method: "POST", body: { action: "ingest", kind: "report", text: "x".repeat(200), title: "Council report" } };
  for (const who of ["free", "paid"]) {
    r = await call(rag, who, ingest);
    assert.strictEqual(r._c, 402, "rag report ingest " + who);
    assert.strictEqual(r._j.feature, "councilReports");
  }
  r = await call(rag, "premium", ingest);
  assert.ok(![401, 402].includes(r._c), "premium may index its own report (got " + r._c + ")");

  // the research agent never retrieves saved reports for an account without the entitlement
  const agent = require("./_fin/agent");
  const realRun = agent.run; const runs = [];
  agent.run = async (o) => { runs.push(o); return { answer: "stub", evidence: [] }; };
  const agentRoute = require("./_h/data/agent-route");
  for (const who of ["free", "paid", "premium", "anon"]) await call(agentRoute, who, { method: "POST", body: { question: "What changed in my portfolio?" } });
  assert.deepStrictEqual(runs.map((o) => o.hideReports), [true, true, false, true]);
  agent.run = realRun;

  // ---- 7. /api/auth/me shows the verified features (display only)
  assert.deepStrictEqual(publicProfile(PROFILES.paid).features, T.featuresOf("paid"));
  assert.strictEqual(publicProfile(PROFILES.premiumCanceled).tier, "free");
  assert.ok(Object.values(publicProfile(PROFILES.premiumPastDue).features).every((v) => v === false));
  assert.strictEqual(publicProfile({ ...PROFILES.free, is_admin: true }).features.simulation, true);

  // ---- 8. the client and the server read the same matrix; every restricted route exists in the navigation
  const nav = fs.readFileSync(path.join(__dirname, "../app/src/nav.js"), "utf8");
  const keys = new Set(); let group = null;
  for (const line of nav.split("\n")) {
    const g = /^\s{2}\{ id: "([a-z]+)", title: "[^"]+", icon: \w+, items: \[/.exec(line); if (g) { group = g[1]; continue; }
    const i = /^\s{4}\{ id: "([a-z]+)",/.exec(line); if (i && group) keys.add(group + "/" + i[1]);
  }
  assert.ok(keys.size > 25, "parsed the navigation tree");
  for (const k of Object.keys(T.ROUTES)) assert.ok(keys.has(k), k + " is a real route");
  for (const k of keys) if (/^(simulation|sector)\//.test(k)) assert.ok(T.featureOfRoute(k), k + " is restricted with its section");
  const client = fs.readFileSync(path.join(__dirname, "../app/src/lib/entitlements.js"), "utf8");
  assert.ok(/import ENT from "\.\.\/\.\.\/\.\.\/api\/_data\/entitlements\.json"/.test(client), "the React shell imports the server's matrix");
  const ds = fs.readFileSync(path.join(__dirname, "../public/pt-datasource.js"), "utf8");
  assert.ok(!/PT_TIER = "premium"/.test(ds), "the demo never reports the Premium tier in the browser");

  // ---- 9. downgrade: the same account goes Premium -> Paid (a Stripe update), then every report path closes at once
  stateRows = [
    { key: "holdings/all", data: { items: [] }, updated_at: "2026-11-23T00:00:00Z" },
    { key: "reports/0a1b", data: { ceo: { verdict: "Hold" }, question: "q" }, updated_at: "2026-11-23T00:00:00Z" },
  ];
  r = await call(state, "premium", { method: "GET" });
  assert.ok(r._j.docs.some((d) => d.key === "reports/0a1b"), "Premium sees its report");
  PROFILES.downgraded = { ...PROFILES.premium, plan: "paid" };
  r = await call(state, "downgraded", { method: "GET" });
  assert.deepStrictEqual(r._j.docs.map((d) => d.key), ["holdings/all"], "after the downgrade the report is withheld");
  assert.strictEqual(r.h["cache-control"], "no-store", "state responses are never cached, so no earlier Premium answer can be replayed");
  r = await call(rag, "downgraded", ingest);
  assert.strictEqual(r._c, 402, "cannot re-index a report after the downgrade");
  seen.length = 0; rateCalls.length = 0;
  r = await call(council3, "downgraded", { method: "POST", body: { question: "Is my portfolio too concentrated?" } });
  assert.strictEqual(r._c, 403, "council-v3 refuses the downgraded account");
  assert.ok(!seen.some((u) => /council3|pt_cache|pt_av_cache/.test(u)), "no cached Council answer is even looked up");
  stateRows = [];

  // the research agent's real retrieval path: report chunks never reach the model for an account without the
  // entitlement, and they do not crowd out the account's own documents
  {
    const ragMod = require("./_fin/rag"), keep = { retrieve: ragMod.retrieve, sync: ragMod.sync, archiveNews: ragMod.archiveNews };
    ragMod.retrieve = async (o, q, k) => [1, 2, 3, 4, 5].map((i) => ({ kind: "reports", doc_type: "reports", title: "reports/r" + i, content: "SECRET REPORT " + i }))
      .concat([1, 2, 3].map((i) => ({ kind: "holdings", doc_type: "holdings", title: "holdings/all", content: "holding " + i }))).slice(0, k);
    ragMod.sync = async () => ({}); ragMod.archiveNews = async () => null;
    const prompts = [];
    const llm = { json: async (o) => { if (o.job === "agent-plan") return { calls: [] }; prompts.push(o.user); throw new Error("stop"); } };
    const seenBy = async (hide) => { prompts.length = 0; const out = await agent.run({ question: "What is in my portfolio?", owner: "u1", llm, hideReports: hide }); return prompts.join(" ") + JSON.stringify(out); };
    const hidden = await seenBy(true);
    assert.ok(!/SECRET REPORT/.test(hidden), "no report text reaches the model or the answer");
    assert.ok(/holding 1/.test(hidden) && /holding 3/.test(hidden), "the account's own documents still answer");
    assert.ok(/SECRET REPORT/.test(await seenBy(false)), "an entitled account still retrieves its reports");
    Object.assign(ragMod, keep);
  }

  console.log("entitlements ok");
})().catch((e) => { console.error(e); process.exit(1); });
