/* Which of our ten languages does the visitor's browser prefer? Pure: no DOM, no storage (tested in api/_langprompt.test.js).
   The browser lists languages in order of preference, so the first one we support wins; an English tag first means the visitor is
   happy with English and nothing is offered. Chinese needs care: simplified for CN/SG/MY and bare zh, traditional for TW/HK/MO/Hant. */
export const SUPPORTED = ["en", "th", "zh-Hans", "zh-Hant", "ja", "ko", "es", "hi", "vi", "fr"]

export function matchLang(tag) {
  const t = String(tag == null ? "" : tag).trim().toLowerCase().replace(/_/g, "-")
  if (!t || t === "*") return null
  if (t === "zh" || t.startsWith("zh-")) return /^zh-(tw|hk|mo)(-|$)|^zh-hant/.test(t) ? "zh-Hant" : "zh-Hans"
  const base = t.split("-")[0]
  return SUPPORTED.includes(base) && base !== "zh" ? base : null
}

/* the first supported language in the browser's preference order, or null */
export function bestLang(list) {
  for (const tag of Array.isArray(list) ? list : []) { const m = matchLang(tag); if (m) return m }
  return null
}

/* the language to offer: a supported non-English match, or null when English is preferred, nothing matches or the list is empty */
export function promptLang(list) {
  const b = bestLang(list)
  return b && b !== "en" ? b : null
}
