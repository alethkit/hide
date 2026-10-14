// SPDX-FileCopyrightText: 2026 Edward Kmett
// SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
//
// Rendered check that a long Files tree cannot hide the package section. A deterministic temporary project
// (64 top-level directories plus a one-package .cabal) is the editor's working directory, so the result does not
// depend on the checkout's own directory count. Files stays expanded in a normal 120x40 window.
import { inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = '/sandbox/hide';
const binary = process.env.HIDE_SMOKE_BINARY ?? repo + '/dist-newstyle/build/aarch64-linux/ghc-9.14.1/hide-0.1.0.0/x/hide/build/hide/hide';
const state = mkdtempSync('/sandbox/hide-sidebar-scroll-');
const project = mkdtempSync('/sandbox/hide-sidebar-fixture-');
const packageName = 'scrolltree';
for (let i = 1; i <= 64; i++) mkdirSync(join(project, 'dir' + String(i).padStart(2, '0')));
mkdirSync(join(project, 'src'));
writeFileSync(join(project, packageName + '.cabal'), `cabal-version: 3.0
name: ${packageName}
version: 0.1.0.0
build-type: Simple

library
  exposed-modules: Scrolltree
  hs-source-dirs: src
  build-depends: base
  default-language: Haskell2010
`);
writeFileSync(join(project, 'src', 'Scrolltree.hs'), 'module Scrolltree where\nanswer :: Int\nanswer = 42\n');

const env = { ...process.env, HOME: '/home/node', TERM: 'xterm-256color', hide_datadir: repo,
  PATH: '/home/node/.ghcup/bin:/home/node/.cabal/bin:' + process.env.PATH };
for (const [key, dir] of Object.entries({ XDG_DATA_HOME: 'data', XDG_CONFIG_HOME: 'config', XDG_STATE_HOME: 'state', XDG_CACHE_HOME: 'cache' })) {
  env[key] = join(state, dir); mkdirSync(env[key], { recursive: true });
}
const child = spawn(binary, ['--remote'], { cwd: project, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
let text = '', closed = false, exitCode, buffer = Buffer.alloc(0), rows = [], lastFrame = 0, serial = 0, received = 0, protocolError;
function send(value) { const data = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(5); header.writeUInt32BE(data.length + 1); child.stdin.write(Buffer.concat([header, data])); }
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  try {
    while (buffer.length >= 4) {
      const n = buffer.readUInt32BE(0); if (n < 1 || n > 16777217) throw Error('Invalid packet size');
      if (buffer.length < 4 + n) break;
      const kind = buffer[4], payload = buffer.subarray(5, 4 + n); buffer = buffer.subarray(4 + n);
      if (kind === 0) {
        const message = JSON.parse(payload); if (message.type === 'error') throw Error(message.message);
        if (message.type === 'frame-ready') received = message.seq;
      } else {
        const tag = payload[0], dictionary = Buffer.from(JSON.stringify(rows)).subarray(-32768);
        const frame = JSON.parse(inflateRawSync(payload.subarray(1), { ...(tag ? { dictionary } : {}), maxOutputLength: 67108864 }));
        if (tag !== 2) rows = [];
        for (const [y, row] of frame.rows) rows[y] = row;
        lastFrame = Date.now();
        text = rows.map(row => row.flatMap(span => span[4].map(run => typeof run === 'string' ? run : run[0])).join('')).join('\n');
      }
    }
  } catch (error) { protocolError = error; }
});
send({ type: 'hello', version: 1, session: randomBytes(24).toString('hex'), client: randomBytes(24).toString('hex'), ack: 0, args: ['--size=120x40'] });
child.stderr.on('data', chunk => { text += chunk; });
child.on('error', error => { text += error.message; closed = true; exitCode = 1; });
child.on('close', code => { closed = true; exitCode = code; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Only a settled display is judged, so a stale or half-applied frame cannot satisfy a step.
async function expect(pattern, label) {
  const until = Date.now() + 15000;
  while (!(pattern.test(text) && Date.now() - lastFrame >= 200)) {
    if (protocolError) throw protocolError;
    if (closed || Date.now() > until) throw Error(label + ' not observed. Display:\n' + text);
    await sleep(50);
  }
  console.log('PASS ' + label);
}
async function expectAbsent(pattern, label) {
  await sleep(400); if (protocolError) throw protocolError;
  if (closed) throw Error(label + ' interrupted by exit');
  if (pattern.test(text)) throw Error(label + ' failed. Display:\n' + text);
  console.log('PASS ' + label);
}
function input(events) { text = ''; lastFrame = Date.now(); for (const event of events) send({ ...event, seq: ++serial, received }); }
const key = (name, mods = []) => [{ type: 'key', key: name, mods }];
const mouse = (button, x, y) => ['down', 'up'].map(action => ({ type: 'mouse', button, x: x - 1, y: y - 1, action, clicks: 1, mods: [] }));
const wheel = (direction, x, y, count) => Array.from({ length: count }, () => ({ type: 'mouse', button: 0, x: x - 1, y: y - 1, action: 'wheel-' + direction, clicks: 0, mods: [] }));
const rootRow = new RegExp('^ [▶▼] ' + packageName + '(\\s|$|║)', 'm');
const cue = /↓ \d+ more sections?/;
const screenLines = () => text.split('\n');
const find = pattern => { const y = screenLines().findIndex(line => pattern.test(line)); if (y < 0) throw Error('row not found: ' + pattern + '\n' + text); return y + 1; };
let passed = false;
try {
  await expect(/▼ Files/, 'Files starts expanded');
  await expect(/dir01[\s\S]*dir30/, 'long Files tree is shown (nothing collapsed)');
  const treeRows = screenLines().filter(line => /^ [├└]/.test(line)).length;
  if (treeRows < 30) throw Error('Files tree is not long at this viewport: ' + treeRows + ' rows\n' + text);
  console.log('PASS Files tree fills the sidebar (' + treeRows + ' rows at 120x40)');
  await expectAbsent(rootRow, 'package section is below the viewport at first');
  await expect(cue, 'cue says more sections exist below (sidebar unfocused)');
  await expect(/▲[\s\S]*▼/, 'scrollbar is visible while the sidebar is unfocused');

  input(wheel('down', 5, 10, 40)); await expect(rootRow, 'wheel reaches the package section');
  await expectAbsent(cue, 'cue disappears when every section is visible');
  input(wheel('up', 5, 10, 60)); await expect(cue, 'wheel back to the top restores the cue');
  await expectAbsent(rootRow, 'package section hidden again at the top');

  input(mouse(0, 5, 2)); await expect(rootRow, 'clicking the cue reaches the package section');
  input(wheel('up', 5, 10, 60)); await expect(cue, 'scrolled back to the top for keyboard check');

  // Keyboard: focus the tree through a Files row, then End, Home and Ctrl+Down.
  input(mouse(0, 5, 4)); await expect(/▲/, 'sidebar focused through a Files row');
  input(key('End')); await expect(rootRow, 'End reaches the package section');
  input(key('Home')); await expect(cue, 'Home returns to the top with the cue');
  const sections = Number(/↓ (\d+) more section/.exec(text)[1]);
  const walk = []; for (let i = 0; i < sections; i++) walk.push(...key('ArrowDown', ['ctrl']));
  input(walk); await expect(rootRow, 'Ctrl+Down walks section headers to the package section');
  await expectAbsent(cue, 'no cue once the last section is selected');

  // The viewport stays valid across resize: a smaller window hides the package again and the cue says so.
  send({ type: 'resize', width: 120, height: 30, seq: ++serial, received });
  await expect(cue, 'shrinking to 120x30 hides the package and the cue returns');
  input(mouse(0, 5, 2)); await expect(rootRow, 'cue click reaches the package at 120x30');
  send({ type: 'resize', width: 120, height: 40, seq: ++serial, received });
  await expect(rootRow, 'package row stays reachable after growing back to 120x40');
  await expectAbsent(cue, 'no cue once the grown window shows every section');

  // Context menu and inspector from the reached package row.
  input(mouse(2, 7, find(rootRow))); await expect(/│ Inspect +│/, 'package context menu offers Inspect');
  const menuY = find(/│ Inspect +│/), menuX = screenLines()[menuY - 1].indexOf('│ Inspect') + 4;
  input(mouse(0, menuX, menuY)); await expect(new RegExp(packageName + ' — \\d+ components?'), 'package inspector opens');
  passed = true;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (!closed) { input(key('Escape')); await sleep(150); input(key('x', ['alt'])); }
  const until = Date.now() + 5000; while (!closed && Date.now() < until) await sleep(50);
  if (!closed) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} process.exitCode = 1; console.error('Display did not exit cleanly; retained state: ' + state + ' and ' + project); }
  else {
    rmSync(state, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true });
    if (exitCode !== 0) { process.exitCode = 1; console.error('Display exited with code ' + exitCode); }
  }
}
if (passed && !process.exitCode) console.log('PASS sidebar scroll runtime; editor exited cleanly');
