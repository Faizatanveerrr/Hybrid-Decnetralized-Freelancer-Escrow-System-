/** Role switching: the mode is saved on the server, project actions follow the real relationship. */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startBackend, makeApi, deployToken, ok, assert, count, ROOT } from './harness.mjs';

const { roleForProject, idOf } = await import(path.join(ROOT, 'src/utils/roles.js'));

// ---------- the frontend helper (pure function)
const client = { _id: 'c1' }, freelancer = { id: 'f1' }, stranger = { _id: 's1' };
const project = { client: { _id: 'c1' }, freelancer: 'f1' };
assert.equal(roleForProject(project, client, 'freelancer'), 'client');       // mode says freelancer, but they own the project
assert.equal(roleForProject(project, freelancer, 'client'), 'freelancer');    // mode says client, but they were hired
assert.equal(roleForProject(project, stranger, 'freelancer'), 'freelancer');  // outsider: the mode applies
assert.equal(roleForProject(project, stranger, 'client'), 'client');
assert.equal(roleForProject(null, client, 'client'), 'client');
assert.equal(roleForProject({ client: 'c1', freelancer: null }, { id: 'c1' }, 'freelancer'), 'client');
assert.equal(idOf({ _id: 'x' }), 'x'); assert.equal(idOf('y'), 'y'); assert.equal(idOf(null), '');
ok('role helper: on a project you are its client/freelancer whatever the mode; outsiders follow the mode');

const token = await deployToken();
const be = await startBackend({ TOKEN_ADDRESS: token });
const api = makeApi(be.port);
let n = 0;
const reg = async (name, role) => { const r = await api('POST', '/auth/register', { body: { name: name + ++n, email: `${name}${n}@t.io`, password: 'Secret#12x', role } }); return { ...r.data.user, token: r.data.token }; };
const setRole = (u, role) => api('PUT', `/users/${u._id}`, { token: u.token, body: { role } });
const me = async (u) => (await api('GET', '/auth/me', { token: u.token })).data.user.role;
const newProject = async (u, title) => (await api('POST', '/projects', { token: u.token, body: { title, description: 'desc', milestones: [{ title: 'M1', amount: 500 }] } })).data.project;
const propose = (u, p) => api('POST', `/projects/${p._id}/proposals`, { token: u.token, body: { message: 'I can do this', proposedAmount: 500 } });
try {
  const u1 = await reg('anna', 'client'), u2 = await reg('ben', 'freelancer'), u3 = await reg('carl', 'client');
  const P1 = await newProject(u1, 'Project one');

  // ---------- the reported problem
  const before = await propose(u3, P1);
  assert.equal(before.status, 403);
  assert.equal((await setRole(u3, 'freelancer')).status, 200); assert.equal(await me(u3), 'freelancer');
  const after = await propose(u3, P1);
  assert.equal(after.status, 201, JSON.stringify(after.data));
  ok('client-registered user switches to Freelancer mode: it is saved on the server and proposals now work (was 403)');
  assert.equal((await setRole(u3, 'client')).status, 200); assert.equal(await me(u3), 'client');
  const P3 = await newProject(u3, 'Carl project'); assert.ok(P3._id);
  ok('and back to Client mode: saved, and creating projects works');

  assert.equal((await setRole(u1, 'admin')).status, 400);
  assert.equal((await api('PUT', `/users/${u1._id}`, { token: u2.token, body: { role: 'freelancer' } })).status, 403);
  assert.equal((await api('PUT', `/users/${u1._id}`, { body: { role: 'freelancer' } })).status, 401);
  assert.equal(await me(u1), 'client');
  ok('invalid roles rejected; nobody can change another user\'s role; anonymous refused');

  // ---------- actions follow the project relationship, not the mode
  const prop = await propose(u2, P1); assert.equal(prop.status, 201);
  await api('PUT', `/proposals/${prop.data.proposal._id}/accept`, { token: u1.token });
  const m1 = (await api('GET', `/projects/${P1._id}`, { token: u1.token })).data.project.milestones[0]._id;

  assert.equal((await setRole(u1, 'freelancer')).status, 200);   // owner flips to Freelancer mode...
  assert.equal((await setRole(u2, 'client')).status, 200);       // ...and the hired freelancer flips to Client mode
  const fund = await api('POST', `/milestones/${m1}/fund`, { token: u1.token });
  assert.equal(fund.status, 200, JSON.stringify(fund.data)); assert.equal(fund.data.milestone.status, 'FUNDED');
  ok('owner in Freelancer mode can still fund their own project (they are its client)');
  const submit = await api('POST', `/milestones/${m1}/submit`, { token: u2.token, body: { proof: 'work done' } });
  assert.equal(submit.status, 200, JSON.stringify(submit.data)); assert.equal(submit.data.milestone.status, 'SUBMITTED');
  ok('hired freelancer in Client mode can still submit work (they are its freelancer)');
  assert.equal((await api('POST', `/milestones/${m1}/approve`, { token: u2.token })).status, 403);
  assert.equal((await api('POST', `/milestones/${m1}/submit`, { token: u1.token, body: { proof: 'x' } })).status, 403);
  ok('and the opposite party\'s actions stay refused whatever mode they are in');
  const P4 = await newProject(u1, 'Anna open project');   // still open, owned by Anna
  const own = await propose(u1, P4);   // owner, in freelancer mode, tries to apply to own project
  assert.equal(own.status, 400); assert.match(own.data.message, /own project/);
  const P2 = await newProject(u2, 'Ben project');   // Ben is in Client mode now, so he can post work
  assert.equal((await propose(u1, P2)).status, 201);
  ok('in Freelancer mode the owner cannot apply to their own project, but can apply to someone else\'s');
  const approve = await api('POST', `/milestones/${m1}/approve`, { token: u1.token });
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  ok('the client can approve and release from Freelancer mode');
  console.log(`\nROLE SWITCHING PASSED (${count()} checks)`);
} catch (e) { console.log(be.getLog().slice(-1500)); throw e; } finally { be.stop(); setTimeout(() => process.exit(0), 300); }
