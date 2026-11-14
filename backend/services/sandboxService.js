/**
 * Sandboxed execution of a freelancer's deliverable, used by the AI arbitrator when a dispute
 * is escalated (secondary review). The project is unpacked and run INSIDE throw-away Docker
 * containers, never in the server process (which holds the arbitrator key and JWT secret).
 *
 * Isolation for every container:
 *   - no secrets and no access to the server's files: only a temp dir is mounted
 *   - read-only root filesystem, all capabilities dropped, no-new-privileges, non-root user
 *   - memory / CPU / process limits and a hard timeout (the container is killed)
 *   - dependency install is the ONLY step with network (SANDBOX_INSTALL_NETWORK=false disables it);
 *     tests, build and start always run with --network none
 *   - one job at a time
 *
 * Env: SANDBOX_MODE (docker|off, default docker), SANDBOX_NODE_IMAGE, SANDBOX_PYTHON_IMAGE,
 *      SANDBOX_TIMEOUT_SEC, SANDBOX_MEMORY, SANDBOX_CPUS, SANDBOX_MAX_UNPACKED_MB,
 *      SANDBOX_INSTALL_NETWORK
 *
 * The server needs the `docker` CLI and daemon access (e.g. `npm run dev` on a machine with
 * Docker Desktop). Inside the stock docker-compose `app` container there is no Docker, so the
 * report comes back as "unavailable" and the arbitrator falls back to text-only evidence.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const num = (name, def) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

export const getSandboxConfig = () => ({
  mode: String(process.env.SANDBOX_MODE || 'docker').toLowerCase(),
  nodeImage: process.env.SANDBOX_NODE_IMAGE || 'node:22-alpine',
  pythonImage: process.env.SANDBOX_PYTHON_IMAGE || 'python:3.12-slim',
  phaseTimeoutSec: num('SANDBOX_TIMEOUT_SEC', 180),
  memory: process.env.SANDBOX_MEMORY || '768m',
  cpus: process.env.SANDBOX_CPUS || '1',
  maxUnpackedMb: num('SANDBOX_MAX_UNPACKED_MB', 100),
  installNetwork: String(process.env.SANDBOX_INSTALL_NETWORK || 'true').toLowerCase() !== 'false'
});

const OUTPUT_CAP = 200 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '.deps', '__pycache__', '.venv', 'venv', '.next', 'dist', 'build', '__MACOSX']);

// ------------------------------------------------------------------ docker plumbing

const spawnCapture = (cmd, args, { timeoutMs = 15000 } = {}) =>
  new Promise((resolve) => {
    let out = '';
    let child;
    try { child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return resolve({ code: -1, output: e.message }); }
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const add = (d) => { if (out.length < OUTPUT_CAP) out += d.toString('utf8'); };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, output: e.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: out }); });
  });

let dockerCheck = { at: 0, ok: false, reason: '' };
export const dockerAvailable = async () => {
  if (Date.now() - dockerCheck.at < 60000) return dockerCheck;
  const r = await spawnCapture('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 8000 });
  dockerCheck = {
    at: Date.now(),
    ok: r.code === 0 && Boolean(r.output.trim()),
    reason: r.code === 0 ? '' : 'Docker CLI/daemon not reachable from the server'
  };
  return dockerCheck;
};

const imageReady = new Set();
const ensureImage = async (image) => {
  if (imageReady.has(image)) return;
  const have = await spawnCapture('docker', ['image', 'inspect', image], { timeoutMs: 10000 });
  if (have.code !== 0) {
    const pull = await spawnCapture('docker', ['pull', image], { timeoutMs: 300000 });
    if (pull.code !== 0) throw new Error(`Could not pull sandbox image ${image}`);
  }
  imageReady.add(image);
};

/** Runs one throw-away container. Resolves { code, output, timedOut }. */
export const runContainer = async ({ image, network, mounts, env = {}, script, timeoutSec, user = '1000:1000' }) => {
  const cfg = getSandboxConfig();
  await ensureImage(image);
  const name = `escrowx-sbx-${crypto.randomBytes(6).toString('hex')}`;
  const args = [
    'run', '--rm', '--name', name,
    '--network', network,
    '--memory', cfg.memory, '--memory-swap', cfg.memory,
    '--cpus', cfg.cpus, '--pids-limit', '256',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--read-only', '--tmpfs', '/tmp:rw,exec,size=256m',
    '--user', user, '-w', '/work'
  ];
  for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
  for (const m of mounts) args.push('-v', `${m.host}:${m.container}${m.ro ? ':ro' : ''}`);
  args.push(image, 'sh', '-c', script);

  return new Promise((resolve) => {
    let out = '';
    let timedOut = false;
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const add = (d) => { if (out.length < OUTPUT_CAP) out += d.toString('utf8'); };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => {
      timedOut = true;
      spawn('docker', ['kill', name], { stdio: 'ignore' }).on('error', () => {});
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, (timeoutSec + 15) * 1000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, output: `${out}\n${e.message}`, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: out, timedOut }); });
  });
};

// one sandbox job at a time (a dispute is rare; this stops queue flooding the host)
let queue = Promise.resolve();
const exclusive = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

// ------------------------------------------------------------------ safe host-side file access
// The extracted project is untrusted: never follow symlinks, never leave the project root.

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
};

export const listFiles = async (root, maxFiles = 500) => {
  const files = [];
  const walk = async (dir) => {
    if (files.length >= maxFiles) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.length >= maxFiles) return;
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (!inside(root, full)) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full);
      } else if (e.isFile()) {
        const st = await fs.lstat(full).catch(() => null);
        if (st && st.isFile()) files.push({ path: path.relative(root, full).split(path.sep).join('/'), size: st.size });
      }
    }
  };
  await walk(root);
  return files;
};

export const safeRead = async (root, rel, max = 3000) => {
  const full = path.resolve(root, rel);
  if (!inside(root, full)) return null;
  try {
    const st = await fs.lstat(full);
    if (!st.isFile() || st.isSymbolicLink()) return null;
    const fh = await fs.open(full, 'r');
    try {
      const buf = Buffer.alloc(Math.min(max, st.size));
      await fh.read(buf, 0, buf.length, 0);
      if (buf.includes(0)) return null; // binary
      return buf.toString('utf8');
    } finally { await fh.close(); }
  } catch { return null; }
};

const redact = (s) =>
  String(s)
    .replace(/(api[ _-]?key|secret|token|passw(?:or)?d|private[ _-]?key|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, '$1$2[redacted]')
    .replace(/\b0x[a-fA-F0-9]{64}\b/g, '[redacted-key]');

// ------------------------------------------------------------------ detection

const ENTRY_CANDIDATES = {
  python: ['main.py', 'app.py', 'server.py', 'run.py', 'manage.py'],
  keyFiles: ['README.md', 'readme.md', 'package.json', 'requirements.txt', 'pyproject.toml', 'Dockerfile',
    'index.html', 'index.js', 'server.js', 'app.js', 'main.py', 'app.py', 'server.py', 'src/index.js', 'src/main.js', 'src/App.jsx']
};

export const detectProject = async (root, files) => {
  const names = new Set(files.map((f) => f.path));
  const has = (n) => names.has(n);

  if (has('package.json')) {
    let pkg = {};
    try { pkg = JSON.parse((await safeRead(root, 'package.json', 100000)) || '{}'); } catch { /* keep empty */ }
    const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
    const realTest = typeof scripts.test === 'string' && !/no test specified/i.test(scripts.test);
    return {
      type: 'node',
      hasTest: realTest,
      hasBuild: typeof scripts.build === 'string',
      startKind: typeof scripts.start === 'string' ? 'npm-start' : typeof scripts.dev === 'string' ? 'npm-dev' : '',
      scriptNames: Object.keys(scripts).slice(0, 15)
    };
  }

  const pyFiles = files.filter((f) => f.path.endsWith('.py'));
  if (has('requirements.txt') || has('pyproject.toml') || has('setup.py') || pyFiles.length) {
    const entry = ENTRY_CANDIDATES.python.find((e) => has(e)) || '';
    const hasTests = files.some((f) => /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(f.path) || f.path.startsWith('tests/'));
    return { type: 'python', hasTest: hasTests, hasRequirements: has('requirements.txt'), entry, startKind: entry ? 'python-entry' : '' };
  }

  if (has('index.html') || files.some((f) => f.path.endsWith('.html'))) return { type: 'static' };
  return { type: 'unknown' };
};

const staticChecks = async (root, files) => {
  const html = files.find((f) => f.path === 'index.html') || files.find((f) => f.path.endsWith('.html'));
  if (!html) return { missingRefs: [] };
  const text = (await safeRead(root, html.path, 200000)) || '';
  const base = path.posix.dirname(html.path);
  const have = new Set(files.map((f) => f.path));
  const missing = [];
  for (const m of text.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)) {
    const ref = m[1].trim();
    if (!ref || /^(?:[a-z]+:|\/\/)/i.test(ref)) continue;
    const resolved = path.posix.normalize(ref.startsWith('/') ? ref.slice(1) : path.posix.join(base, ref));
    if (!have.has(resolved) && !missing.includes(ref)) missing.push(ref);
    if (missing.length >= 10) break;
  }
  return { missingRefs: missing, htmlFile: html.path };
};

const collectKeyFiles = async (root, files) => {
  const have = new Set(files.map((f) => f.path));
  const picked = ENTRY_CANDIDATES.keyFiles.filter((p) => have.has(p)).slice(0, 8);
  let budget = 14000;
  const out = [];
  for (const p of picked) {
    if (budget <= 0) break;
    const text = await safeRead(root, p, Math.min(2500, budget));
    if (text) { out.push({ path: p, excerpt: redact(text) }); budget -= text.length; }
  }
  return out;
};

// ------------------------------------------------------------------ in-container scripts

const STEP_FN = `step() { n="$1"; shift; timeout "$T" "$@" >"/tmp/$n.log" 2>&1; c=$?; echo "@@RESULT $n $c"; echo "--- $n (tail) ---"; tail -c 3500 "/tmp/$n.log"; }`;
const CD = `cd "/work/$PROJECT_DIR" 2>/dev/null || cd /work`;

const NODE_PROBE = `const ports=[3000,5173,4173,8000,8080,5000,4000];const end=Date.now()+20000;(async()=>{while(Date.now()<end){for(const p of ports){try{const r=await fetch('http://127.0.0.1:'+p+'/',{signal:AbortSignal.timeout(1500)});const t=(await r.text()).slice(0,300);console.log('@@PROBE '+p+' '+r.status+' '+Buffer.from(t).toString('base64'));return}catch(e){}}await new Promise(r=>setTimeout(r,1000))}console.log('@@PROBE none')})()`;
const PY_PROBE = `import urllib.request,base64,time,sys\nports=[3000,5000,8000,8080,5173,4000]\nend=time.time()+20\nwhile time.time()<end:\n  for p in ports:\n    try:\n      r=urllib.request.urlopen('http://127.0.0.1:%d/'%p,timeout=1.5)\n      print('@@PROBE %d %d %s'%(p,r.status,base64.b64encode(r.read(300)).decode()));sys.exit(0)\n    except Exception as e:\n      if hasattr(e,'code'):\n        print('@@PROBE %d %d %s'%(p,e.code,''));sys.exit(0)\n  time.sleep(1)\nprint('@@PROBE none')`;

const SCRIPTS = {
  extract: `set -e
cd /work
if [ "$KIND" = zip ]; then
  total=$(unzip -l /in/deliverable | awk 'END{print $1}')
  if [ -n "$total" ] && [ "$total" -gt "$MAX_BYTES" ] 2>/dev/null; then echo "@@TOO_LARGE $total"; exit 42; fi
  unzip -q -o /in/deliverable -d /work
else
  cp /in/deliverable "/work/$NAME"
fi
find /work -type l -delete
echo "@@EXTRACTED"`,

  nodeInstall: `${CD}
export HOME=/tmp/home npm_config_cache=/tmp/npm-cache; mkdir -p "$HOME"
timeout "$T" npm install --ignore-scripts --no-audit --no-fund --loglevel=error >/tmp/install.log 2>&1; c=$?
echo "@@RESULT install $c"; tail -c 3000 /tmp/install.log`,

  nodeRun: `${CD}
export HOME=/tmp/home npm_config_cache=/tmp/npm-cache CI=true; mkdir -p "$HOME"
${STEP_FN}
[ "$HAS_TEST" = 1 ] && step test npm test
[ "$HAS_BUILD" = 1 ] && step build npm run build
case "$START_KIND" in
  npm-start) CMD="npm start" ;;
  npm-dev) CMD="npm run dev -- --host 0.0.0.0" ;;
  *) CMD="" ;;
esac
if [ -n "$CMD" ]; then
  ( PORT=3000 HOST=0.0.0.0 timeout "$START_T" $CMD >/tmp/start.log 2>&1 & )
  node -e "$PROBE"
  echo "--- start (tail) ---"; tail -c 2500 /tmp/start.log
fi
true`,

  pythonInstall: `${CD}
export HOME=/tmp/home PIP_CACHE_DIR=/tmp/pipcache; mkdir -p "$HOME"
if [ "$HAS_REQ" = 1 ]; then
  timeout "$T" pip install --no-input --disable-pip-version-check --only-binary=:all: -r requirements.txt --target /work/.deps >/tmp/install.log 2>&1; c=$?
  echo "@@RESULT install $c"; tail -c 3000 /tmp/install.log
fi
if [ "$HAS_TEST" = 1 ]; then
  timeout 120 pip install --no-input --disable-pip-version-check --only-binary=:all: pytest --target /work/.deps >/tmp/pytest-install.log 2>&1
fi
true`,

  pythonRun: `${CD}
export HOME=/tmp/home PYTHONPATH=/work/.deps PYTHONDONTWRITEBYTECODE=1; mkdir -p "$HOME"
${STEP_FN}
[ "$HAS_TEST" = 1 ] && step test python -m pytest -q -x --maxfail=3 -p no:cacheprovider
if [ "$START_KIND" = python-entry ]; then
  ( PORT=3000 timeout "$START_T" python "$ENTRY" >/tmp/start.log 2>&1 & )
  python -c "$PROBE"
  echo "--- start (tail) ---"; tail -c 2500 /tmp/start.log
fi
true`
};

// ------------------------------------------------------------------ output parsing

const TIMEOUT_CODES = new Set([124, 137, 143]);

export const parseRunOutput = (output) => {
  const steps = [];
  const probes = [];
  for (const m of output.matchAll(/^@@RESULT (\w+) (\d+)/gm)) {
    const exit = Number(m[2]);
    steps.push({ name: m[1], exit, passed: exit === 0, timedOut: TIMEOUT_CODES.has(exit) });
  }
  for (const m of output.matchAll(/^@@PROBE (\d+) (\d+) ?(\S*)/gm)) {
    let snippet = '';
    try { snippet = Buffer.from(m[3] || '', 'base64').toString('utf8').replace(/\s+/g, ' ').slice(0, 200); } catch { /* ignore */ }
    probes.push({ port: Number(m[1]), status: Number(m[2]), snippet: redact(snippet) });
  }
  const noServer = /^@@PROBE none/m.test(output);
  const log = redact(output.replace(/^@@(?:RESULT|PROBE|EXTRACTED).*$/gm, '').replace(/\n{3,}/g, '\n\n')).trim();
  return { steps, probes, noServer, log };
};

const clip = (s, head, tail) => (s.length <= head + tail ? s : `${s.slice(0, head)}\n...[truncated]...\n${s.slice(-tail)}`);

const STEP_LABEL = { install: 'Dependency install', test: 'Tests', build: 'Build' };

export const buildSummary = (r) => {
  if (r.status === 'skipped' || r.status === 'unavailable') return r.reason;
  const parts = [`${r.projectType} project, ${r.fileCount} file(s)`];
  for (const s of r.steps || []) {
    parts.push(`${STEP_LABEL[s.name] || s.name}: ${s.passed ? 'passed' : s.timedOut ? 'timed out' : `failed (exit ${s.exit})`}`);
  }
  if (r.probes?.length) parts.push(`app started and answered HTTP ${r.probes[0].status} on port ${r.probes[0].port}`);
  else if (r.startAttempted) parts.push('app did not answer on any common port within 20s');
  if (r.staticChecks?.missingRefs?.length) parts.push(`index.html references missing files: ${r.staticChecks.missingRefs.slice(0, 5).join(', ')}`);
  if (r.status === 'partial' && r.reason) parts.push(r.reason);
  return parts.join('. ') + '.';
};

/** The execution evidence as text for the arbitrator prompt (untrusted content, size-capped). */
export const formatReportForPrompt = (r) => {
  if (!r) return '';
  const lines = [`Status: ${r.status}`, `Summary: ${r.summary}`];
  if (r.status === 'unavailable' || r.status === 'skipped') return lines.join('\n');
  if (r.files?.length) {
    lines.push('Files (path, bytes):\n' + r.files.slice(0, 120).map((f) => `${f.path} (${f.size})`).join('\n'));
  }
  for (const k of r.keyFiles || []) lines.push(`--- ${k.path} ---\n${k.excerpt}`);
  if (r.log) lines.push('--- Execution output (tail) ---\n' + clip(r.log, 2500, 5500));
  return lines.join('\n\n');
};

export const compactReport = (r) =>
  r && {
    status: r.status,
    projectType: r.projectType || '',
    summary: r.summary,
    fileCount: r.fileCount || 0,
    steps: (r.steps || []).map((s) => ({ name: s.name, exit: s.exit, passed: s.passed })),
    probes: (r.probes || []).map((p) => ({ port: p.port, status: p.status })),
    reason: r.reason || ''
  };

// ------------------------------------------------------------------ main entry

const fail = (status, reason, extra = {}) => ({ status, reason, summary: reason, steps: [], probes: [], ...extra });

/**
 * Unpack and run a deliverable inside Docker.
 * @param {{buffer: Buffer, name?: string, runner?: Function}} opts  runner is injectable for tests
 */
export const inspectDeliverable = async ({ buffer, name = 'deliverable', runner = runContainer } = {}) => {
  const cfg = getSandboxConfig();
  if (cfg.mode === 'off') return fail('skipped', 'Project execution is turned off (SANDBOX_MODE=off).');
  if (!buffer || !buffer.length) return fail('skipped', 'The freelancer did not upload a deliverable file.');

  if (runner === runContainer) {
    const d = await dockerAvailable();
    if (!d.ok) return fail('unavailable', `${d.reason}. The deliverable could not be executed, so only the written evidence was reviewed.`);
  }

  return exclusive(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'escrowx-sbx-'));
    const inDir = path.join(tmp, 'in');
    const workDir = path.join(tmp, 'work');
    try {
      await fs.mkdir(inDir);
      await fs.mkdir(workDir);
      await fs.chmod(workDir, 0o777);
      await fs.writeFile(path.join(inDir, 'deliverable'), buffer);
      await fs.chmod(inDir, 0o755);
      await fs.chmod(path.join(inDir, 'deliverable'), 0o644);

      const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b && (name.toLowerCase().endsWith('.zip') || buffer[2] === 0x03);
      const safeName = path.basename(String(name)).replace(/[^\w.\- ]/g, '_').slice(0, 100) || 'deliverable';
      const mounts = [{ host: inDir, container: '/in', ro: true }, { host: workDir, container: '/work', ro: false }];
      const T = String(cfg.phaseTimeoutSec);

      // 1) unpack (no network)
      const ex = await runner({
        image: cfg.nodeImage, network: 'none', mounts, timeoutSec: 90, script: SCRIPTS.extract,
        env: { KIND: isZip ? 'zip' : 'file', NAME: safeName, MAX_BYTES: String(cfg.maxUnpackedMb * 1024 * 1024) }
      });
      if (ex.code === 42) return fail('unavailable', `The deliverable unpacks to more than ${cfg.maxUnpackedMb} MB, which is over the sandbox limit.`);
      if (ex.code !== 0 || !/@@EXTRACTED/.test(ex.output)) return fail('unavailable', 'The deliverable could not be unpacked (corrupt or unsupported archive).');

      // 2) inspect on the host (symlink-safe)
      let projectDir = '';
      const top = (await fs.readdir(workDir, { withFileTypes: true })).filter((e) => e.name !== '__MACOSX');
      if (top.length === 1 && top[0].isDirectory() && !top[0].isSymbolicLink()) projectDir = top[0].name;
      const root = path.join(workDir, projectDir);
      const files = await listFiles(root);
      if (!files.length) return fail('unavailable', 'The deliverable is empty.');
      const det = await detectProject(root, files);
      const keyFiles = await collectKeyFiles(root, files);

      const base = {
        projectType: det.type, fileCount: files.length,
        files: files.slice(0, 150), keyFiles, steps: [], probes: [], log: '', startAttempted: false
      };

      if (det.type === 'static' || det.type === 'unknown') {
        const sc = det.type === 'static' ? await staticChecks(root, files) : { missingRefs: [] };
        const r = {
          ...base, status: 'partial', staticChecks: sc,
          reason: det.type === 'static'
            ? 'Static website: nothing to execute, files checked only.'
            : 'No runnable project (package.json, requirements.txt or Python entry point) was found.'
        };
        return { ...r, summary: buildSummary(r) };
      }

      // 3) install (network only here), 4) run (never any network)
      const image = det.type === 'node' ? cfg.nodeImage : cfg.pythonImage;
      const runEnv = {
        PROJECT_DIR: projectDir, T, START_T: '45',
        HAS_TEST: det.hasTest ? '1' : '0', HAS_BUILD: det.hasBuild ? '1' : '0', HAS_REQ: det.hasRequirements ? '1' : '0',
        START_KIND: det.startKind || '', ENTRY: det.entry || '',
        PROBE: det.type === 'node' ? NODE_PROBE : PY_PROBE
      };
      const installScript = det.type === 'node' ? SCRIPTS.nodeInstall : SCRIPTS.pythonInstall;
      const runScript = det.type === 'node' ? SCRIPTS.nodeRun : SCRIPTS.pythonRun;

      let installOut = { output: '', timedOut: false };
      const needsInstall = det.type === 'node' || det.hasRequirements || det.hasTest;
      if (needsInstall && cfg.installNetwork) {
        installOut = await runner({ image, network: 'bridge', mounts, env: runEnv, script: installScript, timeoutSec: cfg.phaseTimeoutSec });
      }
      const run = await runner({
        image, network: 'none', mounts, env: runEnv, script: runScript,
        timeoutSec: cfg.phaseTimeoutSec + 90 + 45 + 20
      });

      const parsed = parseRunOutput(`${installOut.output}\n${run.output}`);
      const r = {
        ...base,
        status: run.timedOut || installOut.timedOut ? 'partial' : 'completed',
        reason: run.timedOut || installOut.timedOut ? 'A sandbox phase hit its time limit and was stopped.' : '',
        steps: parsed.steps,
        probes: parsed.probes,
        startAttempted: Boolean(det.startKind),
        log: parsed.log
      };
      if (!det.hasTest && !det.hasBuild && !det.startKind) {
        r.status = 'partial';
        r.reason = r.reason || 'The project has no test, build or start command, so it could only be installed and listed.';
      }
      return { ...r, summary: buildSummary(r) };
    } catch (err) {
      return fail('unavailable', `Sandbox error: ${String(err.message || err).slice(0, 160)}`);
    } finally {
      // Files written by the container user may not be deletable by the server user: clean as root first.
      if (runner === runContainer) {
        await runContainer({
          image: cfg.nodeImage, network: 'none', user: '0:0', timeoutSec: 60,
          mounts: [{ host: workDir, container: '/work', ro: false }],
          script: 'find /work -mindepth 1 -delete 2>/dev/null; true'
        }).catch(() => {});
      }
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  });
};
