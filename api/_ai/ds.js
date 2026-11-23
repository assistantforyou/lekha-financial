// DeepSeek transport. One provider, one key: the whole AI layer (chat, JSON jobs, imports)
// goes through here so retries, timeouts, reasoning and usage accounting are defined once.
// OpenAI-compatible API: https://api.deepseek.com/chat/completions
const { logUsage } = require("../_costs");
const { sb } = require("../_lib");

const BASE = "https://api.deepseek.com";
const KEY = () => String(process.env.DEEPSEEK_API_KEY || "").trim();
// DEEPSEEK_STUB=1 answers locally without a network call, so UI and routes can be tested for free.
const stub = () => process.env.DEEPSEEK_STUB === "1";
const ready = () => KEY().length > 10 || stub();

// Hard daily spend ceiling in USD (DEEPSEEK_DAILY_USD, 0 disables it). Checked against today's pt_costs
// rows before any paid call, so a runaway loop, a stuck crawler or a leaked key cannot drain the balance.
const dailyCap = () => {
  const n = Number(process.env.DEEPSEEK_DAILY_USD);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
let spend = { at: 0, usd: 0 };
async function spentToday() {
  if (Date.now() - spend.at < 60000) return spend.usd;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const rows = await sb(`pt_costs?select=usd&service=eq.DeepSeek&ts=gte.${day}T00:00:00Z`);
    spend = { at: Date.now(), usd: (Array.isArray(rows) ? rows : []).reduce((a, r) => a + (Number(r.usd) || 0), 0) };
  } catch (e) {
    spend = { at: Date.now(), usd: spend.usd };
  }
  return spend.usd;
}
async function guard() {
  const cap = dailyCap();
  if (!cap) return;
  if (await spentToday() >= cap) throw err("budget_exhausted", 503);
}

// Model names are configuration, not constants: DeepSeek renames them. A wrong name fails
// loudly at the first request instead of silently downgrading the answer.
const MODELS = {
  fast: () => process.env.DEEPSEEK_MODEL || "deepseek-flash",
  deep: () => process.env.DEEPSEEK_DEEP_MODEL || "deepseek-v4-pro",
  vision: () => process.env.DEEPSEEK_VISION_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-flash",
};
const modelFor = (kind) => (MODELS[kind] || MODELS.fast)();

function err(msg, status, cause) {
  const e = new Error(msg);
  e.status = status || 502;
  if (cause) e.cause = cause;
  return e;
}

const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const retryable = (status, msg) => RETRY_STATUS.has(Number(status)) || /overload|timeout|temporar|busy/i.test(String(msg || ""));

// Jittered backoff: a retry storm against a throttled provider is worse than one attempt.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function backoff(attempt) {
  const base = 300 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(base + jitter, 4000);
}

function budget(timeoutMs, capMs) {
  const t = Number(timeoutMs) || 0;
  const cap = Number(capMs) || 120000;
  return Math.max(1000, Math.min(t || cap, cap));
}

// One HTTP call with a hard timeout and a caller-visible abort.
async function once(body, { timeoutMs, signal } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), budget(timeoutMs));
  const onAbort = () => ctl.abort();
  if (signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    return res;
  } catch (e) {
    if (ctl.signal.aborted && !(signal && signal.aborted)) throw err("timeout", 504, e);
    if (signal && signal.aborted) throw err("aborted", 499, e);
    throw err("network", 502, e);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function bodyText(res) {
  try { return (await res.text()).slice(0, 800); } catch (e) { return ""; }
}

function usageOf(u) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  if (!u) return { inTok: 0, outTok: 0, cachedTok: 0, reasoningTok: 0 };
  const cached = n(u.prompt_cache_hit_tokens || u.prompt_tokens_details?.cached_tokens);
  return {
    inTok: n(u.prompt_tokens),
    outTok: n(u.completion_tokens),
    cachedTok: cached,
    reasoningTok: n(u.completion_tokens_details?.reasoning_tokens),
  };
}

function log(job, model, usage, extra) {
  if (!usage || (!usage.inTok && !usage.outTok)) return;
  logUsage({
    service: "DeepSeek",
    job: job || "chat",
    model,
    inTok: usage.inTok,
    outTok: usage.outTok,
    cachedTok: usage.cachedTok,
    extra: { cached: usage.cachedTok, reasoning: usage.reasoningTok || 0, ...(extra || {}) },
  }).catch(() => {});
}

// Non-streaming completion. Retries transport failures and throttling, never a usable answer.
async function complete(o = {}) {
  if (!ready()) throw err("not_configured", 503);
  if (stub()) {
    const json = o.responseFormat === "json";
    return {
      text: json ? '{"values":[],"summary":"Stub answer. DEEPSEEK_STUB is on, so no model call was made."}' : "Stub answer. DEEPSEEK_STUB is on, so no model call was made.",
      reasoning: "", toolCalls: [], usage: { inTok: 0, outTok: 0, cachedTok: 0, reasoningTok: 0 },
      model: "stub", attempts: 1, finishReason: "stop",
    };
  }
  await guard();
  const model = o.model || modelFor(o.kind || "fast");
  const thinking = o.thinking;
  const body = { model, messages: o.messages, stream: false };
  if (o.tools && o.tools.length) {
    body.tools = o.tools;
    body.tool_choice = o.toolChoice || "auto";
    body.parallel_tool_calls = true;
  }
  if (o.responseFormat === "json") body.response_format = { type: "json_object" };
  if (o.maxTokens) body.max_tokens = o.maxTokens;
  if (thinking === false) {
    body.thinking = { type: "disabled" };
    body.temperature = o.temperature == null ? 0.1 : o.temperature;
  } else if (thinking) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = o.effort || "high";
  }

  const attempts = Math.max(1, Math.min(Number(o.retries == null ? 2 : o.retries) + 1, 5));
  let last = null;
  for (let i = 0; i < attempts; i++) {
    let res;
    try { res = await once(body, o); } catch (e) {
      last = e;
      if (i < attempts - 1) { await pause(backoff(i)); continue; }
      throw e;
    }
    if (!res.ok) {
      const text = await bodyText(res);
      const e = err(`upstream_${res.status}`, res.status === 429 ? 429 : 502);
      e.detail = text;
      last = e;
      if (i < attempts - 1 && retryable(res.status, text)) { await pause(backoff(i)); continue; }
      throw e;
    }
    const j = await res.json().catch(() => null);
    const msg = j && j.choices && j.choices[0] && j.choices[0].message;
    if (!msg) { last = err("empty", 502); if (i < attempts - 1) { await pause(backoff(i)); continue; } throw last; }
    const usage = usageOf(j.usage);
    log(o.job, model, usage, o.meta);
    return {
      text: String(msg.content || ""),
      reasoning: String(msg.reasoning_content || ""),
      toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
      usage,
      model,
      attempts: i + 1,
      finishReason: j.choices[0].finish_reason || null,
    };
  }
  throw last || err("upstream", 502);
}

// Streaming completion. Yields reasoning and text as they arrive and the assembled assistant
// message at the end (including tool calls), so the tool loop can pass it back verbatim.
async function* stream(o = {}) {
  if (!ready()) throw err("not_configured", 503);
  if (stub()) {
    const text = "Stub answer. DEEPSEEK_STUB is on, so no model call was made.";
    if (o.thinking) yield { type: "reasoning", text: "Stub reasoning." };
    for (const chunk of text.split(" ")) yield { type: "text", text: chunk + " " };
    yield {
      type: "done",
      message: { role: "assistant", content: text },
      text, reasoning: "", usage: { inTok: 0, outTok: 0, cachedTok: 0, reasoningTok: 0 },
      model: "stub", finishReason: "stop",
    };
    return;
  }
  await guard();
  const model = o.model || modelFor(o.kind || "fast");
  const body = { model, messages: o.messages, stream: true, stream_options: { include_usage: true } };
  if (o.tools && o.tools.length) {
    body.tools = o.tools;
    body.tool_choice = o.toolChoice || "auto";
    body.parallel_tool_calls = true;
  }
  if (o.maxTokens) body.max_tokens = o.maxTokens;
  if (o.thinking === false) {
    body.thinking = { type: "disabled" };
    body.temperature = o.temperature == null ? 0.4 : o.temperature;
  } else if (o.thinking) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = o.effort || "high";
  }

  const attempts = Math.max(1, Math.min(Number(o.retries == null ? 2 : o.retries) + 1, 5));
  let res = null;
  for (let i = 0; i < attempts; i++) {
    try { res = await once(body, o); } catch (e) { if (i < attempts - 1) { await pause(backoff(i)); continue; } throw e; }
    if (res.ok) break;
    const text = await bodyText(res);
    const e = err(`upstream_${res.status}`, res.status === 429 ? 429 : 502);
    e.detail = text;
    res = null;
    if (i < attempts - 1 && retryable(e.status === 429 ? 429 : e.status, text)) { await pause(backoff(i)); continue; }
    throw e;
  }
  if (!res || !res.body) throw err("empty", 502);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "", reasoning = "", finishReason = null, usage = null;
  const calls = new Map();

  const take = (line) => {
    const s = line.trim();
    if (!s.startsWith("data:")) return null;
    const payload = s.slice(5).trim();
    if (!payload || payload === "[DONE]") return null;
    try { return JSON.parse(payload); } catch (e) { return null; }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const j = take(line);
        if (!j) continue;
        if (j.usage) usage = j.usage;
        const ch = j.choices && j.choices[0];
        if (!ch) continue;
        if (ch.finish_reason) finishReason = ch.finish_reason;
        const d = ch.delta || {};
        if (d.reasoning_content) { reasoning += d.reasoning_content; yield { type: "reasoning", text: d.reasoning_content }; }
        if (d.content) { text += d.content; yield { type: "text", text: d.content }; }
        if (Array.isArray(d.tool_calls)) {
          for (const tc of d.tool_calls) {
            const i = Number.isFinite(tc.index) ? tc.index : calls.size;
            const cur = calls.get(i) || { id: "", type: "function", function: { name: "", arguments: "" } };
            if (tc.id) cur.id = tc.id;
            if (tc.function && tc.function.name) cur.function.name += tc.function.name;
            if (tc.function && typeof tc.function.arguments === "string") cur.function.arguments += tc.function.arguments;
            calls.set(i, cur);
            yield { type: "tool_call", index: i, id: cur.id, name: cur.function.name, args: cur.function.arguments };
          }
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (e) { /* already closed */ }
  }

  const u = usageOf(usage);
  log(o.job, model, u, o.meta);
  yield {
    type: "done",
    message: {
      role: "assistant",
      content: text,
      reasoning_content: reasoning,
      ...(calls.size ? { tool_calls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v) } : {}),
    },
    text,
    reasoning,
    usage: u,
    model,
    finishReason,
  };
}

// Health probe for diagnostics: one tiny completion, no retry, reports what failed.
async function probe(timeoutMs) {
  if (!ready()) return { ok: false, code: "not_configured", ms: 0 };
  const t0 = Date.now();
  try {
    const r = await complete({
      model: modelFor("fast"),
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      thinking: false,
      maxTokens: 8,
      retries: 0,
      timeoutMs: timeoutMs || 15000,
      job: "diag",
    });
    return { ok: !!r.text, model: r.model, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, code: String(e.code || e.message || "error"), status: e.status || null, detail: e.detail || null, ms: Date.now() - t0 };
  }
}

module.exports = { ready, MODELS, modelFor, complete, stream, probe, err };
