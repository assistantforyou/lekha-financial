import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataState, Stat } from "@/components/common"
import { useData } from "@/lib/api"
import { compact, num, pct, price, tone } from "@/lib/fmt"
import { cn } from "@/lib/utils"
import * as E from "@fin/engine.mjs"

/* The company valuation. The server sends the input pack once; from then on every change is computed here, in the browser, by the same engine that produced the
   defaults (api/_fin/valuation/engine.mjs), so moving an input updates the result at once with no request. */

const SCEN = [["bear", "Bear"], ["base", "Base"], ["bull", "Bull"]]
const ccyOf = (d) => d.currency || "USD"
const money = (v) => compact(v, false)

function RangeBar({ bear, base, bull, px, mine, ccy }) {
  const vals = [bear, base, bull, px, mine].filter((x) => Number.isFinite(x)), lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.1 || 1, a = lo - pad, span = hi - lo + 2 * pad
  const at = (v) => `${Math.max(0, Math.min(100, ((v - a) / span) * 100))}%`
  const label = `Value per share: bear ${price(bear, ccy)}, base ${price(base, ccy)}, bull ${price(bull, ccy)}; price ${price(px, ccy)}`
  return (
    <div role="img" aria-label={label} className="space-y-1.5" data-testid="range-bar">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--line)]" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]" style={{ left: at(bear), width: `calc(${at(bull)} - ${at(bear)})` }} />
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-[var(--accent)]" style={{ left: at(base) }} title="Base" />
        <div className="absolute top-0 h-9 w-px bg-foreground" style={{ left: at(px) }}><span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-medium text-foreground">Price</span></div>
        {Number.isFinite(mine) && <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-foreground bg-[var(--accent)]" style={{ left: at(mine) }} title="Your case" />}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>Bear <b className="num text-foreground">{price(bear, ccy)}</b></span><span>Base <b className="num text-foreground">{price(base, ccy)}</b></span><span>Bull <b className="num text-foreground">{price(bull, ccy)}</b></span></div>
      <p className="text-[11px] text-muted-foreground">Shaded band: bear to bull. Tick: base case. Vertical line: current price.{Number.isFinite(mine) ? " Diamond: your case." : ""}</p>
    </div>)
}

function Grid({ g, fmtRow, fmtCol, rowName, colName, px, ccy }) {
  if (!g) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] border-collapse text-[12px]"><thead><tr><th className="p-1 text-left font-medium text-muted-foreground">{rowName} \ {colName}</th>{g.cols.map((c, i) => <th key={i} className="num p-1 text-right font-medium text-muted-foreground">{fmtCol(c)}</th>)}</tr></thead>
        <tbody>{g.rows.map((r, i) => <tr key={i}><th className="num p-1 text-left font-medium text-muted-foreground">{fmtRow(r)}</th>{g.cells[i].map((v, j) => <td key={j} className={cn("num p-1 text-right", i === 2 && j === 2 && "rounded bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] font-semibold", v != null && px != null && (v >= px ? "text-[var(--up)]" : "text-[var(--down)]"))}>{v == null ? "–" : price(v, ccy)}</td>)}</tr>)}</tbody></table>
    </div>)
}

function Body({ d }) {
  const v2 = d.v2, pack = v2.pack, def = v2.defaults, ri = v2.model === "ri", ccy = ccyOf(d)
  const [scen, setScen] = useState("base"), [edits, setEdits] = useState({}), [tm, setTm] = useState("")
  const sc = def.scenarios && def.scenarios[scen], edited = Object.keys(edits).length > 0
  const A = useMemo(() => (sc ? { ...sc, ...edits } : def.skeleton && tm !== "" && Number.isFinite(parseFloat(tm)) ? { ...def.skeleton, marginTarget: parseFloat(tm) / 100, ...edits } : null), [sc, edits, def.skeleton, tm])
  const r = useMemo(() => (A ? E.value(pack, A) : null), [pack, A])
  const all = useMemo(() => (def.scenarios ? E.valueAll(pack, def) : {}), [pack, def])
  const rg = useMemo(() => (A && pack.comparable ? E.reverseGrowth(pack, A, pack.price) : null), [pack, A])
  const rm = useMemo(() => (A && !ri && pack.comparable ? E.reverseMargin(pack, A, pack.price) : null), [pack, A, ri])
  const sens = useMemo(() => (A ? E.sensitivity(pack, A) : null), [pack, A])
  const set = (patch) => setEdits((e) => ({ ...e, ...patch }))
  const unset = (keys) => setEdits((e) => { const n = { ...e }; for (const k of keys) delete n[k]; return n })
  const px = pack.comparable ? pack.price : null, ok = !!(r && r.ok), ps = ok ? r.perShare : null, mos = px && ps != null && ps > 0 ? 1 - px / ps : null

  const field = (id, label, keys, eff, scale = 100, step = "0.5", unit = "%") => {
    const k = keys[0], shown = edits[k] != null ? +(edits[k] * scale).toFixed(2) : ""
    return (<div key={id} className="space-y-1.5"><Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2"><Input id={id} type="number" step={step} value={shown} placeholder={eff != null ? (eff * scale).toFixed(1) : ""}
        onChange={(e) => { const x = e.target.value; if (x === "" || !Number.isFinite(parseFloat(x))) return unset(keys); const f = parseFloat(x) / scale; set(Object.fromEntries(keys.map((kk) => [kk, kk === "roeT" ? null : f]))) }} /><span className="text-sm text-muted-foreground">{unit}</span></div></div>)
  }
  const eff = A || {}
  const warnings = [...new Set([...(def.warnings || []), ...(ok ? r.warnings : [])])]

  if (!A && v2.applicable === "none" && !def.skeleton) return <Alert variant="warn"><AlertTitle>Valuation not applicable</AlertTitle><AlertDescription>{v2.reason || "The filings do not support a valuation."} Use the multiples above.</AlertDescription></Alert>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{ri ? "Residual income (financials)" : "Free cash flow to the firm"}</Badge>
        {sc && <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="Scenario">{SCEN.map(([k, l]) => <button key={k} type="button" aria-pressed={scen === k} onClick={() => { setScen(k); setEdits({}) }} className={cn("px-3 py-1 text-xs font-medium", scen === k ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>}
        {edited && <Button size="sm" variant="ghost" onClick={() => setEdits({})}>Reset to defaults</Button>}
        {pack.shares && pack.shares.basis && <span className="ml-auto text-[11px] text-muted-foreground">Shares: {pack.shares.basis}</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {field("dcf-growth", ri ? "Starting return on equity" : "Starting growth (10y fade)", ri ? ["roe0", "roeT"] : ["g1"], ri ? eff.roe0 : eff.g1)}
        {field("dcf-discount", ri ? "Cost of equity" : "Discount rate (WACC)", ri ? ["ke", "wacc"] : ["wacc"], ri ? eff.ke : eff.wacc)}
        {field("dcf-terminalGrowth", "Terminal growth", ["gT"], eff.gT)}
      </div>
      {!ri && (
        <details className="rounded-md border border-border px-3 py-2 text-sm"><summary className="cursor-pointer text-[13px] font-medium">Advanced assumptions</summary>
          <div className="grid gap-3 pt-3 sm:grid-cols-3">
            {field("dcf-margin", "Target operating margin", ["marginTarget"], eff.marginTarget)}
            {field("dcf-s2c", "Sales-to-capital (revenue per dollar of capital added)", ["s2c"], eff.s2c, 1, "0.1", "x")}
            {field("dcf-roict", "Terminal return on capital", ["roicT"], ok ? r.terminal.roic : null)}
          </div></details>)}
      {v2.needsTargetMargin && !sc && (
        <div className="space-y-1.5 rounded-md border border-border p-3"><Label htmlFor="dcf-targetMargin">Target operating margin (percent) the business can reach</Label>
          <Input id="dcf-targetMargin" type="number" step="0.5" value={tm} onChange={(e) => setTm(e.target.value)} placeholder="for example 15" className="max-w-40" />
          <p className="text-xs text-muted-foreground">{v2.reason}</p></div>)}

      {A && ok && (<>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {ps != null ? <Stat label="Intrinsic / share" value={price(ps, ccy)} sub={edited ? "your case" : `${scen} case`} /> : <Stat label="Equity value" value={`${money(r.equity)} ${ccy}`} sub="per share unavailable" />}
          <Stat label="Price" value={price(pack.price, d.quoteCurrency)} />
          <Stat label="Margin of safety" value={pct(mos, 1, true)} tone={tone(mos)} />
          {ri ? <Stat label="Implied price / book" value={r.diagnostics.impliedPriceToBook != null ? `${r.diagnostics.impliedPriceToBook.toFixed(2)}x` : "–"} /> : <Stat label="Terminal value share" value={pct(r.tvShare, 0)} hint="Share of enterprise value that comes from the terminal value: high means the result is sensitive to long-run assumptions." />}
        </div>
        {sc && ["bear", "base", "bull"].every((k) => all[k] && all[k].ok && all[k].perShare != null) && px != null && <RangeBar bear={all.bear.perShare} base={all.base.perShare} bull={all.bull.perShare} px={px} mine={edited ? ps : null} ccy={ccy} />}
        {(rg || rm) && (
          <p className="text-sm" data-testid="implied-growth">
            At the current price the market is assuming a starting {ri ? "return on equity" : "growth rate"} of <b className="num">{rg && rg.value != null ? pct(rg.value, 1) : rg && rg.note === "above range" ? "above " + pct(ri ? E.CONST.REVERSE_ROE[1] : E.CONST.REVERSE_G1[1], 0) : rg && rg.note === "below range" ? "below " + pct(ri ? E.CONST.REVERSE_ROE[0] : E.CONST.REVERSE_G1[0], 0) : "–"}</b> a year, against <b className="num">{pct(ri ? eff.roe0 : eff.g1, 1)}</b> in this model
            {rm && rm.value != null ? <>, or a long-run operating margin of <b className="num">{pct(rm.value, 1)}</b> against <b className="num">{pct(eff.marginTarget, 1)}</b></> : null}. The gap is what the price needs to be true.
          </p>)}
        {warnings.length > 0 && <Alert variant="warn"><AlertTitle>Read with care</AlertTitle><AlertDescription><ul className="list-disc space-y-1 pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></AlertDescription></Alert>}

        <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-[13px] font-medium">{ri ? "Ten-year projection" : "Ten-year projection (free cash flow to the firm)"}</summary>
          <div className="overflow-x-auto pt-3"><Table>
            {ri ? <><TableHeader><TableRow><TableHead>Year</TableHead><TableHead className="text-right">ROE</TableHead><TableHead className="text-right">Net income</TableHead><TableHead className="text-right">Opening book</TableHead><TableHead className="text-right">Residual income</TableHead><TableHead className="text-right">Present value</TableHead></TableRow></TableHeader>
              <TableBody>{r.rows.map((x) => <TableRow key={x.t}><TableCell>{x.t}</TableCell><TableCell className="num text-right">{pct(x.roe, 1)}</TableCell><TableCell className="num text-right">{money(x.ni)}</TableCell><TableCell className="num text-right">{money(x.bvOpen)}</TableCell><TableCell className="num text-right">{money(x.ri)}</TableCell><TableCell className="num text-right">{money(x.pv)}</TableCell></TableRow>)}</TableBody></>
              : <><TableHeader><TableRow><TableHead>Year</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Growth</TableHead><TableHead className="text-right">EBIT margin</TableHead><TableHead className="text-right">NOPAT</TableHead><TableHead className="text-right">Reinvested</TableHead><TableHead className="text-right">FCFF</TableHead><TableHead className="text-right">Present value</TableHead></TableRow></TableHeader>
              <TableBody>{r.rows.map((x) => <TableRow key={x.t}><TableCell>{x.t}</TableCell><TableCell className="num text-right">{money(x.rev)}</TableCell><TableCell className="num text-right">{pct(x.g, 1)}</TableCell><TableCell className="num text-right">{pct(x.margin, 1)}</TableCell><TableCell className="num text-right">{money(x.nopat)}</TableCell><TableCell className="num text-right">{money(x.reinv)}</TableCell><TableCell className="num text-right">{money(x.fcff)}</TableCell><TableCell className="num text-right">{money(x.pv)}</TableCell></TableRow>)}</TableBody></>}
          </Table></div>
          {!ri && <p className="pt-2 text-xs text-muted-foreground">Terminal: NOPAT {money(r.terminal.nopat)} with {pct(r.terminal.reinvestmentRate, 0)} reinvested (growth {pct(r.terminal.g, 1)} over a {pct(r.terminal.roic, 1)} return on capital) gives free cash flow {money(r.terminal.fcff)}, a terminal value of {money(r.tv)}.{r.diagnostics.exitEvEbit != null ? ` That is ${r.diagnostics.exitEvEbit.toFixed(1)}x EBIT${r.diagnostics.exitEvEbitda != null ? ` and ${r.diagnostics.exitEvEbitda.toFixed(1)}x EBITDA` : ""} at the end of year 10.` : ""}</p>}
        </details>

        <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-[13px] font-medium">From {ri ? "book value" : "enterprise value"} to value per share</summary>
          <Table className="mt-2"><TableBody>
            {ri ? <>
              <TableRow><TableCell>Book equity</TableCell><TableCell className="num text-right">{money(r.bridge.bookValue)}</TableCell></TableRow>
              <TableRow><TableCell>Present value of residual income</TableCell><TableCell className="num text-right">{money(r.bridge.pvResidualIncome)}</TableCell></TableRow>
              <TableRow><TableCell>Present value of terminal residual income</TableCell><TableCell className="num text-right">{money(r.bridge.pvTerminal)}</TableCell></TableRow></> : <>
              <TableRow><TableCell>Present value of ten years of free cash flow</TableCell><TableCell className="num text-right">{money(r.pvExplicit)}</TableCell></TableRow>
              <TableRow><TableCell>Present value of the terminal value</TableCell><TableCell className="num text-right">{money(r.pvTerminal)}</TableCell></TableRow>
              <TableRow><TableCell className="font-medium">Enterprise value{pack.stub > 0.01 ? " (rolled forward to today)" : ""}</TableCell><TableCell className="num text-right font-medium">{money(r.ev)}</TableCell></TableRow>
              {[["Cash", r.bridge.cash, 1], ["Short-term investments", r.bridge.sti, 1], ["Long-term marketable securities", r.bridge.lti, 1], ["Debt", r.bridge.debt, -1], ["Lease liabilities", r.bridge.leases, -1], ["Minority interest", r.bridge.minority, -1], ["Preferred equity", r.bridge.preferred, -1]].filter(([, x]) => x).map(([l, x, sg]) => <TableRow key={l}><TableCell>{sg > 0 ? "plus" : "less"} {l.toLowerCase()}</TableCell><TableCell className="num text-right">{money(sg * x)}</TableCell></TableRow>)}</>}
            <TableRow><TableCell className="font-medium">Equity value</TableCell><TableCell className="num text-right font-medium">{money(r.equity)}</TableCell></TableRow>
            <TableRow><TableCell>{r.bridge.shares ? "Shares (" + (pack.shares.basis || "reported") + ")" : "Shares"}</TableCell><TableCell className="num text-right">{r.bridge.shares ? compact(r.bridge.shares, false) : "not available"}</TableCell></TableRow>
          </TableBody></Table>
        </details>

        {sens && <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-[13px] font-medium">Sensitivity: value per share</summary>
          <div className="grid gap-4 pt-3 lg:grid-cols-2">
            <div><p className="mb-1 text-xs text-muted-foreground">{ri ? "Cost of equity by terminal growth" : "Discount rate by terminal growth"}</p><Grid g={sens.a} rowName={ri ? "ke" : "WACC"} colName="g" fmtRow={(x) => pct(x, 1)} fmtCol={(x) => pct(x, 1)} px={px} ccy={ccy} /></div>
            <div><p className="mb-1 text-xs text-muted-foreground">{ri ? "Cost of equity by starting ROE" : "Starting growth by target margin"}</p><Grid g={sens.b} rowName={ri ? "ke" : "growth"} colName={ri ? "ROE" : "margin"} fmtRow={(x) => pct(x, 1)} fmtCol={(x) => pct(x, 1)} px={px} ccy={ccy} /></div>
          </div><p className="pt-2 text-xs text-muted-foreground">Green is above the current price, red below it. The shaded cell is the case above.</p></details>}

        <details className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-[13px] font-medium">Method and sources</summary>
          <div className="space-y-2 pt-3 text-[13px] leading-relaxed text-muted-foreground">
            {ri ? <p>For banks, insurers and other balance-sheet financials a free-cash-flow model does not apply, so value is book equity plus the present value of earnings above the cost of equity (residual income). Return on equity fades from its recent level toward the cost of equity; book value grows with retained earnings; a terminal value follows.</p>
              : <p>Free cash flow to the firm is after-tax operating profit minus reinvestment. Operating profit is GAAP operating income, so stock compensation and R&D are costs and nothing is added back. Revenue grows at the starting rate and fades to the terminal rate over ten years; the operating margin moves to its target over five; reinvestment is the change in revenue divided by sales-to-capital, so growth is paid for with capital. The terminal value needs reinvestment of terminal growth divided by the return on capital, which fades toward the discount rate. Cash flows are discounted mid-year at the weighted average cost of capital, from the last fiscal year end and rolled forward to today.</p>}
            <p>Bear, base and bull use the 25th percentile, median and 75th percentile of the last five years of revenue growth, the five-year low, three-year mean and five-year high of the operating margin, and discount rates 0.75 points above, at and below the base case. It is a model, not a price target; the Intrinsic value page uses its own scenario model and can differ. No analyst estimates are used.</p>
            {def.provenance && Object.keys(def.provenance).length > 0 && <ul className="list-disc space-y-1 pl-4">{Object.entries(def.provenance).map(([k, x]) => <li key={k}>{x}</li>)}</ul>}
          </div></details>
      </>)}
      {A && r && !r.ok && <Alert variant="warn"><AlertTitle>This combination cannot be valued</AlertTitle><AlertDescription>{r.message}</AlertDescription></Alert>}
    </div>)
}

export default function DcfCard({ symbol }) {
  const v = useData("valuation", { symbol }, { enabled: true, refresh: 0 })
  const d = v.status === "ok" ? v.data : null
  return (
    <Card><CardHeader><CardTitle>Valuation</CardTitle><CardDescription>Filing-based, with every assumption editable and a bear, base and bull range. Changes recalculate instantly. This is a model, not a price target.</CardDescription></CardHeader>
      <CardContent><DataState s={v}>{d && (d.v2 ? <Body d={d} key={symbol} /> : <Alert variant="warn"><AlertTitle>Valuation unavailable</AlertTitle><AlertDescription>The valuation could not be built for this company.</AlertDescription></Alert>)}</DataState></CardContent></Card>)
}
