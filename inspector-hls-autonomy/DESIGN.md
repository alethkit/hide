# Design: HLS on hide's own source

## Root cause (why the editor answered "No handler for: SMethod_TextDocumentHover")

The editor starts `$THC_EDIT_HLS --lsp` with cwd = project root (`src/Hide/LSP.hs` `startClient`). A cradle that cannot load makes the
server answer every request with `No handler for: SMethod_…` (`src/Hide/Tooling.hs`, `src/Hide/LSP.hs`). Four independent causes had to be removed
(PROBES.md P1–P11):

1. **Solver.** HLS's implicit cabal cradle runs `cabal repl` with plain `cabal.project`; the default `terminal` flag needs pkg-config
   `libghostty-vt` (absent), and `-terminal` is a manual flag, so the plan fails. Fix: `hie.yaml` selects `cabal.project.hls`
   (`import: cabal.project`, `package hide` / `flags: -window -web -terminal`). `cabal.project` and the real build are unchanged (P1, P2).
2. **Cache directory.** `~/.cache` is read-only here; hie-bios/ghcide could not create `hie-bios`/`ghcide` (`createDirectory: permission denied`).
   Fix: a writable `XDG_CACHE_HOME` (P3, P4).
3. **Relocated XDG dirs.** `hide-session.mjs` (like the sandbox's session tools) points `XDG_{DATA,CONFIG,STATE,CACHE}_HOME` at a temp dir, so the
   cabal that HLS spawns saw no store and no package index. Fix: `CABAL_CONFIG` pointing at a generated copy of the real config with explicit
   `store-dir` and `remote-repo-cache` (P5, P5b).
4. **Memory.** On the ~2 GB RAM, no-swap machine the editor (~0.6 GB) plus HLS (-A128M nursery, ~0.9 GB peak) were OOM-killed (`dmesg`: `Killed process
   … (haskell-languag) anon-rss:890292kB`; the editor then showed `HLS: fd:18: Data.ByteString.hGetLine: end of file`). Fix:
   `GHCRTS="-A16m -c"` for the whole process tree (P7–P11). Stale cabal `*.tmp` files on the RAM-backed `/tmp` also cost ~150–190 MB and are cleaned first.

## Chosen setup (all committed)

| File | Role |
| --- | --- |
| `hie.yaml` | cradle `cabal` with `cabalProject: cabal.project.hls` |
| `cabal.project.hls` | normal project, `-window -web -terminal` for `package hide` |
| `tools/hls-env.sh` | prints `XDG_CACHE_HOME`, `CABAL_CONFIG`, `GHCRTS` (never downloads or installs) |
| `docs/haskell.md` | "Language server on hide itself": steps, environment, memory advice |
| `test/inspector-hls-hide.mjs` | scripted regression (bounded, cleans up, writes `/sandbox/hide-hls-scripted-check.json` only on success) |

Launch environment used by both the regression and the agent session: `HOME=/home/node`, `GHC_BIN=/home/node/.ghcup/bin/ghc`,
`THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper`, `GHCRTS='-A16m -c'`,
`XDG_CACHE_HOME=/sandbox/hls-cache/cache`, `CABAL_CONFIG=/sandbox/hls-cache/cabal-config` (both produced by `HIDE_HLS_HOME=/sandbox/hls-cache tools/hls-env.sh`).

## Rejected alternatives

- Enabling `+terminal`: needs `libghostty-vt`, not installable here.
- Editing `cabal.project` flags: would change the real build; a separate project file keeps it untouched.
- Wiring `HIE_BIOS_CACHE_DIR` only: fixed the hie-bios error but not ghcide's cache or the cabal store (P3).
- Lowering memory by limiting HLS plugins or `-j`: HLS was still too large with the default 128 MB nursery; the RTS flags are one line and reversible.
- Source-search fallback: no longer an acceptable outcome for this campaign.

No render-loop code was touched (AGENTS.md interaction-performance rules).
