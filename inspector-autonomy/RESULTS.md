# Results

Honest labelling: the investigation was done by an LLM agent (this one) calling registered tools of a real
running editor one call at a time through `hide-session.mjs`; `evidence/tool-calls.jsonl` is that transcript
(23 `tools/call`s over 10 registered tools, plus `tools/list`, 26 screen captures, 10 clicks, 11 keys, 2 wheels).
HLS on hide itself did not answer (see OPEN_QUESTIONS.md), so no definition/reference results are claimed.

## Requirement → code / test / evidence

| # | Requirement | Where | Kind |
|---|-------------|-------|------|
| 1 | Investigate with registered tools | `evidence/tool-calls.jsonl`, DESIGN.md "Diagnosis" | live |
| 2 | Reproduce at 120x40, keep before screen | `evidence/screens/before-long-files.txt` (fixture `/sandbox/longtree-fixture`: 60 dirs + `longtree.cabal`; unfixed build; Files expanded, 35 tree rows, no `longtree` row, no scrollbar, no cue). Also `before-focused-end.txt` | live |
| 3 | Fix | `src/Hide/Sidebar.hs` (`sectionIndices`, `hiddenSections`, `adjacentSection`), `src/Hide/Render.hs` (scrollbar when overflowing, `↓ N more sections` cue on row 1), `src/Hide/Model.hs` (cue click, unfocused scrollbar clicks, `fitTreeScroll`, `SidebarSection`/`SidebarEdge` commands, `treeKey` Ctrl+Up/Down), `src/Hide/Commands.hs` (four bindable commands + default chords), `src/Hide/SidebarCommands.hs` (clamp after projection adoption / retire) | code |
| 4 | Focused tests in inspector-checks | `test/SidebarScrollCheck.hs`, `test/inspector/Main.hs`, `hide.cabal` `other-modules` — 30 assertions: section indices, hidden sections, cue/scrollbar rendering, wheel, cue click, hit testing after scroll, Ctrl+Up/Down, binding-driven keys, collapse/resize clamping, narrow cue, singular cue, short tree has no cue | unit (pure state; not a UI result) |
| 5 | Rendered script | `test/inspector-sidebar-scroll.mjs` — temp fixture (64 dirs + `scrolltree.cabal`), 120x40, Files never collapsed, settled-frame assertions, cleans temp state, nonzero on failure | live (remote display protocol) |
| 6 | Existing checks kept | `test/inspector-ui-smoke.mjs` unchanged (all step labels, 120x60 and collapse-Files precondition retained); all earlier inspector-checks modules still run and pass | live + unit |
| 7 | Docs | `docs/editing.md` "Sidebar sections"; `docs/running.md` "Inspect packages and components" | docs |
| 8 | Records | this directory | — |

After screens (fixed build, same fixture and 120x40 viewport as the before screen, driven through the session helper):
`after-initial-cue.txt` (cue + scrollbar at start), `after-package-reachable.txt` (after clicking the cue: `▶ longtree`
row at the bottom), `after-package-inspector.txt` (right-click → Inspect → `longtree — 1 component`).

## Commands run and outcomes (final state)

```
export HOME=/home/node GHC_BIN=/home/node/.ghcup/bin/ghc PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH
cabal build all --offline -j2 -f-window -f-web -f-terminal            # OK
cabal test hide:test:inspector-checks --offline -j2 -f-window -f-web -f-terminal --test-show-details=direct   # PASS, incl. "sidebar scroll checks passed"
node test/inspector-ui-smoke.mjs                                       # all PASS (19 lines), editor exits cleanly
node test/inspector-sidebar-scroll.mjs                                 # 24 PASS lines, editor exits cleanly
node inspector-autonomy/check-deliverables.mjs                         # see below
```

Fixes needed while verifying: the first live keyboard run showed `End`/`Home`/`Ctrl+Down` did nothing in the real
editor even though unit tests passed (bindings consume the key first — see DESIGN.md), which is why the commands are
bindable. The first resize assertion also failed honestly (a shrunk window hides the package again); the script now
asserts the cue returns and one click reaches the package instead of relaxing the check.

## What was NOT verified
* Native window, web and terminal frontends are built with `-f-window -f-web -f-terminal`; only the remote display
  protocol path (cell frames) was exercised. The cue is ordinary cell text, so other frontends should show it, but
  that is a HYPOTHESIS.
* Accessibility semantics (`Hide.Accessibility`) do not announce the new cue; not changed or tested.
* The full `editor-tests` suite (SidebarCheck, BindingsCheck, ProtocolCheck, AccessibilityCheck, …) was NOT run
  (uncached dependencies, per the campaign rules). Those suites touch `treeScroll`, bindings and command identities
  that this change affects (new `Command` constructors, new bindings, `fitTreeScroll` on collapse/adoption/resize);
  a regression there is possible and unchecked.
* No per-frame allocation baseline was measured (AGENTS.md asks for one). The added work is ≤33 `Map.lookupIndex`/
  `lookupGT` calls per painted frame and only while the tree overflows; HYPOTHESIS: well under the 2× budget.
* No real-HLS run; `test/inspector-symbol-workflow.mjs` was not run.
