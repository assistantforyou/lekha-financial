// Chat turn, streamed over SSE. One endpoint for every AI surface: the mode decides depth,
// the router decides tools. Threads are stored per user in pt_user_state.
const { requireTier } = require("../../_auth");
const crypto = require("crypto");
const { tierOf } = require("../../_tiers");
const { rateHit, cacheGet, cacheSet } = require("../../_lib");
const { clientId } = require("../../_history");
const { listState, putState } = require("../../_state");
const { langOf, withLang } = require("../ai/_lang");
const loop = require("../../_ai/loop");
const ds = require("../../_ai/ds");

const DAY = 86400000;
const MAX_MESSAGES = 40;

// How long a repeated question may be answered from cache. A price answer is only good for minutes,
// a general explanation stays right for a week. DeepSeek's own prefix cache is separate: it is
// automatic, lasts a few hours on their side and cannot be extended from here.
const ANSWER_TTL = { company: 30 * 60000, portfolio: 15 * 60000, macro: 2 * 3600000, general: 7 * DAY };
const answerTtl = (kind) => ANSWER_TTL[kind] || 30 * 60000;

const LIMITS = {
  // One question before an account is the hook: an anonymous visitor gets to see the analyst answer from real
  // evidence, then the next one asks for a free signup. Keyed per client per day, so clearing cookies resets it.
  demo: { turns: 1, deep: 0 },
  free: { turns: 30, deep: 0 },
  paid: { turns: 150, deep: 20 },
  premium: { turns: 400, deep: 100 },
};

function send(res, obj) {
  try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { /* client gone */ }
}

function sse(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function threadIdOf(v) {
  const s = String(v || "").trim();
  if (/^[A-Za-z0-9._:-]{1,60}$/.test(s)) return s;
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimThread(doc) {
  const msgs = (Array.isArray(doc.messages) ? doc.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES);
  return { ...doc, messages: msgs };
}

async function loadThread(userId, id) {
  try {
    const rows = await listState(userId);
    const row = rows.find((r) => r.key === `chat/${id}`);
    return row && row.data && typeof row.data === "object" ? trimThread(row.data) : null;
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]);
  if (!p) return;

  const b = req.body || {};
  const message = String(b.message == null ? "" : b.message).slice(0, 8000).trim();
  if (message.length < 2) return res.status(400).json({ error: "Type a message first.", code: "empty_message" });

  const tier = tierOf(p) || (p.demo ? "demo" : "free");
  const lim = LIMITS[tier] || LIMITS.free;
  const mode = b.mode === "deep" ? "deep" : "fast";
  if (mode === "deep" && !lim.deep) {
    return res.status(402).json({ error: "Deep thinking is part of the paid plans.", code: "deep_unavailable", need: ["paid", "premium"] });
  }
  if (!ds.ready()) return res.status(503).json({ error: "The AI provider is not configured.", code: "not_configured" });

  const who = p.demo ? "d-" + clientId(req) : p.user_id;
  const day = Math.floor(Date.now() / DAY);
  const under = await rateHit(`ai/chat/${who}/${day}`, lim.turns).catch(() => false);
  if (!under) {
    if (p.demo) return res.status(429).json({ error: "That was your free question. Create a free account to keep asking.", code: "signup_required", need_signup: true });
    return res.status(429).json({ error: "Daily AI limit reached. It resets at midnight UTC.", code: "ai_limit" });
  }
  if (mode === "deep") {
    const deepOk = await rateHit(`ai/chat-deep/${who}/${day}`, lim.deep).catch(() => false);
    if (!deepOk) return res.status(429).json({ error: "Deep-thinking limit reached for today.", code: "deep_limit" });
  }

  const attachments = Array.isArray(b.attachments) ? b.attachments.slice(0, 6) : [];
  const lang = langOf(b.lang);
  const langHint = lang && lang !== "en" ? "\n" + withLang("", lang).trim() : "";

  const id = threadIdOf(b.threadId);
  const persisted = !p.demo && !!p.user_id;
  const existing = persisted ? await loadThread(p.user_id, id) : null;
  const history = existing ? existing.messages.slice(-6) : [];

  // An identical first-turn question within ten minutes is served from cache: no model call, same answer.
  // Follow-ups and attachments always run fresh because their meaning depends on the conversation.
  const simple = !attachments.length && !history.length;
  const ck = simple
    ? "ai/ans/" + crypto.createHash("sha1").update([who, mode, lang, String(b.symbol || ""), message.toLowerCase()].join("|")).digest("hex")
    : null;
  let hit = null;
  if (ck) {
    try {
      const c = await cacheGet(ck);
      if (c && c.text && Date.now() - Number(c.at || 0) < answerTtl(c.kind)) hit = c;
    } catch (e) { hit = null; }
  }

  sse(res);
  send(res, { type: "start", threadId: id, mode, tier });

  if (hit) {
    if (hit.evidence) send(res, hit.evidence);
    for (let i = 0; i < hit.text.length; i += 240) send(res, { type: "text", text: hit.text.slice(i, i + 240) });
    send(res, { type: "finish", answeredBy: "cache", ms: 0 });
    send(res, { type: "done", threadId: id });
    try { res.end(); } catch (e) { /* already closed */ }
    return;
  }

  let aborted = false;
  const ctl = new AbortController();
  const onClose = () => { aborted = true; try { ctl.abort(); } catch (e) { /* noop */ } };
  req.on("close", onClose);

  let answer = "";
  let evidencePart = null;
  let planKind = null;
  try {
    for await (const part of loop.run({
      question: message,
      mode,
      userId: p.demo ? "demo" : p.user_id,
      demo: !!p.demo,
      symbol: b.symbol,
      attachments,
      history,
      langHint,
      signal: ctl.signal,
      budgetMs: mode === "deep" ? 150000 : 60000,
    })) {
      if (part.type === "text") answer += part.text;
      if (part.type === "evidence") evidencePart = part;
      if (part.type === "plan") planKind = part.kind;
      send(res, part);
    }
  } catch (e) {
    const budget = String(e.code || "") === "budget_exhausted";
    send(res, {
      type: "error",
      code: String(e.code || "error"),
      message: budget ? "The AI daily budget has been reached. It resets at midnight UTC." : "The answer stopped early.",
    });
  }

  if (ck && answer) {
    try { await cacheSet(ck, { at: Date.now(), text: answer, evidence: evidencePart, kind: planKind }); } catch (e) { /* cache is optional */ }
  }

  if (persisted && !aborted) {
    try {
      const now = new Date().toISOString();
      const doc = trimThread({
        id,
        title: (existing && existing.title) || message.slice(0, 60),
        createdAt: (existing && existing.createdAt) || now,
        updatedAt: now,
        messages: [
          ...(existing ? existing.messages : []),
          { role: "user", content: message, at: now },
          ...(answer ? [{ role: "assistant", content: answer, at: now, mode }] : []),
        ],
      });
      if (doc.messages.length) await putState(p.user_id, [{ key: `chat/${id}`, data: doc }]);
    } catch (e) { /* a lost thread is not worth failing the answer */ }
  }

  send(res, { type: "done", threadId: id });
  try { res.end(); } catch (e) { /* already closed */ }
};
