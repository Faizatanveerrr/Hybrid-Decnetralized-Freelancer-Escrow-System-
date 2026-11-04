import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';

/**
 * Developer-only integration tests: boot the REAL backend and drive it over HTTP.
 * Needs a MongoDB on 127.0.0.1:27017 (a throwaway database is created per run)
 * and a local Ethereum node on 127.0.0.1:8545 (`npx hardhat node` or `anvil`).
 * Payment/payout gateways are replaced by a local fake. Run:  npm run test:integration
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const artifacts = (await import(ROOT + '/shared/artifacts.json', { with: { type: 'json' } })).default;
export const core = await import(ROOT + '/shared/chainCore.js');
export const RPC = 'http://127.0.0.1:8545';
export const provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
export const platform = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
export const RZP_SECRET = 'fake_secret';

// ---------------------------------------------------------------- fake gateway
export const gw = { orders: new Map(), payouts: new Map(), payoutLog: [], failPayouts: false, paidOrders: new Set(), seq: 0 };
export const startFakeRazorpay = (port) => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const json = body ? JSON.parse(body) : {};
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Basic ')) return send(401, { error: { description: 'no auth' } });
      if (req.method === 'POST' && req.url === '/orders') {
        const id = `order_${++gw.seq}`;
        const o = { id, amount: json.amount, currency: json.currency, status: 'created', amount_paid: 0 };
        gw.orders.set(id, o); return send(200, o);
      }
      if (req.method === 'GET' && req.url.startsWith('/orders/')) {
        const o = gw.orders.get(req.url.split('/')[2]);
        if (!o) return send(404, { error: { description: 'not found' } });
        if (gw.paidOrders.has(o.id)) { o.status = 'paid'; o.amount_paid = o.amount; }
        return send(200, o);
      }
      if (req.method === 'POST' && req.url === '/payouts') {
        gw.payoutLog.push({ headers: req.headers, body: json });
        if (gw.failPayouts) return send(400, { error: { description: 'Insufficient balance in RazorpayX account' } });
        const key = req.headers['x-payout-idempotency'];
        for (const p of gw.payouts.values()) if (p.key === key) return send(200, p.entity);
        const id = `pout_${++gw.seq}`;
        const entity = { id, entity: 'payout', amount: json.amount, currency: 'INR', status: 'processing', utr: null, mode: json.mode, purpose: json.purpose, failure_reason: null };
        gw.payouts.set(id, { key, entity }); return send(200, entity);
      }
      if (req.method === 'GET' && req.url.startsWith('/payouts/')) {
        const p = gw.payouts.get(req.url.split('/')[2]);
        return p ? send(200, p.entity) : send(404, { error: { description: 'not found' } });
      }
      send(404, { error: { description: 'unknown route ' + req.url } });
    });
  });
  server.listen(port, '127.0.0.1', () => resolve(server));
});

// ---------------------------------------------------------------- backend
export const startBackend = async (extraEnv = {}) => {
  const port = 5055;
  const env = {
    ...process.env, PORT: String(port), MONGODB_URI: `mongodb://127.0.0.1:27017/escrowx_it_${Date.now()}`,
    JWT_SECRET: 'it-jwt-secret', WALLET_ENCRYPTION_KEY: 'it-wallet-encryption-key-123456',
    SEPOLIA_RPC_URL: RPC, CHAIN_ID: '31337', ARBITRATOR_PRIVATE_KEY: platform.privateKey,
    REVIEW_PERIOD_SECONDS: '900', APPEAL_WINDOW_SECONDS: '300',
    RAZORPAY_KEY_ID: 'rzp_test_fake', RAZORPAY_KEY_SECRET: RZP_SECRET, RAZORPAY_API_BASE: 'http://127.0.0.1:5599',
    ...extraEnv
  };
  const child = spawn('node', ['backend/server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const h = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); if (h.connected) break; } catch {}
    if (i === 59) { console.log(log); throw new Error('backend did not start'); }
  }
  return { child, port, getLog: () => log, stop: () => child.kill() };
};

export const makeApi = (port) => async (method, path, { token, body } = {}) => {
  const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
};

export const deployToken = async () => {
  const f = new ContractFactory(artifacts.MockINR.abi, artifacts.MockINR.bytecode, platform);
  const t = await f.deploy(); await t.waitForDeployment(); return t.getAddress();
};

let passed = 0;
export const ok = (msg) => { passed++; console.log('  ✓', msg); };
export const count = () => passed;
export { assert, crypto };
