#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Edward Kmett
// SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
//
// Final gate for the sidebar-autonomy campaign. Protected: the campaign may not edit it.
// It judges recorded evidence, not claims: the tool transcript is written only by
// inspector-autonomy/hide-session.mjs while a real editor runs.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const repo = '/sandbox/hide', dir = 'inspector-autonomy/', baseCommit = '81fb174';
const fail = message => { throw Error(message); };
const read = path => readFileSync(repo + '/' + path, 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// ---- deliverables exist and are real -------------------------------------------------------------
const deliverables = ['DESIGN.md', 'RESULTS.md', 'OPEN_QUESTIONS.md', 'RALPH_PROGRESS.md', 'evidence.json',
  'evidence/tool-calls.jsonl', 'evidence/screens/before-long-files.txt', 'evidence/screens/after-package-reachable.txt',
  'evidence/screens/after-package-inspector.txt'].map(name => dir + name).concat('test/inspector-sidebar-scroll.mjs');
for (const file of deliverables) {
  if (!existsSync(repo + '/' + file) || !read(file).trim()) fail('Missing or empty deliverable: ' + file);
}
const evidence = JSON.parse(read(dir + 'evidence.json'));
for (const field of ['reproduced', 'fixed', 'renderedUiVerified', 'packageInspected', 'regressionChecksKept'])
  if (evidence[field] !== true) fail('Unverified claim in evidence.json: ' + field);
if (!Array.isArray(evidence.limitations) || !evidence.limitations.length || evidence.limitations.some(x => typeof x !== 'string' || !x.trim()))
  fail('evidence.json needs honest, non-empty limitations[]');
const packageName = evidence.rendered?.packageName;
if (typeof packageName !== 'string' || !/^[\w-]+$/.test(packageName)) fail('evidence.rendered.packageName is required');
if (!/^\d+x\d+$/.test(evidence.rendered?.viewport ?? '')) fail('evidence.rendered.viewport (WxH) is required');

// ---- transcript: written by hide-session.mjs against a running editor ----------------------------
const records = read(dir + 'evidence/tool-calls.jsonl').split('\n').filter(Boolean).map((line, i) => {
  try { return JSON.parse(line); } catch { return fail('tool-calls.jsonl line ' + (i + 1) + ' is not JSON'); }
});
const mcp = records.filter(r => r.kind === 'mcp');
const listing = mcp.find(r => r.method === 'tools/list' && r.response?.result?.tools);
if (!listing) fail('No recorded tools/list against the running editor (tool discovery)');
const registered = listing.response.result.tools.map(t => t.name);
for (const name of ['inspect_symbol', 'lsp_definition', 'lsp_references', 'workspace_search', 'read_buffer'])
  if (!registered.includes(name)) fail('Discovery did not show registered tool ' + name);
const calls = mcp.filter(r => r.method === 'tools/call');
const named = calls.map(r => r.params?.name);
if (calls.length < 10) fail('Only ' + calls.length + ' recorded tool calls; the investigation needs at least 10');
if (new Set(named).size < 5) fail('The investigation used fewer than 5 distinct registered tools');
if (!named.includes('inspect_symbol')) fail('inspect_symbol was never called');
const ok = r => !r.response?.error && !r.response?.result?.isError && !r.response?.truncated;
const succeeded = (tool, action) => calls.filter(r => r.params?.name === tool && (!action || r.params?.arguments?.action === action) && ok(r));
const hls = evidence.investigation?.hlsOnHide;
if (hls === true) {
  if (!succeeded('inspect_symbol', 'inspect').length) fail('hlsOnHide=true but no successful inspect_symbol inspect call is recorded');
  if (!succeeded('inspect_symbol', 'follow').length && !succeeded('lsp_definition').length && !succeeded('lsp_references').length)
    fail('hlsOnHide=true but no successful follow of a definition/reference is recorded');
} else if (hls === false) {
  if (typeof evidence.investigation.hlsFailure !== 'string' || !evidence.investigation.hlsFailure.trim()) fail('hlsOnHide=false needs investigation.hlsFailure');
  if (!/HLS/.test(read(dir + 'OPEN_QUESTIONS.md'))) fail('OPEN_QUESTIONS.md must describe the HLS limitation');
  if (!succeeded('workspace_search').length || !succeeded('read_buffer').length) fail('Fallback investigation needs successful workspace_search and read_buffer calls');
} else fail('evidence.investigation.hlsOnHide must be true or false');
const ui = records.filter(r => ['screen', 'click', 'key', 'wheel'].includes(r.kind));
if (!ui.some(r => r.kind === 'screen') || !ui.some(r => r.kind !== 'screen')) fail('Transcript lacks rendered screens and UI input');

// ---- findings grounded in source and in tool output ---------------------------------------------
const findings = evidence.investigation?.findings;
if (!Array.isArray(findings) || findings.length < 4) fail('At least 4 findings are required');
const toolText = mcp.map(r => JSON.stringify(r.response ?? '')).join('\n');
const files = new Set();
for (const finding of findings) {
  const m = /^((?:src|packages|app|test)\/[^:]+):(\d+)$/.exec(finding.location ?? '');
  if (!m || typeof finding.claim !== 'string' || finding.claim.trim().length < 20) fail('Bad finding: ' + JSON.stringify(finding));
  if (!existsSync(repo + '/' + m[1])) fail('Finding file does not exist: ' + m[1]);
  if (Number(m[2]) < 1 || Number(m[2]) > read(m[1]).split('\n').length) fail('Finding line out of range: ' + finding.location);
  const base = m[1].split('/').pop();
  if (!toolText.includes(base)) fail('Finding ' + finding.location + ' is not grounded: ' + base + ' never appeared in a recorded tool response');
  files.add(m[1]);
}
if (files.size < 3) fail('Findings must span at least 3 source files');
if (![...files].some(f => /Sidebar|Package/.test(f))) fail('Findings must include the sidebar/package sources');

// ---- rendered evidence --------------------------------------------------------------------------
const screen = name => read(dir + 'evidence/screens/' + name + '.txt');
const saved = name => ui.filter(r => r.kind === 'screen' && r.save === name);
for (const name of ['before-long-files', 'after-package-reachable', 'after-package-inspector'])
  if (!saved(name).length) fail('Transcript has no screen saved as ' + name);
const before = screen('before-long-files'), reachable = screen('after-package-reachable'), inspected = screen('after-package-inspector');
const rootRow = new RegExp('^ [▶▼] ' + packageName + '(\\s|$|║)', 'm');
if (!/▼ Files/.test(before)) fail('before screen must show an expanded Files tree');
if ((before.match(/[├└]\S/g) ?? []).length < 20) fail('before screen does not show a long Files tree (>=20 rows)');
if (rootRow.test(before)) fail('before screen already shows package ' + packageName + '; the issue is not reproduced');
if (!rootRow.test(reachable)) fail('after screen does not show the package row ' + packageName);
if (!new RegExp(packageName + ' — \\d+ components?').test(inspected)) fail('after-inspector screen does not show the package inspector');
if (new Set([before, reachable, inspected].map(s => s.split('\n').length)).size !== 1) fail('Screens were captured at different viewport sizes');
if (saved('before-long-files')[0].size !== evidence.rendered.viewport) fail('Recorded viewport differs from evidence.rendered.viewport');
const fixCommit = git('log', '-1', '--format=%cI', '--', 'src', 'packages').trim();
if (!fixCommit) fail('No committed change under src/ or packages/');
if (new Date(saved('before-long-files')[0].at) > new Date(fixCommit)) fail('The before screen was recorded after the fix commit');

// ---- existing regression checks are kept ---------------------------------------------------------
const smoke = read('test/inspector-ui-smoke.mjs');
for (const label of ['package sidebar appears', 'package context menu exposes Inspect', 'package inspector opens', 'component source view opens',
  'switch to Declaration', 'navigate to source declaration', 'Back from source declaration returns to component', 'Back after view switch returns to package'])
  if (!smoke.includes(label)) fail('Existing smoke step was removed or renamed: ' + label);
const cabal = read('hide.cabal');
for (const module of ['PluginInspectCheck', 'InspectorWindowCheck', 'InspectorSpecCheck', 'SymbolInspectorCheck', 'PackageSidebarCheck'])
  if (!cabal.includes(module)) fail('inspector-checks lost ' + module);

// ---- committed ----------------------------------------------------------------------------------
try { git('merge-base', '--is-ancestor', baseCommit, 'HEAD'); } catch { fail('Existing commit ' + baseCommit + ' is no longer an ancestor of HEAD'); }
if (!git('log', baseCommit + '..HEAD', '--format=%h', '--', 'src', 'packages').trim()) fail('No commit since ' + baseCommit + ' changes src/ or packages/');
if (!git('log', baseCommit + '..HEAD', '--format=%h', '--', 'test').trim()) fail('No commit since ' + baseCommit + ' changes test/');
git('ls-files', '--error-unmatch', ...deliverables);
const exclude = ':(exclude)' + dir + '.ralph-runner';
try { git('diff', '--exit-code', 'HEAD', '--', 'src', 'packages', 'test', 'docs', 'hide.cabal', dir, exclude); }
catch { fail('Uncommitted changes in implementation, tests, docs or campaign evidence'); }
const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'src', 'packages', 'test', 'docs', dir, exclude).trim();
if (untracked) fail('Untracked implementation or evidence files: ' + untracked);
if (git('ls-files', '--', dir + '.ralph-runner').trim()) fail('Runner state under ' + dir + '.ralph-runner must not be committed');
console.log('PASS sidebar-autonomy deliverables: ' + calls.length + ' recorded tool calls over ' + new Set(named).size + ' tools, hlsOnHide=' + hls + ', ' + findings.length + ' findings');
