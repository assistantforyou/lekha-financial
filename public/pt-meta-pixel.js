/* Meta Pixel base code (pixel 992555843449556). Shared by /, /login.html and /v3. */
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '992555843449556');
fbq('track', 'PageView');

/* Conversion events. One helper for all three front ends: window.ptTrack(name, params, onceKey).
   - Standard events only (CompleteRegistration, ViewContent, Search, InitiateCheckout, Subscribe, Purchase, Contact).
   - Never pass holdings, tickers, balances, search text or e-mail addresses: Meta prohibits financial and personal data.
   - onceKey makes an event fire at most once per browser (localStorage), so a reload cannot double count it.
   - eventID is generated so a future server-side (Conversions API) copy of the same event can be de-duplicated. */
(function () {
  var PLAN_THB = { paid: 399, premium: 599 };
  function once(key) {
    if (!key) return true;
    try {
      var k = "ptpub.v1.px." + key;
      if (localStorage.getItem(k)) return false;
      localStorage.setItem(k, "1");
    } catch (e) {}
    return true;
  }
  function fire(kind, name, params, onceKey) {
    try {
      if (!window.fbq || !once(onceKey)) return;
      var id = name + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      fbq(kind, name, params || {}, { eventID: id });
    } catch (e) {}
  }
  window.ptTrack = function (name, params, onceKey) { fire("track", name, params, onceKey); };
  /* Custom (non-standard) events, e.g. AskAnalyst. Kept separate because fbq('track') only accepts Meta's own event names. */
  window.ptTrackCustom = function (name, params, onceKey) { fire("trackCustom", name, params, onceKey); };
  window.ptPlanValue = function (plan) {
    return PLAN_THB[plan] ? { value: PLAN_THB[plan], currency: "THB", content_name: plan === "premium" ? "Premium" : "Paid", content_category: "subscription", content_type: "product", content_ids: [plan] } : null;
  };
  /* the page queues events until this script has loaded (see the head of app/index.html); replay them now */
  var q = window.__ptq; if (q && q.length) { window.__ptq = null; q.forEach(function (a) { fire(a[0], a[1], a[2], a[3]); }); }
})();
