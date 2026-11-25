/* Portfolio Terminal: deterministic DEMO simulation.
   Everything this file produces is SYNTHETIC, generated locally from a fixed seed:
   no market APIs are called, no real prices are used, nothing is sent to the server.
   The shape of every CSV and document mirrors the real data pipeline exactly, so the
   whole terminal renders as it would for a subscriber — only the numbers are invented.
   The page shows a persistent "DEMO — SIMULATED DATA" banner whenever this source is active.
   Browser: window.PT_DEMO.  Node (tests): module.exports. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PT_DEMO = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---- seeded RNG: same seed -> same numbers, every reload ---- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function iso(d) { return d.toISOString().slice(0, 10); }
  /* The demo's "today" is frozen at 18 Aug 2026 (a Tuesday) so the simulated prices read as outdated;
     the page appends "(Outdated date used for DEMO only)" to every date it shows in this mode. */
  var DEMO_DATE = "2026-08-18";
  /* USD/THB and HKD/USD on the demo date (Frankfurter, 2026-08-18). Keep these in step with DEMO_DATE: the demo
     must not quote a later rate than the prices and filings it shows. */
  var DEMO_USDTHB = 33.06, DEMO_HKDUSD = 0.1282;
  var _todayOverride = DEMO_DATE;
  function todayIso() { return _todayOverride || DEMO_DATE; }
  function daysAgoIso(n) { var d = new Date(todayIso() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return iso(d); }
  function serial(d) { return Math.round(Date.parse(d + "T00:00:00Z") / 864e5) + 25569; }
  function q(v) { v = String(v); return /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  /* ---- trading calendar: weekdays only, strictly up to and including today ---- */
  var CALENDAR = 1700;
  /* The calendar is the same for every symbol on a given "today", and building it costs thousands of Date objects, so it is built once per date
     (it used to be rebuilt for every symbol, about 4 s of main-thread time on a phone). Callers get a copy. */
  var _days = {};
  function tradingDays() { var k = todayIso(); return (_days[k] || (_days[k] = buildTradingDays())).slice(); }
  function buildTradingDays() {
    var out = [], d = new Date(todayIso() + "T00:00:00Z"), end = new Date(todayIso() + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - CALENDAR);
    while (d <= end) {
      var wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) out.push(iso(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  /* ---- per-symbol price config. px = synthetic "today" close the walk is anchored to.
     dr = daily drift, vo = daily noise. All values invented; magnitudes merely plausible. ---- */
  var PORT = [
    { tk: "NVDA", acct: "Demo Brokerage", theme: "Semiconductors", cur: "USD", qty: 60, avg: 66.57, px: 186.4, dr: 7.5e-4, vo: 0.016, be: 1.75 },
    { tk: "AMD", acct: "Demo Brokerage", theme: "Semiconductors", cur: "USD", qty: 40, avg: 152.0, px: 142.3, dr: 2.0e-4, vo: 0.019, be: 1.95 },
    { tk: "AVGO", acct: "Demo Brokerage", theme: "Semiconductors", cur: "USD", qty: 25, avg: 128.4, px: 168.5, dr: 5.5e-4, vo: 0.017, be: 1.6 },
    { tk: "SMH", acct: "Demo Brokerage", theme: "Semiconductors", cur: "USD", qty: 30, avg: 210.0, px: 245.2, dr: 5.0e-4, vo: 0.014, be: 1.55 },
    { tk: "MSFT", acct: "Demo Brokerage", theme: "Megacap tech", cur: "USD", qty: 15, avg: 342.5, px: 428.9, dr: 5.2e-4, vo: 0.011, be: 1.15 },
    { tk: "AAPL", acct: "Demo Brokerage", theme: "Megacap tech", cur: "USD", qty: 40, avg: 195.4, px: 232.1, dr: 3.8e-4, vo: 0.011, be: 1.1 },
    { tk: "0700.HK", acct: "Demo Brokerage", theme: "Megacap tech", cur: "HKD", qty: 100, avg: 362.0, px: 415.0, dr: 2.5e-4, vo: 0.013, be: 0.85 },
    { tk: "TSLA", acct: "Demo Brokerage", theme: "Electric vehicles", cur: "USD", qty: 18, avg: 331.2, px: 214.6, dr: -3.5e-4, vo: 0.028, be: 2.1 },
    { tk: "JPM", acct: "Demo Bank", theme: "Financials", cur: "USD", qty: 30, avg: 210.1, px: 244.8, dr: 4.0e-4, vo: 0.010, be: 1.05 },
    { tk: "XOM", acct: "Demo Bank", theme: "Energy", cur: "USD", qty: 35, avg: 108.2, px: 118.4, dr: 2.2e-4, vo: 0.012, be: 0.8 },
    { tk: "PTT.BK", acct: "Demo Bank", theme: "Energy", cur: "THB", qty: 200, avg: 32.10, px: 34.25, dr: 1.8e-4, vo: 0.009, be: 0.7 },
    { tk: "JNJ", acct: "Demo Retirement", theme: "Health Care", cur: "USD", qty: 25, avg: 162.3, px: 154.9, dr: -0.5e-4, vo: 0.008, be: 0.55 },
    { tk: "PEP", acct: "Demo Retirement", theme: "Consumer staples", cur: "USD", qty: 30, avg: 142.8, px: 158.2, dr: 3.0e-4, vo: 0.007, be: 0.5 },
    /* Thai listings (SET), held in a baht account so the demo shows a second market and a second currency. */
    { tk: "CPALL.BK", acct: "Demo Bangkok", theme: "Thai consumer", cur: "THB", qty: 400, avg: 58.50, px: 62.75, dr: 2.0e-4, vo: 0.010, be: 0.65 },
    { tk: "SCB.BK", acct: "Demo Bangkok", theme: "Thai banks", cur: "THB", qty: 300, avg: 118.0, px: 127.5, dr: 2.6e-4, vo: 0.009, be: 0.95 },
    { tk: "AOT.BK", acct: "Demo Bangkok", theme: "Thai transport", cur: "THB", qty: 500, avg: 62.00, px: 55.25, dr: -1.2e-4, vo: 0.012, be: 0.9 },
    { tk: "DELTA.BK", acct: "Demo Bangkok", theme: "Thai electronics", cur: "THB", qty: 100, avg: 780.0, px: 942.0, dr: 5.8e-4, vo: 0.017, be: 1.3 },
    { tk: "CASH", acct: "Demo Brokerage", theme: "Cash", cur: "USD", qty: 12000, avg: 1, px: 1, dr: 0, vo: 0, be: 0 }
  ];
  var UNIVERSE = {
    "SPY": { px: 597.8, dr: 3.6e-4, vo: 0.008, be: 1 }, "RSP": { px: 173.4, dr: 3.2e-4, vo: 0.008, be: 0.9 },
    "SMH": { px: 245.2, dr: 5.0e-4, vo: 0.014, be: 1.55 }, "XLF": { px: 52.4, dr: 3.4e-4, vo: 0.009, be: 1.05 },
    "XLV": { px: 148.2, dr: 2.4e-4, vo: 0.008, be: 0.6 }, "XLP": { px: 82.6, dr: 1.8e-4, vo: 0.006, be: 0.55 },
    "ITA": { px: 238.9, dr: 4.6e-4, vo: 0.011, be: 1.1 }, "XLE": { px: 98.3, dr: 1.6e-4, vo: 0.013, be: 0.8 },
    "XLB": { px: 92.1, dr: 2.2e-4, vo: 0.010, be: 1.1 }, "XLC": { px: 106.8, dr: 2.8e-4, vo: 0.010, be: 1.05 },
    "XLI": { px: 141.5, dr: 3.0e-4, vo: 0.009, be: 1.05 }, "XLK": { px: 268.4, dr: 5.2e-4, vo: 0.011, be: 1.15 },
    "XLRE": { px: 108.9, dr: 1.2e-4, vo: 0.010, be: 0.7 }, "XLU": { px: 79.8, dr: 1.4e-4, vo: 0.007, be: 0.45 },
    "XLY": { px: 234.6, dr: 3.8e-4, vo: 0.010, be: 1.2 }, "IWM": { px: 241.2, dr: 2.4e-4, vo: 0.013, be: 1.15 },
    "IWD": { px: 281.6, dr: 2.6e-4, vo: 0.010, be: 0.95 }, "IWF": { px: 342.8, dr: 4.6e-4, vo: 0.012, be: 1.15 },
    "SPMO": { px: 98.7, dr: 5.0e-4, vo: 0.010, be: 1.1 }, "IEF": { px: 96.4, dr: 0.4e-4, vo: 0.004, be: -0.4 },
    "QQQ": { px: 521.9, dr: 4.4e-4, vo: 0.011, be: 1.2 },
    "INDEXSP:.INX": { px: 6015, dr: 3.6e-4, vo: 0.007, be: 1 }, "INDEXNASDAQ:.IXIC": { px: 20340, dr: 4.4e-4, vo: 0.009, be: 1.15 }
  };
  function cfgOf(sym) {
    if (UNIVERSE[sym]) return UNIVERSE[sym];
    for (var i = 0; i < PORT.length; i++) if (PORT[i].tk === sym) return { px: PORT[i].px, dr: PORT[i].dr, vo: PORT[i].vo, be: PORT[i].be };
    var r = mulberry32(hash("gen:" + sym));
    var p0 = 20 + r() * 380;
    return { px: null, dr: (r() - 0.45) / 1600, vo: 0.008 + r() * 0.012, be: 0.5 + r() * 1.1, p0: p0 };
  }

  var SERIES = {};
  function seriesOf(sym) {
    if (SERIES[sym]) return SERIES[sym];
    var days = tradingDays(), n = days.length, c = cfgOf(sym);
    var mkt = sym === "SPY" ? null : closesOf("SPY");
    var rnd = mulberry32(hash("px:" + sym)), x = 1, raw = [];
    for (var i = 0; i < n; i++) {
      var m = mkt && i > 0 ? (mkt[i] / mkt[i - 1] - 1) : 0;
      x *= 1 + c.dr + c.be * m + c.vo * (rnd() * 2 - 1);
      if (x < 0.05) x = 0.05; raw.push(x);
    }
    var start = c.p0 || 100, k = (c.px != null && raw[n - 1] > 0) ? (c.px / start) * (start / raw[0]) / (raw[n - 1] / raw[0]) : 1;
    if (c.px != null) k = c.px / raw[n - 1];
    else k = start / raw[0];
    var out = [];
    for (var j = 0; j < n; j++) out.push([days[j], +(raw[j] * k).toFixed(2)]);
    SERIES[sym] = out;
    return out;
  }
  var CLOSES = {};
  function closesOf(sym) { var ser = seriesOf(sym), c = CLOSES[sym]; if (c && c.ser === ser) return c.v; c = CLOSES[sym] = { ser: ser, v: ser.map(function (p) { return p[1]; }) }; return c.v; }

  /* ---- holdings doc (the demo portfolio a visitor can explore and edit) ---- */
  function holdingsDoc() {
    return {
      items: PORT.map(function (p) {
        return { acct: p.acct, tk: p.tk, theme: p.theme, cur: p.cur, qty: p.qty, cost: +(p.qty * p.avg).toFixed(2), px: null };
      }),
      usdthb: DEMO_USDTHB, hkdusd: DEMO_HKDUSD
    };
  }

  /* ---- demo holdings live in their own localStorage namespace ---- */
  var NS = "ptpub.v1.demo.";
  function storeGet(k) {
    try { return JSON.parse((typeof localStorage !== "undefined" ? localStorage : MEM).getItem(NS + k) || "null"); } catch (e) { return null; }
  }
  function storeSet(k, v) {
    try { (typeof localStorage !== "undefined" ? localStorage : MEM).setItem(NS + k, JSON.stringify(v)); } catch (e) { }
  }
  var MEM = { _m: {}, getItem: function (k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem: function (k, v) { this._m[k] = String(v); }, removeItem: function (k) { delete this._m[k]; } };
  function currentHoldings() {
    var d = storeGet("db.holdings/all");
    if (!d || !d.items || !d.items.length) { d = holdingsDoc(); storeSet("db.holdings/all", d); }
    if (d.usdthb == null || d.usdthb === 34.25) d.usdthb = DEMO_USDTHB;   // 34.25 was the pre-cut-off constant
    if (d.hkdusd == null) d.hkdusd = DEMO_HKDUSD;
    return d;
  }
  function quoteSym(h) {
    var t = String(h.tk || "").toUpperCase();
    if (h.cur === "HKD" && !/\.HK$/.test(t)) return /^\d+$/.test(t) ? ("0000" + t).slice(-4) + ".HK" : t + ".HK";
    if (h.cur === "THB" && !/\.BK$/.test(t)) return t + ".BK";
    return t;
  }
  function holdingMap() {
    var m = {};
    (currentHoldings().items || []).forEach(function (h) { if (h && h.tk && h.tk !== "CASH") m[quoteSym(h)] = h.tk; });
    return m;
  }
  function holdingSymbols() { return Object.keys(holdingMap()); }

  /* ---- CSV layouts: byte-compatible with the real pipeline (api/_mappers.js) ---- */
  function rotationCsv(bySym) {
    var syms = Object.keys(bySym).filter(function (k) { return bySym[k] && bySym[k].length; });
    if (!syms.length) return null;
    var n = Math.max.apply(null, syms.map(function (k) { return bySym[k].length; }));
    var header = [], row1 = [];
    syms.forEach(function (k) {
      var s = bySym[k];
      header.push("D|" + k, ""); row1.push("", "");
      header.push("LIVE|" + k); row1.push(String(s[s.length - 1][1]));
      header.push("TDATE|" + k); row1.push(s[s.length - 1][0]);
    });
    var lines = [header.join(","), row1.join(",")];
    for (var i = 0; i < n; i++) {
      var row = [];
      syms.forEach(function (k) {
        var s = bySym[k][i];
        row.push(s ? String(serial(s[0])) : "", s ? String(s[1]) : "", "", "");
      });
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }
  function weeklyFrom(rows) {
    var out = [], key = null;
    rows.forEach(function (p) {
      /* week key = the day number of that week's Monday (no Date objects or strings per row; 1970-01-01 was a Thursday) */
      var dn = Math.round(Date.parse(p[0] + "T00:00:00Z") / 864e5), k = dn - ((dn + 3) % 7);
      if (k === key) out[out.length - 1] = [p[0], p[1]]; else { out.push([p[0], p[1]]); key = k; }
    });
    return out;
  }
  function historyCsv(labelled, tnx) {
    var cols = [];
    Object.keys(labelled).forEach(function (label) {
      var rows = labelled[label];
      if (!rows || !rows.length) return;
      cols.push({ h: "D|" + label, rows: rows }); cols.push({ h: "W|" + label, rows: weeklyFrom(rows) });
    });
    if (!cols.length) return null;
    var n = Math.max.apply(null, cols.map(function (c) { return c.rows.length; }));
    var header = [], live = [];
    cols.forEach(function (c) { header.push(c.h, ""); live.push("", ""); });
    if (tnx != null) { header.push("LIVE|TNX10Y", ""); live.push(String(tnx), ""); }
    var lines = [header.join(","), live.join(",")];
    for (var i = 0; i < n; i++) {
      var row = [];
      cols.forEach(function (c) { var r = c.rows[i]; row.push(r ? String(serial(r[0])) : "", r ? String(r[1]) : ""); });
      if (tnx != null) row.push("", "");
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }
  var BOFF = [0, 5, 21, 63, 126];
  function breadthFlags(closes) {
    var L = closes.length, flags = "";
    BOFF.forEach(function (off) {
      var i = L - 1 - off;
      [50, 200].forEach(function (n) {
        if (i < n - 1) { flags += "x"; return; }
        var sum = 0;
        for (var k = i - n + 1; k <= i; k++) sum += closes[k];
        flags += closes[i] > sum / n ? "1" : "0";
      });
    });
    return flags;
  }
  function wilderRSI(c) {
    var n = c.length, r = new Array(n).fill(null);
    if (n < 15) return r;
    var ag = 0, al = 0;
    for (var i = 1; i <= 14; i++) { var d = c[i] - c[i - 1]; ag += Math.max(d, 0); al += Math.max(-d, 0); }
    ag /= 14; al /= 14;
    r[14] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (var j = 15; j < n; j++) {
      var d2 = c[j] - c[j - 1];
      ag = (ag * 13 + Math.max(d2, 0)) / 14; al = (al * 13 + Math.max(-d2, 0)) / 14;
      r[j] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return r;
  }
  function obCodes(bars, cal) {
    var closes = bars.map(function (b) { return b[1]; });
    var rsi = wilderRSI(closes);
    var at = {}; bars.forEach(function (b, i) { at[b[0]] = i; });
    var chars = "";
    cal.forEach(function (d) {
      var i = at[d];
      if (i === undefined) { chars += "xx"; return; }
      chars += rsi[i] == null ? "x" : rsi[i] < 30 ? "o" : rsi[i] > 70 ? "b" : "n";
      if (i < 49) { chars += "x"; return; }
      var sum = 0;
      for (var k = i - 49; k <= i; k++) sum += closes[k];
      chars += closes[i] > sum / 50 ? "1" : "0";
    });
    return cal[cal.length - 1] + "|" + cal.length + "|" + chars;
  }

  /* ---- S&P 500 membership (shipped with the app) drives breadth, OBOS and peer rows ---- */
  var SP500 = {"sectors":["Industrials","Health Care","Information Technology","Utilities","Financials","Materials","Consumer Discretionary","Real Estate","Communication Services","Consumer Staples","Energy"],"stocks":[["MMM",0],["AOS",0],["ABT",1],["ABBV",1],["ACN",2],["ADBE",2],["AMD",2],["AES",3],["AFL",4],["A",1],["APD",5],["ABNB",6],["AKAM",2],["ALB",5],["ARE",7],["ALGN",1],["ALLE",0],["LNT",3],["ALL",4],["GOOGL",8],["GOOG",8],["MO",9],["AMZN",6],["AMCR",5],["AEE",3],["AEP",3],["AXP",4],["AIG",4],["AMT",7],["AWK",3],["AMP",4],["AME",0],["AMGN",1],["APH",2],["ADI",2],["AON",4],["APA",10],["APO",4],["AAPL",2],["AMAT",2],["APP",8],["APTV",6],["ACGL",4],["ADM",9],["ARES",4],["ANET",2],["AJG",4],["AIZ",4],["T",8],["ATO",3],["ADSK",2],["ADP",0],["AZO",6],["AVY",5],["AXON",0],["BKR",10],["BALL",5],["BAC",4],["BAX",1],["BDX",1],["BRK.B",4],["BBY",6],["TECH",1],["BIIB",1],["BLK",4],["BX",4],["XYZ",4],["BE",0],["BNY",4],["BA",0],["BKNG",6],["BSX",1],["BMY",1],["AVGO",2],["BR",0],["BRO",4],["BF.B",9],["BG",9],["BXP",7],["CHRW",0],["CDNS",2],["CPT",7],["COF",4],["CAH",1],["CCL",6],["CARR",0],["CVNA",6],["CASY",9],["CAT",0],["CBOE",4],["CBRE",7],["CDW",2],["COR",1],["CNC",1],["CNP",3],["CF",5],["CRL",1],["SCHW",4],["CHTR",8],["CVX",10],["CMG",6],["CB",4],["CHD",9],["CIEN",2],["CI",1],["CINF",4],["CTAS",0],["CSCO",2],["C",4],["CFG",4],["CLX",9],["CME",4],["CMS",3],["KO",9],["CTSH",2],["COHR",2],["COIN",4],["CL",9],["CMCSA",8],["FIX",0],["COP",10],["ED",3],["STZ",9],["CEG",3],["COO",1],["CPRT",0],["GLW",2],["CPAY",4],["CSGP",7],["COST",9],["CRH",5],["CRWD",2],["CCI",7],["CSX",0],["CMI",0],["CVS",1],["DHR",1],["DRI",6],["DDOG",2],["DVA",1],["DECK",6],["DE",0],["DELL",2],["DAL",0],["DVN",10],["DXCM",1],["FANG",10],["DLR",7],["DG",9],["DLTR",9],["D",3],["DPZ",6],["DASH",6],["DOV",0],["DOW",5],["DHI",6],["DTE",3],["DUK",3],["DD",0],["ETN",0],["EBAY",6],["ECHO",8],["ECL",5],["EIX",3],["EW",1],["ELV",1],["EME",0],["EMR",0],["ETR",3],["EOG",10],["EQT",10],["EFX",0],["EQIX",7],["ERIE",4],["ESS",7],["EL",9],["EG",4],["EVRG",3],["P",2],["ES",3],["EXC",3],["EXE",10],["EXPE",6],["EXPD",0],["EXR",7],["XOM",10],["FFIV",2],["FDS",4],["FICO",2],["FAST",0],["FRT",7],["FDX",0],["FDXF",0],["FERG",0],["FIS",4],["FITB",4],["FSLR",2],["FE",3],["FISV",4],["FLEX",2],["F",6],["FTNT",2],["FTV",0],["FOXA",8],["FOX",8],["BEN",4],["FCX",5],["GRMN",6],["IT",2],["GE",0],["GEHC",1],["GEV",0],["GEN",2],["GNRC",0],["GD",0],["GIS",9],["GM",6],["GPC",6],["GILD",1],["GPN",4],["GL",4],["GDDY",2],["GS",4],["HAL",10],["HIG",4],["HAS",6],["HCA",1],["DOC",7],["HSIC",1],["HSY",9],["HPE",2],["HLT",6],["HD",6],["HONA",0],["HON",0],["HRL",9],["HST",7],["HWM",0],["HPQ",2],["HUBB",0],["HUM",1],["HBAN",4],["HII",0],["IBM",2],["IEX",0],["IDXX",1],["ITW",0],["ILMN",1],["INCY",1],["IR",0],["PODD",1],["INTC",2],["IBKR",4],["ICE",4],["IFF",5],["IP",5],["INTU",2],["ISRG",1],["IVZ",4],["INVH",7],["IQV",1],["IRM",7],["JBHT",0],["JBL",2],["JKHY",4],["J",0],["JNJ",1],["JCI",0],["JPM",4],["KDP",9],["KEY",4],["KEYS",2],["KMB",9],["KIM",7],["KMI",10],["KKR",4],["KLAC",2],["KHC",9],["KR",9],["LHX",0],["LH",1],["LRCX",2],["LVS",6],["LDOS",0],["LEN",6],["LII",0],["LLY",1],["LIN",5],["LYV",8],["LMT",0],["L",4],["LOW",6],["LULU",6],["LITE",2],["LYB",5],["MTB",4],["MPC",10],["MAR",6],["MRSH",4],["MLM",5],["MRVL",2],["MAS",0],["MA",4],["MKC",9],["MCD",6],["MCK",1],["MDT",1],["MRK",1],["META",8],["MET",4],["MTD",1],["MGM",6],["MCHP",2],["MU",2],["MSFT",2],["MAA",7],["MRNA",1],["MDLZ",9],["MPWR",2],["MNST",9],["MCO",4],["MS",4],["MOS",5],["MSI",2],["MSCI",4],["NDAQ",4],["NTAP",2],["NFLX",8],["NEM",5],["NWSA",8],["NWS",8],["NEE",3],["NKE",6],["NI",3],["NDSN",0],["NSC",0],["NTRS",4],["NOC",0],["NCLH",6],["NRG",3],["NUE",5],["NVDA",2],["NVR",6],["NXPI",2],["ORLY",6],["OXY",10],["OKTA",2],["ODFL",0],["OMC",8],["ON",2],["OKE",10],["ORCL",2],["OTIS",0],["PCAR",0],["PKG",5],["PLTR",2],["PANW",2],["PH",0],["PAYX",0],["PYPL",4],["PNR",0],["PEP",9],["PFE",1],["PCG",3],["PM",9],["PSX",10],["PNW",3],["PNC",4],["PPG",5],["PPL",3],["PFG",4],["PG",9],["PGR",4],["PLD",7],["PRU",4],["PTC",2],["PEG",3],["PSA",7],["PHM",6],["Q",2],["QCOM",2],["PWR",0],["DGX",1],["RL",6],["RJF",4],["RDDT",8],["O",7],["REG",7],["REGN",1],["RF",4],["RSG",0],["RMD",1],["RVTY",1],["HOOD",4],["ROK",0],["ROL",0],["ROP",2],["ROST",6],["RCL",6],["RTX",0],["SPGI",4],["CRM",2],["SNDK",2],["SBAC",7],["SLB",10],["STX",2],["SRE",3],["NOW",2],["SHW",5],["SPG",7],["SKYD",8],["SWKS",2],["SJM",9],["SW",5],["SNA",0],["SOLV",1],["SO",3],["LUV",0],["SWK",0],["SBUX",6],["STT",4],["STLD",5],["STE",1],["SYK",1],["SMCI",2],["SYF",4],["SNPS",2],["SYY",9],["TMUS",8],["TROW",4],["TTWO",8],["TPR",6],["TRGP",10],["TGT",9],["TEL",2],["TDY",2],["TER",2],["TSLA",6],["TXN",2],["TPL",10],["TXT",0],["TMO",1],["TJX",6],["TKO",8],["TSCO",6],["TT",0],["TDG",0],["TRV",4],["TRMB",2],["TFC",4],["TWLO",2],["TYL",2],["TSN",9],["USB",4],["UBER",0],["UDR",7],["ULTA",6],["UNP",0],["UAL",0],["UPS",0],["URI",0],["UNH",1],["UHS",1],["VLO",10],["VEEV",1],["VTR",7],["VLTO",0],["VRSN",2],["VRSK",0],["VZ",8],["VRTX",1],["VRT",0],["VTRS",1],["VICI",7],["V",4],["VST",3],["VMRK",7],["VMC",5],["VYLR",9],["WRB",4],["GWW",0],["WAB",0],["WMT",9],["DIS",8],["WM",0],["WAT",1],["WEC",3],["WFC",4],["WELL",7],["WST",1],["WDC",2],["WY",7],["WSM",6],["WMB",10],["WTW",4],["WDAY",2],["WYNN",6],["XEL",3],["XYL",0],["YUM",6],["ZBRA",2],["ZBH",1],["ZTS",1]]};

  /* ---- per-dataset builders ---- */
  var ROTATION = ["SPY", "RSP", "SMH", "XLF", "XLV", "XLP", "ITA", "XLE"];
  var RISK = ["SPY", "XLY", "XLP"];
  var FACTORS = ["SPY", "IWM", "IWD", "IWF", "SPMO", "IEF"];
  var GROUPS = ["XLB", "XLC", "XLE", "XLF", "XLI", "XLK", "XLP", "XLRE", "XLU", "XLV", "XLY", "SMH", "ITA"];

  function histLabelled() {
    var labelled = {};
    holdingSymbols().forEach(function (s) { labelled[s] = seriesOf(s); });
    labelled["INDEXSP:.INX"] = seriesOf("INDEXSP:.INX");
    labelled["INDEXNASDAQ:.IXIC"] = seriesOf("INDEXNASDAQ:.IXIC");
    return labelled;
  }
  /* the engine, the analyst and the data snapshot all ask for the same history; it only changes when the holdings do */
  var HIST_MEMO = null;
  function buildHistory() { var key = holdingSymbols().join(","); if (HIST_MEMO && HIST_MEMO.k === key) return HIST_MEMO.v; var v = historyCsv(histLabelled(), 4.42); HIST_MEMO = { k: key, v: v }; return v; }
  function buildRotation() {
    var by = {}; ROTATION.forEach(function (s) { by[s] = seriesOf(s); }); return rotationCsv(by);
  }
  function buildRisk() {
    var by = {}; RISK.forEach(function (s) { by[s] = seriesOf(s); }); return rotationCsv(by);
  }
  function buildBreadth() {
    var days = tradingDays(), calcAt = todayIso() + "T09:00:00Z";
    var lines = ["Ticker,Sector,Data,Last close date,Calculated at (sheet time)"];
    SP500.stocks.forEach(function (st) {
      var closes = closesOf(st[0]), last = closes[closes.length - 1];
      lines.push(st[0] + "," + q(SP500.sectors[st[1]]) + "," + closes.length + ";" + last.toFixed(2) + ";" + breadthFlags(closes) + "," + days[days.length - 1] + "," + calcAt);
    });
    return lines.join("\n");
  }
  function buildObos() {
    var days = tradingDays(), calcAt = todayIso() + "T09:00:00Z";
    var cal = days.slice(-90);
    var lines = ["Ticker,Group,Industry,Codes,Closes,Calculated at (sheet time)"];
    SP500.stocks.forEach(function (st) {
      lines.push(st[0] + "," + q(SP500.sectors[st[1]]) + "," + q(SP500.sectors[st[1]]) + "," + obCodes(seriesOf(st[0]), cal) + ",," + calcAt);
    });
    ["SPY", "QQQ", "IWM", "IWD", "IWF", "SPMO", "IEF", "SMH", "ITA"].concat(GROUPS).forEach(function (s) {
      var rows = seriesOf(s).slice(-260);
      var closes = rows.map(function (p) { return p[0].slice(2, 4) + p[0].slice(5, 7) + p[0].slice(8, 10) + ":" + p[1]; }).join(";");
      lines.push(s + ",ETF,,," + closes + "," + calcAt);
    });
    return lines.join("\n");
  }
  function buildFactor() {
    var calcAt = todayIso() + "T09:00:00Z";
    var lines = ["Ticker,Kind,Weekly closes (yymmdd:close),Calculated at (sheet time)"];
    function row(sym, kind) {
      var wk = weeklyFrom(seriesOf(sym));
      lines.push(sym + "," + kind + "," + wk.map(function (p) { return p[0].slice(2, 4) + p[0].slice(5, 7) + p[0].slice(8, 10) + ":" + p[1]; }).join(";") + "," + calcAt);
    }
    FACTORS.forEach(function (s) { row(s, "Factor"); });
    GROUPS.forEach(function (s) { row(s, "Sector"); });
    holdingSymbols().forEach(function (s) { row(s, "Holding"); });
    return lines.join("\n");
  }
  function vixSeries() {
    var days = tradingDays(), rnd = mulberry32(hash("vix")), v = 16.5, out = [];
    days.forEach(function (d) {
      v += (16.5 - v) * 0.02 + (rnd() * 2 - 1) * 1.6; if (v < 9.5) v = 9.5; if (v > 42) v = 42;
      out.push([d, +v.toFixed(2)]);
    });
    return out;
  }
  function buildVolatility() {
    var vix = vixSeries(), launch = "2024-11-04";
    var vixeq = vix.filter(function (p) { return p[0] >= launch; }).map(function (p, i) { return [p[0], +(p[1] * 1.04 + 0.35).toFixed(2)]; });
    var calcAt = todayIso() + "T09:00:00Z";
    function pairs(rows) { return rows.map(function (p) { return p[0].slice(2, 4) + p[0].slice(5, 7) + p[0].slice(8, 10) + ":" + p[1]; }).join(";"); }
    return "Ticker,Segment,Data (yymmdd:close),Calculated at (sheet time)\nVIX,Index," + pairs(vix) + "," + calcAt + "\nVIXEQ,Index," + pairs(vixeq) + "," + calcAt;
  }

  /* ---- valuation inputs ---- */
  var FUND_CFG = {
    NVDA: { cls: "growth", sector: "Information Technology", eps: 3.21, pe: 58, sh: 24400, fc: { g: 0.26 } },
    AMD: { cls: "cyclical", sector: "Information Technology", eps: 2.94, pe: 48, sh: 1620, fc: { g: 0.12 } },
    AVGO: { cls: "cyclical", sector: "Information Technology", eps: 6.12, pe: 27, sh: 4660, fc: { g: 0.18 } },
    MSFT: { cls: "quality", sector: "Information Technology", eps: 12.41, pe: 34, sh: 7430, fc: { g: 0.13 } },
    AAPL: { cls: "quality", sector: "Information Technology", eps: 7.45, pe: 31, sh: 14900, fc: { g: 0.08 } },
    TSLA: { cls: "speculative", sector: "Consumer Discretionary", eps: 1.75, pe: 122, sh: 3220, fc: { g: 0.15 } },
    JPM: { cls: "cyclical", sector: "Financials", eps: 18.7, pe: 13, sh: 2790, fc: { g: 0.06 } },
    XOM: { cls: "cyclical", sector: "Energy", eps: 8.1, pe: 14, sh: 4340, fc: { g: 0.03 } },
    JNJ: { cls: "quality", sector: "Health Care", eps: 9.96, pe: 15, sh: 2410, fc: { g: 0.045 } },
    PEP: { cls: "quality", sector: "Consumer Staples", eps: 8.16, pe: 19, sh: 1370, fc: { g: 0.055 } },
    /* SET listings. Simulated fundamentals in baht, so the demo can value them the way the real terminal
       values any listing it has statements for. ps is the simulated price-to-sales the history is scaled to. */
    "PTT.BK": { cls: "cyclical", sector: "Energy", eps: 3.0, pe: 11, sh: 28563, ps: 4.0, cur: "THB", fc: { g: 0.02 } },
    "CPALL.BK": { cls: "quality", sector: "Consumer Staples", eps: 2.4, pe: 26, sh: 8983, ps: 2.9, cur: "THB", fc: { g: 0.06 } },
    "SCB.BK": { cls: "quality", sector: "Financials", eps: 12.6, pe: 10, sh: 3367, ps: 2.4, cur: "THB", fc: { g: 0.04 } },
    "AOT.BK": { cls: "quality", sector: "Industrials", eps: 1.9, pe: 29, sh: 14286, ps: 2.1, cur: "THB", fc: { g: 0.09 } },
    "DELTA.BK": { cls: "growth", sector: "Information Technology", eps: 20, pe: 47, sh: 1247, ps: 1.4, cur: "THB", fc: { g: 0.14 } }
  };
  function betaVsSpy(sym) {
    var wk = weeklyFrom(seriesOf(sym)).slice(-104), sp = weeklyFrom(seriesOf("SPY")).slice(-104);
    if (wk.length < 60) return 1;
    var n = Math.min(wk.length, sp.length), rs = [], rb = [];
    for (var i = 1; i < n; i++) { rs.push(wk[i][1] / wk[i - 1][1] - 1); rb.push(sp[i][1] / sp[i - 1][1] - 1); }
    var mb = rb.reduce(function (a, b) { return a + b; }, 0) / rb.length, ms = rs.reduce(function (a, b) { return a + b; }, 0) / rs.length;
    var cov = 0, varb = 0;
    for (var j = 0; j < rs.length; j++) { cov += (rs[j] - ms) * (rb[j] - mb); varb += (rb[j] - mb) * (rb[j] - mb); }
    return +(varb ? cov / varb : 1).toFixed(3);
  }
  function buildValin() {
    var at = todayIso() + "T09:00:00Z";
    var lines = ["Ticker,Price,MarketCap,Shares,Beta,PE,EPS,Currency,Type"];
    holdingSymbols().forEach(function (s) {
      var t = holdingMap()[s], px = closesOf(s)[closesOf(s).length - 1];
      var f = FUND_CFG[t];
      if (t === "SMH") { lines.push("SMH," + px + "," + Math.round(px * 505e6) + ",505000000,1.25,,,USD,ETF"); return; }
      // A listing is only skipped when the demo has no fundamentals for it. SET names in FUND_CFG carry
      // simulated baht statements, so they are valued like any other holding.
      if (!f && /\.BK$|\.HK$/.test(s)) return;
      if (!f) {
        var r = mulberry32(hash("val:" + t)), sh = Math.round((300 + r() * 8000)) * 1e6, pe = Math.round(8 + r() * 40);
        lines.push([t, px.toFixed(2), Math.round(px * sh), sh, (0.7 + r() * 1.3).toFixed(3), pe, (px / pe).toFixed(2), "USD", "Common Stock"].join(","));
        return;
      }
      lines.push([t, px.toFixed(2), Math.round(px * f.sh * 1e6), f.sh * 1e6, betaVsSpy(s).toFixed(3), f.pe, f.eps, f.cur || "USD", "Common Stock"].join(","));
    });
    lines.push("UPDATED," + at);
    return lines.join("\n");
  }
  function buildPeer() {
    var calcAt = todayIso() + "T09:00:00Z", first = true;
    var lines = ["Ticker,Sector,Member,EPS (ttm),Price,Market cap,Calculated at (sheet time)"];
    SP500.stocks.forEach(function (st) {
      var closes = closesOf(st[0]), px = closes[closes.length - 1];
      var r = mulberry32(hash("peer:" + st[0]));
      var eps = +(1 + r() * 14).toFixed(2), sh = (300 + r() * 8000) * 1e6;
      lines.push([st[0], SP500.sectors[st[1]], "Y", eps, px.toFixed(2), Math.round(px * sh / 1e6), first ? calcAt : ""].join(","));
      first = false;
    });
    return lines.join("\n");
  }

  /* ---- fund collection: simulated SEC-style fundamentals for the demo holdings ---- */
  function fundDoc(t, cfg) {
    var rnd = mulberry32(hash("fund:" + t));
    var base = cfg.sh / 4; /* rough revenue scale in millions */
    var cols = [], ends = [], rev = [], fcf = [], ocf = [], da = [], sbc = [];
    for (var y = 2019; y <= 2025; y++) {
      cols.push("FY" + y); ends.push(y + "-12-31");
      var r = base * Math.pow(1 + cfg.fc.g * (0.75 + rnd() * 0.5), y - 2019);
      rev.push(Math.round(r)); ocf.push(Math.round(r * (0.28 + rnd() * 0.16)));
      da.push(Math.round(r * 0.035)); sbc.push(Math.round(r * (0.02 + rnd() * 0.05)));
      fcf.push(Math.round(r * (0.14 + rnd() * 0.14)));
    }
    /* Scale the simulated history to the demo market cap (a 2025 price/sales around 2.6, which puts most of the demo values near its demo prices) so the
       values in the demo are plausible next to the demo prices instead of a million times off. */
    var pxc = closesOf(t), pxv = pxc && pxc.length ? pxc[pxc.length - 1] : 100;
    var revNow = (cfg.sh * 1e6 * pxv) / (cfg.ps || 2.6) / 1e6, k = revNow / (rev[rev.length - 1] || 1);
    for (var i = 0; i < rev.length; i++) { rev[i] = Math.round(rev[i] * k); ocf[i] = Math.round(ocf[i] * k); da[i] = Math.round(da[i] * k); sbc[i] = Math.round(sbc[i] * k); fcf[i] = Math.round(fcf[i] * k); }
    var rev3 = rev.slice(-3), g = +(Math.pow(rev3[2] / rev3[0], 1 / 2) - 1).toFixed(3);
    return {
      t: t, method: "dcf", cls: cfg.cls, clsAuto: true, sector: cfg.sector, ai: false,
      cur: cfg.cur || "USD", bsCur: cfg.bsCur || cfg.cur || "USD", basis: "fcf", shareMode: "mc", asOf: daysAgoIso(4),
      cols: cols, ends: ends, rev: rev, fcf: fcf, ocf: ocf, da: da, sbc: sbc,
      debt: Math.round(rev[0] * (0.2 + rnd() * 0.5)), netcash: Math.round(rev[0] * (rnd() * 0.8 - 0.2)),
      rev_ttm: rev[6], fcf_ttm: fcf[6],
      fc: { fy: "FY2025", end: "2025-12-31", rev: rev3, g: g, glh: 1, eps: cfg.eps, pt: cfg.pe, basis: "trailing", note: "Simulated consensus for the demo — not a real estimate." },
      src: { cf: "Simulated XBRL extract (demo)", bs: "Simulated balance sheet (demo)" }
    };
  }
  function fundCollection() {
    var out = [], map = holdingMap();
    holdingSymbols().forEach(function (s) {
      var t = map[s];
      if (t === "SMH") {
        out.push({
          id: s, data: {
            t: t, method: "nav", cls: "sector", clsAuto: true, sector: "Information Technology", ai: false,
            cur: "USD", bsCur: "USD", basis: "nav", shareMode: "so", asOf: daysAgoIso(4), holdings: "Simulated ETF holdings (demo)",
            note: "ETF: valued from its simulated net-asset value, not company filings."
          }
        });
        return;
      }
      var thaiCfg = FUND_CFG[t];
      if (!thaiCfg && /\.BK$|\.HK$/.test(s)) {
        out.push({ id: s, data: { t: t, missing: "Non-US listing: the demo has no simulated statements for " + t + ", so it quotes it and shows it in the portfolio, risk and sector screens, but does not publish an intrinsic value for it.", ai: false } });
        return;
      }
      var cfg = thaiCfg;
      if (cfg) out.push({ id: s, data: fundDoc(t, cfg) });
      else {
        var r = mulberry32(hash("fund:gen:" + t));
        out.push({ id: s, data: fundDoc(t, { cls: r() > 0.5 ? "quality" : "cyclical", sector: "Information Technology", eps: +(2 + r() * 8).toFixed(2), pe: Math.round(10 + r() * 30), sh: Math.round(400 + r() * 4000), fc: { g: 0.05 + r() * 0.1 } }) });
      }
    });
    return out;
  }

  /* ---- analyst-revision snapshots (three dates so revision trends render) ---- */
  function revItem(t, dOffset) {
    var r = mulberry32(hash("rev:" + t)), f = FUND_CFG[t];
    var e = f ? f.eps : +(2 + r() * 8).toFixed(2);
    var bias = (f && (t === "NVDA" || t === "AVGO") ? 0.012 : t === "TSLA" || t === "JNJ" ? -0.008 : 0.002) * dOffset;
    var vals = [0, 7, 30, 60, 90].map(function (d) { return +(e * (1 + bias - d * 0.00004)).toFixed(2); });
    var up = Math.round(3 + r() * 6 + (bias > 0 ? 4 : 0)), dn = Math.round(2 + r() * 4 + (bias < 0 ? 4 : 0));
    return {
      eps: { cy: vals, ny: vals.map(function (v) { return +(v * 1.09).toFixed(2); }) },
      up30: [0, 0, up, up - 1], dn30: [0, 0, dn, dn - 1],
      rev: { cy: { avg: +(e * 1.05).toFixed(2), lo: +(e * 0.94).toFixed(2), hi: +(e * 1.12).toFixed(2) }, ny: { avg: +(e * 1.09).toFixed(2) } },
      periods: { cy: "2026-12-31", ny: "2027-12-31" }, n: Math.round(6 + r() * 22)
    };
  }
  function revCollection() {
    var map = holdingMap(), syms = holdingSymbols().filter(function (s) { return !/\.BK$|\.HK$/.test(s) && map[s] !== "SMH"; });
    return [0, 35, 91].map(function (back) {
      var date = daysAgoIso(back), items = {};
      syms.forEach(function (s) { items[map[s]] = revItem(map[s], 91 - back); });
      return { id: date, data: { date: date, at: date + "T21:00:00Z", src: "Simulated analyst estimates (demo)", items: items } };
    });
  }

  /* ---- news: simulated daily briefings ---- */
  function newsCollection() {
    var out = [];
    var stories = [
      { h: "Chipmakers extend rally as simulated datacenter demand keeps climbing", imp: "bullish", tks: ["NVDA", "AMD", "AVGO"], bull: "Semiconductor names lead the simulated tape for a third session.", bear: "The demo's semiconductor sleeve is already the portfolio's largest concentration." },
      { h: "Rate-cut odds firm after soft simulated inflation print", imp: "bullish", tks: ["SPY", "XLK"], bull: "Softer simulated CPI lifts rate-sensitive names.", bear: "One simulated print is not a trend; the demo macro series is invented." },
      { h: "Electric-vehicle maker misses simulated delivery estimates", imp: "bearish", tks: ["TSLA"], bull: "Sentiment washout could mark a floor for the demo's worst performer.", bear: "The demo position sits 35% underwater and well below its high." },
      { h: "Defensive staples and healthcare lag as simulated risk appetite builds", imp: "mixed", tks: ["XLP", "XLV", "PEP", "JNJ"], bull: "Rotation into cyclicals usually leaves staples cheap.", bear: "The demo's defensive sleeve drags on relative performance today." },
      { h: "Energy majors steady as simulated crude holds its range", imp: "mixed", tks: ["XOM", "PTT.BK", "XLE"], bull: "Income exposure holds its value.", bear: "Simulated crude offers no momentum either way." },
      { h: "Thai banks and retailers report simulated resilient domestic demand", imp: "bullish", tks: ["SCB.BK", "CPALL.BK"], bull: "Domestic consumption and net interest margin both hold in the simulated quarter.", bear: "Household debt and a slow simulated tourist recovery cap the upside." },
      { h: "Simulated tourist arrivals lift Thai airport and travel names", imp: "bullish", tks: ["AOT.BK"], bull: "Passenger volumes recover in the simulated data set.", bear: "The demo's AOT position is still 11% below its simulated cost." },
      { h: "Thai electronics maker gains on simulated data-centre power orders", imp: "bullish", tks: ["DELTA.BK"], bull: "Power and thermal orders extend the simulated order book.", bear: "One order cycle does not justify the demo's 21x simulated multiple." }
    ];
    [0, 1, 2, 3].forEach(function (back) {
      var date = daysAgoIso(back);
      out.push({
        id: date, data: {
          date: date, macro: "Simulated macro briefing for the demo. Equity futures are firmer, simulated bond yields ease, and the invented fear-and-greed gauge sits at 61 (greed). Nothing here reflects real market conditions.",
          items: stories.map(function (s) {
            return {
              headline: s.h, url: "", source: "Simulated Newswire (demo)",
              summary: "A short simulated summary paragraph written for demonstration. The story is invented; no real event is described.",
              impact: s.imp, why: "Demo story crafted so the portfolio's simulated exposure stories (chip concentration, EV drawdown, defensive lag) are visible in the news panel.",
              tickers: s.tks, bull: s.bull, bear: s.bear
            };
          })
        }
      });
    });
    return out;
  }

  /* ---- ETF primary-market flows: 30 simulated sessions ---- */
  function etfCollection() {
    var funds = ["XLK", "XLC", "XLY", "XLP", "XLV", "XLF", "XLI", "XLE", "XLU", "XLB", "XLRE", "SPY", "SOXX", "XBI", "IBB", "ITA"];
    var out = [], days = tradingDays();
    for (var back = 0; back < 30; back++) {
      var date = days[days.length - 1 - back], r = mulberry32(hash("etf:" + date));
      var items = {};
      funds.forEach(function (f) {
        var rr = mulberry32(hash("etf:" + date + ":" + f));
        var so = +(2 + rr() * 78).toFixed(1), px = closesOf(f)[closesOf(f).length - 1];
        items[f] = { so: so, nav: px, asOf: date, aum: Math.round(4000 + rr() * 90000), src: "Simulated issuer data (demo)" };
      });
      out.push({ id: date, data: { date: date, at: date + "T20:15:00Z", items: items } });
    }
    return out;
  }

  /* ---- insider cluster buys (checksums must match exactly) ---- */
  function insCollection() {
    var date = todayIso(), cluster = [];
    [["AVGO", 2], ["MU", 3], ["GD", 2], ["LMT", 4], ["XOM", 2], ["JPM", 3], ["PEP", 2], ["AMAT", 2], ["TDG", 2], ["GILD", 3]].forEach(function (p) {
      var r = mulberry32(hash("ins:" + p[0] + date));
      var v = Math.round(180000 + r() * 2400000);
      cluster.push({
        ticker: p[0], industry: "Simulated industry", sec: "Simulated filing", ins: p[1], value: v,
        trade: daysAgoIso(Math.round(r() * 6)), filing: "Form 4 (simulated, demo)"
      });
    });
    return [{
      id: date, data: {
        date: date, cluster: cluster,
        check: { n: cluster.length, value: cluster.reduce(function (a, c) { return a + c.value; }, 0) },
        src: "Simulated cluster buys (demo — not SEC data)", days: 62, coverFrom: daysAgoIso(90), purchases: 214
      }
    }];
  }

  /* ---- macro + regime documents ---- */
  function macroDoc() {
    function monthly(vals, back) {
      var out = [], d = new Date(todayIso() + "T00:00:00Z");
      d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back);
      for (var i = vals.length - 1; i >= 0; i--) { out.push([iso(d), vals[i]]); d.setUTCMonth(d.getUTCMonth() - 1); }
      return out.reverse();
    }
    var cpi = [], ff = [], ty = [];
    for (var i = 179; i >= 0; i--) {
      var r = mulberry32(hash("macro:" + i));
      cpi.push(+(2.4 + Math.max(0, (60 - Math.abs(i - 95)) * 0.06) - (i < 40 ? 0.25 * (40 - i) / 40 : 0) + r() * 0.15).toFixed(2));
      ff.push(i > 130 ? 5.33 : i > 95 ? 4.83 : i > 55 ? 4.58 : 4.33);
      ty.push(+(3.6 + Math.sin(i / 34) * 0.55 + r() * 0.12).toFixed(2));
    }
    return {
      cpiYoY: monthly(cpi, 0), fedFunds: monthly(ff, 0), tenYear: monthly(ty, 0),
      source: "Simulated FRED-style series (demo)",
      sources: { cpi: "https://fred.stlouisfed.org/series/CPIAUCNS", fedFunds: "https://fred.stlouisfed.org/series/FEDFUNDS", tenYear: "https://fred.stlouisfed.org/series/GS10" },
      notes: "Demo mode: every value on these charts is synthetic. The series imitate the shape of real macro data but are invented.",
      asOf: todayIso()
    };
  }
  function fredHistDoc() {
    var series = {}, d0 = new Date(todayIso() + "T00:00:00Z");
    d0.setUTCDate(1); d0.setUTCMonth(d0.getUTCMonth() - 1);
    var months = [];
    for (var m = 0; m < 360; m++) {
      var d = new Date(d0); d.setUTCMonth(d0.getUTCMonth() - (359 - m));
      months.push(d.toISOString().slice(0, 7));
    }
    function fill(id, fn) { var o = {}; months.forEach(function (mm, i) { o[mm] = fn(i); }); series[id] = o; }
    var cpiIdx = 150 + months.length * 0.42;
    fill("CPIAUCNS", function (i) { return +((150 + i * 0.42) * (1 + Math.max(0, 1 - Math.abs(i - 250) / 24) * 0.004)).toFixed(3); });
    fill("CPILFENS", function (i) { return +((146 + i * 0.41) * (1 + Math.max(0, 1 - Math.abs(i - 250) / 24) * 0.003)).toFixed(3); });
    fill("FEDFUNDS", function (i) { return i < 170 ? 0.25 : i < 230 ? +(0.25 + (i - 170) * 0.05).toFixed(2) : i < 300 ? 5.33 : +(5.33 - (i - 300) * 0.011).toFixed(2); });
    fill("GS10", function (i) { return +(1.5 + Math.max(0, i - 200) * 0.014 + Math.sin(i / 40) * 0.3).toFixed(2); });
    fill("BAA", function (i) { return +(2.6 + Math.max(0, i - 200) * 0.008 + Math.sin(i / 30) * 0.25 + (i > 238 && i < 244 ? 2.4 : 0)).toFixed(2); });
    fill("UNRATE", function (i) { return i > 238 && i < 248 ? 13.2 : i > 245 && i < 252 ? 6.9 : +(4.6 - Math.min(0.8, (i - 260) * 0.01)).toFixed(1); });
    fill("USREC", function (i) { return (i >= 239 && i <= 244) ? 1 : 0; });
    var ue = months.map(function (mm, i) { return series.UNRATE[mm]; });
    fill("SAHMREALTIME", function (i) {
      if (i < 13) return 0;
      var recent = (ue[i] + ue[i - 1] + ue[i - 2]) / 3, lo = Math.min.apply(null, ue.slice(i - 13, i));
      return +Math.max(0, recent - lo).toFixed(2);
    });
    return { series: series, source: "Simulated FRED-style history (demo)", asOf: todayIso() };
  }
  function cftcDoc() {
    var series = {}, check = {};
    [["ES_AM", 1120], ["ES_LF", 380], ["NQ_AM", 640], ["NQ_LF", 210]].forEach(function (p) {
      var rows = [], sum = 0, d = new Date(todayIso() + "T00:00:00Z");
      for (var i = 0; i < 130; i++) {
        d.setUTCDate(d.getUTCDate() - 7);
        var r = mulberry32(hash("cftc:" + p[0] + i));
        var l = Math.round((p[1] + r() * 260) * 1000), s = Math.round((p[1] * 0.55 + r() * 180) * 1000);
        rows.push(iso(d) + "," + l + "," + s); sum += l + s;
      }
      series[p[0]] = rows.join(";"); check[p[0]] = sum;
    });
    return { series: series, check: check, source: "Simulated CFTC positioning (demo)", asOf: daysAgoIso(4) };
  }
  function ticDoc() {
    var months = {}, names = [];
    var d = new Date(todayIso() + "T00:00:00Z");
    for (var i = 0; i < 6; i++) {
      d.setUTCMonth(d.getUTCMonth() - 1);
      var name = d.toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
      names.push(name);
      var r = mulberry32(hash("tic:" + name));
      months[name] = { total: +(60 + r() * 70).toFixed(1), private: null, official: null };
    }
    return { months: months, released: names[names.length - 1], next: names[0] + " (simulated)", source: "Simulated TIC (demo)" };
  }
  function f13Doc() {
    var one = { XLK: 1.4, XLC: -0.4, XLY: 0.6, XLP: -1.1, XLV: 0.3, XLF: 1.9, XLI: 1.1, XLE: 0.8, XLU: -0.6, XLB: 0.2, XLRE: -0.9 };
    return {
      latest: { q: "Q3 " + todayIso().slice(0, 4), known: daysAgoIso(35), prev: "Q2 " + todayIso().slice(0, 4), one: one },
      sample: SP500.stocks.slice(0, 40).map(function (s) { return s[0]; }),
      flags: [],
      backtest: { from: "2020-Q1", to: todayIso().slice(0, 4) + "-Q3", n: 42, exAnn: 0.0061, t: 1.24, ic: 0.042, exAnn25: 0.014, fmT: 0.58 },
      note: "Simulated 13F aggregation (demo)"
    };
  }
  function vixeqHistDoc() {
    var start = new Date(todayIso() + "T00:00:00Z");
    start.setUTCFullYear(start.getUTCFullYear() - 12); start.setUTCMonth(start.getUTCMonth() - 1);
    var pairs = [], r = mulberry32(hash("vixeq:hist")), v = 18;
    while (start < new Date(todayIso() + "T00:00:00Z")) {
      var wd = start.getUTCDay();
      if (wd !== 0 && wd !== 6) {
        v += (18 - v) * 0.02 + (r() * 2 - 1) * 1.5; if (v < 10) v = 10; if (v > 40) v = 40;
        pairs.push(iso(start).slice(2, 4) + iso(start).slice(5, 7) + iso(start).slice(8, 10) + ":" + v.toFixed(2));
      }
      start.setUTCDate(start.getUTCDate() + 1);
    }
    return { data: pairs.join(";"), src: "Simulated back-test (demo)", verification: "Synthetic pre-launch values generated for demonstration only — not Cboe data." };
  }
  function regimeValDoc() {
    var oos = [], d = new Date(todayIso() + "T00:00:00Z");
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 88);
    for (var i = 0; i < 88; i++) {
      var r = mulberry32(hash("regime:" + i));
      oos.push(d.toISOString().slice(0, 7) + ":" + (0.2 + r() * 0.5).toFixed(3) + "," + (0.1 + r() * 0.3).toFixed(3) + "," + (0.02 + r() * 0.08).toFixed(3));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return {
      oos: oos.join(";"),
      growthVsNber: { auroc: 0.84, recessionMonths: 8, calibration: [null, null, null, { recRate: 0.56 }], brier: 0.078, brierClimatology: 0.094 },
      inflationCheck: { cpiHigh: 6.1, cpiLow: 2.4 },
      independence: { verdict: "Inflation and monetary states move together in only 41% of months, so the two readings add little independent information." },
      sensitivity: { significant: 4, cells: 66 },
      rotation: { exAnn: 0.004, t: 0.68, from: "2019-06", to: "2026-10" },
      note: "Simulated out-of-sample scoring (demo)"
    };
  }
  function factorValDoc() {
    return { asOf: daysAgoIso(6), runs: { sens_36m_4f: { resid: { exAnn: 0.0052, t: 1.31 } } }, note: "Simulated factor validation (demo)" };
  }
  // CNN Fear & Greed + Safe-Haven Demand — simulated to the same shape api/_fgi.js builds.
  function fgiDoc() {
    var fgiHist = [], shdHist = [];
    for (var i = 399; i >= 0; i--) {
      var r = mulberry32(hash("fgi:" + i)), d = new Date(todayIso() + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      // oscillating sentiment with a fear episode ~90 days back and a recovery since
      var fearDip = i > 60 && i < 110 ? -35 : 0, base = 55 + fearDip;
      var v = Math.max(4, Math.min(96, base + (r() - 0.5) * 26 + Math.sin(i / 23) * 9));
      fgiHist.push([d.toISOString().slice(0, 10), Math.round(v * 100) / 100]);
      var s = Math.max(0, Math.min(100, 28 - fearDip * 0.6 + (r() - 0.5) * 30));
      shdHist.push([d.toISOString().slice(0, 10), Math.round(s * 100) / 100]);
    }
    var last = fgiHist[fgiHist.length - 1];
    var yr = fgiHist.slice(-365).map(function (x) { return x[1]; });
    var pctBelow = Math.round(yr.filter(function (v) { return v < last[1]; }).length / yr.length * 100);
    return {
      asOf: new Date(todayIso() + "T14:00:00Z").toISOString(),
      source: "Simulated CNN Fear & Greed (demo)",
      fgi: {
        score: last[1], rating: last[1] >= 55 ? "Greed" : "Neutral",
        prevClose: fgiHist[fgiHist.length - 2][1], prev1w: fgiHist[fgiHist.length - 6][1],
        prev1m: fgiHist[fgiHist.length - 31][1], prev1y: fgiHist[fgiHist.length - 366][1]
      },
      fgiHist: fgiHist,
      shd: { score: shdHist[shdHist.length - 1][1], rating: "Average" },
      shdHist: shdHist,
      note: "Simulated sentiment series for demonstration — not CNN data."
    };
  }

  function valinSnapshotDoc() {
    return { csv: buildValin(), note: "Simulated valuation snapshot (demo)" };
  }

  /* ---- the live-quote globals the holdings table reads ---- */
  function computeLive(text, syms, map) {
    var lines = String(text).split("\n"), head = lines[0].split(","), live = {}, newest = 0;
    var rows = []; for (var ri = 2; ri < lines.length; ri++) rows.push(lines[ri].split(","));   // split once, not once per symbol
    for (var j = 0; j < head.length; j += 2) {
      var m = /^D\|(.+)$/.exec(head[j] || ""); if (!m || syms.indexOf(m[1]) < 0) continue;
      var pts = [];
      for (var i = 0; i < rows.length; i++) {
        var c = rows[i], d = parseFloat(c[j]), v = parseFloat(c[j + 1]);
        if (isFinite(d) && isFinite(v) && v > 0) pts.push([(Math.floor(d) - 25569) * 864e5, v]);
      }
      if (pts.length < 2) continue;
      var n = pts.length, px = pts[n - 1][1], at = function (back) { return n - 1 - back >= 0 ? pts[n - 1 - back][1] : null; };
      var yr = new Date(pts[n - 1][0]).getUTCFullYear(), prevYear = null;
      for (var q2 = n - 1; q2 >= 0; q2--) if (new Date(pts[q2][0]).getUTCFullYear() < yr) { prevYear = pts[q2][1]; break; }
      var hi = 0; for (var r2 = Math.max(0, n - 252); r2 < n; r2++) if (pts[r2][1] > hi) hi = pts[r2][1];
      var rel = function (base) { return base ? px / base - 1 : null; };
      live[(map && map[m[1]]) || m[1]] = { px: px, prev: at(1), hi52: hi, day: rel(at(1)), w1: rel(at(5)), m1: rel(at(21)), ytd: rel(prevYear), from52: rel(hi) };
      if (pts[n - 1][0] > newest) newest = pts[n - 1][0];
    }
    return { live: live, asof: newest ? new Date(newest).toISOString().slice(0, 10) : null };
  }
  function extras() {
    var map = holdingMap(), syms = Object.keys(map), ath = {};
    syms.forEach(function (s) {
      var pts = seriesOf(s), hi = 0, at = null;
      pts.forEach(function (p) { if (p[1] > hi) { hi = p[1]; at = p[0]; } });
      if (hi > 0) ath[map[s]] = { v: hi, d: at };
    });
    return { ath: ath, fx: { usdthb: DEMO_USDTHB, hkdusd: DEMO_HKDUSD } };
  }

  /* ---- the PT_DATA_SOURCE-compatible adapter ---- */
  /* The demo is a full preview: every dataset below is simulated locally for the sample portfolio, nothing is locked. */
  function source() {
    currentHoldings();
    return {
      fetchCsv: function (k) {
        if (k === "HISTORY") {
          var csv = buildHistory(), syms = holdingSymbols(), map = holdingMap();
          var cl = computeLive(csv, syms, map);
          var G = typeof window !== "undefined" ? window : globalThis;
          G.PT_LIVE = cl.live; G.PT_LIVE_AT = Date.parse(DEMO_DATE + "T22:00:00Z"); G.PT_LIVE_ASOF = cl.asof;
          G.PT_VAL_SKIPPED = [];
          /* Re-apply once now and once after the page has finished booting: the boot-time
             call can race (or throw into the watcher's catch) while the UI is still coming
             up, which would leave the engine built from the price-less CSV. */
          var reapply = function () { try { if (G.PT_HOLD) G.PT_HOLD.apply(); } catch (e) {} };
          reapply();
          setTimeout(reapply, 400); setTimeout(reapply, 1500);
          return Promise.resolve(csv);
        }
        if (k === "ROTATION") return Promise.resolve(buildRotation());
        if (k === "RISK") return Promise.resolve(buildRisk());
        if (k === "BREADTH") return Promise.resolve(buildBreadth());
        if (k === "OBOS") return Promise.resolve(buildObos());
        if (k === "FACTOR") return Promise.resolve(buildFactor());
        if (k === "VOLATILITY") return Promise.resolve(buildVolatility());
        if (k === "VALIN") return Promise.resolve(buildValin());
        if (k === "PEER") return Promise.resolve(buildPeer());
        return Promise.reject({ code: "no_data", message: "Demo: unknown dataset " + k });
      },
      getDoc: function (p) {
        var d = null;
        if (p === "meta/macro") d = macroDoc();
        else if (p === "meta/fredhist") d = fredHistDoc();
        else if (p === "meta/regime_val") d = regimeValDoc();
        else if (p === "meta/factor_val") d = factorValDoc();
        else if (p === "meta/f13") d = f13Doc();
        else if (p === "meta/cftc") d = cftcDoc();
        else if (p === "meta/tic") d = ticDoc();
        else if (p === "meta/vixeq_hist") d = vixeqHistDoc();
        else if (p === "meta/valin") d = valinSnapshotDoc();
        else if (p === "meta/fgi") d = fgiDoc();
        return Promise.resolve(d);
      },
      getCollection: function (n) {
        var v = [];
        if (n === "fund") v = fundCollection();
        else if (n === "rev") v = revCollection();
        else if (n === "news") v = newsCollection();
        else if (n === "etf") v = etfCollection();
        else if (n === "ins") v = insCollection();
        return Promise.resolve(v.filter(function (x) { return x && typeof x.id === "string" && x.data && typeof x.data === "object"; }));
      }
    };
  }

  /* ---- test hook: everything deterministic, in one object ---- */
  function build() {
    return {
      holdings: holdingsDoc(),
      history: buildHistory(), rotation: buildRotation(), risk: buildRisk(),
      breadth: buildBreadth(), obos: buildObos(), factor: buildFactor(),
      volatility: buildVolatility(), valin: buildValin(), peer: buildPeer(),
      fund: fundCollection(), rev: revCollection(), news: newsCollection(),
      etf: etfCollection(), ins: insCollection(),
      docs: {
        macro: macroDoc(), fredhist: fredHistDoc(), regimeVal: regimeValDoc(), factorVal: factorValDoc(),
        f13: f13Doc(), cftc: cftcDoc(), tic: ticDoc(), vixeqHist: vixeqHistDoc(), valinSnapshot: valinSnapshotDoc(),
        fgi: fgiDoc()
      },
      live: computeLive(buildHistory(), holdingSymbols(), holdingMap()),
      extras: extras()
    };
  }

  return {
    DEMO_DATE: DEMO_DATE,
    NS: NS, source: source, holdingsDoc: holdingsDoc, build: build, extras: extras,
    currentHoldings: currentHoldings, quoteSym: quoteSym,
    _today: function (iso) { _todayOverride = iso; SERIES = {}; },
    _seedDemo: function () { storeSet("db.holdings/all", holdingsDoc()); }
  };
});
