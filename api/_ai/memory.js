"use strict";
// Per-user memory that survives a thread.
//
// Two kinds of entry: `fact` (something the user told the assistant to keep) and
// `pref` (a standing preference such as a sector focus or a valuation assumption).
// Memory is loaded into every chat as a fenced block and is never inferred from
// market data; only explicit statements are captured, so the assistant cannot
// slowly invent a profile for the user.
//
// Storage: pt_user_state document `ai/memory`, shape
//   { items: [{ id, text, kind, symbol, createdAt, source }], updatedAt }

let store = require("../_state");
const setStore = (s) => { store = s; };

const KEY = "ai/memory";
const MAX_ITEMS = 60;
const MAX_TEXT = 300;

const clean = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const norm = (v) => clean(v, MAX_TEXT).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
const uid = (ctx) => (ctx && ctx.userId && ctx.userId !== "demo" ? String(ctx.userId) : null);
const stamp = () => new Date().toISOString();
const newId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function load(userId) {
  if (!userId) return { items: [] };
  const rows = await store.listState(userId).catch(() => []);
  const row = (rows || []).find((r) => r.key === KEY);
  const doc = row && row.data && Array.isArray(row.data.items) ? row.data : { items: [] };
  return { items: doc.items.filter((x) => x && x.text).slice(0, MAX_ITEMS), updatedAt: doc.updatedAt || null };
}

async function save(userId, items) {
  await store.putState(userId, [{ key: KEY, data: { items: items.slice(0, MAX_ITEMS), updatedAt: stamp() } }]);
}

// A statement the user asked us to keep. Returns the stored item, or null when
// the sentence is a duplicate or too vague to be useful.
async function add(userId, { text, kind = "fact", symbol = null, source = null } = {}) {
  const body = clean(text, MAX_TEXT);
  if (!body || body.length < 4) return null;
  const doc = await load(userId);
  if (doc.items.some((x) => norm(x.text) === norm(body))) return null;
  const item = { id: newId(), text: body, kind: kind === "pref" ? "pref" : "fact", symbol: symbol ? clean(symbol, 12).toUpperCase() : null, createdAt: stamp(), source: clean(source, 40) || "user" };
  await save(userId, [item, ...doc.items]);
  return item;
}

async function remove(userId, { id, text } = {}) {
  const doc = await load(userId);
  const want = clean(id, 40), body = norm(text);
  const kept = doc.items.filter((x) => {
    if (want) return x.id !== want;
    if (!body) return true;
    // A quoted fragment of a saved line should still delete it; a one-letter query should not.
    return body.length >= 6 ? !norm(x.text).includes(body) : norm(x.text) !== body;
  });
  if (kept.length === doc.items.length) return false;
  await save(userId, kept);
  return true;
}

// Deterministic capture: only sentences the user framed as something to keep.
// No model call, so a passing question never becomes a remembered "fact".
const TRIGGERS = [
  /\b(?:please\s+)?remember(?: that)?\s+(.{6,280})/i,
  /\bkeep in mind(?: that)?\s+(.{6,280})/i,
  /\bnote that\s+(.{6,280})/i,
  /\bfor (?:the record|future reference)[,:]?\s+(.{6,280})/i,
  /\bmy (?:focus|view|assumption|rule) is\s+(.{6,280})/i,
  /\bi (?:do not|don't) (?:invest in|trade|touch)\s+(.{3,120})/i,
  /\bi (?:only|prefer to) (?:invest in|buy|hold)\s+(.{3,120})/i,
];

function capture(question) {
  const q = clean(question, 2000), out = [];
  for (const rx of TRIGGERS) {
    const m = q.match(rx);
    if (!m || !m[1]) continue;
    const text = clean(m[1].replace(/[.?!]+$/, ""), MAX_TEXT);
    const pref = /^(my |i (do not|don't|only|prefer))/i.test(m[0].trim()) || /focus|assumption|rule|prefer|only invest|do not invest|don't invest/i.test(m[0]);
    if (text.length >= 4 && !out.some((x) => norm(x.text) === norm(text))) out.push({ text, kind: pref ? "pref" : "fact" });
  }
  // Overlapping triggers can both fire on one sentence; keep only the widest capture.
  return out.filter((x) => !out.some((y) => y !== x && norm(y.text) !== norm(x.text) && norm(y.text).includes(norm(x.text))));
}

// The block the model sees. Kept short: memory is a hint, not a second portfolio.
async function block(userId) {
  const doc = await load(userId);
  if (!doc.items.length) return "";
  const lines = doc.items.slice(0, 30).map((x) => `- ${x.symbol ? x.symbol + ": " : ""}${x.text}`);
  return lines.join("\n").slice(0, 2400);
}

const TOOLS = {
  remember_this: { desc: "Store a durable fact or preference about this user (a standing focus, a valuation assumption, something they asked you to remember). Use only for statements the user wants kept, never for market data.", args: { text: "string", kind: "string?", symbol: "string?" }, run: async ({ text, kind, symbol }, ctx) => {
    const id = uid(ctx); if (!id) throw new Error("Memory needs a signed-in account.");
    const item = await add(id, { text, kind, symbol, source: "assistant" });
    return { label: "Memory", source: "Your saved memory", asOf: stamp(), kind: "fact", lines: [item ? `Remembered: ${item.text}` : "That is already in memory."], data: { item } };
  } },
  forget_memory: { desc: "Remove a remembered fact or preference by id or by its text.", args: { id: "string?", text: "string?" }, run: async ({ id, text }, ctx) => {
    const userId = uid(ctx); if (!userId) throw new Error("Memory needs a signed-in account.");
    const ok = await remove(userId, { id, text });
    return { label: "Memory", source: "Your saved memory", asOf: stamp(), kind: "fact", lines: [ok ? "Removed from memory." : "No matching memory entry."], data: { removed: ok } };
  } },
  get_memory: { desc: "List what you have been asked to remember about this user.", args: {}, run: async (args, ctx) => {
    const userId = uid(ctx); if (!userId) throw new Error("Memory needs a signed-in account.");
    const doc = await load(userId);
    return { label: "Memory", source: "Your saved memory", asOf: doc.updatedAt || stamp(), kind: "fact", lines: doc.items.length ? doc.items.slice(0, 30).map((x) => `${x.id}${x.symbol ? " " + x.symbol : ""}: ${x.text}`) : ["Nothing is saved in memory yet."], data: { items: doc.items } };
  } },
};

module.exports = { KEY, MAX_ITEMS, load, add, remove, capture, block, TOOLS, setStore, uid };
