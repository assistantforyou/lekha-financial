"use strict";
// Proactive checks and the inbox, against an in-memory store and stubbed data.
const assert = require("assert");
const svc = require("./_fin/service");
const actions = require("./_ai/actions");
const inbox = require("./_ai/inbox");
const alerts = require("./_ai/alerts");

const db = new Map();
const fake = {
  listState: async (u) => [...db.entries()].filter(([k]) => k.startsWith(u + "|")).map(([k, data]) => ({ key: k.slice(u.length + 1), data })),
  putState: async (u, docs) => { for (const d of docs) db.set(u + "|" + d.key, d.data); },
};
actions.setStore(fake); inbox.setStore(fake); alerts.setStore(fake);

const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

(async () => {
  await fake.putState("u1", [
    { key: actions.ALERTS, data: { items: [
      { id: "a1", symbol: "NVDA", kind: "price_above", value: 100, active: true },
      { id: "a2", symbol: "TSM", kind: "news", value: null, active: true },
    ] } },
    { key: "holdings/all", data: { items: [{ tk: "AAPL" }] } },
    { key: actions.WATCH, data: { items: [{ symbol: "NVDA" }] } },
  ]);
  svc.getQuote = async (s) => ({ data: { symbol: s, price: s === "NVDA" ? 120 : 300, changePct: s === "NVDA" ? 4 : 0.5, currency: "USD" } });
  svc.getNews = async () => ({ data: [{ title: "Nvidia wins a new customer", publisher: "Reuters", publishedAt: "2026-11-26", url: "https://example.com/n" }] });
  svc.getEarnings = async (s) => ({ data: [{ symbol: s, date: iso(3), source: "FMP" }] });

  const first = await alerts.checkUser("u1");
  assert.ok(first.added >= 4, `expected alert, news, earnings and digest items, got ${first.added}`);
  const doc = await inbox.load("u1");
  const kinds = doc.items.map((x) => x.kind);
  for (const k of ["alert", "earnings", "digest"]) assert.ok(kinds.includes(k), `missing ${k} item`);
  const price = doc.items.find((x) => x.kind === "alert" && x.symbol === "NVDA");
  assert.ok(/rose above/.test(price.title), price.title);
  assert.ok(/120/.test(price.body), price.body);
  console.log("ok price alert, earnings reminder and digest written");

  const second = await alerts.checkUser("u1");
  assert.strictEqual(second.added, 0, "a second run on the same day must not duplicate items");
  console.log("ok dedupe on re-run");

  const one = doc.items[0];
  const unread = await inbox.markRead("u1", { id: one.id });
  assert.strictEqual(unread, doc.items.length - 1, "marking one item read lowers the unread count");
  const all = await inbox.markRead("u1", { all: true });
  assert.strictEqual(all, 0, "mark all read clears the unread count");
  await inbox.remove("u1", one.id);
  const after = await inbox.load("u1");
  assert.ok(!after.items.some((x) => x.id === one.id), "removed item is gone");
  console.log("ok mark read and delete");

  // News alerts need a news-kind alert, which the first check did not have.
  await fake.putState("u2", [{ key: actions.ALERTS, data: { items: [{ id: "b1", symbol: "TSM", kind: "news", value: null, active: true }] } }]);
  const third = await alerts.checkUser("u2");
  const u2 = await inbox.load("u2");
  assert.ok(u2.items.some((x) => x.kind === "alert" && x.symbol === "TSM"), "news alert should be written");
  assert.ok(third.added >= 1);
  console.log("ok news alert");

  console.log("all proactive checks passed");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
