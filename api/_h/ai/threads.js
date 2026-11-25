// Thread list for the chat surface. Signed-in accounts only: the demo has no rows to store.
const { requireTier } = require("../../_auth");
const { listState, putState, delState } = require("../../_state");

const VALID = /^[A-Za-z0-9._:-]{1,60}$/;

function summary(doc, key) {
  return {
    id: String(key || "").replace(/^chat\//, ""),
    title: String((doc && doc.title) || "Untitled"),
    updatedAt: (doc && doc.updatedAt) || null,
    count: Array.isArray(doc && doc.messages) ? doc.messages.length : 0,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]);
  if (!p) return;

  const needsAccount = (msg) => res.status(402).json({ error: msg, code: "account_required", need: ["free", "paid", "premium"] });

  if (req.method === "GET") {
    if (p.demo) return res.status(200).json({ threads: [] });
    const id = String((req.query && (req.query.id || req.query.thread)) || "").trim();
    const rows = await listState(p.user_id).catch(() => []);
    const chats = rows.filter((r) => /^chat\//.test(r.key) && r.data && typeof r.data === "object");
    if (id) {
      if (!VALID.test(id)) return res.status(400).json({ error: "Unknown thread.", code: "bad_thread" });
      const hit = chats.find((r) => r.key === `chat/${id}`);
      if (!hit) return res.status(404).json({ error: "Unknown thread.", code: "bad_thread" });
      return res.status(200).json({ thread: { ...hit.data, id } });
    }
    const threads = chats
      .map((r) => summary(r.data, r.key))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 50);
    return res.status(200).json({ threads });
  }

  if (req.method === "POST") {
    if (p.demo) return needsAccount("Saving a thread needs an account.");
    const b = req.body || {};
    const now = new Date().toISOString();
    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const title = String(b.title || "New thread").slice(0, 60);
    await putState(p.user_id, [{ key: `chat/${id}`, data: { id, title, createdAt: now, updatedAt: now, messages: [] } }]);
    return res.status(200).json({ id, title, createdAt: now });
  }

  if (req.method === "DELETE") {
    if (p.demo) return needsAccount("Deleting a thread needs an account.");
    const id = String((req.query && req.query.id) || "").trim();
    if (!VALID.test(id)) return res.status(400).json({ error: "Unknown thread.", code: "bad_thread" });
    await delState(p.user_id, [`chat/${id}`]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed." });
};
