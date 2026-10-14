# Results

Status: **implementation, docs and simulated coverage complete; live real-HLS evidence missing** (see OPEN_QUESTIONS P1).
`evidence.json` currently records the blocker with all flags `false`; it must not be edited by hand.

## Requirement map
| # | Requirement | Code | Test / evidence | Kind |
|---|---|---|---|---|
| 1 | Discoverable Inspect symbol; type, definitions, references; no-symbol/empty/unavailable/error handled | `SymbolInspect`, `SymbolInspector`, Model `InspectSymbol` (Shift+F12, Tools menu, context menu) | `SymbolInspectorCheck` ("an unavailable HLS is stated…", "an empty answer is stated", "no symbol at the position…"); script UI steps (context menu, Shift+F12, Summary/Type/counts) | fake-LSP regression + rendered UI (fake LSP dry run) |
| 2 | Rows navigate to precise location; Back keeps view; no silent jump after edits | `OpenAt`/`PreparedJump`, trail in `InspectorWindow` | "back restores the definitions view", "a location whose line changed refuses to jump"; script: caret asserted at `path:line:col` after Open in editor, Back asserted twice | fake-LSP regression + rendered UI dry run |
| 3 | UI and agent from same descriptions; registered tool; docs | `symbolTools`/`symbolTool`, App registration | "the definitions view lists the same site the agent sees"; `tools/list` through `--mcp-editor`; `docs/haskell.md`, `docs/agent-tools.md` | regression + dry-run |
| 4 | Workspace/private/path limits; originating page/session/revision; revocation; bounded cancellable HLS | reservations, tokens, `tickSymbolInspector` | "making the buffer private revokes…", forged/foreign/expired tokens, "cancelling the waits frees their slots", "work for a changed buffer cannot commit" | fake-LSP regression |
| 5 | Real investigation, UI + registered tool via real dispatch | `test/inspector-symbol-workflow.mjs`, fixture `test/inspector-fixture` | **Real HLS: NOT RUN (blocker).** Dry run with fake LSP passes end to end (`evidence.fake-lsp.json`, `realHls:false`) | dry run only |
| 6 | Focused coverage, package inspector stays green, docs | `test/SymbolInspectorCheck.hs` in `inspector-checks` | `inspector-checks` passes with the 4 earlier suites (run by the script) | regression |

## Fake-LSP dry run (not real HLS)
`node test/inspector-symbol-workflow.mjs --fake-lsp` → PASS: focused checks, rendered Summary/Definitions/References,
site pages, Back ×2, caret at reference `app/Main.hs:5:27` and definition `src/Shapes.hs:9:1`, MCP `inspect_symbol`
registered and used (discover, inspect, view, follow, back, follow), access checks over the live editor (forged token,
private `[private]` buffer, no-symbol position, edit expires old pages, stale revision). The locations in that file
come from the fake server and prove plumbing only.

## Found and fixed while running the dry run
* `--` comment markers were selected as an operator symbol; now rejected (check added).
* Site labels now carry project-relative paths (`siteRelative`) so UI and agent show the same label.
