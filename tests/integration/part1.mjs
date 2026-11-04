import { ROOT, gw, startFakeRazorpay, startBackend, makeApi, deployToken, core, provider, ok, assert, crypto, RZP_SECRET, count } from './harness.mjs';

const token = await deployToken();
const fake = await startFakeRazorpay(5599);
const be = await startBackend({ TOKEN_ADDRESS: token });
const api = makeApi(be.port);
const fail = async (e) => { console.log(be.getLog().slice(-2500)); throw e; };
try {
  // ---------------- auth
  const reg = async (name, role) => api('POST', '/auth/register', { body: { name, email: `${name}@t.io`, password: 'secret12', role } });
  const c = await reg('client', 'client'), f = await reg('freelancer', 'freelancer');
  assert.equal(c.status, 201); assert.ok(c.data.token);
  assert.equal(c.data.user.password, undefined); assert.equal(c.data.user.managedWallet, undefined);
  assert.equal(c.data.user.walletType, 'managed'); assert.match(c.data.user.walletAddress, /^0x[0-9a-fA-F]{40}$/);
  ok('register: token issued, managed wallet created, no password / key material in response');
  const CT = c.data.token, FT = f.data.token, CU = c.data.user, FU = f.data.user;

  assert.equal((await api('POST', '/auth/login', { body: { email: 'client@t.io', password: 'nope' } })).status, 401);
  const lg = await api('POST', '/auth/login', { body: { email: 'client@t.io', password: 'secret12' } });
  assert.equal(lg.status, 200); assert.ok(lg.data.token);
  ok('login: wrong password rejected, right password returns a token');
  assert.equal((await api('GET', '/auth/me')).status, 401);
  assert.equal((await api('GET', '/auth/me', { token: CT })).data.user.email, 'client@t.io');
  const spoof = await fetch(`http://127.0.0.1:${be.port}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': CU._id }, body: '{}' });
  assert.equal(spoof.status, 401);
  ok('me works with token; missing token and old x-user-id spoof are rejected');

  // ---------------- top-up via fake Razorpay
  assert.equal((await api('GET', '/payments/config')).data.config.enabled, true);
  const o = await api('POST', '/payments/order', { token: CT, body: { amount: 5000 } });
  assert.equal(o.status, 201, JSON.stringify(o.data)); assert.equal(o.data.amountPaise, 500000);
  assert.equal((await api('POST', '/payments/order', { token: CT, body: { amount: 0 } })).status, 400);
  const sig = (oid, pid) => crypto.createHmac('sha256', RZP_SECRET).update(`${oid}|${pid}`).digest('hex');
  const bad = await api('POST', '/payments/verify', { token: CT, body: { razorpay_order_id: o.data.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'bad' } });
  assert.equal(bad.status, 400);
  assert.equal(await core.getInrBalance(provider, token, CU.walletAddress), 0);
  const good = { razorpay_order_id: o.data.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: sig(o.data.orderId, 'pay_1') };
  const v1 = await api('POST', '/payments/verify', { token: CT, body: good });
  assert.equal(v1.status, 200, JSON.stringify(v1.data)); assert.equal(v1.data.payment.status, 'MINTED');
  assert.equal(await core.getInrBalance(provider, token, CU.walletAddress), 5000);
  assert.ok((await provider.getBalance(CU.walletAddress)) > 0n);
  ok('top-up: bad signature rejected; good signature mints ₹5000 on-chain and drips gas');
  await api('POST', '/payments/verify', { token: CT, body: good });
  assert.equal(await core.getInrBalance(provider, token, CU.walletAddress), 5000);
  const other = await api('POST', '/payments/verify', { token: FT, body: good });
  assert.equal(other.status, 404);
  ok('top-up: replaying the same payment does not mint twice; another user cannot claim it');
  const w = await api('GET', `/wallet/${CU._id}`, { token: CT });
  assert.equal(w.data.wallet.onChainBalance, 5000); assert.equal((await api('GET', `/wallet/${CU._id}`, { token: FT })).status, 403);
  ok('wallet endpoint shows on-chain balance and refuses other users');

  // ---------------- project + proposal
  const pr = await api('POST', '/projects', { token: CT, body: { title: 'Logo', description: 'Design a logo', milestones: [
    { title: 'Draft', amount: 1200, acceptanceCriteria: '3 concepts' }, { title: 'Final', amount: 800, acceptanceCriteria: 'vector files' }] } });
  assert.equal(pr.status, 201, JSON.stringify(pr.data));
  const P = pr.data.project; assert.equal((await api('POST', '/projects', { token: CT, body: { title: 'x', description: 'y', milestones: [{ title: 'a', amount: 0 }] } })).status, 400);
  const prop = await api('POST', `/projects/${P._id}/proposals`, { token: FT, body: { message: 'I can do it', proposedAmount: 2000 } });
  assert.equal(prop.status, 201, JSON.stringify(prop.data));
  const acc = await api('PUT', `/proposals/${prop.data.proposal._id}/accept`, { token: CT });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  let proj = (await api('GET', `/projects/${P._id}`, { token: CT })).data.project;
  assert.equal(String(proj.freelancer._id || proj.freelancer), FU._id);
  ok('project created (invalid milestone rejected); proposal accepted; freelancer assigned');

  // ---------------- off-chain safety before escrow exists
  const m0 = proj.milestones[0]._id, m1 = proj.milestones[1]._id;
  assert.equal((await api('POST', `/milestones/${m0}/fund`, { token: FT })).status, 403);
  ok('freelancer cannot fund a milestone (role check)');

  // ---------------- deploy + register escrow (managed signing)
  const tx = (token_, body) => api('POST', '/chain/tx', { token: token_, body: { projectId: P._id, ...body } });
  assert.equal((await tx(FT, { action: 'deploy' })).status, 403);
  const dep = await tx(CT, { action: 'deploy' }); assert.equal(dep.status, 200, JSON.stringify(dep.data));
  const reg2 = await api('POST', `/projects/${P._id}/escrow`, { token: CT, body: { escrowAddress: dep.data.address, txHash: dep.data.txHash } });
  assert.equal(reg2.status, 200, JSON.stringify(reg2.data));
  assert.equal((await api('POST', `/projects/${P._id}/escrow`, { token: CT, body: { escrowAddress: dep.data.address } })).status, 409);
  proj = reg2.data.project; assert.equal(proj.milestones[1].chainIndex, 1); assert.equal(proj.escrowAddress, dep.data.address);
  ok('escrow deployed via server signing, verified against the DB and linked; freelancer cannot deploy; double registration refused');

  // ---------------- fund -> submit -> approve
  assert.equal((await api('POST', `/milestones/${m0}/fund`, { token: CT })).status, 409);
  ok('DB refuses "funded" until the chain says funded');
  const fund = await tx(CT, { action: 'fund', milestoneId: m0 }); assert.equal(fund.status, 200, JSON.stringify(fund.data));
  const fr = await api('POST', `/milestones/${m0}/fund`, { token: CT, body: { txHash: fund.data.txHash } });
  assert.equal(fr.status, 200, JSON.stringify(fr.data)); assert.equal(fr.data.milestone.status, 'FUNDED');
  assert.equal((await api('POST', `/milestones/${m0}/fund`, { token: CT, body: { txHash: fund.data.txHash } })).status, 409);
  const sub = await tx(FT, { action: 'submit', milestoneId: m0, proof: 'ipfs://done' }); assert.equal(sub.status, 200, JSON.stringify(sub.data));
  const sr = await api('POST', `/milestones/${m0}/submit`, { token: FT, body: { proof: 'ipfs://done', txHash: sub.data.txHash } });
  assert.equal(sr.status, 200, JSON.stringify(sr.data)); assert.equal(sr.data.milestone.status, 'SUBMITTED');
  assert.ok(new Date(sr.data.milestone.autoReleaseDeadline) > new Date());
  assert.equal((await tx(FT, { action: 'approve', milestoneId: m0 })).status, 403);
  const ap = await tx(CT, { action: 'approve', milestoneId: m0 });
  const ar = await api('POST', `/milestones/${m0}/approve`, { token: CT, body: { txHash: ap.data.txHash } });
  assert.equal(ar.status, 200, JSON.stringify(ar.data)); assert.equal(ar.data.milestone.status, 'RELEASED');
  assert.equal(await core.getInrBalance(provider, token, FU.walletAddress), 1200);
  assert.equal((await api('POST', `/milestones/${m0}/approve`, { token: CT, body: { txHash: ap.data.txHash } })).status, 409);
  ok('fund -> submit -> approve: DB mirrors chain, freelancer holds ₹1200, double-approve refused');
  const tr = await api('GET', `/wallet/transactions/${FU._id}`, { token: FT });
  assert.ok(tr.data.transactions.some((t) => t.type === 'RELEASE' && t.amount === 1200 && /^0x/.test(t.txHash)));
  ok('transaction history records the release with its real tx hash');

  // ---------------- dispute path
  const f2 = await tx(CT, { action: 'fund', milestoneId: m1 });
  await api('POST', `/milestones/${m1}/fund`, { token: CT, body: { txHash: f2.data.txHash } });
  const s2 = await tx(FT, { action: 'submit', milestoneId: m1, proof: 'p2' });
  await api('POST', `/milestones/${m1}/submit`, { token: FT, body: { proof: 'p2', txHash: s2.data.txHash } });
  assert.equal((await api('POST', '/disputes', { token: CT, body: { milestoneId: m1, clientClaim: 'bad' } })).status, 409);
  ok('dispute refused until the dispute exists on-chain');
  const rd = await tx(CT, { action: 'raiseDispute', milestoneId: m1, evidence: 'files were incomplete' }); assert.equal(rd.status, 200, JSON.stringify(rd.data));
  assert.equal((await api('POST', '/disputes', { token: FT, body: { milestoneId: m1, freelancerClaim: 'x' } })).status, 403);
  const dc = await api('POST', '/disputes', { token: CT, body: { milestoneId: m1, clientClaim: 'The final files were incomplete and missing the vector format entirely' } });
  assert.equal(dc.status, 201, JSON.stringify(dc.data)); const D = dc.data.dispute; assert.equal(D.openedByRole, 'client');
  assert.equal((await api('POST', '/disputes', { token: CT, body: { milestoneId: m1, clientClaim: 'again' } })).status, 400);
  await api('POST', `/disputes/${D._id}/evidence`, { token: FT, body: { name: 'delivery.zip', description: 'I delivered everything incl. vector files in the zip' } });
  const ai = await api('POST', `/disputes/${D._id}/ai-ruling`, { token: CT });
  assert.equal(ai.status, 200, JSON.stringify(ai.data)); assert.ok(ai.data.txHash);
  const onchain = await core.readRuling(provider, (await api('GET', `/projects/${P._id}`, { token: CT })).data.project.escrowAddress, 1);
  assert.equal(onchain.confidence, ai.data.ruling.confidence);
  ok(`AI ruling (${ai.data.ruling.winner}, ${ai.data.ruling.confidence}%) signed on-chain by the arbitrator wallet`);
  const fin0 = await api('POST', `/disputes/${D._id}/finalize`, { token: CT });
  assert.equal(fin0.status, 400); ok('finalize blocked while the appeal window is open');
  const apc = await api('POST', `/disputes/${D._id}/appeal`, { token: FT, body: { reason: 'evidence ignored' } });
  assert.equal(apc.status, 409); ok('appeal refused until the appeal transaction exists on-chain');
  await tx(FT, { action: 'appeal', milestoneId: m1 });
  const ap2 = await api('POST', `/disputes/${D._id}/appeal`, { token: FT, body: { reason: 'evidence ignored' } });
  assert.equal(ap2.status, 200, JSON.stringify(ap2.data));
  const sec = await api('POST', `/disputes/${D._id}/ai-ruling`, { token: FT });
  assert.equal(sec.status, 200, JSON.stringify(sec.data));
  const winner = sec.data.dispute.secondaryWinner;
  assert.equal((await api('POST', `/disputes/${D._id}/finalize`, { token: CT })).status, 409);
  ok('appeal -> secondary ruling signed on-chain; DB finalize refuses until payout tx exists');
  const fz = await tx(winner === 'client' ? CT : FT, { action: 'finalize', milestoneId: m1 });
  assert.equal(fz.status, 200, JSON.stringify(fz.data));
  const fd = await api('POST', `/disputes/${D._id}/finalize`, { token: CT, body: { txHash: fz.data.txHash } });
  assert.equal(fd.status, 200, JSON.stringify(fd.data)); assert.equal(fd.data.dispute.status, 'FINALIZED');
  assert.equal((await api('POST', `/disputes/${D._id}/finalize`, { token: CT, body: { txHash: fz.data.txHash } })).status, 409);
  const finalProj = (await api('GET', `/projects/${P._id}`, { token: CT })).data.project;
  assert.equal(finalProj.milestones[1].status, winner === 'client' ? 'REFUNDED' : 'RELEASED');
  assert.equal(finalProj.status, 'COMPLETED');
  ok(`finalize: ${winner} paid ₹800 on-chain, DB milestone ${finalProj.milestones[1].status}, project COMPLETED, double finalize refused`);
  const dlist = await api('GET', '/disputes', { token: CT }); assert.equal(dlist.data.disputes.length, 1);
  const outsider = (await reg('eve', 'freelancer')).data.token;
  assert.equal((await api('GET', `/disputes/${D._id}`, { token: outsider })).status, 403);
  assert.equal((await api('GET', '/disputes', { token: outsider })).data.disputes.length, 0);
  ok('outsiders cannot read or list other people\'s disputes');
  console.log(`\nPART 1 PASSED (${count()} checks)`);
} catch (e) { await fail(e); } finally { be.stop(); fake.close(); setTimeout(() => process.exit(0), 300); }
