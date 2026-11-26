"use strict";
// In-app inbox: how a scheduled run reaches the user. There is no e-mail
// provider in this project, so proactive output is stored here and read by
// the app (`GET /api/ai/inbox`).
//
// Document `ai/inbox`: { items: [{id,kind,title,body,symbol,createdAt,read,dedupe}], updatedAt }
// Kinds: alert, earnings, digest, brief.

let store = require("../_state");
const setStore = (s) => { store = s; };
const KEY = "ai/inbox";
const MAX = 100, MAX_BODY = 6000;

const clean = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const uid = (ctx) => (ctx && ctx.userId && ctx.userId !== "demo" ? String(ctx.userId) : null);
const today = () => new Date().toISOString().slice(0, 10);
const rid = () => "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function load(userId) {
  const rows = await store.listState(userId).catch(() => []);
  const row = (rows || []).find((r) => r.key === KEY);
  const d = row && row.data && typeof row.data === "object" ? row.data : {};
  return { items: Array.isArray(d.items) ? d.items.filter((x) => x && x.id) : [], updatedAt: d.updatedAt || null };
}

async function save(userId, items) {
  const data = { items: items.slice(0, MAX), updatedAt: new Date().toISOString() };
  await store.putState(userId, [{ key: KEY, data }]);
  return data;
}

// `dedupe` makes a scheduled run idempotent: the same alert on the same day is
// written once, however many times the job runs.
async function add(userId, item) {
  if (!userId || userId === "demo") throw new Error("Inbox needs a signed-in account.");
  const doc = await load(userId);
  const title = clean(item.title, 160), body = clean(item.body, MAX_BODY);
  if (!title) throw new Error("Inbox item needs a title");
  const dedupe = clean(item.dedupe, 120) || `${item.kind || "note"}:${item.symbol || ""}:${today()}`;
  if (doc.items.some((x) => x.dedupe === dedupe && String(x.createdAt || "").slice(0, 10) === today())) return null;
  const row = { id: rid(), kind: clean(item.kind, 20) || "note", title, body, symbol: item.symbol ? clean(item.symbol, 12).toUpperCase() : null, createdAt: new Date().toISOString(), read: false, dedupe };
  await save(userId, [row, ...doc.items]);
  return row;
}

async function markRead(userId, { id, all } = {}) {
  const doc = await load(userId);
  const items = doc.items.map((x) => (all || x.id === id ? { ...x, read: true } : x));
  await save(userId, items);
  return items.filter((x) => !x.read).length;
}

async function remove(userId, id) {
  const doc = await load(userId);
  const items = doc.items.filter((x) => x.id !== id);
  await save(userId, items);
  return doc.items.length !== items.length;
}

const TOOLS = {
  read_inbox: { desc: "Read the signed-in user's in-app inbox: alerts that fired, earnings reminders and daily digests from scheduled runs.", args: { limit: "number?" }, run: async ({ limit }, ctx) => {
    const id = uid(ctx);
    if (!id) throw new Error("The inbox needs a signed-in account.");
    const doc = await load(id), items = doc.items.slice(0, Math.min(Number(limit) || 10, 30));
    return { label: "Inbox", source: "Your scheduled runs", asOf: doc.updatedAt || new Date().toISOString(), kind: "fact", lines: items.length ? items.map((x) => `${x.read ? "" : "[unread] "}${String(x.createdAt).slice(0, 10)} ${x.title}${x.symbol ? " (" + x.symbol + ")" : ""}`) : ["The inbox is empty."], data: { items, unread: items.filter((x) => !x.read).length } };
  } },
};

module.exports = { KEY, MAX, load, save, add, markRead, remove, TOOLS, setStore, uid };
