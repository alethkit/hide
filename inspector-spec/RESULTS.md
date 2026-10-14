# Results

Environment: /sandbox/hide, offline, `-f-window -f-web -f-terminal`, GHC 9.14.1. Verified commands:
* `cabal build all --offline -j2 -f-window -f-web -f-terminal` — OK.
* `cabal test hide:test:inspector-checks --offline -j2 -f-window -f-web -f-terminal --test-show-details=direct` — PASS
  (InspectorSpecCheck, PluginInspectCheck, InspectorWindowCheck, PackageSidebarCheck).
* `node test/inspector-ui-smoke.mjs` — real `hide --remote` process, isolated XDG dirs, 120x40 frames decoded; 6 of 6
  consecutive runs passed after the settle fix, printing `PASS inspector history runtime` after a clean exit.

| # | Criterion | Implementation | Evidence |
|---|-----------|----------------|----------|
| 1 | Two independent modules extend an existing type; coexistence and scoped retirement | `test/InspectorExample/Summary.hs`, `Counts.hs` attach views to unchanged `PackageSources` via public `attach`/`viewDef`; `Hide.PackageInspect` is a third contributor | `InspectorSpecCheck`: view list holds all four views in order; `withdrawViews` of Summary leaves Counts and package views; `withdrawRoot` makes `openJSON` refuse. Core scoping in `PluginInspectCheck`. |
| 2 | Typed relations into another inspector with history; Back through package/component/source and view switching; re-resolve live roots | `Edge`/`Nav`, `resolve`; `followInspectorRow`, `GoBack`, per-page trail in `Hide.InspectorWindow` | `InspectorSpecCheck`: top→component→Declaration view→Back restores parent without Back loop; nested component→source→Back; revision change removing the component makes Back refuse ("re-resolves and refuses a removed ancestor"); agent origin refused. Runtime: smoke goes package→component→view switch×2→source→Back→component→view switch→Back→package, asserting titles/facts and absence of stale pages. |
| 3 | Same semantic document for human window and agent JSON; library API/examples; typed targets stay typed; page-local ids; no network service/private windows | `Hide.Plugin.Inspect.JSON` (`renderJSON`, `openJSON`, `jsonValue`, `jsonTarget`); examples in `test/InspectorExample`; DESIGN.md | `InspectorSpecCheck`: JSON equals expected value for the document that built the UI page, round-trips through aeson, text/facts/duplicate labels preserved, bounds/omission row, out-of-range ids resolve to nothing, `jsonTarget` returns a typed `Inspect` subject usable with `openJSON`, queries refused (`InspectorWindowCheck`), stale revision/retired root refused. No tool, socket or window is exposed (grep: JSON module imports no Window/Command/network). |
| 4 | Real PackageSources, ComponentSources, source declarations | `Hide.PackageInspect`, package sidebar Inspect, `Hide.InspectorMenu` | Checks parse a real cabal file; runtime smoke inspects this repository's real `hide` package: `hide — N components`, `exe:hide — unconditional sources`, `ComponentSources · Declaration` ("Source directories: app"), `Source · Declaration` ("Kind: Main"). |
| 5 | Focused checks + existing offline build; rendered UI | `inspector-checks` suite, `test/inspector-ui-smoke.mjs` | Build and tests above; the smoke fails on timeout, protocol error, wrong/stale page, non-zero or unclean exit. |
| 6 | DESIGN/RESULTS/OPEN_QUESTIONS; local commit | this folder | git log (no push). |

## Defects found and fixed this iteration
* `test/InspectorExample/Counts.hs` had unbalanced brackets (draft never compiled) — fixed.
* `test/inspector-ui-smoke.mjs` was racy: `/Inspect/` matched buffer text before the context menu appeared and a stale
  frame could satisfy a step. Now matches the menu item and requires a 200 ms-settled frame after each input.
* Back steps added; the marker is printed only after all steps and a clean editor exit.
* `docs/running.md` documents Back.

## Limitations (precise)
* Full `editor-tests` cannot be built offline (missing tasty deps; see OPEN_QUESTIONS 1); new checks live in
  `inspector-checks` only.
* JSON is a library, not wired to an agent tool; effectful queries are human-only.
* History is bounded (32 entries per page, 64 remembered pages); Back is a row, not a hotkey.
* Runtime evidence covers the package → component → source chain on this repository; component-removal-on-Back is
  verified at the library/window layer (live registry), not by editing a .cabal file under the running UI.
