/** Demo payment mode (no Razorpay account) and its safety rules. */
import { startFakeRazorpay, startBackend, makeApi, deployToken, core, provider, ok, assert, count } from './harness.mjs';

const token = await deployToken();
const fake = await startFakeRazorpay(5599);
const bal = (a) => core.getInrBalance(provider, token, a);
const sharedDb = `mongodb://127.0.0.1:27017/escrowx_it_demo_${Date.now()}`;
let n = 0;
const boot = async (env = {}) => {
  const be = await startBackend({ TOKEN_ADDRESS: token, RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', ...env });
  const api = makeApi(be.port);
  const user = async (name) => { const r = await api('POST', '/auth/register', { body: { name: name + ++n, email: `${name}${n}@t.io`, password: 'Secret#12x', role: 'freelancer' } }); return { ...r.data.user, token: r.data.token }; };
  return { be, api, user };
};

// ------------------------------------------------ 1. demo mode, no keys at all
let t = await boot({ MONGODB_URI: sharedDb });
let orphanDemoOrder;
try {
  const cfg = (await t.api('GET', '/payments/config')).data.config;
  assert.equal(cfg.enabled, true); assert.equal(cfg.mode, 'demo'); assert.equal(cfg.keyId, '');
  ok('with no Razorpay keys the server runs in demo mode (button available, no key exposed)');

  const u = await t.user('demo');
  assert.equal((await t.api('POST', '/payments/order', { token: u.token, body: { amount: 0 } })).status, 400);
  assert.equal((await t.api('POST', '/payments/order', { token: u.token, body: { amount: 999999 } })).status, 400);
  assert.equal((await t.api('POST', '/payments/order', { body: { amount: 100 } })).status, 401);
  const o = await t.api('POST', '/payments/order', { token: u.token, body: { amount: 2500 } });
  assert.equal(o.status, 201, JSON.stringify(o.data)); assert.equal(o.data.mode, 'demo'); assert.match(o.data.orderId, /^demo_order_/);
  assert.equal(await bal(u.walletAddress), 0);
  const v = await t.api('POST', '/payments/verify', { token: u.token, body: { razorpay_order_id: o.data.orderId } });
  assert.equal(v.status, 200, JSON.stringify(v.data)); assert.equal(v.data.payment.status, 'MINTED'); assert.match(v.data.payment.paymentId, /^demo_pay_/);
  assert.equal(await bal(u.walletAddress), 2500); assert.ok((await provider.getBalance(u.walletAddress)) > 0n);
  ok('demo checkout: ₹2500 credited as INR tokens on-chain (plus gas), same pipeline as a real payment');

  await t.api('POST', '/payments/verify', { token: u.token, body: { razorpay_order_id: o.data.orderId } });
  assert.equal(await bal(u.walletAddress), 2500);
  const other = await t.user('other');
  assert.equal((await t.api('POST', '/payments/verify', { token: other.token, body: { razorpay_order_id: o.data.orderId } })).status, 404);
  assert.equal((await t.api('POST', '/payments/verify', { token: u.token, body: { razorpay_order_id: 'order_real_123' } })).status, 400);
  assert.equal((await t.api('POST', '/payments/verify', { token: u.token, body: { razorpay_order_id: 'demo_order_nope' } })).status, 404);
  assert.equal((await t.api('POST', '/payments/verify', {  body: { razorpay_order_id: o.data.orderId } })).status, 401);
  ok('demo: replay mints nothing twice; other users, non-demo ids, unknown ids and anonymous callers are refused');

  const w = await t.api('POST', '/payouts', { token: u.token, body: { amount: 1000, vpa: 'demo@okhdfcbank' } });
  assert.equal(w.status, 201); assert.equal(w.data.payout.status, 'PROCESSED'); assert.equal(await bal(u.walletAddress), 1500);
  ok('the full loop works: demo top-up -> tokens -> simulated withdrawal');

  const pending = await t.user('pending');
  orphanDemoOrder = (await t.api('POST', '/payments/order', { token: pending.token, body: { amount: 700 } })).data.orderId;
  globalThis.__pendingUser = pending;
} finally { t.be.stop(); }

// ------------------------------------------------ 2. a demo order can never complete a real-gateway payment
t = await boot({ MONGODB_URI: sharedDb, RAZORPAY_KEY_ID: 'rzp_test_fake', RAZORPAY_KEY_SECRET: 'fake_secret', RAZORPAY_API_BASE: 'http://127.0.0.1:5599' });
try {
  assert.equal((await t.api('GET', '/payments/config')).data.config.mode, 'razorpay');
  const pending = globalThis.__pendingUser;
  const login = await t.api('POST', '/auth/login', { body: { email: pending.email, password: 'Secret#12x' } });
  const tok = login.data.token;
  const before = await bal(pending.walletAddress);
  const forged = await t.api('POST', '/payments/verify', { token: tok, body: { razorpay_order_id: orphanDemoOrder } });
  assert.equal(forged.status, 400);
  const forged2 = await t.api('POST', '/payments/verify', { token: tok, body: { razorpay_order_id: orphanDemoOrder, razorpay_payment_id: 'pay_x', razorpay_signature: 'abc' } });
  assert.equal(forged2.status, 400); assert.equal(await bal(pending.walletAddress), before);
  ok('once real keys are configured, demo orders cannot be completed (no free tokens by switching modes)');
} finally { t.be.stop(); }

// ------------------------------------------------ 3. explicit switches + the live-money rule
t = await boot({ PAYMENT_MODE: 'off' });
try {
  assert.equal((await t.api('GET', '/payments/config')).data.config.enabled, false);
  const u = await t.user('off');
  assert.equal((await t.api('POST', '/payments/order', { token: u.token, body: { amount: 100 } })).status, 503);
  ok('PAYMENT_MODE=off disables top-ups completely');
} finally { t.be.stop(); }

t = await boot({ PAYMENT_MODE: 'demo', RAZORPAYX_ACCOUNT_NUMBER: '2323230099999999', RAZORPAY_KEY_ID: 'rzp_live_fake', RAZORPAY_KEY_SECRET: 'live_secret' });
try {
  const cfg = (await t.api('GET', '/payments/config')).data.config;
  assert.equal(cfg.mode, 'off'); assert.equal(cfg.enabled, false);
  const u = await t.user('live');
  assert.equal((await t.api('POST', '/payments/order', { token: u.token, body: { amount: 100 } })).status, 503);
  const forged = await t.api('POST', '/payments/verify', { token: u.token, body: { razorpay_order_id: 'demo_order_x' } });
  assert.notEqual(forged.status, 200);
  ok('PAYMENT_MODE=demo is REFUSED next to live-money payouts: free tokens can never be cashed out as real rupees');
} finally { t.be.stop(); }

console.log(`\nDEMO PAYMENTS PASSED (${count()} checks)`);
fake.close(); setTimeout(() => process.exit(0), 300);
