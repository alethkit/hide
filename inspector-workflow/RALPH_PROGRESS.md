# RALPH progress — symbol inspection workflow

## State (iteration 2)
DONE: real-HLS acceptance `node test/inspector-symbol-workflow.mjs` PASSES; evidence.json all flags true; reports updated.
Iteration 2: committed refreshed evidence.json/run.log from the last passing run; ran external gate.
Env: PATH=/sandbox/hls-ghcup/bin:/home/node/.ghcup/bin:$PATH THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper GHC_BIN=/home/node/.ghcup/bin/ghc
NEXT: emit WORKFLOW_COMPLETE if gate passes.
