import { useCallback, useEffect, useState } from "react"
import { CheckCheck, Inbox as InboxIcon, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyBox, ErrorBox, PageHeader } from "@/components/common"
import { api } from "@/lib/api"
import { ago } from "@/lib/fmt"
import { cn } from "@/lib/utils"
import { capture } from "@/lib/analytics"

const KIND = { alert: "Alert", earnings: "Earnings", digest: "Moves", brief: "Brief" }

export default function Inbox({ item, navigate }) {
  const [items, setItems] = useState(null)
  const [unread, setUnread] = useState(0)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (signal) => {
    setErr("")
    try {
      const r = await api("/api/ai/inbox", { signal })
      setItems(Array.isArray(r.items) ? r.items : [])
      setUnread(Number(r.unread) || 0)
    } catch (e) {
      if (e && e.name === "AbortError") return
      setErr(e && e.message ? e.message : "Could not load the inbox")
    }
  }, [])

  useEffect(() => {
    const ctl = new AbortController()
    load(ctl.signal)
    return () => ctl.abort()
  }, [load])

  const mark = async (body) => {
    setBusy(true)
    try {
      const r = await api("/api/ai/inbox", { method: "POST", auth: true, body })
      setUnread(Number(r.unread) || 0)
      setItems((list) => (list || []).map((x) => (body.all || x.id === body.id ? { ...x, read: true } : x)))
      capture("InboxMarkRead", { all: !!body.all })
    } catch (e) {
      setErr(e && e.message ? e.message : "Could not update the inbox")
    } finally { setBusy(false) }
  }

  const drop = async (id) => {
    setBusy(true)
    try {
      await api("/api/ai/inbox", { method: "DELETE", auth: true, body: { id } })
      setItems((list) => (list || []).filter((x) => x.id !== id))
    } catch (e) {
      setErr(e && e.message ? e.message : "Could not delete the item")
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={item.title} description={item.desc}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load()} disabled={busy}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh
            </Button>
            <Button size="sm" onClick={() => mark({ all: true })} disabled={busy || !unread}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />Mark all read
            </Button>
          </div>
        } />

      {err ? <ErrorBox message={err} onRetry={() => load()} /> : null}

      {items === null ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading...</CardContent></Card>
      ) : items.length === 0 ? (
        <EmptyBox icon={InboxIcon} title="Nothing here yet"
          message="Alerts you ask the assistant for, earnings reminders and the daily move digest appear here after the scheduled run." />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "All read"} · {items.length} item{items.length === 1 ? "" : "s"}</p>
          {items.map((x) => (
            <Card key={x.id} className={cn("transition-colors", !x.read && "border-[var(--accent)]/40")}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-medium text-[var(--accent)]">{KIND[x.kind] || x.kind}</span>
                      {x.symbol ? <button className="underline-offset-2 hover:underline" onClick={() => navigate("company/" + x.symbol)}>{x.symbol}</button> : null}
                      <span>{x.createdAt ? ago(x.createdAt) : ""}</span>
                      {!x.read ? <span className="text-[var(--accent)]">unread</span> : null}
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold leading-snug">{x.title}</h3>
                    {x.body ? <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{x.body}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!x.read ? (
                      <Button variant="ghost" size="sm" onClick={() => mark({ id: x.id })} disabled={busy} title="Mark read">
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => drop(x.id)} disabled={busy} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
