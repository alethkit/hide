# RALPH progress — symbol inspection workflow

## Iteration 1
### Done
* Read AGENTS.md, inspector-spec/*, Tooling/InspectorWindow/InspectorMenu/App wiring.
* HLS probe (ONCE, do not repeat): `which haskell-language-server-wrapper`, `$THC_EDIT_HLS` (empty), `~/.ghcup/bin`
  (only cabal/ghc/ghcup tools), `~/.ghcup/hls` (empty dir), `find / -xdev -iname '*language-server*' -o -iname 'hls*'
  -o -iname 'ghcide*'` -> nothing, no HLS tarball in ghcup cache/trash, /opt unreadable. **No real HLS is installed.**
### Design chosen (see DESIGN.md)
* `Hide.SymbolInspect` (pure semantic layer: Report/Site, edges, views) ; `Hide.SymbolInspector` (host: human flow +
  agent tool `inspect_symbol`), both consume existing `Hide.Tooling` lsp_hover/lsp_definition/lsp_references queries.
* Human: command `InspectSymbol` (context menu "Inspect symbol", Tools menu, Shift+F12).
### Current failure evidence
* real-HLS runtime acceptance cannot pass: blocker above.
### Next action
* implement layers, checks, runtime script (fake-LSP mode labelled non-real), docs; commit milestones.
