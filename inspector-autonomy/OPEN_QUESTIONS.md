# Open questions

No unresolved P0 or P1 items.

## P2 / limitations
* **HLS on hide itself** (limitation of the environment, not the fix). Probe: `HLS: No handler for: SMethod_TextDocumentHover`
  (also `…DocumentSymbol`, `…Definition`, `…References`).
  Attempt 1 (CLI, `/sandbox/hls-ghcup/bin/haskell-language-server-wrapper -j2 src/Hide/Sidebar.hs`, offline, `GHC_BIN` set):
  with the default HOME cache it fails with `/home/node/.cache/hie-bios: createDirectory: permission denied`; with a writable
  `XDG_CACHE_HOME` it fails with `Could not resolve dependencies … rejecting: hide:+terminal (conflict: pkg-config package
  libghostty-vt-any, not found in the pkg-config database) … rejecting: hide:-terminal (manual flag can only be changed explicitly)`.
  Attempt 2: UNCOMMITTED `hie.yaml` (`cabal: cabalProject: cabal.project.hls`, a project file with
  `package hide / flags: -window -web -terminal`) made the CLI succeed (`Completed (1 file worked, 0 files failed)`), but a fresh
  `start` with the files present still answered `No handler for: SMethod_TextDocumentHover` from the editor after ~105 s.
  The experiment files were removed (not committed); no HLS/cabal process of mine is left. Hence `hlsOnHide=false`; the
  investigation used `workspace_search`, `read_buffer`, `list_windows`, `list_buffers`, `editor_layout`, `editor_screen`,
  `workspace_project`, `inspect_symbol` (summary only, definitions unavailable). Worth a future fix: a committed HLS project
  file for the no-GUI flag set, and finding why the editor's own HLS launch ignores `hie.yaml` (not diagnosed).
* **Task statement correction:** the sidebar was already scrollable (wheel, PageDown, scrollbar when focused); the defect
  was discoverability plus unreachable Home/End/section keys and unclamped offsets. The original smoke failure was a test
  coordinate problem as much as a UX one.
* **Environment memory:** the sandbox has ~2 GB RAM and `/tmp` is tmpfs; compiling `Hide.Model` was OOM-killed twice
  (SIGKILL) until stale cabal plan files in `/tmp` were deleted and no editor session ran concurrently. Use `-j1` and
  stop sessions before building. Not a product issue.
* Shrinking the window can leave the selected row below the viewport (by design; the cue and cue click reach it).
* Accessibility tree does not describe the cue; the full `editor-tests` suite and a per-frame allocation baseline were not run
  (see RESULTS.md).
* `inspector-ui-smoke.mjs` still collapses Files and uses 120x60 (kept as-is to preserve its steps); the new script covers the
  uncollapsed 120x40 case.
