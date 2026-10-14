# Progress

## Iteration 1 (complete)
Done: diagnosis with the live tools (23 calls/10 tools), before screen on the unfixed build, fix (section cue,
unfocused scrollbar, Ctrl+Up/Down/Home/End commands, scroll clamping), SidebarScrollCheck in inspector-checks,
`test/inspector-sidebar-scroll.mjs`, docs, after screens on the fixed build, DESIGN/RESULTS/OPEN_QUESTIONS/evidence.json.
Verified: build, inspector-checks, old smoke, new script all pass; no session left running.
Failing evidence: none known. HLS on hide did not work (documented, hlsOnHide=false).
Next action: none required; if a later iteration runs, re-run the gate and, if memory allows, the editor-tests sidebar
suites (SidebarCheck/BindingsCheck/ProtocolCheck) which were not run.

## Iteration 2 (audit)
Re-audited against the gate: all checks in "Current evidence" pass (build, inspector-checks, old smoke, new scroll script,
deliverables gate); work committed (ec9185d); no session running; no P0/P1. Nothing further required.
