# Open questions

## HLS on hide itself (limitation, not P0/P1)
Probe: `HLS: No handler for: SMethod_TextDocumentHover` (also `…DocumentSymbol`, `…Definition`, `…References`).
Attempt 1 (CLI, `/sandbox/hls-ghcup/bin/haskell-language-server-wrapper -j2 src/Hide/Sidebar.hs`, offline, GHC_BIN set):
default HOME cache fails with `/home/node/.cache/hie-bios: createDirectory: permission denied`; with a writable
`XDG_CACHE_HOME`: `Could not resolve dependencies … rejecting: hide:+terminal (conflict: pkg-config package
libghostty-vt-any, not found in the pkg-config database) … hide:-terminal (manual flag can only be changed explicitly)`.
Attempt 2: UNCOMMITTED `hie.yaml` (`cabal: cabalProject: cabal.project.hls`, with `package hide / flags: -window -web -terminal`)
made the CLI check succeed (`Completed (1 file worked, 0 files failed)`), but a fresh `start` with it present still
answered `No handler for: SMethod_TextDocumentHover` from the editor after 105 s. Experiment files removed; no stuck
cabal/HLS process left. Consequently `hlsOnHide` is false and definitions/references were NOT followed through HLS.
