import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronRight, FlaskConical } from "lucide-react"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Sheet } from "@/components/ui/sheet-root"
import { SheetContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import Banner from "@/components/Banner"
import Sidebar from "@/components/Sidebar"
import PanelHost from "@/components/PanelHost"
import CommandPalette from "@/components/CommandPalette"
import { ThemeDialog, LangDialog } from "@/components/Pickers"
import { PageHeader } from "@/components/common"
import { BY_KEY, DEFAULT_ROUTE, parseHash } from "@/nav"
import { isDemo, useMe, useSession } from "@/lib/engine"
import PAGES from "@/pages"

const START = "ptpub.v1.v3.start"
function initialHash() {
  if (location.hash && location.hash.length > 2) return
  let k = DEFAULT_ROUTE; try { const s = JSON.parse(localStorage.getItem(START) || "null"); if (s === "macro") k = "macro/dashboard"; else { const last = JSON.parse(localStorage.getItem("ptpub.v1.app.route") || "null"); if (last && BY_KEY[last]) k = last } } catch (e) {}
  history.replaceState(null, "", "#/" + k)
}
initialHash()

export default function App() {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  const [menu, setMenu] = useState(false), [search, setSearch] = useState(false), [theme, setTheme] = useState(false), [lang, setLang] = useState(false)
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
    if (!isPane && window.LEKHA_SHELL) window.LEKHA_SHELL._setRoute({ t: route.t, s: route.s }, false)
  }, [route.key, route.param])
  const r = useMemo(() => ({ ...route, t: route.t, s: route.s }), [route.key, route.param])
  const admin = !!(me && me.is_admin), demo = isDemo(), signedIn = !!(sess && sess.access_token)
  const group = BY_KEY[route.key] ? BY_KEY[route.key].groupTitle : ""
  const side = <Sidebar routeKey={route.key} isAdmin={admin} onNavigate={() => setMenu(false)} />
  return (
    <TooltipProvider>
      <div className="shell min-h-dvh bg-background text-foreground">
        <Banner onMenu={() => setMenu(true)} onSearch={() => setSearch(true)} onTheme={() => setTheme(true)} onLang={() => setLang(true)} navigate={navigate} customizable={isPane && !item.analyst && !["tab-sim", "tab-sim-proj", "tab-an-deep", "tab-an-council", "lekha-reports", "v3-ai-host"].some((p) => item.panes.includes(p))} />
        {demo && <div className="border-b border-[color-mix(in_srgb,var(--warn)_40%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_10%,var(--background))] px-3 py-1.5 text-[12.5px]"><div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-3 gap-y-1"><FlaskConical className="size-3.5 text-[var(--warn)]" /><b className="font-mono text-[11px] tracking-wider text-[var(--warn)]">SAMPLE PORTFOLIO</b><span className="text-muted-foreground">A fictional portfolio on live market data where available. {signedIn ? "Your real account data is untouched." : ""}</span>{signedIn ? <a className="ml-auto text-primary hover:underline" href={location.pathname}>Exit demo</a> : <a className="ml-auto text-primary hover:underline" href="/login.html">Create a free account for your own holdings</a>}</div></div>}
        <div className="mx-auto flex max-w-[1700px]">
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 border-r border-border lg:block">{side}</aside>
          <main className="min-w-0 flex-1 px-3 pb-16 pt-4 sm:px-6" id="main">
            <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[12px] text-muted-foreground"><span>{group}</span><ChevronRight className="size-3" /><span className="text-foreground">{item.title}{route.param ? ` · ${route.param}` : ""}</span></nav>
            {isPane ? <><PageHeader title={item.title} description={item.desc} /><PanelHost ids={item.panes} analyst={item.analyst} route={r} /></> : Page ? <Page route={r} item={item} navigate={navigate} me={me} /> : null}
            <footer className="mt-12 border-t border-border pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
              <p>LEKHA Financials is analysis software, not investment advice. Market data may be delayed; figures marked “calculated” are produced by the app from the cited sources. <a className="text-primary hover:underline" href="#/account/legal">Terms, privacy and data licensing</a> · <a className="text-primary hover:underline" href="#/account/about">About</a></p>
              <div id="app-foot-slot" />
            </footer>
          </main>
        </div>
        <Sheet open={menu} onOpenChange={setMenu}><SheetContent side="left" className="p-0">{side}</SheetContent></Sheet>
        <CommandPalette open={search} onOpenChange={setSearch} navigate={navigate} />
        <ThemeDialog open={theme} onOpenChange={setTheme} />
        <LangDialog open={lang} onOpenChange={setLang} />
        <Toaster theme="system" position="bottom-right" toastOptions={{ style: { background: "var(--popover)", color: "var(--fg)", border: "1px solid var(--line)" } }} />
      </div>
    </TooltipProvider>)
}
