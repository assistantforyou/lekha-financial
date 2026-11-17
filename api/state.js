// GET  /api/state                 -> every document this account has saved
// POST /api/state {docs,deleted}  -> upsert documents and/or delete keys (bulk)
// DELETE /api/state?key=<path>    -> remove one document
// Server-side persistence for the browser's own documents (holdings, valuation settings, saved
// valuations, quant runs, snapshots). Nothing here is public: each call is scoped to the caller.
// Tier limits (holdings count) are enforced here, server-side, from the caller's subscription state.
const { requireTier } = require("./_auth");
const { limitsOf } = require("./_tiers");
const { validDoc, listState, putState, delState, MAX_BATCH } = require("./_state");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Accounts are not configured." });
  const p = await requireTier(req, res, ["free", "paid", "premium"]);
  if (!p) return;
  const limits = limitsOf(p);

  // Holdings documents are capped per plan; null limit = unlimited (paid/premium).
  // The message tells the user exactly what to do.
  const holdingsCap = (docs) => {
    for (const d of docs) {
      if (limits.holdings != null && /^holdings\//.test(d.key) && d.data && typeof d.data === "object" && Array.isArray(d.data.items)
          && d.data.items.length > limits.holdings) {
        return { tier: p.plan || "free", limit: limits.holdings, key: d.key, count: d.data.items.length };
      }
    }
    return null;
  };

  try {
    if (req.method === "GET") {
      return res.status(200).json({ docs: await listState(p.user_id), server_time: new Date().toISOString() });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const raw = Array.isArray(b.docs) ? b.docs : [];
      const docs = raw.map(validDoc).filter(Boolean);
      if (raw.length !== docs.length) return res.status(400).json({ error: "One or more documents were rejected." });
      const cap = holdingsCap(docs);
      if (cap) return res.status(422).json({
        error: `Your plan holds up to ${cap.limit} holdings (this sync had ${cap.count}). Remove some holdings or upgrade for more.`,
        code: "holdings_limit", tier: cap.tier, limit: cap.limit,
      });
      const deleted = Array.isArray(b.deleted) ? b.deleted.map(String) : [];
      if (JSON.stringify({ docs, deleted }).length > MAX_BATCH) return res.status(413).json({ error: "That sync is too large." });
      const written = await putState(p.user_id, docs);
      const removed = deleted.length ? await delState(p.user_id, deleted) : [];
      return res.status(200).json({ ok: true, written, deleted: removed, synced_at: new Date().toISOString() });
    }

    if (req.method === "DELETE") {
      const key = String((req.query && req.query.key) || "");
      if (!key) return res.status(400).json({ error: "key is required." });
      return res.status(200).json({ ok: true, deleted: await delState(p.user_id, [key]) });
    }

    return res.status(405).json({ error: "Use GET, POST or DELETE." });
  } catch (e) {
    console.error("state:", e && e.message);
    return res.status(500).json({ error: "Could not reach the account store." });
  }
};
