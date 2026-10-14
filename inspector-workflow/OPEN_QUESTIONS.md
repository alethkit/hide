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
