/**
 * Google sign-in and password reset, with the database stubbed (no MongoDB needed).
 * Run: node tests/integration/auth-unit.mjs
 */
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.WALLET_ENCRYPTION_KEY = 'ab'.repeat(32);
delete process.env.GOOGLE_CLIENT_ID; delete process.env.SMTP_HOST; process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const User = (await import(ROOT + '/backend/models/User.js')).default;
const ctl = await import(ROOT + '/backend/controllers/authController.js');
const { setGoogleVerifierForTests } = await import(ROOT + '/backend/services/googleAuth.js');
const { hashPassword, verifyPassword } = await import(ROOT + '/backend/utils/password.js');
const { signToken } = await import(ROOT + '/backend/utils/token.js');
const { getAuthUser } = await import(ROOT + '/backend/middleware/authHelper.js');
let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
const log = console.log; const quiet = (fn) => async (...a) => { const o = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(...a); } finally { console.log = o; console.error = e; } };

// ---- in-memory users
const users = [];
const matches = (u, q) => {
  if (q.$or) return q.$or.some((c) => matches(u, c));
  return Object.entries(q).every(([k, v]) => String(u[k]) === String(v));
};
User.findOne = (q) => { const u = users.find((x) => matches(x, q)) || null; const p = Promise.resolve(u); p.select = () => p; return p; };
User.findById = async (id) => users.find((x) => String(x._id) === String(id)) || null;
User.create = async (doc) => { const u = new User(doc); await u.validate(); u.save = async function () { await this.validate(); return this; }; users.push(u); return u; };
const addUser = async (o) => User.create({ name: 'Anna Lee', email: 'anna@example.com', password: hashPassword('Old#Passw0rd'), ...o });

const call = async (fn, body = {}, extra = {}) => {
  let out; const res = { status(c) { this.code = c; return this; }, json(b) { out = { code: this.code || 200, ...JSON.parse(JSON.stringify(b)) }; } };
  await fn({ body, headers: {}, ip: '1.1.1.1', ...extra }, res); return out;
};

// ================= Google sign-in
const g = quiet(call);
assert.equal((await g(ctl.googleLogin, { credential: 'x' })).code, 503);
assert.equal((await g(ctl.googleLogin, {})).code, 400);
ok('Google sign-in reports "not configured" instead of crashing; missing credential rejected');

setGoogleVerifierForTests(async (cred) => { if (cred === 'bad') throw new Error('bad signature'); return { sub: 'g-123', email: 'New.Person@Gmail.com', emailVerified: cred !== 'unverified', name: 'New Person', picture: 'http://p/x.png' }; });
assert.equal((await g(ctl.googleLogin, { credential: 'bad' })).code, 401);
assert.equal((await g(ctl.googleLogin, { credential: 'unverified' })).code, 401);
const needs = await g(ctl.googleLogin, { credential: 'good' });
assert.equal(needs.needsRole, true); assert.equal(needs.email, 'new.person@gmail.com'); assert.equal(users.length, 0);
ok('bad / unverified Google tokens refused; a new person is asked for a role first (nothing created yet)');

const created = await g(ctl.googleLogin, { credential: 'good', role: 'freelancer' });
assert.equal(created.code, 201); assert.equal(created.user.role, 'freelancer'); assert.equal(created.user.googleId, 'g-123');
assert.ok(created.token); assert.equal(created.user.password, undefined);
assert.equal(users.length, 1);
const again = await g(ctl.googleLogin, { credential: 'good' });
assert.equal(again.code, 200); assert.equal(again.user.email, 'new.person@gmail.com'); assert.equal(users.length, 1);
ok('first Google login creates the account with the chosen role; next time it simply signs in');

users.length = 0;
const local = await addUser({ email: 'new.person@gmail.com', name: 'New Person' });
const linked = await g(ctl.googleLogin, { credential: 'good', role: 'client' });
assert.equal(linked.code, 200); assert.equal(users.length, 1); assert.equal(local.googleId, 'g-123'); assert.equal(linked.user.role, 'client');
ok('an existing email/password account is linked (same verified email), role not overwritten');

// ================= forgot / reset
users.length = 0;
const anna = await addUser({});
const unknown = await g(ctl.forgotPassword, { email: 'nobody@example.com' });
const known = await g(ctl.forgotPassword, { email: 'Anna@Example.com' });
assert.equal(unknown.message, known.message); assert.equal(unknown.devResetLink, undefined);
assert.ok(known.devResetLink.includes('/reset-password?token='));
assert.equal((await g(ctl.forgotPassword, { email: 'bad' })).code, 400);
const token = new URL(known.devResetLink).searchParams.get('token');
assert.ok(anna.resetTokenHash && anna.resetTokenHash !== token && anna.resetTokenExpires > new Date());
ok('forgot-password answers identically for unknown and known emails; only a hash of the token is stored');

const reset = (body) => g(ctl.resetPassword, { email: 'anna@example.com', ...body });
assert.equal((await reset({ token: 'wrong', password: 'New#Passw0rd9' })).code, 400);
assert.equal((await reset({ token, password: 'weak' })).code, 400);
assert.equal((await reset({ token, password: 'Anna#Lee12345' })).code, 400);   // contains her name/email
const oldSession = signToken(anna._id);
anna.passwordChangedAt = undefined;
const done = await reset({ token, password: 'Fresh#Pass9876' });
assert.equal(done.code, 200); assert.ok(verifyPassword('Fresh#Pass9876', anna.password)); assert.ok(!verifyPassword('Old#Passw0rd', anna.password));
assert.equal(anna.resetTokenHash, undefined);
assert.equal((await reset({ token, password: 'Another#Pass1234' })).code, 400);   // single use
ok('reset needs the right token, enforces the password policy, changes the password, and works only once');

const req = (t) => ({ headers: { authorization: 'Bearer ' + t } });
assert.ok(await getAuthUser(req(oldSession)));                       // same second: still valid
anna.passwordChangedAt = new Date(Date.now() + 5000);
assert.equal(await getAuthUser(req(oldSession)), null);             // sessions from before the change are dead
anna.passwordChangedAt = new Date(Date.now() - 5000);
assert.ok(await getAuthUser(req(oldSession)));
ok('sessions opened before a password change are signed out');

anna.resetTokenHash = 'x'; anna.resetTokenExpires = new Date(Date.now() - 1000);
assert.equal((await reset({ token: 'x', password: 'Fresh#Pass9876' })).code, 400);
ok('expired reset links are refused');

let last; for (let i = 0; i < 6; i++) last = await g(ctl.forgotPassword, { email: 'spam@example.com' }, { ip: '9.9.9.' + i });
assert.equal(last.code, 429);
ok('repeated reset requests for one address are rate limited (429)');

const cfg = await call(ctl.getAuthConfig); assert.equal(cfg.googleClientId, ''); assert.equal(cfg.passwordResetEmail, false);
process.env.GOOGLE_CLIENT_ID = 'abc.apps.googleusercontent.com';
assert.equal((await call(ctl.getAuthConfig)).googleClientId, 'abc.apps.googleusercontent.com');
ok('public config exposes only the Google client id and whether e-mail is set up');

log(`\n${n} checks passed`); process.exit(0);
