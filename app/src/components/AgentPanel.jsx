import { useEffect, useRef, useState } from "react"
import { Bot, CheckCircle2, FileText, Loader2, Send, Sparkles, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SourceTag } from "@/components/common"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

const TYPE = { fact: { label: "Fact", v: "up", hint: "Retrieved from a cited source" }, calculated: { label: "Calculated", v: "secondary", hint: "Computed by the app's deterministic calculation engine" }, interpretation: { label: "Interpretation", v: "warn", hint: "The model's reading of the evidence" }, speculation: { label: "Speculation", v: "down", hint: "A guess beyond the evidence" } }
const STEPS = ["Choosing tools", "Retrieving quotes, filings, news and macro data", "Writing an answer from the evidence", "Verifying every figure against its source"]

/* Source-aware answer: summary, typed claims with evidence chips, the evidence list (source, as-of, kind), tools that failed, what is missing. */
export function AnswerView({ a }) {
  const refs = useRef({})
  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />Answer</CardTitle><CardDescription>{a.answeredBy === "model" ? "Written by the AI model from the evidence below." : "The AI model was unavailable: this is the retrieved evidence without a written summary."} Retrieved {new Date(a.generatedAt).toLocaleTimeString()} in {(a.ms / 1000).toFixed(1)}s.</CardDescription></CardHeader>
        <CardContent className="space-y-3"><p className="text-[14.5px] leading-relaxed">{a.summary}</p>
          <ul className="space-y-2">{a.claims.map((c, i) => <li key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-border bg-background/40 p-2.5 text-[13.5px]">
            <Badge variant={TYPE[c.type].v} title={TYPE[c.type].hint}>{TYPE[c.type].label}</Badge>
            <span className="min-w-0 flex-1">{c.text}{c.flags && c.flags.includes("unverified_numbers") && <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-[var(--warn)]"><TriangleAlert className="size-3" />figure(s) {c.unverifiedNumbers.join(", ")} not found in the cited evidence, shown as interpretation</span>}{c.flags && c.flags.includes("no_evidence") && <span className="ml-1 text-[11px] text-[var(--warn)]">(no evidence cited, shown as interpretation)</span>}</span>
            <span className="flex gap-1">{c.evidence.map((id) => <button key={id} onClick={() => refs.current[id] && refs.current[id].scrollIntoView({ block: "center", behavior: "smooth" })} className="rounded border border-border px-1.5 font-mono text-[11px] text-primary hover:bg-accent">{id}</button>)}</span></li>)}</ul>
          {a.missing && a.missing.length > 0 && <Alert variant="warn"><TriangleAlert /><div><AlertTitle>Not in the retrieved data</AlertTitle><AlertDescription><ul className="list-disc pl-4">{a.missing.map((m, i) => <li key={i}>{m}</li>)}</ul></AlertDescription></div></Alert>}
          {a.failed && a.failed.length > 0 && <p className="text-[12px] text-muted-foreground">Tools that failed: {a.failed.map((f) => `${f.tool} (${f.error})`).join(", ")}. The answer uses only what was retrieved.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" />Evidence & sources</CardTitle><CardDescription>Plan chosen by {a.plan.by === "model" ? "the AI model" : "rules"}: {a.plan.calls.map((c) => c.tool).join(", ")}</CardDescription></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">{a.evidence.map((e) => <div key={e.id} ref={(el) => (refs.current[e.id] = el)} className="rounded-lg border border-border p-3 text-[12.5px]">
          <div className="mb-1 flex items-center gap-2"><span className="rounded bg-accent px-1.5 font-mono text-[11px] text-primary">{e.id}</span><b>{e.label}</b><Badge variant={e.kind === "calculated" ? "secondary" : "up"} className="ml-auto">{e.kind === "calculated" ? "calculated" : "retrieved"}</Badge></div>
          <SourceTag source={e.source} asOf={e.asOf} kind={e.kind} />{e.preview.map((l, i) => <p key={i} className="mt-1.5 break-words text-muted-foreground">{l.length > 260 ? l.slice(0, 260) + "…" : l}</p>)}{e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-primary hover:underline">Open source ↗</a>}</div>)}
          {!a.evidence.length && <p className="text-sm text-muted-foreground">No data could be retrieved for this question.</p>}</CardContent></Card>
      <p className="text-[11.5px] text-muted-foreground">{a.disclaimer}</p>
    </div>)
}

export default function AgentPanel({ symbol, initial, suggestions }) {
  const [q, setQ] = useState(initial || ""), [busy, setBusy] = useState(false), [step, setStep] = useState(0), [ans, setAns] = useState(null), [err, setErr] = useState(null)
  useEffect(() => { if (!busy) return; const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 6000); return () => clearInterval(t) }, [busy])
  const ask = async (text) => {
    const question = (text || q).trim(); if (question.length < 3) return toast.error("Ask a question first.")
    setBusy(true); setStep(0); setErr(null); setAns(null)
    try { setAns(await api("/api/data/agent", { method: "POST", auth: true, body: { question, symbol: symbol || undefined, lang: window.PT_I18N ? PT_I18N.lang : "en" } })) }
    catch (e) { setErr(e.status === 429 ? e.message : e.status === 402 ? "This plan does not include the research agent yet." : "The research agent could not complete this request. Try again in a moment.") }
    finally { setBusy(false) }
  }
  useEffect(() => { if (initial && initial.length > 2) ask(initial) }, [])
  const sug = suggestions || [symbol ? `Why did ${symbol} move today?` : "Why did NVDA fall today?", symbol ? `Is ${symbol} cheap or expensive versus its own fundamentals?` : "Is AAPL overvalued?", symbol ? `Summarise ${symbol}'s latest earnings and filings.` : "What do rising yields mean for tech stocks?", "What is the macro backdrop: rates, inflation and jobs?"]
  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-2"><Bot className="mt-2 size-5 shrink-0 text-primary" /><Textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask() }} placeholder={symbol ? `Ask anything about ${symbol}…` : "Ask about a company, a filing, the market or the economy…"} maxLength={600} aria-label="Question" /></div>
        <div className="flex flex-wrap items-center gap-2">{sug.map((s) => <button key={s} onClick={() => { setQ(s); ask(s) }} disabled={busy} className="rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">{s}</button>)}
          <Button className="ml-auto" onClick={() => ask()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Ask</Button></div>
        <p className="text-[11.5px] text-muted-foreground">The agent fetches data first (quotes, filings, news, macro) and only then writes. Every claim is labelled fact, calculated, interpretation or speculation and linked to its source. ⌘/Ctrl+Enter to send.</p>
      </CardContent></Card>
      {busy && <Card><CardContent className="space-y-2 pt-5" aria-live="polite">{STEPS.map((s, i) => <div key={s} className={cn("flex items-center gap-2 text-sm", i > step && "opacity-40")}>{i < step ? <CheckCircle2 className="size-4 text-[var(--up)]" /> : i === step ? <Loader2 className="size-4 animate-spin" /> : <span className="size-4" />}{s}</div>)}</CardContent></Card>}
      {err && <Alert variant="destructive"><TriangleAlert /><div><AlertTitle>No answer</AlertTitle><AlertDescription>{err}</AlertDescription></div></Alert>}
      {ans && <AnswerView a={ans} />}
    </div>)
}
