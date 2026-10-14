# Open questions

1. [P2, environmental, no code action possible] `cabal test --offline -f-window -f-web -f-terminal` (no target) fails at
   dependency resolution/plan time in this sandbox: tasty 1.5.4, tasty-hunit,
   tasty-ant-xml, optparse-applicative, xml, generic-deriving, call-stack and
   prettyprinter-ansi-terminal are absent from ~/.local/state/cabal/store, and
   --offline forbids downloading them. The same failure occurs on the untouched
   baseline commit abf3e45. Consequence: `editor-tests` and `coverage-smoke`
   cannot be built here, so the COMPLETE marker's verification command cannot
   pass in this environment regardless of code state. Workaround used: a
   dependency-free `inspector-checks` test-suite for everything new; the same
   check modules are also registered in editor-tests (unbuilt here, only
   type-checked indirectly because they are the same modules).
