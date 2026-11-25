import { track, planParams } from "@/lib/pixel"
import { capture, identify } from "@/lib/analytics"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight, FlaskConical, PanelLeftOpen } from "lucide-react"
import { Toaster, toast } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Sheet } from "@/components/ui/sheet-root"
import { SheetContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import Banner from "@/components/Banner"
import Sidebar from "@/components/Sidebar"
import PanelHost from "@/components/PanelHost"
import PageHelp from "@/components/PageHelp"
import CommandPalette from "@/components/CommandPalette"
import Tour from "@/tour/Tour"
import { ThemeDialog, LangDialog } from "@/components/Pickers"
import { PageHeader } from "@/components/common"
import { BY_KEY, DEFAULT_ROUTE, parseHash } from "@/nav"
import LockedFeature from "@/components/LockedFeature"
import { allows, featureOfRoute } from "@/lib/entitlements"
import { Skeleton } from "@/components/ui/skeleton"
import { isDemo, reloadMe, useMe, useSession } from "@/lib/engine"
import PAGES from "@/pages"

const START = "ptpub.v1.v3.start"
/* demo visitors see real market data as of a fixed past date (the server enforces it); say so */
const demoAsOf = () => { try { const d = window.PT_DEMO && window.PT_DEMO.DEMO_DATE; return d ? "Simulated portfolio as of " + new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) + " close" : "" } catch (e) { return "" } }
function initialHash() {
  if (location.hash && location.hash.length > 2) return
  let k = DEFAULT_ROUTE; try { const s = JSON.parse(localStorage.getItem(START) || "null"); if (s === "macro") k = "macro/dashboard"; else { const last = JSON.parse(localStorage.getItem("ptpub.v1.app.route") || "null"); if (last && BY_KEY[last]) k = last } } catch (e) {}
  history.replaceState(null, "", "#/" + k)
}
initialHash()

export default function App() {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  const [menu, setMenu] = useState(false), [search, setSearch] = useState(false), [theme, setTheme] = useState(false), [lang, setLang] = useState(false)
  /* The desktop tree can be collapsed to give a wide screen entirely to the data. The choice is remembered. */
  const [nav, setNav] = useState(() => { try { return localStorage.getItem("ptpub.v1.app.nav") !== "closed" } catch (e) { return true } })
  const toggleNav = useCallback(() => setNav((v) => { try { localStorage.setItem("ptpub.v1.app.nav", v ? "closed" : "open") } catch (e) {} capture("nav_toggled", { open: !v }); return !v }), [])
  useEffect(() => { if (search) { track("Search", { content_category: "command_palette" }); capture("search_opened", { surface: "app" }) } }, [search])
  const me = useMe(), sess = useSession()
  const navigate = useCallback((path) => { const h = "#/" + path.replace(/^#?\/?/, ""); if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = h }, [])
  useEffect(() => { window.LEKHA_SHELL && window.LEKHA_SHELL._register(navigate) }, [navigate])
  useEffect(() => { const f = () => setTheme(true); window.addEventListener("lekha:theme", f); return () => window.removeEventListener("lekha:theme", f) }, [])
  useEffect(() => { const f = document.getElementById("app-foot"), slot = document.getElementById("app-foot-slot"); if (f && slot && !slot.contains(f)) { f.hidden = false; slot.appendChild(f) } })
  useEffect(() => { const f = () => setRoute(parseHash(location.hash)); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f) }, [])
  useEffect(() => {
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((v) => !v) } else if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement && document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); setSearch(true) } }
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k)
  }, [])
  const item = BY_KEY[route.key] || BY_KEY[DEFAULT_ROUTE], isPane = !!item.panes, Page = item.page ? PAGES[item.page] : null
  useEffect(() => {
    document.title = `${route.param ? route.param + " · " : ""}${item.title} · LEKHA Financials`
    try { if (route.t !== "company") localStorage.setItem("ptpub.v1.app.route", JSON.stringify(route.key)) } catch (e) {}
    window.scrollTo(0, 0); setMenu(false)
    track("ViewContent", { content_name: item.title, content_category: item.groupTitle || route.t || "app", content_type: "product" })
    capture("screen_viewed", { screen: route.key, group: item.groupTitle || route.t || "app", pane: isPane, has_param: !!route.param })
    if (!isPane && window.LEKHA_SHELL) window.LEKHA_SHELL._setRoute({ t: route.t, s: route.s }, false)
  }, [route.key, route.param])
  const qs = route.query ? route.query.toString() : "", r = useMemo(() => ({ ...route, t: route.t, s: route.s }), [route.key, route.param, qs])   // query (?tab=…) must be a dependency or tab links never switch
  const admin = !!(me && me.is_admin), demo = isDemo(), signedIn = !!(sess && sess.access_token)
  /* Feature access (api/_data/entitlements.json, the same matrix the server enforces). The demo is a preview, never
     a plan; a signed-in account's tier is the verified one from /api/auth/me. A locked route renders the lock screen
     INSTEAD of its module, so the classic panels never leave the hidden stage. Display only: the endpoints behind
     every module re-check the subscription. */
  const feature = featureOfRoute(route.key), tier = demo || !signedIn ? "demo" : me && me.tier ? me.tier : null
  const gateLoading = !!feature && tier === null, gated = !!feature && tier !== null && !allows(tier, feature)
  /* Account identity and plan for PostHog. The id is the Supabase user id; no e-mail or name leaves the browser. */
  useEffect(() => { if (sess && sess.user_id) identify(sess.user_id, { plan: me && me.tier ? me.tier : undefined, admin: !!(me && me.is_admin), surface: "app" }) }, [sess && sess.user_id, me && me.tier, me && me.is_admin])
  useEffect(() => { if (gated) capture("paywall_viewed", { screen: route.key, feature, plan: tier }) }, [gated, route.key, feature, tier])
  /* back from Stripe Checkout or the billing portal: the redirect proves nothing, so poll the verified plan until the webhook lands */
  const [confirming, setConfirming] = useState(() => /[?&]billing=(success|portal)(&|$)/.test(location.search))
  useEffect(() => {
    const b = new URLSearchParams(location.search).get("billing"); if (!b) return
    try { history.replaceState(null, "", location.pathname + location.hash) } catch (e) {}
    capture("checkout_returned", { result: b })
    if (b === "success") toast("Checkout returned. Your plan changes when Stripe confirms the subscription.")
    else if (b === "cancel") toast("Checkout cancelled. Nothing was charged.")
  }, [])
  useEffect(() => {
    if (!confirming) return
    let n = 0
    const t = setInterval(() => { if (++n > 20) { clearInterval(t); setConfirming(false) } else reloadMe() }, 3000)
    return () => clearInterval(t)
  }, [confirming])
  const firstTier = useRef(undefined)
  useEffect(() => {
    if (!confirming || !tier) return
    if (firstTier.current === undefined) { firstTier.current = tier; if (!(feature && gated === false)) return }
    if (tier !== firstTier.current || (feature && gated === false)) {
      if (tier !== firstTier.current && (tier === "paid" || tier === "premium")) { const pp = planParams(tier); if (pp) { track("Subscribe", { ...pp, predicted_ltv: pp.value * 12 }, "sub-" + tier); track("Purchase", pp, "buy-" + tier) } capture("plan_activated", { plan: tier }) }
      setConfirming(false); toast.success(`Your account is on the ${tier[0].toUpperCase() + tier.slice(1)} plan.`)
      // the classic engine, its data source and the feature modules read the plan once at load: reload so they start on the verified plan
      if (tier !== firstTier.current) setTimeout(() => location.reload(), 1500)
    }
  }, [confirming, gated, feature, tier])
  const group = BY_KEY[route.key] ? BY_KEY[route.key].groupTitle : ""
  const side = <Sidebar routeKey={route.key} isAdmin={admin} tier={tier} onNavigate={() => setMenu(false)} onSearch={() => { setMenu(false); setSearch(true) }} />
  return (
    <TooltipProvider>
      <div className="shell min-h-dvh bg-background text-foreground">
        <Banner onMenu={() => setMenu(true)} onSearch={() => setSearch(true)} onTheme={() => setTheme(true)} onLang={() => setLang(true)} navigate={navigate} navOpen={nav} onNavToggle={toggleNav} customizable={isPane && !gated && !gateLoading && !item.analyst && !["tab-sim", "tab-sim-proj", "tab-an-deep", "tab-an-council", "lekha-reports", "v3-ai-host"].some((p) => item.panes.includes(p))} />
        {demo && <div className="border-b border-[color-mix(in_srgb,var(--warn)_40%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_10%,var(--background))] px-3 py-1 text-[12px]"><div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-3 gap-y-1"><FlaskConical className="size-3.5 text-[var(--warn)]" /><b className="font-mono text-[11px] tracking-wider text-[var(--warn)]">DEMO</b><span className="text-muted-foreground">{demoAsOf()}</span>{signedIn ? <a className="ml-auto text-primary hover:underline" href={location.pathname}>Exit demo</a> : <a className="ml-auto text-primary hover:underline" href="/login.html">Create a free account to save your own holdings</a>}</div></div>}
        <div className="mx-auto flex max-w-[1700px]">
          <aside data-tour="nav" className={`sticky top-14 h-[calc(100dvh-3.5rem)] w-72 shrink-0 border-r border-border ${nav ? "hidden lg:block" : "hidden"}`}>{side}</aside>
          <main className="min-w-0 flex-1 px-3 pb-16 pt-4 sm:px-6" id="main">
            <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[12px] text-muted-foreground"><span>{group}</span><ChevronRight className="size-3" /><span className="text-foreground">{item.title}{route.param ? ` · ${route.param}` : ""}</span></nav>
            <PageHelp routeKey={route.key} />
            {gated ? <><PageHeader title={item.title} description={item.desc} /><LockedFeature feature={feature} title={item.title} tier={tier} me={me} signedIn={signedIn} demo={demo} navigate={navigate} confirming={confirming} /></> : gateLoading ? <><PageHeader title={item.title} description={item.desc} /><div className="space-y-2" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-40" /></div></> : isPane ? <><PageHeader title={item.title} description={item.desc} /><PanelHost ids={item.panes} analyst={item.analyst} route={r} /></> : Page ? <Page route={r} item={item} navigate={navigate} me={me} /> : null}
            <footer className="mt-12 border-t border-border pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
              <p>LEKHA Financials is analysis software, not investment advice.</p>
              <div id="app-foot-slot" />
            </footer>
          </main>
        </div>
        <Sheet open={menu} onOpenChange={setMenu}><SheetContent side="left" className="p-0" onOpenAutoFocus={(e) => e.preventDefault()}>{side}</SheetContent></Sheet>
        <CommandPalette open={search} onOpenChange={setSearch} navigate={navigate} />
        {!nav && <button type="button" onClick={toggleNav} aria-label="Show navigation" title="Show navigation" className="fixed bottom-16 right-4 z-40 hidden size-9 items-center justify-center rounded-full border border-border bg-[var(--panel)] text-muted-foreground shadow-lg transition hover:text-foreground lg:flex"><PanelLeftOpen className="size-4" /></button>}
        <Tour navigate={navigate} />
        <ThemeDialog open={theme} onOpenChange={setTheme} />
        <LangDialog open={lang} onOpenChange={setLang} />
        <Toaster theme="system" position="bottom-left" toastOptions={{ style: { background: "var(--popover)", color: "var(--fg)", border: "1px solid var(--line)" } }} />
      </div>
    </TooltipProvider>)
}
