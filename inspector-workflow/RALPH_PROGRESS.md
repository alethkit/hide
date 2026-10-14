# RALPH progress — symbol inspection workflow

## State (iteration 3)
DONE: real-HLS acceptance passes; evidence.json is byte-stable (page ids renumbered); smoke viewport 120x60 fixes package_ui_regression.
Gate failures fixed: package_ui_regression (sidebar clipped Packages at 40 rows), committed_evidence (acceptance rewrote evidence with random page ids).
Env: PATH=/sandbox/hls-ghcup/bin:/home/node/.ghcup/bin:$PATH THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper GHC_BIN=/home/node/.ghcup/bin/ghc
NEXT: commit; run gate (committed_evidence last); emit WORKFLOW_COMPLETE.
