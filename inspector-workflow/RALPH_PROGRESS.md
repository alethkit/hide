# RALPH progress — symbol inspection workflow (iteration 3)

## HLS blocker (probed once; do not repeat)
No real HLS on box (PATH, $THC_EDIT_HLS, ~/.ghcup/{bin,hls}, fs-wide name search; /opt unreadable). No downloads.
Next action: provide haskell-language-server-wrapper (GHC 9.14.1) on PATH or THC_EDIT_HLS, run
`node test/inspector-symbol-workflow.mjs`, commit evidence.json. Do NOT emit WORKFLOW_COMPLETE before that.

## Gotchas
* 2 GB RAM, 1 GB /tmp tmpfs: `rm -rf /tmp/ghc*_tmp_*` between builds. A leaked `hide --remote-daemon` (750 MB) from a
  killed script run starves later runs: `pkill -f remote-daemon`, `pkill -f fake-lsp`.
* Opening a private file FIRST makes startup fail (project dir derived from first file); open Main.hs first.
* Private buffer = file named `thc.toml`; list_buffers shows title `[private]`, path null.
* Remote input: use key events (`key('x')`), not {type:'text'}. Alt+1 activates window 1.
* No python3; fake LSP is node.

## Done (committed)
Pure semantics, host, tool, UI wiring, fixture, SymbolInspectorCheck, acceptance script (fake dry run PASSES),
docs (haskell.md, agent-tools.md, README), DESIGN/RESULTS/OPEN_QUESTIONS.
## Next
Only the real-HLS run. If HLS appears: run script, fix real-HLS-specific issues (OPEN_QUESTIONS P2 hypotheses).

## Iteration 3
Re-checked once (PATH, THC_EDIT_HLS, ~/.ghcup/bin, cabal store/packages for ghcide/hls): still no HLS. No new work possible
without external input. Not emitting WORKFLOW_COMPLETE. Next: provide HLS, run the acceptance script.

## Iteration 4
Only checked PATH/THC_EDIT_HLS again (still absent). No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1) on PATH or THC_EDIT_HLS, run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 5
PATH/THC_EDIT_HLS re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 6
PATH/THC_EDIT_HLS re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 7
PATH/THC_EDIT_HLS re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 8
PATH/THC_EDIT_HLS re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 9
PATH/THC_EDIT_HLS re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 10
PATH/THC_EDIT_HLS/~/.ghcup/bin re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 11
PATH/THC_EDIT_HLS/~/.ghcup/bin re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.

## Iteration 12
PATH/THC_EDIT_HLS/~/.ghcup/bin re-checked: still no HLS. No new work possible. Not emitting WORKFLOW_COMPLETE.
Next: provide HLS (GHC 9.14.1), run `node test/inspector-symbol-workflow.mjs`, commit evidence.json.
