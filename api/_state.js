// Per-user documents: one row per document path in pt_user_state (server-only table).
// The browser keeps its own copy in localStorage for instant reads; this is the durable copy.
const { sb } = require("./_lib");

// Document paths the app is allowed to persist. Market data is never stored here (it is read-only).
const KEY = /^(?:holdings|valhist|quant|snapshots|reports|chat)\/[A-Za-z0-9._:-]{1,80}$|^val\/settings$|^settings\/[a-z0-9._-]{1,40}$|^ai\/[A-Za-z0-9._:\/-]{1,120}$/;
const MAX_DOC = 512 * 1024;      // one document
const MAX_BATCH = 4 * 1024 * 1024; // one request

const enc = encodeURIComponent;

function validDoc(d) {
  if (!d || typeof d !== "object") return null;
  const key = String(d.key || "");
  if (!KEY.test(key)) return null;
  if (d.data === undefined) return null;
  let body;
  try { body = JSON.stringify(d.data); } catch (e) { return null; }
  if (body == null || body.length > MAX_DOC) return null;
  return { key, data: d.data };
}

// All of a user's documents, newest first.
async function listState(userId) {
  const r = await sb(`pt_user_state?user_id=eq.${userId}&select=key,data,updated_at&order=updated_at.desc`);
  if (!r.ok) throw new Error("state read failed");
  return r.json();
}

// Upsert documents. Returns the keys written.
async function putState(userId, docs) {
  const rows = docs.map((d) => ({ user_id: userId, key: d.key, data: d.data, updated_at: new Date().toISOString() }));
  if (!rows.length) return [];
  const r = await sb("pt_user_state?on_conflict=user_id,key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error("state write failed");
  return rows.map((x) => x.key);
}

async function delState(userId, keys) {
  const good = (keys || []).map(String).filter((k) => KEY.test(k));
  if (!good.length) return [];
  const r = await sb(`pt_user_state?user_id=eq.${userId}&key=in.(${good.map(enc).join(",")})`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!r.ok) throw new Error("state delete failed");
  return good;
}

async function stateCount(userId) {
  const r = await sb(`pt_user_state?user_id=eq.${userId}&select=key`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const cr = r.headers.get("content-range") || "";
  return Number((cr.split("/")[1] || 0)) || 0;
}

module.exports = { KEY, MAX_DOC, MAX_BATCH, validDoc, listState, putState, delState, stateCount };
