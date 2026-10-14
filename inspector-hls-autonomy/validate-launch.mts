// SPDX-FileCopyrightText: 2026 Edward Kmett
// SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
//
// Pre-launch validation for inspector-hls-autonomy/RALPH.md, using the Ralph extension's own parser and readiness check.
//   node --experimental-strip-types inspector-hls-autonomy/validate-launch.mts
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { parseRalphMarkdown, validateFrontmatter } from "/sandbox/ralph-extension/src/ralph.ts";
import { validateCompletionReadiness } from "/sandbox/ralph-extension/src/runner.ts";

const taskDir = "/sandbox/hide/inspector-hls-autonomy";
const problems: string[] = [];
const check = (ok: boolean, message: string) => { console.log((ok ? "ok    " : "FAIL  ") + message); if (!ok) problems.push(message); };

const parsed = parseRalphMarkdown(readFileSync(join(taskDir, "RALPH.md"), "utf8"));
const fm = parsed.frontmatter;
check(validateFrontmatter(fm) === null, "frontmatter validates: " + String(validateFrontmatter(fm)));
check(fm.completionPromise === "HLS_AUTONOMY_COMPLETE" && fm.maxIterations <= 10 && fm.timeout <= 3300, `bounded: ${fm.maxIterations} iterations x ${fm.timeout}s`);
check(fm.completionGate === "required", "completion_gate is required");

// task-relative required outputs
const outputs = fm.requiredOutputs ?? [];
check(outputs.length >= 10, `${outputs.length} required outputs`);
check(outputs.every(o => !isAbsolute(o) && !o.split("/").includes("..") && !o.startsWith("inspector-hls-autonomy/") && !o.startsWith("test/")), "every required output is task-relative (no repo-relative or absolute path)");
const sandbox = mkdtempSync(join(tmpdir(), "hls-launch-"));
try {
  for (const o of outputs) { mkdirSync(dirname(join(sandbox, o)), { recursive: true }); writeFileSync(join(sandbox, o), "x\n"); }
  writeFileSync(join(sandbox, "OPEN_QUESTIONS.md"), "# Open questions\n\nNo unresolved P0 or P1 items.\n");
  check(validateCompletionReadiness(sandbox, outputs).ready, "extension readiness check accepts a task folder holding exactly the required outputs");
  rmSync(join(sandbox, outputs[0]));
  check(!validateCompletionReadiness(sandbox, outputs).ready, "negative control: a missing required output blocks readiness");
  writeFileSync(join(sandbox, outputs[0]), "x\n");
  writeFileSync(join(sandbox, "OPEN_QUESTIONS.md"), "## P0\n- HLS blocked\n");
  check(!validateCompletionReadiness(sandbox, outputs).ready, "negative control: an open P0 blocks readiness");
  check(!validateCompletionReadiness(sandbox, outputs.map(o => "inspector-hls-autonomy/" + o)).ready, "negative control: repo-relative output paths would be rejected (the earlier campaign's mistake)");
} finally { rmSync(sandbox, { recursive: true, force: true }); }

// gate deliverables agree with required_outputs
const gate = readFileSync(join(taskDir, "check-deliverables.mjs"), "utf8");
const gateOutputs = [...gate.matchAll(/'((?:DESIGN|RESULTS|OPEN_QUESTIONS|RALPH_PROGRESS|PROBES)\.md|evidence\.json|evidence\/[\w./-]+\.(?:txt|jsonl))'/g)].map(m => m[1]);
check(gateOutputs.length >= 10 && gateOutputs.every(o => outputs.includes(o)), "gate deliverables are all listed in required_outputs");
check(outputs.every(o => gateOutputs.includes(o)), "required_outputs are all checked by the gate");

// commands
const commands = fm.commands ?? [];
check(commands.every(c => c.timeout === undefined || c.timeout <= fm.timeout), "command timeouts do not exceed the iteration timeout");
const acceptance = commands.filter(c => c.acceptance).map(c => c.name);
for (const need of ["build", "inspector_regressions", "package_ui_regression", "sidebar_scroll_ui", "hls_on_hide_scripted", "deliverables_gate"]) check(acceptance.includes(need), `acceptance command ${need}`);
check(commands.find(c => c.name === "build")?.run.includes("-j1") === true && commands.every(c => !/-j[2-9]/.test(c.run)), "builds use -j1 only");
check(commands.find(c => c.name === "build")?.run.includes("-f-window -f-web -f-terminal") === true, "build keeps -f-window -f-web -f-terminal");
check(commands.find(c => c.name === "build")?.run.includes("hide-session.mjs stop") === true, "build stops editor sessions before compiling");
check(commands.every(c => !/(^|[^\w])(curl|wget|cabal (install|update))/.test(c.run)), "no command downloads or installs");
check(!/\bpush\b/.test(commands.map(c => c.run).join(" ")), "no command pushes");
for (const c of commands) check(parsed.body.includes(`{{ commands.${c.name} }}`), `body references command ${c.name}`);
for (const f of ["hide-session.mjs", "check-deliverables.mjs", "RALPH.md"]) check(existsSync(join(taskDir, f)), `${f} exists`);
check((fm.guardrails.protectedFiles ?? []).includes("inspector-hls-autonomy/check-deliverables.mjs") && (fm.guardrails.protectedFiles ?? []).includes("inspector-hls-autonomy/hide-session.mjs"), "gate and helper are protected");
for (const p of fm.guardrails.blockCommands ?? []) { try { new RegExp(p); } catch { check(false, "block pattern compiles: " + p); } }
check((fm.guardrails.blockCommands ?? []).some(p => /push/.test(p)), "git push is blocked");

// the gate is alive: it must REFUSE the present state, naming a missing deliverable
let refused = "";
try { execFileSync("node", [join(taskDir, "check-deliverables.mjs")], { cwd: "/sandbox/hide", stdio: "pipe" }); } catch (e: any) { refused = String(e.stderr); }
check(/Missing or empty deliverable/.test(refused), "gate refuses an empty campaign: " + refused.trim().slice(0, 100));
// base commit exists and is an ancestor of HEAD
const base = /baseCommit = process\.env\.HLS_AUTONOMY_BASE \?\? '([0-9a-f]+)'/.exec(gate)?.[1] ?? "";
let ancestor = false; try { execFileSync("git", ["merge-base", "--is-ancestor", base, "HEAD"], { cwd: "/sandbox/hide" }); ancestor = true; } catch {}
check(base.length >= 7 && ancestor, `gate base commit ${base} is an ancestor of HEAD`);
// tools the campaign depends on
for (const p of ["/sandbox/hls-ghcup/bin/haskell-language-server-wrapper", "/home/node/.ghcup/bin/ghc", "/sandbox/hide/dist-newstyle/build/aarch64-linux/ghc-9.14.1/hide-0.1.0.0/x/hide/build/hide/hide"]) check(existsSync(p), `${p} exists`);

console.log(problems.length ? `\n${problems.length} problem(s)` : "\nvalidate-launch: all checks passed");
process.exit(problems.length ? 1 : 0);
