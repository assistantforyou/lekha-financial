// House style, in one place so the chat loop and the JSON jobs share it.
// No pictographs anywhere: this is a professional tool, and the rule is enforced on model output
// as well as on our own copy.
const RANGES = [
  [0x1f000, 0x1faff], // emoji, pictographs, transport symbols
  [0x2600, 0x27bf], // miscellaneous symbols and dingbats
  [0x2b50, 0x2b50], // star
  [0x2b06, 0x2b06], // up arrow
  [0xfe0f, 0xfe0f], // variation selector
  [0x20e3, 0x20e3], // combining enclosing keycap
];
const PICTO = new RegExp(`[${RANGES.map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join("")}]`, "gu");

function stripString(s) {
  return String(s).replace(PICTO, "").replace(/ {2,}/g, " ").replace(/[ \t]+$/gm, "");
}

// Streaming variant: removes pictographs only. Deltas must keep their leading and trailing
// spaces, otherwise words and numbers fuse together in the assembled answer.
function scrub(s) {
  return String(s).replace(PICTO, "");
}

function stripPictographs(v) {
  if (typeof v === "string") return stripString(v);
  if (Array.isArray(v)) return v.map(stripPictographs);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = stripPictographs(x);
    return out;
  }
  return v;
}

const STYLE = "Write in clean, professional English for a financial professional. No emoji, emoticons or decorative symbols. No exclamation marks. State figures plainly with their unit and date. Separate what the data says from your interpretation.";

module.exports = { stripPictographs, scrub, STYLE };
