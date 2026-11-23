/* Portfolio Terminal: language support (10 languages).
   How it works: the app is written in English. Every piece of visible text is looked up, as a whole sentence
   or label, in a per-language dictionary (public/i18n/<code>.js, loaded before first paint) and replaced in
   place. Numbers, dates, tickers and inline markup are lifted out as placeholders first, so one dictionary
   entry covers every value ("Your portfolio is worth <1>{1}</1>, up <2>{2}</2> today"), word order can change
   per language, and dates are written with the language's own month names. Elements keep their identity
   (ids, classes, listeners): only text moves. A MutationObserver translates anything the app renders later.
   Browser: window.PT_I18N.  Node (tests): module.exports (the pure text functions only). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(null);
  else root.PT_I18N = factory(root);
})(typeof self !== "undefined" ? self : this, function (W) {
  "use strict";

  var LANGS = [
    { code: "en", native: "English", locale: "en-GB", short: "EN" },
    { code: "th", native: "ไทย", locale: "th-TH-u-ca-gregory", short: "TH" },
    { code: "zh-Hans", native: "简体中文", locale: "zh-CN", short: "简" },
    { code: "zh-Hant", native: "繁體中文", locale: "zh-TW", short: "繁" },
    { code: "ja", native: "日本語", locale: "ja-JP", short: "JA" },
    { code: "ko", native: "한국어", locale: "ko-KR", short: "KO" },
    { code: "es", native: "Español", locale: "es-ES", short: "ES" },
    { code: "hi", native: "हिन्दी", locale: "hi-IN", short: "HI" },
    { code: "vi", native: "Tiếng Việt", locale: "vi-VN", short: "VI" },
    { code: "fr", native: "Français", locale: "fr-FR", short: "FR" }
  ];
  /* language names for the AI analyst's instructions */
  var LANG_NAMES = { th: "Thai", "zh-Hans": "Simplified Chinese (Mandarin)", "zh-Hant": "Traditional Chinese (Mandarin)", ja: "Japanese", ko: "Korean", es: "Spanish", hi: "Hindi", vi: "Vietnamese", fr: "French" };

  /* ================= pure text functions ================= */
  var MON = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  var WD = "Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:rs|rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?";
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  var WDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  /* ALL-CAPS words that are abbreviations, not tickers: they stay literal in dictionary keys */
  var ABBR = /^(?:USD|THB|HKD|EUR|GBP|JPY|CNY|AI|ETF|ETFS|CPI|GDP|PCE|VIX|SEC|EPS|DCF|MOS|IV|RRG|OBOS|RS|SMA|EMA|ROE|FX|LLM|API|CSV|PDF|JSON|SVG|FRED|CFTC|TIC|CNN|YTD|YOY|QOQ|TTM|FY|NAV|AUM|IPO|US|UK|EU|DEMO|FREE|PAID|NEW|PRO|ALL|N\/A|NA|OK|ID|URL|PE|PEG|ERP|SBC|FCF|OCF|EBIT|CAGR|P&L|PNL|THB|VS|AND|OR|THE|FOR|TO|OF|IN|ON)$/;

  /* one combined tokenizer: dates first, then times, ISO dates, numbers; an optional second pass lifts tickers */
  var RE_TOKEN = new RegExp(
    "(?:(" + WD + "),? )?(\\d{1,2}) (" + MON + ")\\.?(?: (\\d{4}))?\\b" +            /* 1-4  D Mon [YYYY] */
    "|\\b(" + MON + ")\\.? (\\d{1,2}),? (\\d{4})\\b" +                                 /* 5-7  Mon D, YYYY */
    "|\\b(" + MON + ")\\.? (\\d{4})\\b" +                                              /* 8-9  Mon YYYY */
    "|\\b(" + MON + ") (\\d{1,2})\\b(?![,.]? ?\\d)" +                                  /* 10-11 Mon D */
    "|\\b(\\d{4}-\\d{2}-\\d{2}(?:T[\\d:.]+Z?)?)" +                                     /* 12   ISO date/time */
    "|\\b(\\d{1,2}:\\d{2}(?::\\d{2})?)\\b" +                                           /* 13   clock time */
    "|([+\\-\\u2212\\u2013]?[$\\u0E3F\\u20AC\\u00A3\\u00A5]?\\d[\\d,]*(?:\\.\\d+)?(?:%|[kKMBT]\\b|[xX]\\b|[DWMY]\\b)?)", /* 14 number */
    "g");
  var RE_TICKER = /(^|[^A-Za-z0-9&.\-])([A-Z][A-Z0-9]{1,4}(?:\.[A-Z]{1,2})?)(?=$|[^A-Za-z0-9&])/g;

  /* Glossary terms (sector names, RRG quadrants, ...): in a third matching pass they become slots like numbers do,
     so one template covers every combination ("{1} is {2} with {3} of {4} stocks above their {5}-day"). Each slot is
     translated on its own through the dictionary when the template is filled. */
  var GLOSS_RE = null;
  function setGloss(list) {
    list = (list || []).slice().sort(function (a, b) { return b.length - a.length; });
    GLOSS_RE = list.length ? new RegExp("(^|[^A-Za-z0-9])(" + list.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")(?=$|[^A-Za-z0-9])", "g") : null;
  }
  function monIdx(s) { return MONTHS.indexOf(s.slice(0, 3).toLowerCase()); }
  function wdIdx(s) { return WDAYS.indexOf(s.slice(0, 3).toLowerCase()); }

  /* split a text into {key, slots}: values become {1}, {2}, ... in order of appearance */
  function norm(text, tickers) {
    var slots = [], out = "", last = 0, m;
    function tokenize(seg) {
      var s = "", pos = 0, mm;
      RE_TOKEN.lastIndex = 0;
      while ((mm = RE_TOKEN.exec(seg))) {
        s += seg.slice(pos, mm.index);
        var tok = mm[0];
        /* a number glued to letters ("S&P500", "FY2025") stays literal: only whole-word numbers become slots */
        var before = seg.charAt(mm.index - 1);
        if (mm[14] !== undefined && /[A-Za-z]/.test(before) && !/[$฿€£¥+\-−–]/.test(tok.charAt(0))) { s += tok; pos = RE_TOKEN.lastIndex; continue; }
        /* "GS10 Jul 2026": the 10 belongs to the series name, not to a date. Keep it literal and rescan from "Jul 2026". */
        if (mm[2] !== undefined && mm[1] === undefined && /[A-Za-z]/.test(before)) { var dl = String(mm[2]).length; s += tok.slice(0, dl); pos = mm.index + dl; RE_TOKEN.lastIndex = pos; continue; }
        var slot;
        if (mm[2] !== undefined) slot = { d: "dm", day: +mm[2], mon: monIdx(mm[3]), year: mm[4] ? +mm[4] : null, wd: mm[1] ? wdIdx(mm[1]) : null, raw: tok };
        else if (mm[5] !== undefined) slot = { d: "dm", day: +mm[6], mon: monIdx(mm[5]), year: +mm[7], wd: null, raw: tok };
        else if (mm[8] !== undefined) slot = { d: "my", mon: monIdx(mm[8]), year: +mm[9], raw: tok };
        else if (mm[10] !== undefined) slot = { d: "dm", day: +mm[11], mon: monIdx(mm[10]), year: null, wd: null, raw: tok };
        else slot = { raw: tok };
        slots.push(slot); s += "{" + slots.length + "}";
        pos = RE_TOKEN.lastIndex;
      }
      return s + seg.slice(pos);
    }
    /* <k>, </k>, <k/> markers are structure, never values: tokenise only the text between them */
    var t = text.split(/(<\/?\d+\/?>)/).map(function (seg, i) { return i % 2 ? seg : tokenize(seg); }).join("");
    if (tickers) {
      /* second pass: lone ALL-CAPS words (not abbreviations, not part of a caps phrase) are tickers; with
         tickers === 2 the glossary terms become slots as well. Comma-separated runs of them become ONE list slot,
         so "A, B" and "A, B, C, D" share a dictionary key. */
      var hits = [], m2;
      RE_TICKER.lastIndex = 0;
      while ((m2 = RE_TICKER.exec(t))) {
        var tk = m2[2], off = m2.index + m2[1].length;
        if (ABBR.test(tk)) continue;
        var after = t.slice(off + tk.length), prev = t.slice(0, off);
        if (/^\s+[A-Z]{2,}\b/.test(after) || /\b[A-Z]{2,}\s+$/.test(prev)) continue; /* part of a caps phrase */
        hits.push({ i: off, len: tk.length, raw: tk });
        RE_TICKER.lastIndex = off + tk.length;
      }
      if (tickers === 2 && GLOSS_RE) {
        GLOSS_RE.lastIndex = 0;
        while ((m2 = GLOSS_RE.exec(t))) { var off2 = m2.index + m2[1].length; hits.push({ i: off2, len: m2[2].length, raw: m2[2], g: true }); GLOSS_RE.lastIndex = off2 + m2[2].length; }
      }
      /* drop overlaps (keep the longer), then order by position */
      hits.sort(function (a, b) { return a.i - b.i || b.len - a.len; });
      var marks = [], endAt = -1;
      hits.forEach(function (h) { if (h.i >= endAt) { marks.push({ i: h.i, len: h.len, hit: h }); endAt = h.i + h.len; } });
      var nre = /\{(\d+)\}/g, nm;
      while ((nm = nre.exec(t))) marks.push({ i: nm.index, len: nm[0].length, num: slots[+nm[1] - 1] });
      marks.sort(function (a, b) { return a.i - b.i; });
      var order = [], key = "", pos = 0, prevHit = null, prevEnd = 0;
      marks.forEach(function (mk) {
        if (mk.hit && prevHit && t.slice(prevEnd, mk.i) === ", ") {
          /* extend the previous list slot over ", item" */
          var last = order[order.length - 1];
          last.items = last.items || [{ raw: last.raw, g: last.g }];
          last.items.push({ raw: mk.hit.raw, g: mk.hit.g });
          last.raw += ", " + mk.hit.raw; last.list = true;
          pos = mk.i + mk.len; prevEnd = pos; return;
        }
        key += t.slice(pos, mk.i);
        if (mk.hit) { order.push({ raw: mk.hit.raw, g: mk.hit.g }); prevHit = mk.hit; } else { order.push(mk.num); prevHit = null; }
        key += "{" + order.length + "}";
        pos = mk.i + mk.len; prevEnd = pos;
      });
      key += t.slice(pos);
      return { key: key, slots: order };
    }
    return { key: t, slots: slots };
  }

  var LOCALE = "en-GB", DATEFMT = {};
  function fmtDate(s, locale) {
    try {
      var o = { timeZone: "UTC" };
      if (s.d === "my") { o.month = "short"; o.year = "numeric"; }
      else { o.day = "numeric"; o.month = "short"; if (s.year) o.year = "numeric"; }
      var k = locale + JSON.stringify(o), f = DATEFMT[k] || (DATEFMT[k] = new Intl.DateTimeFormat(locale, o));
      var d = new Date(Date.UTC(s.year || 2000, s.mon, s.d === "my" ? 1 : s.day));
      var out = f.format(d);
      if (s.wd != null && s.wd >= 0) {
        var wk = (DATEFMT["w" + locale] = DATEFMT["w" + locale] || new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })).format(new Date(Date.UTC(2024, 0, 1 + s.wd)));
        out = /^(?:zh|ja|ko)/.test(locale) ? out + " " + wk : wk + " " + out;
      }
      return out;
    } catch (e) { return s.raw; }
  }
  /* put slot values back into a translated template; dates take the language's own month names */
  /* a number slot can carry the comma that followed it in English ("2015, XLC"). Keep it when the translation goes
     on in a Latin-style sentence; drop it when the translation supplies its own punctuation or continues in
     Chinese, Japanese, Korean, Thai or Hindi, where it would sit wrongly ("2015, 起", "2015,,"). */
  var COMMA_GONE = /^(?:$|[).;:,\]\u3000-\u303F\uFF00-\uFFEF]|[\u0900-\u097F\u0E00-\u0E7F\u2E80-\u9FFF\uAC00-\uD7AF])/;
  function fill(tpl, slots, locale) {
    return tpl.replace(/\{(\d+)\}/g, function (all, n, off, str) {
      var s = slots[+n - 1]; if (!s) return all;
      if (!s.list && !s.d && !s.g && s.raw.length > 1 && s.raw.charAt(s.raw.length - 1) === ",") {
        var nxt = str.slice(off + all.length).replace(/^ +/, "");
        if (COMMA_GONE.test(nxt)) return s.raw.slice(0, -1);
      }
      if (s.list) {
        var cjk = /^(?:zh|ja)/.test(locale), sep = cjk ? "、" : ", ";
        return s.items.map(function (it) { return it.g && DICT[it.raw] != null ? DICT[it.raw] : it.raw; }).join(sep);
      }
      if (s.g) return DICT[s.raw] != null ? DICT[s.raw] : s.raw;
      return s.d ? fmtDate(s, locale) : s.raw;
    });
  }

  var DICT = {};
  var ABBREV = /^(?:st\.|vs\.|e\.g\.|i\.e\.|etc\.|inc\.|ltd\.|co\.|corp\.|no\.|u\.s\.|dr\.|mr\.|ms\.|approx\.|est\.|fig\.|cf\.|incl\.)$/i;
  /* split a unit into labels and sentences: at " · " and " | " (label separators) and after a full stop that
     starts a new sentence. Splits never fall inside a <k>…</k> pair. Returns [piece, sep, piece, sep, ...] */
  function pieces(src) {
    var out = [], depth = 0, last = 0, m, re = /<(\/?)(\d+)(\/?)>| · | \| |([.!?\u2026][)”"]?)( )(?=[A-Z<{(“"])/g;
    while ((m = re.exec(src))) {
      if (m[2] !== undefined) { if (m[3] !== "/") depth += m[1] ? -1 : 1; continue; }
      if (depth !== 0) continue;
      if (m[4] !== undefined) {
        /* "St. Louis", "e.g. Fed", "vs. Nasdaq": a full stop after an abbreviation is not the end of a sentence */
        if (m[4].charAt(0) === "." && ABBREV.test((src.slice(last, m.index + 1).match(/([A-Za-z.]+)$/) || [""])[0])) continue;
        out.push(src.slice(last, m.index + m[4].length)); out.push(" "); last = m.index + m[0].length;
      }
      else { out.push(src.slice(last, m.index)); out.push(m[0]); last = m.index + m[0].length; }
    }
    out.push(src.slice(last));
    return out;
  }
  /* a piece keeps the tag ids of the whole unit, but dictionary keys number their tags from 1: renumber, then restore */
  function localTags(src) {
    var map = [], re = /<(\/?)(\d+)(\/?)>/g;
    var text = src.replace(re, function (all, c1, id, c2) {
      var k = map.indexOf(id); if (k < 0) k = map.push(id) - 1;
      return "<" + c1 + (k + 1) + c2 + ">";
    });
    return { text: text, map: map };
  }
  function globalTags(tpl, map) {
    if (!map.length) return tpl;
    return tpl.replace(/<(\/?)(\d+)(\/?)>/g, function (all, c1, id, c2) { return "<" + c1 + (map[+id - 1] || id) + c2 + ">"; });
  }
  function lookupOne(src, locale) {
    var r = lookupExact(src, locale);
    if (r.ok || !/[.。]$/.test(src.trim())) return r;
    /* "…hold their trend." closing a clause: look the entry up without its full stop, then put one back */
    var t = src.replace(/\.(\s*)$/, "$1"), q = lookupExact(t, locale);
    if (q.ok) { q.text = q.text + (/^(?:zh|ja)/.test(locale) ? "。" : "."); return q; }
    return r;
  }
  function lookupExact(src, locale) {
    var L = localTags(src), a = norm(L.text, false), v = DICT[a.key];
    if (v == null) {
      var b = norm(L.text, true); v = DICT[b.key];
      if (v != null) return { text: globalTags(fill(v, b.slots, locale), L.map), ok: true, key: b.key };
      var c = GLOSS_RE ? norm(L.text, 2) : b; v = DICT[c.key];
      if (v != null) return { text: globalTags(fill(v, c.slots, locale), L.map), ok: true, key: c.key };
      return { text: null, ok: false, k1: a.key, k2: b.key, k3: c.key };
    }
    return { text: globalTags(fill(v, a.slots, locale), L.map), ok: true, key: a.key };
  }
  /* last resort for list-like text ("Equal-weight S&P 500 Leading → Weakening"): translate the longest known
     phrases word by word and leave the rest as it is; the caller still reports the piece as incomplete */
  function phrases(src, locale) {
    var toks = src.split(/(<\/?\d+\/?>|\s+)/), out = "", matched = 0, total = 0, i = 0;
    var isWord = function (t) { return t && !/^\s+$/.test(t) && !/^<\/?\d+\/?>$/.test(t); };
    toks.forEach(function (t) { if (isWord(t) && /[A-Za-z]{3,}/.test(t)) total++; });
    while (i < toks.length) {
      if (!isWord(toks[i])) { out += toks[i]; i++; continue; }
      var done = false;
      for (var n = 8; n >= 1 && !done; n--) {
        var words = [], j = i, cnt = 0;
        while (j < toks.length && cnt < n) { if (isWord(toks[j])) { words.push(toks[j]); cnt++; j++; } else if (/^\s+$/.test(toks[j]) && cnt) { j++; } else break; }
        if (cnt < n) continue;
        var cand = words.join(" "), trail = "";
        /* an entry written with its own trailing punctuation ("Left leadership:") wins over the bare phrase */
        var f0 = norm(cand, false), fv = DICT[f0.key];
        if (fv == null && /[A-Z]{2}/.test(cand)) { f0 = norm(cand, true); fv = DICT[f0.key]; }
        if (fv != null && f0.key !== fv) { out += fill(fv, f0.slots, locale); i = j; done = true; matched += words.filter(function (w) { return /[A-Za-z]{3,}/.test(w); }).length; continue; }
        /* peel trailing punctuation; a closing bracket only when its opener is not part of the phrase */
        for (;;) {
          var c = cand.slice(-1);
          if (/[,.;:!?]/.test(c)) { trail = c + trail; cand = cand.slice(0, -1); }
          else if (c === ")" && cand.split("(").length < cand.split(")").length) { trail = c + trail; cand = cand.slice(0, -1); }
          else break;
        }
        if (!cand) continue;
        var a = norm(cand, false), v = DICT[a.key];
        if (v == null && /[A-Z]{2}/.test(cand)) { var b = norm(cand, true); v = DICT[b.key]; a = b; }
        if (v != null && a.key !== v) { out += fill(v, a.slots, locale) + trail; i = j; done = true; matched += words.filter(function (w) { return /[A-Za-z]{3,}/.test(w); }).length; }
      }
      if (!done) { out += toks[i]; i++; }
    }
    /* a sentence that is mostly untranslated stays in English rather than becoming a patchwork */
    return matched && total && matched / total >= 0.6 ? out : null;
  }

  /* clauses joined by "; " ("A is Lagging with 38% …; B is Weakening with …"): each clause is a template of its own */
  function clauses(src) {
    var out = [], depth = 0, last = 0, m, re = /<(\/?)(\d+)(\/?)>|; /g;
    while ((m = re.exec(src))) {
      if (m[2] !== undefined) { if (m[3] !== "/") depth += m[1] ? -1 : 1; continue; }
      if (depth !== 0) continue;
      out.push(src.slice(last, m.index)); out.push(m[0]); last = m.index + m[0].length;
    }
    out.push(src.slice(last));
    return out;
  }
  var KEY = function (r) { return r.k3 && r.k3 !== r.k2 ? r.k3 : (r.k1 !== r.k2 && /\{\d+\}/.test(r.k2) ? r.k2 : r.k1); };
  /* one label/sentence: whole entry, else its "; " clauses, else known phrases word by word */
  function onePiece(p, locale, miss) {
    var r = lookupOne(p, locale);
    if (r.ok) return { text: r.text, full: true };
    var cl = clauses(p);
    if (cl.length > 1) {
      var any = false, full = true, out = cl.map(function (c, i) {
        if (i % 2) return c;
        var q = lookupOne(c, locale);
        if (q.ok) { any = true; return q.text; }
        var ph = phrases(c, locale);
        if (miss) miss(KEY(q), c, !!ph);
        full = false;
        if (ph) { any = true; return ph; }
        return c;
      });
      return { text: any ? out.join("") : null, full: full && any };
    }
    var ph2 = phrases(p, locale);
    if (miss) miss(KEY(r), p, !!ph2);
    return { text: ph2, full: false };
  }
  function translate(src, locale, miss) {
    var whole = lookupOne(src, locale);
    if (whole.ok) return whole.text;
    var parts = pieces(src);
    if (parts.length === 1) return onePiece(src, locale, miss).text;
    var any = false, out = parts.map(function (p, i) {
      if (i % 2) return p;
      var nk = norm(p, false).key;
      if (!/[A-Za-z]{3,}/.test(nk.replace(/\{\d+\}/g, "")) && DICT[nk.replace(/\.$/, "")] == null) return p;
      var r = onePiece(p, locale, miss);
      if (r.text != null) { any = true; return r.text; }
      return p;
    });
    return any ? out.join("") : null;
  }

  var api = { LANGS: LANGS, LANG_NAMES: LANG_NAMES, norm: norm, fill: fill, fmtDate: fmtDate, translate: translate, pieces: pieces, localTags: localTags,
    setDict: function (d) { DICT = d || {}; }, setGloss: setGloss, dict: function () { return DICT; } };
  if (!W) return api;

  /* ================= browser ================= */
  var D = document, R = D.documentElement;
  var prefs = {}; try { prefs = JSON.parse(localStorage.getItem("ptpub.v1.prefs") || "null") || {}; } catch (e) {}
  var code = prefs.lang, info = LANGS.filter(function (l) { return l.code === code; })[0] || LANGS[0];
  api.lang = info.code; api.locale = info.locale;
  var loaded = W.PT_DICT || {};
  DICT = loaded; setGloss(W.PT_GLOSS || []);
  api.has = info.code !== "en" && Object.keys(DICT).length > 0;
  R.setAttribute("lang", info.code === "zh-Hans" ? "zh-Hans" : info.code);
  api.t = function (key, vars) { /* for text that never reaches the DOM */
    var r = norm(key, false), v = DICT[r.key]; if (v == null) return key;
    return fill(v, vars ? vars.map(function (x) { return { raw: String(x) }; }) : r.slots, info.locale);
  };

  /* Dynamic translation. The bundled dictionaries cover the classic panels; copy that was written later, or
     anything a document adds, misses them. Those strings are queued here and translated on the server once,
     then kept in the shared cache. New copy therefore works without regenerating the dictionaries. */
  var dynQ = {}, dynSent = {}, dynTimer = 0, dynBusy = false, dynUntil = Date.now() + 180000, dynCount = 0;
  var dynOn = info.code !== "en" && typeof W.fetch === "function";
  function dynKey(s) { return norm(String(s).replace(/<\/?\d+\/?>/g, ""), false).key; }
  function queueDyn(src) {
    if (!dynOn) return;
    var s = String(src == null ? "" : src).replace(/\s+/g, " ").trim();
    if (s.length < 2 || s.length > 300 || !HAS_LETTERS.test(s)) return;
    if (DICT[dynKey(s)] != null || dynSent[s] || dynQ[s] || dynCount >= 400 || Date.now() > dynUntil) return;
    dynQ[s] = 1; dynCount++;
    if (!dynTimer) dynTimer = setTimeout(dynFlush, 600);
  }
  function dynApply(map) {
    var changed = false;
    for (var src in map) {
      var v = map[src]; if (typeof v !== "string" || !v || v === src) continue;
      var k = dynKey(src);
      if (DICT[k] == null) { DICT[k] = v; changed = true; }
    }
    if (changed) { api.has = true; setTimeout(function () { try { api.rescan(); } catch (e) {} }, 0); }
  }
  function dynFlush() {
    dynTimer = 0;
    if (dynBusy) { dynTimer = setTimeout(dynFlush, 400); return; }
    var batch = Object.keys(dynQ).slice(0, 80);
    if (!batch.length) return;
    batch.forEach(function (s) { delete dynQ[s]; dynSent[s] = 1; });
    dynBusy = true;
    W.fetch("/api/data/i18n", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: info.code, texts: batch })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var map = j && j.data && j.data.map; if (map) dynApply(map);
    }).catch(function () { /* offline: the string stays English until the next visit */ }).then(function () {
      dynBusy = false;
      if (Object.keys(dynQ).length) dynTimer = setTimeout(dynFlush, 400);
    });
  }
  api.dynFlush = dynFlush;
  W.PT_I18N_DYNAMIC = { queue: queueDyn, flush: dynFlush, dict: DICT };

  var collect = /[?&]i18n=collect/.test(location.search) || !!W.PT_I18N_COLLECT;
  var seen = {}, miss = {};
  function recMiss(k, sample, partial) {
    if (!/[a-z]/.test(k.replace(/<\/?\d+\/?>/g, "")) && k.length <= 16) return; /* USD, ETF, MOS, VIX, …: left as they are */
    if (!miss[k]) miss[k] = { n: 0, s: sample, p: !!partial }; miss[k].n++;
  }
  api.seen = seen; api.missing = miss;
  var active = info.code !== "en" || collect;

  var INLINE = { a: 1, abbr: 1, b: 1, bdi: 1, br: 1, cite: 1, code: 1, em: 1, i: 1, kbd: 1, mark: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1, time: 1, u: 1, wbr: 1, tspan: 1 };
  var SKIP = { script: 1, style: 1, noscript: 1, textarea: 1, input: 1, pre: 1, template: 1, canvas: 1, iframe: 1, path: 1, line: 1, rect: 1, circle: 1, polyline: 1, polygon: 1 };
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  var HAS_LETTERS = /[A-Za-z]{3,}/;

  function skipEl(el) { return SKIP[el.localName] || el.getAttribute("translate") === "no" || (el.classList && el.classList.contains("notranslate")); }
  function allInline(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) { if (!INLINE[c.localName] || skipEl(c) || !allInline(c)) return false; }
    return true;
  }
  function ownText(el) { for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /[A-Za-z]/.test(n.nodeValue)) return true; return false; }

  function collapse(s) { return s.replace(/\s+/g, " "); }
  /* element -> {src, elems, lead, trail} with inline elements as <k>…</k> / <k/> */
  function unitOf(root) {
    var elems = [], src = "";
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) src += c.nodeValue;
        else if (c.nodeType === 1) {
          var k = elems.push(c);
          if (c.firstChild) { src += "<" + k + ">"; walk(c); src += "</" + k + ">"; } else src += "<" + k + "/>";
        }
      }
    })(root);
    src = collapse(src);
    var lead = /^\s/.test(src) ? " " : "", trail = /\s$/.test(src) && src.length > 1 ? " " : "";
    return { src: src.trim(), elems: elems, lead: lead, trail: trail };
  }
  function validTags(tpl, n) {
    var re = /<(\/?)(\d+)(\/?)>/g, m, stack = [], seenIds = {};
    while ((m = re.exec(tpl))) {
      var id = +m[2]; if (id < 1 || id > n) return false;
      if (m[3] === "/") { if (seenIds[id]) return false; seenIds[id] = 1; }
      else if (!m[1]) { if (seenIds[id]) return false; seenIds[id] = 1; stack.push(id); }
      else { if (stack.pop() !== id) return false; }
    }
    return stack.length === 0;
  }
  function rebuild(root, tpl, elems) {
    var all = elems.slice();
    for (var i = 0; i < all.length; i++) { var e = all[i]; while (e.firstChild) e.removeChild(e.firstChild); }
    while (root.firstChild) root.removeChild(root.firstChild);
    var stack = [root], re = /<(\/?)(\d+)(\/?)>/g, m, last = 0;
    function text(s) { if (s) stack[stack.length - 1].appendChild(D.createTextNode(s)); }
    while ((m = re.exec(tpl))) {
      text(tpl.slice(last, m.index)); last = re.lastIndex;
      var el = elems[+m[2] - 1];
      if (m[1]) stack.pop();
      else { stack[stack.length - 1].appendChild(el); if (!m[3]) stack.push(el); }
    }
    text(tpl.slice(last));
  }

  var applying = false;
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute && el.getAttribute(a);
      if (!v || !HAS_LETTERS.test(v)) continue;
      if (el["__pa_" + a] === v) continue;
      var key = norm(collapse(v).trim(), false).key;
      if (collect) seen[key] = seen[key] || { s: v };
      if (info.code === "en") continue;
      var r = translate(collapse(v).trim(), info.locale, recMiss);
      if (r != null && r !== collapse(v).trim()) { el.setAttribute(a, r); el["__pa_" + a] = r; }
      else queueDyn(collapse(v).trim());
    }
  }
  function doUnit(el) {
    var u = unitOf(el);
    if (!u.src || !HAS_LETTERS.test(u.src.replace(/<\/?\d+\/?>/g, ""))) return;
    if (el.__pti === u.src) return;
    if (collect) { var k = norm(u.src, false).key; if (!seen[k]) seen[k] = { s: u.src, k2: norm(u.src, true).key }; }
    if (info.code === "en") return;
    var r = translate(u.src, info.locale, recMiss);
    if (r == null || r === u.src) { queueDyn(u.src); return; }
    if (!validTags(r, u.elems.length)) return;
    if (!u.elems.length) { /* plain text unit */
      var single = el.childNodes.length === 1 && el.firstChild.nodeType === 3;
      if (single) el.firstChild.nodeValue = u.lead + r + u.trail; else { rebuild(el, u.lead + r + u.trail, []); }
    } else rebuild(el, u.lead + r + u.trail, u.elems);
    el.__pti = unitOf(el).src;
  }
  function doText(n) {
    var raw = n.nodeValue;
    if (!/[A-Za-z]/.test(raw) || n.__pti === raw) return;
    var src = collapse(raw).trim(); if (!HAS_LETTERS.test(src)) return;
    if (collect) { var k = norm(src, false).key; if (!seen[k]) seen[k] = { s: src, k2: norm(src, true).key }; }
    if (info.code === "en") return;
    var r = translate(src, info.locale, recMiss);
    if (r == null || r === src) { queueDyn(src); return; }
    if (/<\/?\d+\/?>/.test(r)) return;
    var lead = /^\s/.test(raw) ? " " : "", trail = /\s$/.test(raw) ? " " : "";
    n.nodeValue = lead + r + trail; n.__pti = n.nodeValue;
  }
  function visit(el) {
    if (el.nodeType === 3) { doText(el); return; }
    if (el.nodeType !== 1 || skipEl(el)) return;
    doAttrs(el);
    if (ownText(el) && allInline(el)) {
      doUnit(el);
      /* attributes of inline children (links, spans) */
      for (var q = el.firstElementChild; q; q = q.nextElementSibling) doAttrs(q);
      return;
    }
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) doText(c);
      else if (c.nodeType === 1) visit(c);
    }
  }
  function inlineClimb(n) {
    var p = n.nodeType === 3 ? n.parentNode : n;
    while (p && p.nodeType === 1 && INLINE[p.localName] && p.parentNode && p.parentNode.nodeType === 1 && !skipEl(p.parentNode)) p = p.parentNode;
    return p;
  }
  var queue = [], pending = false, obs = null;
  function flush() {
    pending = false;
    if (!queue.length) return;
    var items = queue; queue = [];
    applying = true;
    try {
      items.forEach(function (n) {
        if (!n.isConnected) return;
        var top = (n.nodeType === 3 || INLINE[n.localName]) ? inlineClimb(n) : n;
        if (top && top.nodeType === 1 && ownText(top) && allInline(top)) visit(top); else visit(n.nodeType === 3 ? n : (top || n));
      });
    } finally { applying = false; if (obs) obs.takeRecords(); }
  }
  function enqueue(n) { queue.push(n); if (!pending) { pending = true; (W.queueMicrotask || function (f) { Promise.resolve().then(f); })(flush); } }
  function start() {
    if (!active) return;
    queue = [D.body]; flush();
    D.title = translateTitle(D.title);
    obs = new MutationObserver(function (recs) {
      if (applying) return;
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === "childList") { for (var j = 0; j < r.addedNodes.length; j++) enqueue(r.addedNodes[j]); if (!r.addedNodes.length && r.target.nodeType === 1) enqueue(r.target); }
        else if (r.type === "characterData") enqueue(r.target);
        else if (r.type === "attributes") enqueue(r.target);
      }
    });
    obs.observe(D.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function translateTitle(t) { if (info.code === "en") return t; var r = translate(t, info.locale, recMiss); return r || t; }

  /* ---------- exports for the page ---------- */
  api.rescan = function () { queue = [D.body]; flush(); };
  api.report = function () { return { seen: Object.keys(seen).length, missing: Object.keys(miss).map(function (k) { return [k, miss[k].n, miss[k].s, miss[k].p ? 1 : 0]; }) }; };
  api.setLang = function (c) {
    if (!LANGS.some(function (l) { return l.code === c; })) return;
    if (W.PT_UI && W.PT_UI.setPref) W.PT_UI.setPref("lang", c);
    else { prefs.lang = c; try { localStorage.setItem("ptpub.v1.prefs", JSON.stringify(prefs)); } catch (e) {} }
    /* give the debounced account sync a moment before the reload */
    setTimeout(function () { location.reload(); }, 900);
  };

  /* ---------- header language picker ---------- */
  function el(tag, attrs, html) { var x = D.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { x.setAttribute(k, attrs[k]); }); if (html != null) x.innerHTML = html; return x; }
  var css = el("style");
  css.textContent = [
    "#lang-btn{display:inline-flex;align-items:center;gap:6px}#lang-btn svg{width:15px;height:15px;flex:none}",
    "#lang-pop{position:fixed;z-index:31;min-width:210px;max-height:min(70vh,480px);overflow:auto;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 40px color-mix(in srgb,#000 40%,transparent);padding:6px}",
    "#lang-pop[hidden],#lang-backdrop[hidden]{display:none}.lg-o{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:9px 10px;border-radius:5px;cursor:pointer;font-size:14px;min-height:38px}.lg-o:hover,.lg-o[aria-selected='true']{background:var(--accent-soft)}.lg-o small{color:var(--muted);font-family:var(--f-mono);font-size:11px}.lg-o.cur{font-weight:600}.lg-o.cur::after{content:'✓';color:var(--accent)}",
    "@media (max-width:620px){#lang-btn .lg-name{display:none}#lang-backdrop{position:fixed;inset:0;z-index:30;background:color-mix(in srgb,#000 45%,transparent)}",
    "  #lang-pop{left:0!important;right:0!important;top:auto!important;bottom:0!important;max-height:72vh;border-radius:14px 14px 0 0;padding-bottom:calc(6px + env(safe-area-inset-bottom,0px))}.lg-o{min-height:48px;font-size:16px}}",
    "#lang-float{position:fixed;top:12px;right:12px;z-index:20}#lang-float select{font:inherit;font-size:13px;min-height:36px;padding:6px 10px;border:1px solid var(--border,#e3dccf);border-radius:6px;background:var(--background,#fff);color:var(--foreground,#17223b);cursor:pointer}@media (max-width:620px){#lang-float select{min-height:44px;font-size:16px}}",
    "html[lang='th'] body,html[lang='hi'] body{line-height:1.6}html[lang^='zh'] body,html[lang='ja'] body,html[lang='ko'] body{line-height:1.55;word-break:normal;line-break:strict}",
  ].join("\n");
  var btn, pop, backdrop, open = false;
  function place() {
    if (innerWidth <= 620) { pop.style.left = pop.style.top = pop.style.right = ""; return; }
    var r = btn.getBoundingClientRect(), w = 230;
    pop.style.top = Math.round(r.bottom + 6) + "px"; pop.style.left = Math.round(Math.max(12, Math.min(r.right - w, innerWidth - w - 12))) + "px";
  }
  function close() { if (!open) return; open = false; pop.hidden = true; backdrop.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus({ preventScroll: true }); }
  function openPop() {
    open = true; pop.hidden = false; backdrop.hidden = innerWidth > 620; btn.setAttribute("aria-expanded", "true"); place();
    var c = pop.querySelector(".cur") || pop.firstChild; if (c) c.focus();
  }
  /* pages without the app header (the sign-in page): a small native <select> pinned to the top-right corner */
  function buildFloat() {
    if (D.getElementById("lang-float") || !D.getElementById("root")) return;
    D.head.appendChild(css);
    var wrap = el("div", { id: "lang-float", class: "notranslate", translate: "no" });
    var sel = el("select", { "aria-label": api.t("Language") }, LANGS.map(function (l) {
      return '<option value="' + l.code + '" lang="' + l.code + '"' + (l.code === info.code ? " selected" : "") + ">" + l.native + "</option>";
    }).join(""));
    wrap.appendChild(sel); D.body.appendChild(wrap);
    sel.addEventListener("change", function () { if (sel.value !== info.code) api.setLang(sel.value); });
  }
  function build() {
    var status = D.querySelector("header.bar .status");
    if (!status) { buildFloat(); return; }
    if (D.getElementById("lang-btn")) return;
    D.head.appendChild(css);
    btn = el("button", { id: "lang-btn", class: "btn translate-no notranslate", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", title: "Language" },
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><span class="lg-name">' + info.native + "</span>");
    backdrop = el("div", { id: "lang-backdrop", hidden: "" });
    pop = el("div", { id: "lang-pop", hidden: "", role: "listbox", "aria-label": "Language", class: "notranslate", translate: "no" });
    pop.innerHTML = LANGS.map(function (l) { return '<div class="lg-o' + (l.code === info.code ? " cur" : "") + '" role="option" tabindex="0" data-c="' + l.code + '" aria-selected="' + (l.code === info.code) + '"><span lang="' + l.code + '">' + l.native + "</span><small>" + l.short + "</small></div>"; }).join("");
    var anchor = D.getElementById("theme-btn") || D.getElementById("acct");
    status.insertBefore(btn, anchor || null);
    D.body.append(backdrop, pop);
    btn.addEventListener("click", function () { open ? close() : openPop(); });
    backdrop.addEventListener("click", close);
    pop.addEventListener("click", function (e) { var o = e.target.closest(".lg-o"); if (o) { close(); if (o.dataset.c !== info.code) api.setLang(o.dataset.c); } });
    pop.addEventListener("keydown", function (e) {
      var opts = Array.prototype.slice.call(pop.querySelectorAll(".lg-o")), i = opts.indexOf(D.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); opts[(i + opts.length - 1) % opts.length].focus(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (i >= 0) opts[i].click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    D.addEventListener("mousedown", function (e) { if (open && !pop.contains(e.target) && !btn.contains(e.target)) close(); });
    W.addEventListener("resize", function () { if (open) place(); });
  }

  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", function () { start(); build(); });
  else { start(); build(); }
  return api;
});
