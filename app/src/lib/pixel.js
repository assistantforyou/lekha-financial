// Thin wrapper over window.ptTrack (public/pt-meta-pixel.js). Parameters are plan and route names only, never user data.
export const track = (name, params, onceKey) => { try { window.ptTrack && window.ptTrack(name, params, onceKey) } catch (e) {} }
export const planParams = (plan) => { try { return window.ptPlanValue ? window.ptPlanValue(plan) : null } catch (e) { return null } }
