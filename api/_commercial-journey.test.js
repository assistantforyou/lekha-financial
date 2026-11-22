// Account and billing handlers share one fixture store. Every external request is intercepted.
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createHmac } = require('node:crypto');
const load = path => require('./' + path);
Object.assign(process.env, { VERCEL_ENV: 'preview', SITE_URL: 'https://fixture.invalid', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'fixture', STRIPE_PRICE_PAID: 'price_P' });
const profile = { user_id: 'a', plan: 'free' };
const docs = new Map();
let allowRequests = true;
const accountChanges = [];
let rejectWrite = false, failedWrites = 0;
const user = id => ({id, email: id + '@example.test'});
global.fetch = async (url, options = {}) => {
  const u = new URL(url), path = u.pathname, body = options.body;
  const json = Response.json;
  if (u.hostname === 'fixture.invalid') {
    if (path.endsWith('/pt_rate_hit')) return json(allowRequests);
    if (path === '/auth/v1/signup' || path === '/auth/v1/recover') {
      assert.equal(u.searchParams.get('redirect_to'), 'https://fixture.invalid/auth-callback.html');
      assert.equal(JSON.parse(body).email, user('a').email);
      return json({});
    }
    if (path === '/auth/v1/logout') {
      assert.equal(options.headers.Authorization, 'Bearer renewed-a');
      return new Response(null, {status:204});
    }
    if (path === '/auth/v1/admin/users/a' || path.endsWith('/pt_rag_docs')) {
      assert.equal(options.method, 'DELETE');
      if (path.endsWith('/pt_rag_docs')) assert.equal(u.searchParams.get('owner'), 'eq.a');
      accountChanges.push(path);
      return new Response(null, {status:204});
    }
    if (path === '/auth/v1/token') {
      const input = JSON.parse(body);
      if (input.refresh_token === "fixture-expired") return json({}, {status:400});
      if (u.searchParams.get('grant_type') === 'refresh_token') assert.equal(input.refresh_token, 'refresh-a');
      else assert.equal(input.email, user('a').email);
      return json({access_token: u.search.includes('refresh_token') ? 'renewed-a' : 'login-a', refresh_token: 'refresh-a', user:user('a')});
    }
    if (path === '/auth/v1/user') {
      const token = options.headers.Authorization;
      assert.ok(['Bearer renewed-a','Bearer login-b'].includes(token));
      if (options.method === "PUT") {
        assert.equal(JSON.parse(body).email,"replacement@example.test");
        assert.equal(u.searchParams.get("redirect_to"),"https://fixture.invalid/auth-callback.html");
        accountChanges.push("request-email-confirmation");
      }
      return json(user(token.endsWith('-a') ? 'a' : 'b'));
    }
    const id = u.searchParams.get('user_id');
    if (path.endsWith('/pt_profiles')) {
      assert.ok(['eq.a','eq.b'].includes(id));
      if (options.method === 'PATCH') {
        if (rejectWrite) { failedWrites++; return json({error:'storage unavailable'}, {status:503}); }
        Object.assign(profile, JSON.parse(body));
        assert.equal(options.headers.Prefer, 'return=representation');
        return json([{ user_id: profile.user_id }]);
      }
      return json([id === 'eq.a' ? profile : {user_id:'b',plan:'free'}]);
    }
    if (path.endsWith('/pt_user_state')) {
      if (options.method === 'POST') {
        for (const row of JSON.parse(body)) docs.set(row.user_id, [{key:row.key, data:row.data}]);
        return new Response(null, {status:201});
      }
      assert.ok(['eq.a','eq.b'].includes(id));
      return json(docs.get(id.slice(3)) || []);
    }
  }
  if (u.hostname === 'api.stripe.com') {
    const params = new URLSearchParams(body);
    if (path.endsWith('/customers')) { assert.equal(params.get('metadata[user_id]'),'a'); return json({id:'cus_a'}); }
    if (path.endsWith('/checkout/sessions')) {
      assert.equal(params.get('line_items[0][price]'),'price_P');
      assert.equal(params.get('client_reference_id'),'a');
      assert.equal(params.get('customer'),'cus_a');
      return json({url:'https://fixture.invalid/checkout'});
    }
    if (path.endsWith('/billing_portal/sessions')) { assert.equal(params.get('customer'),'cus_a'); return json({url:'https://fixture.invalid/portal'}); }
    if (path.endsWith('/subscriptions/sub_a')) return json({id:'sub_a',status:'active',customer:'cus_a',items:{data:[{price:{id:'price_P'},current_period_end:2100000000}]}});
  }
  throw Error('Unexpected fixture request ' + path);
};
async function call(handler, req) {
  const res = {setHeader(){}, status(code){this.code=code;return this}, json(data){this.data=data;return this}};
  await handler(req,res);
  return res;
}
const headers = token => ({host:'fixture.invalid', authorization:'Bearer ' + token});
const auth = load('auth/[action]'), state = load('state'), billing = load('billing');
async function bill(route, payload, signature) {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))]);
  Object.assign(req,{method:'POST',query:{__r:route},headers:{...headers('renewed-a'),'stripe-signature':signature}});
  return call(billing,req);
}
(async()=>{
  for (const action of ['setup','signup','recover']) {
    const r = await call(auth, {method:'POST',query:{action},headers:{},body:{email:user('a').email,password:'fixture-password'}});
    assert.equal(r.code, 200);
    assert.equal(action === 'recover' ? r.data.ok : r.data.confirm, true);
    assert.equal(r.data.session, undefined);
  }
  const login = await call(auth,{method:'POST',query:{action:'login'},headers:{},body:{email:user('a').email,password:'fixture-password'}});
  assert.equal(login.data.session.access_token,'login-a');
  const refresh = await call(auth,{method:'POST',query:{action:'refresh'},headers:{},body:{refresh_token:login.data.session.refresh_token}});
  const token = refresh.data.session.access_token;
  const holding = {key:'holdings/main',data:{items:[{ticker:'SPY',shares:2}]}};
  const write = await call(state,{method:'POST',headers:headers(token),body:{docs:[holding]}});
  assert.deepEqual(write.data.written,[holding.key]);
  assert.deepEqual((await call(state,{method:'GET',headers:headers(token)})).data.docs,[holding]);
  assert.deepEqual((await call(state,{method:'GET',headers:headers('login-b')})).data.docs,[]);
  console.log('PASS login, refresh, holdings save/read, separate account view');
  assert.equal((await bill('checkout',{plan:'paid'})).data.url,'https://fixture.invalid/checkout');
  assert.equal((await bill('portal',{})).data.url,'https://fixture.invalid/portal');
  const event = {id:'evt_fixture',livemode:false,type:'checkout.session.completed',data:{object:{mode:'subscription',subscription:'sub_a',client_reference_id:'a'}}};
  const t = Math.floor(Date.now()/1000);
  const sig = 't='+t+',v1='+createHmac('sha256','fixture').update(t+'.'+JSON.stringify(event)).digest('hex');
  rejectWrite = true;
  const result = await bill('webhook',event,sig);
  assert.equal(failedWrites,1);
  assert.equal(result.code,500);
  assert.equal(profile.plan,'free');
  rejectWrite = false;
  assert.equal((await bill('webhook',event,sig)).code,200);
  assert.equal(profile.plan,'paid');
  assert.equal((await bill('checkout',{plan:'paid'})).code,409);
  Object.assign(profile, {plan:"free", sub_status:"past_due"});
  const deletion = await call(auth, {method:"POST",query:{action:"delete"},headers:headers(token),body:{password:"fixture-password",confirm:"DELETE"}});
  assert.equal(deletion.code,409);
  assert.equal(deletion.data.code,"active_subscription");
  allowRequests = false;
  for (const route of ["checkout","portal"]) assert.equal((await bill(route,{plan:"paid"})).code,429);
  allowRequests = true;
  assert.deepEqual(accountChanges, []);
  const expired = await call(auth,{method:"POST",query:{action:"refresh"},headers:{},body:{refresh_token:"fixture-expired"}});
  assert.equal(expired.code,401);
  const emailChange = await call(auth,{method:"POST",query:{action:"email"},headers:headers(token),
    body:{email:"replacement@example.test",password:"fixture-password"}});
  assert.equal(emailChange.code,200);
  assert.deepEqual(accountChanges, ["request-email-confirmation"]);
  Object.assign(profile, {plan:"free", sub_status:"canceled"});
  const closed = await call(auth, {method:"POST",query:{action:"delete"},headers:headers(token),body:{password:"fixture-password",confirm:"DELETE"}});
  assert.equal(closed.code,200);
  assert.deepEqual(accountChanges.slice(1), ["/rest/v1/pt_rag_docs","/auth/v1/admin/users/a"]);
  const logout = await call(auth,{method:'POST',query:{action:'logout'},headers:headers(token)});
  assert.equal(logout.data.ok,true);
  console.log('PASS signup, recovery, logout and Checkout, portal, signed activation, duplicate subscription guard');
})().catch(e=>{console.error(e.message);process.exitCode=1});
