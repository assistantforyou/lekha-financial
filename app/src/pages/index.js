import { lazy } from "react"
/* Every React page is its own chunk: a visitor on the portfolio overview (the default route) downloads none of them until they open one.
   The named exports of account.jsx and system.jsx are picked out of their module. */
const page = (load, name) => lazy(() => load().then((m) => ({ default: name ? m[name] : m.default })))
const account = () => import("./account"), system = () => import("./system")
export default {
  company: page(() => import("./company")), agent: page(() => import("./agent")), news: page(() => import("./news")), macro: page(() => import("./macro")),
  watchlist: page(() => import("./watchlist")), inbox: page(() => import("./inbox")), council: page(() => import("./council")), reports: page(() => import("./reports")),
  profile: page(account, "Profile"), preferences: page(account, "Preferences"), plans: page(account, "Plans"), layout: page(account, "Layout"), data: page(account, "DataPage"),
  diagnostics: page(system, "Diagnostics"), audit: page(system, "Audit"),
}
