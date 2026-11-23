import { Bot, Menu, Palette, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, SlidersHorizontal, Languages, CircleUser, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { setCurrency, refreshPrices, toggleCustomize, useCurrency, useCustomizing, useNewsPill, usePricePill, useSession, useTier, isDemo } from "@/lib/engine"

const tone = (cls) => (/err/.test(cls) ? "bg-[var(--down)]" : /stale/.test(cls) ? "bg-[var(--warn)]" : /live/.test(cls) ? "bg-[var(--up)]" : "bg-muted-foreground")
function Pill({ p, label }) { if (!p.text) return null; return <span className="hidden items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/80 xl:inline-flex" title={p.text}><i className={cn("size-1.5 rounded-full", tone(p.cls))} /><span className="max-w-[26ch] truncate">{p.text.replace(/^Prices: |^News: /, "")}</span></span> }

/* The LEKHA banner: always navy, white logo, like V3. Everything global lives here: search, status, currency, refresh, theme, language, AI, account. */
export default function Banner({ onMenu, onSearch, onTheme, onLang, navigate, customizable, navOpen, onNavToggle }) {
  const prices = usePricePill(), news = useNewsPill(), cur = useCurrency(), tier = useTier(), sess = useSession(), customizing = useCustomizing()
  const who = sess && sess.access_token && !isDemo() ? (sess.email || "Account").split("@")[0] : null
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1220] text-white">
      <div className="mx-auto flex h-14 max-w-[1700px] items-center gap-1 px-2 sm:gap-2 sm:px-4">
        <Button variant="ghost" size="icon" className="text-white/80 hover:bg-white/10 hover:text-white lg:hidden" onClick={onMenu} data-tour="menu" aria-label="Open navigation"><Menu /></Button>
        <a href="#/portfolio/overview" className="flex shrink-0 items-center" aria-label="LEKHA Financials home">
          <img src="/v3/brand/lekha-logo-white.png" srcSet="/v3/brand/lekha-logo-white.png 1x, /v3/brand/lekha-logo-white@2x.png 2x" alt="LEKHA Financials" width="561" height="162" className="h-6 w-auto sm:h-8" />
        </a>
        {tier && <span className="hidden rounded-full border border-[#D9A441] px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[#D9A441] sm:inline">{tier}</span>}
        <Tooltip content={navOpen ? "Hide navigation" : "Show navigation"}><Button variant="ghost" size="icon" className="ml-1 hidden text-white/70 hover:bg-white/10 hover:text-white lg:inline-flex" onClick={onNavToggle} aria-label={navOpen ? "Hide navigation" : "Show navigation"} aria-pressed={!!navOpen}>{navOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</Button></Tooltip>
        <button onClick={onSearch} data-tour="search" className="mx-2 hidden h-9 min-w-40 flex-1 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-left text-sm text-white/60 transition hover:bg-white/10 md:flex md:max-w-md" aria-label="Search companies, filings, news and pages">
          <Search className="size-4" /><span className="truncate">Search companies, tickers, filings, news…</span><kbd className="ml-auto rounded border border-white/20 px-1.5 text-[10px] text-white/60">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
          <Pill p={prices} /><Pill p={news} />
          <Button variant="ghost" size="icon" className="text-white/80 hover:bg-white/10 hover:text-white md:hidden" onClick={onSearch} data-tour="search-icon" aria-label="Search"><Search /></Button>
          <div className="hidden items-center overflow-hidden rounded-md border border-white/15 sm:flex" role="group" aria-label="Display currency">
            {["USD", "THB"].map((c) => <button key={c} onClick={() => setCurrency(c)} aria-pressed={cur === c} className={cn("px-2.5 py-1.5 font-mono text-[11px]", cur === c ? "bg-white/15 text-[#D9A441]" : "text-white/70 hover:text-white")}>{c}</button>)}
          </div>
          <Tooltip content="Refresh prices"><Button variant="ghost" size="icon" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={refreshPrices} aria-label="Refresh prices"><RefreshCw /></Button></Tooltip>
          {customizable && <Tooltip content="Reorder, resize and hide panels"><Button variant="ghost" size="sm" className={cn("hidden text-white/80 hover:bg-white/10 hover:text-white sm:inline-flex", customizing && "bg-white/15 text-[#D9A441]")} onClick={toggleCustomize}><SlidersHorizontal />{customizing ? "Done" : "Customize"}</Button></Tooltip>}
          <Tooltip content="Color theme (100 themes)"><Button variant="ghost" size="icon" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={onTheme} aria-label="Color theme"><Palette /></Button></Tooltip>
          <Tooltip content="Language"><Button variant="ghost" size="icon" className="hidden text-white/80 hover:bg-white/10 hover:text-white sm:inline-flex" onClick={onLang} aria-label="Language"><Languages /></Button></Tooltip>
          <Button size="sm" className="bg-[#D9A441] px-2 text-[#0B1220] hover:bg-[#D9A441]/90 sm:px-3" onClick={() => navigate("research/agent")}><Bot /><span className="hidden sm:inline">Ask AI</span></Button>
          {who ? <Button variant="ghost" size="sm" className="px-2 text-white/90 hover:bg-white/10 hover:text-white sm:px-3" onClick={() => navigate("account/profile")}><CircleUser /><span className="hidden max-w-[10ch] truncate sm:inline">{who}</span></Button>
            : <Button variant="outline" size="sm" className="border-white/25 bg-transparent px-2 text-white hover:bg-white/10 hover:text-white sm:px-3" onClick={() => (isDemo() && !(sess && sess.access_token) ? (location.href = "/login.html") : navigate("account/profile"))}>{isDemo() && sess && sess.access_token ? <><CircleUser /><span className="hidden sm:inline">Exit demo</span></> : <><LogIn /><span className="hidden sm:inline">Sign in</span></>}</Button>}
        </div>
      </div>
    </header>)
}
