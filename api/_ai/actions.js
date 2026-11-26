"use strict";
// User actions the assistant can take, not just questions it can answer.
//
// Everything is stored in pt_user_state: the watchlist in `settings/watchlist`
// (the same document the browser syncs, so the app shows it on the next load)
// and alerts and notes under `ai/`. Tools here are user-scoped: `tools.run`
// passes `{ userId }` as the second argument, and without it they say so
// instead of writing to nowhere.

let store = require("../_state");
const setStore = (s) => { store = s; }; // tests inject an in-memory store


const WATCH = "settings/watchlist";
const ALERTS = "ai/alerts";
const NOTES = "ai/notes";
const MAX_NOTES = 200, MAX_ALERTS = 100, MAX_WATCH = 200;

const clean = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const sym = (v) => clean(v, 12).toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
const uid = (ctx) => (ctx && ctx.userId && ctx.userId !== "demo" ? String(ctx.userId) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const big = (v) => { const n = Number(v); if (!Number.isFinite(n)) return "-"; const a = Math.abs(n); if (a >= 1e12) return (n / 1e12).toFixed(2) + "T"; if (a >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (a >= 1e6) return (n / 1e6).toFixed(2) + "M"; return n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };

async function read(userId, key, fallback) {
  const rows = await store.listState(userId).catch(() => []);
  const row = (rows || []).find((r) => r.key === key);
  return row && row.data && typeof row.data === "object" ? row.data : fallback;
}
async function write(userId, key, data) {
  await store.putState(userId, [{ key, data: { ...data, updatedAt: new Date().toISOString() } }]);
}

function need(ctx) {
  const id = uid(ctx);
  if (!id) throw new Error("This action needs a signed-in account. Ask the visitor to sign in first; stored watchlists, alerts and notes do not work in the demo.");
  return id;
}

const KINDS = { price_above: "rises above", price_below: "falls below", news: "has news" };

async function watchAdd({ symbol, name }, ctx) {
  const id = need(ctx), s = sym(symbol);
  if (!s) throw new Error("watchlist_add needs a symbol");
  const doc = await read(id, WATCH, { items: [] });
  const items = Array.isArray(doc.items) ? doc.items.filter((x) => x && x.symbol !== s) : [];
  items.unshift({ symbol: s, name: clean(name, 80) || null, addedAt: new Date().toISOString() });
  await write(id, WATCH, { items: items.slice(0, MAX_WATCH) });
  return { label: `Watchlist: add ${s}`, source: "Your saved watchlist", asOf: new Date().toISOString(), kind: "fact", lines: [`Added ${s}${name ? " (" + clean(name, 80) + ")" : ""} to the watchlist. It now holds ${Math.min(items.length, MAX_WATCH)} symbols.`], data: { symbol: s, count: Math.min(items.length, MAX_WATCH) } };
}

async function watchRemove({ symbol }, ctx) {
  const id = need(ctx), s = sym(symbol);
  const doc = await read(id, WATCH, { items: [] });
  const items = (doc.items || []).filter((x) => x && x.symbol !== s);
  await write(id, WATCH, { items });
  return { label: `Watchlist: remove ${s}`, source: "Your saved watchlist", asOf: new Date().toISOString(), kind: "fact", lines: [`${s} is no longer on the watchlist. ${items.length} symbols remain.`], data: { symbol: s, count: items.length } };
}

async function watchList(args, ctx) {
  const id = need(ctx), doc = await read(id, WATCH, { items: [] }), items = (doc.items || []).slice(0, 40);
  return { label: "Watchlist", source: "Your saved watchlist", asOf: doc.updatedAt || new Date().toISOString(), kind: "fact", lines: items.length ? items.map((x) => `${x.symbol}${x.name ? " " + x.name : ""}${x.addedAt ? " (added " + String(x.addedAt).slice(0, 10) + ")" : ""}`) : ["The watchlist is empty."], data: { items } };
}

async function alertCreate({ symbol, kind, value, note }, ctx) {
  const id = need(ctx), s = sym(symbol), k = clean(kind, 20).toLowerCase().replace(/\s+/g, "_");
  if (!s) throw new Error("alert_create needs a symbol");
  if (!KINDS[k]) throw new Error(`alert_create needs kind price_above, price_below or news (received "${clean(kind, 20)}")`);
  const v = k === "news" ? null : num(value);
  if (k !== "news" && v == null) throw new Error("A price alert needs a numeric value in the quote currency");
  const doc = await read(id, ALERTS, { items: [] });
  const item = { id: "a" + Date.now().toString(36), symbol: s, kind: k, value: v, note: clean(note, 200) || null, createdAt: new Date().toISOString(), active: true };
  await write(id, ALERTS, { items: [item, ...(doc.items || [])].slice(0, MAX_ALERTS) });
  return { label: `Alert: ${s}`, source: "Your saved alerts", asOf: new Date().toISOString(), kind: "fact", lines: [`Alert set: tell me when ${s} ${KINDS[k]}${v == null ? "" : " " + big(v)}. It is checked once a day and appears in your inbox.`], data: item };
}

async function alertList(args, ctx) {
  const id = need(ctx), doc = await read(id, ALERTS, { items: [] }), items = (doc.items || []).filter((x) => x && x.active).slice(0, 40);
  return { label: "Alerts", source: "Your saved alerts", asOf: doc.updatedAt || new Date().toISOString(), kind: "fact", lines: items.length ? items.map((x) => `${x.symbol} ${KINDS[x.kind] || x.kind}${x.value == null ? "" : " " + big(x.value)} (${x.id})`) : ["No active alerts."], data: { items } };
}

async function alertDelete({ id: alertId }, ctx) {
  const userId = need(ctx), doc = await read(userId, ALERTS, { items: [] }), want = clean(alertId, 40);
  const items = (doc.items || []).map((x) => (x && x.id === want ? { ...x, active: false } : x));
  await write(userId, ALERTS, { items });
  return { label: "Alerts", source: "Your saved alerts", asOf: new Date().toISOString(), kind: "fact", lines: [`Alert ${want} is turned off.`], data: { id: want } };
}

async function noteSave({ symbol, text, source }, ctx) {
  const id = need(ctx), body = clean(text, 4000);
  if (body.length < 8) throw new Error("save_note needs the note text");
  const doc = await read(id, NOTES, { items: [] }), s = symbol ? sym(symbol) : null;
  const item = { id: "n" + Date.now().toString(36), symbol: s, text: body, source: clean(source, 300) || null, createdAt: new Date().toISOString() };
  const items = [item, ...(doc.items || [])].slice(0, MAX_NOTES);
  await write(id, NOTES, { items });
  return { label: "Saved note", source: "Your notes", asOf: item.createdAt, kind: "fact", lines: [`Saved${s ? " for " + s : ""}: ${body.slice(0, 160)}${body.length > 160 ? "..." : ""}`], data: { item, count: items.length } };
}

async function noteList({ query }, ctx) {
  const id = need(ctx), doc = await read(id, NOTES, { items: [] }), q = clean(query, 80).toLowerCase();
  const items = (doc.items || []).filter((x) => !q || `${x.symbol || ""} ${x.text}`.toLowerCase().includes(q)).slice(0, 20);
  return { label: "Notes", source: "Your notes", asOf: doc.updatedAt || new Date().toISOString(), kind: "fact", lines: items.length ? items.map((x) => `${String(x.createdAt).slice(0, 10)}${x.symbol ? " " + x.symbol : ""}: ${x.text.slice(0, 220)}`) : ["No matching notes."], data: { items } };
}

// The user's own position in a name, not a market view: quantity, value, weight,
// cost basis and the unrealised result, from the same book the portfolio block uses.
async function compareToPortfolio({ symbol }, ctx) {
  const id = need(ctx), s = sym(symbol), { userContext } = require("../_h/ai/_ctx");
  const ctxBook = await userContext(id);
  const rows = (ctxBook && ctxBook.rows) || [], row = rows.find((r) => r.tk === s);
  const total = ctxBook && ctxBook.total ? ctxBook.total : 0;
  if (!row) {
    const theme = rows.filter((r) => r.theme).slice(0, 6).map((r) => `${r.tk} ${r.theme}`);
    return { label: `Your position in ${s}`, source: "Your saved portfolio", asOf: new Date().toISOString(), kind: "fact", lines: [`You do not hold ${s}.`, theme.length ? `Themes in the book: ${theme.join(", ")}.` : "The book has no holdings with a theme."], data: { symbol: s, held: false } };
  }
  const weight = total ? (row.valUsd / total) * 100 : null, pnl = row.costUsd != null && row.valUsd != null ? row.valUsd - row.costUsd : null;
  return { label: `Your position in ${s}`, source: "Your saved portfolio", asOf: new Date().toISOString(), kind: "calculated", lines: [
    `You hold ${row.qty} ${s}${row.cur && row.cur !== "USD" ? " (" + row.cur + ")" : ""}, worth ${big(row.valUsd)} USD${weight == null ? "" : `, ${weight.toFixed(2)}% of the ${big(total)} USD book`}.`,
    row.costUsd == null ? "No cost basis is saved for this position." : `Cost basis ${big(row.costUsd)} USD${pnl == null ? "" : `, unrealised ${pnl >= 0 ? "+" : ""}${big(pnl)} USD`}.`,
  ], data: { symbol: s, held: true, qty: row.qty, valUsd: row.valUsd, costUsd: row.costUsd, weightPct: weight, pnlUsd: pnl } };
}

const TOOLS = {
  add_to_watchlist: { desc: "Add a symbol to the signed-in user's watchlist, which the app shows on the Watchlist page.", args: { symbol: "string", name: "string?" }, run: watchAdd },
  remove_from_watchlist: { desc: "Remove a symbol from the signed-in user's watchlist.", args: { symbol: "string" }, run: watchRemove },
  get_watchlist: { desc: "List the symbols on the signed-in user's watchlist.", args: {}, run: watchList },
  create_alert: { desc: "Save an alert for the signed-in user: price above, price below, or any news. Alerts are checked by the daily job and delivered to the in-app inbox.", args: { symbol: "string", kind: "string", value: "number?", note: "string?" }, run: alertCreate },
  get_alerts: { desc: "List the signed-in user's active alerts.", args: {}, run: alertList },
  delete_alert: { desc: "Turn off one of the signed-in user's alerts by id.", args: { id: "string" }, run: alertDelete },
  save_note: { desc: "Save a research note for the signed-in user, optionally tied to a symbol, so it can be recalled later.", args: { text: "string", symbol: "string?", source: "string?" }, run: noteSave },
  get_notes: { desc: "Search the signed-in user's saved research notes.", args: { query: "string?" }, run: noteList },
  compare_to_portfolio: { desc: "Show the signed-in user's own position in a symbol: quantity, value, weight, cost basis and unrealised result. Use it when the question is about the user's holding rather than the company.", args: { symbol: "string" }, run: compareToPortfolio },
};

module.exports = { TOOLS, setStore, KINDS, WATCH, ALERTS, NOTES, read, write, uid };
