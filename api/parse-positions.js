// POST /api/parse-positions  {mime, data (base64) | text | images[]} -> {account, asOf, positions[], cash[], warnings[]}
// Daily-capped, and stores nothing: the file is forwarded to the AI provider and the validated result is returned.
// Statement contents are never logged. Uploads are decoded here and the magic bytes decide what they really are.
const { normalizeResult, crossCheck, fillQuantities, classifyThemes, maskDigits } = require("./_import");
const { extractVerified, generateJson } = require("./_llm");
const { rateHit } = require("./_lib");
const { inspect, decodeText, MAX_BYTES, MAX_EXTRACT_CHARS } = require("./_media");
const { jsonRequest, clientKey, safeError, cleanText } = require("./_ai_safe");

const DAILY_LIMIT = Number(process.env.IMPORT_DAILY_LIMIT) || 40;
const IP_DAILY_LIMIT = Number(process.env.IMPORT_IP_DAILY_LIMIT) || 20;
const MAX_BODY = Math.floor(MAX_BYTES * 1.4);

function fail(res, status, error) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json({ error });
}

function decodeBase64(data) {
  const s = String(data || "").replace(/\s+/g, "");
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) throw Object.assign(new Error("bad_upload"), { status: 400 });
  const buf = Buffer.from(s, "base64");
  // Reject non-canonical encodings (e.g. hidden bytes after padding).
  if (buf.toString("base64").replace(/=+$/, "") !== s.replace(/=+$/, "")) throw Object.assign(new Error("bad_upload"), { status: 400 });
  if (!buf.length || buf.length > MAX_BYTES) throw Object.assign(new Error("bad_upload"), { status: 400 });
  return buf;
}

function textOf(buf, info) {
  const t = info.text || decodeText(buf);
  return maskDigits(cleanText(t, MAX_EXTRACT_CHARS));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "Use POST.");
  try {
    jsonRequest(req, { maxBytes: MAX_BODY });
  } catch (e) {
    return fail(res, e.status || 400, e.status === 413 ? "The file is too large." : "Unsupported request.");
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};
  let input;
  try {
    if (typeof b.text === "string") {
      if (Buffer.byteLength(b.text) > MAX_BYTES) return fail(res, 400, "The text is too large.");
      input = { text: maskDigits(cleanText(b.text, MAX_EXTRACT_CHARS)) };
    } else if (Array.isArray(b.images) && b.images.length) {
      // Scanned PDF rendered to page images in the browser (max 4 pages).
      const images = [];
      let total = 0;
      for (const im of b.images.slice(0, 4)) {
        const claimed = String((im && im.mime) || "").toLowerCase();
        const buf = decodeBase64(im && im.data);
        total += buf.length;
        const info = inspect(buf, claimed);
        if (info.kind !== "image" || (claimed && !info.compatible)) return fail(res, 400, "Page images must be PNG, JPG, WEBP, GIF, BMP, TIFF, HEIC or AVIF.");
        images.push({ mime: info.detected, base64: buf.toString("base64") });
      }
      if (total > MAX_BODY) return fail(res, 400, "The pages are too large. Import fewer pages.");
      input = { images };
    } else {
      const claimed = String(b.mime || "").toLowerCase();
      const buf = decodeBase64(b.data);
      const info = inspect(buf, claimed);
      if (claimed && !info.compatible) return fail(res, 400, "This file type does not match its contents.");
      if (info.kind === "text" || info.kind === "docx" || info.kind === "xlsx" || info.kind === "xls") {
        const text = textOf(buf, info);
        if (!text) return fail(res, 400, "No readable text was found in this file.");
        input = { text };
      } else if (info.kind === "image" || info.kind === "pdf") {
        input = { mime: info.detected, base64: buf.toString("base64") };
      } else {
        return fail(res, 400, "Unsupported file type.");
      }
    }
  } catch (e) {
    if (e && e.status === 400) return fail(res, 400, "This upload is not a valid file.");
    throw e;
  }

  // Counted atomically in the database. Both limits fail closed.
  const day = new Date().toISOString().slice(0, 10);
  if (!(await rateHit("import/day/" + day, DAILY_LIMIT))) return fail(res, 429, "Daily import limit reached. Try again tomorrow.");
  if (!(await rateHit("import/ip/" + clientKey(req) + "/" + day, IP_DAILY_LIMIT))) return fail(res, 429, "Daily import limit reached for this connection. Try again tomorrow.");

  const t0 = Date.now();
  try {
    const { raw, second } = await extractVerified(input);
    let out = normalizeResult(raw);
    if (second) out = crossCheck(out, normalizeResult(second));
    out = await fillQuantities(out, (syms) => require("./_fin/service").getQuotes(syms));
    if (Date.now() - t0 < 42000) out = await classifyThemes(out, generateJson); // AI picks each holding's theme; skipped when time is short
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).json(out);
  } catch (e) {
    const { code, status } = safeError(e, "import_failed", 502);
    const logged = /^(upstream_\w+|blocked|empty|truncated|not_configured|bad_json|aborted|network|pdf_needs_text|sparse|import_failed)$/.test(code) ? code : "other"; // fixed codes only, never statement content
    console.error("parse-positions failed:", logged);
    const msg = status === 429 ? "The AI service is rate-limited right now. Try again in a minute."
      : status === 503 ? "Statement import is not configured on this site."
      : "The AI service could not read this file. Try a clearer PDF or a CSV export.";
    return fail(res, status, msg);
  }
};
module.exports.config = { api: { bodyParser: { sizeLimit: "4.4mb" } } };
