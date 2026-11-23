import { useEffect, useState } from "react"
import { ArrowRight, FileText, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyBox } from "@/components/common"
import { PageHeader } from "@/components/common"
import { ReportView } from "./council"
import { loadReports, removeReport } from "@/lib/reports"

const verdictVariant = (v) => (v === "Buy" ? "up" : v === "Sell" || v === "Reduce" ? "down" : v === "Hold" ? "secondary" : "warn")

export default function ReportsPage({ navigate }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadReports().then((r) => { setList(r); setLoading(false) }) }, [])

  async function drop(id, e) {
    e.stopPropagation()
    await removeReport(id)
    setList((xs) => xs.filter((x) => x.id !== id))
    if (open && open.id === id) setOpen(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="AI research reports" description="Every council report you have run, saved with its five lenses and verdict." />
      {open ? (
        <div className="space-y-3">
          <Button variant="ghost" onClick={() => setOpen(null)}>Back to all reports</Button>
          <ReportView rep={open} />
        </div>
      ) : loading ? (
        <Card><CardContent className="pt-4 text-sm text-[var(--muted)]">Loading reports</CardContent></Card>
      ) : !list.length ? (
        <EmptyBox>
          <span>No reports yet. A report is written when you run the council: one question, five analytical lenses and a verdict.</span>
          <Button size="sm" onClick={() => navigate("analysis/council")}>Run the council<ArrowRight className="size-4" /></Button>
        </EmptyBox>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((r) => (
            <Card key={r.id} className="cursor-pointer transition-colors hover:border-[var(--accent)]" onClick={() => setOpen(r)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-snug">{r.question}</CardTitle>
                  <Button size="icon" variant="ghost" aria-label="Delete report" onClick={(e) => drop(r.id, e)}><Trash2 className="size-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <Badge variant={verdictVariant(r.ceo && r.ceo.verdict)}>{(r.ceo && r.ceo.verdict) || "Insufficient Evidence"}</Badge>
                  <span>{r.scope === "portfolio" ? "Whole portfolio" : r.scope}</span>
                  {r.at && <span>{String(r.at).slice(0, 10)}</span>}
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-[var(--muted)]">
                <p className="line-clamp-3">{r.ceo && r.ceo.executive}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!open && (
        <p className="flex items-center gap-1 text-xs text-[var(--muted)]"><FileText className="size-3.5" />Reports are kept in this browser and, when you are signed in, in your account.</p>
      )}
    </div>
  )
}
