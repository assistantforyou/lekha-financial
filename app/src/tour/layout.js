/* Pure placement maths for the tour (no DOM): where the spotlight and the card go for a target rectangle.
   Desktop: the card sits beside the target when there is room (bottom, top, right, left in the step's order).
   When the target is too large for any side, the card takes the free edge of the viewport and the spotlight shrinks to the part still visible.
   Mobile: a bottom sheet; the spotlight is limited to the band above it. */
export const M = 12, GAP = 14, PAD = 6, MOBILE_MAX = 640
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export function place({ rect, vw, vh, card, top = 0, prefer = ["bottom", "top", "right", "left"], mobile }) {
  const cw = mobile ? Math.min(vw - 2 * M, 520) : Math.min(card.w, vw - 2 * M), ch = card.h
  if (!rect) return { spot: null, card: { x: Math.round((vw - cw) / 2), y: Math.round(Math.max(M, (vh - ch) / 2)), w: cw }, side: "center" }
  // padded target, kept inside the viewport (and below the sticky header when the target is not part of it)
  const x0 = Math.max(4, rect.left - PAD), y0 = Math.max(top + 2, rect.top - PAD), x1 = Math.min(vw - 4, rect.right + PAD), y1 = Math.min(vh - 4, rect.bottom + PAD)
  let sp = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
  if (mobile) {
    const cy = vh - ch - M, limit = cy - GAP
    if (sp.y + sp.h > limit) sp.h = Math.max(0, limit - sp.y)
    return { spot: sp, card: { x: Math.round((vw - cw) / 2), y: cy, w: cw }, side: "sheet" }
  }
  const cx = clamp(sp.x + sp.w / 2 - cw / 2, M, vw - cw - M), cyMid = clamp(sp.y + sp.h / 2 - ch / 2, M, vh - ch - M)
  const tries = {
    bottom: () => ({ x: cx, y: sp.y + sp.h + GAP, ok: sp.y + sp.h + GAP + ch <= vh - M }),
    top: () => ({ x: cx, y: sp.y - GAP - ch, ok: sp.y - GAP - ch >= M }),
    right: () => ({ x: sp.x + sp.w + GAP, y: cyMid, ok: sp.x + sp.w + GAP + cw <= vw - M }),
    left: () => ({ x: sp.x - GAP - cw, y: cyMid, ok: sp.x - GAP - cw >= M }),
  }
  for (const side of prefer) { const t = tries[side](); if (t.ok) return { spot: sp, card: { x: Math.round(t.x), y: Math.round(t.y), w: cw }, side } }
  // nothing fits beside it: take the free edge and give up the part of the target the card would cover
  if (sp.y < vh / 2) { const cy = vh - ch - M; if (sp.y + sp.h > cy - GAP) sp.h = Math.max(0, cy - GAP - sp.y); return { spot: sp, card: { x: Math.round(cx), y: Math.round(cy), w: cw }, side: "edge-bottom" } }
  const cy = M; if (sp.y < cy + ch + GAP) { const d = cy + ch + GAP - sp.y; sp.y += d; sp.h = Math.max(0, sp.h - d) }
  return { spot: sp, card: { x: Math.round(cx), y: cy, w: cw }, side: "edge-top" }
}

/* How far to scroll so the target (or the top of a tall one) lands inside the free band. null = leave it. */
export function scrollDelta({ rect, top, bottom }) {
  const band = bottom - top
  if (rect.height <= band) {
    if (rect.top >= top && rect.bottom <= bottom) return null
    return rect.top - (top + Math.min(24, Math.max(0, (band - rect.height) / 2)))
  }
  if (rect.top >= top - 2 && rect.top <= top + 80) return null
  return rect.top - top
}
