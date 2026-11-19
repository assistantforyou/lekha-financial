/* Portfolio Terminal core: live prices ("publish / subscribe").
   One poller fans prices out to every screen that subscribed:
     real accounts  POST /api/free/quotes (server keeps a few seconds of per-symbol cache, so many users cost one upstream read)
                    every ~5 s while the US market is open and the tab is visible, slower out of hours, paused when hidden
     same device    several open tabs share ONE poller through BroadcastChannel (a leader tab polls, the others listen)
     sample mode    a small local simulator nudges prices so the screens behave exactly like the live ones
   Subscribers get {changed:[tickers], session, at}. */
import { D, emit, symOf, isCash } from "./data.js";
import { isDemo } from "./store.js";

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const publish = (changed) => subs.forEach((f) => { try { f({ changed, session: D.session, at: D.liveAt }); } catch (e) { /* subscriber error */ } });

let timer = null, running = false, interval = 5000, fails = 0, id = Math.random().toString(36).slice(2), bc = null, lastHeard = 0;
export const status = { mode: "idle", at: 0, session: "closed", every: 0, leader: false };

function nextInterval() {
  if (document.hidden) return 0;
  if (D.session === "open") return 5000;
  if (D.session === "pre" || D.session === "post") return 20000;
  return 120000;
}
function apply(q, session, at, fromPeer) {
  const map = Object.fromEntries(D.holdings.items.filter((h) => !isCash(h)).map((h) => [symOf(h), h.tk]));
  const changed = [];
  for (const [sym, v] of Object.entries(q || {})) {
    const tk = map[sym]; if (!tk || !(v.px > 0)) continue;
    const old = D.quotes[tk];
    if (!old || old.px !== v.px) { D.quotes[tk] = { px: v.px, prev: v.prev || (D.stats[tk] && D.stats[tk].prev) || (old && old.prev) || v.px, t: v.t, was: old ? old.px : v.px }; changed.push(tk); }
  }
  D.session = session || D.session; D.liveAt = at || Date.now(); status.at = D.liveAt; status.session = D.session;
  if (changed.length) { emit("quotes"); publish(changed); } else publish([]);
  if (!fromPeer && bc) { try { bc.postMessage({ id, q, session, at: D.liveAt }); } catch (e) { /* closed */ } }
}

/* ---------- real-account poller ---------- */
async function pollReal() {
  const syms = [...new Set(D.holdings.items.filter((h) => !isCash(h)).map(symOf))].slice(0, 25);
  if (!syms.length) return;
  const r = await window.PT_AUTH.fetch("/api/free/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: syms }) });
  if (r.status === 401) { status.mode = "signed-out"; stop(); return; }
  if (r.status === 429) { fails++; return; }
  if (!r.ok) throw new Error("quotes_" + r.status);
  const j = await r.json(); fails = 0;
  /* a market is only "open" if the newest trade is recent; otherwise treat as closed so we stop hammering */
  let session = j.session;
  if (session === "open") { const newest = Math.max(0, ...Object.values(j.q || {}).map((x) => Date.parse(x.t) || 0)); if (newest && Date.now() - newest > 25 * 6e4) session = "closed"; }
  apply(j.q, session, Date.parse(j.asOf) || Date.now(), false);
}
/* ---------- sample-mode simulator ---------- */
function simTick() {
  const items = D.holdings.items.filter((h) => !isCash(h) && D.stats[h.tk]);
  if (!items.length) return;
  D.session = "open";
  const q = {}, n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const h = items[Math.floor(Math.random() * items.length)], st = D.stats[h.tk], cur = (D.quotes[h.tk] && D.quotes[h.tk].px) || st.px;
    const vol = (D.risk[h.tk] ? D.risk[h.tk].vol : 0.3) / Math.sqrt(252 * 390 * 12);
    const z = (Math.random() + Math.random() + Math.random() - 1.5) * 1.6, pull = (st.px - cur) / st.px * 0.04;
    q[symOf(h)] = { px: Math.max(0.01, +(cur * (1 + z * vol * 6 + pull)).toFixed(cur < 10 ? 3 : 2)), t: new Date().toISOString() };
  }
  apply(q, "open", Date.now(), true);
}

async function loop() {
  if (!running) return;
  clearTimeout(timer);
  if (document.hidden) return;                      // resumed by visibilitychange
  const demo = isDemo();
  let wait;
  try {
    if (demo) { simTick(); wait = 2200 + Math.random() * 1800; status.mode = "sample"; }
    else {
      const leaderAlive = Date.now() - lastHeard < Math.max(15000, interval * 3);
      status.leader = !leaderAlive;
      if (leaderAlive) { wait = Math.max(8000, interval); status.mode = "shared"; }
      else { await pollReal(); status.mode = "live"; wait = nextInterval() || 5000; }
      wait = Math.min(wait * (1 + Math.min(fails, 5) * 0.8), 300000);
    }
    interval = wait; status.every = wait;
  } catch (e) { fails++; status.mode = "retry"; wait = Math.min(5000 * 2 ** Math.min(fails, 5), 120000); }
  timer = setTimeout(loop, wait);
}
export function start() {
  if (running) return; running = true;
  if (!isDemo()) {
    try { bc = new BroadcastChannel("pt-live-v1"); bc.onmessage = (e) => { const m = e.data; if (!m || m.id === id) return; lastHeard = Date.now(); apply(m.q, m.session, m.at, true); }; } catch (e) { bc = null; }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running) { clearTimeout(timer); loop(); } });
  window.addEventListener("online", () => { fails = 0; if (running) { clearTimeout(timer); loop(); } });
  loop();
}
export function stop() { running = false; clearTimeout(timer); try { bc && bc.close(); } catch (e) { /* ignore */ } }
export const refreshNow = () => { clearTimeout(timer); fails = 0; loop(); };
