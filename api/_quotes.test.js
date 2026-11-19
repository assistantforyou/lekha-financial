// Run: node api/_quotes.test.js
// /api/free/quotes: signed-in only, tickers from the POST body, batched Alpaca snapshots for US names, Yahoo chart meta for
// non-US names, a few seconds of per-symbol cache so many viewers cost one upstream read.
const assert = require("assert");
process.env.SUPABASE_URL = "https://sb.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.ALPACA_API_KEY_ID = "a"; process.env.ALPACA_API_SECRET_KEY = "b";
let alpacaCalls = 0, yahooCalls = 0, authCalls = 0;
global.fetch = async (url) => {
  const u = String(url), json = (o, ok = true) => ({ ok, status: ok ? 200 : 401, json: async () => o });
  if (u.startsWith("https://sb.test/auth/v1/user")) { authCalls++; return json({ id: "u1", email: "t@example.com", email_confirmed_at: "x" }); }
  if (u.includes("data.alpaca.markets/v2/stocks/snapshots")) { alpacaCalls++; assert.ok(/symbols=AAPL%2CMSFT/.test(u) && /feed=iex/.test(u)); return json({ AAPL: { latestTrade: { p: 201.5, t: "2026-11-18T15:00:00Z" }, prevDailyBar: { c: 200 } }, MSFT: { dailyBar: { c: 420, t: "2026-11-18T15:00:00Z" }, prevDailyBar: { c: 415 } } }); }
  if (u.includes("query1.finance.yahoo.com")) { yahooCalls++; return json({ chart: { result: [{ meta: { regularMarketPrice: 415, chartPreviousClose: 410, regularMarketTime: 1795000000 } }] } }); }
  throw new Error("unexpected fetch " + u);
};
const handler = require("./_h/free/quotes");
const call = async (body, token = "tok", method = "POST") => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ method, body, headers: { authorization: token ? "Bearer " + token : "", "x-forwarded-for": "9.9.9.9" } }, res); return res;
};
(async () => {
  assert.strictEqual((await call({ symbols: ["AAPL"] }, "")).code, 401, "no token -> 401");
  assert.strictEqual((await call({}, "tok", "GET")).code, 405);
  const r = await call({ symbols: ["aapl", "MSFT", "CASH", "bad symbol!", "0700.HK"] });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.q.AAPL.px, 201.5); assert.strictEqual(r.body.q.AAPL.prev, 200); assert.strictEqual(r.body.q.MSFT.px, 420, "falls back to the daily bar");
  assert.strictEqual(r.body.q["0700.HK"].src, "yahoo"); assert.ok(["open", "pre", "post", "closed"].includes(r.body.session));
  assert.strictEqual(r.body.q.CASH, undefined);
  const again = await call({ symbols: ["AAPL", "MSFT"] });
  assert.strictEqual(alpacaCalls, 1, "second request inside the cache window does not hit Alpaca"); assert.strictEqual(authCalls, 1, "verified token is remembered briefly");
  assert.strictEqual(again.body.q.AAPL.px, 201.5);
  assert.strictEqual(r.headers["Cache-Control"], "no-store");
  // the public sample portfolio bypass exists only for requests flagged by the server itself
  const { requireTier } = require("./_auth");
  const mk = () => ({ code: null, status(c) { this.code = c; return this; }, json() { return this; } });
  const ok = await requireTier({ __demoPublic: true, headers: {} }, mk(), ["paid"]); assert.strictEqual(ok.plan, "paid");
  const r2 = mk(); assert.strictEqual(await requireTier({ headers: {}, body: { __demoPublic: true }, query: { __demoPublic: "true" } }, r2, ["paid"]), null); assert.strictEqual(r2.code, 401, "a client cannot set the flag");
  console.log("quotes tests ok");
})().catch((e) => { console.error(e); process.exit(1); });
