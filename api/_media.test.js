// Media-inspection tests: real magic bytes, text decoding and office-document extraction.
const assert = require("assert");
const zlib = require("zlib");
const M = require("./_media");

let n = 0;
function ok(name, fn) { fn(); n++; console.log("  ok " + name); }

const CRC = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
  return (buf) => { let c = -1; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();

// tiny store-only ZIP writer (enough for DOCX/XLSX containers)
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name), body = Buffer.from(content), crc = CRC(body);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(body.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(0, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(body.length, 24);
    c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42);
    locals.push(Buffer.concat([lh, nameBuf, body]));
    centrals.push(Buffer.concat([c, nameBuf]));
    offset += lh.length + nameBuf.length + body.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

ok("magic bytes win over the claimed type", () => {
  assert.strictEqual(M.sniff(Buffer.from("%PDF-1.7\n")), "application/pdf");
  assert.strictEqual(M.sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.strictEqual(M.sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.strictEqual(M.sniff(Buffer.from("GIF89a......")), "image/gif");
  assert.strictEqual(M.sniff(Buffer.from("BM......")), "image/bmp");
  assert.strictEqual(M.sniff(Buffer.from([0x49, 0x49, 0x2a, 0x00])), "image/tiff");
  assert.strictEqual(M.sniff(Buffer.from("RIFF....WEBP")), "image/webp");
  assert.strictEqual(M.sniff(Buffer.from("....ftypheic")), "image/heic");
  assert.strictEqual(M.sniff(Buffer.from("Symbol,Quantity\nAAPL,10\n")), "text/plain");
  assert.strictEqual(M.sniff(Buffer.from([0x00, 0x01, 0x02, 0x03])), "application/octet-stream");
});

ok("inspect rejects a mismatched declared image type", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const r = M.inspect(png, "image/jpeg");
  assert.strictEqual(r.detected, "image/png");
  assert.strictEqual(r.compatible, false);
});

ok("decodeText handles UTF-8, BOM and UTF-16LE", () => {
  assert.strictEqual(M.decodeText(Buffer.from("héllo", "utf8")), "héllo");
  assert.strictEqual(M.decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("ok")])), "ok");
  assert.strictEqual(M.decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hi", "utf16le")])), "hi");
});

ok("DOCX text is extracted from the ZIP container", () => {
  const docx = zip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Symbol</w:t></w:r><w:r><w:t>Quantity</w:t></w:r></w:p><w:p><w:r><w:t>AAPL 10</w:t></w:r></w:p></w:body></w:document>",
  });
  assert.strictEqual(M.sniff(docx), "application/zip");
  const info = M.inspect(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.strictEqual(info.kind, "docx");
  assert.strictEqual(info.compatible, true);
  assert.ok(/Symbol\s+Quantity/.test(info.text));
  assert.ok(/AAPL 10/.test(info.text));
});

ok("XLSX cells become TSV text", () => {
  const xlsx = zip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": "<workbook><sheets><sheet name=\"Holdings\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
    "xl/sharedStrings.xml": "<sst><si><t>Symbol</t></si><si><t>AAPL</t></si></sst>",
    "xl/worksheets/sheet1.xml": "<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"inlineStr\"><is><t>Qty</t></is></c></row><row r=\"2\"><c r=\"A2\" t=\"s\"><v>1</v></c><c r=\"B2\"><v>10</v></c></row></sheetData></worksheet>",
  });
  const info = M.inspect(xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.strictEqual(info.kind, "xlsx");
  assert.strictEqual(info.compatible, true);
  assert.ok(/Symbol\tQty/.test(info.text));
  assert.ok(/AAPL\t10/.test(info.text));
});

ok("zip traversal names are refused", () => {
  const bad = zip({ "../evil.xml": "<x/>", "word/document.xml": "<w:document><w:p><w:r><w:t>ok</w:t></w:r></w:p></w:document>" });
  const text = M.docxText(bad);
  assert.ok(/ok/.test(text));
  assert.ok(!/evil/.test(text));
});

console.log("_media.test.js ok (" + n + " groups)");
