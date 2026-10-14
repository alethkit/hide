---
max_iterations: 8
timeout: 3300
completion_promise: SIDEBAR_AUTONOMY_COMPLETE
completion_gate: required
stop_on_error: false
required_outputs:
  - inspector-autonomy/DESIGN.md
  - inspector-autonomy/RESULTS.md
  - inspector-autonomy/OPEN_QUESTIONS.md
  - inspector-autonomy/RALPH_PROGRESS.md
  - inspector-autonomy/evidence.json
  - inspector-autonomy/evidence/tool-calls.jsonl
  - test/inspector-sidebar-scroll.mjs
commands:
  - name: build
    run: export HOME=/home/node GHC_BIN=/home/node/.ghcup/bin/ghc PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH && cabal build all --offline -j2 -f-window -f-web -f-terminal
    timeout: 900
    acceptance: true
  - name: inspector_regressions
    run: export HOME=/home/node GHC_BIN=/home/node/.ghcup/bin/ghc PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH && timeout --signal=TERM --kill-after=10s 180s cabal test hide:test:inspector-checks --offline -j2 -f-window -f-web -f-terminal --test-show-details=direct
    timeout: 240
    acceptance: true
  - name: package_ui_regression
    run: node test/inspector-ui-smoke.mjs
    timeout: 120
    acceptance: true
  - name: sidebar_scroll_ui
    run: node test/inspector-sidebar-scroll.mjs
    timeout: 180
    acceptance: true
  - name: deliverables_gate
    run: node inspector-autonomy/check-deliverables.mjs
    timeout: 60
    acceptance: true
  - name: repo_state
    run: git status --short -- . ':(exclude).ralph-runner' ':(exclude)inspector-*/.ralph-runner' | head -40; git log --oneline -8; ls inspector-autonomy inspector-autonomy/evidence 2>/dev/null; wc -l inspector-autonomy/evidence/tool-calls.jsonl 2>/dev/null; node inspector-autonomy/hide-session.mjs status
    timeout: 30
guardrails:
  block_commands:
    - 'git\s+push'
    - 'git\s+reset\s+--hard'
    - 'git\s+clean'
    - 'git\s+stash'
    - 'git\s+checkout\s+(--\s|\.)'
    - 'git\s+restore\s'
    - 'cabal\s+(install|update)'
    - '\b(curl|wget)\b'
    - 'rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+/sandbox/?(\s|$)'
  protected_files:
    - 'policy:secret-bearing-paths'
    - 'inspector-autonomy/RALPH.md'
    - 'inspector-autonomy/check-deliverables.mjs'
    - 'inspector-autonomy/hide-session.mjs'
---
# Sidebar discoverability: a long Files tree must not hide the package section

Work in the EXISTING checkout /sandbox/hide (iteration {{ ralph.iteration }} of {{ ralph.max_iterations }}).
Read /sandbox/hide/AGENTS.md first: interaction-performance rules and the greenfield stance apply to your fix.
Resume from `inspector-autonomy/RALPH_PROGRESS.md` if it exists; fresh iterations start with no memory.

## The problem (known, from inspector-workflow/OPEN_QUESTIONS.md "found in iteration 3")
`node test/inspector-ui-smoke.mjs` failed when the checkout's top-level directories multiplied: the shared left
sidebar's Files tree grew to ~34 rows and the package section (published after Agents/Sessions) fell below the
40-row viewport. The sidebar has no way to scroll or reach later sections, so a user with a long Files tree cannot
see, select or inspect packages. The smoke was papered over with a taller viewport (120x60) and by collapsing Files
first. That is a workaround, not a fix; a user must be able to reach packages in a normal-sized window without
collapsing Files by luck.

## Objectives (all required)
1. **Investigate with the registered inspector tools, against a running editor** (see "Investigation protocol").
2. **Reproduce** the issue in rendered UI at a normal viewport (120x40) with a long Files tree, and keep the
   before-screen as evidence.
3. **Implement a focused fix** so users can reach and inspect packages with a long Files tree. Design is yours,
   chosen from what the sources show (candidates: independent per-section scroll/viewport; making the whole
   sidebar scrollable with the wheel and keyboard; per-section height budgets with a visible overflow
   indicator; ordering). Whatever you pick must be discoverable (visible cue that more sections exist below),
   keyboard and mouse reachable, correct for hit-testing after scrolling, and survive resize and refresh.
   Selection, expansion and scroll offsets must stay valid when trees reload (stale-action protection exists:
   preserve it). Follow AGENTS.md: no whole-desktop or whole-tree comparisons in the render loop, small explicit
   UI-state keys, indexed rows. Keep the change small; no unrelated refactors, aliases or compatibility shims.
4. **Focused automated tests** for the new behavior, added to the offline `inspector-checks` suite
   (test/inspector/Main.hs, hide.cabal `other-modules`), without removing any existing coverage.
5. **Rendered UI verification** through a new bounded script `test/inspector-sidebar-scroll.mjs`, modelled on
   `test/inspector-ui-smoke.mjs` (remote display protocol, settled frames, clean exit, cleanup of temp state).
   It must generate a DETERMINISTIC fixture (a temp project dir under /sandbox with ~60+ top-level entries plus a
   one-package `.cabal`, used as the editor's cwd with `hide_datadir=/sandbox/hide`; do not depend on the
   checkout's own directory count), launch at 120x40 WITHOUT collapsing Files, then assert through the display:
   the long Files tree is shown, the package section is reachable (cue visible, scroll/keys/mouse), the package
   context menu offers Inspect, and the package inspector opens (`<name> — N components`). Exit nonzero on failure.
6. **Preserve existing inspector regression checks**: `test/inspector-ui-smoke.mjs` and every inspector-checks
   module. If your sidebar change legitimately moves coordinates in the old smoke, adjust only coordinates/
   preconditions, keep every step label and assertion, and explain in RESULTS.md. Never weaken a check to pass.
7. **Document** the user-visible behavior in docs/ (the sidebar section of docs/editing.md and/or
   docs/running.md, which currently say packages appear "below Files, Sessions, ...").
8. **Record everything** in the deliverables below, and commit implementation + tests + docs + evidence.

## Investigation protocol (this is graded; a scripted client alone does NOT satisfy it)
`inspector-autonomy/hide-session.mjs` (protected; read its header) keeps one real editor plus one
`hide --mcp-editor` bridge running and executes ONE action per shell command, logging every call, its arguments
and the full response to `inspector-autonomy/evidence/tool-calls.jsonl`. You, the agent, choose each next call
from the previous answer. Do not write a script that replays a fixed sequence of calls, do not edit the
transcript, and do not hand-write responses. Typical flow:

    node inspector-autonomy/hide-session.mjs start --size=120x40 src/Hide/Sidebar.hs
    node inspector-autonomy/hide-session.mjs mcp tools/list          # DISCOVER the registered tools
    node inspector-autonomy/hide-session.mjs mcp tools/call inspect_symbol '{"action":"discover"}'
    node inspector-autonomy/hide-session.mjs mcp tools/call inspect_symbol '{"action":"inspect","bufferId":...,"line":...,"column":...}'
    node inspector-autonomy/hide-session.mjs screen --save before-long-files
    node inspector-autonomy/hide-session.mjs stop

Read each tool's schema from `tools/list` instead of guessing arguments. Use the tools to follow DEFINITIONS and
REFERENCES (`inspect_symbol` actions discover/inspect/view/follow/back, `lsp_definition`, `lsp_references`,
`lsp_hover`, `lsp_document_symbols`) through the sidebar code, plus `workspace_search`, `read_buffer`,
`workspace_project`, `list_windows`, `editor_panels`, `editor_screen`. Starting points to confirm, not to trust:
`src/Hide/Sidebar.hs` (`treeScroll`, `visibleRows`, projection), `src/Hide/SidebarCommands.hs` (input, hit
testing, scroll commands), `src/Hide/PackageSidebar.hs` (package root/publication), `src/Hide/SessionSidebar.hs`,
`src/Hide/AgentSidebarTypes.hs`, the rendering/layout of the left panel (find it with the tools), and
`docs/running.md`. Establish: how sections are stacked and who allocates their rows, where the row budget
runs out, what the scroll offset applies to, and how wheel/keyboard/hit-testing map to rows.

Requirements for the investigation (checked by `inspector-autonomy/check-deliverables.mjs`):
* A recorded `tools/list`, then at least 10 recorded `tools/call`s over at least 5 distinct registered tools,
  including `inspect_symbol`; rendered `screen` captures and UI input (`click`/`key`/`wheel`) in the same transcript.
* **HLS on hide itself may not work.** At startup the first probe showed `HLS: No handler for:
  SMethod_TextDocumentHover` (the cradle for hide's own cabal project failed). Diagnose it in at most two
  bounded attempts using installed HLS `/sandbox/hls-ghcup/bin/haskell-language-server-wrapper`,
  `GHC_BIN=/home/node/.ghcup/bin/ghc`, offline, `-j2` at most, a fresh `start` after each environment change, and
  `hie.yaml` ideas only as an UNCOMMITTED experiment unless you can justify committing it. Any stuck HLS or cabal
  process you spawned must be stopped. If HLS works, set `investigation.hlsOnHide: true` and follow real
  definitions/references (successful `inspect_symbol` inspect + follow, or `lsp_definition`/`lsp_references`).
  If it does not, set `hlsOnHide: false`, put the exact error text and what you tried in
  `investigation.hlsFailure`, record the attempts in OPEN_QUESTIONS.md (mention "HLS"), and complete the
  investigation with the non-HLS registered tools (`workspace_search`, `read_buffer`, `workspace_project`,
  `editor_panels`...). Never claim definition/reference results you did not obtain.
* `evidence.json` → `investigation.findings`: at least 4 `{ "claim": "...", "location": "src/Hide/X.hs:LINE" }`
  entries over at least 3 files (including sidebar/package sources); each file must have appeared in a recorded
  tool response, and each LINE must be real. Findings state causes you verified, not guesses.
* Label it honestly: the tools are driven by you (an LLM agent) one call at a time through a shell helper; the
  transcript is the proof. Do not describe it as anything else.

## Evidence the gate expects
Saved screens (use `screen --save NAME`, same viewport for all): `before-long-files` (pre-fix build, Files expanded, long
tree, package NOT visible), `after-package-reachable` (package root row visible/reachable after the fix),
`after-package-inspector` (package inspector open: `<name> — N components`). The `before` screen must be
recorded before the fix commit. For the editor session use a deterministic long-tree fixture of the same kind
as the script's (or the checkout itself if its Files tree is long, saying which in RESULTS.md); the package
name you use is `evidence.json` → `rendered.packageName`. Rebuild with the fix before taking the after-screens
(`cabal build all --offline -j2 -f-window -f-web -f-terminal`, binary at
`dist-newstyle/build/aarch64-linux/ghc-9.14.1/hide-0.1.0.0/x/hide/build/hide/hide`), `stop` the old session and
`start` a new one. The transcript must be committed.

Write `inspector-autonomy/evidence.json` BY HAND at the end with exactly this shape (true only after you checked):

    { "reproduced": true, "fixed": true, "renderedUiVerified": true, "packageInspected": true,
      "regressionChecksKept": true,
      "rendered": { "viewport": "120x40", "packageName": "...", "fixture": "..." },
      "investigation": { "hlsOnHide": true|false, "hlsFailure": "... (only when false)",
        "findings": [ { "claim": "...", "location": "src/Hide/Sidebar.hs:123" } ] },
      "commands": { "build": "...", "tests": "...", "ui": "..." },
      "limitations": [ "honest remaining limitations" ] }

## Deliverables (all under inspector-autonomy/, committed)
* `RALPH_PROGRESS.md` — update EVERY iteration: done, failing evidence, next action.
* `DESIGN.md` — diagnosis with source locations, chosen design and rejected alternatives, performance notes.
* `RESULTS.md` — requirement → code/test/evidence map; distinguish rendered/live results from unit tests; the
  exact commands run and their outcomes; what was NOT verified (e.g. native window/web/terminal frontends are
  built with `-f-window -f-web -f-terminal`; say so if only the remote-display path was exercised).
* `OPEN_QUESTIONS.md` — remaining limitations and any P0/P1 items. The gate requires no unresolved P0/P1.
* `evidence.json`, `evidence/tool-calls.jsonl`, `evidence/screens/*.txt`.

## Constraints
* Environment: `HOME=/home/node`, `PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH`,
  `GHC_BIN=/home/node/.ghcup/bin/ghc`, `THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper`.
  Builds offline, never above `-j2`; never `cabal install`/`update`. No downloads, no network, no installs.
* Do not change sandbox/OpenShell policy, secrets, global git config, or recreate the sandbox. Do not push.
  Preserve all existing commits and all existing uncommitted files (other campaigns' `.ralph-runner*`,
  `inspector-*/` logs). Never `git add -A`/`git add .`; add explicit paths only
  (`src packages test docs hide.cabal inspector-autonomy/<files>`), never `.ralph-runner*`. Commit with
  `git -c user.name='Overnight Agent' -c user.email=overnight@localhost commit`.
* Do not edit `inspector-autonomy/RALPH.md`, `check-deliverables.mjs` or `hide-session.mjs`; do not edit other
  campaigns' directories. `node test/inspector-symbol-workflow.mjs` rewrites tracked evidence/logs under
  `inspector-workflow/`; only run it if you need real-HLS regression confidence, and never commit its noise.
* Keep every command bounded (`timeout`). Always `hide-session.mjs stop` before finishing an iteration; stop any
  test/HLS/cabal subprocess you started. Do not run the full `editor-tests` suite (uncached dependencies).
* Do not claim success on failing or timed-out checks. Fix root causes; do not weaken gates.

## Suggested iteration plan
1. Build, start a session, discover tools, investigate sidebar layout/scroll/hit-testing via the tools, capture the
   `before-long-files` screen, write DESIGN.md diagnosis + progress. Commit evidence so far.
2. Implement the fix + focused Haskell checks; make inspector-checks pass.
3. Write `test/inspector-sidebar-scroll.mjs`; make it and the old smoke pass; docs.
4. Rebuild; re-run a live session on the fixed build; capture the two after-screens; exercise the package
   inspector with the registered tools (`editor_screen`/`list_windows`/`editor_panels`) as well as the UI.
5. Write RESULTS/OPEN_QUESTIONS/evidence.json, commit everything, run the gate commands yourself, then finish.

## Current evidence before this iteration

### build
{{ commands.build }}

### inspector_regressions
{{ commands.inspector_regressions }}

### package_ui_regression (existing smoke)
{{ commands.package_ui_regression }}

### sidebar_scroll_ui (new script; absent until you write it)
{{ commands.sidebar_scroll_ui }}

### deliverables_gate
{{ commands.deliverables_gate }}

### repo_state
{{ commands.repo_state }}

## Completion
Emit <promise>SIDEBAR_AUTONOMY_COMPLETE</promise> only when ALL hold: build passes; inspector-checks pass; the
old package smoke and `test/inspector-sidebar-scroll.mjs` pass; the deliverables gate passes; the work is committed
(explicit paths, no runner state); no editor session is left running; no unresolved P0/P1 in OPEN_QUESTIONS.md;
limitations are stated honestly. Ralph reruns the acceptance commands after your claim; if one fails, use its
output and keep going. If the budget ends first, leave RALPH_PROGRESS.md precise about blockers and do not emit
the promise.
