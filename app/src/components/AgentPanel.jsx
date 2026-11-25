import { useEffect, useRef, useState } from "react"
import { Bot, ChevronRight, Loader2, Paperclip, Plus, Send, Square, Trash2, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import Markdown from "@/components/Markdown"
import { ChartCard } from "@/components/Charts"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { api } from "@/lib/api"
import { trackCustom } from "@/lib/pixel"
import { streamChat, readAttachment, localThreads, localThread, saveLocalThread, dropLocalThread } from "@/lib/chat"
import { cn } from "@/lib/utils"

/* One chat surface for every AI question. Answers arrive as typed parts: reasoning, tool calls, text and evidence.
   Fast mode answers from prefetched evidence in a single stream; Deep mode lets the model choose tools and shows its
   thinking, Claude-style, while it works. */

const TOOL_LABEL = { running: "Working", done: "Done", failed: "Failed" }

function Reasoning({ text, live }) {
  const [open, setOpen] = useState(true)
  if (!text) return null
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[var(--muted)]">
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {live ? "Thinking" : "Thought process"}
      </button>
      {open && <div className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-[var(--line)] px-2.5 py-2 leading-relaxed text-[var(--muted)]">{text}</div>}
    </div>
  )
}

function ToolCard({ p }) {
  const bad = p.status === "failed"
  return (
    <div className={cn("rounded-md border px-2.5 py-2 text-xs", bad ? "border-[var(--down)]/40" : "border-[var(--line)]")}>
      <div className="flex items-center gap-1.5 font-medium">
        {p.status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />}
        <span>{p.name}</span>
        {p.args && Object.keys(p.args).length > 0 && (
          <span className="truncate font-normal text-[var(--muted)]">{Object.entries(p.args).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join(" ")}</span>
        )}
        <span className="ml-auto text-[var(--muted)]">{TOOL_LABEL[p.status] || ""}</span>
      </div>
      {p.status !== "running" && (
        <div className="mt-1 text-[var(--muted)]">
          {bad ? p.error || "No data returned." : [p.label, p.source, p.asOf].filter(Boolean).join(" · ")}
        </div>
      )}
      {!bad && Array.isArray(p.lines) && p.lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[var(--muted)]">
          {p.lines.slice(0, 4).map((l, i) => <li key={i} className="truncate">{l}</li>)}
        </ul>
      )}
    </div>
  )
}

function Evidence({ items }) {
  if (!items || !items.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((e) => (
        <Badge key={e.id} variant="secondary" title={[e.label, e.source, e.asOf].filter(Boolean).join(" · ")}>
          {e.id} {e.label || e.tool}
        </Badge>
      ))}
    </div>
  )
}

function Answer({ m, live }) {
  const reasoning = (m.parts || []).filter((p) => p.type === "reasoning").map((p) => p.text).join("")
  const tools = (m.parts || []).filter((p) => p.type === "tool")
  const evidence = (m.parts || []).filter((p) => p.type === "evidence").flatMap((p) => p.items || [])
  const error = (m.parts || []).find((p) => p.type === "error")
  // Charts arrive as their own parts, drawn server-side from the same live feed the evidence quotes.
  const charts = (m.parts || []).filter((p) => p.type === "chart")
  const notices = (m.parts || []).filter((p) => p.type === "notice")
  const step = [...(m.parts || [])].reverse().find((p) => p.type === "step")
  return (
    <div className="space-y-2">
      <Reasoning text={reasoning} live={live && !m.content} />
      {tools.map((p, i) => <ToolCard key={p.id || i} p={p} />)}
      {m.content ? (
        <Markdown text={m.content} />
      ) : live ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="size-4 animate-spin" /> {step ? step.label : "Working"}</div>
      ) : null}
      {charts.map((c, i) => <ChartCard key={`${c.kind || "c"}-${c.symbol || c.title || ""}-${i}`} chart={c} />)}
      {notices.map((n, i) => <Alert key={i} variant="warn"><AlertDescription>{n.message}</AlertDescription></Alert>)}
      <Evidence items={evidence} />
      {error && <Alert variant="warn"><AlertDescription>{error.message}</AlertDescription></Alert>}
    </div>
  )
}

/* The Quick Tour listens for a question being sent and answered (it steps aside while the visitor asks, then returns beside the answer). */
const tourSignal = (phase) => { try { window.dispatchEvent(new CustomEvent("lekha:ask", { detail: { phase } })) } catch (e) {} }
export default function AgentPanel({ symbol, initial }) {
  const [threads, setThreads] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState("")
  const [mode, setMode] = useState("fast")
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  /* The free question an anonymous visitor is allowed before the signup wall. */
  const [wall, setWall] = useState(false)
  const abort = useRef(null)
  const end = useRef(null)
  const started = useRef(false)

  const refreshThreads = () => {
    const local = localThreads()
    if (!window.PT_AUTH || !window.PT_AUTH.fetch) { setThreads(local); return }
    api("/api/ai/threads", { auth: true })
      .then((j) => {
        const server = j.threads || []
        const seen = new Set(server.map((t) => t.id))
        setThreads([...server, ...local.filter((t) => !seen.has(t.id))].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))))
      })
      .catch(() => setThreads(local))
  }
  useEffect(refreshThreads, [])
  useEffect(() => {
    /* Back from signup: give the question the visitor typed before the wall a place to be asked, instead of losing it. */
    try {
      const q = localStorage.getItem("ptpub.v1.pendingAsk")
      const s = window.PT_AUTH && window.PT_AUTH.session && window.PT_AUTH.session()
      if (q && s && s.access_token) { localStorage.removeItem("ptpub.v1.pendingAsk"); setInput(q) }
    } catch (e) {}
  }, [])
  useEffect(() => { end.current && end.current.scrollIntoView({ block: "end", behavior: "smooth" }) }, [msgs, busy])

  const patch = (i, fn) => setMsgs((ms) => ms.map((m, k) => (k === i ? fn(m) : m)))

  async function ask(text) {
    const q = String(text || "").trim()
    if (!q || busy) return
    setErr("")
    setWall(false)
    /* Funnel signal for the retargeting audience: who tried the analyst. No question text is sent to Meta. */
    trackCustom("AskAnalyst", { content_category: "analyst", content_type: "product" })
    const attached = files
    setFiles([])
    setInput("")
    const base = msgs.length
    setMsgs((ms) => [...ms,
      { role: "user", content: q, at: Date.now(), attachments: attached.map((a) => a.name) },
      { role: "assistant", content: "", parts: [], at: Date.now() }])
    setBusy(true)
    tourSignal("start")
    const ctl = new AbortController()
    abort.current = ctl
    let reply = ""
    try {
      const out = await streamChat({
        message: q, threadId, mode, symbol, signal: ctl.signal,
        attachments: attached,
        lang: window.PT_I18N ? window.PT_I18N.lang : "en",
        onPart: (p) => {
          if (p.type === "text") { reply += p.text; patch(base + 1, (m) => ({ ...m, content: m.content + p.text, parts: [...m.parts, p] })) }
          else if (p.type === "tool") patch(base + 1, (m) => {
            const parts = m.parts.slice(), at = parts.findIndex((x) => x.type === "tool" && x.id === p.id)
            if (at >= 0) parts[at] = p; else parts.push(p)
            return { ...m, parts }
          })
          else if (p.type === "reasoning") patch(base + 1, (m) => {
            const parts = m.parts.slice(), last = parts[parts.length - 1]
            if (last && last.type === "reasoning") parts[parts.length - 1] = { ...last, text: last.text + p.text }
            else parts.push({ ...p })
            return { ...m, parts }
          })
          else patch(base + 1, (m) => ({ ...m, parts: [...m.parts, p] }))
        },
      })
      const id = out.threadId || threadId
      if (id) {
        // Keep a copy in this browser as well, so a conversation survives a reload even without an account.
        const now = new Date().toISOString()
        const prior = localThread(id)
        saveLocalThread({
          id,
          title: (prior && prior.title) || q.slice(0, 60),
          createdAt: (prior && prior.createdAt) || now,
          updatedAt: now,
          messages: [
            ...(prior ? prior.messages : msgs.map((m) => ({ role: m.role, content: m.content, at: m.at }))),
            { role: "user", content: q, at: now },
            ...(reply ? [{ role: "assistant", content: reply, at: now, mode }] : []),
          ],
        })
        setThreadId(id)
        refreshThreads()
      }
    } catch (e) {
      if (e.name === "AbortError") patch(base + 1, (m) => ({ ...m, parts: [...m.parts, { type: "error", message: "Stopped." }] }))
      else if (e.code === "signup_required") {
        /* Keep the question so the account flow can hand it back after signup. */
        try { localStorage.setItem("ptpub.v1.pendingAsk", q) } catch (x) {}
        patch(base + 1, (m) => ({ ...m, content: "", parts: [] }))
        setMsgs((ms) => ms.slice(0, base + 1))
        setWall(true)
      }
      else {
        const msg = e.code === "deep_unavailable" ? "Deep mode needs the Paid plan. Switch to Fast, or upgrade in Account."
          : e.status === 429 ? e.message
          : e.status === 402 ? e.message
          : e.status === 401 ? "Sign in to ask questions."
          : e.status === 503 ? "The AI service is not configured."
          : e.message || "That request failed."
        setErr(msg)
      }
    } finally { setBusy(false); abort.current = null; tourSignal("done") }
  }

  async function openThread(id) {
    if (busy) return
    setErr("")
    try {
      let t = null
      if (window.PT_AUTH && window.PT_AUTH.fetch) {
        try { const j = await api(`/api/ai/threads?id=${encodeURIComponent(id)}`, { auth: true }); t = j.thread } catch (e) { t = null }
      }
      if (!t) t = localThread(id)
      if (!t) { setErr("That thread is no longer available."); return }
      setThreadId(id)
      setMsgs((t.messages || []).map((m) => ({ role: m.role, content: m.content, parts: [], at: m.at })))
    } catch (e) { setErr(e.message) }
  }

  async function removeThread(id) {
    if (busy) return
    try {
      await api(`/api/ai/threads?id=${encodeURIComponent(id)}`, { method: "DELETE", auth: true }).catch(() => {})
      dropLocalThread(id)
      if (id === threadId) { setThreadId(null); setMsgs([]) }
      refreshThreads()
    } catch (e) { toast(e.message) }
  }

  async function attach(list) {
    const picked = Array.from(list || []).slice(0, 4)
    for (const f of picked) {
      try {
        const a = await readAttachment(f)
        const add = Array.isArray(a) ? a : [a]
        setFiles((xs) => (xs.length >= 6 ? xs : [...xs, ...add].slice(0, 6)))
      } catch (e) { toast(e.message) }
    }
  }

  useEffect(() => {
    if (started.current || !initial) return
    started.current = true
    ask(initial)
  }, [initial])

  const wallNext = (() => { try { return encodeURIComponent(location.pathname + location.search + location.hash) } catch (e) { return "%2F" } })()
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]" data-tour="ask">
      <aside className="order-2 space-y-2 lg:order-1">
        <Button variant="outline" size="sm" className="w-full justify-start gap-1.5" onClick={() => { setThreadId(null); setMsgs([]); setErr("") }} disabled={busy}>
          <Plus className="size-4" /> New thread
        </Button>
        <div className="max-h-72 space-y-1 overflow-auto lg:max-h-[520px]">
          {threads.map((t) => (
            <div key={t.id} className={cn("group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--panel-2)]", t.id === threadId && "bg-[var(--panel-2)]")}>
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => openThread(t.id)} title={t.title}>{t.title}</button>
              <button type="button" className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => removeThread(t.id)} aria-label={`Delete ${t.title}`}>
                <Trash2 className="size-3.5 text-[var(--muted)]" />
              </button>
            </div>
          ))}
          {!threads.length && <p className="px-2 text-xs text-[var(--muted)]">Your threads appear here and are kept in this browser.</p>}
        </div>
      </aside>

      <div className="order-1 space-y-3 lg:order-2">
        <div className="min-h-[240px] space-y-4">
          {!msgs.length && (
            <Card><CardContent className="flex items-start gap-3 py-6">
              <Bot className="mt-0.5 size-5 text-[var(--accent)]" />
              <div className="text-sm">
                <p className="font-medium">Ask about a company, your portfolio, or the market.</p>
                <p className="mt-1 text-[var(--muted)]">Answers cite the evidence they use. Attach a PDF, a screenshot, a CSV or a text file and ask about it. Deep mode works through tools step by step.</p>
              </div>
            </CardContent></Card>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="space-y-2">
              {m.role === "user" ? (
                <div className="ml-auto max-w-[85%] rounded-lg bg-[var(--panel-2)] px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.attachments && m.attachments.length > 0 && <p className="mt-1 text-xs text-[var(--muted)]">Attached: {m.attachments.join(", ")}</p>}
                </div>
              ) : (
                <Answer m={m} live={busy && i === msgs.length - 1} />
              )}
            </div>
          ))}
          <div ref={end} />
        </div>

        {err && <Alert variant="warn"><AlertDescription>{err}</AlertDescription></Alert>}

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {f.name}
                <button type="button" onClick={() => setFiles((xs) => xs.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`}>×</button>
              </Badge>
            ))}
          </div>
        )}

        {wall && (
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-[var(--panel-2)] p-3">
            <div className="flex items-start gap-2">
              <Bot className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
              <div className="min-w-0">
                <p className="text-sm font-medium">That was your free question.</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  You saw it work: every figure cited from filings, live quotes and news, with no arithmetic left to the model.
                  Create a free account to keep asking, and the analyst answers about your own holdings instead of the sample portfolio.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button size="sm" asChild><a href={`/login.html?mode=signup&next=${wallNext}`}>Create a free account</a></Button>
                  <Button size="sm" variant="outline" asChild><a href={`/login.html?next=${wallNext}`}>I already have one</a></Button>
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted)]">Free plan, no card. Your question is saved and waiting for you.</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[var(--line)] p-2" data-tour="ask-box">
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(input) }}
            placeholder={symbol ? `Ask about ${symbol}…` : "Ask a question…"} rows={2} className="resize-none border-0 shadow-none focus-visible:ring-0" disabled={busy} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)]">
              <Paperclip className="size-3.5" /> Attach
              <input type="file" className="hidden" multiple accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,.csv,.tsv,.txt,.md,.json" onChange={(e) => { attach(e.target.files); e.target.value = "" }} disabled={busy} />
            </label>
            <div className="flex overflow-hidden rounded-md border border-[var(--line)] text-xs">
              {["fast", "deep"].map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} disabled={busy}
                  className={cn("px-2.5 py-1 capitalize", mode === m ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--muted)]")}>{m}</button>
              ))}
            </div>
            <span className="text-[11px] text-[var(--muted)]">{mode === "deep" ? "Tools and thinking, slower" : "Direct answer"}</span>
            <div className="ml-auto flex gap-1.5">
              {busy ? (
                <Button size="sm" variant="outline" onClick={() => abort.current && abort.current.abort()}><Square className="size-3.5" /> Stop</Button>
              ) : (
                <Button size="sm" onClick={() => ask(input)} disabled={!input.trim()}><Send className="size-3.5" /> Send</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
