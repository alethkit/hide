---
max_iterations: 8
timeout: 1800
completion_promise: SPEC_COMPLETE
completion_gate: required
stop_on_error: false
required_outputs:
  - DESIGN.md
  - RESULTS.md
  - OPEN_QUESTIONS.md
commands:
  - name: build
    run: cabal build all --offline -j2 -f-window -f-web -f-terminal
    timeout: 900
    acceptance: true
  - name: original_spec_tests
    run: timeout --signal=TERM --kill-after=10s 180s cabal test hide:test:inspector-checks --offline -j2 -f-window -f-web -f-terminal --test-show-details=direct
    timeout: 210
    acceptance: true
  - name: rendered_ui
    run: node test/inspector-ui-smoke.mjs
    timeout: 90
    acceptance: true
  - name: deliverables
    run: node /sandbox/ralph-validation/spec-deliverables.mjs
    timeout: 30
    acceptance: true
guardrails:
  block_commands:
    - 'git\s+push'
  protected_files:
    - 'policy:secret-bearing-paths'
---
# Complete the original hide inspector specification autonomously

Work in /sandbox/hide, existing OpenShell sandbox hide-phlow. This is the full
original vertical-slice specification, recovered from Comparing Coding Scaffolds.
The prior inspector-finish milestone was narrower and is not evidence that this
specification was completed. The user's larger goal is an unattended Ralph run:
fix ordinary code/build/test/doc problems yourself, without asking the user or
Codex to paste errors, choose routine implementation details, or run commands.

## Original outcome and acceptance criteria
Build a small Haskell-native, Phlow-style semantic inspection library integrated
with hide: a viable first step toward a moldable development environment.
1. Two INDEPENDENT modules attach views to an EXISTING Haskell type without
   changing that type or editor core. Demonstrate coexistence and scoped retirement.
2. Child selection follows typed relations into another inspector, retaining
   navigation history. Back must work through package/component/source navigation
   and view switching, and re-resolve live roots rather than retarget stale indices.
3. THE SAME semantic view/document supports a human hide window and structured
   agent-readable JSON. Include a usable library API and examples. Typed targets
   stay typed internally; page-local action IDs are not globally replayable object
   identities. Do not add a network service or expose private windows to agents.
4. Integrate real PackageSources, ComponentSources and source declarations.
5. New focused checks plus existing minimal offline build pass. Exercise actual
   rendered UI, not just pure functions or a successful process launch.
6. Deliver DESIGN.md, RESULTS.md, OPEN_QUESTIONS.md in THIS task folder. RESULTS
   maps EVERY criterion to implementation and verification evidence, with precise
   limitations. Commit completed implementation/tests/docs locally; do not push.

## Current starting point
Commits through f6a4bf7 implement and verify typed core, package UI and cancellation.
Codex has started uncommitted changes for JSON, Back history, independent extension
examples and test/InspectorSpecCheck.hs. These are intentionally NOT claimed done:
the implementation compiled once, but new acceptance tests have not been compiled
or run. Audit, correct and complete all of them, including any syntax errors.
Do not discard existing edits or assume draft tests are correct. Preserve prior
commits and pre-existing inspector-finish runner logs/config modifications.

Read AGENTS.md and inspector-finish/{RALPH_PROGRESS,OPEN_QUESTIONS}.md first.
Use /sandbox/hide/inspector-spec/RALPH_PROGRESS.md for your durable progress.
Use /sandbox/hide/inspector-spec/OPEN_QUESTIONS.md for remaining issues.
Update progress each iteration so fresh children can resume without coaching.

## Runtime evidence
The existing working remote-display UI check is copied to
/sandbox/hide/test/inspector-ui-smoke.mjs. Extend it to actually select Back from a
source declaration to component and then package, including a view switch. It
must check newly rendered frames and fail on timeout, protocol error, wrong
object or unclean exit. Print "PASS inspector history runtime" only after those
interactions succeed. Keep the existing checks. The external deliverables gate
reruns this smoke and requires that marker. This uses hide's existing --remote
protocol; it requires no new PTY rights or policy changes.

## Constraints and completion
No sandbox recreation, policy/network changes, dependency installation, pushes,
reset/clean, or broad unrelated refactors. Preserve user data and existing edits.
Use HOME=/home/node and GHC/Cabal PATH (already inherited); no XDG overrides for
Cabal. Runtime UI check sets its own isolated XDG dirs and hide_datadir.
Use offline -j2 or -j1 builds, never cabal install. Full editor-tests has uncached
dependencies at baseline; do not repeatedly try it. Document that environmental
limitation accurately. Keep all commands bounded and clean up owned subprocesses.

Do not weaken acceptance, delete failing tests to obtain green, alter external
/sandbox/ralph-validation/spec-deliverables.mjs, or claim a limitation is completed.
You may correct draft test bugs while retaining all stated behavioral coverage.
If git identity is absent, use per-command -c user.name='Overnight Agent'
-c user.email='overnight@localhost'; do not change global git settings.
Emit <promise>SPEC_COMPLETE</promise> only after every achievable criterion is
implemented, tested, documented and committed, with no unresolved P0/P1 issue.
The loop will rerun acceptance after that claim. On failure, use the evidence to
continue fixing autonomously. Do not stop merely because one iteration ended.
