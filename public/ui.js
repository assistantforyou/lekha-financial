/* Portfolio Terminal v2: shared interface pieces (icons, formatters bound to the display currency, info toggles, sheets). */
import { t, fmtMoney, fmtPct, fmtNum } from "/core/i18n.js";
import { D } from "/core/data.js";
import { prefs } from "/core/store.js";
import { esc } from "/core/util.js";

const ICONS = {
  analysis: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  today: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", holdings: "M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
  market: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18", outlook: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  me: "M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  chev: "M6 9l6 6 6-6", plus: "M12 5v14M5 12h14", x: "M18 6L6 18M6 6l12 12", refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6", up: "M7 14l5-5 5 5", down: "M7 10l5 5 5-5", lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3", file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
};
export const icon = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ""}"/></svg>`;

/* money in the chosen display currency (USD <-> THB); per-share prices stay in the stock's own currency */
export const curr = () => prefs.get().cur === "THB" ? "THB" : "USD";
export const money = (usd, d) => (curr() === "THB" ? fmtMoney(usd * D.fx.usdthb, "THB", d) : fmtMoney(usd, "USD", d));
export const moneySigned = (usd, d) => (usd > 0 ? "+" : usd < 0 ? "−" : "") + money(Math.abs(usd), d);
export const price = (v, c = "USD") => fmtMoney(v, c, v < 10 ? 3 : 2);
export const pct = (p, d = 2) => fmtPct(p, d);
export const tone = (v) => (v > 0.00005 ? "up" : v < -0.00005 ? "down" : "");
export const chg = (p, d = 2) => `<span class="${tone(p)}">${pct(p, d)}</span>`;
export const num = fmtNum;

let infoN = 0;
/* ⓘ toggle + collapsed explanation: descriptions stay closed until you ask for them */
export function infoBtn(id) { return `<button class="i" data-info="${id}" aria-expanded="false" aria-controls="${id}" aria-label="${esc(t("What is this?"))}">i</button>`; }
export function cardHead(title, text, right = "") {
  const id = "w" + ++infoN;
  return `<div class="ch"><h2>${esc(title)}</h2>${right}${text ? infoBtn(id) : ""}</div>${text ? `<div class="why" id="${id}">${text}</div>` : ""}`;
}
export function bindInfo(root) {
  root.addEventListener("click", (e) => { const b = e.target.closest("[data-info]"); if (!b) return; const open = b.getAttribute("aria-expanded") !== "true"; b.setAttribute("aria-expanded", open); const w = document.getElementById(b.dataset.info); if (w) w.classList.toggle("open", open); });
}

/* ---------- sheet (bottom sheet on phones, side panel on desktop) ---------- */
let current = null;
export function closeSheet() {
  const root = document.getElementById("sheet-root"); if (!current) return;
  root.classList.remove("on"); const c = current; current = null; setTimeout(() => { if (!current) root.innerHTML = ""; c.onClose && c.onClose(); }, 260);
  document.removeEventListener("keydown", onKey);
}
const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
export function openSheet({ title, body, onMount, onClose }) {
  const root = document.getElementById("sheet-root");
  root.innerHTML = `<div class="scrim" data-close></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div><div class="sh"><h2>${esc(title)}</h2><button class="iconbtn" data-close aria-label="${esc(t("Close"))}">${icon("x")}</button></div><div id="sheet-body">${body}</div></section>`;
  current = { onClose };
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("on")));
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));
  document.addEventListener("keydown", onKey);
  const body_ = root.querySelector("#sheet-body"); onMount && onMount(body_);
  return body_;
}
