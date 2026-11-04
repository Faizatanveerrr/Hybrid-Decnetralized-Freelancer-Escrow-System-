/**
 * End-to-end check of the on-chain flow against a local node
 * (e.g. `npx hardhat node` or `anvil`). Not needed to run the app.
 *   node scripts/e2e-local.mjs [rpcUrl]
 */
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import assert from 'node:assert/strict';
import artifacts from '../shared/artifacts.json' with { type: 'json' };
import * as chain from '../shared/chainCore.js';

const rpc = process.argv[2] || 'http://127.0.0.1:8545';
const provider = new JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
// Hardhat/anvil default dev keys (public, test-only)
const keys = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
];
const [deployer, client, freelancer, arbitrator] = [
  new Wallet(keys[0], provider), new Wallet(keys[1], provider), new Wallet(keys[2], provider),
  Wallet.createRandom().connect(provider)
];
// give the arbitrator gas
await (await deployer.sendTransaction({ to: arbitrator.address, value: 10n ** 18n })).wait();

const step = (m) => console.log('  ✓', m);

// --- token
const tokenFactory = new ContractFactory(artifacts.MockINR.abi, artifacts.MockINR.bytecode, deployer);
const tokenC = await tokenFactory.deploy();
await tokenC.waitForDeployment();
const token = await tokenC.getAddress();
await chain.claimFaucet(client, token);
assert.equal(await chain.getInrBalance(provider, token, client.address), 10000);
step('faucet gives the client ₹10,000');

const params = (n) => ({
  freelancer: freelancer.address, arbitrator: arbitrator.address, token,
  reviewPeriod: 600, appealWindow: 300, specUri: 'escrowx://e2e',
  milestones: Array.from({ length: n }, (_, i) => ({ amount: 1500.5 + i * 1000 }))
});

// --- happy path: fund -> submit -> approve
let { address: escrow } = await chain.deployEscrow(client, params(2));
const info = await chain.readEscrowInfo(provider, escrow);
assert.equal(info.client, client.address);
assert.deepEqual(info.amounts, [1500.5, 2500.5]);
step('escrow deployed; on-chain amounts match (₹1500.50, ₹2500.50)');

const fund = await chain.fundMilestone(client, escrow, token, 0);
assert.ok(await chain.verifyTxTo(provider, fund.txHash, escrow));
assert.equal((await chain.readMilestone(provider, escrow, 0)).statusName, 'FUNDED');
assert.equal(await chain.getInrBalance(provider, token, escrow), 1500.5);
step('client funded milestone 0 (approve + fund), ₹1500.50 held in escrow');

await assert.rejects(chain.submitMilestone(client, escrow, 0, 'x'));
step('client cannot submit work (access control)');
await chain.submitMilestone(freelancer, escrow, 0, 'ipfs://proof');
assert.equal((await chain.readMilestone(provider, escrow, 0)).statusName, 'SUBMITTED');
await chain.approveMilestone(client, escrow, 0);
assert.equal(await chain.getInrBalance(provider, token, freelancer.address), 1500.5);
step('freelancer submitted, client approved, freelancer received ₹1500.50');

// --- dispute path: raise -> AI ruling -> appeal -> secondary -> finalize
await chain.fundMilestone(client, escrow, token, 1);
await chain.submitMilestone(freelancer, escrow, 1, 'ipfs://proof2');
await chain.raiseDispute(client, escrow, 1, 'dispute://1');
assert.equal((await chain.readMilestone(provider, escrow, 1)).statusName, 'DISPUTED');
await assert.rejects(chain.submitRuling(client, escrow, 1, client.address, 90, 'x'));
await chain.submitRuling(arbitrator, escrow, 1, freelancer.address, 90, 'dispute://1');
let r = await chain.readRuling(provider, escrow, 1);
assert.equal(r.confidence, 90); assert.equal(r.appealed, false);
await assert.rejects(chain.finalizeRuling(client, escrow, 1));
step('arbitrator ruled (90%); finalize blocked during appeal window');
await chain.appealRuling(client, escrow, 1);
assert.equal((await chain.readRuling(provider, escrow, 1)).appealed, true);
await chain.submitSecondaryRuling(arbitrator, escrow, 1, client.address, 'dispute://1/secondary');
const before = await chain.getInrBalance(provider, token, client.address);
await chain.finalizeRuling(freelancer, escrow, 1);
assert.equal((await chain.readMilestone(provider, escrow, 1)).statusName, 'REFUNDED');
assert.equal(await chain.getInrBalance(provider, token, client.address), before + 2500.5);
step('appeal -> secondary ruling overturned it -> client refunded ₹2500.50');

// --- timeout claim + cancel refund
({ address: escrow } = await chain.deployEscrow(client, params(2)));
await chain.fundMilestone(client, escrow, token, 0);
await chain.submitMilestone(freelancer, escrow, 0, 'ipfs://p');
await assert.rejects(chain.claimAfterTimeout(freelancer, escrow, 0));
await provider.send('evm_increaseTime', [601]); await provider.send('evm_mine', []);
await chain.claimAfterTimeout(freelancer, escrow, 0);
assert.equal((await chain.readMilestone(provider, escrow, 0)).statusName, 'RELEASED');
step('freelancer claimed after the review period expired');
await chain.fundMilestone(client, escrow, token, 1);
await chain.cancelMilestone(client, escrow, 1);
assert.equal((await chain.readMilestone(provider, escrow, 1)).statusName, 'CANCELLED');
step('client cancelled a funded milestone and was refunded');

console.log('\nAll on-chain flows passed.');
