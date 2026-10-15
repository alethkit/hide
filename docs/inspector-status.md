# Inspector integration status

The typed inspector core, package UI, JSON interpreter, navigation history,
symbol inspection tool, and sidebar discoverability fix are implemented.
Existing commits are preserved; this document consolidates the campaign results.

## Verified behavior

- Independent extensions share semantic views across human UI and JSON.
- Package and component inspection supports navigation and Back.
- Real HLS 2.14 with GHC 9.14.1 supplies symbol definitions and references in
  the fixture; the rendered UI and registered MCP tool both follow locations.
- Forged tokens, private buffers, expired pages, and stale revisions are refused.
- Long Files trees expose a sidebar overflow cue and scrollbar. Clicking the
  cue or using section navigation reaches packages without collapsing Files.
- The final autonomy gate passed build, inspector checks, package UI smoke,
  sidebar scrolling UI, and recorded deliverables.

## Autonomy outcome and remaining work

The follow-up HLS autonomy campaign completed on 2026-10-14 in two iterations.
Pi discovered the registered inspector tools on a running editor and inspected
sectionIndices on hide's own source (src/Hide/Sidebar.hs:118). HLS returned hover,
one definition and four references. Pi followed the definition at line 111 and
a reference at line 125, verified both source locations, and navigated Back twice.
The strict deliverables gate independently passed again during pack-up.

The setup uses hie.yaml and cabal.project.hls for the offline component flags,
tools/hls-env.sh for writable caches and Cabal configuration, and
GHCRTS='-A16m -c' for memory headroom. Only Sidebar.hs was exercised; analysis of
Hide.Model, Hide.Render and terminal-enabled builds remains unverified. HLS and
the editor still need substantial free RAM. Fixture-based scripted evidence is
kept separate from the recorded Pi investigation.

The full editor-tests suite, native frontend behavior, accessibility announcement
of the new cue, and matching rendered-frame allocation baseline were not verified.
Sidebar section ordering is still unstable. Ralph timeout reporting can miss
progress made through commits and remains a separate follow-up.

See ../inspector-spec/RESULTS.md, ../inspector-workflow/RESULTS.md,
../inspector-autonomy/RESULTS.md, ../inspector-hls-autonomy/RESULTS.md
and their OPEN_QUESTIONS.md files for evidence.
Runtime runner state and transient logs stay local; committed structured evidence
and before/after displays remain available in the campaign directories.
