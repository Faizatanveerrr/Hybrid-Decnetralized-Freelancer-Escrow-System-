/**
 * Deploy the MockINR token to the network in SEPOLIA_RPC_URL and save
 * TOKEN_ADDRESS to .env.
 *   npm run deploy:token
 * Uses DEPLOYER_PRIVATE_KEY, or the arbitrator key if that is not set. The
 * wallet needs a little Sepolia ETH for gas.
 */
import { JsonRpcProvider, Wallet, ContractFactory, formatEther } from 'ethers';
import artifacts from '../shared/artifacts.json' with { type: 'json' };
import { readEnv, setEnv } from './envfile.mjs';

const env = readEnv();
const rpc = env.SEPOLIA_RPC_URL;
const key = env.DEPLOYER_PRIVATE_KEY || env.ARBITRATOR_PRIVATE_KEY;
if (!rpc) { console.error('Set SEPOLIA_RPC_URL in .env first.'); process.exit(1); }
if (!key) { console.error('Run `npm run wallet:new` first (or set DEPLOYER_PRIVATE_KEY).'); process.exit(1); }

const provider = new JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
const wallet = new Wallet(key, provider);
const net = await provider.getNetwork();
const balance = await provider.getBalance(wallet.address);
console.log(`Network: chain id ${net.chainId}`);
console.log(`Deployer: ${wallet.address} (${formatEther(balance)} ETH)`);
if (balance === 0n) {
  console.error('\nThis wallet has no ETH for gas. Get Sepolia test ETH from a faucet and retry.');
  process.exit(1);
}

const factory = new ContractFactory(artifacts.MockINR.abi, artifacts.MockINR.bytecode, wallet);
const token = await factory.deploy();
console.log('Deploying MockINR... tx', token.deploymentTransaction().hash);
await token.waitForDeployment();
const address = await token.getAddress();

setEnv('TOKEN_ADDRESS', address);
setEnv('CHAIN_ID', String(net.chainId));
console.log(`\nMockINR deployed at ${address}`);
console.log('Saved TOKEN_ADDRESS and CHAIN_ID to .env - restart `npm run dev`.');
if (net.chainId === 11155111n) console.log(`View it: https://sepolia.etherscan.io/address/${address}`);
