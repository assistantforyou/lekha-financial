import { useState } from "react"
import { ArrowRight, Loader2, Users } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input, Textarea } from "@/components/ui/input"
import { PageHeader } from "@/components/common"
import { api } from "@/lib/api"
import { newReportId, saveReport } from "@/lib/reports"
import { capturePostHog } from "@/lib/posthog"

const LENSES = [
  ["investor", "Long-term investor"],
  ["analyst", "Sell-side analyst"],
  ["pessimist", "Bear case"],
  ["allocator", "Portfolio allocator"],
  ["optimist", "Bull case"],
]
const STANCE = { bullish: ["up", "Bullish"], neutral: ["secondary", "Neutral"], bearish: ["down", "Bearish"], insufficient: ["warn", "Insufficient"] }

async function closes(tk, days) {
  const r = await api(`/api/data/history?symbol=${encodeURIComponent(tk)}&days=${days}`, { auth: true })
  const rows = Array.isArray(r.data) ? r.data : []
  return rows.map((x) => Number(x[4])).filter((x) => x > 0)
}

function riskOf(closes, market) {
  if (closes.length < 60) return null
  const rets = (a) => a.slice(1).map((v, i) => v / a[i] - 1)
  const r = rets(closes)
  const mean = r.reduce((a, b) => a + b, 0) / r.length
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1))
  if (!sd) return null
  let peak = closes[0], worst = 0
  for (const c of closes) { if (c > peak) peak = c; worst = Math.min(worst, c / peak - 1) }
  const out = {
    volPct: Math.round(sd * Math.sqrt(252) * 1000) / 10,
    maxDrawdownPct: Math.round(worst * 1000) / 10,
    var95Pct: Math.round(1.65 * sd * 1000) / 10,
    sharpe: Math.round(((mean * 252 - 0.04) / (sd * Math.sqrt(252))) * 100) / 100,
  }
  if (market && market.length > 60) {
    const m = rets(market), n = Math.min(r.length, m.length)
    if (n > 60) {
      const a = r.slice(-n), b = m.slice(-n)
      const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n
      let cov = 0, vb = 0, va = 0
      for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2 }
      cov /= n - 1; vb /= n - 1; va /= n - 1
      if (vb > 0) out.beta = Math.round((cov / vb) * 100) / 100
      if (va > 0 && vb > 0) out.corrToMarket = Math.round((cov / Math.sqrt(va * vb)) * 100) / 100
    }
  }
  return out
}

async function evidenceFor(scope) {
  const tk = String(scope || "").trim().toUpperCase()
  if (!tk || tk === "PORTFOLIO") return undefined
  try {
    const [r, px, spy] = await Promise.all([
      api(`/api/data/valuation?symbol=${encodeURIComponent(tk)}`, { auth: true }).catch(() => ({})),
      closes(tk, 730).catch(() => []),
      closes("SPY", 730).catch(() => []),
    ])
    const d = (r && r.data) || {}
    const risk = riskOf(px, spy)
    if (d.intrinsicPerShare == null && !risk) return undefined
    const out = { asOf: {} }
    if (d.intrinsicPerShare != null) {
      out.valuation = [{
        tk,
        price: d.price,
        iv: d.intrinsicPerShare,
        mos: d.marginOfSafety != null ? Math.round(d.marginOfSafety * 1000) / 10 : null,
        method: d.v2 && d.v2.model === "ri" ? "Residual income (financial)" : "DCF: free cash flow to the firm",
        asOf: (r.meta && r.meta.asOf) || null,
      }]
      out.asOf.valuation = (r.meta && r.meta.asOf) || undefined
    }
    if (risk) { out.risk = risk; out.asOf.risk = new Date().toISOString().slice(0, 10) }
    return out
  } catch (e) { return undefined }
}

function Rows({ title, text }) {
  if (!text) return null
  return <div><div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div><p className="mt-0.5 text-sm">{text}</p></div>
}

export function ReportView({ rep }) {
  if (!rep) return null
  const ceo = rep.ceo || {}
  const stance = (k) => STANCE[(rep.perspectives && rep.perspectives[k] && rep.perspectives[k].stance) || "insufficient"] || STANCE.insufficient
  const lens = (k) => (rep.perspectives && rep.perspectives[k]) || {}
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base normal-case">{rep.question}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <Badge variant={ceo.verdict === "Buy" ? "up" : ceo.verdict === "Sell" || ceo.verdict === "Reduce" ? "down" : "secondary"}>{ceo.verdict || "Insufficient Evidence"}</Badge>
            <span>{rep.scope === "portfolio" ? "Whole portfolio" : rep.scope}</span>
            {ceo.evidenceQuality && <span>Evidence: {ceo.evidenceQuality}</span>}
            {rep.at && <span>{String(rep.at).slice(0, 10)}</span>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{ceo.executive}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Rows title="Thesis" text={ceo.thesis} />
            <Rows title="Valuation" text={ceo.valuation} />
            <Rows title="Bull case" text={ceo.bullCase} />
            <Rows title="Bear case" text={ceo.bearCase} />
            <Rows title="Portfolio fit" text={ceo.portfolio} />
            <Rows title="Decision" text={ceo.final} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {LENSES.map(([k, label]) => {
          const L = lens(k), s = stance(k)
          return (
            <Card key={k}>
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <Badge variant={s[0]}>{s[1]}</Badge>
                </div>
                <p className="text-xs text-[var(--muted)]">{L.headline}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(L.points || []).map((p, i) => <p key={i}>{p}</p>)}
                {(L.risks || []).length > 0 && <div className="border-t border-[var(--line)] pt-2 text-xs text-[var(--muted)]">{(L.risks || []).join(" ")}</div>}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {(ceo.agree || []).length > 0 || (ceo.dissent || []).length > 0 || (ceo.limitations || []).length > 0 ? (
        <Card>
          <CardContent className="grid gap-3 pt-4 text-sm sm:grid-cols-3">
            {(ceo.agree || []).length > 0 && <div><div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Where the council agrees</div><ul className="mt-1 list-disc space-y-1 pl-4">{(ceo.agree || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {(ceo.dissent || []).length > 0 && <div><div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Dissent</div><ul className="mt-1 list-disc space-y-1 pl-4">{(ceo.dissent || []).map((d, i) => <li key={i}><span className="capitalize">{d.lens}</span>: {d.reason}</li>)}</ul></div>}
            {(ceo.limitations || []).length > 0 && <div><div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">What the evidence lacks</div><ul className="mt-1 list-disc space-y-1 pl-4">{(ceo.limitations || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          </CardContent>
        </Card>
      ) : null}
      <p className="text-xs text-[var(--muted)]">Five analytical lenses over the same evidence, then a written verdict. Model output over your data, not advice.</p>
    </div>
  )
}

export default function CouncilPage({ navigate }) {
  const [q, setQ] = useState("")
  const [scope, setScope] = useState("portfolio")
  const [busy, setBusy] = useState(false)
  const [rep, setRep] = useState(null)
  const [err, setErr] = useState("")

  async function run() {
    const question = q.trim()
    if (question.length < 3 || busy) return
    setBusy(true); setErr("")
    try {
      const evidence = await evidenceFor(scope)
      const r = await api("/api/ai/council-v3", {
        method: "POST", auth: true,
        body: { question, scope: String(scope || "portfolio").trim() || "portfolio", lang: window.PT_I18N ? window.PT_I18N.lang : "en", evidence },
      })
      const doc = { id: newReportId(), question: r.question, scope: r.scope, at: new Date().toISOString(), ceo: r.ceo, perspectives: r.perspectives, meta: r.meta }
      setRep(doc)
      await saveReport(doc)
      capturePostHog("research_council_completed", { scope_type: doc.scope === "portfolio" ? "portfolio" : "ticker" })
      toast("Report saved to AI research reports")
    } catch (e) {
      if (e.code === "premium_required") setErr("The council is a Premium feature. Upgrade in Account, then run it again.")
      else if (e.code === "no_holdings") setErr("Add holdings to your portfolio, or set the scope to a ticker.")
      else if (e.code === "ai_limit") setErr(e.message)
      else setErr(e.message || "The council could not answer right now.")
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="LLM council" description="One question, five analytical lenses, then a written verdict. Each run is saved under AI research reports." />
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <label className="space-y-1 text-sm">
              <span className="text-xs text-[var(--muted)]">Question</span>
              <Textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} placeholder="Is the portfolio too concentrated in semiconductors over the next two years?" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-[var(--muted)]">Scope</span>
              <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="portfolio or a ticker" />
              <span className="block text-[11px] text-[var(--muted)]">portfolio, or a symbol such as NVDA</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={run} disabled={busy || q.trim().length < 3}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}{busy ? "Convening" : "Run the council"}</Button>
            <Button variant="ghost" onClick={() => navigate("analysis/reports")}>Saved reports<ArrowRight className="size-4" /></Button>
            {busy && <span className="text-xs text-[var(--muted)]">Five lenses run in one call. This takes 10 to 30 seconds.</span>}
          </div>
          {err && <Alert variant="warn"><AlertDescription>{err}</AlertDescription></Alert>}
        </CardContent>
      </Card>
      {!rep && !busy && (
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm">
            <p className="font-medium">What you get</p>
            <ul className="list-disc space-y-1 pl-4 text-[var(--muted)]">
              <li>Five independent readings of the same evidence: long-term investor, sell-side analyst, bear case, allocator and bull case.</li>
              <li>A CEO verdict that names the buy, hold, reduce or sell decision, the thesis and the dissent.</li>
              <li>The evidence quality and what the data cannot support, so a weak answer is labelled rather than dressed up.</li>
            </ul>
            <p className="text-[var(--muted)]">Portfolio scope reads your saved holdings and live market data on the server. A ticker scope adds a DCF valuation plus two years of prices: volatility, drawdown, beta and a one-day value at risk.</p>
          </CardContent>
        </Card>
      )}
      <ReportView rep={rep} />
    </div>
  )
}
