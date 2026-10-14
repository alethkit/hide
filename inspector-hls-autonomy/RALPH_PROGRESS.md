# RALPH progress

## Iteration 1
Root causes (PROBES.md P1–P10): cradle (`hie.yaml` -> `cabal.project.hls`), writable `XDG_CACHE_HOME`, `CABAL_CONFIG` for relocated XDG dirs,
`GHCRTS="-A16m -c"` for memory. Committed 5b9132b (setup files, scripted regression, docs).

## Iteration 2
Done: clean agent session (seq 91-134) on `sectionIndices` (Sidebar.hs): inspect, definition (111), reference (125), two Backs, 4 notes, three
UI screens; scripted regression, inspector-checks, ui-smoke, sidebar-scroll all PASS; DESIGN/RESULTS/OPEN_QUESTIONS/evidence.json written.
Next: commit explicit paths, run `node inspector-hls-autonomy/check-deliverables.mjs`, claim completion if it passes. Do NOT start another session
(a new `start` would change the judged "last session").
