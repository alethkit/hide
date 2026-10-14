#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Edward Kmett
// SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
//
// Runtime acceptance for the symbol-inspection workflow.
//
//   node test/inspector-symbol-workflow.mjs               # REAL HLS (the acceptance run)
//   node test/inspector-symbol-workflow.mjs --fake-lsp    # dry run against test/fake-lsp.mjs
//
// It launches the built editor with the remote display protocol, inspects a symbol
// of test/inspector-fixture from the rendered UI (context menu), follows its
// definition and references and goes Back, then bridges to the same live editor
// session with `hide --mcp-editor` and drives the REGISTERED `inspect_symbol` tool
// through the real MCP dispatch and admission path with a scripted tool client
// (no autonomous LLM session is involved). Focused compiled checks for admission
// (inspector-checks) run first.
//
// Real mode needs an installed compatible HLS: $THC_EDIT_HLS, or
// haskell-language-server-wrapper on PATH / in the usual install directories. A missing
// prerequisite exits nonzero and writes inspector-workflow/evidence.json with every
// flag false and the blocker. --fake-lsp can never produce realHls=true: it writes
// inspector-workflow/evidence.fake-lsp.json instead. Noisy logs go to inspector-workflow/logs/.
import { inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, accessSync, constants } from 'node:fs';
import { join, relative, delimiter } from 'node:path';

const repo = '/sandbox/hide';
const task = join(repo, 'inspector-workflow');
const fakeMode = process.argv.includes('--fake-lsp');
const binary = process.env.HIDE_SMOKE_BINARY ?? repo + '/dist-newstyle/build/aarch64-linux/ghc-9.14.1/hide-0.1.0.0/x/hide/build/hide/hide';
const fixture = join(repo, 'test/inspector-fixture');
const mainFile = join(fixture, 'app/Main.hs');
const shapesFile = join(fixture, 'src/Shapes.hs');
const evidencePath = join(task, fakeMode ? 'evidence.fake-lsp.json' : 'evidence.json');
const logDirectory = join(task, 'logs');
mkdirSync(logDirectory, { recursive: true });

const flags = { realHls: false, renderedSymbolUI: false, registeredAgentTool: false, definitionFollowed: false,
  referencesFollowed: false, backVerified: false, accessChecksPassed: false };
const evidence = { mode: fakeMode ? 'fake-lsp (NOT real HLS)' : 'real-hls', ...flags, commands: [], ui: [], agent: [], access: [] };
const logs = [];
const log = text => { logs.push(text); };
let state, child, bridge, sessionId;

function finish(code, blocker) {
  if (blocker) { evidence.blocker = blocker; console.error('BLOCKED: ' + blocker); }
  Object.assign(evidence, Object.fromEntries(Object.keys(flags).map(key => [key, code === 0 && evidence[key] === true])));
  if (code === 0 && !fakeMode) evidence.realHls = evidence.realHls === true;
  if (fakeMode) evidence.realHls = false;
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  writeFileSync(join(logDirectory, fakeMode ? 'run-fake-lsp.log' : 'run.log'), logs.join('\n') + '\n');
  cleanup();
  process.exit(code);
}
function cleanup() {
  // The remote daemon outlives its client; stop it and its language server by session id.
  try {
    const list = command => spawnSync('pgrep', command, { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
    if (sessionId) for (const pid of list(['-f', sessionId])) {
      if (pid === process.pid) continue;
      for (const kid of list(['-P', String(pid)])) try { process.kill(kid, 'SIGTERM'); } catch {}
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  } catch {}
  try { bridge?.stdin.end(); bridge?.kill('SIGTERM'); } catch {}
  try { if (child && child.exitCode === null) process.kill(-child.pid, 'SIGTERM'); } catch {}
  try { if (state) rmSync(state, { recursive: true, force: true }); } catch {}
}
const fail = message => { console.error('FAIL ' + message); finish(1, evidence.blocker); };
process.on('uncaughtException', error => { console.error(error.stack ?? String(error)); log(String(error.stack)); finish(1); });
process.on('SIGINT', () => finish(1));
process.on('SIGTERM', () => finish(1));
// Bounded: the whole acceptance may not run past 25 minutes.
setTimeout(() => { console.error('FAIL overall 25 minute bound exceeded'); finish(1); }, 25 * 60 * 1000).unref();

const sleep = ms => new Promise(r => setTimeout(r, ms));
function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: 'utf8', cwd: repo, timeout: options.timeout ?? 600000, env: options.env ?? process.env });
  evidence.commands.push(command + ' ' + args.join(' '));
  log(`$ ${command} ${args.join(' ')}  [${Date.now() - started} ms, exit ${result.status}]\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result;
}

// ---- prerequisites -------------------------------------------------------------------------
const baseEnv = { ...process.env, HOME: '/home/node', TERM: 'xterm-256color',
  PATH: ['/home/node/.ghcup/bin', '/home/node/.cabal/bin', process.env.PATH].join(delimiter) };
if (!existsSync(binary)) finish(2, 'The built editor is missing: ' + binary + ' (cabal build all --offline -j2 -f-window -f-web -f-terminal).');
if (!existsSync(mainFile) || !existsSync(shapesFile)) finish(2, 'Fixture missing: ' + fixture);

function findExecutable(name, directories) {
  for (const directory of directories) {
    const candidate = join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
}
let hls;
if (fakeMode) hls = join(repo, 'test/fake-lsp.mjs');
else {
  const searched = (baseEnv.PATH.split(delimiter)).concat(['/home/node/.ghcup/bin', '/home/node/.local/bin', '/usr/local/bin', '/usr/bin']);
  hls = process.env.THC_EDIT_HLS || findExecutable('haskell-language-server-wrapper', searched);
  if (!hls) finish(2, 'No installed haskell-language-server-wrapper found (searched $THC_EDIT_HLS, PATH, ~/.ghcup/bin, ~/.local/bin). '
    + 'Next action: provide a GHC 9.14.1-compatible HLS on PATH or via THC_EDIT_HLS and rerun this command. Nothing is downloaded or installed.');
  const version = spawnSync(hls, ['--version'], { encoding: 'utf8', env: baseEnv, timeout: 60000 });
  if (version.status !== 0) finish(2, `${hls} --version failed: ${version.stderr || version.error}`);
  evidence.hls = { executable: hls, version: (version.stdout + version.stderr).trim().split('\n')[0] };
  evidence.realHls = true;
}
evidence.fixture = { path: relative(repo, fixture), files: ['app/Main.hs', 'src/Shapes.hs'],
  sha: ['app/Main.hs', 'src/Shapes.hs'].map(file => file + ':' + spawnSync('git', ['hash-object', join(fixture, file)], { encoding: 'utf8', cwd: repo }).stdout.trim()) };

// ---- focused compiled admission / dispatch checks --------------------------------------------
{
  const flagsForCabal = ['--offline', '-j2', '-f-window', '-f-web', '-f-terminal'];
  const build = run('cabal', ['build', 'hide:test:inspector-checks', ...flagsForCabal], { env: baseEnv });
  if (build.status !== 0) finish(1, 'Could not build the focused inspector-checks suite.');
  const editorBuild = run('cabal', ['build', 'hide:exe:hide', ...flagsForCabal], { env: baseEnv });
  if (editorBuild.status !== 0) finish(1, 'Could not build the editor.');
  const located = run('cabal', ['list-bin', 'hide:test:inspector-checks', ...flagsForCabal], { env: baseEnv });
  const checks = run(located.stdout.trim(), [], { env: baseEnv, timeout: 300000 });
  evidence.focusedChecks = { command: 'inspector-checks', passed: checks.status === 0, output: checks.stdout.trim().split('\n').slice(-6) };
  if (checks.status !== 0) fail('focused inspector-checks failed');
  console.log('PASS focused inspector-checks (fake-LSP regression suite)');
}

// ---- the editor ------------------------------------------------------------------------------
state = mkdtempSync('/sandbox/hide-symbol-');
const env = { ...baseEnv, hide_datadir: repo, THC_EDIT_HLS: hls };
for (const [key, dir] of Object.entries({ XDG_DATA_HOME: 'data', XDG_CONFIG_HOME: 'config', XDG_STATE_HOME: 'state', XDG_CACHE_HOME: 'cache' })) {
  env[key] = join(state, dir); mkdirSync(env[key], { recursive: true });
}
// An authority file the editor keeps private from agents; opening it makes a private buffer.
const privateFile = join(state, 'thc.toml');
writeFileSync(privateFile, "# authority file\n");

child = spawn(binary, ['--remote'], { cwd: repo, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = Buffer.alloc(0), rows = [], lastFrame = 0, serial = 0, received = 0, protocolError, closed = false, exitCode;
sessionId = randomBytes(24).toString('hex');
function send(value) { const data = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(5); header.writeUInt32BE(data.length + 1); child.stdin.write(Buffer.concat([header, data])); }
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  try { while (buffer.length >= 4) {
    const n = buffer.readUInt32BE(0); if (n < 1 || n > 16777217) throw Error('Invalid packet size');
    if (buffer.length < 4 + n) break;
    const kind = buffer[4], payload = buffer.subarray(5, 4 + n); buffer = buffer.subarray(4 + n);
    if (kind === 0) { const message = JSON.parse(payload); if (message.type === 'error') throw Error(message.message); if (message.type === 'frame-ready') received = message.seq; }
    else {
      const tag = payload[0], dictionary = Buffer.from(JSON.stringify(rows)).subarray(-32768);
      const frame = JSON.parse(inflateRawSync(payload.subarray(1), { ...(tag ? { dictionary } : {}), maxOutputLength: 67108864 }));
      if (tag !== 2) rows = [];
      for (const [y, row] of frame.rows) rows[y] = row;
      lastFrame = Date.now();
    }
  } } catch (error) { protocolError = error; }
});
child.stderr.on('data', chunk => log('editor stderr: ' + chunk));
child.on('error', error => { closed = true; exitCode = 1; log(error.message); });
child.on('close', code => { closed = true; exitCode = code; });
send({ type: 'hello', version: 1, session: sessionId, client: randomBytes(24).toString('hex'), ack: 0,
  args: ["--size=120x40", mainFile, privateFile] });

// The display as one string per screen row, plus a cell index for each string index.
function screen() {
  return rows.map(row => {
    const cells = [];
    for (const span of row ?? []) {
      let x = span[0];
      for (const run of span[4]) {
        if (typeof run === 'string') for (const ch of run) cells[x++] = ch;
        else { cells[x] = run[0]; for (let k = 1; k < run[1]; k++) cells[x + k] = ''; x += run[1]; }
      }
    }
    let text = '', starts = [];
    for (let x = 0; x < cells.length; x++) { starts[text.length] = x; text += cells[x] ?? ' '; }
    return { text, starts };
  });
}
const text = () => screen().map(line => line.text).join('\n');
function find(pattern) {
  const lines = screen();
  for (let y = 0; y < lines.length; y++) {
    const match = pattern.exec(lines[y]?.text ?? '');
    if (match) { let i = match.index; while (i > 0 && lines[y].starts[i] === undefined) i--; return { x: lines[y].starts[i] ?? i, y, match }; }
  }
}
async function expect(pattern, label, seconds = 20) {
  const until = Date.now() + seconds * 1000;
  while (!(pattern.test(text()) && Date.now() - lastFrame >= 200)) {
    if (protocolError) throw protocolError;
    if (closed || Date.now() > until) { log('DISPLAY at failure of ' + label + ':\n' + text()); throw Error(label + ' not observed'); }
    await sleep(50);
  }
  console.log('PASS ' + label);
  const shown = text().split('\n').filter(line => pattern.test(line)).map(line => line.replace(/\s+$/, '').slice(0, 200));
  evidence.ui.push({ step: label, pattern: String(pattern), lines: shown.slice(0, 4) });
  log('--- ' + label + '\n' + text());
}
function input(events) { lastFrame = Date.now(); for (const event of events) send({ ...event, seq: ++serial, received }); }
const key = (name, mods = []) => [{ type: 'key', key: name, mods }];
const mouse = (button, x, y) => ['down', 'up'].map(action => ({ type: 'mouse', button, x, y, action, clicks: 1, mods: [] }));
async function click(pattern, label, button = 0, dx = 0) {
  const at = find(pattern);
  if (!at) { log('DISPLAY at failure of ' + label + ':\n' + text()); throw Error('cannot find ' + label + ' to click'); }
  input(mouse(button, at.x + dx, at.y));
  await sleep(150);
  return at;
}
// A row's own action: right-click the row, then take the first menu entry (Open).
async function openRow(pattern, label) {
  await click(pattern, label, 2);
  await expect(/Open/, 'row menu for ' + label);
  input(key('Enter'));
}

let passed = false;
try {
  await expect(/Main\.hs/, 'fixture buffer opens in the editor', 30);
  await expect(/thc\.toml/, 'the private authority file is open as the second window');
  input(key('1', ['alt']));  // Turbo-style window switch: make Main.hs the active window
  await expect(/print \(area \(Circle 2\)\)/, 'fixture source is rendered');

  // 1. Discoverable Inspect symbol on the caret's symbol (context menu), rendered.
  const attempts = fakeMode ? 1 : 6;
  let summaryOk = false;
  for (let attempt = 1; attempt <= attempts && !summaryOk; attempt++) {
    const area = find(/print \(area/);
    input(mouse(0, area.x + 10, area.y));  // inside "area": caret placement
    await sleep(200);
    input(mouse(2, area.x + 10, area.y));
    await expect(/Inspect symbol/, 'source context menu offers Inspect symbol');
    await click(/Inspect symbol/, 'Inspect symbol menu item');
    await expect(/area — app\/Main\.hs:9:10/, 'symbol inspector page is rendered for area (Summary view)', fakeMode ? 20 : 90);
    // The Type row shows what HLS reported; a failure is stated, not hidden.
    await click(/Type\s/, 'Type row');
    await sleep(300);
    const failed = /Unavailable:/.test(text()) || /No type information|has no type information/.test(text());
    if (failed && attempt < attempts) { log('HLS not ready (attempt ' + attempt + '); retrying'); evidence.ui.push({ step: 'retry after HLS not ready', attempt }); await sleep(20000); continue; }
    summaryOk = true;
  }
  if (!fakeMode) { await expect(/::/, 'the Type row shows a type signature from HLS'); }
  else await expect(/area :: Int|area :: Shape/, 'the Type row shows the (fake) signature');
  await expect(/Definitions: \d+/, 'summary counts definitions');
  await expect(/References: \d+/, 'summary counts references');
  evidence.renderedSymbolUI = true;

  // 2. Definition: switch view, open the site, Back, reopen.
  await openRow(/→ Definitions view/, 'Definitions view row');
  await expect(/area — 1 definition/, 'Definitions view lists one definition');
  const definitionLabel = find(/(src\/Shapes\.hs:(\d+):(\d+))/);
  if (!definitionLabel) throw Error('definition row not found');
  const [, definitionPlace, definitionLine, definitionColumn] = definitionLabel.match;
  evidence.definitionObserved = definitionPlace;
  await openRow(/src\/Shapes\.hs:\d+:\d+/, 'definition row');
  await expect(new RegExp('Definition: src/Shapes\\.hs:' + definitionLine + ':' + definitionColumn), 'definition site page');
  await expect(/Open in editor/, 'site page offers Open in editor');
  await openRow(/← Back/, 'Back row');
  await expect(/area — 1 definition/, 'Back restores the Definitions view the user chose');
  let backChecks = 1;

  // 3. References: switch view from Definitions, follow a reference in Main.hs, Back.
  await openRow(/→ References view/, 'References view row');
  await expect(/area — \d+ references?/, 'References view lists the uses');
  const referenceRow = find(/app\/Main\.hs:(\d+):(\d+)/);
  if (!referenceRow) throw Error('no reference in app/Main.hs found');
  const [referencePlace, referenceLine, referenceColumn] = referenceRow.match;
  evidence.referenceObserved = referencePlace;
  await openRow(/app\/Main\.hs:\d+:\d+/, 'reference row');
  await expect(new RegExp('Reference: ' + referencePlace.replace(/\./g, '\\.')), 'reference site page');
  await openRow(/← Back/, 'Back row from reference');
  await expect(/area — \d+ references?/, 'Back restores the References view');
  backChecks++;

  // 4. Navigate to the precise source location of a reference (this moves the editor).
  await openRow(/app\/Main\.hs:\d+:\d+/, 'reference row (again)');
  await expect(/Open in editor/, 'reference site page (again)');
  await openRow(/Open in editor/, 'Open in editor');
  await expect(new RegExp('═ ' + referenceLine + ':' + referenceColumn + ' '), 'editor caret is at the reference ' + referencePlace);
  evidence.referencesFollowed = true;

  // 5. Same for the definition: inspect again from the editor, follow, jump to Shapes.hs.
  {
    const area = find(/print \(area/);
    input(mouse(0, area.x + 10, area.y)); await sleep(200);
    input(key('F12', ['shift']));
    await expect(/area — app\/Main\.hs:9:10/, 'Shift+F12 also inspects the symbol', fakeMode ? 20 : 90);
    await openRow(/→ Definitions view/, 'Definitions view row (second run)');
    await expect(/area — 1 definition/, 'Definitions view again');
    await openRow(/src\/Shapes\.hs:\d+:\d+/, 'definition row (second run)');
    await expect(/Open in editor/, 'definition site page (second run)');
    await openRow(/Open in editor/, 'Open in editor (definition)');
    await expect(/Shapes\.hs/, 'the definition file is now the active editor buffer');
    await expect(new RegExp('═ ' + definitionLine + ':' + definitionColumn + ' '), 'editor caret is at the definition ' + definitionPlace);
    evidence.definitionFollowed = true;
  }
  evidence.backChecksInUI = backChecks;
  evidence.backVerified = backChecks === 2;

  // ---- the agent: registered tool through the real MCP dispatch/admission path -------------------
  bridge = spawn(binary, ['--mcp-editor', sessionId], { cwd: repo, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let pending = '', waiting = new Map(), nextId = 0;
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
  const rpc = (method, params, seconds = 120) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { waiting.delete(id); reject(Error('MCP ' + method + ' timed out')); }, seconds * 1000);
    waiting.set(id, message => { clearTimeout(timer); resolve(message); });
    bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const initialized = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'symbol-workflow-script', version: '1' } });
  if (!initialized.result?.capabilities?.tools) throw Error('bridge did not initialize');
  bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listed = (await rpc('tools/list', {})).result.tools.map(tool => tool.name);
  if (!listed.includes('inspect_symbol')) throw Error('inspect_symbol is not a registered tool: ' + listed.join(','));
  const schema = (await rpc('tools/list', {})).result.tools.find(tool => tool.name === 'inspect_symbol');
  evidence.agent.push({ step: 'tools/list registers inspect_symbol', actions: schema.inputSchema.properties.action.enum });
  console.log('PASS inspect_symbol is registered and listed through the MCP bridge');

  // The scripted client. Every result is parsed from the tool's text content.
  const attempt = async (name, args) => {
    const reply = await rpc('tools/call', { name, arguments: args });
    if (reply.error) return { ok: false, error: reply.error.message };
    const body = reply.result?.content?.[0]?.text ?? '';
    if (reply.result?.isError) return { ok: false, error: body };
    try { return { ok: true, value: JSON.parse(body) }; } catch { return { ok: false, error: 'not JSON: ' + body.slice(0, 200) }; }
  };
  const call = async (args, label) => {
    const result = await attempt('inspect_symbol', args);
    evidence.agent.push({ step: label, request: args, ok: result.ok, ...(result.ok ? { view: result.value.view, labels: (result.value.document?.items ?? []).map(item => item.label).slice(0, 8) } : { error: result.error }) });
    log('agent ' + label + ': ' + JSON.stringify(result).slice(0, 2000));
    return result;
  };
  const buffers = (await attempt('list_buffers', {})).value?.buffers ?? [];
  log('list_buffers: ' + JSON.stringify(buffers));
  const mainBuffer = buffers.find(item => item.path && item.path.endsWith('app/Main.hs'));
  const privateBuffer = buffers.find(item => item.title === '[private]');
  if (!mainBuffer) throw Error('Main.hs is not listed as a buffer: ' + JSON.stringify(buffers));
  const sourceLines = readFileSync(mainFile, 'utf8').split('\n');
  const line = sourceLines.findIndex(text => text.includes('print (area (Circle 2))')) + 1;
  const column = sourceLines[line - 1].indexOf('area') + 1;
  const probe = (await call({ action: 'discover', bufferId: mainBuffer.bufferId, line, column }, 'discover position')).value;
  if (!probe?.position?.eligible || probe.position.symbol !== 'area') throw Error('discover did not find area: ' + JSON.stringify(probe));

  let first;
  for (let tries = 1; tries <= (fakeMode ? 1 : 8); tries++) {
    first = await call({ action: 'inspect', bufferId: mainBuffer.bufferId, line, column }, 'inspect area (try ' + tries + ')');
    if (!first.ok) throw Error('inspect failed: ' + first.error);
    const status = first.value.report;
    if (status.hover.status === 'available' && status.definitions.status === 'available') break;
    log('HLS not ready for the agent yet: ' + JSON.stringify(status)); await sleep(20000);
  }
  const report = first.value.report;
  if (report.definitions.status !== 'available' || report.references.status !== 'available') throw Error('HLS gave no definitions/references: ' + JSON.stringify(report));
  const typeRow = first.value.document.items.find(item => item.label === 'Type');
  const definitions = (await call({ action: 'view', page: first.value.page, view: 'hide.symbol.definitions' }, 'view definitions')).value;
  const defSite = (await call({ action: 'follow', page: definitions.page, row: 0 }, 'follow the definition row')).value;
  const defLocation = (await call({ action: 'follow', page: defSite.page, row: 0 }, 'open the definition location (verified against current text)')).value.location;
  const backToDefinitions = (await call({ action: 'back', page: defSite.page }, 'back from the definition site')).value;
  const references = (await call({ action: 'view', page: backToDefinitions.page, view: 'hide.symbol.references' }, 'view references')).value;
  const referenceItems = references.document.items;
  const referenceLocations = [];
  for (const [row, item] of referenceItems.entries()) {
    if (!item.action) continue;
    const site = (await call({ action: 'follow', page: references.page, row }, 'follow reference row ' + row)).value;
    const where = (await call({ action: 'follow', page: site.page, row: 0 }, 'open reference location ' + item.label)).value.location;
    referenceLocations.push(where);
  }
  // Agent and human describe the same relation.
  if (!/Shapes\.hs$/.test(defLocation.path) || !/^area\b/.test(defLocation.text)) throw Error('agent definition location is not area: ' + JSON.stringify(defLocation));
  if (!referenceLocations.some(item => item.path.endsWith('app/Main.hs')) || referenceLocations.length < 2) throw Error('agent references incomplete');
  if (defLocation.line !== Number(definitionLine)) throw Error(`agent definition line ${defLocation.line} differs from the UI's ${definitionLine}`);
  evidence.registeredAgentTool = true;
  console.log('PASS registered agent tool investigation: discover, inspect, view, follow, back, follow');

  // ---- access checks over the same live editor ------------------------------------------------
  const access = [];
  const forged = await call({ action: 'view', page: 'ffffffffffffffffffffffffffffffffffffffffffffffff', view: 'hide.symbol.summary' }, 'forged page token');
  access.push(['a forged page token is refused', !forged.ok && /Unknown or expired page/.test(forged.error)]);
  if (privateBuffer) {
    const refused = await call({ action: 'inspect', bufferId: privateBuffer.bufferId, line: 1, column: 1 }, 'inspect a private buffer');
    access.push(['a private buffer (agent authority file) cannot be inspected', !refused.ok && /private to the user/.test(refused.error)]);
  } else access.push(['a private buffer (agent authority file) cannot be inspected', false]);
  const foreign = await call({ action: 'inspect', bufferId: mainBuffer.bufferId, line: 1, column: 1 }, 'inspect position without a symbol');
  access.push(['an out-of-place position is refused', !foreign.ok]);
  // Edit the buffer in the UI: every page of the old revision must expire.
  input(key('1', ['alt'])); await sleep(300);  // back to the Main.hs window the pages belong to
  await expect(/print \(area \(Circle 2\)\)/, 'Main.hs is the active window again');
  await click(/print \(area/, 'editor text', 0, 3);
  input(key('End')); await sleep(100); input(key('x'));
  await sleep(500);
  const edited = await call({ action: 'view', page: references.page, view: 'hide.symbol.summary' }, 'old page after the buffer was edited');
  access.push(['editing the buffer expires earlier inspections', !edited.ok && /expired/.test(edited.error)]);
  const stale = await call({ action: 'inspect', bufferId: mainBuffer.bufferId, line, column, revision: report.revision }, 'inspect with the old revision');
  access.push(['a stale revision argument is refused', !stale.ok && /revision changed/.test(stale.error)]);
  input(key('z', ['ctrl'])); await sleep(500);
  evidence.access = access.map(([name, ok]) => ({ name, ok }));
  for (const [name, ok] of access) { if (!ok) throw Error('access check failed: ' + name); console.log('PASS ' + name); }
  evidence.accessChecksPassed = evidence.focusedChecks.passed && access.every(([, ok]) => ok);

  // ---- the grounded investigation --------------------------------------------------------------
  const rel = path => relative(repo, path);
  const uses = referenceLocations.filter(item => !(item.path === defLocation.path && item.line === defLocation.line));
  const locations = [`${rel(defLocation.path)}:${defLocation.line}`, ...uses.map(item => `${rel(item.path)}:${item.line}`)];
  evidence.investigation = {
    symbol: report.symbol,
    explanation: `\`${report.symbol}\` ${typeRow ? '(' + typeRow.detail.replace(/\s+/g, ' ').trim().split(' Fake hover.')[0] + ') ' : ''}is defined at ${rel(defLocation.path)}:${defLocation.line} (\`${defLocation.text}\`) and is used at ` +
      uses.map(item => `${rel(item.path)}:${item.line} (\`${item.text}\`)`).join(', ') + '. Locations come from inspect_symbol follow results, each re-verified against current text.',
    locations,
    method: 'scripted MCP tool client (test/inspector-symbol-workflow.mjs); no autonomous LLM session',
  };
  if (!locations.every(location => /\S+:\d+$/.test(location))) throw Error('bad locations');
  passed = true;
} catch (error) { console.error('FAIL ' + (error.stack ?? error)); log(String(error.stack ?? error)); }

// ---- shutdown -----------------------------------------------------------------------------------
try { bridge?.stdin.end(); } catch {}
if (!closed) { input(key('Escape')); await sleep(200); input(key('x', ['alt'])); await sleep(500);
  if (!closed) { input(key('d')); await sleep(300); }  // discard any prompt about the scratch edit
}
const until = Date.now() + 8000; while (!closed && Date.now() < until) await sleep(50);
if (!closed) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} evidence.shutdown = 'forced'; if (passed) { passed = false; console.error('FAIL editor did not exit cleanly'); } }
else { evidence.shutdown = exitCode === 0 ? 'clean' : 'exit ' + exitCode; if (exitCode !== 0) passed = false; }
if (passed) {
  for (const key of Object.keys(flags)) if (key !== 'realHls') evidence[key] = evidence[key] === true;
  evidence.realHls = !fakeMode;
  console.log(fakeMode ? 'PASS inspector symbol workflow (FAKE LSP dry run; evidence.fake-lsp.json; not a real-HLS result)'
    : 'PASS inspector symbol workflow with real HLS');
  finish(0);
} else finish(1);
