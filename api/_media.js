// Media inspection for statement import.
//
// The browser's Content-Type is advisory only. Every upload is decoded server-side and the real
// magic bytes decide what it is. Text-based office formats are unpacked here (DOCX/XLSX are ZIP
// containers) so the model receives text instead of a binary blob it cannot read.
const zlib = require("zlib");

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_UNZIPPED = 24 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_EXTRACT_CHARS = 300000;

const IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp",
  "image/tiff", "image/heic", "image/heif", "image/avif",
]);
const TEXT_MIMES = new Set([
  "text/plain", "text/csv", "text/tab-separated-values", "text/markdown",
  "application/json", "application/x-ofx", "application/ofx",
  "application/qfx", "application/x-qfx", "application/xml", "text/xml",
]);
const DOC_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function starts(buf, bytes) {
  if (!Buffer.isBuffer(buf) || buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[i] !== bytes[i]) return false;
  return true;
}

function ascii(buf, start, end) { return buf.slice(start, end).toString("latin1"); }

function sniff(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) return "application/octet-stream";
  if (starts(buf, Buffer.from("%PDF-"))) return "application/pdf";
  if (starts(buf, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (starts(buf, Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (starts(buf, Buffer.from("GIF87a")) || starts(buf, Buffer.from("GIF89a"))) return "image/gif";
  if (starts(buf, Buffer.from("BM"))) return "image/bmp";
  if (starts(buf, Buffer.from([0x49, 0x49, 0x2a, 0x00])) || starts(buf, Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))) return "image/tiff";
  if (buf.length >= 12 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  if (starts(buf, Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "application/zip";
  if (starts(buf, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "application/vnd.ms-excel";
  // UTF-16 text from some broker exports.
  if (starts(buf, Buffer.from([0xff, 0xfe]))) return "text/plain";
  if (starts(buf, Buffer.from([0xfe, 0xff]))) return "text/plain";
  return looksText(buf) ? "text/plain" : "application/octet-stream";
}

function looksText(buf) {
  const n = Math.min(buf.length, 8192);
  if (!n) return false;
  let printable = 0, nul = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 0) nul++;
    else if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) printable++;
  }
  return nul / n < 0.01 && printable / n > 0.9;
}

function decodeText(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error("not_buffer");
  let b = buf;
  let enc = "utf-8";
  if (starts(b, Buffer.from([0xff, 0xfe]))) { b = b.slice(2); enc = "utf-16le"; }
  else if (starts(b, Buffer.from([0xfe, 0xff]))) { b = b.slice(2); enc = "utf-16be"; }
  else if (starts(b, Buffer.from([0xef, 0xbb, 0xbf]))) b = b.slice(3);
  try {
    return new TextDecoder(enc, { fatal: true }).decode(b);
  } catch (e) {
    return new TextDecoder("utf-8", { fatal: false }).decode(b);
  }
}

function decodeXml(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function xmlToText(xml) {
  return decodeXml(String(xml)
    .replace(/<w:tab\/?>/g, "\t")
    .replace(/<w:br\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function zipEntries(buf) {
  if (!Buffer.isBuffer(buf) || !starts(buf, Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error("not_zip");
  // End of central directory: scan the last 66 KB.
  let eocd = -1;
  const from = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("bad_zip");
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || cdOffset + cdSize > buf.length) throw new Error("bad_zip");
  const out = new Map();
  let total = 0, p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad_zip");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (!name || name.includes("..")) continue;
    total += uncompSize;
    if (total > MAX_UNZIPPED || uncompSize > MAX_UNZIPPED) throw new Error("zip_too_large");
    if (!/\.(xml|rels)$/i.test(name)) continue;
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const lName = buf.readUInt16LE(localOffset + 26);
    const lExtra = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lName + lExtra;
    if (start + compSize > buf.length) continue;
    const raw = buf.slice(start, start + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: Math.min(MAX_UNZIPPED, Math.max(uncompSize, 1024)) }); }
      catch (e) { continue; }
    } else continue;
    out.set(name, data);
  }
  return out;
}

function docxText(buf) {
  const entries = zipEntries(buf);
  const parts = [];
  for (const name of ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml"]) {
    if (entries.has(name)) parts.push(xmlToText(entries.get(name).toString("utf8")));
  }
  // Footnotes/endnotes often hold cash or total lines in bank templates.
  for (const name of ["word/footnotes.xml", "word/endnotes.xml"]) if (entries.has(name)) parts.push(xmlToText(entries.get(name).toString("utf8")));
  return parts.filter(Boolean).join("\n\n");
}

function columnIndex(ref) {
  const m = /^([A-Z]+)/i.exec(String(ref || ""));
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function xlsxText(buf) {
  const entries = zipEntries(buf);
  const shared = [];
  const ss = entries.get("xl/sharedStrings.xml");
  if (ss) {
    const xml = ss.toString("utf8");
    for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(xmlToText(m[1]));
  }
  const sheetNames = [];
  const wb = entries.get("xl/workbook.xml");
  if (wb) for (const m of String(wb).matchAll(/<sheet\b[^>]*name="([^"]*)"/g)) sheetNames.push(decodeXml(m[1]));
  const names = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const out = [];
  names.forEach((name, si) => {
    const xml = entries.get(name).toString("utf8");
    const rows = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cm[1], inner = cm[2];
        const ref = (/r="([^"]+)"/.exec(attrs) || [])[1];
        const type = (/t="([^"]+)"/.exec(attrs) || [])[1];
        let val = "";
        if (type === "inlineStr") val = xmlToText((/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner) || [])[1] || "");
        else {
          const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
          val = vm ? decodeXml(vm[1]) : "";
          if (type === "s" && val !== "") val = shared[Number(val)] || "";
          else if (type === "b") val = val === "1" ? "TRUE" : "FALSE";
        }
        const idx = columnIndex(ref);
        if (idx >= 0) cells[idx] = val; else cells.push(val);
      }
      if (cells.some((x) => String(x || "").trim())) rows.push(cells.map((x) => String(x == null ? "" : x).replace(/[\t\r\n]+/g, " ")).join("\t"));
    }
    if (rows.length) out.push(`SHEET ${sheetNames[si] || si + 1}\n${rows.join("\n")}`);
  });
  return out.join("\n\n");
}

// Legacy .xls is a CFB binary. Pull readable runs; enough for tickers/quantities in most exports.
function legacyXlsText(buf) {
  const runs = [];
  let cur = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c < 127) cur += String.fromCharCode(c);
    else {
      if (cur.length >= 4) runs.push(cur);
      cur = "";
    }
  }
  if (cur.length >= 4) runs.push(cur);
  return runs.join(" ").slice(0, MAX_EXTRACT_CHARS);
}

function extractText(buf, mime) {
  const m = String(mime || "").toLowerCase();
  try {
    if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return docxText(buf);
    if (m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return xlsxText(buf);
    if (m === "application/vnd.ms-excel") return legacyXlsText(buf);
    if (TEXT_MIMES.has(m) || m.startsWith("text/")) return decodeText(buf);
    if (sniff(buf) === "text/plain") return decodeText(buf);
  } catch (e) {
    return "";
  }
  return "";
}

// Decide what an uploaded buffer really is. Returns a detected mime and, for ZIP containers, the
// office type based on the entries actually present.
function inspect(buf, claimed) {
  let detected = sniff(buf);
  if (detected === "application/zip") {
    try {
      const entries = zipEntries(buf);
      if ([...entries.keys()].some((n) => n.startsWith("word/"))) detected = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      else if ([...entries.keys()].some((n) => n.startsWith("xl/"))) detected = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      else detected = "application/zip";
    } catch (e) { /* keep application/zip */ }
  }
  const c = String(claimed || "").toLowerCase();
  const compatible =
    detected === c ||
    (detected === "text/plain" && (TEXT_MIMES.has(c) || c.startsWith("text/"))) ||
    (detected === "application/vnd.ms-excel" && c === "application/vnd.ms-excel") ||
    (IMAGE_MIMES.has(detected) && c === detected) ||
    (detected === "application/zip" && c.includes("officedocument"));
  return { detected, claimed: c, compatible, kind: kindOf(detected), text: extractText(buf, detected) };
}

function kindOf(mime) {
  if (IMAGE_MIMES.has(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (mime === "application/vnd.ms-excel") return "xls";
  if (TEXT_MIMES.has(mime) || mime.startsWith("text/")) return "text";
  return "binary";
}

function isSupported(mime) {
  return IMAGE_MIMES.has(mime) || TEXT_MIMES.has(mime) || DOC_MIMES.has(mime) || mime.startsWith("text/");
}

module.exports = {
  MAX_BYTES, MAX_UNZIPPED, MAX_EXTRACT_CHARS, IMAGE_MIMES, TEXT_MIMES, DOC_MIMES,
  sniff, looksText, decodeText, decodeXml, xmlToText, zipEntries,
  docxText, xlsxText, legacyXlsText, extractText, inspect, kindOf, isSupported,
};
