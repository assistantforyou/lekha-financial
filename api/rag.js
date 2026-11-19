// POST /api/rag {action}: the account's personal knowledge base for the research agent.
//   status  -> chunk counts by kind and last sync time (no embeddings)
//   sync    -> rebuild the account documents (holdings, settings, snapshots)
//   filings -> fetch and index the latest 10-K/10-Q text for a ticker (or the top holdings)
//   ingest  -> store one document the client already has (saved council report, imported statement summary)
// Embeddings are owner-scoped; demo visitors have no server-side documents.
const { requireTier } = require("./_auth");
const { rateHit } = require("./_lib");
const { sb } = require("./_lib");
const rag = require("./_fin/rag");

const MAX_TEXT = 20000;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]); if (!p) return;
  res.setHeader("Cache-Control", "no-store");
  const b = req.body && typeof req.body === "object" ? req.body : {}, action = String(b.action || "status");
  if (p.demo) return res.status(200).json({ ok: false, demo: true, note: "Sign in to build a knowledge base from your own holdings.", chunks: 0 });
  const owner = p.user_id;

  if (action === "status") {
    const r = await sb(`pt_rag_docs?owner=eq.${encodeURIComponent(owner)}&select=kind,ticker,updated_at&order=updated_at.desc&limit=1000`);
    const rows = r.ok ? await r.json() : [];
    const by = {};
    rows.forEach((x) => { by[x.kind] = (by[x.kind] || 0) + 1; });
    const tickers = [...new Set(rows.filter((x) => x.ticker).map((x) => x.ticker))].slice(0, 50);
    return res.status(200).json({ ok: true, chunks: rows.length, byKind: by, tickers, lastSync: rows[0] ? rows[0].updated_at : null, embeddings: rag.haveKey() });
  }

  if (action === "sync") {
    if (!(await rateHit(`rag/sync/${owner}/${Math.floor(Date.now() / 6e5)}`, 10).catch(() => true))) return res.status(429).json({ error: "Too many rebuilds. Try again in a few minutes." });
    try { return res.status(200).json(await rag.sync(owner, { force: !!b.force })); }
    catch (e) { return res.status(e.status === 503 ? 503 : 502).json({ error: "The knowledge base could not be rebuilt: " + (e.code || e.status || e.message) }); }
  }

  if (action === "filings") {
    if (!(await rateHit(`rag/filings/${owner}/${Math.floor(Date.now() / 36e5)}`, 6).catch(() => true))) return res.status(429).json({ error: "Too many filing imports this hour." });
    try {
      const tickers = b.ticker ? [String(b.ticker).toUpperCase()] : (Array.isArray(b.tickers) ? b.tickers : []).slice(0, 3).map((t) => String(t).toUpperCase());
      if (!tickers.length) return res.status(400).json({ error: "Name at least one ticker." });
      const out = [];
      for (const t of tickers) { try { out.push(await rag.ingestFilings(owner, t, { forms: Array.isArray(b.forms) && b.forms.length ? b.forms : ["10-K", "10-Q"], perForm: 1 })); } catch (e) { out.push({ symbol: t, ok: false, error: String(e.code || e.status || e.message) }); } }
      return res.status(200).json({ ok: true, results: out, chunks: out.reduce((a, x) => a + (x.chunks || 0), 0) });
    } catch (e) { return res.status(502).json({ error: "Filings could not be indexed: " + (e.code || e.status || e.message) }); }
  }

  if (action === "ingest") {
    const text = String(b.text || "").slice(0, MAX_TEXT);
    if (text.length < 80) return res.status(400).json({ error: "That document is too short to index." });
    if (!(await rateHit(`rag/ingest/${owner}/${Math.floor(Date.now() / 36e5)}`, 30).catch(() => true))) return res.status(429).json({ error: "Too many documents this hour." });
    const kind = ["report", "statement", "note"].includes(b.kind) ? b.kind : "note";
    const ref = `${kind}:${String(b.ref || Date.now()).slice(0, 80)}`;
    try {
      const chunks = rag.chunkText(text);
      const r = await rag.upsert(owner, chunks.map((c, i) => ({ kind, ref: `${ref}#${i}`, title: String(b.title || ref).slice(0, 160), content: c, ticker: b.ticker ? String(b.ticker).toUpperCase() : null, doc_type: kind, as_of: b.asOf || null, source_url: b.url || null })));
      return res.status(200).json(r);
    } catch (e) { return res.status(502).json({ error: "That document could not be indexed: " + (e.code || e.status || e.message) }); }
  }

  return res.status(400).json({ error: "Unknown action." });
};
