// Which language the AI analyst writes in. The page sends the language chosen in the picker ("th", "zh-Hans",
// ...). Only codes on this list are ever used, so a made-up value can never end up inside a prompt.
const NAMES = {
  th: "Thai",
  "zh-Hans": "Simplified Chinese (Mandarin, mainland usage)",
  "zh-Hant": "Traditional Chinese (Mandarin, Taiwan usage)",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  hi: "Hindi",
  vi: "Vietnamese",
  fr: "French",
};

// "en" for anything that is not exactly one of the supported codes
const langOf = (v) => {
  const s = String(v == null ? "" : v).trim();
  return Object.prototype.hasOwnProperty.call(NAMES, s) ? s : "en";
};

// One extra instruction appended to the system prompt; empty for English
const rule = (code) => (NAMES[code]
  ? `LANGUAGE: write every human-readable string value in ${NAMES[code]}. Keep ticker symbols, numbers, currency symbols and standard abbreviations (P/E, FCF, DCF, ETF, S&P 500, CPI, VIX, beta) exactly as they are, and keep the JSON keys in English. Market headlines may be in English: translate what you quote from them.`
  : "");

const withLang = (system, code) => (rule(code) ? system + "\n" + rule(code) : system);

module.exports = { NAMES, langOf, rule, withLang };
