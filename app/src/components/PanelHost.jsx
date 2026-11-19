import { useEffect, useRef } from "react"
/* Moves classic engine panels (rendered by the V2/V3 scripts into #stage) into view and back. Ids stay intact, so the engine keeps drawing into them. */
export default function PanelHost({ ids, analyst, route, active = true }) {
  const ref = useRef(null)
  useEffect(() => {
    const host = ref.current, stage = document.getElementById("stage"); if (!host || !stage) return
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean)
    els.forEach((el) => { el.hidden = false; host.appendChild(el) })
    const S = window.LEKHA_SHELL; if (S) S._setRoute(route, true)
    if (analyst) { let n = 0; const t = setInterval(() => { const b = host.querySelector(`[data-v="${analyst}"]`); if (b) { if (b.getAttribute("aria-pressed") !== "true") b.click(); clearInterval(t) } else if (++n > 30) clearInterval(t) }, 120); var cleanup = () => clearInterval(t) }
    return () => { cleanup && cleanup(); els.forEach((el) => { el.hidden = true; stage.appendChild(el) }) }
  }, [ids.join(","), analyst, route.key])
  return <div ref={ref} className="cx min-w-0" data-panehost />
}
