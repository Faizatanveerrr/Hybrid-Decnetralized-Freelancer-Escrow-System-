/**
 * Released money must show up for the freelancer, with the database stubbed (no MongoDB needed).
 * Run: node tests/integration/payout-unit.mjs
 */
process.env.JWT_SECRET = 'x'.repeat(32);
delete process.env.TOKEN_ADDRESS;
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const User = (await import(ROOT + '/backend/models/User.js')).default;
const Project = (await import(ROOT + '/backend/models/Project.js')).default;
const Milestone = (await import(ROOT + '/backend/models/Milestone.js')).default;
const Transaction = (await import(ROOT + '/backend/models/Transaction.js')).default;
const { signToken } = await import(ROOT + '/backend/utils/token.js');
const ms = await import(ROOT + '/backend/controllers/milestoneController.js');
const wallet = await import(ROOT + '/backend/controllers/walletController.js');
let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
const oid = () => new mongoose.Types.ObjectId();

const anna = { _id: oid(), name: 'Anna', role: 'client', walletAddress: '0x' + 'a'.repeat(40) };
const ben = { _id: oid(), name: 'Ben', role: 'freelancer', walletAddress: '0x' + 'b'.repeat(40) };
const users = new Map([anna, ben].map((u) => [String(u._id), u]));
// project created BEFORE Ben had a wallet address on it: the old code recorded "Freelancer" as payee
const project = { _id: oid(), title: 'Site', client: anna._id, freelancer: ben._id, clientWallet: '', freelancerWallet: '', escrowAddress: '', status: 'ACTIVE' };
const milestone = { _id: oid(), projectId: project._id, title: 'M1', amount: 500, status: 'SUBMITTED', chainIndex: -1 };
const ledger = [];

User.findById = (id) => { const u = users.get(String(id)) || null; const p = Promise.resolve(u); p.select = () => p; return p; };
Project.findById = async () => project;
Project.find = async (q) => [project];
Milestone.findById = async () => milestone;
Milestone.findOneAndUpdate = async (q, upd) => { if (!q.status.$in.includes(milestone.status)) return null; Object.assign(milestone, upd.$set); return milestone; };
Milestone.find = async () => [milestone];
Project.findByIdAndUpdate = async () => project;
Transaction.create = async (doc) => { ledger.push({ ...doc, _id: oid() }); return doc; };
const eq = (t, k, v) => (v && v.$in ? v.$in.map(String).includes(String(t[k])) : String(t[k]) === String(v));
const matches = (t, q) => q.$or.some((c) => Object.entries(c).every(([k, v]) => eq(t, k, v)));
Transaction.find = (q) => {
  const rows = ledger.filter((t) => (!q.type || q.type.$in.includes(t.type)) && (!q.status || t.status === q.status) && matches(t, q));
  const p = Promise.resolve(rows); p.sort = async () => rows; return p;
};

const run = async (fn, user, extra = {}) => {
  let out; const res = { status(c) { this.code = c; return this; }, json(b) { out = { code: this.code || 200, ...b }; } };
  await fn({ params: { id: String(milestone._id), userId: String(user._id) }, body: {}, query: {}, headers: { authorization: 'Bearer ' + signToken(user._id) }, ...extra }, res);
  return out;
};
const quiet = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

// client approves the submitted milestone
const done = await quiet(() => run(ms.approveMilestone, anna));
assert.equal(done.code, 200, JSON.stringify(done));
const release = ledger.find((t) => t.type === 'RELEASE');
assert.equal(release.amount, 500);
assert.equal(release.to, ben.walletAddress);             // wallet looked up from Ben's account, not left as "Freelancer"
assert.equal(String(release.toUser), String(ben._id));
ok('approving records the payment against the freelancer\'s account and wallet, even if the project had no wallet saved');

// freelancer's wallet page
const info = await run(wallet.getWalletInfo, ben);
assert.equal(info.code, 200); assert.equal(info.wallet.ledgerMode, true); assert.equal(info.wallet.balanceUSDC, 500);
const clientInfo = await run(wallet.getWalletInfo, anna);
assert.equal(clientInfo.wallet.balanceUSDC, 0);
ok('the freelancer\'s wallet shows the released amount (database mode); the client\'s does not');

// transaction history
const hist = await run(wallet.getTransactions, ben);
assert.equal(hist.transactions.length, 1); assert.equal(hist.transactions[0].type, 'RELEASE');
// an old record that only has the text "Freelancer" is still found through the account id
ledger.push({ _id: oid(), type: 'RELEASE', amount: 100, from: 'Escrow Vault', to: 'Freelancer', toUser: ben._id, status: 'CONFIRMED' });
assert.equal((await run(wallet.getWalletInfo, ben)).wallet.balanceUSDC, 600);
assert.equal((await run(wallet.getTransactions, ben)).transactions.length, 2);
assert.equal((await run(wallet.getTransactions, anna)).transactions.length, 0);
ok('the transaction history lists payments by account, so none are lost');

// older payments that only say "Freelancer" and have no account recorded are still found via the project
ledger.push({ _id: oid(), type: 'RELEASE', amount: 50, from: 'Escrow Vault', to: 'Freelancer', projectId: project._id, status: 'CONFIRMED' });
assert.equal((await run(wallet.getWalletInfo, ben)).wallet.balanceUSDC, 650);
ok('payments recorded before this update (payee text only) are still credited to the freelancer through their project');

// second approval is refused (no double payment)
assert.equal((await quiet(() => run(ms.approveMilestone, anna))).code, 409);
assert.equal(ledger.filter((t) => t.type === 'RELEASE' && t.amount === 500).length, 1);
ok('a milestone cannot be paid twice');

console.log(`\n${n} checks passed`); process.exit(0);
