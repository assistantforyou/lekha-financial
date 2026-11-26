// Deterministic checks for the per-user memory store: no network, in-memory replacement.
const assert = require("assert");
const memory = require("./_ai/memory");

const db = new Map();
memory.setStore({
  listState: async (userId) => [...db.entries()].filter(([k]) => k.startsWith(userId + "|")).map(([k, data]) => ({ key: k.split("|")[1], data })),
  putState: async (userId, docs) => { for (const d of docs) db.set(userId + "|" + d.key, d.data); },
});

const U = "u-1";
(async () => {
  await memory.add(U, { text: "Prefers semiconductor exposure", kind: "pref" });
  const again = await memory.add(U, { text: "prefers semiconductor exposure!", kind: "pref" });
  assert.equal(again, null, "near-duplicates collapse");
  await memory.add(U, { text: "TSMC is the main foundry for Apple", kind: "fact", symbol: "TSM" });

  let doc = await memory.load(U);
  assert.equal(doc.items.length, 2);
  const block = await memory.block(U);
  assert.ok(block.includes("TSM: TSMC is the main foundry"), "block carries the symbol");
  assert.ok(block.includes("Prefers semiconductor exposure"));

  assert.deepEqual(memory.capture("what is Apple's revenue"), [], "no memory from an ordinary question");
  const c1 = memory.capture("remember that I only invest in companies with positive free cash flow");
  assert.equal(c1.length, 1);
  assert.equal(c1[0].kind, "pref");
  assert.ok(/^I only invest/.test(c1[0].text));
  const c2 = memory.capture("note that TSMC reports in US dollars");
  assert.equal(c2.length, 1);
  assert.equal(c2[0].kind, "fact");
  assert.equal(memory.capture("keep in mind that the book is Thailand-heavy").length, 1);
  assert.equal(memory.capture("I don't invest in tobacco").length, 1);

  const removed = await memory.remove(U, { text: "TSMC is the main foundry" });
  assert.equal(removed, true);
  doc = await memory.load(U);
  assert.equal(doc.items.length, 1);

  const anon = memory.TOOLS.remember_this.run({ text: "x" }, {});
  await assert.rejects(async () => anon, /signed-in/);
  await assert.rejects(async () => memory.TOOLS.get_memory.run({}, { userId: "demo" }), /signed-in/);

  const tools = require("./_ai/tools");
  const names = Object.keys(tools.catalog());
  for (const n of ["remember_this", "forget_memory", "get_memory", "add_to_watchlist", "get_transcript"]) assert.ok(names.includes(n), "catalog missing " + n);
  assert.ok(names.length >= 32, "catalog unexpectedly small: " + names.length);
  console.log("all memory checks passed (" + names.length + " tools)");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
