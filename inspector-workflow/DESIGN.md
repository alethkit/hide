# Design: symbol inspection for humans and agents

## Layers (one description, two interpreters)
1. **Pure semantics** — `src/Hide/SymbolInspect.hs`. `Report` = symbol, buffer revision and three `Outcome`s
   (`Available | Empty | Unavailable`) for hover, definitions and references. Every `Site` carries absolute path,
   project-relative path, 1-based line/column (code points) and the trimmed line text seen when observed.
   Reports live under a `Reports` root of the existing typed inspector core (`Hide.Plugin.Inspect`); a `ReportId` is a serial
   never reused and sites are reached by keyed edges, so a retired report or removed site resolves to `Gone`, never to
   other data. Views (`hide.symbol.summary/definitions/references`, `hide.site.source`) are ordinary `ViewDef`s; rows
   navigate (`Inspect`) or open source (`OpenAt`). `symbolAt` picks the identifier/operator at a caret and rejects
   digits, whitespace, `--` comment markers and reserved syntax (`=`, `->`, `::` …).
2. **Host** — `src/Hide/SymbolInspector.hs`. Starts hover/definition/references through `Hide.Tooling`'s existing HLS
   workers (no second LSP client), with the buffer revision bound into each request. A request is *reserved* before it
   starts; only a still-reserved request can commit a report. Each tick revokes reservations and reports whose buffer
   changed revision, closed or became private. Concurrency/pages/reports/sites are bounded; cancelling a waiting
   request cancels its HLS requests.
3. **Human interpreter** — Model command `InspectSymbol` (Shift+F12, Tools menu, source context menu) → the existing
   rows window (`InspectorWindow`) with "→ View" rows and "← Back". A site page offers **Open in editor**
   (`OpenAt` → `PreparedJump`) which re-verifies the line text before moving the caret.
4. **Agent interpreter** — registered MCP tool `inspect_symbol` (R, read-only) with `discover | inspect | view |
   follow | back`. It renders the *same* prepared documents as JSON. Pages are random opaque tokens bound to caller,
   report, revision and a 15 minute expiry; every use re-checks token, caller, buffer revision/privacy and workspace
   containment against the live editor. `follow` on a source row returns a `location` re-verified against the current
   text (`verified: true`).

## Access and staleness
Private buffers (agent-authority files such as `thc.toml`, `[private]` title) are refused for `inspect`/`discover` and
revoke existing pages when a buffer becomes private. Files outside the workspace and protected files are *omitted* from
relations and counted, not returned. Stale `revision` arguments, edited buffers, forged/foreign/expired tokens, rows
without an action, out-of-range rows and changed lines are refused with plain sentences. Effectful queries are **not**
authorized in general: the tool itself is the only agent entry, and it runs exactly three read-only LSP requests.

## Back
Human history reuses the inspector trail: a view switch replaces the head entry, Navigate pushes, Back pops and
re-enters the previous (subject, view). The agent has `back(page)` returning the parent page and its view.

## Verification layers
* `test/SymbolInspectorCheck.hs` (in `inspector-checks`, against deterministic `test/fake-lsp.mjs`): simulated
  regression coverage of empty/error responses, cancellation, revisions, private revocation, stale/forged tokens,
  location re-verification, UI/agent parity. **Not** a real-HLS result.
* `test/inspector-symbol-workflow.mjs`: runtime acceptance on the built editor — rendered UI over the remote display
  protocol, `hide --mcp-editor` bridge to the same session (real MCP dispatch/admission), access checks against the live
  editor. Real mode requires a real HLS; `--fake-lsp` is a labelled dry run writing `evidence.fake-lsp.json`.
