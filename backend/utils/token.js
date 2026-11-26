import crypto from 'crypto';

/**
 * Minimal HS256 JWT (no dependency). The secret comes from JWT_SECRET; if it
 * is missing a random per-process secret is used, which is fine for a quick
 * demo but logs everyone out whenever the server restarts.
 */
let ephemeralSecret = null;
let warned = false;

const secret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!warned) {
    console.warn('JWT_SECRET is not set - using a temporary secret. Run `npm run wallet:new` to create one.');
    warned = true;
  }
  ephemeralSecret ||= crypto.randomBytes(32).toString('hex');
  return ephemeralSecret;
};

const b64 = (value) => Buffer.from(value).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export const signToken = (userId, ttlSeconds = 7 * 24 * 3600) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub: String(userId), iat: now, exp: now + ttlSeconds }));
  return `${head}.${body}.${sign(`${head}.${body}`)}`;
};

/** Returns { sub, iat } for a valid, unexpired token, else null. */
export const verifyTokenPayload = (token) => {
  try {
    const [head, body, signature] = String(token || '').split('.');
    if (!head || !body || !signature) return null;
    const expected = Buffer.from(sign(`${head}.${body}`));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub, iat: payload.iat || 0 };
  } catch {
    return null;
  }
};

/** Returns the user id (sub) for a valid, unexpired token, else null. */
export const verifyToken = (token) => verifyTokenPayload(token)?.sub || null;
