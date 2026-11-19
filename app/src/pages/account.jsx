import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, Download, KeyRound, LogOut, Mail, RefreshCw, Trash2, Upload, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
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
  return (<Card><CardHeader><CardTitle>{mode === "login" ? "Sign in" : mode === "signup" ? "Create your free account" : "Reset your password"}</CardTitle><CardDescription>{isDemo() ? "You are in the sample-portfolio demo. An account keeps your own holdings, watchlist, layout and settings on every device and unlocks real data." : "Use your email and password."}</CardDescription></CardHeader>
    <form onSubmit={submit}><CardContent className="space-y-3"><Field label="Email" id="auth-email"><Input id="auth-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      {mode !== "recover" && <Field label="Password" id="auth-pw" hint={mode === "signup" ? "8 to 72 characters." : undefined}><Input id="auth-pw" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={72} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>}
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
          <CardFooter className="flex-wrap"><Button variant="outline" onClick={() => navigate("account/plans")}>Plans & billing</Button><Button variant="outline" onClick={() => navigate("account/security")}>Security</Button><Button variant="ghost" onClick={async () => { await A.logout(); location.href = location.pathname + "#/portfolio/overview"; location.reload() }}><LogOut />Sign out</Button></CardFooter></Card>
        <Card><CardHeader><CardTitle>Your data</CardTitle><CardDescription>Holdings, watchlist, saved valuations, layouts and reports live in this browser and are mirrored to your account.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => navigate("account/data")}>Export, import and sync</Button></CardContent></Card></>
        : <><AuthForms /><Card><CardHeader><CardTitle>What an account adds</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>• Real prices, news and valuation on your own holdings (the demo uses a fictional portfolio).</p><p>• Holdings, watchlist, layout and settings sync across devices.</p><p>• Paid and Premium plans unlock full history, the AI analyst, the LLM council and larger simulations.</p><p>Your password never reaches this page's code after sign-in: only a session token is stored in this browser.</p></CardContent></Card></>}
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
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Reset</CardTitle><CardDescription>Restores display preferences to their defaults. Your holdings and data are not touched.</CardDescription></CardHeader><CardFooter><Button variant="outline" onClick={() => { ["theme", "size", "density"].forEach((k) => A.setPref(k, k === "theme" ? "lekha-teal" : k === "size" ? "M" : "comfortable")); toast.success("Preferences reset"); setTimeout(() => location.reload(), 300) }}><RefreshCw />Reset display preferences</Button></CardFooter></Card>
    </div></div>)
}

/* ---------------- Plans & billing ---------------- */
const ROWS = ["Market data", "Portfolio tracking", "Historical analysis", "Valuation coverage", "Advanced indicators", "Company research workspace", "AI research agent (cited)", "AI investment analyst", "LLM council (five perspectives + CEO)", "1B simulation engine (1M-path runs)", "Stress testing"]
const VALS = { demo: ["Simulated", "Simulated", "Simulated", "Simulated", "Demo", "Yes", "15 questions/day", "Demo only", "Demo only", "Demo only", "Demo only"], free: ["Real", "20 holdings", "5 years", "12 symbols", "Basic", "Yes", "30 questions/day", "–", "–", "–", "–"], paid: ["Real", "Unlimited", "Full history", "Unlimited", "Full", "Yes", "30 questions/day", "–", "–", "–", "Standard"], premium: ["Real", "Unlimited", "Full history", "Unlimited", "Full", "Yes", "80 questions/day", "Included", "Included", "Included", "Advanced"] }
const PRICE = { demo: "Free", free: "Free", paid: "฿699/mo", premium: "฿1,299/mo" }
export function Plans({ item, navigate, me }) {
  const sess = useSession(), signedIn = !!(sess && sess.access_token) && !isDemo(), cur = signedIn ? (me ? me.tier : "free") : "demo", [busy, setBusy] = useState(null), qs = new URLSearchParams(location.search), billing = qs.get("billing")
  useEffect(() => { if (billing) { try { history.replaceState(null, "", location.pathname + location.hash) } catch (e) {} if (billing === "success") { toast.success("Payment received. Your plan switches on as soon as Stripe confirms it."); setTimeout(() => location.reload(), 4500) } else toast("Checkout cancelled. Nothing was charged.") } }, [])
  const go = async (plan) => { if (!signedIn) { toast.error("Create a free account first, then pick a plan."); return navigate("account/profile") } setBusy(plan); try { const j = await A.checkout(plan); location.href = j.url } catch (e) { toast.error(errMsg(e)); setBusy(null) } }
  const manage = async () => { setBusy("portal"); try { const j = await A.portal(); location.href = j.url } catch (e) { toast.error(errMsg(e)); setBusy(null) } }
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{["demo", "free", "paid", "premium"].map((t) => <Card key={t} className={cn(cur === t && "border-primary", t === "premium" && "shadow-[0_0_0_1px_var(--accent)]")}><CardHeader><div className="flex items-center justify-between"><CardTitle className="capitalize">{t}</CardTitle>{cur === t && <Badge variant="default">Current</Badge>}</div><div className="num text-2xl font-semibold">{PRICE[t]}</div></CardHeader>
      <CardContent><dl className="space-y-1.5 text-[13px]">{ROWS.map((r, i) => <div key={r} className="flex justify-between gap-3 border-b border-border/50 pb-1"><dt className="text-muted-foreground">{r}</dt><dd className={cn("text-right", VALS[t][i] === "–" && "text-muted-foreground/50", VALS[t][i] === "Included" && "font-semibold text-[var(--up)]")}>{VALS[t][i]}</dd></div>)}</dl></CardContent>
      <CardFooter>{t === "demo" ? (cur !== "demo" && <Button variant="outline" asChild><a href="?demo=1">Try the demo</a></Button>) : t === "free" ? (!signedIn && <Button variant="outline" onClick={() => navigate("account/profile")}>Create a free account</Button>) : cur === t ? null : t === "paid" ? (cur !== "premium" && <Button disabled={!!busy} onClick={() => go("paid")}>{busy === "paid" ? "Opening checkout…" : "Choose Paid"}</Button>) : <Button disabled={!!busy} onClick={() => go("premium")}>{busy === "premium" ? "Opening checkout…" : cur === "paid" ? "Upgrade to Premium" : "Go Premium"}</Button>}</CardFooter></Card>)}</div>
    {signedIn && me && me.tier !== "free" && <Card className="mt-4"><CardContent className="flex flex-wrap items-center gap-3 pt-5"><div className="text-sm">Plan <b className="capitalize">{me.tier}</b>{me.period_end ? <> · renews {date(me.period_end)}</> : null}{me.sub_status ? <> · status {me.sub_status}</> : null}</div><Button className="ml-auto" variant="outline" onClick={manage} disabled={busy === "portal"}>Manage subscription</Button></CardContent></Card>}
    <p className="mt-4 text-[12px] text-muted-foreground">All tiers run the same app: what changes is whether data is simulated or real, how deep it goes, and the AI features. Prices are in Thai baht and billed through Stripe; cancel any time in the billing portal. Entitlements are enforced on the server.</p></div>)
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

/* ---------------- Data, import, sync, sources ---------------- */
export function DataPage({ item, navigate }) {
  const [, force] = useState(0), file = useRef(null), sync = window.PT_SYNC ? PT_SYNC.status : null, keys = window.PT_SYNC ? PT_SYNC.keys() : [], stamps = window.PT_SYNC ? PT_SYNC.stamps() : {}, signed = !!(useSession() || {}).access_token && !isDemo()
  const doExport = () => { const blob = new Blob([JSON.stringify(A.exportAll(), null, 2)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lekha-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href) }
  const doImport = async (f) => { try { const n = A.importAll(JSON.parse(await f.text())); toast.success(`Restored ${n} items. Reloading…`); setTimeout(() => location.reload(), 800) } catch (e) { toast.error(errMsg(e)) } }
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Import holdings from a statement</CardTitle><CardDescription>Broker PDF, screenshot or CSV. An AI model reads it, you review every line, and only ticked lines are saved. Nothing is stored on our servers.</CardDescription></CardHeader><CardFooter><Button onClick={() => navigate("portfolio/holdings")}><Upload />Open holdings & import</Button></CardFooter></Card>
      <Card><CardHeader><CardTitle>Back up or move your data</CardTitle><CardDescription>Everything this browser keeps for the app (holdings, watchlist, valuation settings, layouts, saved reports). Session tokens and passcodes are never included.</CardDescription></CardHeader><CardFooter className="flex-wrap"><Button variant="outline" onClick={doExport}><Download />Export JSON</Button><Button variant="outline" onClick={() => file.current && file.current.click()}><Upload />Restore from file</Button><input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && doImport(e.target.files[0])} /></CardFooter></Card>
      <Card><CardHeader><CardTitle>Account sync</CardTitle><CardDescription>{signed ? "Documents are mirrored to your account within a second of every change." : "Sign in to sync. In the demo, data stays on this device."}</CardDescription></CardHeader><CardContent className="space-y-2 text-sm">
        {signed ? <><div className="flex items-center gap-2">Status: {sync && sync.error ? <Badge variant="down">{sync.error}</Badge> : sync && sync.pending ? <Badge variant="warn">saving {sync.pending}</Badge> : <Badge variant="up">up to date</Badge>}</div>
          <ul className="max-h-40 overflow-auto rounded-md border border-border text-[12px]">{keys.map((k) => <li key={k} className="flex justify-between gap-2 border-b border-border/60 px-2 py-1 last:border-0"><span className="font-mono">{k}</span><span className="text-muted-foreground">{stamps[k] ? dateTime(stamps[k]) : "not synced yet"}</span></li>)}{!keys.length && <li className="px-2 py-2 text-muted-foreground">No documents yet.</li>}</ul>
          <Button size="sm" variant="outline" onClick={async () => { const r = await PT_SYNC.flush(); toast(r && r.ok ? "Synced" : "Nothing to sync"); force((x) => x + 1) }}><RefreshCw />Sync now</Button></> : <p className="text-muted-foreground">Not signed in.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Where the numbers come from</CardTitle><CardDescription>Every figure shows its source, time and whether it is reported or calculated.</CardDescription></CardHeader><CardContent className="space-y-1.5 text-[13px]">
        {[["Prices & quotes", "Alpaca IEX → Finnhub → FMP → Yahoo → Twelve Data"], ["Financial statements & filings", "SEC EDGAR (XBRL) → FMP"], ["News", "Finnhub + Yahoo Finance + CNBC, MarketWatch, Fed, BBC, Nasdaq (merged, de-duplicated)"], ["Macro", "FRED (St. Louis Fed)"], ["FX", "ECB reference rates via Frankfurter"], ["Crypto", "CoinGecko"], ["Ratios, growth, DCF, risk", "Calculated by the app (deterministic code, never by the AI)"]].map(([a, b]) => <div key={a} className="flex flex-wrap justify-between gap-x-3 border-b border-border/50 pb-1"><span className="text-muted-foreground">{a}</span><span className="text-right">{b}</span></div>)}</CardContent></Card>
    </div></div>)
}

/* ---------------- Security ---------------- */
export function Security({ item, navigate }) {
  const sess = useSession(), signed = !!(sess && sess.access_token) && !isDemo(), [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [email, setEmail] = useState(""), [emailPw, setEmailPw] = useState(""), [del, setDel] = useState({ open: false, pw: "", confirm: "", busy: false, err: null })
  if (!signed) return <div><PageHeader title={item.title} description={item.desc} /><Alert><div><AlertTitle>Sign in to manage security</AlertTitle><AlertDescription>Password, email and account deletion apply to a signed-in account. <button className="text-primary underline" onClick={() => navigate("account/profile")}>Go to Profile</button></AlertDescription></div></Alert></div>
  const doDelete = async () => { setDel((d) => ({ ...d, busy: true, err: null })); try { await A.deleteAccount(del.pw, del.confirm); await A.logout(); try { Object.keys(localStorage).filter((k) => k.startsWith("ptpub.v1.") && !k.includes("demo")).forEach((k) => localStorage.removeItem(k)) } catch (e) {} location.href = "/"; } catch (e) { setDel((d) => ({ ...d, busy: false, err: errMsg(e) })) } }
  return (<div><PageHeader title={item.title} description={item.desc} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />Change password</CardTitle></CardHeader><CardContent className="space-y-3"><Field label="New password" id="np" hint="8 to 72 characters."><Input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><Field label="Repeat new password" id="np2"><Input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field></CardContent>
        <CardFooter><Button disabled={pw.length < 8 || pw !== pw2} onClick={async () => { try { await A.changePassword(pw); toast.success("Password changed"); setPw(""); setPw2("") } catch (e) { toast.error(errMsg(e)) } }}>Change password</Button>{pw && pw2 && pw !== pw2 && <span className="text-xs down-t">Passwords differ</span>}</CardFooter></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Mail className="size-4" />Change email</CardTitle><CardDescription>Currently {sess.email}. We send a confirmation link to the new address; nothing changes until you click it.</CardDescription></CardHeader><CardContent className="space-y-3"><Field label="New email" id="ne"><Input id="ne" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field label="Current password" id="nepw" hint="Required to change your sign-in email."><Input id="nepw" type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} /></Field></CardContent>
        <CardFooter><Button disabled={!email.includes("@") || emailPw.length < 8} onClick={async () => { try { const j = await A.changeEmail(email, emailPw); toast.success(j.message); setEmail(""); setEmailPw("") } catch (e) { toast.error(errMsg(e)) } }}>Send confirmation</Button></CardFooter></Card>
      <Card><CardHeader><CardTitle>Session</CardTitle><CardDescription>Signed in on this browser. Tokens are kept in local storage and refreshed automatically.</CardDescription></CardHeader><CardFooter><Button variant="outline" onClick={async () => { await A.logout(); location.href = location.pathname + "#/portfolio/overview"; location.reload() }}><LogOut />Sign out</Button></CardFooter></Card>
      <Card className="border-[color-mix(in_srgb,var(--down)_45%,var(--border))]"><CardHeader><CardTitle className="flex items-center gap-2 text-[var(--down)]"><Trash2 className="size-4" />Delete account</CardTitle><CardDescription>Permanently deletes your login and the holdings, settings and reports stored on our servers. This cannot be undone. Cancel any paid plan first.</CardDescription></CardHeader><CardFooter><Button variant="destructive" onClick={() => setDel({ open: true, pw: "", confirm: "", busy: false, err: null })}>Delete my account…</Button></CardFooter></Card>
    </div>
    <Dialog open={del.open} onOpenChange={(o) => setDel((d) => ({ ...d, open: o }))}><DialogContent><DialogHeader><DialogTitle>Delete your account?</DialogTitle><DialogDescription>Enter your password and type DELETE to confirm. Export your data first if you want a copy.</DialogDescription></DialogHeader>
      <Field label="Password" id="dp"><Input id="dp" type="password" autoComplete="current-password" value={del.pw} onChange={(e) => setDel({ ...del, pw: e.target.value })} /></Field><Field label="Type DELETE" id="dc"><Input id="dc" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} /></Field>{del.err && <Alert variant="destructive"><AlertDescription>{del.err}</AlertDescription></Alert>}
      <DialogFooter><Button variant="outline" onClick={() => setDel({ ...del, open: false })}>Cancel</Button><Button variant="destructive" disabled={del.busy || del.confirm !== "DELETE" || del.pw.length < 8} onClick={doDelete}>{del.busy ? "Deleting…" : "Delete permanently"}</Button></DialogFooter></DialogContent></Dialog></div>)
}
