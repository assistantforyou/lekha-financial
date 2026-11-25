// Run: node api/_ph.test.js
// The server capture helper must be inert without a key, strip personal or financial fields and never throw.
const assert = require("assert");
const ph = require("./_ph");

(async () => {
  const saved = { key: process.env.POSTHOG_KEY, project: process.env.POSTHOG_PROJECT_KEY, host: process.env.POSTHOG_HOST, off: process.env.POSTHOG_DISABLED };
  try {
    delete process.env.POSTHOG_KEY; delete process.env.POSTHOG_PROJECT_KEY; delete process.env.POSTHOG_HOST; delete process.env.POSTHOG_DISABLED;

    assert.strictEqual(ph.enabled(), false, "no key means disabled");
    assert.strictEqual(await ph.capture("api_request", "u1", { group: "data" }), false, "disabled capture resolves false");
    assert.strictEqual(ph.host(), "https://us.i.posthog.com", "default host is the US ingestion host");

    process.env.POSTHOG_KEY = "phc_test";
    assert.strictEqual(ph.enabled(), true, "a key enables capture");
    process.env.POSTHOG_DISABLED = "1";
    assert.strictEqual(ph.enabled(), false, "POSTHOG_DISABLED=1 wins over the key");
    delete process.env.POSTHOG_DISABLED;
    process.env.POSTHOG_HOST = "https://eu.i.posthog.com/";
    assert.strictEqual(ph.host(), "https://eu.i.posthog.com", "trailing slash is removed");

    const cleaned = ph.clean({
      group: "data", route: "quotes", duration_ms: 12,
      email: "someone@example.com", password: "hunter2", prompt: "should I buy?",
      holdings: [{ symbol: "AAPL" }], balance: 1000, query: "aapl",
      nested: { token: "abc", status: "ok" },
    });
    assert.strictEqual(cleaned.email, undefined, "e-mail dropped");
    assert.strictEqual(cleaned.password, undefined, "password dropped");
    assert.strictEqual(cleaned.prompt, undefined, "prompt dropped");
    assert.strictEqual(cleaned.holdings, undefined, "holdings dropped");
    assert.strictEqual(cleaned.balance, undefined, "balance dropped");
    assert.strictEqual(cleaned.query, undefined, "query dropped");
    assert.strictEqual(cleaned.nested.token, undefined, "nested token dropped");
    assert.strictEqual(cleaned.nested.status, "ok", "safe nested field kept");
    assert.strictEqual(cleaned.group, "data", "route metadata kept");
    assert.strictEqual(cleaned.duration_ms, 12, "numbers kept");

    assert.strictEqual(ph.clean({ note: "x".repeat(400) }).note.length, 160, "long strings truncated");
    assert.strictEqual(ph.clean({ list: Array.from({ length: 30 }, (_, i) => i) }).list.length, 20, "long arrays truncated");
    assert.strictEqual(ph.clean({ a: { b: { c: { email: "deep@example.com" } } } }).a.b.c, undefined, "depth limit drops deep objects");

    console.log("server analytics ok: disabled without a key, personal and financial fields removed");
  } finally {
    for (const [k, v] of Object.entries({ POSTHOG_KEY: saved.key, POSTHOG_PROJECT_KEY: saved.project, POSTHOG_HOST: saved.host, POSTHOG_DISABLED: saved.off })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
})();
