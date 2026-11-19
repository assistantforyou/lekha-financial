/* Portfolio Terminal core: tiny DOM and math helpers shared by every front-end version. */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function html(strings, ...vals) { return strings.reduce((o, s, i) => o + s + (i < vals.length ? (vals[i] == null || vals[i] === false ? "" : Array.isArray(vals[i]) ? vals[i].join("") : vals[i]) : ""), ""); }
export function on(root, ev, sel, fn) { root.addEventListener(ev, (e) => { const el = e.target.closest(sel); if (el && root.contains(el)) fn(e, el); }); }
export function mean(a) { return a.length ? sum(a) / a.length : 0; }
export function stdev(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a, (x) => (x - m) ** 2) / (a.length - 1)); }
export function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function percentile(sortedArr, p) { const i = clamp(p * (sortedArr.length - 1), 0, sortedArr.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (i - lo); }
export function toast(msg, ms = 2600) {
  let el = document.getElementById("toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), ms);
}
