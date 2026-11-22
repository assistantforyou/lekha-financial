import { useEffect, useState } from "react"
// Watchlist: stored like every other user document (ptpub.v1[.demo].db.settings/watchlist) and mirrored to the account by the existing sync layer.
const ns = () => (window.PT_STORAGE_NS)
const key = () => ns() + "db.settings/watchlist"
export const loadWatchlist = () => { try { const v = JSON.parse(localStorage.getItem(key()) || "null"); return (v && Array.isArray(v.items) ? v.items : []).filter((x) => x && x.symbol) } catch (e) { return [] } }
function save(items) { try { localStorage.setItem(key(), JSON.stringify({ items, updatedAt: new Date().toISOString() })); window.PT_SYNC && PT_SYNC.touch("settings/watchlist"); window.dispatchEvent(new Event("lekha:watchlist")) } catch (e) {} }
export const addToWatchlist = (symbol, name) => { const l = loadWatchlist(); if (!l.some((x) => x.symbol === symbol)) save([...l, { symbol, name: name || null, addedAt: new Date().toISOString() }]) }
export const removeFromWatchlist = (symbol) => save(loadWatchlist().filter((x) => x.symbol !== symbol))
export function useWatchlist() { const [l, set] = useState(loadWatchlist); useEffect(() => { const f = () => set(loadWatchlist()); window.addEventListener("lekha:watchlist", f); window.addEventListener("pt:state-hydrated", f); return () => { window.removeEventListener("lekha:watchlist", f); window.removeEventListener("pt:state-hydrated", f) } }, []); return l }
