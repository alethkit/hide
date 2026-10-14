#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Edward Kmett
// SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
//
// Regression for the HLS setup on hide's OWN source (docs/haskell.md, "Language server on hide itself").
//
//   node test/inspector-hls-hide.mjs
//
// It starts the built editor (remote display protocol, cwd = the checkout) with the installed HLS and the
// documented environment (tools/hls-env.sh), waits until HLS answers, and drives the registered `inspect_symbol`
// tool through `hide --mcp-editor` (discover, inspect, definitions view, follow, references view, follow, back) on
// `sectionIndices` of src/Hide/Sidebar.hs, verifying every returned location against the checkout.
// This is a scripted client guarding the setup. It is NOT autonomous-agent evidence.
//
// On success it writes /sandbox/hide-hls-scripted-check.json and exits 0. On any failure it exits nonzero and never
// writes that file (a stale one is removed first). Bounded to 10 minutes; its processes and temp state are removed.
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, delimiter, relative } from 'node:path';

const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const output = '/sandbox/hide-hls-scripted-check.json';
const binary = process.env.HIDE_SMOKE_BINARY ?? repo + '/dist-newstyle/build/aarch64-linux/ghc-9.14.1/hide-0.1.0.0/x/hide/build/hide/hide';
const hls = process.env.THC_EDIT_HLS ?? '/sandbox/hls-ghcup/bin/haskell-language-server-wrapper';
const target = { file: 'src/Hide/Sidebar.hs', symbol: 'sectionIndices', needle: 'hiddenSections start count tree=dropWhile (<start+count) (sectionIndices tree)' };
rmSync(output, { force: true });

let state, child, bridge, sessionId, hlsEnv, closed = false;
const logs = [];
const log = text => logs.push(text);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Resident memory of the heaviest processes, sampled while the editor and HLS run (the machine this guards has ~2 GB).
const sampler = setInterval(() => log('memory: ' + spawnSync('sh', ['-c', "ps -eo rss,etime,args --sort=-rss | head -5 | cut -c1-110; free -m | sed -n 2p"], { encoding: 'utf8' }).stdout.replace(/\n/g, ' | ')), 5000);
sampler.unref();

function cleanup() {
  try {
    const list = args => spawnSync('pgrep', args, { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
    const tree = pid => [pid, ...list(['-P', String(pid)]).flatMap(tree)];
    // The remote daemon outlives its client and owns HLS, cabal and ghc: collect the whole tree before killing anything.
    if (sessionId) for (const root of list(['-f', sessionId]).filter(pid => pid !== process.pid)) {
      for (const pid of tree(root).reverse()) try { process.kill(pid, 'SIGTERM'); } catch {}
    }
    // HLS and the cabal it starts are children of the remote daemon and outlive it; find them by their cache directory.
    if (hlsEnv?.XDG_CACHE_HOME) for (const pid of list(['-f', hlsEnv.XDG_CACHE_HOME])) {
      if (pid !== process.pid) try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  } catch {}
  try { bridge?.stdin.end(); bridge?.kill('SIGTERM'); } catch {}
  try { if (child && child.exitCode === null) process.kill(-child.pid, 'SIGTERM'); } catch {}
  try { if (state) rmSync(state, { recursive: true, force: true }); } catch {}
}
function finish(code, message) {
  if (message) console.error((code ? 'FAIL ' : '') + message);
  if (code && process.env.HLS_HIDE_VERBOSE) console.error(logs.join('\n'));
  cleanup();
  process.exit(code);
}
process.on('uncaughtException', error => finish(1, String(error.stack ?? error)));
process.on('SIGINT', () => finish(1, 'interrupted'));
process.on('SIGTERM', () => finish(1, 'terminated'));
setTimeout(() => finish(1, 'overall 10 minute bound exceeded'), 600 * 1000).unref();

// ---- prerequisites ---------------------------------------------------------------------------------
const baseEnv = { ...process.env, HOME: '/home/node', TERM: 'xterm-256color', GHC_BIN: process.env.GHC_BIN ?? '/home/node/.ghcup/bin/ghc',
  PATH: ['/home/node/.ghcup/bin', '/home/node/.cabal/bin', process.env.PATH].join(delimiter) };
if (!existsSync(binary)) finish(2, 'built editor missing: ' + binary);
if (!existsSync(hls)) finish(2, 'HLS wrapper missing: ' + hls);
if (!existsSync(join(repo, 'hie.yaml')) || !existsSync(join(repo, 'cabal.project.hls'))) finish(2, 'hie.yaml / cabal.project.hls missing');
// /tmp is RAM-backed here, so keep the (large, reusable) HLS caches on disk next to the sandbox checkout.
const setup = spawnSync(join(repo, 'tools/hls-env.sh'), [], { encoding: 'utf8', env: { ...baseEnv, HIDE_HLS_HOME: process.env.HIDE_HLS_HOME ?? '/sandbox/hls-cache' }, cwd: repo });
if (setup.status !== 0) finish(2, 'tools/hls-env.sh failed: ' + setup.stderr);
hlsEnv = Object.fromEntries(setup.stdout.split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
if (!hlsEnv.XDG_CACHE_HOME || !hlsEnv.CABAL_CONFIG) finish(2, 'tools/hls-env.sh printed no environment');

// Warm the cradle with the command-line server first: on a ~2 GB machine the one-time compilation of hide's local
// packages must not compete with the running editor for memory. It also proves the setup without the editor.
{
  const warm = spawnSync(hls, ['-j1', target.file], { encoding: 'utf8', cwd: repo, timeout: 420000, env: { ...baseEnv, ...hlsEnv, THC_EDIT_HLS: hls } });
  log('warm-up exit ' + warm.status + '\n' + (warm.stdout ?? '') + (warm.stderr ?? ''));
  if (warm.status !== 0 || !/1 file worked/.test((warm.stdout ?? '') + (warm.stderr ?? ''))) finish(1, 'command-line HLS could not load ' + target.file + ' (exit ' + warm.status + ')');
  console.log('PASS command-line HLS loads ' + target.file);
}

// ---- the editor (remote display protocol; the display itself is not inspected here) ---------------
state = mkdtempSync('/sandbox/hide-hls-hide-');
const env = { ...baseEnv, hide_datadir: repo, THC_EDIT_HLS: hls };
for (const [key, dir] of Object.entries({ XDG_DATA_HOME: 'data', XDG_CONFIG_HOME: 'config', XDG_STATE_HOME: 'state' })) {
  env[key] = join(state, dir); mkdirSync(env[key], { recursive: true });
}
Object.assign(env, hlsEnv);  // XDG_CACHE_HOME (writable) and CABAL_CONFIG (real index and store despite relocated XDG dirs)

child = spawn(binary, ['--remote'], { cwd: repo, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
sessionId = randomBytes(24).toString('hex');
let buffered = Buffer.alloc(0), frameSeq = 0, gotFrame = false, serial = 0;
function send(value) { const data = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(5); header.writeUInt32BE(data.length + 1); child.stdin.write(Buffer.concat([header, data])); }
child.stdout.on('data', chunk => {
  buffered = Buffer.concat([buffered, chunk]);
  while (buffered.length >= 5) {
    const n = buffered.readUInt32BE(0);
    if (n < 1 || n > 16777217 || buffered.length < 4 + n) break;
    const kind = buffered[4]; if (kind === 1) gotFrame = true; const payload = buffered.subarray(5, 4 + n); buffered = buffered.subarray(4 + n);
    if (kind === 0) { try { const message = JSON.parse(payload); if (message.type === 'frame-ready') frameSeq = message.seq; } catch {} }
  }
});
child.stderr.on('data', chunk => log('editor stderr: ' + chunk));
child.on('error', error => { closed = true; log(String(error)); });
child.on('close', (code, signal) => { closed = true; log('editor closed ' + code + ' ' + signal); });
send({ type: 'hello', version: 1, session: sessionId, client: randomBytes(24).toString('hex'), ack: 0, args: ['--size=120x40', join(repo, target.file)] });

for (let i = 0; i < 600 && !gotFrame; i++) { if (closed) finish(1, 'the editor exited before its first frame'); await sleep(50); }
if (!gotFrame) finish(1, 'the editor produced no frame; closed=' + closed);
await sleep(1000);
bridge = spawn(binary, ['--mcp-editor', sessionId], { cwd: repo, env, stdio: ['pipe', 'pipe', 'pipe'] });
let pending = '', nextId = 0; const waiting = new Map();
bridge.stdout.on('data', chunk => {
  pending += chunk;
  let newline;
  while ((newline = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    waiting.get(message.id)?.(message); waiting.delete(message.id);
  }
});
bridge.stderr.on('data', chunk => log('bridge stderr: ' + chunk));
const rpc = (method, params, seconds = 240) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { waiting.delete(id); reject(Error('MCP ' + method + ' timed out')); }, seconds * 1000);
  waiting.set(id, message => { clearTimeout(timer); resolve(message); });
  bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const attempt = async (name, args) => {
  const reply = await rpc('tools/call', { name, arguments: args });
  if (reply.error) return { ok: false, error: reply.error.message };
  const body = reply.result?.content?.[0]?.text ?? '';
  if (reply.result?.isError) return { ok: false, error: body };
  try { return { ok: true, value: JSON.parse(body) }; } catch { return { ok: false, error: 'not JSON: ' + body.slice(0, 200) }; }
};
async function call(args, label) {
  const result = await attempt('inspect_symbol', args);
  log(label + ': ' + JSON.stringify(result).slice(0, 1500));
  if (!result.ok) throw Error(label + ' failed: ' + result.error);
  return result.value;
}

const sourceLines = readFileSync(join(repo, target.file), 'utf8').split('\n');
const lineAt = at => sourceLines[at - 1] ?? '';
const useLine = sourceLines.findIndex(text => text.includes(target.needle)) + 1;
if (!useLine) finish(1, 'the checkout no longer contains the expected line in ' + target.file);
const useColumn = lineAt(useLine).indexOf(target.symbol) + 1;

try {
  const initialized = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'hls-hide-script', version: '1' } }, 60);
  if (!initialized.result?.capabilities?.tools) throw Error('bridge did not initialize');
  bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const tools = (await rpc('tools/list', {})).result.tools;
  if (!tools.some(tool => tool.name === 'inspect_symbol')) throw Error('inspect_symbol is not registered');
  console.log('PASS inspect_symbol is registered');
  const buffers = (await attempt('list_buffers', {})).value?.buffers ?? [];
  const buffer = buffers.find(item => item.path && item.path.endsWith(target.file));
  if (!buffer) throw Error(target.file + ' is not an open buffer: ' + JSON.stringify(buffers));
  const discovered = await call({ action: 'discover', bufferId: buffer.bufferId, line: useLine, column: useColumn }, 'discover');
  if (!discovered.position?.eligible || discovered.position.symbol !== target.symbol) throw Error('discover did not find ' + target.symbol + ': ' + JSON.stringify(discovered));

  // HLS loads lazily: the first answers can take minutes. Retry until hover, definitions and references are all available.
  let first, report;
  const until = Date.now() + 8 * 60 * 1000;
  for (let tries = 1; ; tries++) {
    first = await call({ action: 'inspect', bufferId: buffer.bufferId, line: useLine, column: useColumn }, 'inspect (try ' + tries + ')');
    report = first.report;
    if (report.hover.status === 'available' && report.definitions.status === 'available' && report.references.status === 'available') break;
    if (Date.now() > until) throw Error('HLS never answered for hide source: ' + JSON.stringify(report));
    await sleep(10000);
  }
  if (!(report.definitions.count >= 1 && report.references.count >= 1)) throw Error('empty definitions/references: ' + JSON.stringify(report));
  console.log(`PASS HLS answers on hide source: ${report.symbol} hover available, ${report.definitions.count} definition(s), ${report.references.count} reference(s)`);

  const definitions = await call({ action: 'view', page: first.page, view: 'hide.symbol.definitions' }, 'definitions view');
  const defSite = await call({ action: 'follow', page: definitions.page, row: 0 }, 'follow definition');
  const defLocation = (await call({ action: 'follow', page: defSite.page, row: 0 }, 'open definition location')).location;
  if (!defLocation?.verified || !/\bsectionIndices\b/.test(lineAt(defLocation.line)) || !defLocation.path.endsWith(target.file)) throw Error('bad definition location: ' + JSON.stringify(defLocation));
  const backToDefinitions = await call({ action: 'back', page: defSite.page }, 'back from the definition site');
  const references = await call({ action: 'view', page: backToDefinitions.page, view: 'hide.symbol.references' }, 'references view');
  const rows = references.document.items.map((item, row) => ({ item, row })).filter(({ item }) => item.action);
  if (!rows.length) throw Error('references view has no followable row');
  const locations = [];
  for (const { row } of rows) {
    const site = await call({ action: 'follow', page: references.page, row }, 'follow reference row ' + row);
    const where = (await call({ action: 'follow', page: site.page, row: 0 }, 'open reference location ' + row)).location;
    if (!where?.verified || !/\bsectionIndices\b/.test(lineAt(where.line))) throw Error('bad reference location: ' + JSON.stringify(where));
    const back = await call({ action: 'back', page: site.page }, 'back from the reference site');
    if (back.view !== references.view) throw Error('Back did not return to the references view: ' + back.view);
    locations.push(where);
  }
  const place = where => `${relative(repo, where.path)}:${where.line}`;
  const reference = locations.find(where => where.line !== defLocation.line);
  if (!reference) throw Error('no reference distinct from the definition: ' + JSON.stringify(locations));
  console.log(`PASS definition ${place(defLocation)}, reference ${place(reference)}, Back verified`);

  // Shut the editor down before reporting success.
  try { bridge.stdin.end(); } catch {}
  writeFileSync(output, JSON.stringify({ client: 'scripted-regression', realHls: true, hlsOnHide: true, symbol: report.symbol,
    definition: place(defLocation), definitions: report.definitions.count, references: report.references.count }) + '\n');
  console.log('PASS wrote ' + output);
  finish(0);
} catch (error) {
  rmSync(output, { force: true });
  finish(1, String(error.stack ?? error));
}
