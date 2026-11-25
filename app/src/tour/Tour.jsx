import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Building2, ChevronRight, Languages, Layers, LineChart, MapPin, Search } from "lucide-react"
import { FLAT } from "@/nav"
import "./tour.css"
import { COPY, LANG_LABEL, LANG_NATIVE, setTourLang, stepCopy, tourLang, ui } from "./copy"
import { M, MOBILE_MAX, place, scrollDelta } from "./layout"
import { STEPS, currentPath, fullPath, hashOf, isAct, lastSym, modeOf, resolve, visible } from "./steps"
import { onStartTour, shouldAutoStart, writeStatus } from "./store"

const WF_ICONS = [Search, Building2, Layers, LineChart]
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches } catch (e) { return false } }
const shortcut = () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "") ? "⌘K" : "Ctrl\u00a0K")
const touchOnly = () => { try { return matchMedia("(hover: none)").matches } catch (e) { return false } }
const signedIn = () => { try { const s = window.PT_AUTH && window.PT_AUTH.session && window.PT_AUTH.session(); return !!(s && s.access_token) } catch (e) { return false } }
const hashKey = (h) => (/^company\//.test(h) ? "research/company" : h)
const where = (h) => { const i = FLAT.find((x) => x.key === hashKey(h)); return i ? [i.groupTitle, i.title] : null }
/* the second highlight: where this page lives in the navigation (the active sidebar entry, or the breadcrumb where the sidebar is hidden) */
const locator = () => { const a = document.querySelector('.shell aside a[aria-current="page"]'); if (visible(a)) return a; const b = document.querySelector('.shell nav[aria-label="Breadcrumb"]'); return visible(b) ? b : null }
/* the sidebar scrolls on its own: bring the active entry into the middle of it, or the "where to find this" highlight would silently be skipped */
const revealInNav = (a) => {
  let sc = null; for (let e = a.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 1) { sc = e; break } }
  if (!sc) return
  const s = sc.getBoundingClientRect(), r = a.getBoundingClientRect(); if (r.top >= s.top + 4 && r.bottom <= s.bottom - 4) return
  sc.scrollTop += (r.top - s.top) - (s.height - r.height) / 2
}
const WAIT = { company: 14000, tabs: 14000 }
const sameGeo = (a, b) => !!a && !!b && a.hidden === b.hidden && a.side === b.side && a.mobile === b.mobile && a.card.x === b.card.x && a.card.y === b.card.y && a.card.w === b.card.w && JSON.stringify(a.spot) === JSON.stringify(b.spot) && JSON.stringify(a.spot2) === JSON.stringify(b.spot2)
const pinned = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "sticky" || p === "fixed") return true } return false }
const header = () => document.querySelector(".shell > header")
const frames = (n) => new Promise((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); f() })
const scrollIdle = () => new Promise((res) => { let last = window.scrollY, same = 0; const t0 = performance.now(); const f = () => { if (window.scrollY === last) same++; else { same = 0; last = window.scrollY } if (same >= 5 || performance.now() - t0 > 1200) res(); else requestAnimationFrame(f) }; requestAnimationFrame(f) })

/* Interactive first-run tour. Spotlights the real DOM, navigates between real routes, waits for each target to render,
   and positions a card beside it (desktop) or as a bottom sheet (phone). All state lives in the refs and the store. */
export default function Tour({ navigate }) {
  const [active, setActive] = useState(false), [ready, setReady] = useState(false)
  const [cur, setCur] = useState(0), [alt, setAlt] = useState(false), [busy, setBusy] = useState(true), [skipped, setSkipped] = useState([])
  const [askPhase, setAskPhase] = useState("idle")
  const [geo, setGeo] = useState(null), [size, setSize] = useState({ w: 360, h: 240 }), [, setLangTick] = useState(0)
  useEffect(() => { const f = () => setLangTick((x) => x + 1); window.addEventListener("lekha:tourlang", f); return () => window.removeEventListener("lekha:tourlang", f) }, [])
  const R = useRef({ token: 0, el: null, prevFocus: null, instantT: 0 }), live = useRef({})
  const rootRef = useRef(null), cardRef = useRef(null), primaryRef = useRef(null)
  const [host] = useState(() => { const d = document.createElement("div"); d.id = "lekha-tour"; d.setAttribute("translate", "no"); d.className = "notranslate"; return d })
  live.current = { cur, busy, skipped, size, active, alt, askPhase }

  const finish = useCallback((status) => { R.current.token++; writeStatus(status); setActive(false); setReady(false) }, [])

  /* ---- go to a step: navigate if needed, wait for its target, scroll it into the free band, then show it ---- */
  const goTo = useCallback((i, dir = 1) => {
    const token = ++R.current.token, step = STEPS[i], t0 = performance.now(), limit = WAIT[step.id] || 6000
    setBusy(true)
    const want = hashOf(step); if (want && (want.includes("?") ? fullPath() : currentPath()) !== want) navigate(want)
    const fail = () => {
      setSkipped((s) => (s.includes(i) ? s : [...s, i]))
      const n = i + dir
      if (n < 0) setBusy(false); else if (n >= STEPS.length) finish("completed"); else goTo(n, dir)
    }
    const poll = async () => {
      if (token !== R.current.token) return
      let r = resolve(step)
      if (r.ok && (r.el || r.none)) {
        await frames(2)                                    // let the route's own effects (scroll to top, panel move) finish
        if (token !== R.current.token) return
        r = resolve(step); if (!(r.ok && (r.el || r.none))) return setTimeout(poll, 90)
        if (r.el && !pinned(r.el)) {
          const vh = window.innerHeight, hb = header() ? header().getBoundingClientRect().bottom : 56, mobile = document.documentElement.clientWidth < MOBILE_MAX
          const d = scrollDelta({ rect: r.el.getBoundingClientRect(), top: hb + 12, bottom: mobile ? vh - live.current.size.h - 28 : vh - 12, need: mobile || step.prefer ? 0 : live.current.size.h + 24 })
          if (d != null && Math.abs(d) >= 2) { window.scrollBy({ top: d, behavior: reduced() ? "auto" : "smooth" }); await scrollIdle(); if (token !== R.current.token) return }
        }
        R.current.el = r.el; setAlt(!!r.alt); setCur(i); setBusy(false); setReady(true)
        return
      }
      if (performance.now() - t0 > limit) return fail()
      setTimeout(poll, 90)
    }
    poll()
  }, [navigate, finish])

  const begin = useCallback(() => {
    if (live.current.active) return
    R.current.prevFocus = document.activeElement; writeStatus("in_progress")
    setSkipped([]); setCur(0); setAlt(false); setReady(false); setActive(true); goTo(0, 1)
  }, [goTo])
  useEffect(() => onStartTour(begin), [begin])
  useEffect(() => { if (!shouldAutoStart()) return; const t = setTimeout(() => { if (shouldAutoStart()) begin() }, 1600); return () => clearTimeout(t) }, [begin])

  const move = useCallback((d) => {
    const { cur: c, busy: b, skipped: s } = live.current; if (b) return
    let n = c + d; while (s.includes(n)) n += d
    if (n < 0) return
    if (n >= STEPS.length) return finish("completed")
    goTo(n, d)
  }, [goTo, finish])
  const skip = useCallback(() => finish(live.current.cur === STEPS.length - 1 ? "completed" : "skipped"), [finish])

  /* ---- while active: mount the host, make the app inert (the tour is the only thing that takes focus), restore on exit ---- */
  useEffect(() => {
    if (!active || !ready) return
    document.body.appendChild(host)
    if (modeOf(STEPS[cur], alt) !== "card") return () => { host.remove(); const p = R.current.prevFocus; if (p && p.isConnected && p.focus) { try { p.focus({ preventScroll: true }) } catch (e) {} } }
    const kids = [...document.body.children].filter((e) => e !== host && !/^(SCRIPT|STYLE|LINK)$/.test(e.tagName) && !e.inert)
    kids.forEach((e) => { e.inert = true })
    return () => { kids.forEach((e) => { e.inert = false }); host.remove(); const p = R.current.prevFocus; if (p && p.isConnected && p.focus) { try { p.focus({ preventScroll: true }) } catch (e) {} } }
  }, [active, ready, host, cur, alt])

  /* ---- keyboard: Esc skips, arrows move, Tab stays inside the card, and the app's own shortcuts are held back ---- */
  useEffect(() => {
    if (!active) return
    const k = (e) => {
      const t = e.target, typing = !!(t && t.closest && !t.closest("#lekha-tour") && t.closest("input, textarea, select, [contenteditable=\"true\"]"))
      if (typing && e.key !== "Escape") return                         // the visitor is typing in the highlighted box: the tour's shortcuts stay out of the way
      if (modeOf(STEPS[live.current.cur], live.current.alt) !== "card") return    // hands-on step: the app's own keys (Esc closes the search box, Ctrl K opens it) work as usual; the card has Skip
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); skip(); return }
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); e.stopImmediatePropagation(); return }
      if (e.key === "ArrowRight" && !e.altKey && !e.metaKey) { e.preventDefault(); const l = live.current.cur === STEPS.length - 1; if (l) { if (!live.current.busy) finish("completed") } else move(1); return }
      if (e.key === "ArrowLeft" && !e.altKey && !e.metaKey) { e.preventDefault(); move(-1); return }
      if (e.key === "Tab" && cardRef.current) {
        const f = [...cardRef.current.querySelectorAll("button:not([disabled])")]; if (!f.length) { e.preventDefault(); return }
        const i = f.indexOf(document.activeElement)
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus() } else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus() }
      }
    }
    window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true)
  }, [active, skip, move, finish])

  /* ---- hands-on steps: move on by itself when the visitor has done the thing (or back out when they undo it) ---- */
  useEffect(() => {
    const step = STEPS[cur]; if (!active || !ready || busy || !isAct(step, alt)) return
    let fired = false; const d0 = step.done ? !!step.done() : true, t0 = performance.now()
    const i = setInterval(() => {
      if (fired || live.current.busy || live.current.cur !== cur) return
      if (step.done && !d0 && step.done()) { fired = true; setTimeout(() => { if (live.current.cur === cur && !live.current.busy) move(1) }, 380); return }
      if (step.back && performance.now() - t0 > 900 && step.back()) { fired = true; move(-1) }
    }, 150)
    return () => clearInterval(i)
  }, [active, ready, busy, cur, alt, move])

  /* ---- the AI step: the tour steps aside while the visitor asks, and comes back beside the answer a few seconds after it lands ---- */
  useEffect(() => { setAskPhase("idle") }, [cur])
  useEffect(() => {
    const f = (e) => { if (!live.current.active) return; const st = STEPS[live.current.cur]; if (!st || !st.pill) return; setAskPhase(e.detail && e.detail.phase === "start" ? "busy" : "done") }
    window.addEventListener("lekha:ask", f); return () => window.removeEventListener("lekha:ask", f)
  }, [])
  useEffect(() => { if (askPhase !== "done") return; const t = setTimeout(() => { const st = STEPS[live.current.cur]; if (st && st.pill) move(1) }, 4000); return () => clearTimeout(t) }, [askPhase, move])
  const jump = useCallback((id) => { const i = STEPS.findIndex((x) => x.id === id); if (i >= 0 && !live.current.busy) goTo(i, 1) }, [goTo])

  /* ---- geometry: re-measure the real element on every scroll, resize, layout change and for a moment after each step ---- */
  const measure = useCallback(() => {
    const { cur: c, busy: b, size: sz } = live.current, step = STEPS[c]; if (!step) return
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, mobile = vw < MOBILE_MAX
    let el = R.current.el
    if (step.target && (step.retarget || !el || !el.isConnected || !visible(el))) { const r = resolve(step); if (r.el) { if (r.el !== R.current.el) { R.current.el = el = r.el; if (step.nav && r.el.closest("aside, [role=\"dialog\"]")) revealInNav(r.el) } else el = r.el } else if (b) return; else el = null }
    let rect = null, top = 0
    if (el) { const bb = el.getBoundingClientRect(), h = header(); rect = { left: bb.left, top: bb.top, right: bb.right, bottom: bb.bottom, height: bb.height }; top = h && !h.contains(el) ? h.getBoundingClientRect().bottom : 0 }
    const mode = modeOf(step, live.current.alt), hidden = !!step.pill && live.current.askPhase !== "idle"
    let g
    if (mode === "quiet" || (mode === "coach" && mobile)) {
      /* docked: above the keyboard (visual viewport) at the bottom, or under the header when the target sits in the lower half, so the card never covers what the visitor is using */
      const vv = window.visualViewport, kb = vv ? Math.max(0, vh - vv.height - vv.offsetTop) : 0, visH = vh - kb, hb = header() ? Math.max(0, header().getBoundingClientRect().bottom) : 56
      const cw = mobile ? Math.min(vw - 2 * M, 520) : Math.min(sz.w || 380, 400)
      const low = !!rect && (rect.top + rect.bottom) / 2 > hb + (visH - hb) * 0.5, atTop = !!step.pill || (mode === "coach" && low)
      const x = mobile || mode === "coach" ? Math.round((vw - cw) / 2) : vw - cw - 20
      const y = atTop ? Math.round(hb + 10) : Math.round(visH - sz.h - 12)
      const spot = rect && !hidden ? { x: Math.max(3, rect.left - 4), y: Math.max(top + 2, rect.top - 4), w: Math.min(vw - 3, rect.right + 4) - Math.max(3, rect.left - 4), h: Math.min(vh - 3, rect.bottom + 4) - Math.max(top + 2, rect.top - 4) } : null
      g = { spot, card: { x, y, w: cw }, side: "dock-" + (atTop ? "top" : "bottom") + "-" + kb }
    } else g = place({ rect, vw, vh, card: sz, top, prefer: step.prefer, mobile })
    g.mobile = mobile; g.spot2 = null; g.hidden = hidden
    if (hidden) g.spot = null
    if (step.where) { const l = locator(); if (l && l.matches("aside a")) revealInNav(l); if (l && !(el && l.contains(el))) { const lb = l.getBoundingClientRect(), hb = header() ? header().getBoundingClientRect().bottom : 0; if (lb.top >= hb - 1 && lb.bottom <= vh) g.spot2 = { x: Math.max(2, lb.left - 4), y: Math.max(2, lb.top - 3), w: Math.min(vw - 4, lb.right + 4) - Math.max(2, lb.left - 4), h: lb.height + 6 } } }
    setGeo((p) => (sameGeo(p, g) ? p : g))
  }, [])
  const rafRef = useRef(0)
  const schedule = useCallback((instant) => {
    if (instant && rootRef.current) { rootRef.current.dataset.instant = "1"; clearTimeout(R.current.instantT); R.current.instantT = setTimeout(() => { if (rootRef.current) delete rootRef.current.dataset.instant }, 160) }
    if (!rafRef.current) rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; measure() })
  }, [measure])

  useLayoutEffect(() => {
    if (!active || !ready || busy) return
    let raf = 0, n = 0
    const loop = () => { measure(); if (++n < 40) raf = requestAnimationFrame(loop) }
    loop()
    const ro = new ResizeObserver(() => schedule(false)); if (R.current.el) ro.observe(R.current.el); ro.observe(document.body)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [active, ready, busy, cur, alt, measure, schedule])

  useEffect(() => {
    if (!active) return
    const s = () => schedule(true), vv = window.visualViewport
    window.addEventListener("scroll", s, true); window.addEventListener("resize", s); window.addEventListener("orientationchange", s)
    if (vv) { vv.addEventListener("resize", s); vv.addEventListener("scroll", s) }
    return () => { window.removeEventListener("scroll", s, true); window.removeEventListener("resize", s); window.removeEventListener("orientationchange", s); if (vv) { vv.removeEventListener("resize", s); vv.removeEventListener("scroll", s) } cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
  }, [active, schedule])

  useLayoutEffect(() => {
    if (!ready || !cardRef.current) return
    const c = cardRef.current, ro = new ResizeObserver(() => { const w = c.offsetWidth, h = c.offsetHeight; setSize((p) => (p.w === w && p.h === h ? p : { w, h })) })
    ro.observe(c); return () => ro.disconnect()
  }, [ready, !!geo])
  useEffect(() => { if (ready) schedule(false) }, [size, ready, schedule])
  useEffect(() => { if (ready && !busy && geo && primaryRef.current && !cardRef.current.contains(document.activeElement)) primaryRef.current.focus({ preventScroll: true }) }, [ready, busy, cur, !!geo])

  if (!active || !ready || !geo) return null
  const step = STEPS[cur], id = step.id, last = cur === STEPS.length - 1, first = cur === 0
  const mode = modeOf(step, alt), act = mode === "coach", pill = !!step.pill && mode === "coach"
  const c = stepCopy(id, { key: shortcut(), symbol: lastSym() }), body = (alt || (id === "search" && touchOnly())) && c.a ? c.a : c.b
  const total = STEPS.length - skipped.length, n = cur + 1 - skipped.filter((s) => s < cur).length
  const sp = geo.spot, sp2 = geo.spot2, vw = document.documentElement.clientWidth, vh = window.innerHeight
  const ok = (r) => !!(r && r.w > 0 && r.h > 0), r1 = ok(sp) ? sp : null, r2 = ok(sp2) ? sp2 : null
  const px = (r, k) => Math.round(r ? r[k] : 0)
  /* the dim layer is a mask with up to two holes (the target, and where it lives in the navigation); holes glide between steps */
  const grad = "linear-gradient(#000,#000)", dim = { maskImage: [grad, grad, grad].join(","), WebkitMaskImage: [grad, grad, grad].join(","), maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskComposite: "exclude,exclude,add", WebkitMaskComposite: "xor,xor,source-over",
    maskSize: `${px(r2, "w")}px ${px(r2, "h")}px,${px(r1, "w")}px ${px(r1, "h")}px,100% 100%`, WebkitMaskSize: `${px(r2, "w")}px ${px(r2, "h")}px,${px(r1, "w")}px ${px(r1, "h")}px,100% 100%`,
    maskPosition: `${px(r2, "x")}px ${px(r2, "y")}px,${px(r1, "x")}px ${px(r1, "y")}px,0 0`, WebkitMaskPosition: `${px(r2, "x")}px ${px(r2, "y")}px,${px(r1, "x")}px ${px(r1, "y")}px,0 0` }
  const ring = (r) => (r ? { transform: `translate(${Math.round(r.x)}px,${Math.round(r.y)}px)`, width: Math.round(r.w), height: Math.round(r.h), opacity: 1 } : { transform: `translate(${Math.round(vw / 2)}px,${Math.round(vh / 2)}px)`, width: 0, height: 0, opacity: 0 })
  const cardStyle = { transform: `translate(${geo.card.x}px,${geo.card.y}px)`, width: geo.card.w }
  const label = ui("step", { n, total }), trail = step.where && mode === "card" ? where(hashOf(step)) : null, roomy = !geo.mobile && vh >= 640 && !!c.pts && mode === "card"
  const lang = tourLang()
  const top = <div className="tour-top"><span className="tour-count">{n} / {total}</span><div className="tour-track" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={n} aria-label={label}><i style={{ width: `${(n / total) * 100}%` }} /></div>
    {mode !== "coach" && <label className="tour-lang" title={LANG_LABEL[lang]}><Languages aria-hidden="true" /><select value={lang} onChange={(e) => setTourLang(e.target.value)} aria-label={LANG_LABEL[lang]}>{Object.keys(COPY).map((k) => <option key={k} value={k} lang={k}>{LANG_NATIVE[k]}</option>)}</select></label>}</div>
  const nextBtn = <button type="button" className={mode === "card" || mode === "quiet" ? "tour-btn pri" : "tour-btn"} ref={primaryRef} onClick={() => (step.skipTo ? jump(step.skipTo) : move(1))} disabled={busy}>{ui("next")}</button>
  return createPortal(
    <div ref={rootRef} className="tour-root" data-mode={mode} data-live={mode !== "card" ? "1" : undefined} lang={tourLang()} translate="no">
      {mode === "card" && <div className="tour-block" aria-hidden="true" />}
      <div className="tour-dim" style={dim} aria-hidden="true" />
      <div className="tour-spot" style={ring(r1)} aria-hidden="true" />
      <div className="tour-spot two" style={ring(r2)} aria-hidden="true" />
      <div ref={cardRef} className="tour-card" data-mode={pill ? "pill" : mode} data-hidden={geo.hidden ? "1" : undefined} role="dialog" aria-modal={mode === "card" ? "true" : undefined} aria-label={ui("label")} aria-labelledby="tour-t" aria-describedby="tour-b" aria-busy={busy} style={cardStyle} tabIndex={-1}>
        {pill ? <div className="tour-pillrow" key="pill"><span className="tour-pill" id="tour-t">{ui("askpill")}</span>{nextBtn}</div> : <>
          {top}
          {trail && <div className="tour-where"><MapPin aria-hidden="true" /><span translate="no">{trail[0]}</span><ChevronRight aria-hidden="true" /><b translate="no">{trail[1]}</b></div>}
          <div className="tour-body" key={cur + (alt ? "a" : "")}>
            <h2 className="tour-title" id="tour-t">{c.t}</h2>
            {act ? <p className="tour-try" id="tour-b">{ui(step.hint || "act")}</p> : <p className="tour-text" id="tour-b">{body}</p>}
            {roomy && <ul className="tour-pts">{c.pts.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}</ul>}
            {last && c.wf && <ol className="tour-wf" aria-hidden="true">{c.wf.map((w, i) => { const I = WF_ICONS[i]; return <li key={i}><span><I />{w}</span>{i < c.wf.length - 1 && <ChevronRight className="sep" />}</li> })}</ol>}
          </div>
          <div className="tour-sr" role="status" aria-live="polite">{label}: {c.t}</div>
          <div className={"tour-foot" + (last ? " last" : "")}>
            {!last && <button type="button" className="tour-btn ghost" onClick={skip}>{ui("skip")}</button>}
            <span className="grow" />
            {!first && <button type="button" className="tour-btn" onClick={() => move(-1)} disabled={busy}>{ui("back")}</button>}
            {last ? <>
              {!signedIn() && <button type="button" className="tour-btn ghost" onClick={() => finish("completed")}>{ui("explore")}</button>}
              {signedIn()
                ? <button type="button" className="tour-btn pri" ref={primaryRef} onClick={() => finish("completed")}>{ui("finish")}</button>
                : <button type="button" className="tour-btn pri" ref={primaryRef} onClick={() => { writeStatus("completed"); location.href = "/login.html?mode=signup" }}>{ui("account")}</button>}
            </> : nextBtn}
          </div></>}
      </div>
    </div>, host)
}
