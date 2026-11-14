/**
 * Sandbox service checks that need no Docker: detection, symlink safety, output parsing,
 * and the full unpack -> install -> run flow with a fake container runner.
 * Run: node tests/integration/sandbox-unit.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sb = await import(ROOT + '/backend/services/sandboxService.js');
const ai = await import(ROOT + '/backend/services/aiService.js');
let n = 0; const ok = (m) => { n++; console.log('  ✓', m); };

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sbx-unit-'));

// ---- detection + symlink safety
const proj = path.join(tmp, 'proj');
await fs.mkdir(path.join(proj, 'src'), { recursive: true });
await fs.mkdir(path.join(proj, 'node_modules', 'x'), { recursive: true });
await fs.writeFile(path.join(proj, 'package.json'), JSON.stringify({ scripts: { test: 'node t.js', start: 'node server.js', build: 'echo b' } }));
await fs.writeFile(path.join(proj, 'src', 'a.js'), 'x');
await fs.writeFile(path.join(proj, 'node_modules', 'x', 'i.js'), 'x');
await fs.writeFile(path.join(tmp, 'secret.txt'), 'TOP SECRET');
await fs.symlink(path.join(tmp, 'secret.txt'), path.join(proj, 'README.md'));
const files = await sb.listFiles(proj);
assert.deepEqual(files.map((f) => f.path).sort(), ['package.json', 'src/a.js']);
assert.equal(await sb.safeRead(proj, 'README.md'), null);
assert.equal(await sb.safeRead(proj, '../secret.txt'), null);
assert.match(await sb.safeRead(proj, 'package.json'), /scripts/);
const det = await sb.detectProject(proj, files);
assert.equal(det.type, 'node'); assert.equal(det.hasTest, true); assert.equal(det.startKind, 'npm-start');
ok('lists files, skips node_modules and symlinks, refuses reads outside the project, detects node scripts');

await fs.writeFile(path.join(proj, 'package.json'), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
assert.equal((await sb.detectProject(proj, files)).hasTest, false);
assert.equal((await sb.detectProject(tmp, [{ path: 'a.py', size: 1 }, { path: 'tests/test_a.py', size: 1 }])).type, 'python');
assert.equal((await sb.detectProject(tmp, [{ path: 'index.html', size: 1 }])).type, 'static');
assert.equal((await sb.detectProject(tmp, [{ path: 'x.bin', size: 1 }])).type, 'unknown');
ok('default npm "no test specified" is not a test; python/static/unknown detected');

// ---- output parsing
const p = sb.parseRunOutput(`@@RESULT install 0\n@@RESULT test 1\n--- test (tail) ---\nFAIL api key=abcdef123456\n@@PROBE 3000 200 ${Buffer.from('<h1>Hi</h1>').toString('base64')}\n`);
assert.deepEqual(p.steps.map((s) => [s.name, s.passed]), [['install', true], ['test', false]]);
assert.equal(p.probes[0].status, 200); assert.equal(p.probes[0].snippet, '<h1>Hi</h1>');
assert.ok(!p.log.includes('abcdef123456'));
assert.equal(sb.parseRunOutput('@@RESULT test 124').steps[0].timedOut, true);
ok('parses step results and HTTP probes, redacts secrets, flags timeouts');

// ---- full flow with a fake runner
const zipDir = path.join(tmp, 'zipsrc', 'my-app');
await fs.mkdir(zipDir, { recursive: true });
await fs.writeFile(path.join(zipDir, 'package.json'), JSON.stringify({ scripts: { test: 'node t.js', start: 'node server.js' } }));
await fs.writeFile(path.join(zipDir, 'server.js'), 'require("http").createServer((q,s)=>s.end("hi")).listen(3000)');
const zipPath = path.join(tmp, 'p.zip');
execFileSync('zip', ['-qr', zipPath, 'my-app'], { cwd: path.join(tmp, 'zipsrc') });
const buffer = await fs.readFile(zipPath);

const calls = [];
const fakeRunner = async (spec) => {
  calls.push({ network: spec.network, kind: spec.env.KIND, script: spec.script.slice(0, 20) });
  if (spec.env.KIND) {
    const work = spec.mounts.find((m) => m.container === '/work').host;
    const inn = spec.mounts.find((m) => m.container === '/in').host;
    execFileSync('unzip', ['-q', '-o', path.join(inn, 'deliverable'), '-d', work]);
    return { code: 0, output: '@@EXTRACTED', timedOut: false };
  }
  if (spec.network === 'bridge') return { code: 0, output: '@@RESULT install 0\n', timedOut: false };
  return { code: 0, output: `@@RESULT test 0\n@@PROBE 3000 200 ${Buffer.from('hi').toString('base64')}\n`, timedOut: false };
};
const rep = await sb.inspectDeliverable({ buffer, name: 'project.zip', runner: fakeRunner });
assert.equal(rep.status, 'completed'); assert.equal(rep.projectType, 'node');
assert.deepEqual(calls.map((c) => c.network), ['none', 'bridge', 'none']);   // network ONLY for install
assert.ok(rep.steps.every((s) => s.passed)); assert.equal(rep.probes[0].port, 3000);
assert.match(rep.summary, /Tests: passed/); assert.match(rep.summary, /HTTP 200/);
assert.ok(rep.files.some((f) => f.path === 'server.js'));
ok('unpack -> install(network) -> run(no network); summary and files reported');

process.env.SANDBOX_INSTALL_NETWORK = 'false';
calls.length = 0;
await sb.inspectDeliverable({ buffer, name: 'project.zip', runner: fakeRunner });
assert.ok(!calls.some((c) => c.network === 'bridge'));
delete process.env.SANDBOX_INSTALL_NETWORK;
ok('SANDBOX_INSTALL_NETWORK=false means no container ever gets network');

process.env.SANDBOX_MODE = 'off';
assert.equal((await sb.inspectDeliverable({ buffer })).status, 'skipped');
process.env.SANDBOX_MODE = 'docker';
assert.equal((await sb.inspectDeliverable({ buffer: Buffer.alloc(0) })).status, 'skipped');
assert.equal((await sb.inspectDeliverable({ buffer })).status, 'unavailable');   // no docker here
ok('off / empty / no-Docker cases degrade to skipped or unavailable instead of throwing');

// ---- arbitrator fallback uses execution evidence
process.env.GEMINI_API_KEY = '';
const base = { acceptanceCriteria: 'app works', evidence: [], clientClaim: 'It does not work at all, crashes.', freelancerClaim: 'It works fine, see the tests.' };
const good = await ai.analyzeDispute({ ...base, executionReport: { ...rep } });
const bad = await ai.analyzeDispute({ ...base, executionReport: { status: 'completed', summary: 'Tests: failed (exit 1).', steps: [{ name: 'install', passed: true }, { name: 'test', passed: false }, { name: 'build', passed: false }], probes: [] } });
assert.equal(good.winner, 'freelancer'); assert.equal(bad.winner, 'client');
assert.ok(good.confidence < 70 && bad.confidence < 70);
assert.match(good.reasoning, /Project execution:/); assert.equal(good.execution.status, 'completed');
ok('fallback arbitrator weighs real execution results, stays below the 70% threshold, shows execution line');

await fs.rm(tmp, { recursive: true, force: true });
console.log(`\n${n} checks passed`);
