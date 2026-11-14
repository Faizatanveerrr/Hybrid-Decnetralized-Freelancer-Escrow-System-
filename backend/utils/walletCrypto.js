import crypto from 'crypto';

/**
 * AES-256-GCM encryption for managed-wallet private keys.
 * The key is derived from WALLET_ENCRYPTION_KEY. LOSING THAT VALUE MEANS LOSING
 * ACCESS TO EVERY MANAGED WALLET - back it up, and never commit it.
 */
const MIN_LENGTH = 16;
let cached = { raw: '', key: null };

export const isEncryptionConfigured = () => (process.env.WALLET_ENCRYPTION_KEY || '').length >= MIN_LENGTH;

const derivedKey = () => {
  const raw = process.env.WALLET_ENCRYPTION_KEY || '';
  if (raw.length < MIN_LENGTH) throw new Error('WALLET_ENCRYPTION_KEY is not set (run `npm run wallet:new`).');
  if (cached.raw !== raw) cached = { raw, key: crypto.scryptSync(raw, 'escrowx-managed-wallet-v1', 32) };
  return cached.key;
};

export const encryptSecret = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join('.');
};

export const decryptSecret = (blob) => {
  const [version, iv, tag, data] = String(blob || '').split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable wallet key.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
};

// ---------------------------------------------------------------------------
// File encryption for IPFS uploads. Anything on IPFS is public to whoever has
// the hash, so files are encrypted first; only the platform can decrypt them,
// and only for project participants. Key: IPFS_ENCRYPTION_KEY, else WALLET_ENCRYPTION_KEY.
// Blob layout: [1 byte version][12 bytes IV][16 bytes auth tag][ciphertext]
// ---------------------------------------------------------------------------
const fileSecret = () => process.env.IPFS_ENCRYPTION_KEY || process.env.WALLET_ENCRYPTION_KEY || '';
let fileKeyCache = { raw: '', key: null };

export const isFileEncryptionConfigured = () => fileSecret().length >= MIN_LENGTH;

const fileKey = () => {
  const raw = fileSecret();
  if (raw.length < MIN_LENGTH) throw new Error('No encryption key configured for file storage (run `npm run wallet:new`).');
  if (fileKeyCache.raw !== raw) fileKeyCache = { raw, key: crypto.scryptSync(raw, 'escrowx-ipfs-files-v1', 32) };
  return fileKeyCache.key;
};

export const encryptBytes = (buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fileKey(), iv);
  const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), data]);
};

export const decryptBytes = (blob) => {
  if (!blob || blob.length < 30 || blob[0] !== 1) throw new Error('Unreadable file (wrong format).');
  const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey(), blob.subarray(1, 13));
  decipher.setAuthTag(blob.subarray(13, 29));
  return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]);
};
