const assert = require("node:assert/strict");
const { cacheFetch } = require("./_fin/cache");
const lib = require("./_lib");
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
let now = 10000;
Date.now = () => now;
lib.cacheGet = async () => ({payload:"recorded quote", fetchedAt:9100});
const failing = async () => { throw Error("provider unavailable"); };
(async () => {
  const read = () => cacheFetch("quote", "fixture", failing, {ttl:1000, shared:true});
  assert.equal((await read()).ageMs, 900);
  now += 200;
  const r = await read();
  assert.equal(r.stale, true);
  assert.equal(r.ageMs, 1100);
  assert.equal(r.value, "recorded quote");
})().catch(e => {console.error(e);process.exitCode = 1;});
