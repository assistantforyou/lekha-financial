import { Fragment } from "react"
import { ChartCard, fromSpec } from "@/components/Charts"
import { cn } from "@/lib/utils"

/* Small, dependency-free Markdown renderer for AI answers: headings, bold/italic/code/strikethrough, links, lists
   (nested, ordered), block quotes, rules, pipe tables with alignment, fenced code and fenced ```chart blocks.
   It builds React elements only (never raw HTML), so model output cannot inject markup, and it tolerates partial
   input: a table or fence that is still streaming shows as plain text until it is complete. */

const INLINE_SRC = /(`[^`\n]+`)|(\*\*[^\n]+?\*\*)|(~~[^~\n]+?~~)|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))|(\[E\d+(?:\s*,\s*E\d+)*\])|(\*[^*\s][^*\n]*?\*)|(\b_[^_\s][^_\n]*?_\b)|(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g

// A citation chip should say what it cites: the evidence id plus the source it came from, with the
// full label, source and time on hover. Without a lookup it falls back to the bare id.
const shortSrc = (e) => {
  if (!e) return ""
  const s = /^web search/i.test(String(e.label || "")) ? "web" : String(e.source || "")
  return s.split("·")[0].replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 22)
}

// a new RegExp per call: the function recurses into bold/italic text, and a shared global regex would lose its position
function inline(text, k = "i", cites = null) {
  const out = []
  let last = 0, m, n = 0
  const INLINE = new RegExp(INLINE_SRC.source, "g")
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${k}-${n++}`, s = m[0]
    if (m[1]) out.push(<code key={key} className="rounded bg-[var(--panel-2)] px-1 py-0.5 font-mono text-[0.85em]">{s.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={key} className="font-semibold">{inline(s.slice(2, -2), key, cites)}</strong>)
    else if (m[3]) out.push(<del key={key} className="opacity-70">{inline(s.slice(2, -2), key, cites)}</del>)
    else if (m[4]) out.push(<a key={key} href={m[6]} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2">{inline(m[5], key, cites)}</a>)
    else if (m[7]) {
      const ids = s.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean), ev = cites || {}
      const one = ids.length === 1 ? shortSrc(ev[ids[0]]) : ""
      const title = ids.map((id) => { const e = ev[id]; return e ? `${id}: ${e.label || e.tool || ""}${e.source ? " — " + e.source : ""}${e.asOf ? " — " + e.asOf : ""}` : id }).join("\n")
      const chip = <sup title={title} className="mx-0.5 rounded bg-[var(--accent-soft)] px-1 text-[0.68em] font-medium text-[var(--accent)]">{ids.join(", ")}{one && <span className="opacity-75"> · {one}</span>}</sup>
      const src = ids.length === 1 ? (ev[ids[0]] || null) : null
      // A single citation with a page behind it opens that page: the number is the way to the passage.
      out.push(src && src.url ? <a key={key} href={src.url} target="_blank" rel="noopener noreferrer" className="no-underline">{chip}</a> : <span key={key}>{chip}</span>)
    }
    else if (m[8] || m[9]) out.push(<em key={key}>{inline(s.slice(1, -1), key, cites)}</em>)
    else out.push(<a key={key} href={s} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--accent)] underline underline-offset-2">{s}</a>)
    last = m.index + s.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const lines = (text, k, cites) => String(text).split("\n").map((l, i, a) => <Fragment key={i}>{inline(l, `${k}-${i}`, cites)}{i < a.length - 1 && <br />}</Fragment>)

const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const cells = (row) => {
  let r = row.trim()
  if (r.startsWith("|")) r = r.slice(1)
  if (r.endsWith("|") && !r.endsWith("\\|")) r = r.slice(0, -1)
  return r.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim())
}
const isTableStart = (ls, i) => ls[i] && ls[i].includes("|") && ls[i + 1] !== undefined && SEP.test(ls[i + 1]) && ls[i + 1].includes("-") && cells(ls[i]).length === cells(ls[i + 1]).length
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const HEAD = /^(#{1,4})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s*```\s*([\w-]*)\s*$/

/* A signed figure on its own in a table cell is coloured by direction: a plain number stays neutral. */
const tone = (t) => (/^[+]\d[\d,]*(\.\d+)?\s*(%|x)?$/.test(t) ? "up-t" : /^[-−]\d[\d,]*(\.\d+)?\s*(%|x)?$/.test(t) ? "down-t" : "")
const numeric = (t) => /^[-+\u2212]?[$\u20ac\u00a3\u0e3f]?[\d,]+(\.\d+)?\s*(%|x|[BMKT])?$/.test(t)

function Table({ head, align, rows, k, cites }) {
  const al = (i) => (align[i] === "r" ? "text-right" : align[i] === "c" ? "text-center" : "text-left")
  return (
    <div className="my-1 overflow-x-auto rounded-md border border-[var(--line)]">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead className="bg-[var(--panel-2)]">
          <tr>{head.map((h, i) => <th key={i} scope="col" className={cn("whitespace-nowrap border-b border-[var(--line)] px-2.5 py-1.5 font-semibold", al(i))}>{inline(h, `${k}h${i}`, cites)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-[var(--line)] last:border-0 odd:bg-transparent even:bg-[var(--panel-2)]/40">
              {head.map((_, i) => {
                const t = r[i] ?? ""
                return <td key={i} className={cn("px-2.5 py-1.5 align-top", al(i), numeric(t) && "num whitespace-nowrap", tone(t))}>{inline(t, `${k}r${ri}c${i}`, cites)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function buildList(items, k, cites) {
  // items: [{indent, ordered, text, children}] flat; nest by indentation
  const root = { children: [], indent: -1 }, stack = [root]
  for (const it of items) {
    while (stack.length > 1 && it.indent <= stack[stack.length - 1].indent) stack.pop()
    const node = { ...it, children: [] }
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  const render = (nodes, kk, depth) => {
    const ordered = nodes[0] && nodes[0].ordered, Tag = ordered ? "ol" : "ul"
    return (
      <Tag key={kk} className={cn("space-y-0.5 pl-5", ordered ? "list-decimal" : depth % 2 ? "list-[circle]" : "list-disc", depth > 0 && "mt-0.5")}>
        {nodes.map((n, i) => <li key={i} className="pl-0.5">{lines(n.text, `${kk}-${i}`, cites)}{n.children.length > 0 && render(n.children, `${kk}-${i}c`, depth + 1)}</li>)}
      </Tag>
    )
  }
  return render(root.children, k, 0)
}

export function parse(text) {
  const ls = String(text || "").replace(/\r\n?/g, "\n").split("\n"), blocks = []
  let i = 0
  const startsBlock = (j) => FENCE.test(ls[j]) || HEAD.test(ls[j]) || RULE.test(ls[j]) || LIST.test(ls[j]) || /^\s*>/.test(ls[j]) || isTableStart(ls, j)
  while (i < ls.length) {
    const l = ls[i]
    if (!l.trim()) { i++; continue }
    let m = FENCE.exec(l)
    if (m) {
      const lang = m[1].toLowerCase(), body = []
      let j = i + 1
      while (j < ls.length && !/^\s*```\s*$/.test(ls[j])) body.push(ls[j++])
      const closed = j < ls.length
      blocks.push({ t: "fence", lang, text: body.join("\n"), closed })
      i = closed ? j + 1 : j
      continue
    }
    if ((m = HEAD.exec(l))) { blocks.push({ t: "h", level: m[1].length, text: m[2] }); i++; continue }
    if (RULE.test(l)) { blocks.push({ t: "hr" }); i++; continue }
    if (isTableStart(ls, i)) {
      const head = cells(ls[i]), align = cells(ls[i + 1]).map((c) => (/^:-*:$/.test(c) ? "c" : /-:$/.test(c) ? "r" : "l")), rows = []
      i += 2
      while (i < ls.length && ls[i].trim() && ls[i].includes("|")) rows.push(cells(ls[i++]))
      blocks.push({ t: "table", head, align, rows })
      continue
    }
    if (/^\s*>/.test(l)) {
      const q = []
      while (i < ls.length && /^\s*>/.test(ls[i])) q.push(ls[i++].replace(/^\s*>\s?/, ""))
      blocks.push({ t: "quote", text: q.join("\n") })
      continue
    }
    if (LIST.test(l)) {
      const items = []
      while (i < ls.length && ls[i].trim()) {
        const lm = LIST.exec(ls[i])
        if (lm && items.length && lm[1].replace(/\t/g, "    ").length === items[0].indent && /\d/.test(lm[2]) !== items[0].ordered) break
        if (lm) items.push({ indent: lm[1].replace(/\t/g, "    ").length, ordered: /\d/.test(lm[2]), text: lm[3] })
        else if (items.length && /^\s+\S/.test(ls[i]) && !startsBlock(i)) items[items.length - 1].text += "\n" + ls[i].trim()
        else break
        i++
      }
      blocks.push({ t: "list", items })
      continue
    }
    const p = [l]
    i++
    while (i < ls.length && ls[i].trim() && !startsBlock(i)) p.push(ls[i++])
    blocks.push({ t: "p", text: p.join("\n") })
  }
  return blocks
}

const HEADING = {
  1: "mt-2 text-base font-semibold tracking-tight",
  2: "mt-2 border-b border-[var(--line)] pb-1 text-[0.95rem] font-semibold tracking-tight",
  3: "mt-1.5 text-sm font-semibold",
  4: "mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]",
}

export default function Markdown({ text, className, cites }) {
  const blocks = parse(text)
  return (
    <div className={cn("space-y-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]", className)}>
      {blocks.map((b, i) => {
        const k = `b${i}`
        if (b.t === "h") { const H = `h${Math.min(b.level + 1, 6)}`; return <H key={k} className={HEADING[b.level]}>{inline(b.text, k, cites)}</H> }
        if (b.t === "hr") return <hr key={k} className="border-[var(--line)]" />
        if (b.t === "table") return <Table key={k} k={k} head={b.head} align={b.align} rows={b.rows} cites={cites} />
        if (b.t === "quote") return <blockquote key={k} className="border-l-2 border-[var(--accent)] pl-3 text-[var(--muted)]">{lines(b.text, k, cites)}</blockquote>
        if (b.t === "list") return buildList(b.items, k, cites)
        if (b.t === "fence") {
          if (b.lang === "chart" && b.closed) {
            let spec = null
            try { spec = fromSpec(JSON.parse(b.text)) } catch (e) { spec = null }
            if (spec) return <ChartCard key={k} chart={spec} />
          }
          if (b.lang === "chart" && !b.closed) return <p key={k} className="text-xs text-[var(--muted)]">Drawing chart...</p>
          return <pre key={k} className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--panel-2)] p-2.5 font-mono text-xs leading-snug">{b.text}</pre>
        }
        return <p key={k}>{lines(b.text, k)}</p>
      })}
    </div>
  )
}
