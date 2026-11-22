import { ReleasePolicies } from "../components/ReleasePolicies"
import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, CircleHelp, Download, LogOut, RefreshCw, Upload } from "lucide-react"
import { ui } from "@/tour/copy"
import { startTour } from "@/tour/store"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DataState, ErrorBox, PageHeader } from "@/components/common"
import { api, useData } from "@/lib/api"
import * as A from "@/lib/account"
import { isDemo, setCurrency, useCurrency, useSession, useMe, useTier } from "@/lib/engine"
import { date, dateTime, num, pct } from "@/lib/fmt"
import { cn } from "@/lib/utils"

const Field = ({ label, id, children, hint }) => <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}{hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}</div>
const Seg = ({ value, onChange, options, label }) => <div role="group" aria-label={label} className="inline-flex rounded-md border border-border p-0.5">{options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={cn("rounded px-3 py-1.5 text-[13px] transition", value === v ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>
const errMsg = (e) => (e && e.message) || "Something went wrong. Try again."

/* ---------------- Profile ---------------- */
function AuthForms() {
  const [mode, setMode] = useState("login"), [email, setEmail] = useState(""), [pw, setPw] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      if (mode === "recover") { const j = await A.recover(email); setMsg({ ok: true, t: j.message }) }
      else { const j = mode === "login" ? await A.login(email, pw) : await A.signup(email, pw); if (j.confirm) setMsg({ ok: true, t: j.message }); else { toast.success("Signed in. Loading your account…"); setTimeout(() => (location.href = location.pathname + "#/portfolio/overview"), 200); setTimeout(() => location.reload(), 350) } }
    } catch (err) { setMsg({ ok: false, t: errMsg(err) }) } finally { setBusy(false) }
  }
  return (<Card><CardHeader><CardTitle>{mode === "login" ? "Sign in" : mode === "signup" ? "Create your free account" : "Reset your password"}</CardTitle><CardDescription>{isDemo() ? "You are exploring the demo. An account keeps your own holdings, watchlist, layout and settings on every device and switches to real market data." : "Use your email and password."}</CardDescription></CardHeader>
    <form onSubmit={submit}><CardContent className="space-y-3"><Field label="Email" id="auth-email"><Input id="auth-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      {mode !== "recover" && <Field label="Password" id="auth-pw" hint={mode === "signup" ? "8 to 72 characters." : undefined}><Input id="auth-pw" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={72} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>}
      {mode === "signup" && <ReleasePolicies />}
      {msg && <Alert variant={msg.ok ? "success" : "destructive"}><AlertDescription>{msg.t}</AlertDescription></Alert>}</CardContent>
      <CardFooter className="flex-wrap"><Button type="submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</Button>
        {mode !== "login" && <Button type="button" variant="ghost" onClick={() => setMode("login")}>Have an account? Sign in</Button>}{mode === "login" && <><Button type="button" variant="outline" onClick={() => setMode("signup")}>Create account</Button><Button type="button" variant="ghost" onClick={() => setMode("recover")}>Forgot password?</Button></>}</CardFooter></form></Card>)
}
export function Profile({ item, navigate, me }) {
  const sess = useSession(), signedIn = !!(sess && sess.access_token), demo = isDemo(), [name, setName] = useState(() => A.getPref("displayName", "")), tier = useTier()
  const sync = window.PT_SYNC ? PT_SYNC.status : null
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-4 lg:grid-cols-2">
      {demo && signedIn && <Alert variant="warn" className="lg:col-span-2"><div><AlertTitle>Demo mode is on</AlertTitle><AlertDescription>You are signed in but exploring the simulated portfolio. Your real data is untouched. <a className="text-primary underline" href={location.pathname}>Exit demo and load my portfolio</a></AlertDescription></div></Alert>}
      {signedIn && !demo ? <>
        <Card><CardHeader><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-full bg-accent text-lg font-semibold text-primary">{(name || sess.email || "?").slice(0, 1).toUpperCase()}</div><div className="min-w-0"><CardTitle className="truncate">{name || (sess.email || "").split("@")[0]}</CardTitle><CardDescription className="truncate">{sess.email}</CardDescription></div></div></CardHeader>
          <CardContent className="space-y-3"><Field label="Display name" id="dn" hint="Shown in the app. Saved with your preferences and synced to your account."><div className="flex gap-2"><Input id="dn" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /><Button variant="outline" onClick={() => { A.setPref("displayName", name.trim()); toast.success("Saved") }}>Save</Button></div></Field>
            <dl className="grid grid-cols-2 gap-y-2 text-sm"><dt className="text-muted-foreground">Plan</dt><dd><Badge variant="secondary">{me ? me.tier : tier || "…"}</Badge>{me && me.is_admin && <Badge variant="warn" className="ml-1">Admin</Badge>}</dd>
              {me && me.period_end && me.tier !== "free" && <><dt className="text-muted-foreground">Renews</dt><dd>{date(me.period_end)}</dd></>}<dt className="text-muted-foreground">Sync</dt><dd>{sync ? (sync.error ? <span className="down-t">Error: {sync.error}</span> : sync.pending ? `Saving ${sync.pending}…` : "Up to date") : "–"}</dd></dl></CardContent>
          <CardFooter className="flex-wrap"><Button variant="outline" onClick={() => navigate("account/plans")}>Plans & billing</Button><Button variant="ghost" onClick={async () => { await A.logout(); location.href = location.pathname + "#/portfolio/overview"; location.reload() }}><LogOut />Sign out</Button></CardFooter></Card>
        <Card><CardHeader><CardTitle>Your data</CardTitle><CardDescription>Holdings, watchlist, saved valuations, layouts and reports live in this browser and are mirrored to your account.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => navigate("account/data")}>Export, import and sync</Button></CardContent></Card></>
        : <><AuthForms /><Card><CardHeader><CardTitle>What an account adds</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>• Real prices, news and filings on your own holdings instead of the demo portfolio.</p><p>• Holdings, watchlist, layout and settings sync across devices.</p><p>• Paid and Premium plans add deeper history, more symbols and higher AI limits.</p><p>Your password never reaches this page's code after sign-in: only a session token is stored in this browser.</p></CardContent></Card></>}
    </div></div>)
}

/* ---------------- Preferences ---------------- */
export function Preferences({ item, navigate }) {
  const [, force] = useState(0), cur = useCurrency(), I = window.PT_I18N, bump = () => force((x) => x + 1)
  const theme = A.getPref("theme", "lekha-teal"), size = A.getPref("size", "M"), density = A.getPref("density", "comfortable")
  const [start, setStart] = useState(() => { try { return JSON.parse(localStorage.getItem("ptpub.v1.v3.start") || "null") || "portfolio" } catch (e) { return "portfolio" } })
  const quick = [["lekha-teal", "LEKHA Teal"], ["lekha-navy", "LEKHA Navy"], ["lekha-teal-light", "LEKHA Teal Light"], ["lekha-light", "LEKHA Light"]]
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Saved in this browser and synced to your account.</CardDescription></CardHeader><CardContent className="space-y-5">
        <Field label="Theme" id="th"><div className="grid grid-cols-2 gap-2">{quick.map(([id, l]) => <button key={id} onClick={() => { A.setPref("theme", id); bump() }} aria-pressed={theme === id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm", theme === id ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}>{theme === id && <Check className="size-4 text-primary" />}{l}</button>)}</div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => window.dispatchEvent(new Event("lekha:theme"))}>Browse all 100 themes…</Button></Field>
        <Field label="Text size" id="sz"><Seg label="Text size" value={size} onChange={(v) => { A.setPref("size", v); document.documentElement.style.setProperty("--zoom", { S: 0.92, M: 1, L: 1.12, XL: 1.25 }[v]); bump() }} options={[["S", "Small"], ["M", "Medium"], ["L", "Large"], ["XL", "Extra large"]]} /></Field>
        <Field label="Density" id="dn"><Seg label="Density" value={density} onChange={(v) => { A.setPref("density", v); document.documentElement.toggleAttribute("data-density", v === "compact"); if (v === "compact") document.documentElement.setAttribute("data-density", "compact"); bump() }} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} /></Field></CardContent></Card>
      <Card><CardHeader><CardTitle>Language, currency, start screen</CardTitle></CardHeader><CardContent className="space-y-5">
        <Field label="Language" id="lg" hint="Changes every label and the language the AI analyst answers in. Live headlines and filings stay in their original language.">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{(I ? I.LANGS : []).map((l) => <button key={l.code} translate="no" onClick={() => l.code !== I.lang && I.setLang(l.code)} aria-pressed={I.lang === l.code} className={cn("notranslate rounded-lg border px-3 py-2 text-left text-sm", I.lang === l.code ? "border-primary bg-accent font-semibold" : "border-border hover:bg-accent/50")}>{l.native}</button>)}</div></Field>
        <Field label="Show money in" id="cy" hint="Per-share prices stay in each stock's own currency."><Seg label="Currency" value={cur} onChange={setCurrency} options={[["USD", "USD $"], ["THB", "THB ฿"]]} /></Field>
        <Field label="Open the app on" id="st"><Seg label="Start screen" value={start} onChange={(v) => { setStart(v); localStorage.setItem("ptpub.v1.v3.start", JSON.stringify(v)); toast.success("Saved") }} options={[["portfolio", "My portfolio"], ["macro", "Macro dashboard"]]} /></Field></CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle translate="no">{ui("replayHead")}</CardTitle><CardDescription translate="no">{ui("replayText")}</CardDescription></CardHeader><CardFooter><Button variant="outline" translate="no" onClick={() => startTour(0)}><CircleHelp />{ui("replay")}</Button></CardFooter></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Reset</CardTitle><CardDescription>Restores display preferences to their defaults. Your holdings and data are not touched.</CardDescription></CardHeader><CardFooter><Button variant="outline" onClick={() => { ["theme", "size", "density"].forEach((k) => A.setPref(k, k === "theme" ? "lekha-teal" : k === "size" ? "M" : "comfortable")); toast.success("Preferences reset"); setTimeout(() => location.reload(), 300) }}><RefreshCw />Reset display preferences</Button></CardFooter></Card>
    </div></div>)
}

/* ---------------- Plans & billing ---------------- */
const PRICE = { demo: "Free", free: "Free", paid: "฿699/mo", premium: "฿1,299/mo" }
const TIERS = [
  {
    id: "demo", name: "Demo", tagline: "Everything unlocked, no account.",
    body: "Open the full terminal with every panel switched on. Explore a sample portfolio and pre-written Council reports. Some research screens retrieve historical market data from the server. An account is required to save a personal portfolio to the service.",
    points: [
      ["Whole app, no sign-up", "All portfolio, research, sector, macro, simulation, council and analyst screens are available immediately."],
      ["Council samples and simulations", "Explore pre-written Council reports and run Monte Carlo simulations with the sample portfolio."],
      ["Sample data, real maths", "Portfolio panels use sample inputs. Data-source labels and observation dates identify the inputs used on research screens."],
      ["Nothing persisted", "Holdings, layouts and settings stay in this browser only, and reset whenever you clear site data."],
    ],
  },
  {
    id: "free", name: "Free", tagline: "Real market data, your own portfolio.",
    body: "For tracking a real portfolio with real quotes and filings. Data comes from the free provider tiers, so history is shorter, the symbol cap is lower and the AI researcher has a daily question limit.",
    points: [
      ["Real quotes and filings", "Live-ish US quotes (IEX feed), SEC EDGAR financial statements, FRED macro series and publisher headlines instead of the simulated ones."],
      ["Up to 20 holdings", "Enough for a personal portfolio. Every lot, cost basis, weight, unrealized P&L and performance chart works as in the paid plans."],
      ["5 years of history", "Enough for drawdowns, rolling returns and a 1-year simulation; longer studies need Paid or Premium."],
      ["12 valuation symbols", "DCF and residual-income models for your twelve largest names; the rest of the valuation tab stays locked."],
      ["30 AI research questions a day", "The cited research agent that retrieves filings and news before answering. The premium analyst, council and 1M-path runs are not included."],
    ],
  },
  {
    id: "paid", name: "Paid", tagline: "Unlimited tracking and full history.",
    body: "The working tier: no caps on holdings, symbols or history, and the full indicator and valuation set. It does not include the premium AI analyst, the LLM council or the 1M-path engine — those are Premium.",
    points: [
      ["Unlimited holdings and symbols", "Track as many accounts, currencies and positions as you like. Valuation models cover every holding, not just the first twelve."],
      ["Full price history", "The entire available daily series per symbol, so multi-year drawdowns, rolling beta, factor regressions and volatility studies are usable."],
      ["All advanced indicators", "Sector breadth internals, relative rotation trails, risk appetite, factor and peer valuation, volatility cones and overbought/oversold bands."],
      ["Standard stress testing", "Rate-shock, tech-drawdown and recession scenarios on your actual weights, run on the standard path count."],
      ["30 AI research questions a day", "Same cited research agent as Free, without the sample-size squeeze on portfolio-size limits."],
    ],
  },
  {
    id: "premium", name: "Premium", tagline: "The analyst, the council and 1M paths.",
    body: "Everything in Paid plus the AI layer: a portfolio analyst you can question, a daily briefing written from your holdings, the five-perspective LLM council with a CEO synthesis, and the full 1M-path simulation engine.",
    points: [
      ["AI investment analyst", "Ask about positions, concentration, drawdowns or what would change the view, and get an answer computed from your live weights and history — plus a briefing every day."],
      ["LLM council", "One model writes five role-based perspectives and a CEO synthesis in the same response. Saved as a report you can reread."],
      ["Monte Carlo simulation engine", "Up to one million Monte Carlo paths per run for up to 25 invested holdings: fan chart, terminal distribution, VaR and probability of loss at five horizons."],
      ["Advanced stress testing", "The full scenario library plus custom shocks on rates, sectors and factors, applied to your real weights."],
      ["80 AI research questions a day", "The research and expert modes share this allowance. Portfolio questions, briefings and Council reports have separate limits."],
      ["Everything in Paid", "Unlimited holdings, full history, unlimited valuation coverage and every advanced indicator."],
    ],
  },
]
export function Plans({ item, navigate, me }) {
  const sess = useSession(), signedIn = !!(sess && sess.access_token) && !isDemo(), cur = signedIn ? (me ? me.tier : "free") : "demo", [busy, setBusy] = useState(null), qs = new URLSearchParams(location.search), billing = qs.get("billing")
  useEffect(() => { if (billing) { try { history.replaceState(null, "", location.pathname + location.hash) } catch (e) {} if (billing === "success") { toast.success("Checkout returned. Your account updates when Stripe confirms the subscription."); setTimeout(() => location.reload(), 4500) } else toast("Checkout cancelled. Nothing was charged.") } }, [])
  const go = async (plan) => { if (!signedIn) { toast.error("Create a free account first, then pick a plan."); return navigate("account/profile") } setBusy(plan); try { const j = await A.checkout(plan); location.href = j.url } catch (e) { toast.error(errMsg(e)); setBusy(null) } }
  const manage = async () => { setBusy("portal"); try { const j = await A.portal(); location.href = j.url } catch (e) { toast.error(errMsg(e)); setBusy(null) } }
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-4 md:grid-cols-2">{TIERS.map((t) => <Card key={t.id} className={cn("flex flex-col", cur === t.id && "border-primary", t.id === "premium" && "shadow-[0_0_0_1px_var(--accent)]")}>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-center justify-between gap-3"><CardTitle className="text-xl">{t.name}</CardTitle>{cur === t.id && <Badge variant="default">Current</Badge>}</div>
        <div className="num text-2xl font-semibold">{PRICE[t.id]}</div>
        <p className="text-[13.5px] font-medium text-foreground">{t.tagline}</p>
        <CardDescription className="text-[13px] leading-relaxed">{t.body}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-1">
        {t.points.map(([title, detail]) => <div key={title} className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="flex items-start gap-2 text-[13.5px] font-semibold"><Check className={cn("mt-0.5 size-4 shrink-0", t.id === "demo" ? "text-[var(--warn)]" : "text-[var(--up)]")} />{title}</div>
          <p className="ml-6 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
        </div>)}
      </CardContent>
      <CardFooter className="pt-0">{t.id === "demo" ? (cur !== "demo" ? <Button variant="outline" asChild><a href="?demo=1">Open the demo</a></Button> : <span className="text-[12.5px] text-muted-foreground">You are in the demo. Everything is already unlocked.</span>) : t.id === "free" ? (!signedIn ? <Button variant="outline" onClick={() => navigate("account/profile")}>Create a free account</Button> : <span className="text-[12.5px] text-muted-foreground">Included with every account.</span>) : cur === t.id ? <span className="text-[12.5px] text-muted-foreground">Your current plan.</span> : t.id === "paid" ? (cur !== "premium" && <Button disabled={!!busy} onClick={() => go("paid")}>{busy === "paid" ? "Opening checkout…" : "Choose Paid"}</Button>) : <Button disabled={!!busy} onClick={() => cur === "paid" ? manage() : go("premium")}>{busy === "premium" ? "Opening checkout…" : cur === "paid" ? "Upgrade to Premium" : "Go Premium"}</Button>}</CardFooter></Card>)}</div>
    {signedIn && me?.can_manage_billing && <Card className="mt-4"><CardContent className="flex flex-wrap items-center gap-3 pt-5"><div className="text-sm">Plan <b className="capitalize">{me.tier}</b>{me.period_end ? <> · period ends {date(me.period_end)}</> : null}{me.sub_status ? <> · status {me.sub_status}</> : null}</div><Button className="ml-auto" variant="outline" onClick={manage} disabled={busy === "portal"}>Manage subscription</Button></CardContent></Card>}
    <p className="mt-4 text-[12px] text-muted-foreground">Prices are in Thai baht, billed through Stripe and renew until cancelled in the billing portal. Investment values can fall. Data may be delayed, and projections are hypothetical.</p><ReleasePolicies /></div>)
}

/* ---------------- Dashboard layout (the classic layout editor, framed) ---------------- */
export function Layout({ item }) {
  const host = useRef(null), [state, setState] = useState("loading")
  useEffect(() => {
    let dead = false
    ;(async () => { try { await PT_UI.renderSettings(); const card = document.getElementById("set-layout"); if (dead || !card || !host.current) return setState("none"); host.current.appendChild(card); setState("ok") } catch (e) { setState("none") } })()
    return () => { dead = true; const card = document.getElementById("set-layout"), pane = document.getElementById("tab-set"); if (card && pane) pane.appendChild(card) }
  }, [])
  return (<div><PageHeader title={item.title} description={item.desc} />
    <Alert className="mb-4"><div><AlertTitle>Two ways to arrange panels</AlertTitle><AlertDescription>Tick panels on or off here, or open any portfolio, macro or sector page and press <b>Customize</b> in the banner to drag, resize and reorder them.</AlertDescription></div></Alert>
    <Card><CardContent className="pt-5">{state === "loading" && <DataState s={{ status: "loading" }} />}<div ref={host} className="cx" />{state === "none" && <p className="text-sm text-muted-foreground">The layout editor is not available right now.</p>}</CardContent></Card></div>)
}

/* ---------------- Knowledge base (pgvector) ---------------- */
const kbJson = (r) => r.json().catch(() => ({}))
const kbCall = (body) => (window.PT_AUTH && PT_AUTH.fetch ? PT_AUTH.fetch("/api/rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) : fetch("/api/rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).then(kbJson)
const kbLocalHoldings = () => { try { return JSON.parse(localStorage.getItem((window.PT_STORAGE_NS) + "db.holdings/all") || "null") } catch (e) { return null } }
function KnowledgeBase() {
  const demo = isDemo(), [st, set] = useState({ status: "loading" }), [busy, setBusy] = useState(null), did = useRef(false)
  const load = async () => { try { const j = await kbCall({ action: "status" }); set({ status: "ok", data: j }) } catch (e) { set({ status: "error", error: errMsg(e) }) } }
  useEffect(() => {
    if (did.current) return; did.current = true
    ;(async () => {
      const doc = kbLocalHoldings()
      if (demo && doc && doc.items && doc.items.length) await kbCall({ action: "holdings", doc }).catch(() => {})
      await load()
      set((s) => { if (s.data && !s.data.chunks) kbCall({ action: "sync" }).then(() => load()).catch(() => {}); return s })
    })()
  }, [demo])
  const run = async (action, body = {}) => { setBusy(action); try {
    const j = await kbCall({ action, ...body })
    if (j && j.error) toast.error(j.error); else toast.success(action === "filings" ? `Indexed ${j.chunks || 0} passages from filings` : `Knowledge base ready: ${j.chunks || 0} passages`)
    await load()
  } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) } }
  const topTickers = () => { const d = kbLocalHoldings() || {}; return (d.items || []).filter((h) => h.tk && h.tk !== "CASH").slice(0, 3).map((h) => h.tk) }
  const x = st.data
  return (<Card className="lg:col-span-2"><CardHeader><CardTitle>Knowledge base for the AI analyst</CardTitle><CardDescription>Your holdings, valuation settings and saved reports are embedded in pgvector so the analyst can retrieve them; filings and archived headlines go in the same store. Prices and ratios still come from the live data tools — retrieval only supplies context.</CardDescription></CardHeader>
    <CardContent className="space-y-3 text-sm">
      {st.status === "error" ? <p className="down-t">{st.error}</p> : !x ? <p className="text-muted-foreground">Checking the knowledge base…</p> : <>
        <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{x.chunks || 0} passages</Badge>{Object.entries(x.byKind || {}).map(([k, n]) => <Badge key={k} variant="outline">{k} {n}</Badge>)}{x.lastSync && <span className="text-[12px] text-muted-foreground">updated {dateTime(x.lastSync)}</span>}{!x.embeddings && <Badge variant="warn">embeddings not configured</Badge>}{demo && <Badge variant="outline">demo · no account needed</Badge>}</div>
        {x.tickers && x.tickers.length > 0 && <p className="text-[12px] text-muted-foreground">Filings and headlines indexed for: {x.tickers.join(", ")}</p>}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("sync", { force: true })}><RefreshCw />{busy === "sync" ? "Rebuilding…" : "Rebuild from my account"}</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("filings", { tickers: topTickers() })}>{busy === "filings" ? "Reading filings…" : "Index filings & releases for my top 3"}</Button></div>
        <p className="text-[12px] text-muted-foreground">Filings include 10-K/10-Q (US), 20-F/40-F and 6-K (foreign private issuers), plus 8-K earnings releases as the free stand-in for call transcripts. Headlines are archived automatically whenever the analyst fetches news.</p>
      </>}
    </CardContent></Card>)
}

/* ---------------- Data, import, sync, sources ---------------- */
export function DataPage({ item, navigate }) {
  const [, force] = useState(0), file = useRef(null), sync = window.PT_SYNC ? PT_SYNC.status : null, keys = window.PT_SYNC ? PT_SYNC.keys() : [], stamps = window.PT_SYNC ? PT_SYNC.stamps() : {}, signed = !!(useSession() || {}).access_token && !isDemo()
  const doExport = () => { const blob = new Blob([JSON.stringify(A.exportAll(), null, 2)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lekha-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href) }
  const doImport = async (f) => { try { const n = A.importAll(JSON.parse(await f.text())); toast.success(`Restored ${n} items. Reloading…`); setTimeout(() => location.reload(), 800) } catch (e) { toast.error(errMsg(e)) } }
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Import holdings from a statement</CardTitle><CardDescription>Broker PDF, screenshot or CSV. An AI model reads it, you review every line, and only ticked lines are saved.</CardDescription></CardHeader><CardFooter><Button onClick={() => navigate("portfolio/holdings")}><Upload />Open holdings & import</Button></CardFooter></Card>
      <Card><CardHeader><CardTitle>Back up or move your data</CardTitle></CardHeader><CardFooter className="flex-wrap"><Button variant="outline" onClick={doExport}><Download />Export JSON</Button><Button variant="outline" onClick={() => file.current && file.current.click()}><Upload />Restore from file</Button><input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && doImport(e.target.files[0])} /></CardFooter></Card>
      <Card><CardHeader><CardTitle>Account sync</CardTitle><CardDescription>{signed ? "Documents are mirrored to your account within a second of every change." : "Sign in to sync. In the demo, data stays on this device."}</CardDescription></CardHeader><CardContent className="space-y-2 text-sm">
        {signed ? <><div className="flex items-center gap-2">Status: {sync && sync.error ? <Badge variant="down">{sync.error}</Badge> : sync && sync.pending ? <Badge variant="warn">saving {sync.pending}</Badge> : <Badge variant="up">up to date</Badge>}</div>
          <ul className="max-h-40 overflow-auto rounded-md border border-border text-[12px]">{keys.map((k) => <li key={k} className="flex justify-between gap-2 border-b border-border/60 px-2 py-1 last:border-0"><span className="font-mono">{k}</span><span className="text-muted-foreground">{stamps[k] ? dateTime(stamps[k]) : "not synced yet"}</span></li>)}{!keys.length && <li className="px-2 py-2 text-muted-foreground">No documents yet.</li>}</ul>
          <Button size="sm" variant="outline" onClick={async () => { const r = await PT_SYNC.flush(); toast(r && r.ok ? "Synced" : "Nothing to sync"); force((x) => x + 1) }}><RefreshCw />Sync now</Button></> : <p className="text-muted-foreground">Not signed in.</p>}</CardContent></Card>
      <KnowledgeBase />
    </div></div>)
}
