# RALPH progress — symbol inspection workflow

## HLS blocker (probed once; do not repeat)
`which haskell-language-server-wrapper`, `$THC_EDIT_HLS` (empty), `~/.ghcup/bin` (cabal/ghc/ghcup only),
`~/.ghcup/hls` (empty), `find / -xdev -iname '*language-server*' -o -iname 'hls*' -o -iname 'ghcide*'` (nothing),
ghcup cache/trash have no HLS bundle, `/opt` unreadable. **No real HLS is installed; no downloads allowed.**
Concrete next action: install/provide `haskell-language-server-wrapper` (built for GHC 9.14.1) on PATH or via
`THC_EDIT_HLS`, then run `node test/inspector-symbol-workflow.mjs` (real mode) and commit its evidence.json.

## Environment gotchas
* Box has 2 GB RAM and /tmp is a 1 GB tmpfs. Killed GHC runs leave `/tmp/ghc*_tmp_*` (hundreds of MB) that starve
  later builds (Model.hs then gets SIGKILLed). Fix: `rm -rf /tmp/ghc*_tmp_* /tmp/*.tmp` between builds.
* No python3 on the box (existing python fake-HLS checks can't run); my fake LSP is node (`test/fake-lsp.mjs`).
* Do NOT pass `--ghc-options` to cabal (changes the config hash and rebuilds everything).

## Done (committed)
* Pure semantics `src/Hide/SymbolInspect.hs`; host `src/Hide/SymbolInspector.hs` (human flow, `inspect_symbol` tool,
  reservations/revocation/tokens); Tooling exports; Model command `InspectSymbol` (Shift+F12, Tools menu, source
  context menu); `OpenAt` target; MenuCommands `PreparedJump`; App wiring (registered tool, effects, tick).
* `test/SymbolInspectorCheck.hs` in inspector-checks (fake node LSP `test/fake-lsp.mjs`): PASS with the 4 old suites.
* Fixture `test/inspector-fixture` (cabal pkg: `area` in src/Shapes.hs used in app/Main.hs and totalArea).
## In progress / next
1. `test/inspector-symbol-workflow.mjs` (runtime acceptance: real HLS mode + `--fake-lsp` dry-run mode that writes
   `evidence.fake-lsp.json` with realHls=false). Explore showed: session id = hello session id, `hide --mcp-editor SID`
   bridge works, frame rows are spans `[x,fg,bg,?,runs]`.
2. docs (docs/haskell.md, docs/agent-tools.md, docs/running.md), DESIGN/RESULTS/OPEN_QUESTIONS.
3. Commit; do NOT emit WORKFLOW_COMPLETE while real HLS is missing.
