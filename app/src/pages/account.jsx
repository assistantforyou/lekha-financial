import { track, planParams } from "@/lib/pixel"
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
import { QUOTAS } from "@/lib/entitlements"

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
      else { const j = mode === "login" ? await A.login(email, pw) : await A.signup(email, pw); if (mode === "signup") track("CompleteRegistration", { status: true, content_name: "Free", value: 0, currency: "THB" }, "reg"); if (j.confirm) setMsg({ ok: true, t: j.message }); else { toast.success("Signed in. Loading your account…"); setTimeout(() => (location.href = location.pathname + "#/portfolio/overview"), 200); setTimeout(() => location.reload(), 350) } }
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
/* Grouped the way people think about it: how it looks, what language and money it speaks, where it starts,
   and how to get the walkthrough again. Every control writes the same preferences the classic engine reads. */
const ZOOM = { S: 0.92, M: 1, L: 1.12, XL: 1.25 }
const QUICK_THEMES = [["lekha-teal", "LEKHA Teal", "#0f766e"], ["lekha-navy", "LEKHA Navy", "#1e3a5f"], ["lekha-teal-light", "LEKHA Teal Light", "#0d9488"], ["lekha-light", "LEKHA Light", "#475569"]]
const START_SCREENS = [["portfolio", "My portfolio", "Your holdings, today's change and the performance chart."], ["macro", "Macro dashboard", "Rates, inflation and the economic regime."]]

export function Preferences({ item, navigate }) {
  const [, force] = useState(0), cur = useCurrency(), I = window.PT_I18N, bump = () => force((x) => x + 1)
  const theme = A.getPref("theme", "lekha-teal"), size = A.getPref("size", "M"), density = A.getPref("density", "comfortable")
  const [start, setStart] = useState(() => { try { return JSON.parse(localStorage.getItem("ptpub.v1.v3.start") || "null") || "portfolio" } catch (e) { return "portfolio" } })
  const lang = I ? I.LANGS.find((l) => l.code === I.lang) : null
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="max-w-4xl space-y-4">
      <Card><CardHeader><CardTitle>How it looks</CardTitle><CardDescription>Theme, text size and spacing. Changes apply straight away and follow you to other devices.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <Field label="Theme" id="th">
            <div className="grid gap-2 sm:grid-cols-2">{QUICK_THEMES.map(([id, name, swatch]) => <button key={id} onClick={() => { A.setPref("theme", id); bump() }} aria-pressed={theme === id} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm", theme === id ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}><span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-border" style={{ background: swatch }} />{name}{theme === id && <Check className="ml-auto size-4 text-primary" />}</button>)}</div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => window.dispatchEvent(new Event("lekha:theme"))}>Browse all 100 themes</Button>
          </Field>
          <Field label="Text size" id="sz" hint="Enlarges every screen. Useful on a large monitor or a small laptop."><Seg label="Text size" value={size} onChange={(v) => { A.setPref("size", v); document.documentElement.style.setProperty("--zoom", ZOOM[v]); bump() }} options={[["S", "Small"], ["M", "Medium"], ["L", "Large"], ["XL", "Extra large"]]} /></Field>
          <Field label="Spacing" id="dn" hint="Compact fits more rows on screen; comfortable leaves more air between them."><Seg label="Spacing" value={density} onChange={(v) => { A.setPref("density", v); if (v === "compact") document.documentElement.setAttribute("data-density", "compact"); else document.documentElement.removeAttribute("data-density"); bump() }} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} /></Field>
        </CardContent></Card>

      <Card><CardHeader><CardTitle>Language and money</CardTitle><CardDescription>{lang ? `Currently ${lang.native}.` : ""} Language changes every label and the language the AI analyst answers in. Headlines and filings stay in the language the publisher wrote them.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <Field label="Language" id="lg">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{(I ? I.LANGS : []).map((l) => <button key={l.code} translate="no" onClick={() => l.code !== I.lang && I.setLang(l.code)} aria-pressed={I.lang === l.code} className={cn("notranslate rounded-lg border px-3 py-2 text-left text-sm", I.lang === l.code ? "border-primary bg-accent font-semibold" : "border-border hover:bg-accent/50")}>{l.native}</button>)}</div>
          </Field>
          <Field label="Show money in" id="cy" hint="Totals and portfolio values convert at the daily rate. Each share price stays in the currency the stock trades in."><Seg label="Currency" value={cur} onChange={setCurrency} options={[["USD", "US dollar"], ["THB", "Thai baht"]]} /></Field>
        </CardContent></Card>

      <Card><CardHeader><CardTitle>Where the app opens</CardTitle><CardDescription>The first screen after you sign in. The rest is one click away in the sidebar.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">{START_SCREENS.map(([id, name, why]) => <button key={id} onClick={() => { setStart(id); localStorage.setItem("ptpub.v1.v3.start", JSON.stringify(id)); toast.success("Start screen saved") }} aria-pressed={start === id} className={cn("rounded-lg border px-3 py-2.5 text-left", start === id ? "border-primary bg-accent" : "border-border hover:bg-accent/50")}><div className="flex items-center gap-2 text-sm font-medium">{name}{start === id && <Check className="size-4 text-primary" />}</div><p className="mt-0.5 text-[12px] text-muted-foreground">{why}</p></button>)}</div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-medium">Panels and sidebar</div><p className="text-[12px] text-muted-foreground">Choose which sections appear, and in what order.</p></div><Button variant="outline" onClick={() => navigate("account/layout")}>Open layout</Button></div>
        </CardContent></Card>

      <Card><CardHeader><CardTitle translate="no">{ui("replayHead")}</CardTitle><CardDescription translate="no">{ui("replayText")}</CardDescription></CardHeader>
        <CardFooter><Button variant="outline" translate="no" onClick={() => startTour(0)}><CircleHelp />{ui("replay")}</Button></CardFooter></Card>

      <Card><CardHeader><CardTitle>Back to defaults</CardTitle><CardDescription>Restores the theme, text size and spacing only. Holdings, watchlist and layouts are not touched.</CardDescription></CardHeader>
        <CardFooter><Button variant="outline" onClick={() => { A.setPref("theme", "lekha-teal"); A.setPref("size", "M"); A.setPref("density", "comfortable"); toast.success("Display preferences reset"); setTimeout(() => location.reload(), 300) }}><RefreshCw />Reset display preferences</Button></CardFooter></Card>
    </div></div>)
}

/* ---------------- Plans & billing ---------------- */
/* Exactly three subscription plans (Free, Paid, Premium). The Demo is a preview offered separately, never a plan
   card. Copy mirrors api/_data/entitlements.json and the quotas the server enforces; the server is the authority. */
const PRICE = { free: "฿0/mo", paid: "฿399/mo", premium: "฿599/mo" }
const Q = (name, tier) => (QUOTAS[name] || {})[tier]
const PLANS = [
  {
    id: "free", name: "Free", tagline: "Real market data, your own portfolio.",
    body: "For tracking a real portfolio with real quotes and filings. Data comes from the free provider tiers, so history is shorter and holdings are capped.",
    points: [
      ["Real quotes and filings", "US quotes (IEX feed), SEC EDGAR financial statements, FRED macro series and publisher headlines."],
      ["Up to 20 holdings", "Every lot, cost basis, weight, unrealized P&L, the risk screen and the performance chart."],
      ["5 years of history", "Enough for drawdowns and rolling returns on your own portfolio."],
      ["Macro dashboard and regime", "Rates, inflation, the yield curve, the regime model and CNN Fear & Greed."],
      [`${Q("researchQuestionsPerDay", "free")} cited research questions a day`, `The research agent retrieves filings and news before answering, with ${Q("chatTurnsPerDay", "free")} analyst chat turns a day. The portfolio-aware analyst, Council and simulations are not included.`],
    ],
  },
  {
    id: "paid", name: "Paid", tagline: "The full research set and the portfolio analyst.",
    body: "No caps on holdings or history, every market and sector screen, valuation for every holding, and the AI analyst for your own portfolio. Simulation and the LLM Council are Premium.",
    points: [
      ["Market rotation, intelligence and risk appetite", "Relative strength across sectors and styles, the daily AI-labelled market briefing, XLY/XLP, VIX and VIXEQ."],
      ["Intrinsic value and deep analysis", "DCF and residual-income models with margin of safety for every holding, plus the one-holding-at-a-time deep analysis."],
      ["Sector rotation", "Relative rotation graph, leadership quality with earnings revisions, and sector breadth."],
      ["AI analyst and daily briefing", `Ask about your own positions: ${Q("analystQuestionsPerDay", "paid")} portfolio analyst requests, ${Q("chatTurnsPerDay", "paid")} analyst chat turns and ${Q("briefingGenerationsPerDay", "paid")} new briefing a day, plus ${Q("researchQuestionsPerDay", "paid")} cited research questions.`],
      ["Unlimited holdings and full history", "Track every account and position with the full daily series each source serves."],
    ],
  },
  {
    id: "premium", name: "Premium", tagline: "Everything in Paid, plus simulation and the Council.",
    body: "Adds the simulation engine and the LLM Council to everything in Paid, with higher AI allowances.",
    points: [
      ["Simulation engine", "Monte Carlo on your holdings: up to 1,000,000 requested paths per run for up to 25 invested holdings. The completed path count is shown on every result."],
      ["Stress tests and Projection Lab", "Rate-shock, tech-drawdown and recession scenarios on your weights, and the illustrative Projection Lab."],
      ["LLM council and saved reports", "One model writes five role-based perspectives and a CEO synthesis in a single structured response, saved as a report you can reread. 10 new reports a day."],
      ["Higher AI allowances", `${Q("analystQuestionsPerDay", "premium")} portfolio analyst requests, ${Q("chatTurnsPerDay", "premium")} analyst chat turns and ${Q("briefingGenerationsPerDay", "premium")} new briefings a day, and ${Q("researchQuestionsPerDay", "premium")} cited research questions.`],
      ["Everything in Paid", "Every market, sector, valuation and analyst feature."],
    ],
  },
]
export function Plans({ item, navigate, me }) {
  const sess = useSession(), demo = isDemo(), signedIn = !!(sess && sess.access_token) && !demo, cur = signedIn ? (me ? me.tier : "free") : null, [busy, setBusy] = useState(null)
  const go = async (plan) => { if (!signedIn) { toast.error("Create a free account first, then pick a plan."); return navigate("account/profile") } setBusy(plan); try { const pp = planParams(plan); if (pp) track("InitiateCheckout", { ...pp, num_items: 1 }); const j = await A.checkout(plan); location.href = j.url } catch (e) { toast.error(errMsg(e)); setBusy(null) } }
  const manage = async () => { setBusy("portal"); try { const j = await A.portal(); location.href = j.url } catch (e) { toast.error(errMsg(e)); setBusy(null) } }
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-4 lg:grid-cols-3" data-plan-cards="3">{PLANS.map((t) => <Card key={t.id} data-plan={t.id} className={cn("flex flex-col", cur === t.id && "border-primary", t.id === "premium" && "shadow-[0_0_0_1px_var(--accent)]")}>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-center justify-between gap-3"><CardTitle className="text-xl">{t.name}</CardTitle>{cur === t.id && <Badge variant="default">Current</Badge>}</div>
        <div className="num text-2xl font-semibold">{PRICE[t.id]}</div>
        <p className="text-[13.5px] font-medium text-foreground">{t.tagline}</p>
        <CardDescription className="text-[13px] leading-relaxed">{t.body}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-1">
        {t.points.map(([title, detail]) => <div key={title} className="rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="flex items-start gap-2 text-[13.5px] font-semibold"><Check className="mt-0.5 size-4 shrink-0 text-[var(--up)]" />{title}</div>
          <p className="ml-6 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
        </div>)}
      </CardContent>
      <CardFooter className="pt-0">{t.id === "free" ? (!signedIn ? <Button variant="outline" onClick={() => navigate("account/profile")}>Create a free account</Button> : <span className="text-[12.5px] text-muted-foreground">Included with every account.</span>) : cur === t.id ? <span className="text-[12.5px] text-muted-foreground">Your current plan.</span> : t.id === "paid" ? (cur !== "premium" && <Button disabled={!!busy} onClick={() => go("paid")}>{busy === "paid" ? "Opening checkout…" : "Choose Paid"}</Button>) : <Button disabled={!!busy} onClick={() => cur === "paid" ? manage() : go("premium")}>{busy === "premium" ? "Opening checkout…" : cur === "paid" ? "Upgrade to Premium" : "Go Premium"}</Button>}</CardFooter></Card>)}</div>
    <Card className="mt-4" data-demo-preview><CardContent className="flex flex-wrap items-center gap-3 pt-5">
      <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">Not ready to sign up? Try the demo.</div><p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">The demo is a free preview, not a plan. It opens every screen on a simulated sample portfolio, needs no account and saves nothing to the service. The analyst answers real questions on that sample data. The demo Council plays pre-written sample reports rather than calling a model.</p></div>
      {demo ? <span className="text-[12.5px] text-muted-foreground">You are in the demo.</span> : <Button variant="outline" asChild><a href="?demo=1">Open the demo</a></Button>}
    </CardContent></Card>
    {signedIn && me?.can_manage_billing && <Card className="mt-4"><CardContent className="flex flex-wrap items-center gap-3 pt-5"><div className="text-sm">Plan <b className="capitalize">{me.tier}</b>{me.period_end ? <> · period ends {date(me.period_end)}</> : null}{me.sub_status ? <> · status {me.sub_status}</> : null}</div><Button className="ml-auto" variant="outline" onClick={manage} disabled={busy === "portal"}>Manage subscription</Button>{["past_due", "unpaid", "incomplete"].includes(me.sub_status) && <Alert className="basis-full"><AlertTriangle className="size-4" /><AlertTitle>Payment not received</AlertTitle><AlertDescription>The latest charge for your subscription failed, so paid features are paused. Update the card in Manage subscription; access returns as soon as Stripe confirms the payment.</AlertDescription></Alert>}</CardContent></Card>}
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
