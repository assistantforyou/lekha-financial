const assert = require("assert");
const zlib = require("zlib");
const { parseSsga, parseIshares, mergeDocs, ssgaDate, xlsxRows } = require("./_etf");

// tiny zip writer (one deflated + one stored entry) so the xlsx reader is tested without fixtures on disk
function crc32(b) { let c, crc = ~0; for (const x of b) { c = (crc ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function zip(files) {
  const parts = [], cd = []; let off = 0;
  for (const [name, text, method] of files) {
    const raw = Buffer.from(text), data = method === 8 ? zlib.deflateRawSync(raw) : raw, nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nm, data); cd.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cdb = Buffer.concat(cd), eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(files.length, 10); eo.writeUInt32LE(cdb.length, 12); eo.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, eo]);
}
const sst = ["Date", "NAV", "Shares Outstanding", "Total Net Assets", "12-Nov-2026", "11-Nov-2026", "not a date", "A &amp; B"].map((s) => `<si><t>${s}</t></si>`).join("");
const cell = (c, r, v, s) => `<c r="${c}${r}"${s ? ' t="s"' : ""}><v>${v}</v></c>`;
const sheet = `<worksheet><sheetData>
<row r="4">${[0, 1, 2, 3].map((i) => cell("ABCD"[i], 4, i, 1)).join("")}</row>
<row r="5">${cell("A", 5, 4, 1)}${cell("B", 5, "173.73")}${cell("C", 5, "6.72E8")}${cell("D", 5, "1.168E11")}</row>
<row r="6">${cell("A", 6, 5, 1)}${cell("B", 6, "174.33")}${cell("C", 6, "6.68E8")}${cell("D", 6, "1.1648E11")}</row>
<row r="7">${cell("A", 7, 6, 1)}${cell("B", 7, "1")}${cell("C", 7, "1")}</row>
<row r="8">${cell("A", 8, 4, 1)}${cell("B", 8, "0")}${cell("C", 8, "5")}</row></sheetData></worksheet>`;
const xlsx = zip([["xl/sharedStrings.xml", `<sst>${sst}</sst>`, 8], ["xl/worksheets/sheet1.xml", sheet, 0]]);
const rows = parseSsga(xlsx);
assert.deepStrictEqual(rows.map((r) => [r.asOf, r.nav, r.so]), [["2026-11-12", 173.73, 672], ["2026-11-11", 174.33, 668]]); // bad date and zero NAV dropped
assert.strictEqual(xlsxRows(xlsx)[0][0], "Date");
assert.strictEqual(ssgaDate("03-Feb-2026"), "2026-02-03");
assert.strictEqual(ssgaDate("garbage"), null);
assert.throws(() => parseSsga(Buffer.from("<html>blocked</html>")));

const html = (sod, nvd) => `<span webqc-datapoint="keyFundFacts-sharesOutstanding">168,200,000</span><div data-id="keyFundFacts-sharesOutstanding-asOf">as of<!-- --> ${sod}</div>
{"name":"NAV as of","value":"71.48","unitText":"USD","valueReference":{"@type":"PropertyValue","name":"As of Dates","value":"${nvd}"}}`;
assert.deepStrictEqual(parseIshares(html("Nov 13, 2026", "Nov 13, 2026")), { asOf: "2026-11-13", nav: 71.48, so: 168.2, aum: 168200000 * 71.48 });
assert.strictEqual(parseIshares(html("Nov 12, 2026", "Nov 13, 2026")), null); // mismatched dates are refused
assert.strictEqual(parseIshares("<html></html>"), null);

// merging: only changed days are written, iShares point joins an existing SPDR day, old points are kept
const today = new Date().toISOString().slice(0, 10);
const obs = { XLK: [{ asOf: today, nav: 10, so: 5, aum: 50, src: "SSGA" }, { asOf: "2001-01-01", nav: 1, so: 1, aum: 1, src: "SSGA" }], IBB: [{ asOf: today, nav: 7, so: 2, aum: 14, src: "iShares" }] };
const first = mergeDocs({}, obs, "t0");
assert.strictEqual(first.length, 1); // 2001 point is outside the retention window
assert.deepStrictEqual(Object.keys(first[0].items).sort(), ["IBB", "XLK"]);
assert.strictEqual(mergeDocs({ [today]: first[0] }, obs, "t1").length, 0); // idempotent
const second = mergeDocs({ [today]: first[0] }, { SPY: [{ asOf: today, nav: 1, so: 1, aum: 1, src: "SSGA" }] }, "t2");
assert.deepStrictEqual(Object.keys(second[0].items).sort(), ["IBB", "SPY", "XLK"]);
console.log("etf ok");
