/* Lekha Financials core: the real economic calendar.
   Dates the market already knows about: FOMC decision days, CPI releases and the monthly jobs
   report, published a year ahead by the Fed, the BLS and the BLS respectively. Earnings dates are
   the company's usual reporting slot (the exact day is confirmed a few weeks before), so the
   markers land where they really fall instead of being invented in the first weeks of a chart. */

export const FOMC = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-16", "2027-07-28", "2027-09-22", "2027-10-27", "2027-12-15",
];
export const CPI = [
  "2026-01-13", "2026-02-11", "2026-03-11", "2026-04-10", "2026-05-12", "2026-06-10", "2026-07-14", "2026-08-12",
  "2026-09-11", "2026-10-13", "2026-11-10", "2026-12-10",
  "2027-01-13", "2027-02-10", "2027-03-10", "2027-04-13", "2027-05-12", "2027-06-10", "2027-07-14", "2027-08-11",
  "2027-09-14", "2027-10-13", "2027-11-10", "2027-12-14",
];
export const JOBS = [
  "2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03", "2026-05-08", "2026-06-05", "2026-07-02", "2026-08-07",
  "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
  "2027-01-08", "2027-02-05", "2027-03-05", "2027-04-02", "2027-05-07", "2027-06-04", "2027-07-02", "2027-08-06",
  "2027-09-03", "2027-10-01", "2027-11-05", "2027-12-03",
];

/* Usual quarterly reporting slot: months are 0-based, day is the typical report day. */
export const REPORTS = {
  NVDA: { months: [1, 4, 7, 10], day: 25 },
  AMD: { months: [0, 3, 6, 9], day: 4 },
  AVGO: { months: [2, 5, 8, 11], day: 11 },
  MSFT: { months: [0, 3, 6, 9], day: 27 },
  AAPL: { months: [0, 3, 6, 9], day: 29 },
  TSLA: { months: [0, 3, 6, 9], day: 22 },
  GOOGL: { months: [0, 3, 6, 9], day: 30 },
  AMZN: { months: [0, 3, 6, 9], day: 31 },
  META: { months: [0, 3, 6, 9], day: 29 },
  JPM: { months: [0, 3, 6, 9], day: 14 },
  XOM: { months: [0, 3, 6, 9], day: 30 },
  JNJ: { months: [0, 3, 6, 9], day: 20 },
  PEP: { months: [1, 4, 7, 9], day: 5 },
  V: { months: [0, 3, 6, 9], day: 23 },
  MA: { months: [0, 3, 6, 9], day: 30 },
  WMT: { months: [1, 4, 7, 10], day: 20 },
  COST: { months: [2, 5, 8, 11], day: 25 },
  HD: { months: [1, 4, 7, 10], day: 18 },
  UNH: { months: [0, 3, 6, 9], day: 16 },
  "BRK.B": { months: [1, 4, 7, 10], day: 22 },
  "0700.HK": { months: [2, 4, 7, 10], day: 13 },
  "PTT.BK": { months: [1, 4, 7, 10], day: 14 },
};

const iso = (d) => d.toISOString().slice(0, 10);

/* The next scheduled report after `from`, or null when the company has no pattern. */
export function nextReport(tk, from = new Date().toISOString().slice(0, 10)) {
  const c = REPORTS[String(tk).toUpperCase()];
  if (!c) return null;
  const start = new Date(from + "T00:00:00Z");
  const y0 = start.getUTCFullYear();
  for (let y = y0; y <= y0 + 2; y++) {
    for (const m of c.months) {
      const d = new Date(Date.UTC(y, m, c.day));
      if (d <= start) continue;
      const w = d.getUTCDay();
      if (w === 6) d.setUTCDate(d.getUTCDate() + 2); else if (w === 0) d.setUTCDate(d.getUTCDate() + 1);
      return iso(d);
    }
  }
  return null;
}
