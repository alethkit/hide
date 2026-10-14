# Progress

## Iteration 1
Done: built fixture `/sandbox/longtree-fixture` (60 dirs + `longtree.cabal`); real editor session at 120x40;
tools/list + 20+ registered tool calls; `before-long-files` screen recorded on the unfixed build; diagnosis in DESIGN.md.
HLS on hide: root cause found (cabal cannot solve default flags offline), uncommitted hie.yaml experiment did not
make the editor's HLS answer; recorded in OPEN_QUESTIONS.md.
Next: implement cue/scrollbar/Ctrl+Up/Down (Render.hs, Model.hs, Sidebar.hs), SidebarScrollCheck in inspector-checks,
`test/inspector-sidebar-scroll.mjs`, docs, rebuild, after-screens, RESULTS.md, evidence.json.
