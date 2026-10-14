# RALPH progress — symbol inspection workflow

## State (iteration 1 of the post-install loop)
DONE: real-HLS acceptance `node test/inspector-symbol-workflow.mjs` PASSES (twice); evidence.json all flags true; reports updated.
Root causes fixed: fixture .cabal comment before cabal-version; empty CABAL_CONFIG in harness; single-component fixture;
harness retry robustness. See RESULTS.md.
Env for runs: PATH=/sandbox/hls-ghcup/bin:/home/node/.ghcup/bin:$PATH THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper GHC_BIN=/home/node/.ghcup/bin/ghc
Gotchas: never `pkill -f` a pattern that appears in your own command line (use [x]pattern); 2 GB RAM: rm -rf /tmp/ghc*_tmp_*.
NEXT: commit; emit WORKFLOW_COMPLETE after the audit.
