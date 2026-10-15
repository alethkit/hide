---
max_iterations: 1
timeout: 1800
completion_promise: DONE
completion_gate: required
commands:
  - name: build
    run: cabal build all --offline -j2 -f-window -f-web -f-terminal
    timeout: 900
    acceptance: true
  - name: inspector_tests
    run: timeout --signal=TERM --kill-after=10s 180s cabal test hide:test:inspector-checks --offline -j2 -f-window -f-web -f-terminal
    timeout: 210
    acceptance: true
  - name: inspector_ui
    run: node /sandbox/ralph-validation/inspector-ui-smoke.mjs
    timeout: 90
    acceptance: true
---
# Finish the hide semantic inspector

Continue the existing implementation in /sandbox/hide.
Do not restart or redesign it.

Existing commits:
- 4cd28a9: typed inspector core
- 8651bf4: host rendering and package inspector views

Preserve all existing uncommitted changes.

Read /sandbox/hide/inspector-finish/RALPH_PROGRESS.md and
/sandbox/hide/inspector-finish/OPEN_QUESTIONS.md before editing.
These task-local files are the authoritative progress and open-issue records.

## Objectives

1. Diagnose and fix the hanging package-sidebar cancellation test.
   The fake cabal benchmark is deliberately infinite; preserve
   cancellation coverage rather than removing the test.
2. Complete inspector integration with the package sidebar,
   menu commands, application and session.
3. Build the project offline.
4. Pass the bounded inspector test suite.
5. Run the inspector_ui acceptance check to verify the rendered interaction.
6. Commit completed work and update the task-local RALPH_PROGRESS.md.

## Constraints

Do not modify OpenShell policy, expand network permissions,
install missing packages, or push commits.

The full test suite has uncached dependencies. Focus on the
offline build and inspector-checks.

Keep commands bounded. Clean up subprocesses created by tests.
Do not claim success when tests fail or time out.

## Completion

Emit <promise>DONE</promise> only when the inspector is
integrated, the build and inspector tests pass, and the
implementation is committed and the rendered UI acceptance check passes.

Otherwise document blockers and continue until the iteration
budget is exhausted.
