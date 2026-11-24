// Thin wrapper over window.ptTrack / window.ptTrackCustom (public/pt-meta-pixel.js). Parameters are plan and route
// names only, never user data.
export const track = (name, params, onceKey) => { try { window.ptTrack && window.ptTrack(name, params, onceKey) } catch (e) {} }
// Non-standard event names (AskAnalyst, ...) have to go through trackCustom or Meta drops them.
export const trackCustom = (name, params, onceKey) => { try { window.ptTrackCustom && window.ptTrackCustom(name, params, onceKey) } catch (e) {} }
export const planParams = (plan) => { try { return window.ptPlanValue ? window.ptPlanValue(plan) : null } catch (e) { return null } }
