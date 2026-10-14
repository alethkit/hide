# Open questions

No P0/P1 items remain. The former P1 (no HLS installed) was resolved by the user-authorized installation under
`/sandbox/hls-ghcup`; the live acceptance run now passes (see RESULTS.md).

## P2 — HYPOTHESES from the live run (not verified beyond this fixture)
* HYPOTHESIS: cross-component definitions (e.g. exe → separate library in the same package) return no location until HLS has
  loaded the target component; real multi-component projects may show "Definitions: none" at first. The UI states it
  plainly; a "retry"/refresh affordance is not implemented.
* HYPOTHESIS: HLS references include declaration/export/signature sites (observed: 7 locations for `area`, 6 in `Shapes.hs`).

## P3 — Limits
* When HLS's cradle fails, every request errors with "No handler for: SMethod_…". The inspector shows that text verbatim; it
  does not diagnose the cradle (cabal config, `.cabal` syntax). Surfacing HLS's own startup diagnostics would be kinder.
* Only one symbol per request; no type-definition or call-hierarchy views.
* Operators and backquoted names are selected lexically, not by the parser.
* Human history is per page; no cross-session persistence.
* The agent investigation is a scripted MCP client, not an autonomous LLM session.

## P3 — found in iteration 3
* `node test/inspector-ui-smoke.mjs` failed (package sidebar not visible) once the checkout gained top-level task directories
  (`.ralph-runner`, `inspector-*`): the Files tree grew to 34 rows and the Packages section, published after Agents, fell below
  the 40-row viewport (verified: the same smoke passes at 120x50). The sidebar has no scrolling of later sections; the smoke now
  uses 120x60. Product follow-up: let the sidebar scroll or order Packages before long trees.
* `evidence.json` is now byte-stable across reruns (random page references are renumbered `page-N`), so the committed-evidence
  gate, which runs after the acceptance run rewrites the file, does not see a diff.
