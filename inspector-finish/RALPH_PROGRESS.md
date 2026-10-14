# Progress: Haskell-native Phlow-style inspector for hide

Repository: /sandbox/hide (commits are local only; nothing pushed).
Git identity is not configured; commits use `-c user.name="Overnight Agent"`.

## Milestone 1 — typed inspector core (done, committed 4cd28a9)
- `packages/hide-plugin-api/src/Hide/Plugin/Inspect.hs` (pure, no new deps):
  `Observe` (any getter/lens/traversal/fold), keyed `Edge`, `Nav` (a Category of
  keyed `Step`s), `Here`/`Subject` (RootId + Revision + path + Typeable value),
  `Doc`/`Item`/`Target`, bounded+forced `prepareDoc`, `ViewDef`/`Body`/`Query`
  (effectful queries are registered `Command`s), `Inspectors` registry indexed by
  `SomeTypeRep` with `eqTypeRep` (no casts), scoped contributions/roots,
  `resolve`/`currentRevision` for stale references, `InspectPublisher`.
- `test/PluginInspectCheck.hs` (also wired into editor-tests + coverage-smoke).
- Framework-free `test-suite inspector-checks` (test/inspector/Main.hs) so the
  checks run offline: `cabal test hide:test:inspector-checks --offline -f-window -f-web -f-terminal` PASSES.

## Environment finding
`cabal test --offline` (the whole suite) cannot run here: tasty, tasty-hunit,
tasty-ant-xml (+ deps) are not in the cabal store and --offline refuses to
download them. This is true at the baseline commit too. See OPEN_QUESTIONS.md.

## Milestone 3 — integration + cancellation fix (this iteration)
- Root cause of the hanging package-sidebar cancellation check: `test-suite
  inspector-checks` was built without `-threaded`. In the non-threaded RTS the
  build job's `waitForProcess` on the deliberately infinite fake `cabal bench`
  is a blocking safe FFI call that freezes every Haskell thread, so neither the
  5 s `timeout` guards nor `stopSessionBuild` could run (the main thread sat in
  `do_wait`; confirmed via /proc task state and tick tracing). Fix: added
  `ghc-options: -threaded -rtsopts` to the suite (as editor-tests already has).
  The cancellation coverage (Benchmark → Stop → "Stopped.") is kept intact.
- Integration: `Hide.InspectorMenu` (human-only window-row "Open" action),
  package sidebar "Inspect" actions on root and every component (own
  `…inspect` command + inspector root bound to the slot's snapshot revision),
  `Plugin.Session.sessionInspect`, `Hide.App` wiring (`withInspector`,
  `publishPackageViews`, `withInspectorMenu`, `withPackageSidebar inspector`),
  `MenuCommands` accepts `PreparedWindow` replies for exact human rows.
  `PackageSidebarCheck` is now part of `inspector-checks`.
- `test/AgentSidebarCheck.hs` updated for the new Session field (type-checked
  with `ghc -fno-code`; editor-tests itself still cannot be built offline).
- Verified: `cabal build all --offline -j2 -f-window -f-web -f-terminal` OK;
  `cabal test hide:test:inspector-checks --offline ...` PASS (3 check groups),
  no leftover `cabal bench` subprocesses.

## Final audit (iteration 1, re-verified)
Build exit 0; inspector-checks PASS; no stray cabal bench processes; work committed in 263ec93. Only open item is P2 (environmental).
