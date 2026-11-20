/* Portfolio Terminal: import holdings from statements (PDF / image / CSV) using an AI model through /api/parse-positions.
   Flow: choose one or many files -> (text files have long digit runs masked in the browser) -> the server asks the AI model
   for JSON per file, the results are merged -> you review and edit every line -> only the lines you tick are written to your
   holdings (browser storage). Nothing is saved on the server. Needs window.PT_HOLD {load, save, apply} exposed by the holdings editor. */
(function () {
  var MAX = 3 * 1024 * 1024, MAX_FILES = 10;
  var anchor = document.getElementById("ph-clear");
  var H = window.PT_HOLD;
  if (!anchor || !H) return;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function maskDigits(t) { return String(t).replace(/\b\d{8,}\b/g, function (m) { return new Array(m.length - 3).join("*") + m.slice(-4); }); }
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

  var note = document.querySelector("#h-hold + .note");
  if (note) note.textContent = "Stored in this browser (local storage). Imported statements are only read when you choose them, and you review every line first.";

  var btn = document.createElement("button");
  btn.className = "btn"; btn.type = "button"; btn.id = "imp-open"; btn.textContent = "Import from statement";
  anchor.parentNode.insertBefore(btn, anchor);

  var css = document.createElement("style");
  css.textContent =
    "#imp-dlg{max-width:780px;width:calc(100% - 24px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:16px}" +
    "#imp-dlg::backdrop{background:rgba(0,0,0,.45)}#imp-dlg h3{margin:0 0 4px;font-family:var(--f-display);font-size:16px}" +
    "#imp-dlg .imp-f{display:grid;gap:10px;margin-top:10px}#imp-dlg input[type=text],#imp-dlg input[type=password],#imp-dlg input[type=number],#imp-dlg select{font:inherit;font-size:12.5px;background:var(--panel-2);border:1px solid var(--line);border-radius:4px;padding:5px 7px;color:var(--fg);min-width:0}" +
    "#imp-dlg input[type=file]{font:inherit;font-size:12.5px;width:100%;color:var(--fg);background:var(--panel-2);border:1px solid var(--line);border-radius:4px;padding:7px;min-width:0}" +
    "#imp-dlg input[type=file]::file-selector-button{font:inherit;font-size:12.5px;margin:0 8px 0 0;padding:3px 9px;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--fg);cursor:pointer}" +
    "#imp-dlg .imp-lab{display:grid;gap:4px;font-size:12px;color:var(--muted)}" +
    "#imp-dlg .imp-pw{display:flex;gap:6px;min-width:0}#imp-dlg .imp-pw input{flex:1 1 auto}" +
    "#imp-dlg .imp-eye{font:inherit;font-size:12px;padding:4px 9px;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--muted);cursor:pointer;flex:0 0 auto}" +
    "#imp-dlg .imp-files{display:grid;gap:2px;font-size:12px;color:var(--muted);margin-top:-2px}" +
    "#imp-dlg .imp-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}" +
    "#imp-dlg .imp-tbl{overflow:auto;max-height:42vh;margin-top:10px;-webkit-overflow-scrolling:touch}#imp-dlg table{width:100%;border-collapse:collapse;font-size:12px}#imp-dlg td,#imp-dlg th{padding:3px 4px;text-align:left;vertical-align:middle}" +
    "#imp-dlg td input[type=number]{width:92px}#imp-dlg td input[type=text]{width:84px}#imp-dlg .imp-ev{color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#imp-dlg .imp-row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;align-items:center}#imp-msg{font-size:12px;min-height:18px;margin-top:8px;color:var(--muted)}" +
    "#imp-dlg ul.imp-warn{margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--warn)}" +
    "@media (max-width:520px){#imp-dlg{padding:12px}#imp-dlg .imp-row{justify-content:stretch}#imp-dlg .imp-row .btn{flex:1 1 auto}}";
  document.head.appendChild(css);

  var themeHtml = (function () { var s = document.querySelector("#ph-form select[name=theme]"); return s ? s.innerHTML : "<option>Other</option>"; })();

  var dlg = document.createElement("dialog");
  dlg.id = "imp-dlg";
  dlg.innerHTML =
    "<form id='imp-form' name='statement-import' novalidate autocomplete='on'>" +
    "<input type='text' class='imp-sr' name='username' autocomplete='username' value='statement-import' tabindex='-1' aria-hidden='true' readonly>" +
    "<h3>Import holdings from statements</h3><div class='muted' style='font-size:12px'>PDF, screenshot or CSV from your broker or bank. Pick one or several at once — each file is read automatically and you review every line before anything is added.</div>" +
    "<div class='imp-f'>" +
    "<label class='imp-lab' for='imp-file'>Statements (you can pick several)<input type='file' id='imp-file' name='statements' multiple accept='.pdf,.png,.jpg,.jpeg,.webp,.csv,.tsv,.txt,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain'></label>" +
    "<div class='imp-files' id='imp-files' hidden></div>" +
    "</div>" +
    "<div id='imp-msg' role='status' aria-live='polite'></div>" +
    "<div class='imp-row'><button class='btn' id='imp-cancel' type='button'>Close</button><button class='btn' id='imp-go' type='submit' style='border-color:var(--accent);color:var(--accent)'>Read statements</button></div>" +
    "</form>" +
    "<div id='imp-review' hidden></div>";
  document.body.appendChild(dlg);

  function $(id) { return document.getElementById(id); }
  function say(t, bad) { var m = $("imp-msg"); m.textContent = t; m.style.color = bad ? "var(--down)" : "var(--muted)"; }
  function chosen() { return Array.prototype.slice.call($("imp-file").files || []); }

  function listFiles() {
    var fs = chosen(), box = $("imp-files");
    box.hidden = !fs.length;
    box.innerHTML = fs.map(function (f) { return "<div>" + esc(f.name) + " · " + fmtSize(f.size) + "</div>"; }).join("");
  }

  $("imp-file").addEventListener("change", listFiles);
  function openDlg() {
    $("imp-file").value = "";
    $("imp-files").hidden = true; $("imp-files").innerHTML = "";
    $("imp-review").hidden = true; $("imp-review").innerHTML = "";
    $("imp-go").hidden = false; $("imp-go").disabled = false;
    say(""); dlg.showModal();
  }
  btn.addEventListener("click", openDlg);
  /* also offer it where people look first: the panel header and the empty-state message */
  var head = document.getElementById("h-hold");
  if (head && head.parentNode) {
    var top = document.createElement("button");
    top.className = "btn"; top.type = "button"; top.textContent = "Import from statement (PDF / CSV / screenshot)";
    top.style.cssText = "border-color:var(--accent);color:var(--accent);margin-left:auto";
    top.addEventListener("click", openDlg); head.parentNode.appendChild(top);
  }
  var empty = document.getElementById("ph-empty");
  if (empty) {
    var inEmpty = document.createElement("button");
    inEmpty.className = "btn"; inEmpty.type = "button"; inEmpty.textContent = "Import from a statement"; inEmpty.style.cssText = "margin-left:8px";
    inEmpty.addEventListener("click", openDlg); empty.appendChild(inEmpty);
  }
  $("imp-cancel").addEventListener("click", function () { dlg.close(); });

  // PDFs: extract the text layer in the browser (pdf.js); scanned PDFs (no text) are rendered to up to 4 page images.
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/";
  var pdfLib = null;
  async function loadPdf() {
    if (!pdfLib) { pdfLib = await import(PDFJS + "pdf.min.mjs"); pdfLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs"; }
    return pdfLib;
  }
  async function pdfToBody(buf) {
    var lib = await loadPdf();
    var doc = await lib.getDocument({ data: buf }).promise;
    var n = Math.min(doc.numPages, 12), text = "";
    for (var i = 1; i <= n; i++) {
      var page = await doc.getPage(i), tc = await page.getTextContent(), lastY = null, line = [];
      tc.items.forEach(function (it) {
        var y = Math.round(it.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 2) { text += line.join(" ") + "\n"; line = []; }
        line.push(it.str); lastY = y;
      });
      text += line.join(" ") + "\n\n";
    }
    if (text.replace(/\s/g, "").length > 40 * n) return { text: maskDigits(text) };
    var images = [];
    for (var p = 1; p <= Math.min(doc.numPages, 4); p++) {
      var pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1.6 });
      var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      images.push({ mime: "image/jpeg", data: c.toDataURL("image/jpeg", 0.82).split(",")[1] });
    }
    return { images: images };
  }

  function readFile(f) {
    return new Promise(function (resolve, reject) {
      var isText = /^text\//.test(f.type) || /\.(csv|tsv|txt)$/i.test(f.name);
      var isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      var r = new FileReader();
      r.onerror = function () { reject(new Error("Could not read the file.")); };
      if (isText) { r.onload = function () { resolve({ text: maskDigits(String(r.result)) }); }; r.readAsText(f); }
      else if (isPdf) {
        r.onload = function () {
          pdfToBody(new Uint8Array(r.result)).then(resolve, function () {
            // pdf.js failed to load: send the raw PDF (the server's fallback model can read it)
            var r2 = new FileReader(); r2.onload = function () { resolve({ mime: "application/pdf", data: String(r2.result).split(",")[1] || "" }); }; r2.onerror = reject; r2.readAsDataURL(f);
          });
        };
        r.readAsArrayBuffer(f);
      }
      else {
        r.onload = function () { resolve({ mime: f.type, data: String(r.result).split(",")[1] || "" }); };
        r.readAsDataURL(f);
      }
    });
  }

  async function readOne(f) {
    if (f.size > MAX) throw new Error(f.name + " is over 3 MB. Export fewer pages or a CSV.");
    var body = await readFile(f);
    var r = await fetch("/api/parse-positions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var err = new Error(j.error || "Import failed (" + r.status + ").");
      err.status = r.status;
      throw err;
    }
    j.file = f.name;
    return j;
  }

  function mergeResults(results, failed) {
    var out = { account: "", asOf: "", positions: [], cash: [], warnings: [] }, accounts = [];
    results.forEach(function (r) {
      if (r.account && accounts.indexOf(r.account) < 0) accounts.push(r.account);
      if (r.asOf && !out.asOf) out.asOf = r.asOf;
      (r.positions || []).forEach(function (p) { out.positions.push(p); });
      (r.cash || []).forEach(function (c) { out.cash.push(c); });
      (r.warnings || []).forEach(function (w) { out.warnings.push((results.length > 1 ? (r.file || "A file") + ": " : "") + w); });
    });
    out.account = accounts[0] || "Imported";
    if (accounts.length > 1) out.warnings.push("The files name different accounts (" + accounts.join(", ") + "). Everything here is saved under one account label — set it below, or import the files one at a time to keep them apart.");
    failed.forEach(function (f) { out.warnings.push(f.name + " could not be read: " + f.msg); });
    var counts = {};
    out.positions.forEach(function (p) { counts[p.tk] = (counts[p.tk] || 0) + 1; });
    var dupes = Object.keys(counts).filter(function (k) { return counts[k] > 1; });
    if (dupes.length) out.warnings.push("Some tickers appear more than once (" + dupes.slice(0, 8).join(", ") + (dupes.length > 8 ? ", …" : "") + "). Untick the rows you don't want — only the last ticked row for a ticker is imported.");
    return out;
  }

  $("imp-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var fs = chosen();
    if (!fs.length) return say("Choose at least one file.", true);
    if (fs.length > MAX_FILES) return say("Pick up to " + MAX_FILES + " files at a time.", true);
    var big = fs.filter(function (f) { return f.size > MAX; })[0];
    if (big) return say(big.name + " is over 3 MB. Export fewer pages or a CSV.", true);
    $("imp-go").disabled = true;
    var results = [], failed = [];
    try {
      for (var i = 0; i < fs.length; i++) {
        say("Reading file " + (i + 1) + " of " + fs.length + " (" + fs[i].name + ")… up to a minute each.");
        try {
          results.push(await readOne(fs[i]));
        } catch (e) {
          failed.push({ name: fs[i].name, msg: e.message || "could not be read" });
        }
      }
    } finally {
      $("imp-go").disabled = false;
    }
    if (!results.length) return say("No files could be read. " + failed.map(function (f) { return f.name + ": " + f.msg; }).join(" "), true);
    review(mergeResults(results, failed));
  });

  var current = null;
  function review(res) {
    current = res;
    var rows = res.positions.map(function (p) { return { sel: true, tk: p.tk, qty: p.qty, cost: p.cost, px: p.px, cur: p.cur, ev: p.evidence || p.name || "" }; })
      .concat(res.cash.map(function (c) { return { sel: true, tk: "CASH", qty: c.qty, cost: null, px: null, cur: c.cur, ev: c.name || c.evidence || "Cash" }; }));
    current.rows = rows;
    var h = "<div class='imp-f' style='grid-template-columns:1fr 1fr'><label style='font-size:12px'>Account label<input type='text' id='imp-acct' maxlength='40' style='width:100%' value='" + esc(res.account || "Imported") + "'></label>" +
      "<label style='font-size:12px'>When importing<select id='imp-mode' style='width:100%'><option value='merge'>Add / update these lines</option><option value='replace'>Replace everything in this account label</option></select></label></div>";
    if (res.warnings.length) h += "<ul class='imp-warn'>" + res.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>";
    h += "<div class='imp-tbl'><table><thead><tr><th></th><th>Ticker</th><th>Quantity</th><th>Total cost</th><th>Price</th><th>Cur.</th><th>Theme</th><th>Evidence</th></tr></thead><tbody>";
    rows.forEach(function (r, i) {
      var cash = r.tk === "CASH";
      h += "<tr data-i='" + i + "'><td><input type='checkbox' data-f='sel' checked></td><td><input type='text' data-f='tk' value='" + esc(r.tk) + "'" + (cash ? " readonly" : "") + "></td>" +
        "<td><input type='number' step='any' min='0' data-f='qty' value='" + esc(r.qty) + "'></td>" +
        "<td><input type='number' step='any' min='0' data-f='cost' value='" + esc(r.cost == null ? "" : r.cost) + "'" + (cash ? " disabled" : "") + "></td>" +
        "<td><input type='number' step='any' min='0' data-f='px' value='" + esc(r.px == null ? "" : r.px) + "'" + (cash ? " disabled" : "") + "></td>" +
        "<td><select data-f='cur'>" + ["USD", "THB", "HKD"].map(function (c) { return "<option" + (c === r.cur ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></td>" +
        "<td><select data-f='theme'" + (cash ? " disabled" : "") + ">" + themeHtml + "</select></td>" +
        "<td class='imp-ev' title='" + esc(r.ev) + "'>" + esc(r.ev) + "</td></tr>";
    });
    h += "</tbody></table></div><div class='imp-row'><span class='muted' style='font-size:12px;margin-right:auto'>Check quantities against your statement. Lines without a price are not valued, and lines without a total cost count as pure gain in P&amp;L, until you fill them in.</span><button class='btn' id='imp-add' type='button' style='border-color:var(--accent);color:var(--accent)'>Import selected</button></div>";
    var box = $("imp-review"); box.innerHTML = h; box.hidden = false; $("imp-go").hidden = true;
    say(rows.length ? "Review the lines below, edit anything that looks wrong, then import." : "No holdings were found in these files.", !rows.length);
    $("imp-add").addEventListener("click", doImport);
  }

  function doImport() {
    var acct = $("imp-acct").value.trim().slice(0, 40), mode = $("imp-mode").value, st = H.load(), added = 0;
    if (mode === "replace") st.items = st.items.filter(function (x) { return (x.acct || "") !== acct; });
    var trs = $("imp-review").querySelectorAll("tbody tr");
    for (var k = 0; k < trs.length; k++) {
      var tr = trs[k], g = function (f) { return tr.querySelector("[data-f=" + f + "]"); };
      if (!g("sel").checked) continue;
      var tk = String(g("tk").value || "").trim().toUpperCase().replace(/[^A-Z0-9.\-:]/g, ""), qty = parseFloat(g("qty").value);
      if (!tk || !(qty >= 0)) continue;
      var cost = g("cost").value === "" ? null : parseFloat(g("cost").value), px = g("px").value === "" ? null : parseFloat(g("px").value);
      var cash = tk === "CASH";
      var h = { acct: acct, tk: tk, theme: cash ? "Other" : String(g("theme").value || "Other"), cur: g("cur").value, qty: qty, cost: isFinite(cost) ? cost : null, px: isFinite(px) ? px : null };
      var i = st.items.findIndex(function (x) { return x.tk === h.tk && (x.acct || "") === h.acct; });
      if (i >= 0) st.items[i] = h; else st.items.push(h);
      added++;
    }
    if (!added) return say("No valid lines selected.", true);
    H.save(st); H.apply(); dlg.close();
  }
})();
