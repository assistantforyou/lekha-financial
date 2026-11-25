/* Fonts are self-hosted (fontsource). Latin covers English, Spanish and French; Thai, Chinese, Japanese, Korean and Hindi use system fonts.
   Only Vietnamese needs the extra Inter subsets, so they load for that language alone (they were 144 kB on every page before). */
import "@fontsource/inter/latin-400.css"
import "@fontsource/inter/latin-500.css"
import "@fontsource/inter/latin-600.css"
import "@fontsource/inter/latin-700.css"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-500.css"
import "@fontsource/ibm-plex-mono/latin-600.css"
import React from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import "./lib/posthog"
import { captureAttribution, watchTools } from "./lib/pixel"
captureAttribution(); watchTools()
createRoot(document.getElementById("root")).render(<App />)

/* the V3 feature modules (simulation, council, deep analysis) mount into hosts that live in #stage; loaded at runtime, not bundled */
const MODULES = "/v3/lekha-modules.js"
import(/* @vite-ignore */ MODULES).catch((e) => console.warn("[lekha] feature modules failed to load", e))
try { const l = (JSON.parse(localStorage.getItem("ptpub.v1.prefs") || "null") || {}).lang; if (l === "vi") { import("@fontsource/inter/vietnamese-400.css").catch(() => {}); import("@fontsource/inter/vietnamese-500.css").catch(() => {}); import("@fontsource/inter/vietnamese-600.css").catch(() => {}); import("@fontsource/inter/vietnamese-700.css").catch(() => {}); import("@fontsource/inter/latin-ext-400.css").catch(() => {}); import("@fontsource/inter/latin-ext-500.css").catch(() => {}); import("@fontsource/inter/latin-ext-600.css").catch(() => {}); import("@fontsource/inter/latin-ext-700.css").catch(() => {}); } } catch (e) {}
