/* Portfolio Terminal core: language support shared by every front-end version (v2, v3, ...).
   Every visible string goes through t(english sentence, vars). Dictionaries live in core/i18n/<code>.js and are
   loaded before the first render. Numbers, money, dates and chart axes go through the fmt* helpers below, which use
   the browser's Intl for the chosen language, so charts and tables translate with everything else.
   scripts/check-i18n.mjs fails the build when any translated string is missing from any language file. */
export const LANGS = [
  { code: "en", native: "English", locale: "en-GB", ai: "English" },
  { code: "th", native: "ไทย", locale: "th-TH-u-ca-gregory" },
  { code: "zh-Hans", native: "简体中文", locale: "zh-CN" },
  { code: "zh-Hant", native: "繁體中文", locale: "zh-TW" },
  { code: "ja", native: "日本語", locale: "ja-JP" },
  { code: "ko", native: "한국어", locale: "ko-KR" },
  { code: "es", native: "Español", locale: "es-ES" },
  { code: "hi", native: "हिन्दी", locale: "hi-IN" },
  { code: "vi", native: "Tiếng Việt", locale: "vi-VN" },
  { code: "fr", native: "Français", locale: "fr-FR" },
];
const PREF_KEY = "ptpub.v1.prefs";        // shared with the classic terminal, so the language follows you between versions
let lang = "en", dict = {}, locale = "en-GB";
const missing = new Set();

export function detectLang() {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); if (p && LANGS.some((l) => l.code === p.lang)) return p.lang; } catch (e) { /* none saved */ }
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
  const n = nav.toLowerCase();
  if (n.startsWith("zh")) return /tw|hk|mo|hant/.test(n) ? "zh-Hant" : "zh-Hans";
  const hit = LANGS.find((l) => n.startsWith(l.code.toLowerCase()));
  return hit ? hit.code : "en";
}
export async function setLang(code, persist = true) {
  const L = LANGS.find((l) => l.code === code) || LANGS[0];
  lang = L.code; locale = L.locale; dict = {};
  if (lang !== "en") { try { dict = (await import(`/core/i18n/${lang}.js`)).default || {}; } catch (e) { dict = {}; } }
  document.documentElement.lang = lang === "zh-Hans" ? "zh-CN" : lang === "zh-Hant" ? "zh-TW" : lang;
  if (persist) { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || "null") || {}; p.lang = lang; localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ } }
  return lang;
}
export const getLang = () => lang;
export const getLocale = () => locale;

export function t(key, vars) {
  let s = lang === "en" ? key : dict[key];
  if (s == null) { s = key; if (lang !== "en" && !missing.has(key)) { missing.add(key); if (/^localhost$|^127\./.test(location.hostname)) console.warn("[i18n] missing", lang, JSON.stringify(key)); } }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
}
export const missingKeys = () => [...missing];

/* ---------- number / money / date formatting through Intl (language aware) ---------- */
const nf = new Map();
function NF(opts) { const k = locale + JSON.stringify(opts); let f = nf.get(k); if (!f) { f = new Intl.NumberFormat(locale, opts); nf.set(k, f); } return f; }
export const fmtNum = (n, d = 0) => (n == null || !Number.isFinite(n) ? "–" : NF({ minimumFractionDigits: d, maximumFractionDigits: d }).format(n));
export const fmtCompact = (n, d = 1) => (n == null || !Number.isFinite(n) ? "–" : NF({ notation: "compact", maximumFractionDigits: d }).format(n));
export function fmtMoney(n, cur = "USD", d) {
  if (n == null || !Number.isFinite(n)) return "–";
  const big = Math.abs(n) >= 1e5;
  return NF({ style: "currency", currency: cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: d != null ? d : (cur === "THB" || big ? 0 : 2), maximumFractionDigits: d != null ? d : (cur === "THB" || big ? 0 : 2) }).format(n);
}
export const fmtPct = (p, d = 1, sign = true) => (p == null || !Number.isFinite(p) ? "–" : NF({ style: "percent", minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: sign ? "exceptZero" : "auto" }).format(p));
export function fmtDate(v, opts = { day: "numeric", month: "short" }) {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts }).format(d);
}
export const fmtTime = (v) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(v instanceof Date ? v : new Date(v));
export function fmtAgo(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 6e4));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (m < 60) return rtf.format(-m, "minute");
  if (m < 1440) return rtf.format(-Math.round(m / 60), "hour");
  return rtf.format(-Math.round(m / 1440), "day");
}
export function fmtIn(days) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return rtf.format(Math.round(days), "day");
}
