import crypto from 'crypto';

const PREFIX = 'scrypt$';

export const hashPassword = (plain) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${PREFIX}${salt}$${hash}`;
};

export const isHashed = (stored) => typeof stored === 'string' && stored.startsWith(PREFIX);

const safeEqual = (a, b) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

export const verifyPassword = (plain, stored) => {
  if (!stored) return false;
  if (!isHashed(stored)) {
    // Legacy plaintext record: compare, caller should upgrade the hash.
    return safeEqual(String(plain), stored);
  }
  const [, salt, hash] = stored.split('$');
  const candidate = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return safeEqual(candidate, hash);
};
