import { useEffect, useRef, useState } from "react"
import { CheckCircle2, CircleSlash, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataState, PageHeader, Stat } from "@/components/common"
import { api } from "@/lib/api"
import { ago, pct } from "@/lib/fmt"
import { cn } from "@/lib/utils"

/* ---------------- Diagnostics (admin) ---------------- */
function useDiag() {
  const [s, set] = useState({ status: "loading" }), [n, setN] = useState(0)
  useEffect(() => { let dead = false; set((p) => (p.status === "ok" ? p : { status: "loading" })); api("/api/data/diag", { auth: true }).then((j) => !dead && set({ status: "ok", data: j })).catch((e) => !dead && set({ status: "error", error: e.status === 401 || e.status === 403 ? "Admins only. Sign in with an admin account." : e.message })); return () => { dead = true } }, [n])
  return { ...s, reload: () => setN((x) => x + 1) }
}
const dot = (ok) => (ok ? <CheckCircle2 className="size-4 text-[var(--up)]" /> : <CircleSlash className="size-4 text-muted-foreground" />)
export function Diagnostics({ item }) {
  const d = useDiag(), costs = useRef(null)
  useEffect(() => { if (d.status !== "ok" || !window.PT_UI) return; let dead = false; (async () => { try { await PT_UI.renderSettings(); const c = document.getElementById("set-costs"); if (c && costs.current && !dead) costs.current.appendChild(c) } catch (e) {} })(); return () => { dead = true; const c = document.getElementById("set-costs"), p = document.getElementById("tab-set"); if (c && p) p.appendChild(c) } }, [d.status])
  const x = d.data
  return (<div><PageHeader title={item.title} description={item.desc}><Button variant="outline" onClick={d.reload}>Refresh</Button></PageHeader>
    <DataState s={d} rows={6}>{x && <Tabs defaultValue="providers"><TabsList><TabsTrigger value="providers">Providers</TabsTrigger><TabsTrigger value="cache">Cache & tools</TabsTrigger><TabsTrigger value="ai">AI & tokens</TabsTrigger><TabsTrigger value="env">Environment</TabsTrigger><TabsTrigger value="costs">Running costs</TabsTrigger></TabsList>
      <TabsContent value="providers" className="space-y-4"><Alert><div><AlertTitle>{x.providers.filter((p) => p.configured).length} of {x.providers.length} integrations active</AlertTitle><AlertDescription>{x.note} Instance up {Math.round(x.sinceMs / 60000)} min.</AlertDescription></div></Alert>
        <Card><CardContent className="pt-5"><Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Configured</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Errors</TableHead><TableHead className="text-right">Avg ms</TableHead><TableHead>Last error</TableHead><TableHead>Licence note</TableHead></TableRow></TableHeader>
          <TableBody>{x.providerTable.map((p) => <TableRow key={p.name}><TableCell className="font-mono font-semibold">{p.name}</TableCell><TableCell>{dot(p.configured)}</TableCell><TableCell className="num text-right">{p.calls}</TableCell><TableCell className={cn("num text-right", p.fail && "down-t")}>{p.fail} ({pct(p.errorRate, 0)})</TableCell><TableCell className="num text-right">{p.calls ? p.avgMs : "–"}</TableCell><TableCell className="max-w-[24ch] truncate text-xs text-muted-foreground" title={p.lastError || ""}>{p.lastError || "–"}</TableCell><TableCell className="max-w-[34ch] text-xs text-muted-foreground">{p.license}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>Recent calls</CardTitle></CardHeader><CardContent><ul className="max-h-72 space-y-1 overflow-auto font-mono text-[12px]">{x.recent.map((r, i) => <li key={i} className="flex items-center gap-2">{r.ok ? <CheckCircle2 className="size-3.5 text-[var(--up)]" /> : <XCircle className="size-3.5 text-[var(--down)]" />}<span className="text-muted-foreground">{new Date(r.t).toLocaleTimeString()}</span><span>{r.kind === "tool" ? "tool " + r.tool : r.provider + " " + r.op}</span><span className="ml-auto text-muted-foreground">{r.ms} ms{r.err ? " · " + r.err : ""}</span></li>)}{!x.recent.length && <li className="text-muted-foreground">No calls yet on this instance.</li>}</ul></CardContent></Card></TabsContent>
      <TabsContent value="cache" className="space-y-4"><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Stat label="Cache hit rate" value={x.cache.hitRate == null ? "–" : pct(x.cache.hitRate, 1)} sub={`${x.cache.total} lookups`} /><Stat label="Hits / stale / misses" value={`${x.cache.hit} / ${x.cache.stale} / ${x.cache.miss}`} /><Stat label="Memory entries" value={x.cacheEntries} /><Stat label="Failed tool calls" value={x.tools.reduce((a, t) => a + t.fail, 0)} /></div>
        <Card><CardHeader><CardTitle>By data class</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Class</TableHead><TableHead className="text-right">Hit</TableHead><TableHead className="text-right">Stale</TableHead><TableHead className="text-right">Miss</TableHead></TableRow></TableHeader><TableBody>{Object.entries(x.cache.byClass).map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="num text-right">{v.hit}</TableCell><TableCell className="num text-right">{v.stale}</TableCell><TableCell className="num text-right">{v.miss}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>AI agent tool calls</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Tool</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Failures</TableHead><TableHead className="text-right">Avg ms</TableHead><TableHead>Last error</TableHead></TableRow></TableHeader><TableBody>{x.tools.map((t) => <TableRow key={t.name}><TableCell className="font-mono">{t.name}</TableCell><TableCell className="num text-right">{t.calls}</TableCell><TableCell className={cn("num text-right", t.fail && "down-t")}>{t.fail} ({pct(t.failRate, 0)})</TableCell><TableCell className="num text-right">{t.avgMs}</TableCell><TableCell className="text-xs text-muted-foreground">{t.lastError || "–"}</TableCell></TableRow>)}{!x.tools.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No agent runs on this instance yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="ai"><Card><CardHeader><CardTitle>Metered AI usage, last 7 days</CardTitle><CardDescription>From the usage log (no prompts stored). Includes statement import, news briefing, analyst, council and the research agent (jobs agent-plan / agent-answer).</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Job</TableHead><TableHead>Model</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Input tokens</TableHead><TableHead className="text-right">Output tokens</TableHead><TableHead className="text-right">USD</TableHead></TableRow></TableHeader><TableBody>{x.tokens7d.map((t, i) => <TableRow key={i}><TableCell className="font-mono">{t.job}</TableCell><TableCell>{t.model}</TableCell><TableCell className="num text-right">{t.calls}</TableCell><TableCell className="num text-right">{t.in.toLocaleString("en-US")}</TableCell><TableCell className="num text-right">{t.out.toLocaleString("en-US")}</TableCell><TableCell className="num text-right">${t.usd.toFixed(4)}</TableCell></TableRow>)}{!x.tokens7d.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No metered calls in the last 7 days.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="env"><Card><CardHeader><CardTitle>Environment</CardTitle><CardDescription>Which secrets are present on the server. Values are never sent to the browser.</CardDescription></CardHeader><CardContent className="grid gap-1.5 sm:grid-cols-2">{Object.entries(x.env).map(([k, v]) => <div key={k} className="flex items-center gap-2 text-[13px]">{dot(v)}<span className="font-mono">{k}</span><span className="ml-auto text-xs text-muted-foreground">{v ? "set" : "not set"}</span></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="costs"><div ref={costs} className="cx" /></TabsContent></Tabs>}</DataState></div>)
}

/* ---------------- Audit report (admin) ---------------- */
const AUDIT_DAYS = [1, 7, 14, 30]
function useAuditReport(days) {
  const [s, set] = useState({ status: "loading" }), [n, setN] = useState(0)
  useEffect(() => { let dead = false; set((p) => (p.status === "ok" && p.days === days ? p : { status: "loading", days })); api(`/api/data/audit?days=${days}`, { auth: true }).then((j) => !dead && set({ status: "ok", days, data: j })).catch((e) => !dead && set({ status: "error", days, error: e.status === 401 || e.status === 403 ? "Admins only. Sign in with an admin account." : e.message })); return () => { dead = true } }, [days, n])
  return { ...s, reload: () => setN((x) => x + 1) }
}
const n0 = (v) => (Number(v) || 0).toLocaleString("en-US")
export function Audit({ item }) {
  const [days, setDays] = useState(7), a = useAuditReport(days), x = a.data
  const fails = x ? x.byRoute.reduce((t, r) => t + r.errors, 0) : 0
  const limited = x ? x.byRoute.reduce((t, r) => t + r.rateLimited, 0) : 0
  const denied = x ? x.byRoute.reduce((t, r) => t + r.denied, 0) : 0
  const server = x ? x.byDay.reduce((t, d) => t + d.serverErrors, 0) : 0
  return (<div><PageHeader title={item.title} description={item.desc}>
      <div className="flex items-center gap-1">{AUDIT_DAYS.map((d) => <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>{d === 1 ? "24 h" : `${d} days`}</Button>)}</div>
      <Button variant="outline" onClick={a.reload}>Refresh</Button>
    </PageHeader>
    <DataState s={a} rows={5}>{x && <div className="space-y-4">
      {x.truncated && <Alert><div><AlertTitle>Showing the most recent 20,000 events</AlertTitle><AlertDescription>Choose a shorter window to see every event in range.</AlertDescription></div></Alert>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Events" value={n0(x.total)} sub={`last ${days === 1 ? "24 hours" : `${days} days`}`} />
        <Stat label="Active users" value={n0(x.activeUsers)} />
        <Stat label="Failed calls" value={n0(fails)} tone={fails ? "down-t" : undefined} sub={x.total ? pct(fails / x.total, 1) : undefined} />
        <Stat label="Rate limited" value={n0(limited)} sub={x.total ? pct(x.total ? limited / x.total : 0, 1) : undefined} />
        <Stat label="Denied" value={n0(denied)} sub="401 and 403" />
      </div>
      <Card><CardHeader><CardTitle>Sign-up to AI funnel</CardTitle><CardDescription>Successful events in the window, counted from the audit log. Rate limited counts signed-in users who hit a limit, not calls.</CardDescription></CardHeader>
        <CardContent><div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Accounts created" value={n0(x.funnel.signedUp)} />
          <Stat label="Sign-ins" value={n0(x.funnel.signedIn)} />
          <Stat label="Asked the analyst" value={n0(x.funnel.usersWhoAskedAI)} />
          <Stat label="Hit a limit" value={n0(x.funnel.usersWhoHitLimit)} />
        </div></CardContent></Card>
      <Card><CardHeader><CardTitle>By route</CardTitle><CardDescription>Sorted by failures. Latency is server time for the handler, p50 and p95 in milliseconds.</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Route</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Failures</TableHead><TableHead className="text-right">Rate limited</TableHead><TableHead className="text-right">Denied</TableHead><TableHead className="text-right">p50 ms</TableHead><TableHead className="text-right">p95 ms</TableHead></TableRow></TableHeader>
          <TableBody>{x.byRoute.map((r) => <TableRow key={r.route}><TableCell className="font-mono text-xs">{r.route}</TableCell><TableCell className="num text-right">{n0(r.calls)}</TableCell><TableCell className={cn("num text-right", r.errors && "down-t")}>{n0(r.errors)} ({pct(r.errorRate, 1)})</TableCell><TableCell className="num text-right">{n0(r.rateLimited)}</TableCell><TableCell className="num text-right">{n0(r.denied)}</TableCell><TableCell className="num text-right">{n0(r.p50)}</TableCell><TableCell className="num text-right">{n0(r.p95)}</TableCell></TableRow>)}
            {!x.byRoute.length && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No events in this window.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Most frequent failures</CardTitle><CardDescription>Status and error code per route. Top 20.</CardDescription></CardHeader>
          <CardContent><Table><TableHeader><TableRow><TableHead>Route</TableHead><TableHead className="text-right">Status</TableHead><TableHead>Code</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
            <TableBody>{x.topErrors.map((e, i) => <TableRow key={i}><TableCell className="font-mono text-xs">{e.route}</TableCell><TableCell className="num text-right">{e.status}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{e.code || "–"}</TableCell><TableCell className="num text-right">{n0(e.n)}</TableCell></TableRow>)}
              {!x.topErrors.length && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No failures in this window.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>Busiest accounts</CardTitle><CardDescription>User id prefix only, never the email. Top 20.</CardDescription></CardHeader>
          <CardContent><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Failures</TableHead><TableHead className="text-right">Routes</TableHead><TableHead className="text-right">Last call</TableHead></TableRow></TableHeader>
            <TableBody>{x.topUsers.map((u) => <TableRow key={u.user}><TableCell className="font-mono text-xs">{u.user}</TableCell><TableCell className="num text-right">{n0(u.calls)}</TableCell><TableCell className={cn("num text-right", u.errors && "down-t")}>{n0(u.errors)}</TableCell><TableCell className="num text-right">{n0(u.routes)}</TableCell><TableCell className="text-right text-xs text-muted-foreground">{u.last ? ago(u.last) : "–"}</TableCell></TableRow>)}
              {!x.topUsers.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No signed-in traffic in this window.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Daily trend</CardTitle><CardDescription>{server ? `${n0(server)} server errors in the window. ` : ""}Users are distinct signed-in accounts per day.</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Day</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Server errors</TableHead><TableHead className="text-right">Users</TableHead></TableRow></TableHeader>
          <TableBody>{x.byDay.map((d) => <TableRow key={d.day}><TableCell className="font-mono text-xs">{d.day}</TableCell><TableCell className="num text-right">{n0(d.calls)}</TableCell><TableCell className={cn("num text-right", d.serverErrors && "down-t")}>{n0(d.serverErrors)}</TableCell><TableCell className="num text-right">{n0(d.users)}</TableCell></TableRow>)}
            {!x.byDay.length && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No events in this window.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      <p className="text-[11.5px] text-muted-foreground">Report generated {x.generatedAt ? new Date(x.generatedAt).toLocaleString() : "–"}. Rows older than the window are excluded by the server, not the browser.</p>
    </div>}</DataState></div>)
}
