// POST /api/data/agent {question, symbol?, lang?}: source-aware research agent (see _fin/agent.js). Open to every tier while the product is in preview;
// demo visitors get a small per-client daily allowance. Entitlements and limits are enforced here, never trusted from the browser.
const { requireTier } = require("../../_auth");
const { rateHit } = require("../../_lib");
const { generateJson } = require("../../_llm");
const { clientId } = require("../../_history");
const agent = require("../../_fin/agent");
const { langOf, withLang } = require("../ai/_lang");
const DAY = 864e5;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]); if (!p) return;
  res.setHeader("Cache-Control", "no-store");
  const b = req.body && typeof req.body === "object" ? req.body : {}, question = String(b.question || "").slice(0, 600).trim();
  if (question.length < 3) return res.status(400).json({ error: "Ask a question first." });
  const who = p.demo ? "d-" + clientId(req) : p.user_id, limit = p.demo ? 15 : p.plan === "premium" ? 80 : 30;
  if (!(await rateHit(`ai/agent/${who}/${Math.floor(Date.now() / DAY)}`, limit).catch(() => true))) return res.status(429).json({ error: `Daily research limit reached (${limit}/day).`, code: "ai_limit" });
  const lang = langOf(b.lang), hasLlm = !!(process.env.ZAI_API_KEY || process.env.GEMINI_API_KEY);
  const llm = hasLlm ? { json: (o) => generateJson(o) } : null;
  /* signed-in users get their own knowledge base; demo visitors get one built from their browser
     snapshot, keyed to this client so nothing is shared between visitors */
  const owner = p.demo ? "demo:" + clientId(req) : p.user_id;
  try { const out = await agent.run({ question, symbol: b.symbol || null, llm, lang, owner, langHint: lang && lang !== "en" ? "\n" + withLang("", lang).trim() : "" }); return res.status(200).json(out); }
  catch (e) { return res.status(e.status === 400 ? 400 : 502).json({ error: e.status === 400 ? "Ask a question first." : "The research agent could not complete this request.", code: e.message }); }
};
