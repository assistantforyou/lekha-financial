import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleHelp, Search, Lock } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TREE } from "@/nav"
import { allows, featureOfRoute, PLAN_NAME, planFor } from "@/lib/entitlements"
import { ui } from "@/tour/copy"
import { startTour } from "@/tour/store"
import { capture } from "@/lib/analytics"

const KEY = "ptpub.v1.app.tree"
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null") } catch (e) { return null } }
/* Collapsible tree: groups open/closed state persists; the active group always opens; a filter box narrows leaves.
   The filter starts as a button, not a field: opening the menu on a phone must not raise the keyboard. */
export default function Sidebar({ routeKey, isAdmin, tier, onNavigate, className }) {
  const [open, setOpen] = useState(() => load() || Object.fromEntries(TREE.map((g) => [g.id, g.id === "portfolio"])))
  const [q, setQ] = useState("")
  const [searching, setSearching] = useState(false)
  const box = useRef(null)
  useEffect(() => { if (searching && box.current) box.current.focus() }, [searching])
  useEffect(() => { const g = routeKey.split("/")[0]; setOpen((o) => (o[g] ? o : { ...o, [g]: true })) }, [routeKey])
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(open)) } catch (e) {} }, [open])
  const ql = q.trim().toLowerCase()
  const groups = useMemo(() => TREE.map((g) => ({ ...g, items: g.items.filter((i) => (!i.admin || isAdmin) && (!ql || i.title.toLowerCase().includes(ql) || g.title.toLowerCase().includes(ql) || (i.desc || "").toLowerCase().includes(ql))) })).filter((g) => g.items.length), [ql, isAdmin])
  const allOpen = TREE.every((g) => open[g.id])
  return (
    <nav aria-label="Main navigation" className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 p-3 pb-2">
        <div className="relative min-w-0 flex-1">
          {searching
            ? <><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input ref={box} value={q} onChange={(e) => { if (!q) capture("nav_filter_used"); setQ(e.target.value) }} onBlur={() => { if (!q.trim()) setSearching(false) }} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setSearching(false) } }} placeholder="Filter pages…" className="h-8 pl-8 text-[13px]" aria-label="Filter pages" /></>
            : <button type="button" onClick={() => setSearching(true)} className="flex h-8 w-full items-center gap-2 rounded-md border border-border px-2.5 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"><Search className="size-3.5 shrink-0" /><span className="truncate">Filter pages</span></button>}
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => { capture("nav_groups_toggled", { action: allOpen ? "collapse_all" : "expand_all" }); setOpen(Object.fromEntries(TREE.map((g) => [g.id, !allOpen]))) }} aria-label={allOpen ? "Collapse all" : "Expand all"} title={allOpen ? "Collapse all" : "Expand all"}>{allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}</Button>
      </div>
      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((g) => { const isOpen = ql ? true : !!open[g.id], activeGroup = routeKey.split("/")[0] === g.id
          return (
            <Collapsible key={g.id} open={isOpen} onOpenChange={(v) => { capture("nav_group_toggled", { group: g.id, open: v }); setOpen((o) => ({ ...o, [g.id]: v })) }} className="mb-0.5">
              <CollapsibleTrigger className={cn("group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-semibold uppercase tracking-wide outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40", activeGroup ? "text-foreground" : "text-muted-foreground")}>
                <g.icon className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{g.title}</span><ChevronRight className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="ml-[18px] mt-0.5 space-y-px border-l border-border pl-2">
                  {g.items.map((i) => { const key = `${g.id}/${i.id}`, on = routeKey === key, f = featureOfRoute(key), lock = !!f && !!tier && !allows(tier, f)
                    return (<li key={key}><a href={"#/" + key} onClick={() => { capture("nav_item_clicked", { screen: key, group: g.id }); onNavigate && onNavigate(key) }} aria-current={on ? "page" : undefined}
                      className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/40", on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                      <i.icon className={cn("size-3.5 shrink-0", on && "text-primary")} /><span className="min-w-0 flex-1 truncate">{i.title}</span>{(i.admin || lock) && <Lock className="size-3 opacity-60" aria-label={lock ? `${PLAN_NAME[planFor(f)]} feature` : "Admin only"} />}</a></li>) })}
                </ul>
              </CollapsibleContent>
            </Collapsible>) })}
        {!groups.length && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No pages match “{q}”.</p>}
      </div>
      <div className="space-y-2 border-t border-border p-3 text-[11px] text-muted-foreground"><button type="button" onClick={() => { capture("tour_replayed", { surface: "sidebar" }); onNavigate && onNavigate(); startTour(300) }} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[12px] outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40" translate="no"><CircleHelp className="size-3.5" />{ui("replayHead")}</button></div>
    </nav>)
}
