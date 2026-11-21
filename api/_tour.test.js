// Run: node api/_tour.test.js
// Quick Tour: every language carries every string with the same placeholders and no pictographs; placement maths keeps the card on screen.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const load = (f) => import(pathToFileURL(path.join(__dirname, "..", "app", "src", "tour", f)).href);

(async () => {
  const { COPY } = await load("copy.js"), { place, scrollDelta } = await load("layout.js");
  const I = require("../public/v2/pt-i18n.js");
  const codes = I.LANGS.map((l) => l.code);
  assert.deepStrictEqual(Object.keys(COPY).sort(), codes.slice().sort(), "tour copy must cover exactly the languages the app ships");
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
  const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  for (const c of codes) {
    for (const k of Object.keys(COPY.en.ui)) { assert.ok(COPY[c].ui[k], `${c} ui.${k}`); assert.strictEqual(ph(COPY[c].ui[k]), ph(COPY.en.ui[k]), `${c} ui.${k} placeholders`); }
    for (const [id, e] of Object.entries(COPY.en.steps)) {
      const s = COPY[c].steps[id]; assert.ok(s, `${c} step ${id}`);
      for (const f of ["t", "b", "a"]) { if (e[f] == null) { assert.ok(s[f] == null, `${c} ${id}.${f} should not exist`); continue } assert.ok(s[f], `${c} ${id}.${f}`); assert.strictEqual(ph(s[f]), ph(e[f]), `${c} ${id}.${f} placeholders`) }
      if (e.wf) assert.strictEqual(s.wf.length, e.wf.length, `${c} workflow chips`);
    }
    assert.ok(!PICTO.test(JSON.stringify(COPY[c])), `${c}: no pictographs (house style)`);
    assert.ok(!/!/.test(JSON.stringify(COPY[c]).replace(/\\"/g, "")), `${c}: no exclamation marks (house style)`);
  }
  // placement: card inside the viewport and clear of the spotlight, for assorted targets and sizes
  const card = { w: 360, h: 230 };
  for (const [vw, vh] of [[1440, 900], [1024, 600], [820, 1180], [390, 844], [320, 568]]) {
    const mobile = vw < 640, top = 56;
    for (const rect of [null, { left: 200, top: 10, right: 560, bottom: 46 }, { left: 0, top: 56, right: 288, bottom: vh }, { left: vw * 0.2, top: 90, right: vw - 8, bottom: vh * 3 }, { left: 20, top: 200, right: vw - 20, bottom: 330 }]) {
      const g = place({ rect: rect && { ...rect, height: rect.bottom - rect.top }, vw, vh, card, top, mobile, prefer: rect && rect.left === 0 ? ["right"] : undefined });
      const c = g.card, h = card.h;
      assert.ok(c.x >= 0 && c.x + c.w <= vw + 0.5, `card x in view ${vw}x${vh} ${JSON.stringify(rect)}`);
      if (!mobile) assert.ok(c.y >= 0 && c.y + h <= vh + 0.5, `card y in view ${vw}x${vh} ${JSON.stringify(rect)}`);
      if (g.spot && g.spot.h > 0) { const s = g.spot; const apart = c.x + c.w <= s.x || c.x >= s.x + s.w || c.y + h <= s.y || c.y >= s.y + s.h; assert.ok(apart, `card clear of spotlight ${vw}x${vh} ${JSON.stringify(rect)} ${g.side}`) }
    }
  }
  assert.strictEqual(scrollDelta({ rect: { top: 100, bottom: 200, height: 100 }, top: 72, bottom: 800 }), null, "already visible: no scroll");
  assert.ok(scrollDelta({ rect: { top: 1500, bottom: 1600, height: 100 }, top: 72, bottom: 800 }) > 1000, "scrolls down to a target below the fold");
  console.log("tour tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
