---
max_iterations: 10
timeout: 3300
completion_promise: HLS_AUTONOMY_COMPLETE
completion_gate: required
stop_on_error: false
required_outputs:
  - DESIGN.md
  - RESULTS.md
  - OPEN_QUESTIONS.md
  - RALPH_PROGRESS.md
  - PROBES.md
  - evidence.json
  - evidence/tool-calls.jsonl
  - evidence/screens/hls-hide-summary.txt
  - evidence/screens/hls-hide-definitions.txt
  - evidence/screens/hls-hide-references.txt
commands:
  - name: sessions
    run: node inspector-hls-autonomy/hide-session.mjs status; pgrep -af '[h]ide/build/hide/hide|[h]ls-ghcup/bin/haskell-language-server|[h]ide-session.mjs' | cut -c1-160; free -m | sed -n 2p
    timeout: 30
  - name: build
    run: node inspector-hls-autonomy/hide-session.mjs stop >/dev/null 2>&1; pkill -TERM -f '[h]ls-ghcup/bin/haskell-language-server'; sleep 2; export HOME=/home/node GHC_BIN=/home/node/.ghcup/bin/ghc PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH; cabal build all --offline -j1 -f-window -f-web -f-terminal
    timeout: 1500
    acceptance: true
  - name: inspector_regressions
    run: export HOME=/home/node GHC_BIN=/home/node/.ghcup/bin/ghc PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH; timeout --signal=TERM --kill-after=10s 240s cabal test hide:test:inspector-checks --offline -j1 -f-window -f-web -f-terminal --test-show-details=direct
    timeout: 300
    acceptance: true
  - name: package_ui_regression
    run: node test/inspector-ui-smoke.mjs
    timeout: 120
    acceptance: true
  - name: sidebar_scroll_ui
    run: node test/inspector-sidebar-scroll.mjs
    timeout: 180
    acceptance: true
  - name: hls_on_hide_scripted
    run: export HOME=/home/node GHC_BIN=/home/node/.ghcup/bin/ghc THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper PATH=/sandbox/hls-ghcup/bin:/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH; node test/inspector-hls-hide.mjs
    timeout: 900
    acceptance: true
  - name: deliverables_gate
    run: node inspector-hls-autonomy/check-deliverables.mjs
    timeout: 60
    acceptance: true
  - name: repo_state
    run: git status --short -- . ':(exclude)inspector-*/.ralph-runner' ':(exclude).ralph-runner' | head -40; git log --oneline -8; ls inspector-hls-autonomy inspector-hls-autonomy/evidence 2>/dev/null; wc -l inspector-hls-autonomy/evidence/tool-calls.jsonl 2>/dev/null; tail -c 1500 inspector-hls-autonomy/PROBES.md 2>/dev/null
    timeout: 30
guardrails:
  block_commands:
    - 'git\s+push'
    - 'git\s+reset\s+--hard'
    - 'git\s+clean'
    - 'git\s+stash'
    - 'git\s+checkout\s+(--\s|\.)'
    - 'git\s+restore\s+(?!--staged)'
    - 'cabal\s+(install|update)'
    - 'ghcup\s+(install|upgrade|compile|rm|set|gc)'
    - '\b(curl|wget)\b'
    - '\b(npm|pip|pip3|apt|apt-get)\s+install'
    - 'rm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+/sandbox/?(\s|$)'
  protected_files:
    - 'policy:secret-bearing-paths'
    - 'inspector-hls-autonomy/RALPH.md'
    - 'inspector-hls-autonomy/check-deliverables.mjs'
    - 'inspector-hls-autonomy/hide-session.mjs'
    - 'inspector-hls-autonomy/validate-launch.mts'
---
# Make HLS work on hide's own source, then investigate it as an agent

Work in the EXISTING checkout /sandbox/hide (iteration {{ ralph.iteration }} of {{ ralph.max_iterations }}).
Read /sandbox/hide/AGENTS.md and docs/inspector-status.md first. Resume from `inspector-hls-autonomy/RALPH_PROGRESS.md`
and `PROBES.md` if they exist; fresh iterations have no memory.

## The remaining autonomy gap
Earlier campaigns could not follow definitions or references in hide's own source: the editor answered
`HLS: No handler for: SMethod_TextDocumentHover` (also DocumentSymbol/Definition/References), so a Pi agent could
discover `inspect_symbol` and inspect a symbol but only got "Unavailable". The earlier campaign fell back to
`workspace_search`/`read_buffer` and recorded `hlsOnHide: false`. **That fallback no longer completes anything.**

## Objectives (all required, none negotiable)
1. **Make the installed HLS work on hide's own source inside the RUNNING editor**:
   `/sandbox/hls-ghcup/bin/haskell-language-server-wrapper` (HLS 2.14.0.0, selected server GHC 9.14.1),
   `GHC_BIN=/home/node/.ghcup/bin/ghc`, offline dependencies, and the EXISTING disabled-frontend flags
   (`-window -web -terminal`; the `terminal` flag cannot be enabled here because pkg-config `libghostty-vt` is absent).
   Do not install, download, or change flags in the real build (`cabal.project` stays as it is).
2. **Commit the HLS setup and document it** (docs/haskell.md or the doc that fits) so it is reproducible, and
   add a scripted regression `test/inspector-hls-hide.mjs` (see below).
3. **An actual Pi agent (you) performs the investigation** with the registered tools in a running editor on hide
   source: discover `inspect_symbol` via `tools/list`, inspect a real hide symbol, follow its DEFINITION and at
   least one REFERENCE, navigate BACK, and explain a real code relationship in prose using the returned source
   locations. Every request and response is persisted by the session helper to `evidence/tool-calls.jsonl`.
4. Keep existing regressions green: `inspector-checks`, `test/inspector-ui-smoke.mjs`, `test/inspector-sidebar-scroll.mjs`.

## What the completion gate enforces (read `check-deliverables.mjs`; it is protected, do not try to bypass it)
* A successful `inspect_symbol` **inspect** in the final editor session (which MUST run with cwd /sandbox/hide and the
  installed wrapper) on a symbol in hide source, whose report has `hover`, `definitions` and `references` all
  `available` with counts >= 1.
* A followed **definition** and a followed **reference** (distinct), each ending in a `location` with `verified: true`
  whose line, read from the checkout, really names the symbol; and a **Back** from a site page to the view it came from.
* Page tokens/rows used in `view`/`follow`/`back` must come from earlier recorded responses; transcript hash chain intact.
* Every recorded call must be ONE `hide-session.mjs` invocation in its own shell command, with a `pi` process in its
  ancestry. Loops, `for`/`while`, `xargs`, `node -e`, `python`, other scripts, heredocs or several calls per shell
  command are rejected, as are `inspect_symbol` steps closer than 1.5 s. Do NOT pipe one call's output into the next.
* >= 3 notes (`hide-session.mjs note "..."`, >= 40 chars) of which >= 2 cite locations that tools actually returned.
* `evidence.json` with `hlsOnHide: true` (false or absent can never complete), the explanation citing the symbol, the
  definition `path:line` and a reference `path:line` that the transcript verified (>= 300 chars of prose), and
  `hlsSetup` listing the committed setup files.
* Three rendered-editor screens (`screen --save`): `hls-hide-summary`, `hls-hide-definitions`, `hls-hide-references`,
  taken from the Inspect symbol window opened through the UI (Shift+F12 / context menu on the symbol), showing the
  type, `<symbol> — N definitions` and `<symbol> — N references`, with no HLS error.
* The scripted regression passed (writes `/sandbox/hide-hls-scripted-check.json`); regression suites kept; everything
  committed (explicit paths; no `.ralph-runner`); no session or daemon left running; `OPEN_QUESTIONS.md` has no P0/P1.
A source-search fallback, `hlsOnHide=false`, a replayed/looped client, or hand-written responses cannot pass. Do not weaken
anything after a failure; if you cannot meet a requirement, say so as a P0 and stop (see Blockers).

## Known facts about the HLS failure (VERIFIED unless marked HYPOTHESIS)
* HLS's cabal cradle runs `cabal repl` via hie-bios in /sandbox/hide. Plain `cabal.project` selects the default flags,
  and the solver rejects `+terminal` (no pkg-config libghostty-vt) and `-terminal` (manual flag). A project file such as
  `cabal.project.hls` containing `import: cabal.project` and `package hide` / `flags: -window -web -terminal`
  (selected by `hie.yaml`: `cradle: cabal: cabalProject: cabal.project.hls`) solves offline: the dry run
  `cabal build --offline --dry-run --project-file=cabal.project.hls -j1 lib:hide` plans hide-agent-api, hide-plugin-api,
  hide-acp, hide (lib) as "configuration changed". A previous agent reported the CLI then worked
  (`haskell-language-server-wrapper -j2 src/Hide/Sidebar.hs`: "1 file worked") but the editor still answered "No handler".
* cabal 3.18 uses XDG: `cabal path` shows store `~/.local/state/cabal/store`, package cache `~/.cache/cabal/packages`,
  config `~/.config/cabal/config`. **`hide-session.mjs` isolates `XDG_{DATA,CONFIG,STATE,CACHE}_HOME` under a temp
  dir, so the cabal that HLS spawns inside the editor sees no store and no package index.** That is the leading
  HYPOTHESIS for "CLI works, editor does not" (the earlier fixture run needed `CABAL_CONFIG` for the same reason).
  `start --env KEY=VALUE` (allowed: `XDG_*_HOME`, `CABAL_*`, `HIE_BIOS_*`, `HLS_*`, `GHC_*`) overrides the helper's
  environment; the editor and its MCP bridge inherit the same environment, and hide itself keeps its
  session socket under those dirs, so an override must point at an EXISTING writable directory
  (a nonexistent `XDG_CACHE_HOME` broke the bridge with `Network.Socket.connect: does not exist`).
* `~/.cache` is not listable/writable here: an earlier probe reported `/home/node/.cache/hie-bios: createDirectory:
  permission denied` (HYPOTHESIS: set `HIE_BIOS_CACHE_DIR` or a writable `XDG_CACHE_HOME`; verify, do not assume).
* The editor starts `$THC_EDIT_HLS --lsp` with cwd = project root (src/Hide/LSP.hs `startClient`); a failed cradle makes
  every request answer "No handler for: SMethod_…" (src/Hide/Tooling.hs, LSP.hs).
* The sandbox has ~2 GB RAM. `Hide.Model` was OOM-killed during compilation, and an editor + HLS + a stale second editor
  made a live session die. Run ONE editor session at a time, stop it before any `cabal build`/`cabal test`, use `-j1`, and
  start with a small leaf module (for example `src/Hide/Sidebar.hs` or `packages/hide-plugin-api/src/...`).
  HLS loads dependencies lazily; first answers can take minutes. Do not inspect `Hide.Model`/`Hide.Render` first.
* Response shapes (verified on test/inspector-fixture): `inspect` -> `{page, report:{symbol,path,line,column,hover,
  definitions:{status,count},references:{status,count}}, view, document:{items,title}}`; `view` -> a new `page` with
  `back` = previous page; `follow` on a definitions/references row -> a site page (`view: hide.site.source`); `follow`
  row 0 of the site page ("Open in editor") -> `{location:{path,line,column,text,verified}}`; `back` on the site page
  returns the view it came from.

## HLS work protocol (bounded; no repeated identical probes)
Log EVERY probe in `PROBES.md` BEFORE running it: id, hypothesis, exact command/environment, expected result, then
the observed result (exact error text). Never run a probe identical to one already logged; a changed hypothesis or
environment is a new probe. Diagnose with bounded CLI probes (`timeout 600 /sandbox/hls-ghcup/bin/haskell-language-server-wrapper
-j1 src/Hide/Sidebar.hs`, `cabal ... --dry-run`) and then confirm in the RUNNING editor
(`hide-session.mjs start --size=120x40 --env ... src/Hide/Sidebar.hs`, `mcp tools/call lsp_hover ...`). Stop every
session and any HLS/cabal process you started before compiling and before ending the iteration
(`hide-session.mjs stop`; the `build` command also stops sessions).
All setup must live in committed files (for example `hie.yaml`, `cabal.project.hls`) or in the documented
launch environment that `test/inspector-hls-hide.mjs` reproduces. The agent investigation must use the same setup.

## Scripted regression `test/inspector-hls-hide.mjs` (NOT agent evidence; it only guards the setup)
Bounded (<= 600 s), repeatable, cleans up its processes and temp state, exits nonzero on any failure. It starts the
editor (remote display protocol, same pattern as `test/inspector-symbol-workflow.mjs`) with cwd /sandbox/hide, applies the
documented HLS setup, waits until HLS answers, calls `inspect_symbol` through `hide --mcp-editor`
(discover, inspect, definitions view, follow, references view, follow, back) on a hide symbol and verifies the real
source lines. It then writes `/sandbox/hide-hls-scripted-check.json`:
`{"client":"scripted-regression","realHls":true,"hlsOnHide":true,"symbol":"...","definition":"src/Hide/X.hs:LINE","definitions":N,"references":M}`
and exits 0. It must never write that file on failure and must delete a stale one first.

## Agent investigation protocol (graded)
`inspector-hls-autonomy/hide-session.mjs` (read its header) keeps one editor + one `--mcp-editor` bridge alive and runs ONE
action per shell command. Choose each call from the previous answer; read every response before the next.

    node inspector-hls-autonomy/hide-session.mjs start --size=120x40 [--env K=V ...] src/Hide/Sidebar.hs
    node inspector-hls-autonomy/hide-session.mjs mcp tools/list
    node inspector-hls-autonomy/hide-session.mjs mcp tools/call inspect_symbol '{"action":"discover"}'
    node inspector-hls-autonomy/hide-session.mjs mcp tools/call list_buffers '{}'
    node inspector-hls-autonomy/hide-session.mjs mcp tools/call inspect_symbol '{"action":"inspect","bufferId":1,"line":L,"column":C}'
    node inspector-hls-autonomy/hide-session.mjs note "Definitions: 1 at src/Hide/Sidebar.hs:NN; following it because ..."
    node inspector-hls-autonomy/hide-session.mjs mcp tools/call inspect_symbol '{"action":"view","page":"<token from the response>","view":"hide.symbol.definitions"}'
    ... follow (page,row) -> site page -> follow row 0 -> location; back; references view -> follow -> location; back
    node inspector-hls-autonomy/hide-session.mjs screen --save hls-hide-definitions
    node inspector-hls-autonomy/hide-session.mjs stop

Pick a symbol with a real definition and several references across hide source (a field, function or type in a
small module: the position must be on the identifier in a line that contains it; use `read_buffer` to find the
line/column). To produce the three rendered screens, put the caret on the symbol (`editor_navigate`, or click),
press Shift+F12 with `key F12 shift`, take `screen --save hls-hide-summary`, then open the "→ Definitions view" row
(`click` on it, Enter) and `screen --save hls-hide-definitions`, Back, then References view and `screen --save
hls-hide-references`. Use `lsp_definition`/`lsp_references`/`lsp_hover` additionally if useful. Explain a real relationship
(who defines the symbol, who uses it, and why that matters) from the returned locations, in evidence.json and RESULTS.md.
If the helper session dies, `stop`, check memory (`free -m`), and start again; the gate only judges the LAST session,
which must contain the whole investigation. Do not edit `evidence/`; do not hand-write responses.

## evidence.json (write by hand at the end; true only after verifying)

    { "hlsOnHide": true, "agentInvestigation": true, "definitionFollowed": true, "referenceFollowed": true,
      "backVerified": true, "renderedUiVerified": true, "regressionChecksKept": true,
      "hlsSetup": { "files": ["hie.yaml", "cabal.project.hls", "docs/haskell.md", "..."], "summary": "what was wrong and what makes HLS work, with the launch environment (>= 80 chars)" },
      "investigation": { "symbol": "...", "inspectedAt": "src/Hide/X.hs:LINE:COL", "definition": "src/Hide/X.hs:LINE",
        "references": ["src/Hide/Y.hs:LINE", "..."], "explanation": "prose, >= 300 chars, citing the symbol, definition and a reference path:line" },
      "commands": { "build": "...", "tests": "...", "ui": "..." },
      "limitations": [ "honest remaining limitations" ] }

## Deliverables (all under inspector-hls-autonomy/, committed)
`RALPH_PROGRESS.md` (every iteration: done, failing evidence, next action), `PROBES.md` (the probe log), `DESIGN.md` (root
cause of the HLS failure and the chosen setup, with source locations and rejected alternatives), `RESULTS.md` (requirement ->
evidence map; scripted vs agent evidence kept distinct; exact commands and outcomes; what was NOT verified),
`OPEN_QUESTIONS.md` (limitations; no unresolved P0/P1 at completion), `evidence.json`, `evidence/tool-calls.jsonl`,
`evidence/screens/*.txt`.

## Blockers
If a requirement cannot be met within the rules (needs a download/installation, network, privileged access, memory the
sandbox lacks, or an HLS defect you have bounded with logged probes), then: record the exact error text and the logged
probes in `OPEN_QUESTIONS.md` as a **P0**, name ONE concrete next action for the user, update RALPH_PROGRESS.md, do NOT repeat
unchanged probes in later iterations (read PROBES.md first; only run a probe with a genuinely new hypothesis), do NOT emit
the completion promise, and do not weaken the gate. Ending the campaign without the promise is acceptable; a false claim is not.

## Constraints
* `HOME=/home/node`, `PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH`, `GHC_BIN=/home/node/.ghcup/bin/ghc`,
  `THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper`. Builds offline with `-j1` ONLY, never concurrent with an editor
  session. No downloads, no installs, no network, no `cabal update/install`, no sandbox/OpenShell/policy changes, no secrets, no pushes,
  no sandbox recreation, no global git config changes. Preserve all existing commits and unrelated uncommitted files (other campaigns'
  `RALPH.md` files). Never `git add -A`/`.`; add explicit paths; never add `.ralph-runner*`. Commit with
  `git -c user.name='Overnight Agent' -c user.email=overnight@localhost commit`.
* Do not edit `RALPH.md`, `check-deliverables.mjs`, `hide-session.mjs`, `validate-launch.mts`, other campaigns' directories, or the
  sidebar fix unless a regression forces it. Keep AGENTS.md rules (no new render-loop work; this task should not touch rendering).
* Keep every command bounded with `timeout`. Do not run the full `editor-tests` suite. Stop every process you start.

## Suggested iteration plan
1. `sessions`/`build` evidence; read PROBES.md; log and run the first HLS probes (CLI, then editor with the XDG/cabal/hie-bios hypotheses).
   Commit the first working setup files as soon as one probe shows `hover` answering in the editor.
2. Make definitions AND references answer on a hide symbol in the editor; write `test/inspector-hls-hide.mjs`; docs; commit.
3. Run the agent investigation (fresh `start`, one call per shell command, notes, screens); `stop`.
4. RESULTS/DESIGN/OPEN_QUESTIONS/evidence.json; run the gate commands yourself; commit explicit paths; then claim completion.

## Evidence before this iteration

### sessions
{{ commands.sessions }}

### build
{{ commands.build }}

### inspector_regressions
{{ commands.inspector_regressions }}

### package_ui_regression
{{ commands.package_ui_regression }}

### sidebar_scroll_ui
{{ commands.sidebar_scroll_ui }}

### hls_on_hide_scripted (absent until you write test/inspector-hls-hide.mjs)
{{ commands.hls_on_hide_scripted }}

### deliverables_gate
{{ commands.deliverables_gate }}

### repo_state
{{ commands.repo_state }}

## Completion
Emit <promise>HLS_AUTONOMY_COMPLETE</promise> only when every gate item above is satisfied by real evidence, all acceptance
commands pass on the committed HEAD, no editor session is left running, and OPEN_QUESTIONS.md has no unresolved P0/P1. Ralph reruns
the acceptance commands after the claim; if one fails, fix the cause and continue. If the iteration budget ends first, leave a
precise blocker report and do not emit the promise.
