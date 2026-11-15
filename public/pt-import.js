/* Portfolio Terminal: import holdings from a statement (PDF / image / CSV) using an AI model through /api/parse-positions.
   Flow: choose file -> (text files have long digit runs masked in the browser) -> server asks the AI model for JSON ->
   you review and edit every line -> only the lines you tick are written to your holdings (browser storage).
   Nothing is saved on the server. Needs window.PT_HOLD {load, save, apply} exposed by the holdings editor. */
(function () {
  var PASS_KEY = "ptpub.v1.importpass", MAX = 3 * 1024 * 1024;
  var anchor = document.getElementById("ph-clear");
  var H = window.PT_HOLD;
  if (!anchor || !H) return;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getPass() { try { return localStorage.getItem(PASS_KEY) || ""; } catch (e) { return ""; } }
  function setPass(v) { try { if (v) localStorage.setItem(PASS_KEY, v); else localStorage.removeItem(PASS_KEY); } catch (e) {} }
  function maskDigits(t) { return String(t).replace(/\b\d{8,}\b/g, function (m) { return new Array(m.length - 3).join("*") + m.slice(-4); }); }

  var note = document.querySelector("#h-hold + .note");
  if (note) note.textContent = "Stored in this browser (local storage). Typed entries stay here; files you choose for statement import are sent to an AI service to be read (see the import dialog).";

  var btn = document.createElement("button");
  btn.className = "btn"; btn.type = "button"; btn.id = "imp-open"; btn.textContent = "Import from statement";
  anchor.parentNode.insertBefore(btn, anchor);

  var css = document.createElement("style");
  css.textContent =
    "#imp-dlg{max-width:780px;width:calc(100% - 24px);background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:16px}" +
    "#imp-dlg::backdrop{background:rgba(0,0,0,.45)}#imp-dlg h3{margin:0 0 4px;font-family:var(--f-display);font-size:16px}" +
    "#imp-dlg .imp-f{display:grid;gap:8px;margin-top:10px}#imp-dlg input[type=text],#imp-dlg input[type=password],#imp-dlg input[type=number],#imp-dlg select{font:inherit;font-size:12.5px;background:var(--panel-2);border:1px solid var(--line);border-radius:4px;padding:5px 7px;color:var(--fg);min-width:0}" +
    "#imp-dlg .imp-priv{font-size:12px;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:4px;padding:8px 10px;margin-top:10px;background:var(--panel-2)}" +
    "#imp-dlg .imp-tbl{overflow:auto;max-height:42vh;margin-top:10px}#imp-dlg table{width:100%;border-collapse:collapse;font-size:12px}#imp-dlg td,#imp-dlg th{padding:3px 4px;text-align:left;vertical-align:middle}" +
    "#imp-dlg td input[type=number]{width:92px}#imp-dlg td input[type=text]{width:84px}#imp-dlg .imp-ev{color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#imp-dlg .imp-row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;align-items:center}#imp-msg{font-size:12px;min-height:18px;margin-top:8px;color:var(--muted)}" +
    "#imp-dlg ul.imp-warn{margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--warn)}";
  document.head.appendChild(css);

  var themeHtml = (function () { var s = document.querySelector("#ph-form select[name=theme]"); return s ? s.innerHTML : "<option>Other</option>"; })();

  var dlg = document.createElement("dialog");
  dlg.id = "imp-dlg";
  dlg.innerHTML =
    "<h3>Import holdings from a statement</h3><div class='muted' style='font-size:12px'>PDF, screenshot or CSV from your broker or bank. An AI model reads it and you review every line before anything is added.</div>" +
    "<div class='imp-priv'><b>Privacy.</b> The file you choose is sent through this site to Google's Gemini API to be read. Nothing is stored on this site's server. On Google's free tier, submitted content may be used to improve their products, so prefer a holdings-only export, crop out names and addresses, or use a paid key. Long digit runs (account numbers) are masked in CSV/text files before they leave your browser, but not inside PDFs or images.</div>" +
    "<div class='imp-f'>" +
    "<input type='file' id='imp-file' accept='.pdf,.png,.jpg,.jpeg,.webp,.csv,.tsv,.txt,application/pdf,image/*,text/csv,text/plain'>" +
    "<input type='password' id='imp-pass' placeholder='Import passcode' autocomplete='off'>" +
    "<label style='font-size:12px'><input type='checkbox' id='imp-ok'> I understand this file is sent to an AI service to be read.</label></div>" +
    "<div id='imp-msg' role='status'></div><div id='imp-review' hidden></div>" +
    "<div class='imp-row'><button class='btn' id='imp-cancel' type='button'>Close</button><button class='btn' id='imp-go' type='button' style='border-color:var(--accent);color:var(--accent)'>Read statement</button></div>";
  document.body.appendChild(dlg);

  function $(id) { return document.getElementById(id); }
  function say(t, bad) { var m = $("imp-msg"); m.textContent = t; m.style.color = bad ? "var(--down)" : "var(--muted)"; }

  btn.addEventListener("click", function () { $("imp-pass").value = getPass(); $("imp-file").value = ""; $("imp-ok").checked = false; $("imp-review").hidden = true; $("imp-go").hidden = false; say(""); dlg.showModal(); });
  $("imp-cancel").addEventListener("click", function () { dlg.close(); });

  function readFile(f) {
    return new Promise(function (resolve, reject) {
      var isText = /^text\//.test(f.type) || /\.(csv|tsv|txt)$/i.test(f.name);
      var r = new FileReader();
      r.onerror = function () { reject(new Error("Could not read the file.")); };
      if (isText) { r.onload = function () { resolve({ text: maskDigits(String(r.result)) }); }; r.readAsText(f); }
      else {
        r.onload = function () {
          var mime = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "");
          resolve({ mime: mime, data: String(r.result).split(",")[1] || "" });
        };
        r.readAsDataURL(f);
      }
    });
  }

  $("imp-go").addEventListener("click", async function () {
    var f = $("imp-file").files[0], pass = $("imp-pass").value.trim();
    if (!f) return say("Choose a file first.", true);
    if (f.size > MAX) return say("That file is over 3 MB. Export fewer pages or a CSV.", true);
    if (!pass) return say("Enter the import passcode.", true);
    if (!$("imp-ok").checked) return say("Tick the box to confirm the file may be sent to an AI service.", true);
    $("imp-go").disabled = true; say("Reading the statement (up to a minute)…");
    try {
      var body = await readFile(f);
      var r = await fetch("/api/parse-positions", { method: "POST", headers: { "Content-Type": "application/json", "X-PT-Passcode": pass }, body: JSON.stringify(body) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) { if (r.status === 401) setPass(""); throw new Error(j.error || "Import failed (" + r.status + ")."); }
      setPass(pass);
      review(j);
    } catch (e) { say(e.message || "Import failed.", true); }
    $("imp-go").disabled = false;
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
    h += "</tbody></table></div><div class='imp-row'><span class='muted' style='font-size:12px;margin-right:auto'>Check quantities against your statement. Lines without a price are not valued until you add one.</span><button class='btn' id='imp-add' type='button' style='border-color:var(--accent);color:var(--accent)'>Import selected</button></div>";
    var box = $("imp-review"); box.innerHTML = h; box.hidden = false; $("imp-go").hidden = true;
    say(rows.length ? "Review the lines below, edit anything that looks wrong, then import." : "No holdings were found in this file.", !rows.length);
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
