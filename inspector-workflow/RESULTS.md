# Results

Status: **complete with live real-HLS evidence.** `node test/inspector-symbol-workflow.mjs` passes against HLS 2.14.0.0
(selected server GHC 9.14.1, `/sandbox/hls-ghcup`) and writes `evidence.json` (all required flags `true`; generated, not hand-edited).

## Requirement map
| # | Requirement | Code | Test / evidence | Kind |
|---|---|---|---|---|
| 1 | Discoverable Inspect symbol; type, definitions, references; no-symbol/empty/unavailable/error handled | `SymbolInspect`, `SymbolInspector`, Model `InspectSymbol` (Shift+F12, Tools menu, context menu) | `SymbolInspectorCheck` ("an unavailable HLS is stated…", "an empty answer is stated", "no symbol at the position…"); script UI steps (context menu, Shift+F12, Summary/Type/counts) | fake-LSP regression + rendered UI (fake LSP dry run) |
| 2 | Rows navigate to precise location; Back keeps view; no silent jump after edits | `OpenAt`/`PreparedJump`, trail in `InspectorWindow` | "back restores the definitions view", "a location whose line changed refuses to jump"; script: caret asserted at `path:line:col` after Open in editor, Back asserted twice | fake-LSP regression + rendered UI dry run |
| 3 | UI and agent from same descriptions; registered tool; docs | `symbolTools`/`symbolTool`, App registration | "the definitions view lists the same site the agent sees"; `tools/list` through `--mcp-editor`; `docs/haskell.md`, `docs/agent-tools.md` | regression + dry-run |
| 4 | Workspace/private/path limits; originating page/session/revision; revocation; bounded cancellable HLS | reservations, tokens, `tickSymbolInspector` | "making the buffer private revokes…", forged/foreign/expired tokens, "cancelling the waits frees their slots", "work for a changed buffer cannot commit" | fake-LSP regression |
| 5 | Real investigation, UI + registered tool via real dispatch | `test/inspector-symbol-workflow.mjs`, fixture `test/inspector-fixture` | **Real HLS: PASS** (`evidence.json`, `logs/run.log`): rendered UI over the remote display protocol, `hide --mcp-editor` tool path, `area` defined at `src/Shapes.hs:10`, used at `app/Main.hs:9` and others. Fake-LSP dry run kept as `evidence.fake-lsp.json` (`realHls:false`) | live (agent client is a scripted MCP client, not an LLM session) |
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

## Real-HLS run (live)
Command: `THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper GHC_BIN=/home/node/.ghcup/bin/ghc node test/inspector-symbol-workflow.mjs`
(PATH prefixed with `/sandbox/hls-ghcup/bin`). Passed twice in a row (exit 0). Observed in the rendered editor: Inspect symbol in the
context menu and on Shift+F12; Summary with the real hover `area :: Shape → Double`; Definitions view → `src/Shapes.hs:10:1`
→ site page → Back restores the Definitions view; References view → reference in `app/Main.hs` → Back; Open in editor puts
the caret on the exact line:column. The agent path then ran inspect/view/follow/back/follow through the MCP bridge, and access
checks (forged token, private buffer, out-of-place position, edit expiry, stale revision) were refused on the live editor.
The wrapper's `--version` prints its own build GHC 9.10.3; the server it launches is `haskell-language-server-9.14.1`
(recorded in `evidence.json` under `hls.selectedServer`).

## Root causes found by the first live runs (all fixed)
1. *"No handler for SMethod_TextDocumentReferences"* was not a hide LSP bug. HLS had **no handlers at all**: its cradle failed
   twice. (a) The fixture `.cabal` began with SPDX comments before `cabal-version`, which cabal rejects; `cabal-version` is now
   the first line. (b) The harness's fresh isolated XDG tree made cabal write a default config and try to fetch the Hackage
   index (network blocked), so the cabal cradle died; the harness now gives cabal an empty `CABAL_CONFIG` (fixture needs only boot packages).
2. *Definitions: none* with a working hover: the fixture had a separate library component; HLS only resolves a definition in
   another component after that component is loaded/indexed (HYPOTHESIS, consistent with the hover text "Defined in ‘Shapes’
   (hide-symbol-fixture-0.1.0.0)"). The fixture is now one executable component, so `Shapes` resolves immediately.
3. Harness: the retry path searched for the source text while the inspector page covered it (`TypeError … reading 'x'`);
   it now re-activates Main.hs (Alt+1) first and states a clear error if the source is not visible. Readiness also
   treats `Definitions: none`/`References: none` right after startup as "not ready", bounded by the 6 attempts; the
   later assertions still demand a real definition and references.
