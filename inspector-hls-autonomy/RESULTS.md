# Results

## Requirement -> evidence

| Requirement | Evidence |
| --- | --- |
| HLS works on hide source in the RUNNING editor | agent session, `evidence/tool-calls.jsonl` seq 135-165: `inspect_symbol` inspect at `src/Hide/Sidebar.hs:118:59` returned hover, 1 definition, 4 references, all `available` (seq 141) |
| Setup committed and documented | `hie.yaml`, `cabal.project.hls`, `tools/hls-env.sh`, `docs/haskell.md` ("Language server on hide itself"), `test/inspector-hls-hide.mjs`; DESIGN.md has the root causes |
| Scripted regression (NOT agent evidence) | `node test/inspector-hls-hide.mjs` -> PASS lines, wrote `/sandbox/hide-hls-scripted-check.json` (`sectionIndices`, 1 definition, 4 references) |
| Agent investigation, tool discovery | seq 136 `tools/list` (registered `inspect_symbol`, `lsp_*`), seq 137 `discover` |
| Definition followed | seq 142 view definitions -> 143 follow row 0 -> 144 follow site "Open in editor": `src/Hide/Sidebar.hs:111:1`, `verified: true` |
| Reference followed | seq 147 view references -> 148 follow row 3 -> 149: `src/Hide/Sidebar.hs:125:18`, `verified: true` |
| Back | seq 146 (site -> Definitions view) and seq 151 (site -> References view) |
| Notes citing returned locations | seq 140, 145, 150, 164 |
| Three rendered screens | `evidence/screens/hls-hide-{summary,definitions,references}.txt` taken via Shift+F12 and the row context menu (type `sectionIndices :: Sidebar → [Int]`, `sectionIndices — 1 definition`, `sectionIndices — 4 references`) |
| Regressions kept | `cabal test --offline -j1 -f-window -f-web -f-terminal inspector-checks` PASS; `node test/inspector-ui-smoke.mjs` 19 PASS; `node test/inspector-sidebar-scroll.mjs` PASS |

## Investigation in prose
`sectionIndices` (defined `src/Hide/Sidebar.hs:111`, signature :110) is used by `hiddenSections` (:118) and `adjacentSection` (:125). See
`evidence.json` for the full explanation.

## Commands and outcomes
- Session: `GHCRTS='-A16m -c' node inspector-hls-autonomy/hide-session.mjs start --size=120x40 --env XDG_CACHE_HOME=/sandbox/hls-cache/cache --env CABAL_CONFIG=/sandbox/hls-cache/cabal-config src/Hide/Sidebar.hs`, then one helper call per shell command, then `stop`.
- The first `inspect` used column 61 (inside the identifier); the report's own column is 59, which the gate requires to equal the request, so seq 141 repeats it at 59 (seq 139 is the earlier one).
- `editor_navigate` raised an "Agent permission" dialog in the editor; it was accepted with Alt+A (seq 152), after which the call completed (seq 153). The helper client timed out first (60 s shell timeout), the daemon did not.
- Earlier sessions (seq 0-134) were discarded (a helper call with several actions in one shell command; an OOM kill; session 3 (seq 91-134) because bash exec'd the helper so its shell ancestry was `pi`, see PROBES.md P12); only the last session is judged.

## NOT verified
Other modules (`Hide.Model`, `Hide.Render`), a build with `+terminal`, HLS with less than ~1.5 GB free RAM. The status text `Inspecting …` lingers after opening (cosmetic).
