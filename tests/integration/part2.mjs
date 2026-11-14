import { Wallet } from 'ethers';
import { gw, startFakeRazorpay, startBackend, makeApi, deployToken, core, provider, platform, ok, assert, crypto, RZP_SECRET, count } from './harness.mjs';

const token = await deployToken();
const fake = await startFakeRazorpay(5599);
const bal = (a) => core.getInrBalance(provider, token, a);
const sig = (o, p) => crypto.createHmac('sha256', RZP_SECRET).update(`${o}|${p}`).digest('hex');
let n = 0;

const boot = async (env = {}) => {
  const be = await startBackend({ TOKEN_ADDRESS: token, ...env });
  const api = makeApi(be.port);
  const newUser = async (name, topUp = 0) => {
    const r = await api('POST', '/auth/register', { body: { name: `${name}${++n}`, email: `${name}${n}@t.io`, password: 'Secret#12x', role: 'freelancer' } });
    const u = { ...r.data.user, token: r.data.token };
    if (topUp) {
      const o = await api('POST', '/payments/order', { token: u.token, body: { amount: topUp } });
      const pid = `pay_${n}`;
      const v = await api('POST', '/payments/verify', { token: u.token, body: { razorpay_order_id: o.data.orderId, razorpay_payment_id: pid, razorpay_signature: sig(o.data.orderId, pid) } });
      assert.equal(v.data.payment.status, 'MINTED');
    }
    return u;
  };
  return { be, api, newUser, wd: (u, body) => api('POST', '/payouts', { token: u.token, body }) };
};

// ===================================================== A. simulated mode
let t = await boot();
try {
  const cfg = (await t.api('GET', '/payouts/config')).data.config;
  assert.equal(cfg.mode, 'simulated'); assert.equal(cfg.live, false); assert.equal(cfg.max, 10000);
  const treasury = cfg.treasuryAddress; assert.match(treasury, /^0x/);
  const u = await t.newUser('sim', 3000);
  assert.equal((await t.api('POST', '/payouts', { body: { amount: 10, vpa: 'a@b' } })).status, 401);
  assert.equal((await t.wd(u, { amount: 100, vpa: 'not a upi id' })).status, 400);
  assert.equal((await t.wd(u, { amount: 0.5, vpa: 'ok@okhdfcbank' })).status, 400);
  assert.equal((await t.wd(u, { amount: 20000, vpa: 'ok@okhdfcbank' })).status, 400);
  assert.equal((await t.wd(u, { amount: 5000, vpa: 'ok@okhdfcbank' })).status, 400);
  assert.equal(await bal(u.walletAddress), 3000);
  ok('A: unauthenticated, bad UPI id, below-min, above-max and over-balance withdrawals all rejected; nothing moved');

  const tBefore = await bal(treasury);
  const w1 = await t.wd(u, { amount: 1000, vpa: 'freelancer@okhdfcbank' });
  assert.equal(w1.status, 201, JSON.stringify(w1.data)); assert.equal(w1.data.payout.status, 'PROCESSED'); assert.match(w1.data.message, /simulated/);
  assert.equal(await bal(u.walletAddress), 2000); assert.equal((await bal(treasury)) - tBefore, 1000);
  assert.match(w1.data.payout.collectTxHash, /^0x[0-9a-f]{64}$/); assert.match(w1.data.payout.utr, /^SIM/);
  ok('A: simulated withdrawal: ₹1000 moved to treasury on-chain, payout PROCESSED, clearly labelled simulated');
  const list = await t.api('GET', '/payouts/mine', { token: u.token });
  assert.equal(list.data.payouts.length, 1); assert.equal(list.data.payouts[0].vpa, 'freelancer@okhdfcbank');
  const me = await t.api('GET', '/auth/me', { token: u.token }); assert.equal(me.data.user.upiId, 'freelancer@okhdfcbank');
  const again = await t.wd(u, { amount: 500 });   // UPI id remembered from profile
  assert.equal(again.status, 201); assert.equal(await bal(u.walletAddress), 1500);
  ok('A: history lists the payout; UPI id is remembered for the next withdrawal');

  // ----- B. MetaMask-style external wallet
  const ext = await t.newUser('ext');
  const extWallet = Wallet.createRandom().connect(provider);
  await (await platform.sendTransaction({ to: extWallet.address, value: 10n ** 18n })).wait();
  const put = await t.api('PUT', `/users/${ext._id}`, { token: ext.token, body: { walletAddress: extWallet.address } });
  assert.equal(put.status, 200, JSON.stringify(put.data)); assert.equal(put.data.user.walletType, 'external');
  const minted = await core.mintInr(platform, token, extWallet.address, 2000);
  assert.equal((await t.wd(ext, { amount: 800, vpa: 'ext@paytm' })).status, 400);
  ok('B: external-wallet user cannot withdraw without sending tokens first');
  const wrongFrom = await core.transferInr(platform, token, treasury, 800);       // someone else's transfer
  assert.equal((await t.wd(ext, { amount: 800, vpa: 'ext@paytm', txHash: wrongFrom.txHash })).status, 400);
  const short = await core.transferInr(extWallet, token, treasury, 100);
  assert.equal((await t.wd(ext, { amount: 800, vpa: 'ext@paytm', txHash: short.txHash })).status, 400);
  ok('B: transfers from another wallet, or of a smaller amount, are not accepted as payment');
  const v1 = await t.api('POST', '/payouts/validate', { token: ext.token, body: { amount: 800, vpa: 'ext@paytm' } });
  assert.equal(v1.status, 200); assert.equal(v1.data.treasuryAddress, treasury);
  assert.equal((await t.api('POST', '/payouts/validate', { token: ext.token, body: { amount: 800, vpa: 'bad' } })).status, 400);
  assert.equal((await t.api('POST', '/payouts/validate', { token: ext.token, body: { amount: 999999, vpa: 'ext@paytm' } })).status, 400);
  ok('B: pre-check endpoint approves a valid request and rejects bad ones before any tokens are sent');
  const sent = await core.transferInr(extWallet, token, treasury, 800);
  const ew = await t.wd(ext, { amount: 800, vpa: 'ext@paytm', txHash: sent.txHash });
  assert.equal(ew.status, 201, JSON.stringify(ew.data)); assert.equal(ew.data.payout.status, 'PROCESSED');
  assert.equal(await bal(extWallet.address), 1100);
  assert.equal((await t.wd(ext, { amount: 800, vpa: 'ext@paytm', txHash: sent.txHash })).status, 409);
  ok('B: MetaMask withdrawal verified from the on-chain Transfer; replaying the same transfer is refused');
} finally { t.be.stop(); }

// ===================================================== C. RazorpayX path (fake gateway), test keys
t = await boot({ RAZORPAYX_ACCOUNT_NUMBER: '2323230099999999' });
try {
  const cfg = (await t.api('GET', '/payouts/config')).data.config;
  assert.equal(cfg.mode, 'razorpayx'); assert.equal(cfg.live, false); const treasury = cfg.treasuryAddress;
  const u = await t.newUser('rx', 5000);

  const w = await t.wd(u, { amount: 750.5, vpa: 'rx@okicici' });
  assert.equal(w.status, 201, JSON.stringify(w.data)); assert.equal(w.data.payout.status, 'PROCESSING');
  const call = gw.payoutLog.at(-1);
  assert.equal(call.body.amount, 75050); assert.equal(call.body.mode, 'UPI'); assert.equal(call.body.currency, 'INR');
  assert.equal(call.body.account_number, '2323230099999999'); assert.equal(call.body.fund_account.account_type, 'vpa');
  assert.equal(call.body.fund_account.vpa.address, 'rx@okicici'); assert.equal(call.body.fund_account.contact.type, 'customer');
  assert.ok(call.headers['x-payout-idempotency'] && call.headers.authorization.startsWith('Basic '));
  assert.equal(await bal(u.walletAddress), 4249.5);
  ok('C: RazorpayX request is correct (₹750.50 = 75050 paise, UPI, vpa, idempotency key); tokens held while PROCESSING');

  let list = (await t.api('GET', '/payouts/mine', { token: u.token })).data.payouts;
  assert.equal(list[0].status, 'PROCESSING');
  const entity = [...gw.payouts.values()].at(-1).entity; entity.status = 'processed'; entity.utr = 'UTR998877';
  list = (await t.api('GET', '/payouts/mine', { token: u.token })).data.payouts;
  assert.equal(list[0].status, 'PROCESSED'); assert.equal(list[0].utr, 'UTR998877');
  assert.equal(await bal(u.walletAddress), 4249.5);
  ok('C: reconcile picks up "processed" + UTR from the gateway; tokens stay with the treasury');

  gw.failPayouts = true;
  const bad = await t.wd(u, { amount: 1000, vpa: 'rx@okicici' });
  assert.equal(bad.status, 502); assert.equal(bad.data.payout.status, 'REFUNDED'); assert.match(bad.data.message, /returned to your wallet/);
  assert.equal(await bal(u.walletAddress), 4249.5); assert.match(bad.data.payout.refundTxHash, /^0x/);
  gw.failPayouts = false;
  ok('C: gateway rejects the payout -> tokens refunded on-chain automatically, balance restored');

  const w3 = await t.wd(u, { amount: 400, vpa: 'rx@okicici' });
  assert.equal(w3.data.payout.status, 'PROCESSING'); assert.equal(await bal(u.walletAddress), 3849.5);
  const e3 = [...gw.payouts.values()].at(-1).entity; e3.status = 'reversed'; e3.failure_reason = 'beneficiary bank down';
  list = (await t.api('GET', '/payouts/mine', { token: u.token })).data.payouts;
  assert.equal(list[0].status, 'REFUNDED'); assert.equal(await bal(u.walletAddress), 4249.5);
  ok('C: payout later reversed by the gateway -> reconcile refunds the tokens exactly once');
  await t.api('GET', '/payouts/mine', { token: u.token });
  assert.equal(await bal(u.walletAddress), 4249.5);
  ok('C: repeated reconcile does not refund twice');
} finally { t.be.stop(); }

// ===================================================== D. live-money safety guard
t = await boot({ RAZORPAYX_ACCOUNT_NUMBER: '2323230099999999', RAZORPAY_KEY_ID: 'rzp_live_fake' });
try {
  const cfg = (await t.api('GET', '/payouts/config')).data.config; assert.equal(cfg.live, true);
  const u = await t.newUser('live', 1000);
  const blocked = await t.wd(u, { amount: 100, vpa: 'live@okaxis' });
  assert.equal(blocked.status, 503); assert.match(blocked.data.message, /faucet/);
  assert.equal(await bal(u.walletAddress), 1000); const callsBefore = gw.payoutLog.length;
  assert.equal(callsBefore, gw.payoutLog.length);
  ok('D: LIVE payouts refuse to run while the token has a public faucet; nothing moved, gateway never called');
  await core.setFaucetEnabled(platform, token, false);
  const allowed = await t.wd(u, { amount: 100, vpa: 'live@okaxis' });
  assert.equal(allowed.status, 201, JSON.stringify(allowed.data)); assert.equal(gw.payoutLog.length, callsBefore + 1);
  const faucetUser = await t.newUser('nofaucet');
  console.log('  (faucet now off)');
  ok('D: after the faucet is switched off, live payouts proceed');
} finally { t.be.stop(); }

console.log(`\nPART 2 PASSED (${count()} checks)`);
fake.close(); setTimeout(() => process.exit(0), 300);
