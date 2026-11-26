// Chat turn, streamed over SSE. One endpoint for every AI surface: the mode decides depth,
// the router decides tools. Threads are stored per user in pt_user_state.
const { requireTier } = require("../../_auth");
const { tierOf, quota } = require("../../_tiers");
const { rateHit, rateUndo } = require("../../_lib");
const { demoId } = require("../../_history");
const { listState, putState } = require("../../_state");
const { langOf, withLang } = require("../ai/_lang");
const loop = require("../../_ai/loop");
const ds = require("../../_ai/ds");
const { createAIContext } = require("../../_ai/observability");

const DAY = 86400000;
const MAX_MESSAGES = 40;

// One question before an account is the hook: an anonymous visitor gets to see the analyst answer from real
// evidence, then the next one asks for a free signup. Accounts use the plan quotas in entitlements.json.
const DEMO_LIMIT = { turns: 1, deep: 0 };

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

// A long Deep answer is split across invocations: the function stops before the platform limit and saves
// the turn under ai/run/<id>, then the client asks again with that id and the next leg carries on.
async function loadRun(userId, id) {
  try {
    const rows = await listState(userId);
    const row = rows.find((r) => r.key === `ai/run/${id}`);
    return row && row.data && typeof row.data === "object" ? row.data : null;
  } catch (e) { return null; }
}

// How long the platform lets this function run. Vercel Hobby stops it at 60 s; Pro allows up to 300 s when
// vercel.json asks for it. The default works on every plan and hands a long turn to the next invocation a
// few seconds before the limit, so nothing is cut off mid-sentence. Set AI_FUNCTION_MS (for example
// 295000) only when the deployment really has the larger maxDuration.
const PLATFORM_MS = Math.max(30000, Number(process.env.AI_FUNCTION_MS) || 55000);
const HANDOVER_MS = 6000;

module.exports = async function handler(req, res) {
  const t0 = Date.now();
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const p = await requireTier(req, res, ["demo", "free", "paid", "premium"]);
  if (!p) return;

  const b = req.body || {};
  const resumeId = typeof b.resume === "string" && /^[A-Za-z0-9._:-]{1,60}$/.test(b.resume) ? b.resume : null;
  const saved = resumeId && !p.demo ? await loadRun(p.user_id, resumeId) : null;
  // A cursor is only valid for the account that wrote it: the document is read from that user's state.
  const resume = saved && saved.userId === p.user_id ? saved : null;
  const message = String(b.message == null ? "" : b.message).slice(0, 8000).trim();
  if (message.length < 2 && !resume) return res.status(400).json({ error: "Type a message first.", code: "empty_message" });

  // tierOf() maps a demo profile to "free" (it only knows the subscription plans), so the anonymous
  // case has to be named first or the demo quota would silently become the free quota.
  const tier = p.demo ? "demo" : tierOf(p) || "free";
  const lim = p.demo ? DEMO_LIMIT : { turns: quota("chatTurnsPerDay", tier), deep: quota("chatDeepTurnsPerDay", tier) };
  const mode = resume ? (resume.mode === "deep" ? "deep" : "fast") : b.mode === "deep" ? "deep" : "fast";
  if (mode === "deep" && !lim.deep) {
    return res.status(402).json({ error: "Deep thinking is part of the paid plans.", code: "deep_unavailable", need: ["paid", "premium"] });
  }
  if (!ds.ready()) return res.status(503).json({ error: "The AI provider is not configured.", code: "not_configured" });

  // A demo question belongs to the browser, not the network: one visitor behind a shared IP must not
  // spend another visitor's question. Accounts keep the user id.
  const who = p.demo ? "d-" + demoId(req, b) : p.user_id;
  const day = Math.floor(Date.now() / DAY);
  const key = `ai/chat/${who}/${day}`;
  // A continuation is part of a question already counted, so it must not spend a second turn.
  if (!resume) {
    const under = await rateHit(key, lim.turns).catch(() => false);
    if (!under) {
      if (p.demo) return res.status(429).json({ error: "That was your free question. Create a free account to keep asking.", code: "signup_required", need_signup: true });
      return res.status(429).json({ error: "Daily AI limit reached. It resets at midnight UTC.", code: "ai_limit" });
    }
    if (mode === "deep") {
      const deepOk = await rateHit(`ai/chat-deep/${who}/${day}`, lim.deep).catch(() => false);
      if (!deepOk) return res.status(429).json({ error: "Deep-thinking limit reached for today.", code: "deep_limit" });
    }
  }

  const attachments = Array.isArray(b.attachments) ? b.attachments.slice(0, 6) : [];
  const lang = langOf(b.lang);
  const langHint = lang && lang !== "en" ? "\n" + withLang("", lang).trim() : "";

  const id = threadIdOf(resume ? resume.threadId || b.threadId : b.threadId);
  const persisted = !p.demo && !!p.user_id;
  const existing = persisted ? await loadThread(p.user_id, id) : null;
  const history = existing ? existing.messages.slice(-6) : [];
  const observability = createAIContext({ sessionId: `chat:${id}`, distinctId: p.demo ? undefined : p.user_id });

  // Answers are never served from cache: every question retrieves live data first, so a repeated question
  // gets a fresh answer built on current prices and headlines.
  sse(res);
  send(res, { type: "start", threadId: id, mode, tier, resumed: !!resume });

  let aborted = false;
  const ctl = new AbortController();
  const onClose = () => { aborted = true; try { ctl.abort(); } catch (e) { /* noop */ } };
  req.on("close", onClose);

  let answer = "";
  try {
    for await (const part of loop.run({
      question: resume ? resume.question : message,
      mode,
      userId: p.demo ? "demo" : p.user_id,
      demo: !!p.demo,
      symbol: b.symbol,
      attachments,
      history,
      langHint,
      observability,
      signal: ctl.signal,
      resume,
      deadlineAt: t0 + PLATFORM_MS - HANDOVER_MS,
      budgetMs: mode === "deep" ? Math.min(280000, PLATFORM_MS - HANDOVER_MS) : 60000,
      work: persisted ? {
        id,
        save: (doc) => putState(p.user_id, [{ key: `ai/run/${id}`, data: { ...doc, userId: p.user_id, threadId: id } }]).then(() => true).catch(() => false),
      } : null,
    })) {
      if (part.type === "text") answer += part.text;
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

  // An empty demo attempt is not the free question: give it back so a provider failure, an empty
  // response or a closed tab does not spend the hook. Once any text exists the question stays used.
  if (p.demo && !answer) await rateUndo(key).catch(() => false);

  if (persisted && !aborted) {
    try {
      const now = new Date().toISOString();
      const prior = existing ? existing.messages.map((m) => ({ ...m })) : [];
      if (resume) {
        // A continuation extends the answer already stored for this turn rather than starting a new one.
        const last = prior[prior.length - 1];
        if (last && last.role === "assistant") last.content = `${last.content || ""}${answer}`;
        else if (answer) prior.push({ role: "assistant", content: answer, at: now, mode });
      } else {
        prior.push({ role: "user", content: message, at: now });
        if (answer) prior.push({ role: "assistant", content: answer, at: now, mode });
      }
      const doc = trimThread({
        id,
        title: (existing && existing.title) || (resume ? String(resume.question || "").slice(0, 60) : message.slice(0, 60)),
        createdAt: (existing && existing.createdAt) || now,
        updatedAt: now,
        messages: prior,
      });
      if (doc.messages.length) await putState(p.user_id, [{ key: `chat/${id}`, data: doc }]);
    } catch (e) { /* a lost thread is not worth failing the answer */ }
  }

  send(res, { type: "done", threadId: id });
  try { res.end(); } catch (e) { /* already closed */ }
};
