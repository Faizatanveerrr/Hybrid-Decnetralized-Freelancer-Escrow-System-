/**
 * IPFS service checks. Needs: MongoDB on 127.0.0.1:27017 and an IPFS node
 * (e.g. `ipfs daemon`); pass its API URL as IPFS_API_URL (default http://127.0.0.1:5001).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const svc = await import(ROOT + '/backend/services/ipfsService.js');
const { decryptBytes } = await import(ROOT + '/backend/utils/walletCrypto.js');
const kubo = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

await mongoose.connect(`mongodb://127.0.0.1:27017/ipfs_unit_${Date.now()}`);
const pid = new mongoose.Types.ObjectId(), uid = new mongoose.Types.ObjectId();
process.env.WALLET_ENCRYPTION_KEY = 'ipfs-unit-test-key-0123456789abcdef';

// ---------- config / safety
process.env.IPFS_PROVIDER = 'none'; assert.equal(svc.getIpfsConfig().enabled, false);
await assert.rejects(svc.storeEncrypted({ buffer: Buffer.from('x'), projectId: pid, uploadedBy: uid, kind: 'evidence' }), /not enabled/);
process.env.IPFS_PROVIDER = 'kubo'; process.env.IPFS_API_URL = kubo;
const saved = process.env.WALLET_ENCRYPTION_KEY; delete process.env.WALLET_ENCRYPTION_KEY;
assert.equal(svc.isIpfsEnabled(), false);
await assert.rejects(svc.storeEncrypted({ buffer: Buffer.from('x'), projectId: pid, uploadedBy: uid, kind: 'evidence' }), /not enabled/);
process.env.WALLET_ENCRYPTION_KEY = saved;
assert.equal(svc.isIpfsEnabled(), true);
ok('disabled when IPFS_PROVIDER=none or when no encryption key exists (never uploads plaintext)');

// ---------- real Kubo node
const add = async (buf, extra = '') => { const f = new FormData(); f.append('file', new Blob([buf]), 'f'); const r = await fetch(`${kubo}/api/v0/add?cid-version=1&raw-leaves=true${extra}`, { method: 'POST', body: f }); return JSON.parse((await r.text()).trim().split('\n').pop()).Hash; };
const small = crypto.randomBytes(100 * 1024);
assert.equal(svc.rawCid(small), await add(small, '&chunker=size-1048576'));
assert.equal(svc.rawCid(Buffer.from('hello escrowx')), 'bafkreifzcq74fi76u67dp3t4ukadbf2oxruf4smarbpqr5wtjuru72koau');
ok('self-computed CIDv1 equals the CID a real IPFS node (Kubo) assigns');

const secret = Buffer.from('CONFIDENTIAL deliverable: final logo files v3');
const stored = await svc.storeEncrypted({ buffer: secret, projectId: pid, uploadedBy: uid, kind: 'deliverable', name: 'logo.zip', mime: 'application/zip' });
assert.match(stored.uri, /^ipfs:\/\/b/); assert.equal(svc.cidFromUri(stored.uri), stored.cid);
const onNode = await svc.getBytes(stored.cid);
assert.ok(!onNode.includes(Buffer.from('CONFIDENTIAL')));
assert.deepEqual(await svc.readDecrypted(stored.cid), secret);
const gw = await (await fetch(`${kubo}/api/v0/pin/ls?arg=${stored.cid}&type=recursive`, { method: 'POST' })).json();
assert.ok(gw.Keys[stored.cid]);
ok('real node: stored bytes are ciphertext (no plaintext visible), decrypt returns the original, file is pinned');

const bad = Buffer.from(onNode); bad[bad.length - 1] ^= 1;
assert.throws(() => decryptBytes(bad)); const badCid = await svc.putBytes(bad);
await assert.rejects(svc.readDecrypted(badCid));
ok('tampered ciphertext is detected and refused');

const big = crypto.randomBytes(3 * 1024 * 1024 + 123);
const bigStored = await svc.storeEncrypted({ buffer: big, projectId: pid, uploadedBy: uid, kind: 'evidence', name: 'video.mp4' });
assert.ok((await svc.readDecrypted(bigStored.cid)).equals(big));
ok('3 MB file (multi-block DAG on the node) round-trips intact');

const json = await svc.storeJson({ hello: 'ruling' }, { projectId: pid, uploadedBy: uid, kind: 'ruling', name: 'ruling.json' });
assert.deepEqual(JSON.parse((await svc.readDecrypted(json.cid)).toString()), { hello: 'ruling' });
ok('JSON documents (rulings / specs) store and read back');

process.env.IPFS_API_URL = 'http://127.0.0.1:1';
await assert.rejects(svc.putBytes(Buffer.from('x')), /./); process.env.IPFS_API_URL = kubo;
ok('unreachable node gives an error instead of hanging');

// ---------- Pinata (fake server speaking the documented API)
const pinned = new Map(); let seenAuth = '';
const fake = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', async () => {
    if (req.method === 'POST' && req.url === '/pinning/pinFileToIPFS') {
      seenAuth = req.headers.authorization || '';
      const body = Buffer.concat(chunks); const start = body.indexOf('\r\n\r\n') + 4; const end = body.lastIndexOf('\r\n--');
      const data = body.subarray(start, end); const cid = svc.rawCid(data); pinned.set(cid, data);
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ IpfsHash: cid, PinSize: data.length, Timestamp: new Date().toISOString() }));
    }
    const m = req.url.match(/^\/ipfs\/(.+)$/);
    if (m && pinned.has(m[1])) { res.writeHead(200); return res.end(pinned.get(m[1])); }
    res.writeHead(404); res.end('{}');
  });
}).listen(5598);
Object.assign(process.env, { IPFS_PROVIDER: 'pinata', PINATA_JWT: 'jwt-123', PINATA_API_BASE: 'http://127.0.0.1:5598', PINATA_GATEWAY_URL: 'http://127.0.0.1:5598' });
const ps = await svc.storeEncrypted({ buffer: secret, projectId: pid, uploadedBy: uid, kind: 'deliverable', name: 'a.txt' });
assert.equal(seenAuth, 'Bearer jwt-123'); assert.deepEqual(await svc.readDecrypted(ps.cid), secret);
fake.close(); ok('Pinata provider: Bearer JWT upload, IpfsHash used as CID, read back through the gateway');

// ---------- local (demo) provider
delete process.env.PINATA_JWT; delete process.env.IPFS_API_URL; process.env.IPFS_PROVIDER = 'local';
const ls = await svc.storeEncrypted({ buffer: secret, projectId: pid, uploadedBy: uid, kind: 'deliverable', name: 'a.txt' });
assert.match(ls.uri, /^escrowx-local:\/\//); assert.equal(svc.getIpfsConfig().simulated, true);
assert.deepEqual(await svc.readDecrypted(ls.cid), secret);
ok('local provider: works without a node and is labelled escrowx-local:// (never pretends to be IPFS)');
console.log(`\nIPFS SERVICE PASSED (${n} checks)`);
await mongoose.disconnect(); process.exit(0);
