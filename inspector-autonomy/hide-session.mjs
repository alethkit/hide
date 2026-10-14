#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Edward Kmett
// SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
//
// Interactive harness for the sidebar-autonomy campaign.
//
// It keeps ONE real hide editor (remote display protocol) and ONE `hide --mcp-editor` bridge alive
// in a background daemon, so an agent can issue a single registered-tool call or UI input per shell
// command, read the answer, and decide the next step. Every call is appended to
//   inspector-autonomy/evidence/tool-calls.jsonl
// with its request, response and time. The campaign checker judges that transcript, so do not edit it.
//
//   node inspector-autonomy/hide-session.mjs start [--size=120x40] [--cwd DIR] [FILE ...]
//   node inspector-autonomy/hide-session.mjs status | stop
//   node inspector-autonomy/hide-session.mjs screen [--save NAME] [--wait MS]
//   node inspector-autonomy/hide-session.mjs key NAME [shift|ctrl|alt ...]
//   node inspector-autonomy/hide-session.mjs click X Y [left|right]      (1-based screen cells)
//   node inspector-autonomy/hide-session.mjs wheel up|down X Y [COUNT]
//   node inspector-autonomy/hide-session.mjs mcp tools/list
//   node inspector-autonomy/hide-session.mjs mcp tools/call TOOL_NAME '{"json":"arguments"}'
//   node inspector-autonomy/hide-session.mjs mcp RAW_METHOD '{"json":"params"}'
//
// Child process lifetime: `stop` (or the daemon's own 40 minute watchdog) ends the editor and bridge.
import { inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const evidenceDir = join(here, 'evidence');
const transcript = join(evidenceDir, 'tool-calls.jsonl');
const stateFile = '/sandbox/hide-autonomy-session.json';
const binary = process.env.HIDE_SMOKE_BINARY ?? repo + '/dist-newstyle/build/aarch64-linux/ghc-9.14.1/hide-0.1.0.0/x/hide/build/hide/hide';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);

function log(record) {
  mkdirSync(evidenceDir, { recursive: true });
  appendFileSync(transcript, JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
}

// ------------------------------------------------------------------------------------------ client
async function ask(request, seconds = 130) {
  if (!existsSync(stateFile)) throw Error('no session: run `start` first');
  const { socket } = JSON.parse(readFileSync(stateFile, 'utf8'));
  return new Promise((ok, fail) => {
    const connection = net.connect(socket);
    let data = '';
    const timer = setTimeout(() => { connection.destroy(); fail(Error('timed out waiting for the session daemon')); }, seconds * 1000);
    connection.on('connect', () => connection.write(JSON.stringify(request) + '\n'));
    connection.on('data', chunk => { data += chunk; });
    connection.on('error', error => { clearTimeout(timer); fail(error); });
    connection.on('close', () => { clearTimeout(timer); try { ok(JSON.parse(data)); } catch { fail(Error('bad daemon reply: ' + data.slice(0, 300))); } });
  });
}

function option(name, fallback) {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const value = argv[i + 1]; argv.splice(i, 2); return value;
}

async function client() {
  const command = argv[0];
  if (command === 'start') {
    const rest = argv.slice(1);
    let size = '120x40', cwd = repo; const files = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].startsWith('--size=')) size = rest[i].slice(7);
      else if (rest[i] === '--cwd') cwd = resolve(rest[++i]);
      else files.push(rest[i]);
    }
    if (existsSync(stateFile)) {
      try { process.kill(JSON.parse(readFileSync(stateFile, 'utf8')).pid, 0); throw Error('a session is already running; stop it first'); }
      catch (error) { if (/already running/.test(error.message)) throw error; rmSync(stateFile, { force: true }); }
    }
    const daemon = spawn(process.execPath, [fileURLToPath(import.meta.url), '--daemon', size, cwd, ...files], { detached: true, stdio: 'ignore' });
    daemon.unref();
    for (let i = 0; i < 300 && !existsSync(stateFile); i++) await sleep(100);
    if (!existsSync(stateFile)) throw Error('session daemon did not become ready');
    console.log('session started: ' + readFileSync(stateFile, 'utf8'));
    return;
  }
  if (command === 'status') {
    if (!existsSync(stateFile)) { console.log('no session'); return; }
    console.log(readFileSync(stateFile, 'utf8')); return;
  }
  if (command === 'stop') {
    if (!existsSync(stateFile)) { console.log('no session'); return; }
    try { console.log(JSON.stringify(await ask({ op: 'stop' }, 30))); } catch (error) { console.log('stop: ' + error.message); }
    const pid = JSON.parse(readFileSync(stateFile, 'utf8')).pid;
    await sleep(500);
    try { process.kill(pid, 'SIGTERM'); } catch {}
    rmSync(stateFile, { force: true });
    return;
  }
  if (command === 'screen') {
    const save = option('--save'); const wait = Number(option('--wait', 300));
    const reply = await ask({ op: 'screen', wait, save });
    process.stdout.write(reply.screen + '\n');
    if (save) console.error('saved evidence/screens/' + save + '.txt');
    return;
  }
  if (command === 'key') { console.log(JSON.stringify(await ask({ op: 'key', key: argv[1], mods: argv.slice(2) }))); return; }
  if (command === 'click') {
    console.log(JSON.stringify(await ask({ op: 'click', x: Number(argv[1]), y: Number(argv[2]), button: argv[3] ?? 'left' }))); return;
  }
  if (command === 'wheel') {
    console.log(JSON.stringify(await ask({ op: 'wheel', direction: argv[1], x: Number(argv[2]), y: Number(argv[3]), count: Number(argv[4] ?? 1) }))); return;
  }
  if (command === 'mcp') {
    const method = argv[1] === 'tools/list' ? 'tools/list' : argv[1];
    let params = {};
    if (method === 'tools/call') params = { name: argv[2], arguments: argv[3] ? JSON.parse(argv[3]) : {} };
    else if (argv[2]) params = JSON.parse(argv[2]);
    const reply = await ask({ op: 'mcp', method, params });
    console.log(JSON.stringify(reply.response, null, 1));
    return;
  }
  throw Error('usage: see the header of ' + fileURLToPath(import.meta.url));
}

// ------------------------------------------------------------------------------------------ daemon
async function daemon() {
  const [, size, cwd, ...files] = argv;
  const state = mkdtempSync('/sandbox/hide-autonomy-');
  const env = { ...process.env, HOME: '/home/node', TERM: 'xterm-256color', hide_datadir: repo,
    PATH: '/sandbox/hls-ghcup/bin:/home/node/.ghcup/bin:/home/node/.cabal/bin:' + process.env.PATH,
    THC_EDIT_HLS: process.env.THC_EDIT_HLS ?? '/sandbox/hls-ghcup/bin/haskell-language-server-wrapper',
    GHC_BIN: process.env.GHC_BIN ?? '/home/node/.ghcup/bin/ghc' };
  for (const [key, dir] of Object.entries({ XDG_DATA_HOME: 'data', XDG_CONFIG_HOME: 'config', XDG_STATE_HOME: 'state', XDG_CACHE_HOME: 'cache' })) {
    env[key] = join(state, dir); mkdirSync(env[key], { recursive: true });
  }
  const sessionId = randomBytes(24).toString('hex');
  const child = spawn(binary, ['--remote'], { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = Buffer.alloc(0), rows = [], received = 0, serial = 0, lastFrame = 0, screen = '', closed = false, tail = '';
  const send = value => { const data = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(5); header.writeUInt32BE(data.length + 1); child.stdin.write(Buffer.concat([header, data])); };
  child.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    try {
      while (buffer.length >= 4) {
        const n = buffer.readUInt32BE(0); if (n < 1 || n > 16777217) throw Error('Invalid packet size');
        if (buffer.length < 4 + n) break;
        const kind = buffer[4], payload = buffer.subarray(5, 4 + n); buffer = buffer.subarray(4 + n);
        if (kind === 0) { const message = JSON.parse(payload); if (message.type === 'frame-ready') received = message.seq; }
        else {
          const tag = payload[0], dictionary = Buffer.from(JSON.stringify(rows)).subarray(-32768);
          const frame = JSON.parse(inflateRawSync(payload.subarray(1), { ...(tag ? { dictionary } : {}), maxOutputLength: 67108864 }));
          if (tag !== 2) rows = [];
          for (const [y, row] of frame.rows) rows[y] = row;
          lastFrame = Date.now();
          screen = rows.map(row => row.flatMap(span => span[4].map(run => typeof run === 'string' ? run : run[0])).join('')).join('\n');
        }
      }
    } catch (error) { tail += 'protocol: ' + error.message; }
  });
  child.stderr.on('data', chunk => { tail = (tail + chunk).slice(-4000); });
  child.on('close', () => { closed = true; });
  send({ type: 'hello', version: 1, session: sessionId, client: randomBytes(24).toString('hex'), ack: 0, args: ['--size=' + size, ...files] });

  // --- MCP bridge: the registered tool path, one request at a time -------------------------------
  let bridge, pending = '', nextId = 0; const waiting = new Map();
  async function rpc(method, params, seconds = 120) {
    if (!bridge) {
      bridge = spawn(binary, ['--mcp-editor', sessionId], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      bridge.stdout.on('data', chunk => {
        pending += chunk; let newline;
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
          if (!line.trim()) continue;
          const message = JSON.parse(line); waiting.get(message.id)?.(message); waiting.delete(message.id);
        }
      });
      bridge.stderr.on('data', chunk => { tail = (tail + 'bridge: ' + chunk).slice(-4000); });
      await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'pi-ralph-agent-session', version: '1' } }, 60);
      bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    }
    return call(method, params, seconds);
  }
  const call = (method, params, seconds) => new Promise((ok, fail) => {
    const id = ++nextId;
    const timer = setTimeout(() => { waiting.delete(id); fail(Error('MCP ' + method + ' timed out')); }, seconds * 1000);
    waiting.set(id, message => { clearTimeout(timer); ok(message); });
    bridge.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  const mods = list => list.filter(m => ['shift', 'ctrl', 'alt'].includes(m));
  const input = events => { for (const event of events) send({ ...event, seq: ++serial, received }); };
  async function settle(wait) { const until = Date.now() + 15000; await sleep(wait); while (Date.now() - lastFrame < wait && Date.now() < until) await sleep(50); }

  const server = net.createServer(connection => {
    let data = '';
    connection.on('data', chunk => {
      data += chunk; if (!data.includes('\n')) return;
      const request = JSON.parse(data); data = '';
      (async () => {
        const reply = value => connection.end(JSON.stringify(value));
        if (closed) return reply({ error: 'editor exited. ' + tail });
        try {
          if (request.op === 'screen') {
            await settle(request.wait ?? 300);
            if (request.save) {
              mkdirSync(join(evidenceDir, 'screens'), { recursive: true });
              writeFileSync(join(evidenceDir, 'screens', request.save.replace(/[^\w.-]/g, '_') + '.txt'), screen + '\n');
            }
            log({ kind: 'screen', save: request.save ?? null, size });
            return reply({ screen });
          }
          if (request.op === 'key') { input([{ type: 'key', key: request.key, mods: mods(request.mods ?? []) }]); log({ kind: 'key', key: request.key, mods: request.mods ?? [] }); await settle(300); return reply({ ok: true }); }
          if (request.op === 'click') {
            const button = request.button === 'right' ? 2 : 0;
            input(['down', 'up'].map(action => ({ type: 'mouse', button, x: request.x - 1, y: request.y - 1, action, clicks: 1, mods: [] })));
            log({ kind: 'click', x: request.x, y: request.y, button: request.button }); await settle(300); return reply({ ok: true });
          }
          if (request.op === 'wheel') {
            for (let i = 0; i < (request.count || 1); i++) input([{ type: 'mouse', button: 0, x: request.x - 1, y: request.y - 1, action: 'wheel-' + request.direction, clicks: 0, mods: [] }]);
            log({ kind: 'wheel', direction: request.direction, x: request.x, y: request.y, count: request.count }); await settle(300); return reply({ ok: true });
          }
          if (request.op === 'mcp') {
            const response = await rpc(request.method, request.params);
            log({ kind: 'mcp', method: request.method, params: request.params, response: JSON.stringify(response).length > 60000 ? { truncated: true, text: JSON.stringify(response).slice(0, 60000) } : response });
            return reply({ response });
          }
          if (request.op === 'stop') { reply({ ok: true }); setTimeout(shutdown, 100); return; }
          reply({ error: 'unknown op' });
        } catch (error) { reply({ error: error.message, tail }); }
      })();
    });
  });
  const socket = join(state, 'ctl.sock');
  async function shutdown() {
    try { bridge?.kill('SIGTERM'); } catch {}
    if (!closed) { send({ type: 'key', key: 'Escape', mods: [], seq: ++serial, received }); await sleep(150); send({ type: 'key', key: 'x', mods: ['alt'], seq: ++serial, received }); await sleep(1500); }
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    rmSync(stateFile, { force: true }); rmSync(state, { recursive: true, force: true });
    process.exit(0);
  }
  server.listen(socket, () => writeFileSync(stateFile, JSON.stringify({ pid: process.pid, socket, sessionId, size, cwd })));
  setTimeout(shutdown, 40 * 60 * 1000);
  process.on('SIGTERM', shutdown);
}

if (argv[0] === '--daemon') await daemon(); else await client().catch(error => { console.error(error.message); process.exitCode = 1; });
