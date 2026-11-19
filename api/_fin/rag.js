// Personal knowledge base for the research agent: the user's own documents plus long-form
// filings, embedded (Gemini, 768 dims) into Supabase pgvector.
//
// Two lanes, deliberately: exact facts stay with the data tools; this module only stores prose
// that a tool cannot return verbatim (holdings/account documents, saved reports, filing text).
// Retrieved chunks arrive at the agent as numbered evidence, so the number checker still applies.
//
// Schema + hybrid search function: api/_fin/rag.sql (run once in Supabase).
const { sb } = require("../_lib");
const { listState } = require("../_state");

const EMBED_MODEL = () => process.env.EMBED_MODEL || "gemini-embedding-001";
const DIMS = 768;
const CHUNK = 2600;          // characters (~650 tokens)
const OVERLAP = 260;
const MAX_CHUNKS_PER_DOC = 60;
const DOCS_TTL_MS = 6 * 3600e3;   // account documents
const FILING_TTL_MS = 30 * 864e5; // filings

const haveKey = () => !!process.env.GEMINI_API_KEY;
const enc = encodeURIComponent;

function chunkText(text, size = CHUNK, overlap = OVERLAP) {
  const clean = String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= size) return clean.length > 80 ? [clean] : [];
  const out = [];
  for (let i = 0; i < clean.length; i += size - overlap) out.push(clean.slice(i, i + size));
  return out.filter((c) => c.trim().length > 80);
}

const money = (v) => { const n = Number(v); return isFinite(n) ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "–"; };
const pct = (v) => { const n = Number(v); return isFinite(n) ? (n * 100).toFixed(2) + "%" : "–"; };

// One stored account document -> retrieval-friendly prose.
function docText(key, data) {
  if (!data || typeof data !== "object") return null;
  if (/^holdings\//.test(key)) {
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return null;
    const total = items.reduce((a, h) => a + (Number(h.qty) || 0) * (Number(h.px) || 0), 0);
    return `My portfolio holds ${items.length} positions (USD/THB ${data.usdthb || 34.25}, HKD/USD ${data.hkdusd || 0.1282}).\n` + items.map((h) => {
      const val = (Number(h.qty) || 0) * (Number(h.px) || 0), cost = Number(h.cost) || (Number(h.qty) || 0) * (Number(h.avg) || 0), pnl = cost ? (val - cost) / cost : null;
      return `${h.tk || h.ticker} (${h.theme || "unclassified"}, ${h.cur || "USD"}): ${h.qty} units at cost ${money(cost)}, last price ${money(h.px)}, value ${money(val)}` +
        `${total ? ", " + ((val / total) * 100).toFixed(2) + "% of the book" : ""}${pnl != null ? ", unrealized P&L " + pct(pnl) : ""}${h.acct ? ", account " + h.acct : ""}.`;
    }).join("\n");
  }
  if (/^val\/settings$/.test(key)) return "My valuation assumptions and discount-rate settings:\n" + Object.entries(data).slice(0, 40).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
  if (/^settings\//.test(key)) return `My saved ${key.replace("settings/", "")} preferences:\n` + Object.entries(data).filter(([, v]) => typeof v !== "object").slice(0, 40).map(([k, v]) => `${k}: ${v}`).join("\n");
  if (/^valhist\//.test(key)) { const rows = Array.isArray(data.rows) ? data.rows.slice(-12) : []; return rows.length ? `My saved valuation history for ${key.replace("valhist/", "")}:\n` + rows.map((r) => JSON.stringify(r)).join("\n") : null; }
  if (/^snapshots\//.test(key)) { const items = Array.isArray(data.items) ? data.items.slice(0, 60) : []; return items.length ? `A saved portfolio snapshot (${key.replace("snapshots/", "")}):\n` + items.map((s) => JSON.stringify(s)).join("\n") : null; }
  if (/^quant\//.test(key)) return `A saved quant result (${key.replace("quant/", "")}):\n` + JSON.stringify(data).slice(0, 2000);
  return null;
}

async function embed(texts, taskType = "RETRIEVAL_DOCUMENT") {
  if (!haveKey()) throw Object.assign(new Error("embeddings_not_configured"), { status: 503 });
  const out = [];
  for (let i = 0; i < texts.length; i += 20) {
    const batch = texts.slice(i, i + 20);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL()}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ requests: batch.map((text) => ({ model: `models/${EMBED_MODEL()}`, content: { parts: [{ text }] }, taskType, outputDimensionality: DIMS })) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.embeddings) throw Object.assign(new Error("embed_failed_" + r.status), { status: 502 });
    j.embeddings.forEach((e) => out.push(e.values));
  }
  return out;
}

const vec = (values) => "[" + values.map((x) => Number(x).toFixed(6)).join(",") + "]";

// Generic ingest: [{kind, ref, title, content, ticker?, doc_type?, as_of?, source_url?}]
async function upsert(owner, docs) {
  if (!owner) throw Object.assign(new Error("no_owner"), { status: 400 });
  const list = (docs || []).filter((d) => d && d.content && d.content.trim().length > 80).slice(0, MAX_CHUNKS_PER_DOC);
  if (!list.length) return { ok: true, chunks: 0 };
  const vectors = await embed(list.map((d) => (d.title ? d.title + "\n" : "") + d.content));
  const rows = list.map((d, i) => ({
    owner, kind: d.kind, ref: d.ref, title: d.title || null, content: d.content,
    ticker: d.ticker ? String(d.ticker).toUpperCase() : null,
    doc_type: d.doc_type || d.kind, as_of: d.as_of || null, source_url: d.source_url || null,
    embedding: vec(vectors[i]), meta: { dims: DIMS, model: EMBED_MODEL() }, updated_at: new Date().toISOString(),
  }));
  const r = await sb("pt_rag_docs?on_conflict=owner,ref", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  if (!r.ok) throw Object.assign(new Error("rag_write_failed_" + r.status), { status: 502 });
  return { ok: true, chunks: rows.length };
}

async function buildAccountDocs(owner) {
  const docs = await listState(owner).catch(() => []);
  const out = [];
  for (const d of docs) {
    const text = docText(d.key, d.data);
    if (!text) continue;
    chunkText(text, 1800, 180).forEach((c, i) => out.push({ kind: d.key.split("/")[0], ref: `${d.key}#${i}`, title: d.key, content: c, doc_type: d.key.split("/")[0] }));
  }
  return out.slice(0, 40);
}

async function lastSync(owner, kind = null) {
  const filter = kind ? `&kind=eq.${enc(kind)}` : "";
  const r = await sb(`pt_rag_docs?owner=eq.${enc(owner)}${filter}&select=updated_at&order=updated_at.desc&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] ? Date.parse(rows[0].updated_at) : null;
}

async function sync(owner, { force = false } = {}) {
  const at = await lastSync(owner);
  if (!force && at && Date.now() - at < DOCS_TTL_MS) return { ok: true, skipped: true, at: new Date(at).toISOString() };
  const docs = await buildAccountDocs(owner);
  if (!docs.length) return { ok: true, chunks: 0, note: "No holdings or settings are stored for this account yet." };
  await sb(`pt_rag_docs?owner=eq.${enc(owner)}&kind=in.(holdings,settings,valhist,snapshots,quant)`, { method: "DELETE" });
  const r = await upsert(owner, docs);
  return { ...r, at: new Date().toISOString() };
}

// ---- filings (long prose: the case vectors are actually good at) ----
const UA = () => process.env.SEC_USER_AGENT || "PortfolioTerminal assistantforyou999@gmail.com";
function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}
// 10-K/10-Q section headings, so a chunk keeps its "Item 1A. Risk Factors" context.
function sections(text) {
  const re = /\bItem\s+(\d{1,2}[A-C]?)\.\s+([A-Z][A-Za-z ,/&()-]{3,70})/g, marks = [];
  let m; while ((m = re.exec(text))) marks.push({ at: m.index, title: `Item ${m[1]}. ${m[2].trim()}` });
  if (marks.length < 3) return [{ title: null, body: text }];
  return marks.map((k, i) => ({ title: k.title, body: text.slice(k.at, i + 1 < marks.length ? marks[i + 1].at : text.length) }));
}

async function fetchFilingText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA(), Accept: "text/html,application/xhtml+xml" } });
  if (!r.ok) throw Object.assign(new Error("filing_http_" + r.status), { status: 502 });
  const html = await r.text();
  return htmlToText(html).slice(0, 900_000);
}

async function ingestFilings(owner, symbol, { forms = ["10-K", "10-Q"], perForm = 1 } = {}) {
  const sec = require("./providers/sec");
  const sym = String(symbol || "").toUpperCase();
  const list = await sec.filings(sym, { forms, limit: 20 });
  const pick = forms.flatMap((f) => list.filter((x) => x.form === f).slice(0, perForm));
  let chunks = 0, docs = [];
  for (const f of pick) {
    try {
      const text = await fetchFilingText(f.url);
      const head = `${sym} ${f.form} filed ${f.filingDate} (accession ${f.accession})`;
      for (const s of sections(text)) {
        const body = (s.title ? s.title + "\n" : "") + s.body;
        chunkText(body).slice(0, 24).forEach((c, i) => docs.push({
          kind: "filing", ref: `${sym}:${f.accession}:${i}`, title: `${head}${s.title ? " · " + s.title : ""}`, content: c,
          ticker: sym, doc_type: "filing", as_of: f.filingDate, source_url: f.url,
        }));
      }
    } catch (e) { /* one unreadable filing must not fail the batch */ }
  }
  docs = docs.slice(0, 120);
  let written = 0;
  for (let i = 0; i < docs.length; i += 40) { const r = await upsert(owner, docs.slice(i, i + 40)); written += r.chunks; chunks += r.chunks; }
  return { ok: true, symbol: sym, filings: pick.map((f) => f.form + " " + f.filingDate), chunks: written };
}

async function deleteOwner(owner) {
  if (!owner) return;
  await sb(`pt_rag_docs?owner=eq.${enc(owner)}`, { method: "DELETE" }).catch(() => {});
}

// Hybrid retrieval: vector + full-text fused in Postgres (see pt_rag_match in rag.sql).
async function retrieve(owner, question, k = 5, { ticker = null, kind = null } = {}) {
  if (!owner || !haveKey()) return [];
  try {
    const [q] = await embed([String(question).slice(0, 800)], "RETRIEVAL_QUERY");
    const r = await sb("rpc/pt_rag_match", { method: "POST", body: JSON.stringify({ p_owner: owner, p_query: vec(q), p_qtext: String(question).slice(0, 600), p_k: k, p_ticker: ticker, p_kind: kind }) });
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).filter((x) => x && Number(x.similarity) > 0.012);
  } catch (e) { return []; }
}

module.exports = { sync, retrieve, upsert, buildAccountDocs, ingestFilings, ingestText: (owner, doc) => upsert(owner, [doc]), deleteOwner, docText, chunkText, embed, lastSync, haveKey, EMBED_MODEL, DIMS };
