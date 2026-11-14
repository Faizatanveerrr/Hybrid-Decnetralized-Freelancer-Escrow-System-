/**
 * Project chat privacy + behaviour, with the database stubbed (no MongoDB needed).
 * Run: node tests/integration/messages-unit.mjs
 */
process.env.JWT_SECRET = 'x'.repeat(32);
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const User = (await import(ROOT + '/backend/models/User.js')).default;
const Project = (await import(ROOT + '/backend/models/Project.js')).default;
const Message = (await import(ROOT + '/backend/models/Message.js')).default;
const { signToken } = await import(ROOT + '/backend/utils/token.js');
const ctl = await import(ROOT + '/backend/controllers/messageController.js');
let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };
const oid = () => new mongoose.Types.ObjectId();

// ---- fake data
const anna = { _id: oid(), name: 'Anna' };      // client
const ben = { _id: oid(), name: 'Ben' };        // hired freelancer
const carl = { _id: oid(), name: 'Carl' };      // outsider
const dina = { _id: oid(), name: 'Dina' };      // applicant, not hired
const users = new Map([anna, ben, carl, dina].map((u) => [String(u._id), u]));
const P = { _id: oid(), title: 'Site', client: anna._id, clientName: 'Anna', freelancer: ben._id, freelancerName: 'Ben', status: 'ACTIVE' };
const OPEN = { _id: oid(), title: 'Open job', client: anna._id, clientName: 'Anna', freelancer: null, freelancerName: '', status: 'OPEN' };
const projects = new Map([P, OPEN].map((p) => [String(p._id), p]));

const store = [];
User.findById = async (id) => users.get(String(id)) || null;
Project.findById = async (id) => projects.get(String(id)) || null;
Message.create = async (doc) => { const m = { ...doc, _id: oid() }; store.push(m); return m; };
const match = (m, q) =>
  Object.entries(q).every(([k, v]) => {
    if (k === 'createdAt') return (!v.$gt || m.createdAt > v.$gt) && (!v.$lt || m.createdAt < v.$lt);
    if (k === 'sender') return v.$ne ? String(m.sender) !== String(v.$ne) : String(m.sender) === String(v);
    if (k === 'readBy') return v.$ne ? !(m.readBy || []).map(String).includes(String(v.$ne)) : (m.readBy || []).map(String).includes(String(v));
    return String(m[k]) === String(v);
  });
Message.find = (q) => {
  let rows = store.filter((m) => match(m, q));
  const chain = {
    sort(spec) { const [[k, dir]] = Object.entries(spec); rows = [...rows].sort((a, b) => (a[k] - b[k]) * dir); return chain; },
    limit(c) { rows = rows.slice(0, c); return chain; },
    select() { return chain; },
    then(res, rej) { return Promise.resolve(rows).then(res, rej); }
  };
  return chain;
};
Message.updateMany = async (q, upd) => { store.filter((m) => match(m, q)).forEach((m) => { m.readBy = [...(m.readBy || []), upd.$addToSet.readBy]; }); };
let projectQuery = null;
Project.find = (q) => { projectQuery = q; return { sort: async () => [P] }; };
Message.aggregate = async () => [];

const call = async (fn, user, { params = {}, query = {}, body = {} } = {}) => {
  const req = { params, query, body, headers: user ? { authorization: 'Bearer ' + signToken(user._id) } : {} };
  let out;
  const res = { status(c) { this.code = c; return this; }, json(b) { out = { code: this.code || 200, ...b }; } };
  await fn(req, res);
  return out;
};
const get = (u, p, query) => call(ctl.getMessagesByProject, u, { params: { projectId: String(p._id) }, query });
const send = (u, p, body) => call(ctl.sendMessage, u, { params: { projectId: String(p._id) }, body });

// ---- privacy: only the two people on the project
assert.equal((await get(null, P)).code, 401);
assert.equal((await send(null, P, { text: 'hi' })).code, 401);
for (const who of [carl, dina]) {
  assert.equal((await get(who, P)).code, 403);
  assert.equal((await send(who, P, { text: 'let me in' })).code, 403);
}
assert.equal((await get(carl, { _id: 'not-an-id' })).code, 403);
assert.equal((await get(carl, { _id: oid() })).code, 403);            // missing project looks the same as a private one
assert.equal(store.length, 0);
ok('logged-out users, outsiders and applicants get 401/403 (same answer for missing projects); nothing is stored');

// ---- sending: identity comes from the token, not the body
const s1 = await send(anna, P, { text: '  Hello Ben  ', sender: String(carl._id), senderName: 'Hacker', senderRole: 'freelancer' });
assert.equal(s1.code, 201); assert.equal(s1.message.text, 'Hello Ben');
assert.equal(s1.message.senderName, 'Anna'); assert.equal(s1.message.senderRole, 'client'); assert.equal(s1.message.sender, String(anna._id));
assert.equal(s1.message.mine, true); assert.equal(s1.message.seen, false);
assert.equal(Object.hasOwn(s1.message, 'readBy'), false);
ok('sender name/role/id are taken from the login, spoofed body fields are ignored, no readBy leak');

// ---- validation
assert.equal((await send(anna, P, { text: '   ' })).code, 400);
assert.equal((await send(anna, P, {})).code, 400);
assert.equal((await send(anna, P, { text: { $gt: '' } })).code, 400);
assert.equal((await send(anna, P, { text: 'x'.repeat(2001) })).code, 400);
assert.equal((await send(anna, P, { text: 'a\u0000b' })).message.text, 'ab');
ok('empty, object, over-long text rejected; control characters stripped');

// ---- chat only exists between both parties
const g0 = await get(anna, OPEN);
assert.equal(g0.code, 200); assert.equal(g0.chatOpen, false); assert.equal(g0.messages.length, 0);
assert.equal((await send(anna, OPEN, { text: 'anyone?' })).code, 409);
assert.equal((await get(dina, OPEN)).code, 403);
projects.get(String(P._id)).status = 'CANCELLED';
assert.equal((await send(anna, P, { text: 'x' })).code, 409);
assert.equal((await get(anna, P)).chatOpen, false);
projects.get(String(P._id)).status = 'ACTIVE';
ok('no chat before a freelancer is hired; cancelled projects are read-only');

// ---- read receipts + polling + paging
await new Promise((r) => setTimeout(r, 5));
const bBefore = await get(ben, P, { peek: '1' });
assert.equal(bBefore.messages.length, 2);
assert.equal(bBefore.messages[0].mine, false);
assert.equal((await get(anna, P, { peek: '1' })).messages[0].seen, false);   // peek does not mark as read
await get(ben, P);                                                           // Ben opens the chat
assert.equal((await get(anna, P, { peek: '1' })).messages[0].seen, true);
ok('"Seen" appears only after the other person opens the chat (background peeks do not count)');

const last = store[store.length - 1].createdAt;
await new Promise((r) => setTimeout(r, 5));
await send(ben, P, { text: 'Hi Anna' });
const poll = await get(anna, P, { after: last.toISOString() });
assert.deepEqual(poll.messages.map((m) => m.text), ['Hi Anna']);
assert.ok(poll.seenIds.length >= 1);
const page = await get(anna, P, { limit: '2' });
assert.equal(page.messages.length, 2); assert.equal(page.hasMore, true);
assert.equal(page.messages[1].text, 'Hi Anna');
const older = await get(anna, P, { limit: '2', before: page.messages[0].createdAt.toISOString() });
assert.equal(older.hasMore, false);
ok('polling returns only new messages, paging returns the latest page and older ones on request');

// ---- rate limit
let limited = 0;
for (let i = 0; i < 30; i++) if ((await send(ben, P, { text: 'spam ' + i })).code === 429) limited++;
assert.ok(limited >= 10);
ok('flooding is rate limited (429)');

// ---- conversation list only queries the user\'s own projects
const conv = await call(ctl.getConversations, ben);
assert.equal(conv.code, 200); assert.equal(conv.conversations[0].otherName, 'Anna'); assert.equal(conv.conversations[0].role, 'freelancer');
const qs = JSON.stringify(projectQuery);
assert.ok(qs.includes(String(ben._id)) && qs.includes('"$ne":null'));
assert.equal((await call(ctl.getConversations, null)).code, 401);
ok('conversation list is built from the caller\'s own projects with a hired freelancer only');

console.log(`\n${n} checks passed`);
process.exit(0);
