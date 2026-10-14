# Open questions

1. [P2, environmental] Full `cabal test --offline` (`editor-tests`, `coverage-smoke`) cannot be built in this sandbox:
   tasty, tasty-hunit, tasty-ant-xml and dependencies are absent from the cabal store and `--offline` forbids
   downloading them (same at baseline commit abf3e45). New checks therefore run in the dependency-free
   `inspector-checks` suite. `InspectorSpecCheck`/`InspectorWindowCheck` are not registered in `editor-tests`;
   HYPOTHESIS: they would compile there unchanged since they are the same framework-free modules.
2. [P3, design] JSON export is a library function; no agent tool is wired to it. Doing so needs a disclosure policy
   (which roots an agent may see), which was out of scope and deliberately not invented.
3. [P3, limitation] JSON never executes effectful `Queried` views (returns an error); only the human window does.
4. [P3, limitation] The UI Back row is a window row ("Open" on "← Back"), not a keyboard shortcut/button.
5. [P3, test hygiene] The runtime smoke judges only a display that has been quiet for 200 ms after input; before that
   fix a race (an editor buffer containing the word "Inspect") made it flaky about 1 run in 4.
