const assert = require("node:assert/strict");
const Module = require("node:module");
const load = Module._load;
let builds = 0;
Module._load = function (id) {
  if (id === "../../_lib") return {rateHit: async () => true};
  if (id === "../../_history") return {clientId: () => "fixture", history: (_, res) => res.status(200).send("fixture-" + ++builds)};
  return load.apply(this, arguments);
};
const handler = require("./_h/free/demo");
const get = async () => {
  const res = {setHeader() {}, status() {return this;}, send(value) {this.body = value;}};
  await handler({query:{k:"HISTORY"},headers:{}},res);
  return res.body;
};
(async () => {
  let now = 1;
  Date.now = () => now;
  assert.equal(await get(), "fixture-1");
  assert.equal(await get(), "fixture-1");
  now += 11 * 60000;
  assert.deepEqual(await Promise.all([get(), get()]), ["fixture-2", "fixture-2"]);
  assert.equal(builds, 2);
})().catch(e => {console.error(e); process.exitCode = 1;});
