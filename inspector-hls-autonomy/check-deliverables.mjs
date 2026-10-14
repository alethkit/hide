#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Edward Kmett
// SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
//
// Completion gate for the HLS-autonomy campaign. Protected: the campaign may not edit it, and its
// requirements are not to be weakened after a failure.
//
// Completion needs ALL of:
//  * HLS answering inside the running editor on hide's OWN source: a successful inspect_symbol inspect with
//    available hover, definitions and references; a followed definition AND a followed reference, each a
//    verified location whose actual source line (read from the checkout) names the symbol; and Back.
//  * the investigation made by a Pi agent: every recorded call carries the shell ancestry of its caller
//    (a single `hide-session.mjs` invocation from a `pi` process, no loops/scripts), calls are spaced like agent
//    turns, page tokens and rows are taken from earlier responses, and notes cite returned locations.
//  * an explanation grounded in those locations; the HLS setup committed; regression checks kept; no sessions left.
// A source-search fallback or `hlsOnHide: false` can never satisfy it.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const fail = message => { throw Error(message); };
const sha = line => createHash('sha256').update(line).digest('hex');
const AGENT_STEP_SECONDS = 1.5;

// Parse a tools/call response into its JSON payload (null when it is an error).
export function payload(record) {
  const result = record.response?.result;
  if (!result || result.isError || record.response?.error || record.response?.truncated) return null;
  const text = result.content?.[0]?.text;
  try { const value = JSON.parse(text); return value && typeof value === 'object' ? value : null; } catch { return null; }
}

export function analyze(records, repo, readSource) {
  const lineAt = (path, line) => {
    const text = readSource(path);
    if (text === null) return null;
    return text.split('\n')[line - 1] ?? null;
  };
  const inRepo = path => typeof path === 'string' && path.startsWith(repo + '/') && !/\/(dist-newstyle|\.git|\.deps)\//.test(path) && /\.hs$/.test(path);
  const rel = path => path.slice(repo.length + 1);

  // ---- chain integrity -----------------------------------------------------------------------------
  let prev = 'GENESIS';
  records.forEach((r, i) => {
    if (r.seq !== i || r.prev !== prev) fail('Transcript chain broken at record ' + i + ' (edited, reordered or deleted)');
    prev = sha(r.__line);
  });

  // ---- one editor session, started at hide's own checkout ------------------------------------------
  const startIndex = records.map(r => r.kind).lastIndexOf('start');
  if (startIndex < 0) fail('No recorded editor session start');
  const start = records[startIndex];
  if (start.cwd !== repo) fail('The investigated editor must run in ' + repo + ', not ' + start.cwd);
  if (start.hls !== '/sandbox/hls-ghcup/bin/haskell-language-server-wrapper') fail('HLS must be the installed wrapper, got ' + start.hls);
  if (start.envValues?.THC_EDIT_HLS) fail('THC_EDIT_HLS may not be overridden');
  const session = records.slice(startIndex + 1);
  if (session.some(r => r.kind === 'start')) fail('internal: multiple starts');
  const stopIndex = session.findIndex(r => r.kind === 'stop');
  const live = stopIndex < 0 ? session : session.slice(0, stopIndex);
  const calls = live.filter(r => r.kind === 'mcp' && r.method === 'tools/call');
  const listing = live.find(r => r.kind === 'mcp' && r.method === 'tools/list' && r.response?.result?.tools);
  if (!listing) fail('No tools/list recorded in the final editor session (the agent must discover the tools)');
  const names = listing.response.result.tools.map(t => t.name);
  for (const need of ['inspect_symbol', 'lsp_definition', 'lsp_references', 'list_buffers']) if (!names.includes(need)) fail('Discovery lacks ' + need);

  // ---- agent provenance -----------------------------------------------------------------------------
  const driven = live.filter(r => ['mcp', 'note', 'screen', 'click', 'key', 'wheel'].includes(r.kind));
  for (const r of driven) {
    const shell = r.ancestry?.[0] ?? '';
    if (!/hide-session\.mjs/.test(shell)) fail('Record ' + r.seq + ' was not issued through hide-session.mjs from a shell: ' + shell.slice(0, 120));
    if ((shell.match(/hide-session\.mjs/g) ?? []).length > 3) fail('Record ' + r.seq + ': too many helper calls in one shell command');
    if (/\b(for|while|until)\b[^\n;]*\bdo\b|\bxargs\b|\bnode\s+-e\b|\bnode\s+--eval\b|\bpython3?\b|\bperl\b|\bruby\b|\bsleep\s+[0-9]+\s*;\s*while|\bnode\s+(?!\S*hide-session\.mjs)\S+\.m?js\b|<<-?\s*'?[A-Za-z]/.test(shell))
      fail('Record ' + r.seq + ' came from a loop/script, not a single agent-issued call: ' + shell.slice(0, 160));
    if (!r.ancestry.slice(1).some(a => /^pi(\s|$)/.test(a) || /\/pi(\s|$)/.test(a) || /pi-coding-agent/.test(a))) fail('Record ' + r.seq + ' has no Pi process in its ancestry: ' + JSON.stringify(r.ancestry.map(a => a.slice(0, 60))));
    if (r.kind === 'mcp' && r.method === 'tools/call' && (shell.match(/hide-session\.mjs\s+mcp/g) ?? []).length !== 1) fail('Record ' + r.seq + ': each tool call must be its own single helper invocation');
  }

  // ---- inspect_symbol chain ------------------------------------------------------------------------
  const inspectCalls = calls.filter(r => r.params?.name === 'inspect_symbol');
  const pages = new Map();       // token -> {view, back}
  const created = new Map();     // site page token -> {fromPage, fromView}
  const chain = [];              // verified chain steps in order
  const locations = [];          // verified follows: {relation, path, line, column, text, at}
  const backs = [];
  let inspected = null, discovered = false;
  for (const r of inspectCalls) {
    const args = r.params.arguments ?? {};
    const p = payload(r);
    if (!p) continue;
    const tokenOk = token => pages.has(token);
    switch (args.action) {
      case 'discover': discovered = true; break;
      case 'inspect': {
        const report = p.report;
        if (!report || typeof p.page !== 'string') break;
        pages.set(p.page, { view: p.view, back: p.back });
        const ok = report.symbol && report.hover?.status === 'available' && report.definitions?.status === 'available' && report.definitions.count >= 1
          && report.references?.status === 'available' && report.references.count >= 1;
        if (ok && inRepo(report.path) && args.bufferId === report.bufferId && args.line === report.line && args.column === report.column) {
          const source = lineAt(report.path, report.line);
          if (source !== null && source.includes(report.symbol) && !inspected) inspected = { symbol: report.symbol, path: report.path, line: report.line, column: report.column, page: p.page, at: r.at, seq: r.seq, definitions: report.definitions.count, references: report.references.count };
        }
        break;
      }
      case 'view':
        if (!tokenOk(args.page)) fail('inspect_symbol view used page token that no earlier response returned (record ' + r.seq + ')');
        if (typeof p.page === 'string') pages.set(p.page, { view: p.view, back: p.back });
        break;
      case 'follow': {
        if (!tokenOk(args.page)) fail('inspect_symbol follow used page token that no earlier response returned (record ' + r.seq + ')');
        if (p.location) {
          const origin = created.get(args.page);
          if (origin && p.location.verified === true && inRepo(p.location.path)) {
            const source = lineAt(p.location.path, p.location.line);
            locations.push({ relation: origin.fromView, path: p.location.path, line: p.location.line, column: p.location.column, text: p.location.text, source, at: r.at, seq: r.seq });
          }
        } else if (typeof p.page === 'string') {
          pages.set(p.page, { view: p.view, back: p.back });
          if (p.view === 'hide.site.source' || p.back === args.page) created.set(p.page, { fromPage: args.page, fromView: pages.get(args.page)?.view });
        }
        break;
      }
      case 'back': {
        if (!tokenOk(args.page)) fail('inspect_symbol back used page token that no earlier response returned (record ' + r.seq + ')');
        if (typeof p.page === 'string') pages.set(p.page, { view: p.view, back: p.back });
        const origin = created.get(args.page);
        if (origin && p.view === origin.fromView) backs.push({ from: args.page, to: p.view, at: r.at, seq: r.seq });
        break;
      }
    }
  }
  if (!discovered) fail('inspect_symbol discover never succeeded');
  if (!inspected) fail('No successful inspect_symbol inspect on a hide source symbol with available hover, definitions and references (HLS must work on hide itself)');
  const sameLine = l => { const a = l.source.trim(), b = String(l.text ?? '').trim(); return b.length > 0 && (a.includes(b) || b.includes(a)); };
  const relevant = relation => locations.filter(l => l.relation === relation && l.seq > inspected.seq);
  const definition = relevant('hide.symbol.definitions').find(l => l.source !== null && l.source.includes(inspected.symbol) && sameLine(l));
  if (!definition) fail('No followed DEFINITION location whose real source line names ' + inspected.symbol);
  const reference = relevant('hide.symbol.references').find(l => l.source !== null && l.source.includes(inspected.symbol) && sameLine(l) && !(l.path === definition.path && l.line === definition.line));
  if (!reference) fail('No followed REFERENCE location (distinct from the definition) whose real source line names ' + inspected.symbol);
  if (!backs.length) fail('No successful Back from a followed site page to the view it came from');
  if (!backs.some(b => b.seq > definition.seq)) fail('Back was not exercised after following the definition');

  // ---- spacing: agent turns, not a script ----------------------------------------------------------
  const steps = driven.filter(r => r.kind === 'mcp' && r.params?.name === 'inspect_symbol');
  for (let i = 1; i < steps.length; i++) {
    const gap = (Date.parse(steps[i].at) - Date.parse(steps[i - 1].at)) / 1000;
    if (gap < AGENT_STEP_SECONDS) fail('inspect_symbol calls ' + steps[i - 1].seq + ' and ' + steps[i].seq + ' are ' + gap.toFixed(2) + 's apart; agent turns are slower than a script');
  }
  if (steps.length < 6) fail('Too few inspect_symbol calls (' + steps.length + ') for discover, inspect, view, follow x2, back');

  // ---- notes cite returned locations ---------------------------------------------------------------
  const notes = live.filter(r => r.kind === 'note');
  if (notes.length < 3) fail('The agent must record at least 3 notes explaining why each next call follows from the last answer');
  const returned = new Set(locations.flatMap(l => [rel(l.path) + ':' + l.line, l.path.split('/').pop() + ':' + l.line]));
  returned.add(rel(inspected.path) + ':' + inspected.line);
  if (notes.filter(n => [...returned].some(x => n.text.includes(x)) && n.text.length >= 40).length < 2) fail('At least 2 notes (>= 40 chars) must cite locations returned by the tools');

  return { inspected, definition, reference, backs, calls: calls.length, notes: notes.length, distinctTools: new Set(calls.map(c => c.params?.name)).size, rel };
}

// ------------------------------------------------------------------------------------------ main
async function main() {
  const repo = '/sandbox/hide', dir = 'inspector-hls-autonomy/', baseCommit = process.env.HLS_AUTONOMY_BASE ?? 'cd8bbd5';
  const read = path => readFileSync(repo + '/' + path, 'utf8');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const deliverables = ['DESIGN.md', 'RESULTS.md', 'OPEN_QUESTIONS.md', 'RALPH_PROGRESS.md', 'PROBES.md', 'evidence.json', 'evidence/tool-calls.jsonl',
    'evidence/screens/hls-hide-summary.txt', 'evidence/screens/hls-hide-definitions.txt', 'evidence/screens/hls-hide-references.txt'].map(n => dir + n)
    .concat('test/inspector-hls-hide.mjs');
  for (const file of deliverables) if (!existsSync(repo + '/' + file) || !read(file).trim()) fail('Missing or empty deliverable: ' + file);

  const lines = read(dir + 'evidence/tool-calls.jsonl').split('\n').filter(Boolean);
  const records = lines.map((line, i) => { try { return { ...JSON.parse(line), __line: line }; } catch { return fail('tool-calls.jsonl line ' + (i + 1) + ' is not JSON'); } });
  const sourceCache = new Map();
  const readSource = path => { if (!sourceCache.has(path)) sourceCache.set(path, existsSync(path) ? readFileSync(path, 'utf8') : null); return sourceCache.get(path); };
  const result = analyze(records, repo, readSource);

  // ---- evidence.json: explanation grounded in the transcript ---------------------------------------
  const evidence = JSON.parse(read(dir + 'evidence.json'));
  if (evidence.hlsOnHide !== true) fail('evidence.json hlsOnHide must be true: HLS must work on hide source (fallbacks cannot complete this campaign)');
  for (const field of ['agentInvestigation', 'definitionFollowed', 'referenceFollowed', 'backVerified', 'renderedUiVerified', 'regressionChecksKept'])
    if (evidence[field] !== true) fail('Unverified claim in evidence.json: ' + field);
  const inv = evidence.investigation ?? {};
  const { inspected, definition, reference, rel } = result;
  if (inv.symbol !== inspected.symbol) fail('evidence.investigation.symbol must be ' + inspected.symbol);
  if (inv.inspectedAt !== rel(inspected.path) + ':' + inspected.line + ':' + inspected.column) fail('evidence.investigation.inspectedAt must be ' + rel(inspected.path) + ':' + inspected.line + ':' + inspected.column);
  if (inv.definition !== rel(definition.path) + ':' + definition.line) fail('evidence.investigation.definition must be ' + rel(definition.path) + ':' + definition.line);
  if (!Array.isArray(inv.references) || !inv.references.includes(rel(reference.path) + ':' + reference.line)) fail('evidence.investigation.references must include ' + rel(reference.path) + ':' + reference.line);
  const explanation = String(inv.explanation ?? '');
  if (explanation.length < 300) fail('The explanation must be a real prose explanation (>= 300 chars)');
  for (const needle of [inspected.symbol, inv.definition, rel(reference.path) + ':' + reference.line]) if (!explanation.includes(needle)) fail('The explanation must cite ' + needle);
  if (!Array.isArray(evidence.limitations) || !evidence.limitations.length || evidence.limitations.some(x => typeof x !== 'string' || !x.trim())) fail('evidence.json needs honest limitations[]');
  const setup = evidence.hlsSetup;
  if (!setup || !Array.isArray(setup.files) || !setup.files.length || typeof setup.summary !== 'string' || setup.summary.length < 80) fail('evidence.hlsSetup {files[], summary} is required');
  git('ls-files', '--error-unmatch', ...setup.files);

  // ---- rendered editor evidence ---------------------------------------------------------------------
  const screen = name => read(dir + 'evidence/screens/' + name + '.txt');
  const shots = name => records.filter(r => r.kind === 'screen' && r.save === name);
  for (const name of ['hls-hide-summary', 'hls-hide-definitions', 'hls-hide-references']) if (!shots(name).length) fail('No recorded screen saved as ' + name);
  const summary = screen('hls-hide-summary'), definitions = screen('hls-hide-definitions'), references = screen('hls-hide-references');
  for (const [name, text] of [['summary', summary], ['definitions', definitions], ['references', references]]) {
    if (/No handler for|HLS:\s*(Could not|failed|error)/i.test(text)) fail('The ' + name + ' screen shows an HLS failure');
    if (!text.includes(inspected.symbol)) fail('The ' + name + ' screen does not show ' + inspected.symbol);
  }
  if (!/— \d+ definitions?/.test(definitions)) fail('definitions screen does not show the rendered Definitions view');
  if (!/— \d+ references?/.test(references)) fail('references screen does not show the rendered References view');
  if (!/Type|::/.test(summary)) fail('summary screen does not show the hover type');

  // ---- scripted regression (NOT agent evidence; kept outside the repo) -----------------------------
  const scripted = '/sandbox/hide-hls-scripted-check.json';
  if (!existsSync(scripted)) fail('test/inspector-hls-hide.mjs has not written ' + scripted + ' (run it)');
  const check = JSON.parse(readFileSync(scripted, 'utf8'));
  if (check.realHls !== true || check.hlsOnHide !== true || check.client !== 'scripted-regression' || !(check.definitions >= 1) || !(check.references >= 1)) fail('Scripted HLS regression result is not a pass: ' + JSON.stringify(check).slice(0, 200));
  const checked = String(check.definition ?? '').match(/^(.+):(\d+)$/);
  if (!checked || !String(readSource(repo + '/' + checked[1]) ?? '').split('\n')[Number(checked[2]) - 1]?.includes(check.symbol)) fail('Scripted regression definition is not a real hide source line');

  // ---- regression checks kept ----------------------------------------------------------------------
  const smoke = read('test/inspector-ui-smoke.mjs');
  for (const label of ['package sidebar appears', 'package context menu exposes Inspect', 'package inspector opens', 'Back after view switch returns to package'])
    if (!smoke.includes(label)) fail('Existing smoke step removed: ' + label);
  const cabal = read('hide.cabal');
  for (const module of ['PluginInspectCheck', 'InspectorWindowCheck', 'InspectorSpecCheck', 'SymbolInspectorCheck', 'PackageSidebarCheck', 'SidebarScrollCheck']) if (!cabal.includes(module)) fail('inspector-checks lost ' + module);
  if (!existsSync(repo + '/test/inspector-sidebar-scroll.mjs')) fail('test/inspector-sidebar-scroll.mjs was removed');

  // ---- committed, clean, nothing left running -------------------------------------------------------
  if (baseCommit.startsWith('__')) fail('internal: base commit not configured');
  try { git('merge-base', '--is-ancestor', baseCommit, 'HEAD'); } catch { fail('Existing commit ' + baseCommit + ' is not an ancestor of HEAD'); }
  if (!git('log', baseCommit + '..HEAD', '--format=%h', '--', ...setup.files).trim()) fail('The HLS setup files were not committed after ' + baseCommit);
  if (!git('log', baseCommit + '..HEAD', '--format=%h', '--', 'docs').trim()) fail('The HLS setup is not documented under docs/');
  git('ls-files', '--error-unmatch', ...deliverables);
  const scope = ['src', 'packages', 'plugins', 'app', 'test', 'docs', 'hide.cabal', 'cabal.project', 'hie.yaml', 'cabal.project*', dir, ':(exclude)' + dir + '.ralph-runner'];
  const dirty = git('status', '--porcelain', '--untracked-files=all', '--', ...scope).trim();
  if (dirty) fail('Uncommitted or untracked changes:\n' + dirty);
  if (git('ls-files', '--', dir + '.ralph-runner').trim()) fail('Runner state must not be committed');
  if (existsSync('/sandbox/hide-hls-autonomy-session.json')) fail('An editor session is still running; stop it');
  let left = '';
  try { left = execFileSync('pgrep', ['-f', '[h]ide-session.mjs --daemon'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* none running */ }
  if (left) fail('A session daemon is still running: ' + left);

  console.log('PASS hls-autonomy: HLS on hide source, symbol ' + inspected.symbol + ' (' + rel(inspected.path) + ':' + inspected.line + '), definition ' + rel(definition.path) + ':' + definition.line
    + ', reference ' + rel(reference.path) + ':' + reference.line + ', back x' + result.backs.length + ', ' + result.calls + ' tool calls over ' + result.distinctTools + ' tools, ' + result.notes + ' notes');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main().catch(error => { console.error(error.message); process.exitCode = 1; });
