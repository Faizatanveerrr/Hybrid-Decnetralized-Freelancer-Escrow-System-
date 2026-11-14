/** IPFS features end to end. Needs MongoDB, a local chain node AND an IPFS node (IPFS_API_URL). */
import { Contract } from 'ethers';
import { startFakeRazorpay, startBackend, makeApi, deployToken, core, provider, artifacts, ok, assert, crypto, RZP_SECRET, count } from './harness.mjs';

const IPFS = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const token = await deployToken();
const fake = await startFakeRazorpay(5599);
const be = await startBackend({ TOKEN_ADDRESS: token, IPFS_PROVIDER: 'kubo', IPFS_API_URL: IPFS, IPFS_MAX_MB: '1' });
const api = makeApi(be.port);
const raw = async (method, path, { token: t, body, headers } = {}) => {
  const res = await fetch(`http://127.0.0.1:${be.port}/api${path}`, { method, headers: { ...(t ? { authorization: `Bearer ${t}` } : {}), ...headers }, body });
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
};
const upload = (t, projectId, kind, name, bytes) =>
  raw('POST', `/ipfs/upload?projectId=${projectId}&kind=${kind}&name=${encodeURIComponent(name)}&type=application/zip`, { token: t, body: bytes, headers: { 'content-type': 'application/octet-stream' } });
const json = (r) => JSON.parse(r.buf.toString());
try {
  const cfg = (await api('GET', '/ipfs/config')).data.config;
  assert.equal(cfg.enabled, true); assert.equal(cfg.provider, 'kubo'); assert.equal(cfg.simulated, false);
  ok('config: IPFS enabled via a real Kubo node');

  let n = 0;
  const reg = async (name, role = 'freelancer') => { const r = await api('POST', '/auth/register', { body: { name: name + ++n, email: `${name}${n}@t.io`, password: 'Secret#12x', role } }); return { ...r.data.user, token: r.data.token }; };
  const [c, f, eve] = [await reg('client', 'client'), await reg('freelancer'), await reg('eve')];
  const sig = (o, p) => crypto.createHmac('sha256', RZP_SECRET).update(`${o}|${p}`).digest('hex');
  const o = await api('POST', '/payments/order', { token: c.token, body: { amount: 5000 } });
  await api('POST', '/payments/verify', { token: c.token, body: { razorpay_order_id: o.data.orderId, razorpay_payment_id: 'p1', razorpay_signature: sig(o.data.orderId, 'p1') } });

  const P = (await api('POST', '/projects', { token: c.token, body: { title: 'Brand kit', description: 'Logo + guidelines', milestones: [
    { title: 'Logo', amount: 1200, acceptanceCriteria: 'vector' }, { title: 'Guidelines', amount: 800, acceptanceCriteria: 'pdf' }] } })).data.project;
  const prop = await api('POST', `/projects/${P._id}/proposals`, { token: f.token, body: { message: 'hi', proposedAmount: 2000 } });
  await api('PUT', `/proposals/${prop.data.proposal._id}/accept`, { token: c.token });
  const proj0 = (await api('GET', `/projects/${P._id}`, { token: c.token })).data.project;
  const [m0, m1] = [proj0.milestones[0]._id, proj0.milestones[1]._id];
  const tx = (t, body) => api('POST', '/chain/tx', { token: t, body: { projectId: P._id, ...body } });

  // ---- job spec on IPFS, hash fixed in the contract
  const dep = await tx(c.token, { action: 'deploy' }); assert.equal(dep.status, 200, JSON.stringify(dep.data));
  const escrowAddr = dep.data.address;
  const escrow = new Contract(escrowAddr, artifacts.EscrowX.abi, provider);
  const specUri = await escrow.spec_uri();
  assert.match(specUri, /^ipfs:\/\/b[a-z2-7]+$/);
  await api('POST', `/projects/${P._id}/escrow`, { token: c.token, body: { escrowAddress: escrowAddr, txHash: dep.data.txHash } });
  const specDl = await raw('GET', `/ipfs/file/${specUri.slice(7)}`, { token: f.token });
  const spec = json(specDl); assert.equal(spec.title, 'Brand kit'); assert.equal(spec.milestones.length, 2); assert.equal(spec.milestones[1].amount, 800);
  ok(`escrow deployed with the job terms on IPFS (${specUri.slice(0, 24)}...) fixed in the contract; the freelancer can read them`);

  // ---- uploads: permissions + limits
  const deliverable = crypto.randomBytes(300 * 1024); deliverable.write('CONFIDENTIAL-LOGO-FILES', 0);
  assert.equal((await upload(c.token, P._id, 'deliverable', 'logo.zip', deliverable)).status, 403);
  assert.equal((await upload(eve.token, P._id, 'evidence', 'x.zip', deliverable)).status, 403);
  assert.equal((await raw('POST', `/ipfs/upload?projectId=${P._id}&kind=deliverable&name=x`, { body: deliverable })).status, 401);
  assert.equal((await upload(f.token, P._id, 'deliverable', 'big.zip', crypto.randomBytes(1.2 * 1024 * 1024))).status, 413);
  assert.equal((await upload(f.token, P._id, 'deliverable', 'empty.zip', Buffer.alloc(0))).status, 400);
  assert.equal((await upload(f.token, P._id, 'other', 'x', deliverable)).status, 400);
  ok('upload rules: client cannot upload deliverables; outsiders / anonymous refused; >1 MB and empty refused');

  const up = await upload(f.token, P._id, 'deliverable', 'logo.zip', deliverable);
  assert.equal(up.status, 201); const file = json(up).file; assert.match(file.uri, /^ipfs:\/\/b/);
  ok(`freelancer uploaded a 300 KB deliverable -> ${file.uri.slice(0, 26)}...`);

  // the node holds ciphertext only
  const onNode = Buffer.from(await (await fetch(`${IPFS}/api/v0/cat?arg=${file.cid}`, { method: 'POST' })).arrayBuffer());
  assert.ok(!onNode.includes(Buffer.from('CONFIDENTIAL-LOGO-FILES')) && onNode.length > deliverable.length);
  ok('what is actually stored on IPFS is encrypted (the plaintext marker is not in it)');

  // ---- fund, submit with the CID on-chain, DB checks it matches
  const fd = await tx(c.token, { action: 'fund', milestoneId: m0 });
  await api('POST', `/milestones/${m0}/fund`, { token: c.token, body: { txHash: fd.data.txHash } });
  const other = await upload(f.token, P._id, 'deliverable', 'other.zip', crypto.randomBytes(2048)); const otherCid = json(other).file.cid;
  const sub = await tx(f.token, { action: 'submit', milestoneId: m0, proof: file.uri }); assert.equal(sub.status, 200, JSON.stringify(sub.data));
  const wrong = await api('POST', `/milestones/${m0}/submit`, { token: f.token, body: { proofCid: otherCid, txHash: sub.data.txHash } });
  assert.equal(wrong.status, 409, JSON.stringify(wrong.data));
  const evUp = await upload(c.token, P._id, 'evidence', 'ev.txt', Buffer.from('client evidence')); const evFile = json(evUp).file;
  assert.equal((await api('POST', `/milestones/${m0}/submit`, { token: f.token, body: { proofCid: evFile.cid, txHash: sub.data.txHash } })).status, 400);
  assert.equal((await api('POST', `/milestones/${m0}/submit`, { token: f.token, body: { proofCid: 'nonsense!', txHash: sub.data.txHash } })).status, 400);
  const good = await api('POST', `/milestones/${m0}/submit`, { token: f.token, body: { proofCid: file.cid, txHash: sub.data.txHash } });
  assert.equal(good.status, 200, JSON.stringify(good.data)); assert.equal(good.data.milestone.proofCid, file.cid); assert.equal(good.data.milestone.proofName, 'logo.zip');
  assert.equal(await (async () => (await escrow.get_milestone(0))[3])(), file.uri);
  ok('submit: the file hash on-chain equals the stored file; a different file, someone else\'s file or a bad id are refused');

  // ---- download / decrypt access control
  const dlC = await raw('GET', `/ipfs/file/${file.cid}`, { token: c.token });
  assert.equal(dlC.status, 200); assert.ok(dlC.buf.equals(deliverable));
  assert.equal((await raw('GET', `/ipfs/file/${file.cid}`, { token: f.token })).status, 200);
  assert.equal((await raw('GET', `/ipfs/file/${file.cid}`, { token: eve.token })).status, 403);
  assert.equal((await raw('GET', `/ipfs/file/${file.cid}`)).status, 401);
  assert.equal((await raw('GET', `/ipfs/file/bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, { token: c.token })).status, 404);
  ok('client and freelancer download the decrypted original byte-for-byte; outsider 403, anonymous 401, unknown 404');

  // ---- dispute with evidence file + ruling record on IPFS
  const f2 = await tx(c.token, { action: 'fund', milestoneId: m1 });
  await api('POST', `/milestones/${m1}/fund`, { token: c.token, body: { txHash: f2.data.txHash } });
  const s2 = await tx(f.token, { action: 'submit', milestoneId: m1, proof: 'plain note' });
  await api('POST', `/milestones/${m1}/submit`, { token: f.token, body: { proof: 'plain note', txHash: s2.data.txHash } });
  await tx(c.token, { action: 'raiseDispute', milestoneId: m1, evidence: 'guidelines incomplete' });
  const D = (await api('POST', '/disputes', { token: c.token, body: { milestoneId: m1, clientClaim: 'The guidelines document is missing the colour palette section entirely' } })).data.dispute;
  const cev = json(await upload(c.token, P._id, 'evidence', 'screenshot.png', crypto.randomBytes(5000))).file;
  const fev = json(await upload(f.token, P._id, 'evidence', 'delivery-proof.pdf', crypto.randomBytes(5000))).file;
  assert.equal((await api('POST', `/disputes/${D._id}/evidence`, { token: c.token, body: { cid: fev.cid, description: 'stolen' } })).status, 400);
  const addEv = await api('POST', `/disputes/${D._id}/evidence`, { token: c.token, body: { cid: cev.cid, description: 'Screenshot showing the missing section' } });
  assert.equal(addEv.status, 200, JSON.stringify(addEv.data)); assert.equal(addEv.data.dispute.evidence[0].cid, cev.cid); assert.equal(addEv.data.dispute.evidence[0].name, 'screenshot.png');
  await api('POST', `/disputes/${D._id}/evidence`, { token: f.token, body: { cid: fev.cid, description: 'Full delivery included the palette section' } });
  ok('evidence files: you can only attach your own uploads; names/hashes stored on the dispute');

  const ai = await api('POST', `/disputes/${D._id}/ai-ruling`, { token: c.token });
  assert.equal(ai.status, 200, JSON.stringify(ai.data));
  const rulingUri = (await escrow.get_milestone(1))[8]; assert.match(rulingUri, /^ipfs:\/\/b/);
  assert.equal(ai.data.dispute.rulingCid, rulingUri.slice(7));
  const rec = json(await raw('GET', `/ipfs/file/${rulingUri.slice(7)}`, { token: f.token }));
  assert.equal(rec.type, 'escrowx-ruling'); assert.equal(rec.winner, ai.data.ruling.winner); assert.equal(rec.confidence, ai.data.ruling.confidence);
  assert.equal(rec.evidence.length, 2); assert.equal(rec.evidence[0].cid, cev.cid); assert.ok(rec.reasoning.length > 20);
  assert.equal((await raw('GET', `/ipfs/file/${rulingUri.slice(7)}`, { token: eve.token })).status, 403);
  ok('AI ruling: full reasoning + evidence hashes stored on IPFS; its hash is the ruling URI inside the contract; only participants can read it');

  console.log(`\nIPFS PART PASSED (${count()} checks)`);
} catch (e) { console.log(be.getLog().slice(-1800)); throw e; } finally { be.stop(); fake.close(); setTimeout(() => process.exit(0), 300); }
