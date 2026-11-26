// In-app inbox for alerts, earnings reminders and the daily digest.
// Proactive work lands here because the product has no e-mail provider.
const { requireTier } = require("../../_auth");
const inbox = require("../../_ai/inbox");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]);
  if (!p) return;
  if (p.demo) {
    if (req.method === "GET") return res.status(200).json({ items: [], unread: 0 });
    return res.status(402).json({ error: "account_required", message: "The inbox needs a free account." });
  }
  const userId = p.user_id;
  try {
    if (req.method === "GET") {
      const doc = await inbox.load(userId);
      const items = (doc.items || []).slice(0, 50);
      return res.status(200).json({ items, unread: items.filter((x) => !x.read).length, updatedAt: doc.updatedAt || null });
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const unread = await inbox.markRead(userId, { id: b.id, all: b.all === true });
      return res.status(200).json({ ok: true, unread });
    }
    if (req.method === "DELETE") {
      const id = (req.body || {}).id || (req.query || {}).id;
      const ok = await inbox.remove(userId, id);
      return res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: "not_found" });
    }
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    console.error(JSON.stringify({ event: "inbox_failed", message: String(e && e.message) }));
    return res.status(500).json({ error: "failed" });
  }
};
