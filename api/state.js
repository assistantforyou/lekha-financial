// GET  /api/state                 -> every document this account has saved
// POST /api/state {docs,deleted}  -> upsert documents and/or delete keys (bulk)
// DELETE /api/state?key=<path>    -> remove one document
// Server-side persistence for the browser's own documents (holdings, valuation settings, saved
// valuations, quant runs, snapshots). Nothing here is public: each call is scoped to the caller.
const { requireUser } = require("./_auth");
const { validDoc, listState, putState, delState, MAX_BATCH } = require("./_state");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Accounts are not configured." });
  const u = await requireUser(req, res);
  if (!u) return;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ docs: await listState(u.id), server_time: new Date().toISOString() });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const raw = Array.isArray(b.docs) ? b.docs : [];
      const docs = raw.map(validDoc).filter(Boolean);
      if (raw.length !== docs.length) return res.status(400).json({ error: "One or more documents were rejected." });
      const deleted = Array.isArray(b.deleted) ? b.deleted.map(String) : [];
      if (JSON.stringify({ docs, deleted }).length > MAX_BATCH) return res.status(413).json({ error: "That sync is too large." });
      const written = await putState(u.id, docs);
      const removed = deleted.length ? await delState(u.id, deleted) : [];
      return res.status(200).json({ ok: true, written, deleted: removed, synced_at: new Date().toISOString() });
    }

    if (req.method === "DELETE") {
      const key = String((req.query && req.query.key) || "");
      if (!key) return res.status(400).json({ error: "key is required." });
      return res.status(200).json({ ok: true, deleted: await delState(u.id, [key]) });
    }

    return res.status(405).json({ error: "Use GET, POST or DELETE." });
  } catch (e) {
    console.error("state:", e && e.message);
    return res.status(500).json({ error: "Could not reach the account store." });
  }
};
