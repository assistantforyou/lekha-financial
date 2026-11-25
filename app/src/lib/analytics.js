// PostHog wrapper for the React shell. The library and its privacy rules live in public/pt-analytics.js, which
// every surface (app, /v2, /v3, login) shares; this module only forwards. Calls before the library is ready are
// queued by public/pt-analytics.js, so nothing is lost on a cold load.
//
// Never pass user content: no search text, questions, prompts, symbols from a portfolio, balances or e-mails.
// Route names, plan names, counts, durations and booleans are the vocabulary.
export const capture = (name, props) => { try { window.PT_PH && window.PT_PH.capture(name, props) } catch (e) {} }
export const identify = (id, props) => { try { window.PT_PH && window.PT_PH.identify(id, props) } catch (e) {} }
export const reset = () => { try { window.PT_PH && window.PT_PH.reset() } catch (e) {} }
export const pageview = () => { try { window.PT_PH && window.PT_PH.pageview() } catch (e) {} }
