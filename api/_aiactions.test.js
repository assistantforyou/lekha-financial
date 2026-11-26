"use strict";
// Unit tests for the user-action tools: watchlist, alerts and notes.
// The real store writes to the signed-in account, so these tests inject a map.
const assert = require("assert");
const actions = require("./_ai/actions");

const doc = new Map();
const mem = {
  listState: async (userId) => [...doc.entries()].filter(([k]) => k.startsWith(userId + "|")).map(([k, v]) => ({ key: k.split("|")[1], data: v })).sort((a, b) => (a.key < b.key ? 1 : -1)),
  putState: async (userId, docs) => { for (const d of docs) doc.set(userId + "|" + d.key, d.data); },
};
actions.setStore(mem);
const ctx = { userId: "u-1" };
const T = actions.TOOLS;
const check = (name, fn) => { fn(); console.log("ok " + name); };

(async () => {
  // Watchlist: add, replace, list, remove.
  let r = await T.add_to_watchlist.run({ symbol: "nvda", name: "NVIDIA" }, ctx);
  assert.match(r.lines[0], /Added NVDA/);
  assert.strictEqual(r.data.count, 1);
  await T.add_to_watchlist.run({ symbol: "NVDA" }, ctx);
  let list = await T.get_watchlist.run({}, ctx);
  assert.strictEqual(list.data.items.length, 1, "same symbol must not duplicate");
  await T.add_to_watchlist.run({ symbol: "AAPL", name: "Apple" }, ctx);
  list = await T.get_watchlist.run({}, ctx);
  assert.deepStrictEqual(list.data.items.map((x) => x.symbol), ["AAPL", "NVDA"], "newest first");
  check("watchlist add, dedupe, list", () => {});
  r = await T.remove_from_watchlist.run({ symbol: "aapl" }, ctx);
  assert.match(r.lines[0], /1 symbols remain/);

  // Alerts: price needs a value, kinds are validated, delete deactivates.
  await assert.rejects(() => T.create_alert.run({ symbol: "AAPL", kind: "price_above" }, ctx), /numeric value/);
  await assert.rejects(() => T.create_alert.run({ symbol: "AAPL", kind: "moon" }, ctx), /price_above/);
  r = await T.create_alert.run({ symbol: "AAPL", kind: "price_above", value: "400" }, ctx);
  assert.match(r.lines[0], /rises above 400/);
  const id = r.data.id;
  r = await T.create_alert.run({ symbol: "NVDA", kind: "news" }, ctx);
  assert.strictEqual(r.data.value, null);
  let alerts = await T.get_alerts.run({}, ctx);
  assert.strictEqual(alerts.data.items.length, 2);
  await T.delete_alert.run({ id }, ctx);
  alerts = await T.get_alerts.run({}, ctx);
  assert.deepStrictEqual(alerts.data.items.map((x) => x.symbol), ["NVDA"], "deleted alert is not listed");
  check("alerts create, validate, list, delete", () => {});

  // Notes: short text rejected, search matches symbol or body.
  await assert.rejects(() => T.save_note.run({ text: "short" }, ctx), /note text/);
  await T.save_note.run({ symbol: "TSM", text: "CoWoS capacity is the constraint for 2027", source: "earnings call" }, ctx);
  await T.save_note.run({ text: "Watch gross margin guide" }, ctx);
  let notes = await T.get_notes.run({ query: "tsm" }, ctx);
  assert.strictEqual(notes.data.items.length, 1);
  notes = await T.get_notes.run({ query: "margin" }, ctx);
  assert.strictEqual(notes.data.items.length, 1);
  assert.strictEqual(notes.data.items[0].symbol, null);
  check("notes save, reject short, search", () => {});

  // Demo and anonymous visitors cannot write to someone's book.
  await assert.rejects(() => T.add_to_watchlist.run({ symbol: "AAPL" }, { userId: "demo" }), /signed-in/);
  await assert.rejects(() => T.get_alerts.run({}, {}), /signed-in/);
  check("demo and anonymous are refused", () => {});

  // The key shape matches what the browser syncs (settings/watchlist).
  assert.strictEqual(actions.WATCH, "settings/watchlist");
  assert.ok([...doc.keys()].every((k) => /^u-1\|(settings\/watchlist|ai\/alerts|ai\/notes)$/.test(k)));
  check("storage keys", () => {});

  console.log("\n_all action checks passed_".replace(/_/g, ""));
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
