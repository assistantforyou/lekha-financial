import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Building2, ChevronRight, Languages, Layers, LineChart, MapPin, Search } from "lucide-react"
import { FLAT } from "@/nav"
import "./tour.css"
import { COPY, LANG_LABEL, LANG_NATIVE, setTourLang, stepCopy, tourLang, ui } from "./copy"
import { MOBILE_MAX, place, scrollDelta } from "./layout"
import { EXAMPLE, STEPS, currentPath, resolve, visible } from "./steps"
import { onStartTour, shouldAutoStart, writeStatus } from "./store"
import { capture } from "@/lib/analytics"

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
const sameGeo = (a, b) => !!a && !!b && a.side === b.side && a.mobile === b.mobile && a.card.x === b.card.x && a.card.y === b.card.y && a.card.w === b.card.w && JSON.stringify(a.spot) === JSON.stringify(b.spot) && JSON.stringify(a.spot2) === JSON.stringify(b.spot2)
const pinned = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "sticky" || p === "fixed") return true } return false }
const header = () => document.querySelector(".shell > header")
const frames = (n) => new Promise((r) => { const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f)); f() })
const scrollIdle = () => new Promise((res) => { let last = window.scrollY, same = 0; const t0 = performance.now(); const f = () => { if (window.scrollY === last) same++; else { same = 0; last = window.scrollY } if (same >= 5 || performance.now() - t0 > 1200) res(); else requestAnimationFrame(f) }; requestAnimationFrame(f) })

/* Interactive first-run tour. Spotlights the real DOM, navigates between real routes, waits for each target to render,
   and positions a card beside it (desktop) or as a bottom sheet (phone). All state lives in the refs and the store. */
export default function Tour({ navigate }) {
  const [active, setActive] = useState(false), [ready, setReady] = useState(false)
  const [cur, setCur] = useState(0), [alt, setAlt] = useState(false), [busy, setBusy] = useState(true), [skipped, setSkipped] = useState([])
  const [geo, setGeo] = useState(null), [size, setSize] = useState({ w: 360, h: 240 }), [, setLangTick] = useState(0)
  useEffect(() => { const f = () => setLangTick((x) => x + 1); window.addEventListener("lekha:tourlang", f); return () => window.removeEventListener("lekha:tourlang", f) }, [])
  const R = useRef({ token: 0, el: null, prevFocus: null, instantT: 0 }), live = useRef({})
  const rootRef = useRef(null), cardRef = useRef(null), primaryRef = useRef(null)
  const [host] = useState(() => { const d = document.createElement("div"); d.id = "lekha-tour"; d.setAttribute("translate", "no"); d.className = "notranslate"; return d })
  live.current = { cur, busy, skipped, size, active }

  const finish = useCallback((status) => { capture("tour_finished", { status, steps_seen: live.current.cur + 1, steps_skipped: live.current.skipped.length }); R.current.token++; writeStatus(status); setActive(false); setReady(false) }, [])

  /* ---- go to a step: navigate if needed, wait for its target, scroll it into the free band, then show it ---- */
  const goTo = useCallback((i, dir = 1) => {
    const token = ++R.current.token, step = STEPS[i], t0 = performance.now(), limit = WAIT[step.id] || 6000
    setBusy(true)
    if (currentPath() !== step.hash) navigate(step.hash)
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
        capture("tour_step_viewed", { step: step.id, index: i })
        return
      }
      if (performance.now() - t0 > limit) return fail()
      setTimeout(poll, 90)
    }
    poll()
  }, [navigate, finish])

  const begin = useCallback(() => {
    if (live.current.active) return
    capture("tour_started", { auto: shouldAutoStart() })
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
    const kids = [...document.body.children].filter((e) => e !== host && !/^(SCRIPT|STYLE|LINK)$/.test(e.tagName) && !e.inert)
    kids.forEach((e) => { e.inert = true })
    return () => { kids.forEach((e) => { e.inert = false }); host.remove(); const p = R.current.prevFocus; if (p && p.isConnected && p.focus) { try { p.focus({ preventScroll: true }) } catch (e) {} } }
  }, [active, ready, host])

  /* ---- keyboard: Esc skips, arrows move, Tab stays inside the card, and the app's own shortcuts are held back ---- */
  useEffect(() => {
    if (!active) return
    const k = (e) => {
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

  /* ---- geometry: re-measure the real element on every scroll, resize, layout change and for a moment after each step ---- */
  const measure = useCallback(() => {
    const { cur: c, busy: b, size: sz } = live.current, step = STEPS[c]; if (!step) return
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, mobile = vw < MOBILE_MAX
    let el = R.current.el
    if (step.target && (!el || !el.isConnected || !visible(el))) { const r = resolve(step); if (r.el) { R.current.el = el = r.el } else if (b) return; else el = null }
    let rect = null, top = 0
    if (el) { const bb = el.getBoundingClientRect(), h = header(); rect = { left: bb.left, top: bb.top, right: bb.right, bottom: bb.bottom, height: bb.height }; top = h && !h.contains(el) ? h.getBoundingClientRect().bottom : 0 }
    const g = place({ rect, vw, vh, card: sz, top, prefer: step.prefer, mobile }); g.mobile = mobile; g.spot2 = null
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
  const c = stepCopy(id, { key: shortcut(), symbol: EXAMPLE }), body = (alt || (id === "search" && touchOnly())) && c.a ? c.a : c.b
  const total = STEPS.length - skipped.length, n = cur + 1 - skipped.filter((s) => s < cur).length
  const sp = geo.spot, sp2 = geo.spot2, vw = document.documentElement.clientWidth, vh = window.innerHeight
  const ok = (r) => !!(r && r.w > 0 && r.h > 0), r1 = ok(sp) ? sp : null, r2 = ok(sp2) ? sp2 : null
  const px = (r, k) => Math.round(r ? r[k] : 0)
  /* the dim layer is a mask with up to two holes (the target, and where it lives in the navigation); holes glide between steps */
  const grad = "linear-gradient(#000,#000)", dim = { maskImage: [grad, grad, grad].join(","), WebkitMaskImage: [grad, grad, grad].join(","), maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskComposite: "exclude,exclude,add", WebkitMaskComposite: "xor,xor,source-over",
    maskSize: `${px(r2, "w")}px ${px(r2, "h")}px,${px(r1, "w")}px ${px(r1, "h")}px,100% 100%`, WebkitMaskSize: `${px(r2, "w")}px ${px(r2, "h")}px,${px(r1, "w")}px ${px(r1, "h")}px,100% 100%`,
    maskPosition: `${px(r2, "x")}px ${px(r2, "y")}px,${px(r1, "x")}px ${px(r1, "y")}px,0 0`, WebkitMaskPosition: `${px(r2, "x")}px ${px(r2, "y")}px,${px(r1, "x")}px ${px(r1, "y")}px,0 0` }
  const ring = (r) => (r ? { transform: `translate(${Math.round(r.x)}px,${Math.round(r.y)}px)`, width: Math.round(r.w), height: Math.round(r.h), opacity: 1 } : { transform: `translate(${Math.round(vw / 2)}px,${Math.round(vh / 2)}px)`, width: 0, height: 0, opacity: 0 })
  const cardStyle = geo.mobile ? undefined : { transform: `translate(${geo.card.x}px,${geo.card.y}px)`, width: geo.card.w }
  const label = ui("step", { n, total }), trail = step.where ? where(step.hash) : null, roomy = !geo.mobile && vh >= 640 && !!c.pts
  const lang = tourLang()
  return createPortal(
    <div ref={rootRef} className="tour-root" lang={tourLang()} translate="no">
      <div className="tour-block" aria-hidden="true" />
      <div className="tour-dim" style={dim} aria-hidden="true" />
      <div className="tour-spot" style={ring(r1)} aria-hidden="true" />
      <div className="tour-spot two" style={ring(r2)} aria-hidden="true" />
      <div ref={cardRef} className="tour-card" role="dialog" aria-modal="true" aria-label={ui("label")} aria-labelledby="tour-t" aria-describedby="tour-b" aria-busy={busy} data-sheet={geo.mobile ? "1" : undefined} style={cardStyle} tabIndex={-1}>
        <div className="tour-top"><span className="tour-count">{n} / {total}</span><div className="tour-track" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={n} aria-label={label}><i style={{ width: `${(n / total) * 100}%` }} /></div>
          <label className="tour-lang" title={LANG_LABEL[lang]}><Languages aria-hidden="true" /><select value={lang} onChange={(e) => { capture("tour_language_changed", { lang: e.target.value }); setTourLang(e.target.value) }} aria-label={LANG_LABEL[lang]}>{Object.keys(COPY).map((k) => <option key={k} value={k} lang={k}>{LANG_NATIVE[k]}</option>)}</select></label></div>
        {trail && <div className="tour-where"><MapPin aria-hidden="true" /><span translate="no">{trail[0]}</span><ChevronRight aria-hidden="true" /><b translate="no">{trail[1]}</b></div>}
        <div className="tour-body" key={cur + (alt ? "a" : "")}>
          <h2 className="tour-title" id="tour-t">{c.t}</h2>
          <p className="tour-text" id="tour-b">{body}</p>
          {roomy && <ul className="tour-pts">{c.pts.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}</ul>}
          {last && c.wf && <ol className="tour-wf" aria-hidden="true">{c.wf.map((w, i) => { const I = WF_ICONS[i]; return <li key={i}><span><I />{w}</span>{i < c.wf.length - 1 && <ChevronRight className="sep" />}</li> })}</ol>}
        </div>
        <div className="tour-sr" role="status" aria-live="polite">{label}: {c.t}</div>
        <div className="tour-foot">
          {!last && <button type="button" className="tour-btn ghost" onClick={skip}>{ui("skip")}</button>}
          <span className="grow" />
          {!first && <button type="button" className="tour-btn" onClick={() => move(-1)} disabled={busy}>{ui("back")}</button>}
          {last ? <>
            {!signedIn() && <button type="button" className="tour-btn ghost" onClick={() => finish("completed")}>{ui("explore")}</button>}
            {signedIn()
              ? <button type="button" className="tour-btn pri" ref={primaryRef} onClick={() => finish("completed")}>{ui("finish")}</button>
              : <button type="button" className="tour-btn pri" ref={primaryRef} onClick={() => { capture("tour_account_clicked"); writeStatus("completed"); location.href = "/login.html?mode=signup" }}>{ui("account")}</button>}
          </>
            : <button type="button" className="tour-btn pri" ref={primaryRef} onClick={() => move(1)} disabled={busy}>{ui("next")}</button>}
        </div>
      </div>
    </div>, host)
}
