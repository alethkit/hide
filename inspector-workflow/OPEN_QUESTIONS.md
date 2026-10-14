# Open questions

## P1 — No real HLS installed (blocks WORKFLOW_COMPLETE)
Requirement 5 and the runtime acceptance demand a live investigation with an installed compatible HLS. None exists on
this box (`PATH`, `$THC_EDIT_HLS`, `~/.ghcup/{bin,hls}`, whole-filesystem name search; `/opt` unreadable) and downloads
and installs are forbidden. `inspector-workflow/evidence.json` therefore records every flag `false` plus the blocker.
**Next action:** provide `haskell-language-server-wrapper` built for GHC 9.14.1 on `PATH` or via `THC_EDIT_HLS`, then run
`node test/inspector-symbol-workflow.mjs` and commit the resulting `evidence.json`.

## P2 — Real-HLS behaviours unverified (HYPOTHESIS until the run above)
* HYPOTHESIS: HLS needs 20–90 s to load the fixture package; the script retries (UI 6×, agent 8×, 20 s apart).
* HYPOTHESIS: the fixture's `Shapes.hs` export list and `module` line count as references (HLS includes declarations
  in `references`); the script expects ≥2 reference locations including `app/Main.hs`.
* HYPOTHESIS: real hover returns a markdown block whose first code fence is the signature; the UI assertion only
  requires `::` in the Type row.

## P3 — Deliberate limits
* Only one symbol per request; no type-definition or call-hierarchy views.
* Operators and backquoted names are selected by lexical class, not by the parser.
* Human history is per page; no cross-session persistence.
