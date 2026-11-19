import { useEffect, useRef } from "react"

const ANALYST_VIEW = { ask: "chat", chat: "chat", brief: "brief", sim: "sim" }

export default function PanelHost({ ids, analyst, route, active = true }) {
  const ref = useRef(null)
  useEffect(() => {
    const host = ref.current, stage = document.getElementById("stage"); if (!host || !stage) return
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean)
    els.forEach((el) => { el.hidden = false; host.appendChild(el) })
    const S = window.LEKHA_SHELL; if (S) S._setRoute(route, true)
    let timer = null
    if (analyst) {
      const view = ANALYST_VIEW[analyst] || analyst
      let n = 0
      timer = setInterval(() => {
        const b = host.querySelector(`[data-v="${view}"]`)
        if (b) { if (b.getAttribute("aria-pressed") !== "true") b.click(); clearInterval(timer); timer = null }
        else if (++n > 40) { clearInterval(timer); timer = null }
      }, 120)
    }
    return () => {
      if (timer) clearInterval(timer)
      els.forEach((el) => { el.hidden = true; stage.appendChild(el) })
    }
  }, [ids.join(","), analyst, route.key])
  return <div ref={ref} className="cx min-w-0" data-panehost />
}
