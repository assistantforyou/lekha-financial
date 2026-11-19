/* v2 Analysis: the complete classic terminal, nothing left out: overview panels (macro regime, rotation + RRG, leadership, breadth,
   risk appetite, overbought/oversold, factors, capital flows, news, holdings ledger), the intrinsic-value (DCF) tab with margin of
   safety, and settings and data (themes, alerts, plans). It runs the same app in embed mode inside this shell, sharing
   the login, plan, holdings and language, and sizing itself to its content so there is one scrollbar. */
import { t } from "/core/i18n.js";
import { esc } from "/core/util.js";
import { segHtml, bindSeg } from "./shared.js";

let sub = "ov", frame = null, onMsg = null;
const SUBS = () => [["ov", t("Overview")], ["val", t("Intrinsic value")], ["set", t("Settings and data")]];
const src = (k) => `/?embed=1&tab=${k}`;
export default {
  static: true,   // never re-rendered by data events, so the embedded app keeps its state
  render() {
    return `<div class="page"><div class="row">${segHtml("an", SUBS(), sub)}</div><iframe id="an-frame" title="${esc(t("Analysis"))}" src="${src(sub)}" style="width:100%;min-height:75dvh;border:0;background:transparent;border-radius:14px" loading="eager"></iframe></div>`;
  },
  mount(root) {
    frame = root.querySelector("#an-frame");
    bindSeg(root, "an", (k) => { sub = k; frame.src = src(k); });
    if (onMsg) window.removeEventListener("message", onMsg);
    onMsg = (e) => { if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow) return; const h = e.data && e.data.ptEmbedHeight; if (h > 200) frame.style.height = Math.min(h + 8, 60000) + "px"; };
    window.addEventListener("message", onMsg);
  },
};
