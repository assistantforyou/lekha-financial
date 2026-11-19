/* Portfolio Terminal core: charts. Hand-drawn SVG at the container's real pixel width (no shrinking viewBox, so text stays
   readable on phones), colours from CSS variables (every theme restyles them), and every label produced by the caller's
   formatters, which use Intl for the chosen language, so axes, tooltips and legends are translated with the rest of the app. */
const NS = "http://www.w3.org/2000/svg";
const mk = (tag, a) => { const e = document.createElementNS(NS, tag); if (a) for (const k in a) e.setAttribute(k, a[k]); return e; };
export function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || Math.abs(hi) || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag, step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10)); return out;
}
export function sparkline(vals, { w = 80, h = 28, up } = {}) {
  if (!vals || vals.length < 2) return "";
  const lo = Math.min(...vals), hi = Math.max(...vals), sx = (i) => (i / (vals.length - 1)) * w, sy = (v) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
  const d = vals.map((v, i) => (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(v).toFixed(1)).join("");
  const dir = up == null ? vals[vals.length - 1] >= vals[0] : up;
  return `<svg class="spark ${dir ? "up" : "down"}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
/* LineChart: opts = {series:[{id,label,color,pts:[[x,y]],width,dash,area}], bands:[{hi:[[x,y]],lo:[[x,y]],opacity}], markers:[{x,label,tone}],
   ref:y, xFmt(x), yFmt(y), tip(x, rows)->html, height, yPad, xTicks, label} */
export function LineChart(host, opts) {
  host.classList.add("chart"); host.innerHTML = "";
  const svg = mk("svg", { role: "img", "aria-label": opts.label || "" }), tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true;
  host.append(svg, tip);
  let o = opts, W = 0, geo = null;
  function draw() {
    W = Math.max(240, Math.round(host.clientWidth || 320));
    const mobile = W < 520, H = o.height || (mobile ? Math.round(W * 0.62) : Math.round(Math.min(380, Math.max(240, W * 0.34))));
    const mrows = o.markers && o.markers.length ? (o.markers.length > 3 ? 3 : 1) : 0, L = mobile ? 54 : 60, R = mobile ? 10 : 18, T = 14 + mrows * (mobile ? 19 : 21) + (mrows ? 6 : 0), B = mobile ? 24 : 28, fs = mobile ? 11 : 12;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.innerHTML = "";
    const all = []; o.series.forEach((s) => s.pts.forEach((p) => all.push(p))); (o.bands || []).forEach((b) => { b.hi.forEach((p) => all.push(p)); b.lo.forEach((p) => all.push(p)); });
    if (!all.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of all) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    if (o.ref != null) { y0 = Math.min(y0, o.ref); y1 = Math.max(y1, o.ref); }
    const pad = (y1 - y0) * (o.yPad != null ? o.yPad : 0.08) || Math.abs(y1) * 0.05 || 1; y0 -= pad; y1 += pad;
    const pw = W - L - R, ph = H - T - B, sx = (x) => L + ((x - x0) / (x1 - x0 || 1)) * pw, sy = (y) => T + (1 - (y - y0) / (y1 - y0 || 1)) * ph;
    geo = { sx, sy, x0, x1, L, R, T, B, pw, ph, H };
    for (const v of niceTicks(y0, y1, mobile ? 3 : 4)) { const y = sy(v); svg.append(mk("line", { x1: L, x2: W - R, y1: y, y2: y, class: "grid" })); const tx = mk("text", { x: L - 6, y: y + 4, "text-anchor": "end", "font-size": fs, class: "ax" }); tx.textContent = o.yFmt ? o.yFmt(v) : v; svg.append(tx); }
    const nx = o.xTicks || (mobile ? 3 : 5);
    for (let i = 0; i <= nx; i++) { const x = x0 + ((x1 - x0) * i) / nx, tx = mk("text", { x: L + (pw * i) / nx, y: H - 7, "text-anchor": i === 0 ? "start" : i === nx ? "end" : "middle", "font-size": fs, class: "ax" }); tx.textContent = o.xFmt ? o.xFmt(x) : x; svg.append(tx); }
    const line = (pts) => pts.map((p, i) => (i ? "L" : "M") + sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1)).join("");
    for (const b of o.bands || []) svg.append(mk("path", { d: line(b.hi) + b.lo.slice().reverse().map((p) => "L" + sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1)).join("") + "Z", fill: b.color || "var(--accent)", opacity: b.opacity || 0.15 }));
    if (o.ref != null) {
      svg.append(mk("line", { x1: L, x2: W - R, y1: sy(o.ref), y2: sy(o.ref), class: "refline" }));
      if (o.refLabel) { const rt = mk("text", { x: W - R - 4, y: sy(o.ref) - 6, "text-anchor": "end", "font-size": fs, class: "reflabel" }); rt.textContent = o.refLabel; svg.append(rt); }
    }
    for (const s of o.series) {
      if (!s.pts.length) continue;
      if (s.area) svg.append(mk("path", { d: line(s.pts) + `L${sx(s.pts[s.pts.length - 1][0]).toFixed(1)} ${T + ph}L${sx(s.pts[0][0]).toFixed(1)} ${T + ph}Z`, fill: s.color, opacity: 0.1 }));
      svg.append(mk("path", { d: line(s.pts), fill: "none", stroke: s.color, "stroke-width": s.width || 2.2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": s.dash || "" }));
    }
    let lastX = -99, row = 0; const rr = mobile ? 8 : 9;
    for (const m of o.markers || []) {
      const x = sx(m.x); if (x < L || x > W - R) continue;
      row = x - lastX < rr * 2 + 1 ? (row + 1) % mrows : 0; lastX = x;
      const c = m.tone === "down" ? "var(--down)" : m.tone === "up" ? "var(--up)" : "var(--muted)", cy = 10 + rr + row * (rr * 2 + 3);
      svg.append(mk("line", { x1: x, x2: x, y1: cy + rr, y2: T + ph, stroke: c, "stroke-dasharray": "3 4", opacity: 0.45 }));
      svg.append(mk("circle", { cx: x, cy, r: rr, fill: "var(--card)", stroke: c, "stroke-width": 1.4 }));
      const tx = mk("text", { x, y: cy + 3.6, "text-anchor": "middle", "font-size": 10.5, fill: c, "font-weight": 700 }); tx.textContent = m.label; svg.append(tx);
    }
    const cur = mk("g", { visibility: "hidden" }), guide = mk("line", { y1: T, y2: T + ph, class: "guide" }); cur.append(guide);
    const dots = o.series.map((s) => { const d = mk("circle", { r: 4, fill: s.color, stroke: "var(--card)", "stroke-width": 1.6 }); cur.append(d); return d; });
    svg.append(cur);
    const hit = mk("rect", { x: L, y: T, width: pw, height: ph, fill: "transparent", style: "touch-action:pan-y;cursor:crosshair" }); svg.append(hit);
    const bsearch = (pts, x) => { let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] < x) lo = m + 1; else hi = m; } return lo > 0 && Math.abs(pts[lo - 1][0] - x) < Math.abs(pts[lo][0] - x) ? lo - 1 : lo; };
    /* drag to measure: press, drag across the chart, and the shaded window reports the change between the two ends */
    if (o.measure) {
      const sel = mk("g", { visibility: "hidden", "pointer-events": "none" });
      const shade = mk("rect", { y: T, height: ph, fill: "var(--accent)", opacity: "0.14" });
      const e1 = mk("line", { y1: T, y2: T + ph, class: "guide" }), e2 = mk("line", { y1: T, y2: T + ph, class: "guide" });
      sel.append(shade, e1, e2); svg.append(sel);
      const mtip = document.createElement("div"); mtip.className = "mtip"; mtip.hidden = true; host.append(mtip);
      const pxOf = (ev) => { const b = svg.getBoundingClientRect(); return Math.max(L, Math.min(W - R, ((ev.clientX - b.left) / b.width) * W)); };
      const xvOf = (px) => x0 + ((px - L) / pw) * (x1 - x0);
      let from = null;
      const clear = () => { sel.setAttribute("visibility", "hidden"); mtip.hidden = true; };
      const render = (a, b) => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        sel.setAttribute("visibility", "visible");
        shade.setAttribute("x", lo); shade.setAttribute("width", Math.max(1, hi - lo));
        e1.setAttribute("x1", lo); e1.setAttribute("x2", lo); e2.setAttribute("x1", hi); e2.setAttribute("x2", hi);
        const s = o.series.find((x) => x.pts && x.pts.length); if (!s) return;
        const p1 = s.pts[bsearch(s.pts, xvOf(lo))], p2 = s.pts[bsearch(s.pts, xvOf(hi))];
        const d = p2[1] - p1[1], pc = p1[1] ? d / p1[1] : 0;
        mtip.innerHTML = o.measureFmt ? o.measureFmt(p1, p2, d, pc) : `<b>${o.xFmt ? o.xFmt(p1[0]) : p1[0]} → ${o.xFmt ? o.xFmt(p2[0]) : p2[0]}</b><span class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : "−"}${o.yFmt ? o.yFmt(Math.abs(d)) : Math.abs(d).toFixed(2)} · ${(pc * 100).toFixed(1)}%</span>`;
        mtip.hidden = false;
        const rel = (((lo + hi) / 2) / W) * host.clientWidth, tw = mtip.offsetWidth;
        mtip.style.left = Math.max(2, Math.min(rel - tw / 2, host.clientWidth - tw - 2)) + "px";
      };
      hit.addEventListener("pointerdown", (ev) => { from = pxOf(ev); try { hit.setPointerCapture(ev.pointerId); } catch (e) {} render(from, from); move(ev); });
      hit.addEventListener("pointermove", (ev) => { if (from != null) { render(from, pxOf(ev)); move(ev); } });
      const done = (ev) => { if (from == null) return; const to = pxOf(ev); if (Math.abs(to - from) < 8) clear(); else render(from, to); from = null; };
      hit.addEventListener("pointerup", done); hit.addEventListener("pointercancel", done);
    }
    function move(ev) {
      const b = svg.getBoundingClientRect(), px = ((ev.clientX - b.left) / b.width) * W, xv = x0 + ((px - L) / pw) * (x1 - x0);
      const rows = o.series.map((s, i) => { if (!s.pts.length) return null; const p = s.pts[bsearch(s.pts, xv)]; dots[i].setAttribute("cx", sx(p[0])); dots[i].setAttribute("cy", sy(p[1])); return { s, p }; }).filter(Boolean);
      if (!rows.length) return;
      const gx = sx(rows[0].p[0]); guide.setAttribute("x1", gx); guide.setAttribute("x2", gx); cur.setAttribute("visibility", "visible");
      tip.innerHTML = o.tip ? o.tip(rows[0].p[0], rows) : ""; tip.hidden = false;
      const rel = (gx / W) * b.width, tw = tip.offsetWidth; tip.style.left = Math.max(2, Math.min(rel - tw / 2, b.width - tw - 2)) + "px";
    }
    const leave = () => { cur.setAttribute("visibility", "hidden"); tip.hidden = true; };
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", leave); hit.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") setTimeout(leave, 1400); });
  }
  const ro = new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) draw(); }); ro.observe(host);
  draw();
  return { update(n) { o = n; draw(); }, destroy() { ro.disconnect(); } };
}
