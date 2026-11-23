// POST /api/data/agent {question, symbol?, lang?}: source-aware research agent (see _fin/agent.js). Open to every tier while the product is in preview;
// demo visitors get a small per-client daily allowance. Entitlements and limits are enforced here, never trusted from the browser.
const { requireTier } = require("../../_auth");
const { tierOf, tierAllows, canUse, quota } = require("../../_tiers");
const { rateHit } = require("../../_lib");
const { generateJson } = require("../../_llm");
const { knowledgeOwner } = require("../../_demo-owner");
const { clientId } = require("../../_history");
const agent = require("../../_fin/agent");
const { DEMO_ASOF } = require("../../_fin/asof");
const { langOf, withLang } = require("../ai/_lang");
const DAY = 864e5;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]); if (!p) return;
  res.setHeader("Cache-Control", "no-store");
  const b = req.body && typeof req.body === "object" ? req.body : {}, question = String(b.question || "").slice(0, 600).trim();
  if (question.length < 3) return res.status(400).json({ error: "Ask a question first." });
  // expert mode is the portfolio analyst chat: feature "analyst" (Paid and Premium); demo and Free are refused before any quota or model work
  const tier = p.demo ? "demo" : tierOf(p);
  if (b.mode === "expert" && !tierAllows(tier, "analyst")) {
    return res.status(p.demo ? 401 : 402).json({ error: "Paid or Premium plan required for the analyst.", tier, need: ["paid", "premium"], feature: "analyst", plan: "paid" });
  }
  const who = p.demo ? "d-" + clientId(req) : p.user_id, limit = p.demo ? 15 : tierOf(p) === "premium" ? 80 : 30;
  if (!(await rateHit(`ai/agent/${who}/${Math.floor(Date.now() / DAY)}`, limit).catch(() => false))) return res.status(429).json({ error: `Daily research limit reached (${limit}/day).`, code: "ai_limit" });
  const lang = langOf(b.lang), hasLlm = !!process.env.DEEPSEEK_API_KEY;
  const llm = hasLlm ? { json: (o) => generateJson(o) } : null;
  /* signed-in users get their own knowledge base; demo visitors get one built from their browser
     snapshot, keyed to this client so nothing is shared between visitors */
  const owner = knowledgeOwner(p, req);
  /* analyst chat: expert mode, no tool plan, caller-supplied context (see agent.expert) */
  if (b.mode === "expert") {
    const limitX = quota("expertQuestionsPerDay", tier);
    if (!(await rateHit(`ai/expert/${who}/${Math.floor(Date.now() / DAY)}`, limitX).catch(() => false))) return res.status(429).json({ error: `Daily question limit reached (${limitX}/day).`, code: "ai_limit" });
    try { return res.status(200).json(await agent.expert({ question, context: String(b.context || "").slice(0, 14000), llm, langHint: langOf(b.lang) && langOf(b.lang) !== "en" ? "\n" + withLang("", langOf(b.lang)).trim() : "" })); }
    catch (e) { return res.status(e.status === 400 ? 400 : e.status === 503 ? 503 : 502).json({ error: e.message === "llm_not_configured" ? "AI is not configured on this deployment." : "The analyst could not answer right now.", code: e.message }); }
  }
  try { const out = await agent.run({ question, symbol: b.symbol || null, llm, lang, owner, hideReports: !(!p.demo && canUse(p, "councilReports")), asOf: p.demo ? DEMO_ASOF : null, langHint: lang && lang !== "en" ? "\n" + withLang("", lang).trim() : "" }); return res.status(200).json(out); }
  catch (e) { return res.status(e.status === 400 ? 400 : 502).json({ error: e.status === 400 ? "Ask a question first." : "The research agent could not complete this request.", code: e.message }); }
};
