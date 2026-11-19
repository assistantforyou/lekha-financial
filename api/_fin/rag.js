// Personal knowledge base for the research agent: the user's holdings, settings and saved
// valuations are embedded (Gemini, 768 dims) and stored in Supabase pgvector
// (table pt_rag_docs + function pt_rag_match, created by api/_fin/rag.sql).
// Retrieval is owner-scoped and read-only at query time; the LLM still answers only from the
// numbered evidence the agent builds (these chunks arrive as evidence, so the number checker applies).
const { sb } = require("../_lib");
const { listState } = require("../_state");

const EMBED_MODEL = () => process.env.EMBED_MODEL || "gemini-embedding-001";
const DIMS = 768;
const MAX_CHUNK = 1800;      // characters per chunk
const MAX_DOCS = 40;         // chunks kept per owner
const TTL_MS = 6 * 3600e3;   // rebuild the knowledge base at most every 6 hours per owner

const haveKey = () => !!process.env.GEMINI_API_KEY;
const enc = encodeURIComponent;

function chunk(text, size = MAX_CHUNK) {
  const clean = String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const out = [];
  for (let i = 0; i < clean.length; i += size) out.push(clean.slice(i, i + size));
  return out.filter((c) => c.length > 40);
}

function money(v) {
  const n = Number(v);
  if (!isFinite(n)) return "–";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function pct(v) { const n = Number(v); return isFinite(n) ? (n * 100).toFixed(2) + "%" : "–"; }

// Turn one stored document into human-readable, retrieval-friendly text.
function docText(key, data) {
  if (!data || typeof data !== "object") return null;
  if (/^holdings\//.test(key)) {
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return null;
    const total = items.reduce((a, h) => a + (Number(h.qty) || 0) * (Number(h.px) || 0), 0);
    const lines = items.map((h) => {
      const val = (Number(h.qty) || 0) * (Number(h.px) || 0);
      const cost = Number(h.cost) || (Number(h.qty) || 0) * (Number(h.avg) || 0);
      const pnl = cost ? (val - cost) / cost : null;
      return `${h.tk || h.ticker} (${h.theme || "unclassified"}, ${h.cur || "USD"}): ${h.qty} units at cost ${money(cost)}, last price ${money(h.px)}` +
        `, value ${money(val)}${total ? ", " + ((val / total) * 100).toFixed(2) + "% of the book" : ""}${pnl != null ? ", unrealized P&L " + pct(pnl) : ""}${h.acct ? ", account " + h.acct : ""}.`;
    });
    return `My portfolio holds ${items.length} positions (USD/THB ${data.usdthb || 34.25}, HKD/USD ${data.hkdusd || 0.1282}).\n` + lines.join("\n");
  }
  if (/^val\/settings$/.test(key)) {
    const kv = Object.entries(data).slice(0, 40).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    return "My valuation assumptions and discount-rate settings:\n" + kv.join("\n");
  }
  if (/^settings\//.test(key)) {
    const kv = Object.entries(data).filter(([, v]) => typeof v !== "object").slice(0, 40).map(([k, v]) => `${k}: ${v}`);
    return `My saved ${key.replace("settings/", "")} preferences:\n` + kv.join("\n");
  }
  if (/^valhist\//.test(key)) {
    const rows = Array.isArray(data.rows) ? data.rows.slice(-12) : [];
    if (!rows.length) return null;
    return `My saved valuation history for ${key.replace("valhist/", "")}:\n` + rows.map((r) => JSON.stringify(r)).join("\n");
  }
  if (/^snapshots\//.test(key)) {
    const items = Array.isArray(data.items) ? data.items.slice(0, 60) : [];
    if (!items.length) return null;
    return `A saved portfolio snapshot (${key.replace("snapshots/", "")}):\n` + items.map((s) => JSON.stringify(s)).join("\n");
  }
  if (/^quant\//.test(key)) {
    return `A saved quant result (${key.replace("quant/", "")}):\n` + JSON.stringify(data).slice(0, 2000);
  }
  return null;
}

async function embed(texts, taskType = "RETRIEVAL_DOCUMENT") {
  if (!haveKey()) throw Object.assign(new Error("embeddings_not_configured"), { status: 503 });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL()}:batchEmbedContents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      requests: texts.map((text) => ({ model: `models/${EMBED_MODEL()}`, content: { parts: [{ text }] }, taskType, outputDimensionality: DIMS })),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.embeddings) throw Object.assign(new Error("embed_failed_" + r.status), { status: 502 });
  return j.embeddings.map((e) => e.values);
}

const vec = (values) => "[" + values.map((x) => Number(x).toFixed(6)).join(",") + "]";

// Build the owner's chunks from their stored account documents.
async function build(owner) {
  const docs = await listState(owner).catch(() => []);
  const chunks = [];
  for (const d of docs) {
    const text = docText(d.key, d.data);
    if (!text) continue;
    for (const c of chunk(text)) chunks.push({ ref: `${d.key}#${chunks.length}`, kind: d.key.split("/")[0], title: d.key, content: c });
  }
  return chunks.slice(0, MAX_DOCS);
}

async function lastSync(owner) {
  const r = await sb(`pt_rag_docs?owner=eq.${enc(owner)}&select=updated_at&order=updated_at.desc&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] ? Date.parse(rows[0].updated_at) : null;
}

// Re-embed and replace the owner's rows. Cheap enough to run on demand (one embeddings request).
async function sync(owner, { force = false } = {}) {
  if (!owner) throw Object.assign(new Error("no_owner"), { status: 400 });
  const at = await lastSync(owner);
  if (!force && at && Date.now() - at < TTL_MS) return { ok: true, skipped: true, chunks: null, at: new Date(at).toISOString() };
  const chunks = await build(owner);
  if (!chunks.length) return { ok: true, chunks: 0, note: "No holdings or settings are stored for this account yet." };
  const vectors = await embed(chunks.map((c) => c.content));
  await sb(`pt_rag_docs?owner=eq.${enc(owner)}`, { method: "DELETE" });
  const rows = chunks.map((c, i) => ({ owner, kind: c.kind, ref: c.ref, title: c.title, content: c.content, embedding: vec(vectors[i]), meta: { dims: DIMS, model: EMBED_MODEL() } }));
  const r = await sb("pt_rag_docs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
  if (!r.ok) throw Object.assign(new Error("rag_write_failed_" + r.status), { status: 502 });
  return { ok: true, chunks: rows.length, at: new Date().toISOString() };
}

async function retrieve(owner, question, k = 5) {
  if (!owner || !haveKey()) return [];
  try {
    const [q] = await embed([String(question).slice(0, 800)], "RETRIEVAL_QUERY");
    const r = await sb("rpc/pt_rag_match", { method: "POST", body: JSON.stringify({ p_owner: owner, p_query: vec(q), p_k: k }) });
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).filter((x) => x && x.similarity > 0.25);
  } catch (e) { return []; }
}

module.exports = { sync, retrieve, build, embed, docText, chunk, lastSync, haveKey, EMBED_MODEL, DIMS };
