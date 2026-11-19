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
  for (let i = 0; i < texts.length; i += 10) {
    const batch = texts.slice(i, i + 10);
    let j = null, last = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL()}:batchEmbedContents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ requests: batch.map((text) => ({ model: `models/${EMBED_MODEL()}`, content: { parts: [{ text }] }, taskType, outputDimensionality: DIMS })) }),
      });
      last = r.status; j = await r.json().catch(() => ({}));
      if (r.ok && j.embeddings) break;
      if (r.status !== 429) break;
      await new Promise((res) => setTimeout(res, 1800 * (attempt + 1)));   /* free-tier rate limit: back off */
    }
    if (!j || !j.embeddings) throw Object.assign(new Error("embed_failed_" + (last || 0)), { status: last === 429 ? 429 : 502 });
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
  /* If embeddings are rate-limited, store the text anyway: full-text search still finds it and the
     next rebuild fills the vectors in. Never lose the document because the embedding quota is short. */
  let vectors = null, degraded = false;
  try { vectors = await embed(list.map((d) => (d.title ? d.title + "\n" : "") + d.content)); }
  catch (e) { if (e.status === 429 || e.status === 503) degraded = true; else throw e; }
  const rows = list.map((d, i) => ({
    owner, kind: d.kind, ref: d.ref, title: d.title || null, content: d.content,
    ticker: d.ticker ? String(d.ticker).toUpperCase() : null,
    doc_type: d.doc_type || d.kind, as_of: d.as_of || null, source_url: d.source_url || null,
    embedding: vectors ? vec(vectors[i]) : null, meta: { dims: DIMS, model: EMBED_MODEL() }, updated_at: new Date().toISOString(),
  }));
  const r = await sb("pt_rag_docs?on_conflict=owner,ref", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  if (!r.ok) throw Object.assign(new Error("rag_write_failed_" + r.status), { status: 502 });
  return { ok: true, chunks: rows.length, ...(degraded ? { degraded: "embeddings rate-limited; stored for full-text search" } : {}) };
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

async function ingestFilings(owner, symbol, { forms = ["10-K", "10-Q", "20-F", "40-F", "6-K", "8-K"], perForm = 1 } = {}) {
  const sec = require("./providers/sec");
  const sym = String(symbol || "").toUpperCase();
  const list = await sec.filings(sym, { forms, limit: 20 });
  const pick = forms.flatMap((f) => list.filter((x) => x.form === f).slice(0, perForm));
  let chunks = 0, docs = [], seq = 0;
  for (const f of pick) {
    try {
      const text = await fetchFilingText(f.url);
      const head = `${sym} ${f.form} filed ${f.filingDate} (accession ${f.accession})`;
      for (const s of sections(text)) {
        const body = (s.title ? s.title + "\n" : "") + s.body;
        chunkText(body).slice(0, 10).forEach((c) => docs.push({
          kind: "filing", ref: `${sym}:${f.accession}:${seq++}`, title: `${head}${s.title ? " · " + s.title : ""}`, content: c,
          ticker: sym, doc_type: /^(8-K|6-K)$/.test(f.form) ? "release" : "filing", as_of: f.filingDate, source_url: f.url,
        }));
      }
    } catch (e) { /* one unreadable filing must not fail the batch */ }
  }
  docs = docs.slice(0, 60);
  let written = 0;
  for (let i = 0; i < docs.length; i += 40) { const r = await upsert(owner, docs.slice(i, i + 40)); written += r.chunks; chunks += r.chunks; }
  return { ok: true, symbol: sym, filings: pick.map((f) => f.form + " " + f.filingDate), chunks: written };
}

// Archive headlines the agent (or the news page) already retrieved. Deduped by URL, so repeated
// runs build a searchable history instead of duplicates. Short items are dropped.
const NEWS_TTL_MS = 180 * 864e5;
async function archiveNews(owner, items, { ticker = null } = {}) {
  try {
    if (!owner || !Array.isArray(items) || !items.length) return { ok: true, chunks: 0 };
    const docs = [];
    for (const it of items.slice(0, 12)) {
      const title = String(it.title || it.headline || "").trim();
      const summary = String(it.summary || it.description || it.snippet || "").trim();
      const url = String(it.url || it.link || "").trim();
      if (title.length < 12) continue;
      const text = [title, summary, it.source ? "Source: " + it.source : "", it.at || it.publishedAt || it.date ? "Published: " + (it.at || it.publishedAt || it.date) : ""].filter(Boolean).join("\n");
      if (text.length < 100) continue;
      const ref = "news:" + (url ? Buffer.from(url).toString("base64").slice(0, 60) : Buffer.from(title).toString("base64").slice(0, 60));
      docs.push({ kind: "news", ref, title: title.slice(0, 160), content: text.slice(0, 1600), ticker: (it.ticker || it.symbol || ticker || "").toUpperCase() || null, doc_type: "news", as_of: (it.at || it.publishedAt || it.date || "").slice(0, 10) || null, source_url: url || null });
    }
    if (!docs.length) return { ok: true, chunks: 0 };
    return await upsert(owner, docs);
  } catch (e) { return { ok: false, chunks: 0 }; }
}

// Demo holdings live in the browser, so the demo client posts its snapshot here and it is stored
// under the demo owner (a per-client id). Nothing personal, nothing shared with other visitors.
async function ingestHoldings(owner, doc) {
  const text = docText("holdings/all", doc);
  if (!text) return { ok: true, chunks: 0 };
  const docs = chunkText(text, 1800, 180).map((c, i) => ({ kind: "holdings", ref: `holdings/all#${i}`, title: "My portfolio", content: c, doc_type: "holdings" }));
  await sb(`pt_rag_docs?owner=eq.${enc(owner)}&kind=eq.holdings`, { method: "DELETE" });
  return upsert(owner, docs);
}

async function deleteOwner(owner) {
  if (!owner) return;
  await sb(`pt_rag_docs?owner=eq.${enc(owner)}`, { method: "DELETE" }).catch(() => {});
}

// Hybrid retrieval: vector + full-text fused in Postgres (see pt_rag_match in rag.sql).
async function pruneNews(owner, keepDays = 180) {
  try { const cut = new Date(Date.now() - keepDays * 864e5).toISOString().slice(0, 10); await sb(`pt_rag_docs?owner=eq.${enc(owner)}&kind=eq.news&as_of=lt.${cut}`, { method: "DELETE" }); } catch (e) {}
}

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

module.exports = { sync, retrieve, upsert, buildAccountDocs, ingestFilings, archiveNews, ingestHoldings, pruneNews, ingestText: (owner, doc) => upsert(owner, [doc]), deleteOwner, docText, chunkText, embed, lastSync, haveKey, EMBED_MODEL, DIMS };
