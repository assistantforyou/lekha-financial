import { useEffect, useState } from "react"
import { Building2, Compass, FileText, Hash, Newspaper, Bot, Clock, CircleHelp } from "lucide-react"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { data } from "@/lib/api"
import { FLAT } from "@/nav"
import { ui } from "@/tour/copy"
import { startTour } from "@/tour/store"

const RK = "ptpub.v1.app.recent"
export const recent = () => { try { return JSON.parse(localStorage.getItem(RK) || "[]") } catch (e) { return [] } }
export const remember = (r) => { try { const l = [r, ...recent().filter((x) => x.symbol !== r.symbol)].slice(0, 6); localStorage.setItem(RK, JSON.stringify(l)) } catch (e) {} }
const ICON = { equity: Building2, etf: Building2, index: Hash, crypto: Hash, future: Hash }

/* Universal search: companies, ETFs, indices, crypto (server-side, merged from SEC + built-in lists + optional providers), financial concepts, and every page in the app. */
export default function CommandPalette({ open, onOpenChange, navigate }) {
  const [q, setQ] = useState(""), [res, setRes] = useState(null), [busy, setBusy] = useState(false)
  useEffect(() => { if (!open) { setQ(""); setRes(null) } }, [open])
  useEffect(() => {
    if (q.trim().length < 1) { setRes(null); return }
    const t = setTimeout(() => { setBusy(true); data("search", { q }).then((j) => setRes(j.data)).catch(() => setRes({ results: [], concepts: [], intents: [], failed: true })).finally(() => setBusy(false)) }, 180)
    return () => clearTimeout(t)
  }, [q])
  const go = (path) => { onOpenChange(false); navigate(path) }
  const ql = q.trim().toLowerCase(), pages = FLAT.filter((p) => !p.admin && (ql ? p.title.toLowerCase().includes(ql) || p.groupTitle.toLowerCase().includes(ql) : false)).slice(0, 6)
  const rc = recent()
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Search companies, tickers, ETFs, crypto, filings, news, pages…" />
      <CommandList>
        {!ql && rc.length > 0 && <CommandGroup heading="Recent">{rc.map((r) => <CommandItem key={r.symbol} value={"r" + r.symbol} onSelect={() => go("company/" + r.symbol)}><Clock className="size-4 text-muted-foreground" /><b className="font-mono">{r.symbol}</b><span className="truncate text-muted-foreground">{r.name}</span></CommandItem>)}</CommandGroup>}
        {!ql && <CommandGroup heading="Jump to">{[["research/agent", "AI research agent", Bot], ["research/news", "News search", Newspaper], ["macro/dashboard", "Macro dashboard", Compass], ["analysis/value", "Intrinsic value", FileText], ["portfolio/watchlist", "Watchlist", Compass]].map(([k, t, I]) => <CommandItem key={k} value={k} onSelect={() => go(k)}><I className="size-4 text-muted-foreground" />{t}</CommandItem>)}</CommandGroup>}
        {(!ql || /tour|help|guide|onboard|tutorial/.test(ql)) && <CommandGroup heading={ui("replayHead")}><CommandItem value="quick-tour" onSelect={() => { onOpenChange(false); startTour(300) }}><CircleHelp className="size-4 text-muted-foreground" /><span translate="no">{ui("palette")}</span></CommandItem></CommandGroup>}
        {res && res.intents && res.intents.length > 0 && <CommandGroup heading="Best match">{res.intents.map((i) => <CommandItem key={i.route} value={"i" + i.route} onSelect={() => go(i.route.replace("?tab=", "?tab="))}>{i.kind === "company" ? <Building2 className="size-4 text-primary" /> : i.kind === "filings" ? <FileText className="size-4 text-muted-foreground" /> : <Newspaper className="size-4 text-muted-foreground" />}<span className="truncate">{i.label}</span></CommandItem>)}</CommandGroup>}
        {res && res.results && res.results.length > 0 && <CommandGroup heading="Companies, ETFs, indices, crypto">{res.results.map((r) => { const I = ICON[r.type] || Building2; return <CommandItem key={r.symbol + r.type} value={"s" + r.symbol + r.type} onSelect={() => { remember({ symbol: r.symbol, name: r.name }); go("company/" + encodeURIComponent(r.symbol)) }}><I className="size-4 text-muted-foreground" /><b className="w-20 shrink-0 font-mono">{r.symbol}</b><span className="min-w-0 flex-1 truncate">{r.name}</span><Badge variant="outline">{r.type}</Badge></CommandItem> })}</CommandGroup>}
        {res && res.concepts && res.concepts.length > 0 && <CommandGroup heading="Concepts">{res.concepts.map((c) => <CommandItem key={c.id} value={"c" + c.id} onSelect={() => go(c.route === "company" ? "research/company" : c.route)}><Hash className="size-4 text-muted-foreground" /><div className="min-w-0"><div>{c.term}</div><div className="truncate text-xs text-muted-foreground">{c.text}</div></div></CommandItem>)}</CommandGroup>}
        {pages.length > 0 && <CommandGroup heading="Pages">{pages.map((p) => <CommandItem key={p.key} value={"p" + p.key} onSelect={() => go(p.key)}><p.icon className="size-4 text-muted-foreground" /><span>{p.title}</span><span className="ml-auto text-xs text-muted-foreground">{p.groupTitle}</span></CommandItem>)}</CommandGroup>}
        {ql && <CommandGroup heading="Ask"><CommandItem value="ask" onSelect={() => { onOpenChange(false); navigate("research/agent?q=" + encodeURIComponent(q)) }}><Bot className="size-4 text-primary" />Ask the research agent: “{q}”</CommandItem><CommandItem value="newssearch" onSelect={() => go("research/news?q=" + encodeURIComponent(q))}><Newspaper className="size-4 text-muted-foreground" />Search news for “{q}”</CommandItem></CommandGroup>}
        {ql && !busy && res && !res.results.length && !pages.length && !(res.concepts || []).length && <CommandEmpty>No matches. Try a ticker (AAPL), a company name, or ask the agent.</CommandEmpty>}
        {busy && <div className="px-4 py-3 text-xs text-muted-foreground">Searching…</div>}
      </CommandList>
    </CommandDialog>)
}
