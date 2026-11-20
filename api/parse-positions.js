// POST /api/parse-positions  {mime, data (base64) | text}  -> {account, asOf, positions[], cash[], warnings[]}
// Daily-capped (no passcode), and stores nothing: the file is
// forwarded to the AI provider and the validated result is returned. Statement contents are never logged.
const { checkUpload, normalizeResult, maskDigits, MAX_BYTES } = require("./_import");
const { extractStatement } = require("./_llm");
const { rateHit } = require("./_lib");

const DAILY_LIMIT = Number(process.env.IMPORT_DAILY_LIMIT) || 40;
const fail = (res, status, error) => { res.setHeader("Cache-Control", "no-store"); return res.status(status).json({ error }); };

module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "Use POST.");
  const b = req.body && typeof req.body === "object" ? req.body : {};
  let input;
  if (typeof b.text === "string") {
    const err = checkUpload({ mime: "text/plain", size: Buffer.byteLength(b.text) });
    if (err) return fail(res, 400, err);
    input = { text: maskDigits(b.text) };
  } else if (Array.isArray(b.images) && b.images.length) {
    // scanned PDF rendered to page images in the browser (max 4 pages)
    const images = [];
    for (const im of b.images.slice(0, 4)) {
      const mime = String(im && im.mime || "").toLowerCase(), data = im && typeof im.data === "string" ? im.data : "";
      const err = checkUpload({ mime, size: Math.floor((data.length * 3) / 4) });
      if (err || !mime.startsWith("image/")) return fail(res, 400, err || "Page images must be PNG, JPG or WEBP.");
      images.push({ mime, base64: data });
    }
    if (images.reduce((n, im) => n + im.base64.length, 0) > MAX_BYTES * 1.4) return fail(res, 400, "The pages are too large. Import fewer pages.");
    input = { images };
  } else {
    const mime = String(b.mime || "").toLowerCase();
    const data = typeof b.data === "string" ? b.data : "";
    const size = Math.floor((data.length * 3) / 4);
    const err = checkUpload({ mime, size });
    if (err) return fail(res, 400, err);
    if (mime.startsWith("text/")) input = { text: maskDigits(Buffer.from(data, "base64").toString("utf8")) };
    else input = { mime, base64: data };
  }
  // daily cap, counted atomically in the database (fails closed)
  const day = new Date().toISOString().slice(0, 10);
  if (!(await rateHit("import/day/" + day, DAILY_LIMIT))) return fail(res, 429, "Daily import limit reached. Try again tomorrow.");
  try {
    const raw = await extractStatement(input);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(normalizeResult(raw));
  } catch (e) {
    console.error("parse-positions failed:", /^(upstream_\w+|blocked|empty|not_configured|bad_json|aborted|network|pdf_needs_text)$/.test(e.message) ? e.message : "other"); // fixed codes only, never statement content
    const msg = e.status === 429 ? "The AI service is rate-limited right now. Try again in a minute."
      : e.status === 503 ? "Statement import is not configured on this site."
      : "The AI service could not read this file. Try a clearer PDF or a CSV export.";
    return fail(res, e.status === 429 || e.status === 503 ? e.status : 502, msg);
  }
};
module.exports.config = { api: { bodyParser: { sizeLimit: "4.4mb" } } };
