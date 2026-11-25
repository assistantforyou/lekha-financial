// Retention job for pt_audit: cutoff maths, the CRON_SECRET gate and the DELETE call.
const assert = require("node:assert");

const handler = require("./_h/cron/prune");
const { cutoffIso, RETAIN_DAYS } = handler;

function res() {
  const out = { status: 0, body: null };
  return { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; }, out };
}

(async () => {
  // 1. The cutoff is exactly 90 days before now, in ISO form.
  assert.equal(RETAIN_DAYS, 90);
  assert.equal(cutoffIso(Date.parse("2026-11-22T00:00:00Z")), "2026-08-24T00:00:00.000Z");
  assert.equal(cutoffIso(Date.parse("2026-11-22T00:00:00Z"), 30), "2026-10-23T00:00:00.000Z");

  // 2. No CRON_SECRET configured -> refuse.
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  let r = res();
  await handler({ headers: {} }, r);
  assert.deepEqual([r.out.status, r.out.body], [401, { error: "unauthorized" }]);

  // 3. Wrong bearer -> refuse.
  process.env.CRON_SECRET = "s3cret";
  r = res();
  await handler({ headers: { authorization: "Bearer nope" } }, r);
  assert.equal(r.out.status, 401);

  // 4. Correct bearer -> DELETE older rows and report the cutoff.
  const calls = [];
  const realFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 204 }; };
  r = res();
  await handler({ headers: { authorization: "Bearer s3cret" } }, r);
  global.fetch = realFetch;
  assert.equal(r.out.status, 200);
  assert.equal(r.out.body.ok, true);
  assert.equal(r.out.body.retainDays, 90);
  assert.ok(Date.parse(r.out.body.cutoff) < Date.now());
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/example\.supabase\.co\/rest\/v1\/pt_audit\?ts=lt\./);
  assert.equal(calls[0].opts.method, "DELETE");
  assert.equal(calls[0].opts.headers.Prefer, "return=minimal");

  // 5. A failed DELETE is a 500, not a silent success.
  global.fetch = async () => ({ ok: false, status: 400 });
  r = res();
  await handler({ headers: { authorization: "Bearer s3cret" } }, r);
  global.fetch = realFetch;
  assert.deepEqual([r.out.status, r.out.body], [500, { error: "failed" }]);

  if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  console.log("prune tests ok");
})().catch((e) => { console.error(e); process.exit(1); });
