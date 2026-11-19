/* v2 dialogs: sign in / create account, add or edit a holding, import a statement, remove, and the AI analyst. */
import { t, getLang } from "/core/i18n.js";
import { D } from "/core/data.js";
import { authenticate, recover, loadHoldings, saveHoldings, isDemo, signedIn, tierName, ai } from "/core/store.js";
import { esc, toast } from "/core/util.js";
import { icon, openSheet, closeSheet } from "./ui.js";

const reload = () => window.PT_V2 && window.PT_V2.reloadData();

/* ---------- account ---------- */
export function openAuth(mode = "login", why = "") {
  const body = (m) => `<p class="small muted" style="margin-top:0">${esc(why || (m === "signup" ? t("Create a free account to keep your own portfolio on every device.") : t("Welcome back. Sign in to see your own portfolio.")))}</p>
    <div class="seg" id="am" style="margin-bottom:.9rem"><button data-k="login" aria-pressed="${m === "login"}">${esc(t("Sign in"))}</button><button data-k="signup" aria-pressed="${m === "signup"}">${esc(t("Create account"))}</button></div>
    <form id="af" class="stack" autocomplete="on"><label class="field">${esc(t("Email"))}<input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="none" required></label>
    <label class="field">${esc(t("Password"))}<input type="password" name="password" autocomplete="${m === "signup" ? "new-password" : "current-password"}" minlength="8" maxlength="72" required><span class="tiny muted">${esc(t("At least 8 characters."))}</span></label>
    <div id="am-msg" class="small" role="alert"></div>
    <button class="btn primary" type="submit">${esc(m === "signup" ? t("Create account") : t("Sign in"))}</button>
    ${m === "login" ? `<button class="btn ghost sm" type="button" id="forgot">${esc(t("Forgot password?"))}</button>` : ""}</form>`;
  openSheet({ title: mode === "signup" ? t("Create account") : t("Sign in"), body: body(mode), onMount(el) {
    const wire = (m) => {
      el.innerHTML = body(m);
      el.querySelector("#am").addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (b) wire(b.dataset.k); });
      const f = el.querySelector("#af"), msg = el.querySelector("#am-msg");
      f.addEventListener("submit", async (e) => {
        e.preventDefault(); const fd = new FormData(f), btn = f.querySelector("button[type=submit]"); btn.disabled = true; msg.className = "small"; msg.textContent = t("One moment…");
        const r = await authenticate(m, String(fd.get("email")).trim(), String(fd.get("password")));
        if (r.ok) { msg.className = "ok small"; msg.textContent = t("Signed in. Loading your portfolio…"); setTimeout(() => location.reload(), 300); }
        else if (r.confirm) { msg.className = "ok small"; msg.textContent = t("Check your email for a confirmation link, then sign in."); btn.disabled = false; }
        else { msg.className = "err small"; msg.textContent = r.error && /password|email/i.test(r.error) ? t("Wrong email or password, or the email is not confirmed yet.") : t("Something went wrong. Try again."); btn.disabled = false; }
      });
      const fg = el.querySelector("#forgot"); if (fg) fg.addEventListener("click", async () => { const em = String(new FormData(f).get("email") || "").trim(); if (!em) { msg.className = "err small"; msg.textContent = t("Enter your email first."); return; } await recover(em); msg.className = "ok small"; msg.textContent = t("If that email has an account, a reset link is on its way."); });
    };
    wire(mode);
  } });
}
/* ---------- add / edit a holding ---------- */
export function openAdd(tk) {
  const doc = loadHoldings(), cur = tk ? doc.items.find((h) => h.tk === tk) : null;
  const lim = D.me && D.me.limits ? D.me.limits.holdings : null;
  if (!cur && lim != null && doc.items.filter((h) => h.tk !== "CASH").length >= lim) return upgradeNote(t("Your plan holds up to {n} holdings. Remove one or upgrade for more.", { n: lim }));
  openSheet({ title: cur ? t("Edit holding") : t("Add a holding"), body: `<form id="hf" class="stack"><div class="fgrid">
    <label class="field">${esc(t("Ticker"))}<input name="tk" required maxlength="16" autocapitalize="characters" autocomplete="off" value="${esc(cur ? cur.tk : "")}" ${cur ? "readonly" : ""} placeholder="AAPL"><span class="tiny muted">${esc(t("Use CASH for cash. Hong Kong: 0700.HK, Thailand: PTT.BK"))}</span></label>
    <label class="field">${esc(t("Shares"))}<input name="qty" type="number" step="any" min="0" required inputmode="decimal" value="${cur ? cur.qty : ""}"></label>
    <label class="field">${esc(t("Total cost you paid"))}<input name="cost" type="number" step="any" min="0" inputmode="decimal" value="${cur && cur.cost != null ? cur.cost : ""}"><span class="tiny muted">${esc(t("Optional. In the currency below."))}</span></label>
    <label class="field">${esc(t("Currency"))}<select name="cur">${["USD", "THB", "HKD"].map((c) => `<option ${cur && cur.cur === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    <label class="field">${esc(t("Account name"))}<input name="acct" maxlength="40" value="${esc(cur ? cur.acct || "" : "My portfolio")}"></label>
    <label class="field">${esc(t("Theme"))}<input name="theme" maxlength="30" value="${esc(cur ? cur.theme || "" : "")}" placeholder="${esc(t("e.g. Technology"))}"></label></div>
    <div id="hf-msg" class="err small" role="alert"></div><button class="btn primary" type="submit">${esc(t("Save"))}</button></form>`, onMount(el) {
    el.querySelector("#hf").addEventListener("submit", (e) => {
      e.preventDefault(); const f = new FormData(e.target), msg = el.querySelector("#hf-msg");
      const k = String(f.get("tk")).trim().toUpperCase().replace(/[^A-Z0-9.\-:]/g, ""), qty = parseFloat(f.get("qty")), cost = f.get("cost") === "" ? null : parseFloat(f.get("cost"));
      if (!k || !(qty >= 0)) { msg.textContent = t("Enter a ticker and a number of shares."); return; }
      const item = { acct: String(f.get("acct")).trim().slice(0, 40), tk: k, theme: k === "CASH" ? "Cash" : String(f.get("theme")).trim().slice(0, 30), cur: String(f.get("cur")), qty, cost: Number.isFinite(cost) ? cost : null, px: null };
      const d = loadHoldings(), i = d.items.findIndex((h) => h.tk === k && (cur ? h.acct === cur.acct : true));
      if (i >= 0) d.items[i] = item; else d.items.push(item);
      saveHoldings(d); closeSheet(); toast(t("Saved")); reload();
    });
  } });
}
export function confirmRemove(tk) {
  openSheet({ title: t("Remove holding"), body: `<p>${esc(t("Remove {tk} from your portfolio? This cannot be undone.", { tk }))}</p><div class="row"><button class="btn danger" id="rm">${esc(t("Remove"))}</button><button class="btn" data-close>${esc(t("Cancel"))}</button></div>`, onMount(el) {
    el.querySelector("[data-close]").addEventListener("click", closeSheet);
    el.querySelector("#rm").addEventListener("click", () => { const d = loadHoldings(); d.items = d.items.filter((h) => h.tk !== tk); saveHoldings(d); closeSheet(); toast(t("Removed")); reload(); });
  } });
}
function upgradeNote(msg) { openSheet({ title: t("Plan limit"), body: `<p>${esc(msg)}</p><a class="btn primary" href="#/me" data-close>${esc(t("See plans"))}</a>`, onMount(el) { el.querySelector("a").addEventListener("click", closeSheet); } }); }

/* ---------- import a statement (PDF, image or CSV -> reviewed list) ---------- */
const PASS = "ptpub.v1.importpass", PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/";
let pdfLib = null;
async function pdfBody(buf) {
  if (!pdfLib) { pdfLib = await import(PDFJS + "pdf.min.mjs"); pdfLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs"; }
  const doc = await pdfLib.getDocument({ data: buf }).promise; let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) { const c = await (await doc.getPage(i)).getTextContent(); text += c.items.map((x) => x.str).join(" ") + "\n"; }
  if (text.replace(/\s/g, "").length > 80) return { text };
  const images = [];
  for (let i = 1; i <= Math.min(doc.numPages, 4); i++) { const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1.6 }), cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise; images.push({ mime: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.82).split(",")[1] }); }
  return { images };
}
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onerror = rej; if (/\.(csv|tsv|txt)$/i.test(f.name) || /^text\//.test(f.type)) { r.onload = () => res({ text: String(r.result).replace(/\b\d{8,}\b/g, (m) => "*".repeat(m.length - 4) + m.slice(-4)) }); r.readAsText(f); } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) { r.onload = () => pdfBody(new Uint8Array(r.result)).then(res, () => { const r2 = new FileReader(); r2.onload = () => res({ mime: "application/pdf", data: String(r2.result).split(",")[1] }); r2.readAsDataURL(f); }); r.readAsArrayBuffer(f); } else { r.onload = () => res({ mime: f.type || "image/jpeg", data: String(r.result).split(",")[1] }); r.readAsDataURL(f); } });
export function openImport() {
  openSheet({ title: t("Import a statement"), body: `<div id="imp"><p class="small muted" style="margin-top:0">${esc(t("Pick one or more broker statements (PDF, screenshot or CSV). An AI model reads them, then you check every line before anything is saved. Nothing is stored on our servers."))}</p>
    <form id="if" class="stack" autocomplete="on"><label class="field">${esc(t("Statements"))}<input type="file" id="ifile" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.tsv,.txt"></label>
    <label class="field">${esc(t("Import passcode"))}<input type="password" id="ipass" name="password" autocomplete="current-password" value="${esc((() => { try { return localStorage.getItem(PASS) || ""; } catch (e) { return ""; } })())}" required></label>
    <div id="imsg" class="small" role="status"></div><button class="btn primary" type="submit" id="igo">${esc(t("Read statements"))}</button></form><div id="irev"></div></div>`, onMount(el) {
    const msg = el.querySelector("#imsg"), say = (m, e) => { msg.className = "small " + (e ? "err" : ""); msg.textContent = m; };
    el.querySelector("#if").addEventListener("submit", async (e) => {
      e.preventDefault(); const files = [...el.querySelector("#ifile").files].slice(0, 10), pass = el.querySelector("#ipass").value.trim();
      if (!files.length) return say(t("Choose at least one file."), true);
      el.querySelector("#igo").disabled = true; const merged = { account: "", positions: [], cash: [], warnings: [] };
      for (let i = 0; i < files.length; i++) {
        say(t("Reading file {i} of {n}… this can take up to a minute.", { i: i + 1, n: files.length }));
        try {
          const body = await readFile(files[i]), r = await fetch("/api/parse-positions", { method: "POST", headers: { "Content-Type": "application/json", "X-PT-Passcode": pass }, body: JSON.stringify(body) }), j = await r.json().catch(() => ({}));
          if (r.status === 401) { el.querySelector("#igo").disabled = false; return say(t("Wrong import passcode."), true); }
          if (!r.ok) { merged.warnings.push(`${files[i].name}: ${j.error || r.status}`); continue; }
          merged.account = merged.account || j.account; merged.positions.push(...(j.positions || [])); merged.cash.push(...(j.cash || [])); merged.warnings.push(...(j.warnings || []));
        } catch (err) { merged.warnings.push(`${files[i].name}: ${t("could not be read")}`); }
      }
      el.querySelector("#igo").disabled = false;
      try { localStorage.setItem(PASS, pass); } catch (er) { /* private mode */ }
      const rows = [...merged.positions.map((p) => ({ tk: p.tk, qty: p.qty, cost: p.cost, cur: p.cur })), ...merged.cash.map((c) => ({ tk: "CASH", qty: c.qty, cost: null, cur: c.cur }))];
      if (!rows.length) return say(t("No holdings were found in these files."), true);
      say(t("Check each line, fix anything wrong, then import."));
      el.querySelector("#irev").innerHTML = `${merged.warnings.length ? `<ul class="small" style="color:var(--warn)">${merged.warnings.slice(0, 6).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        <label class="field" style="margin:.6rem 0">${esc(t("Account name"))}<input id="iacct" value="${esc(merged.account || "Imported")}" maxlength="40"></label>
        <div style="overflow:auto"><table class="table"><thead><tr><th></th><th>${esc(t("Ticker"))}</th><th>${esc(t("Shares"))}</th><th>${esc(t("Total cost you paid"))}</th><th>${esc(t("Currency"))}</th></tr></thead><tbody>${rows.map((r) => `<tr><td><input type="checkbox" checked></td><td><input value="${esc(r.tk)}" ${r.tk === "CASH" ? "readonly" : ""}></td><td><input type="number" step="any" value="${esc(r.qty)}"></td><td><input type="number" step="any" value="${esc(r.cost == null ? "" : r.cost)}"></td><td><select>${["USD", "THB", "HKD"].map((c) => `<option ${c === r.cur ? "selected" : ""}>${c}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>
        <button class="btn primary" id="iadd" style="margin-top:.8rem">${esc(t("Import selected"))}</button>`;
      el.querySelector("#iadd").addEventListener("click", () => {
        const d = loadHoldings(), acct = el.querySelector("#iacct").value.trim().slice(0, 40) || "Imported"; let n = 0;
        el.querySelectorAll("#irev tbody tr").forEach((tr) => {
          const c = tr.querySelectorAll("input,select"); if (!c[0].checked) return;
          const tk = String(c[1].value).trim().toUpperCase().replace(/[^A-Z0-9.\-:]/g, ""), qty = parseFloat(c[2].value), cost = c[3].value === "" ? null : parseFloat(c[3].value); if (!tk || !(qty >= 0)) return;
          const it = { acct, tk, theme: tk === "CASH" ? "Cash" : "", cur: c[4].value, qty, cost: Number.isFinite(cost) ? cost : null, px: null }, i = d.items.findIndex((h) => h.tk === tk && h.acct === acct);
          if (i >= 0) d.items[i] = it; else d.items.push(it); n++;
        });
        if (!n) return say(t("No valid lines selected."), true);
        saveHoldings(d); closeSheet(); toast(t("{n} lines imported", { n })); reload();
      });
    });
  } });
}

/* ---------- the AI analyst (Premium) ---------- */
const SAMPLE_Q = () => [t("Which position is my biggest risk?"), t("Am I too concentrated in one area?"), t("What should I watch this week?")];
export function openAsk() {
  const tier = tierName(D.me), prem = tier === "premium" || tier === "demo";
  openSheet({ title: t("Ask your analyst"), body: `<div class="seg" id="ak" style="margin-bottom:.8rem"><button data-k="ask" aria-pressed="true">${esc(t("Ask"))}</button><button data-k="brief" aria-pressed="false">${esc(t("Daily briefing"))}</button><button data-k="stress" aria-pressed="false">${esc(t("Stress test"))}</button></div><div id="akv"></div>`, onMount(el) {
    const v = el.querySelector("#akv");
    const lock = () => `<div class="ailock">${icon("lock")} ${esc(isDemo() ? t("Sign in and upgrade to Premium to ask questions about your own portfolio.") : t("The AI analyst is part of the Premium plan. It reads your own holdings and answers in your language."))} <a href="#/me" data-close>${esc(t("See plans"))}</a></div>`;
    const views = {
      ask() {
        if (!prem) { v.innerHTML = lock(); v.querySelector("[data-close]") && v.querySelector("[data-close]").addEventListener("click", closeSheet); return; }
        v.innerHTML = `<div class="chips" style="margin-bottom:.6rem">${SAMPLE_Q().map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div><form id="qf" class="row" style="flex-wrap:nowrap"><input class="field" style="flex:1;min-height:2.7rem;padding:0 .8rem;border-radius:12px;border:1px solid var(--line);background:var(--card2)" id="qi" maxlength="600" placeholder="${esc(t("Ask about your portfolio…"))}"><button class="btn primary" type="submit">${esc(t("Ask"))}</button></form><div class="stack" id="qa" style="margin-top:.8rem"></div>`;
        const ask = async (q) => { const box = v.querySelector("#qa"); box.insertAdjacentHTML("afterbegin", `<div class="msg me">${esc(q)}</div><div class="msg" id="pend"><span class="skel" style="height:3rem"></span></div>`); const r = await ai("ask", { question: q, lang: getLang() }); const p = box.querySelector("#pend"); p.removeAttribute("id"); p.innerHTML = r.ok ? `<b>${esc(r.j.answer)}</b><ul class="bul">${(r.j.points || []).map((x) => `<li><b>${esc(x.title)}</b> ${esc(x.detail)}</li>`).join("")}</ul>` : `<span class="err">${esc(r.j.error || t("Something went wrong. Try again."))}</span>`; };
        v.querySelector("#qf").addEventListener("submit", (e) => { e.preventDefault(); const i = v.querySelector("#qi"), q = i.value.trim(); if (q.length > 2) { i.value = ""; ask(q); } });
        v.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => ask(b.dataset.q)));
      },
      async brief() {
        if (!prem) { v.innerHTML = lock(); return; } v.innerHTML = `<div class="skel" style="height:8rem"></div>`;
        const r = await ai("briefing?lang=" + encodeURIComponent(getLang()), null, "GET"); const b = r.j && r.j.briefing;
        v.innerHTML = r.ok && b ? `<div class="stack"><h3>${esc(b.headline)}</h3>${b.sections.map((s) => `<div class="msg"><b>${esc(s.title)}</b><span>${esc(s.body)}</span></div>`).join("")}</div>` : `<div class="err">${esc((r.j && r.j.error) || t("Something went wrong. Try again."))}</div>`;
      },
      async stress() {
        if (!prem) { v.innerHTML = lock(); return; } v.innerHTML = `<div class="skel" style="height:8rem"></div>`;
        const r = await ai("simulate", { years: 1, lang: getLang() }), j = r.j;
        v.innerHTML = r.ok ? `<div class="stack"><div class="kv"><div><span>${esc(t("Bad case (1 in 20)"))}</span><b class="down">${esc(((j.percentiles.p5 - 1) * 100).toFixed(0))}%</b></div><div><span>${esc(t("Middle outcome"))}</span><b>${esc(((j.percentiles.p50 - 1) * 100).toFixed(0))}%</b></div><div><span>${esc(t("Good case (1 in 20)"))}</span><b class="up">${esc(((j.percentiles.p95 - 1) * 100).toFixed(0))}%</b></div><div><span>${esc(t("Chance of a loss"))}</span><b>${esc(j.probLoss)}%</b></div></div>${j.narrative ? `<div class="msg">${esc(j.narrative)}</div>` : ""}<h3>${esc(t("If the market suddenly fell"))}</h3>${(j.stress || []).map((s) => `<div class="row small"><span>${esc(s.name)}</span><span class="muted">${esc(s.movePct)}%</span><b class="down sp">${esc(s.impactPct)}%</b></div>`).join("")}</div>` : `<div class="err">${esc(j.error || t("Something went wrong. Try again."))}</div>`;
      },
    };
    views.ask();
    el.querySelector("#ak").addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (!b) return; el.querySelectorAll("#ak button").forEach((x) => x.setAttribute("aria-pressed", x === b)); views[b.dataset.k](); });
  } });
}
