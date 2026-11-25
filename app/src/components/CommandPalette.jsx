import { useEffect, useMemo, useState } from "react"
import { Building2, Compass, FileText, Hash, Newspaper, Bot, Clock, CircleHelp } from "lucide-react"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { data, prefetch } from "@/lib/api"
import { searchLocal } from "@/lib/symbols"
import { FLAT } from "@/nav"
import { ui } from "@/tour/copy"
import { startTour } from "@/tour/store"
import { capture } from "@/lib/analytics"

const RK = "ptpub.v1.app.recent"
export const recent = () => { try { return JSON.parse(localStorage.getItem(RK) || "[]") } catch (e) { return [] } }
export const remember = (r) => { try { const l = [r, ...recent().filter((x) => x.symbol !== r.symbol)].slice(0, 6); localStorage.setItem(RK, JSON.stringify(l)) } catch (e) {} }
const CACHE = new Map() // query -> {t, res}; search results change slowly, so repeat keystrokes (backspace, reopen) cost nothing
const ICON = { equity: Building2, etf: Building2, index: Hash, crypto: Hash, future: Hash, ticker: Hash }

/* Universal search: companies, ETFs, indices, crypto (server-side, merged from SEC + built-in lists + optional providers), financial concepts, and every page in the app. */
export default function CommandPalette({ open, onOpenChange, navigate }) {
  const [q, setQ] = useState(""), [res, setRes] = useState(null), [busy, setBusy] = useState(false)
  useEffect(() => { if (!open) { setQ(""); setRes(null) } }, [open])
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const key = q.trim().toLowerCase(); if (!key) { setRes(null); setBusy(false); return }
    const hit = CACHE.get(key); if (hit && Date.now() - hit.t < 5 * 60e3) { setRes({ ...hit.res, q }); setBusy(false); return }
    let dead = false; const t = setTimeout(() => { setBusy(true); data("search", { q }).then((j) => { if (dead) return; CACHE.set(key, { t: Date.now(), res: j.data }); if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value); setRes({ ...j.data, q }) }).catch(() => { if (!dead) setRes({ results: [], concepts: [], intents: [], failed: true, q }) }).finally(() => { if (!dead) setBusy(false) }) }, 90)
    return () => { dead = true; clearTimeout(t) }   // a slow response for an old query can never overwrite a newer one
  }, [q, retry])
  const go = (path, kind) => { capture("search_result_opened", { kind: kind || "page", query_length: q.trim().length }); onOpenChange(false); navigate(path) }
  const ql = q.trim().toLowerCase(), pages = FLAT.filter((p) => !p.admin && (ql ? p.title.toLowerCase().includes(ql) || p.groupTitle.toLowerCase().includes(ql) : false)).slice(0, 6)
  const rc = recent()
  /* instant local matches first (no network), then whatever the server adds; a typed ticker is always one keystroke from opening */
  const merged = useMemo(() => {
    const t = q.trim(); if (!t) return []
    const loc = searchLocal(t, 8), seen = new Set(loc.map((r) => r.symbol)), extra = ((res && res.q === t && res.results) || []).filter((r) => !seen.has(r.symbol))
    const out = [...loc, ...extra].slice(0, 12)
    const direct = t.toUpperCase().replace(/\s+/g, ""); if (/^[A-Z0-9^][A-Z0-9.\-^=]{0,14}$/.test(direct) && !out.some((r) => r.symbol === direct)) out.push({ symbol: direct, name: "Open as ticker", type: "ticker" })
    return out
  }, [q, res])
  // Warm the company page while the visitor is still choosing: the quote for the top matches, the full bundle for the best one.
  // By the time they press Enter the header data is already in the cache.
  const warm = useMemo(() => merged.filter((r) => r.type !== "ticker").slice(0, 3).map((r) => r.symbol).join(","), [merged])
  useEffect(() => { if (!open || !warm) return; const t = setTimeout(() => { const s = warm.split(","); s.forEach((x) => prefetch("quote", { symbol: x })); prefetch("company", { symbol: s[0] }) }, 120); return () => clearTimeout(t) }, [open, warm])
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Search companies, tickers, ETFs, crypto, filings, news, pages…" />
      <CommandList>
        {!ql && rc.length > 0 && <CommandGroup heading="Recent">{rc.map((r) => <CommandItem key={r.symbol} value={"r" + r.symbol} onSelect={() => go("company/" + r.symbol, "recent")}><Clock className="size-4 text-muted-foreground" /><b className="font-mono">{r.symbol}</b><span className="truncate text-muted-foreground">{r.name}</span></CommandItem>)}</CommandGroup>}
        {!ql && <CommandGroup heading="Jump to">{[["research/agent", "AI research agent", Bot], ["research/news", "News search", Newspaper], ["macro/dashboard", "Macro dashboard", Compass], ["analysis/value", "Intrinsic value", FileText], ["portfolio/watchlist", "Watchlist", Compass]].map(([k, t, I]) => <CommandItem key={k} value={k} onSelect={() => go(k, "page")}><I className="size-4 text-muted-foreground" />{t}</CommandItem>)}</CommandGroup>}
        {(!ql || /tour|help|guide|onboard|tutorial/.test(ql)) && <CommandGroup heading={ui("replayHead")}><CommandItem value="quick-tour" onSelect={() => { capture("search_result_opened", { kind: "tour", query_length: q.trim().length }); onOpenChange(false); startTour(300) }}><CircleHelp className="size-4 text-muted-foreground" /><span translate="no">{ui("palette")}</span></CommandItem></CommandGroup>}
        {res && res.q === q && res.intents && res.intents.length > 0 && <CommandGroup heading="Best match">{res.intents.map((i) => <CommandItem key={i.route} value={"i" + i.route} onSelect={() => go(i.route.replace("?tab=", "?tab="), "intent")}>{i.kind === "company" ? <Building2 className="size-4 text-primary" /> : i.kind === "filings" ? <FileText className="size-4 text-muted-foreground" /> : <Newspaper className="size-4 text-muted-foreground" />}<span className="truncate">{i.label}</span></CommandItem>)}</CommandGroup>}
        {merged.length > 0 && <CommandGroup heading="Companies, ETFs, indices, crypto">{merged.map((r) => { const I = ICON[r.type] || Building2; return <CommandItem key={r.symbol + r.type} value={"s" + r.symbol + r.type} onSelect={() => { remember({ symbol: r.symbol, name: r.name }); go("company/" + encodeURIComponent(r.symbol), "symbol") }}><I className="size-4 text-muted-foreground" /><b className="w-24 shrink-0 font-mono">{r.symbol}</b><span className="min-w-0 flex-1 truncate">{r.name}</span><Badge variant="outline">{r.type}</Badge></CommandItem> })}</CommandGroup>}
        {res && res.q === q && res.concepts && res.concepts.length > 0 && <CommandGroup heading="Concepts">{res.concepts.map((c) => <CommandItem key={c.id} value={"c" + c.id} onSelect={() => go(c.route === "company" ? "research/company" : c.route, "concept")}><Hash className="size-4 text-muted-foreground" /><div className="min-w-0"><div>{c.term}</div><div className="truncate text-xs text-muted-foreground">{c.text}</div></div></CommandItem>)}</CommandGroup>}
        {pages.length > 0 && <CommandGroup heading="Pages">{pages.map((p) => <CommandItem key={p.key} value={"p" + p.key} onSelect={() => go(p.key, "page")}><p.icon className="size-4 text-muted-foreground" /><span>{p.title}</span><span className="ml-auto text-xs text-muted-foreground">{p.groupTitle}</span></CommandItem>)}</CommandGroup>}
        {ql && <CommandGroup heading="Ask"><CommandItem value="ask" onSelect={() => go("research/agent?q=" + encodeURIComponent(q), "ask")}><Bot className="size-4 text-primary" />Ask the research agent: “{q}”</CommandItem><CommandItem value="newssearch" onSelect={() => go("research/news?q=" + encodeURIComponent(q), "news")}><Newspaper className="size-4 text-muted-foreground" />Search news for “{q}”</CommandItem></CommandGroup>}
        {ql && !busy && res && res.q === q && res.failed && <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-[var(--down)]" role="alert">Search is unavailable right now. Typed tickers and pages still work.<button className="rounded border border-border px-2 py-0.5 text-xs text-foreground" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>}
        {ql && !busy && res && !res.failed && !merged.length && !pages.length && !(res.concepts || []).length && <CommandEmpty>No matches. Try a ticker (AAPL), a company name, or ask the agent.</CommandEmpty>}
        {busy && <div className="px-4 py-3 text-xs text-muted-foreground">Searching…</div>}
      </CommandList>
    </CommandDialog>)
}
