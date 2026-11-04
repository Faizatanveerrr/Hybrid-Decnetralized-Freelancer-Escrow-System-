/**
 * Switch OFF the token's public test faucet (required before live payouts).
 *   npm run token:lock-faucet            # turn it off
 *   npm run token:lock-faucet -- --on    # turn it back on
 * Must be run with the token owner's key (the arbitrator key by default).
 */
import { JsonRpcProvider, Wallet } from 'ethers';
import * as chain from '../shared/chainCore.js';
import { readEnv } from './envfile.mjs';

const env = readEnv();
const key = env.MINTER_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY || env.ARBITRATOR_PRIVATE_KEY;
if (!env.SEPOLIA_RPC_URL || !env.TOKEN_ADDRESS || !key) {
  console.error('Set SEPOLIA_RPC_URL and TOKEN_ADDRESS in .env, and the owner key (ARBITRATOR_PRIVATE_KEY / MINTER_PRIVATE_KEY).');
  process.exit(1);
}
const enable = process.argv.includes('--on');
const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL, undefined, { cacheTimeout: -1 });
const wallet = new Wallet(key, provider);

const current = await chain.isFaucetEnabled(provider, env.TOKEN_ADDRESS);
if (current === null) {
  console.error('This token was deployed before the faucet switch existed. Run `npm run deploy:token` to deploy a new one.');
  process.exit(1);
}
if (current === enable) {
  console.log(`Faucet is already ${enable ? 'ON' : 'OFF'}.`);
  process.exit(0);
}
const { txHash } = await chain.setFaucetEnabled(wallet, env.TOKEN_ADDRESS, enable);
console.log(`Faucet is now ${enable ? 'ON' : 'OFF'} (tx ${txHash}).`);
