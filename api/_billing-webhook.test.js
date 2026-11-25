process.env.AUDIT_DISABLED = "1"; // the test scripts every Supabase call in order; the audit write is covered by _audit.test.js
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { Readable } = require("node:stream");
const { test } = require("node:test");
const billing = require("./billing");

Object.assign(process.env, {
  STRIPE_SECRET_KEY: "test-key", STRIPE_WEBHOOK_SECRET: "test-secret", STRIPE_PRICE_PAID: "price_paid", STRIPE_PRICE_PREMIUM: "price_premium",
  SUPABASE_URL: "https://db.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-key",
});

function fixture(t) {
  const account = { user_id: "account-1", stripe_customer_id: "cus_1", plan: "free" };
  const sub = {
    id: "sub_1", customer: "cus_1", status: "active", metadata: { user_id: account.user_id },
    items: { data: [{ price: { id: "price_paid" }, current_period_end: 1900000000 }] },
  };
  const requests = [];
  const store = {
    write(url, body, headers) {
      const key = sub.metadata.user_id ? "user_id" : "stripe_customer_id";
      assert.equal(url.searchParams.get(key), "eq." + account[key]);
      if (url.searchParams.has("or") && account.stripe_subscription_id && account.stripe_subscription_id !== body.stripe_subscription_id) {
        assert.equal(url.searchParams.get("or"), "(stripe_subscription_id.is.null,stripe_subscription_id.eq." + sub.id + ")");
        return Response.json([]);
      }
      Object.assign(account, body);
      if (headers.Prefer === "return=minimal") return new Response(null, { status: 204 });
      assert.equal(headers.Prefer, "return=representation");
      const fields = url.searchParams.get("select").split(",");
      return Response.json([Object.fromEntries(fields.map(field => [field, account[field]]))]);
    },
  };
  t.mock.method(global, "fetch", async (input, init) => {
    const url = new URL(input);
    requests.push(url.pathname);
    if (url.origin === "https://api.stripe.com" && url.pathname === "/v1/subscriptions/sub_1" && init.method === "GET") {
      return Response.json(sub);
    }
    assert.equal(url.href.split("?")[0], "https://db.invalid/rest/v1/pt_profiles");
    if (!init.method) return Response.json([account]);
    assert.equal(init.method, "PATCH");
    return store.write(url, JSON.parse(init.body), init.headers);
  });

  async function deliver(type = "checkout.session.completed", signatureSecret = "test-secret") {
    const object = type === "checkout.session.completed"
      ? { mode: "subscription", subscription: sub.id, client_reference_id: account.user_id }
      : { id: sub.id, status: "active", customer: sub.customer };
    const body = JSON.stringify({ id: "evt_" + type, type, data: { object } });
    const time = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", signatureSecret).update(time + "." + body).digest("hex");
    const req = Readable.from([Buffer.from(body)]);
    Object.assign(req, { method: "POST", headers: { "stripe-signature": "t=" + time + ",v1=" + digest }, query: { __r: "webhook" } });
    const res = { status(code) { this.code = code; return this; }, json(data) { this.body = data; } };
    await billing(req, res);
    return res.code;
  }
  return { account, sub, store, requests, deliver };
}

test("checkout and duplicate delivery persist the same paid entitlement", async t => {
  const { account, deliver } = fixture(t);
  for (let delivery = 0; delivery < 2; delivery++) {
    assert.equal(await deliver(), 200);
    assert.equal(account.plan, "paid");
    assert.equal(account.stripe_subscription_id, "sub_1");
    assert.equal(account.stripe_customer_id, "cus_1");
    assert.equal(account.sub_status, "active");
    assert.equal(account.period_end, new Date(1900000000 * 1000).toISOString());
  }
});

for (const [failure, write] of [
  ["Supabase 503", () => new Response(null, { status: 503 })],
  ["network exception", () => { throw new TypeError("network unavailable"); }],
  ["zero updated profiles", () => Response.json([])],
  ["wrong updated profile", () => Response.json([{ user_id: "other" }])],
]) {
  test(failure + " returns a retryable error and redelivery can succeed", async t => {
    const { store, deliver, account, requests } = fixture(t);
    const persist = store.write;
    store.write = write;
    assert.equal(await deliver(), 500);
    assert.deepEqual(requests, ["/v1/subscriptions/sub_1", "/rest/v1/pt_profiles"]);
    assert.equal(account.plan, "free");
    store.write = persist;
    assert.equal(await deliver(), 200);
    assert.equal(account.plan, "paid");
  });
}

test("customer-keyed creation, upgrade, cancellation and a late update use current Stripe state", async t => {
  const { account, sub, deliver } = fixture(t);
  delete sub.metadata.user_id;
  assert.equal(await deliver("customer.subscription.created"), 200);
  assert.equal(account.plan, "paid");
  sub.items.data[0].price.id = "price_premium";
  assert.equal(await deliver("customer.subscription.updated"), 200);
  assert.equal(account.plan, "premium");
  sub.items.data[0].price.id = "price_paid";
  assert.equal(await deliver("customer.subscription.updated"), 200);
  assert.equal(account.plan, "paid");
  sub.status = "canceled";
  assert.equal(await deliver("customer.subscription.deleted"), 200);
  assert.equal(account.plan, "free");
  assert.equal(await deliver("customer.subscription.updated"), 200);
  assert.equal(account.plan, "free");
  assert.equal(account.sub_status, "canceled");
});

test("invalid signature is rejected before contacting Stripe or Supabase", async t => {
  const { deliver, requests } = fixture(t);
  assert.equal(await deliver("checkout.session.completed", "invalid-secret"), 400);
  assert.deepEqual(requests, []);
});

test("a superseded subscription cancellation leaves the replacement entitlement intact", async t => {
  const { account, sub, deliver } = fixture(t);
  Object.assign(account, { plan: "premium", stripe_subscription_id: "sub_replacement", sub_status: "active" });
  sub.status = "canceled";
  assert.equal(await deliver("customer.subscription.deleted"), 200);
  assert.equal(account.plan, "premium");
  assert.equal(account.stripe_subscription_id, "sub_replacement");
});
