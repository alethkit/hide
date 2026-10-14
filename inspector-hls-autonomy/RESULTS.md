# Results

## Requirement -> evidence

| Requirement | Evidence |
| --- | --- |
| HLS works on hide source in the RUNNING editor | agent session, `evidence/tool-calls.jsonl` seq 91-134: `inspect_symbol` inspect at `src/Hide/Sidebar.hs:118:59` returned hover, 1 definition, 4 references, all `available` (seq 96) |
| Setup committed and documented | `hie.yaml`, `cabal.project.hls`, `tools/hls-env.sh`, `docs/haskell.md` ("Language server on hide itself"), `test/inspector-hls-hide.mjs`; DESIGN.md has the root causes |
| Scripted regression (NOT agent evidence) | `node test/inspector-hls-hide.mjs` -> PASS lines, wrote `/sandbox/hide-hls-scripted-check.json` (`sectionIndices`, 1 definition, 4 references) |
| Agent investigation, tool discovery | seq 92 `tools/list` (registered `inspect_symbol`, `lsp_*`), seq 93 `discover` |
| Definition followed | seq 98 view definitions -> 99 follow row 0 -> 100 follow site "Open in editor": `src/Hide/Sidebar.hs:111:1`, `verified: true` |
| Reference followed | seq 103 view references -> 104 follow row 3 -> 105: `src/Hide/Sidebar.hs:125:18`, `verified: true` |
| Back | seq 102 (site -> Definitions view) and seq 107 (site -> References view) |
| Notes citing returned locations | seq 97, 101, 106, 133 |
| Three rendered screens | `evidence/screens/hls-hide-{summary,definitions,references}.txt` taken via Shift+F12 and the row context menu (type `sectionIndices :: Sidebar → [Int]`, `sectionIndices — 1 definition`, `sectionIndices — 4 references`) |
| Regressions kept | `cabal test --offline -j1 -f-window -f-web -f-terminal inspector-checks` PASS; `node test/inspector-ui-smoke.mjs` 19 PASS; `node test/inspector-sidebar-scroll.mjs` PASS |

## Investigation in prose
`sectionIndices` (defined `src/Hide/Sidebar.hs:111`, signature :110) is used by `hiddenSections` (:118) and `adjacentSection` (:125). See
`evidence.json` for the full explanation.

## Commands and outcomes
- Session: `GHCRTS='-A16m -c' node inspector-hls-autonomy/hide-session.mjs start --size=120x40 --env XDG_CACHE_HOME=/sandbox/hls-cache/cache --env CABAL_CONFIG=/sandbox/hls-cache/cabal-config src/Hide/Sidebar.hs`, then one helper call per shell command, then `stop`.
- A first `inspect` at column 58 answered "No symbol at that position" (a paren); column 61 hit the identifier (reported column 59). Both are in the transcript.
- `editor_navigate` raised an "Agent permission" dialog in the editor; it was accepted with Alt+A (seq 109), after which the call completed (seq 110). The helper client timed out first (60 s shell timeout), the daemon did not.
- Earlier sessions (seq 0-90) were discarded (a helper call with several actions in one shell command; an OOM kill); only the last session is judged.

## NOT verified
Other modules (`Hide.Model`, `Hide.Render`), a build with `+terminal`, HLS with less than ~1.5 GB free RAM. The status text `Inspecting …` lingers after opening (cosmetic).
