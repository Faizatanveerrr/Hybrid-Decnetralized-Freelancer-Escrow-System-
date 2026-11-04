/**
 * One-time secrets setup:  npm run wallet:new
 *  - ARBITRATOR_PRIVATE_KEY: the platform wallet that signs AI rulings (needs a little Sepolia ETH)
 *  - JWT_SECRET:             signs login tokens
 *  - WALLET_ENCRYPTION_KEY:  encrypts the private keys of platform-managed user wallets
 * Existing values are never overwritten (use --force for the arbitrator key only).
 */
import crypto from 'node:crypto';
import { Wallet } from 'ethers';
import { readEnv, setEnv } from './envfile.mjs';

const env = readEnv();

if (!env.JWT_SECRET) {
  setEnv('JWT_SECRET', crypto.randomBytes(32).toString('hex'));
  console.log('Created JWT_SECRET');
}
if (!env.WALLET_ENCRYPTION_KEY) {
  setEnv('WALLET_ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
  console.log('Created WALLET_ENCRYPTION_KEY');
  console.log('  !! Back it up. If it is lost, every managed wallet becomes unreadable.');
}

if (env.ARBITRATOR_PRIVATE_KEY && !process.argv.includes('--force')) {
  console.log('ARBITRATOR_PRIVATE_KEY already set. Arbitrator address:', new Wallet(env.ARBITRATOR_PRIVATE_KEY).address);
  process.exit(0);
}
const wallet = Wallet.createRandom();
setEnv('ARBITRATOR_PRIVATE_KEY', wallet.privateKey);
console.log('Created arbitrator wallet and saved ARBITRATOR_PRIVATE_KEY to .env');
console.log('Arbitrator address:', wallet.address);
console.log('\nNext: send this address Sepolia test ETH from a faucet, e.g.');
console.log('  https://sepolia-faucet.pk910.de  (mining faucet, no account)');
console.log('  https://cloud.google.com/application/web3/faucet/ethereum/sepolia');
console.log('It pays gas for AI rulings and tops up users\' wallets, so give it a few tenths of an ETH.');
console.log('Never commit .env or share these keys.');
