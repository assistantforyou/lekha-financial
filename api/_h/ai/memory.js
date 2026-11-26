// The user's saved memory: statements they asked the assistant to keep, editable from
// Account. Signed-in accounts only; the demo has nothing to store.
const { requireTier } = require("../../_auth");
const memory = require("../../_ai/memory");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]);
  if (!p) return;

  const needsAccount = () => res.status(402).json({ error: "Memory needs a free account.", code: "account_required" });
  if (p.demo) { if (req.method === "GET") return res.status(200).json({ items: [] }); return needsAccount(); }

  if (req.method === "GET") {
    const doc = await memory.load(p.user_id).catch(() => ({ items: [] }));
    return res.status(200).json({ items: doc.items || [], updatedAt: doc.updatedAt || null });
  }

  if (req.method === "DELETE") {
    const body = req.body || {};
    const ok = await memory.remove(p.user_id, { id: body.id, text: body.text }).catch(() => false);
    return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ error: "No matching memory.", code: "not_found" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const body = req.body || {};
  const text = String(body.text || "").replace(/\s+/g, " ").trim();
  if (text.length < 6) return res.status(400).json({ error: "Memory text is too short.", code: "too_short" });
  const kind = body.kind === "pref" ? "pref" : "fact";
  const item = await memory.add(p.user_id, { text, kind, symbol: body.symbol || null, source: "account" }).catch(() => null);
  if (!item) return res.status(200).json({ ok: true, duplicate: true });
  return res.status(201).json({ ok: true, item });
};
