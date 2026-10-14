# Sidebar discoverability — design

Investigation method: an LLM agent (this one) drove a real `hide --remote` editor and a real `hide --mcp-editor`
bridge one call at a time through `hide-session.mjs`; every call and response is in
`evidence/tool-calls.jsonl`. Nothing here was replayed from a script.

## Diagnosis (verified against the running editor and the sources)

* The left sidebar is ONE flat, indexed row map: every provider root (Files, Sessions, Debug, Watches,
  Agents, then the package) is a top-level entry of `treeRoots` (`Sidebar.hs:62`, cap 32 roots, `addRoot`
  `Sidebar.hs:130`); `prepareProjection` (`Sidebar.hs:233`) projects them in publication order into
  `treeRows :: Map [Int] TreeRow`, so section order is publication order and the Files root is always first.
  The package root is published after the agents/sessions roots (`PackageSidebar.hs:280`).
* There is no per-section row budget. A section's rows are simply the rows of that root's subtree, so a long
  Files tree pushes every later root below the viewport. The single scroll offset `treeScroll`
  (`Sidebar.hs:61`) applies to the whole flat map; viewport height is `treeContentRows` (`Model.hs:4858`,
  screen rows − 4 − messages height).
* **Correction to the task statement:** the sidebar *can* be scrolled. Wheel (`Model.hs:4881-4882`), `End`/
  `PageDown`/arrows when the tree is focused (`Model.hs:4818-4822`), and the scrollbar all exist, and hit testing
  uses `treeScroll+y-2` consistently (`Model.hs:4879`, `SidebarCommands.hs:769`, `GuestAccess.hs:443`). Live, on
  the unmodified build, a wheel-down over the sidebar of the 60-directory fixture brings `▶ longtree` into
  view (see `tool-calls.jsonl`, wheel call after `start --cwd /sandbox/longtree-fixture`).
* **The real defect is discoverability.** The scrollbar is drawn only while the tree is focused
  (`Render.hs:990`, `| treeFocused tree, visible>=3`) and its track/thumb only react to clicks while focused
  (`Model.hs:4874`). In a freshly started editor the tree is unfocused, so the sidebar shows 35 Files rows,
  no scrollbar and no hint that Sessions/Agents/package sections exist (`evidence/screens/before-long-files.txt`).
  A user who does not already know to wheel/focus+End cannot know packages are there. There is also no
  section-level navigation: moving by section means paging through every Files row.
* HLS on hide itself does not work out of the box (see OPEN_QUESTIONS.md): the plain `cabal.project`
  cannot be solved offline without `-f-terminal` (no libghostty-vt pkg-config), so HLS reports
  `No handler for: SMethod_TextDocument…`.

## Design

Keep the single flat indexed tree (no second viewport, no per-section state to keep valid on reload) and make the
existing scroll discoverable and section-aware:

1. **Scrollbar whenever rows overflow**, focused or not (`Render.hs`), and its track/arrow/thumb handle clicks
   and drags whether or not the tree is focused (`Model.hs`).
2. **"More sections" cue** on the sidebar's otherwise empty top row (row 1, left of the `[←]` button): when
   one or more root (section) rows lie below the viewport it reads `↓ N more sections` (singular `↓ 1 more section`),
   and it is a click target that scrolls the next hidden section root to the top of the sidebar (clamped by the scroll limit).
   Row 1 holds no tree row, so the cue never covers a tree row and never disturbs hit testing, selection
   visibility or keyboard scrolling.
3. **Keyboard**: `Ctrl+Down` / `Ctrl+Up` in the focused tree jump the selection to the next / previous section
   root (existing `selectTreeRow` keeps the selection visible). `End`, `PageDown` and the wheel already work.
4. Cost model (AGENTS.md): the cue needs the number of root rows at index ≥ end of viewport. Roots have
   singleton addresses `[i]`; `M.lookupIndex [i] treeRows` is O(log n) and there are ≤32 roots, so the cue is
   ≤32 logarithmic lookups per painted frame and is derived from state already in `SidebarKey`
   (rows identity, scroll, screen height) — no new Desktop field, no full-tree traversal, no text comparison.
   Stale-action protection is untouched: scroll commands only change `treeScroll`/`treeSelected` via
   `scrollTreeTo`/`selectTreeRow`, and activation still goes through `hitCurrent` generation checks.

## Rejected alternatives

* *Per-section viewports*: needs per-section scroll offsets and heights that must be revalidated on every
  reload/expansion; large change for a problem that is discoverability, not reachability.
* *Collapse Files by default / reorder packages above Files*: hides the user's most used section or
  surprises people; order is publication order by design and other sections would still be pushed away.
* *Overlay the cue on the last tree row*: covers a row that selection/hit testing consider visible.
* *Sticky section headers*: needs a second layout pass over the viewport; the cue achieves discoverability
  more cheaply.
