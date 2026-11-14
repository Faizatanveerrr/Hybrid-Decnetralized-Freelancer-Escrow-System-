/**
 * IPFS storage for deliverables, evidence, job specs and AI rulings.
 *
 * Every file is ENCRYPTED before it is stored, because content on IPFS is
 * readable by anyone who knows its hash. The hash (CID) that goes on the
 * blockchain therefore proves the file was not changed (integrity) without
 * exposing it (confidentiality); the platform decrypts it only for project
 * participants.
 *
 * Providers (IPFS_PROVIDER, auto-detected if unset):
 *   kubo   - an IPFS node's HTTP API (IPFS_API_URL), e.g. the one in docker-compose
 *   pinata - Pinata's hosted pinning service (PINATA_JWT)
 *   local  - stored in MongoDB, NOT on the IPFS network (demo without a node)
 *   none   - disabled
 */
import crypto from 'crypto';
import IpfsObject from '../models/IpfsObject.js';
import IpfsBlob from '../models/IpfsBlob.js';
import { encryptBytes, decryptBytes, isFileEncryptionConfigured } from '../utils/walletCrypto.js';

const TIMEOUT_MS = 30000;

export const getProvider = () => {
  if (process.env.IPFS_PROVIDER) return process.env.IPFS_PROVIDER;
  if (process.env.IPFS_API_URL) return 'kubo';
  if (process.env.PINATA_JWT) return 'pinata';
  return 'local';
};

export const isIpfsEnabled = () => getProvider() !== 'none' && isFileEncryptionConfigured();
export const getMaxBytes = () => Math.round(Number(process.env.IPFS_MAX_MB || 10) * 1024 * 1024);

export const getIpfsConfig = () => ({
  enabled: isIpfsEnabled(),
  provider: getProvider(),
  simulated: getProvider() === 'local',
  maxMb: Number(process.env.IPFS_MAX_MB || 10)
});

/** The URI stored on-chain. The local provider is labelled honestly: it is not on IPFS. */
export const uriFor = (cid) => (getProvider() === 'local' ? `escrowx-local://${cid}` : `ipfs://${cid}`);
export const cidFromUri = (uri) => {
  const m = String(uri || '').match(/^(?:ipfs|escrowx-local):\/\/([a-zA-Z0-9]{20,100})$/);
  return m ? m[1] : null;
};
export const isValidCid = (cid) => /^[a-zA-Z0-9]{20,100}$/.test(String(cid || ''));

// --- CIDv1 (raw codec, sha2-256, base32) -- the same bytes IPFS produces for a single block
const base32 = (buf) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
};
export const rawCid = (buffer) =>
  'b' + base32(Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), crypto.createHash('sha256').update(buffer).digest()]));

// ----------------------------------------------------------------- providers
const kuboApi = () => (process.env.IPFS_API_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');

const putKubo = async (buffer, filename) => {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  // CIDv1 + raw leaves + 1 MiB chunks (the largest block IPFS allows), pinned so it is kept.
  const res = await fetch(`${kuboApi()}/api/v0/add?cid-version=1&raw-leaves=true&chunker=size-1048576&pin=true`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`IPFS node rejected the upload (${res.status}): ${(await res.text()).slice(0, 120)}`);
  const lines = (await res.text()).trim().split('\n');
  return JSON.parse(lines[lines.length - 1]).Hash; // last line = the root of the added file
};
const getKubo = async (cid) => {
  const res = await fetch(`${kuboApi()}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`IPFS node could not read ${cid} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
};

const pinataBase = () => (process.env.PINATA_API_BASE || 'https://api.pinata.cloud').replace(/\/$/, '');
const pinataGateway = () => (process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud').replace(/\/$/, '');
const putPinata = async (buffer, filename) => {
  if (!process.env.PINATA_JWT) throw new Error('PINATA_JWT is not set.');
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  const res = await fetch(`${pinataBase()}/pinning/pinFileToIPFS`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.IpfsHash) throw new Error(`Pinata upload failed (${res.status}): ${body?.error?.reason || body?.error || ''}`);
  return body.IpfsHash;
};
const getPinata = async (cid) => {
  const res = await fetch(`${pinataGateway()}/ipfs/${encodeURIComponent(cid)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Gateway could not read ${cid} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
};

const putLocal = async (buffer) => {
  const cid = rawCid(buffer);
  try { await IpfsBlob.create({ cid, data: buffer }); } catch (e) { if (e.code !== 11000) throw e; }
  return cid;
};
const getLocal = async (cid) => {
  const blob = await IpfsBlob.findOne({ cid });
  if (!blob) throw new Error(`Local store has no file ${cid}`);
  return blob.data;
};

/** Store raw bytes; returns the CID. */
export const putBytes = (buffer, filename = 'file.bin') => {
  switch (getProvider()) {
    case 'kubo': return putKubo(buffer, filename);
    case 'pinata': return putPinata(buffer, filename);
    case 'local': return putLocal(buffer);
    default: throw new Error('IPFS storage is disabled.');
  }
};
/** Fetch raw bytes by CID. */
export const getBytes = (cid) => {
  switch (getProvider()) {
    case 'kubo': return getKubo(cid);
    case 'pinata': return getPinata(cid);
    case 'local': return getLocal(cid);
    default: throw new Error('IPFS storage is disabled.');
  }
};

// ------------------------------------------------------------ encrypted store
/** Encrypt, store on IPFS, and record who may read it. */
export const storeEncrypted = async ({ buffer, projectId, uploadedBy, kind, name = 'file', mime = 'application/octet-stream' }) => {
  if (!isIpfsEnabled()) throw new Error('IPFS storage is not enabled on this server.');
  const cid = await putBytes(encryptBytes(buffer), `${kind}.enc`); // generic name: the real one stays private
  await IpfsObject.create({ cid, projectId, uploadedBy, kind, name, mime, size: buffer.length, provider: getProvider() });
  return { cid, uri: uriFor(cid), name, size: buffer.length, kind, provider: getProvider() };
};

/** Fetch from IPFS and decrypt. Throws if the bytes were tampered with (GCM check). */
export const readDecrypted = async (cid) => decryptBytes(await getBytes(cid));

export const storeJson = (object, meta) =>
  storeEncrypted({ buffer: Buffer.from(JSON.stringify(object, null, 2)), mime: 'application/json', ...meta });

// ------------------------------------------------------------ document builders
/** The agreed job terms, stored on IPFS and referenced by the escrow contract. */
export const buildSpec = (project, { clientWallet, freelancerWallet }) => ({
  type: 'escrowx-job-spec',
  version: 1,
  projectId: String(project._id),
  title: project.title,
  description: project.description,
  currency: 'INR',
  client: clientWallet,
  freelancer: freelancerWallet,
  milestones: (project.milestones || []).map((m, i) => ({
    index: i, title: m.title, description: m.description || '', amount: m.amount, acceptanceCriteria: m.acceptanceCriteria || ''
  })),
  createdAt: new Date().toISOString()
});

/** The AI arbitrator's reasoning, stored on IPFS and referenced on-chain as the ruling URI. */
export const buildRulingRecord = (dispute, ruling, round) => ({
  type: 'escrowx-ruling',
  version: 1,
  round,
  disputeId: String(dispute._id),
  projectId: String(dispute.projectId),
  milestoneId: String(dispute.milestoneId),
  winner: ruling.winner,
  confidence: ruling.confidence,
  reasoning: ruling.reasoning,
  criteriaAssessment: ruling.criteriaAssessment || [],
  keyFindings: ruling.keyFindings || [],
  missingInformation: ruling.missingInformation || [],
  execution: ruling.execution || null,
  arbitrator: { source: ruling.source || 'unknown', model: ruling.model || '' },
  claims: { client: dispute.clientClaim || '', freelancer: dispute.freelancerClaim || '' },
  evidence: (dispute.evidence || []).map((e) => ({ by: e.submittedBy, name: e.name, description: e.description, cid: e.cid || '' })),
  createdAt: new Date().toISOString()
});
