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

Pi investigated the sidebar through a running editor: 23 tool calls over 10
registered tools were recorded. However, HLS on hide itself did not provide
definition/reference results. Therefore the sidebar fix is verified, while
the requested agent-led definition/reference investigation remains incomplete.
Fixture-based real-HLS acceptance is a scripted MCP investigation, not an
autonomous LLM investigation. Do not conflate these two results.

The full editor-tests suite, native frontend behavior, accessibility announcement
of the new cue, and matching rendered-frame allocation baseline were not verified.
Sidebar section ordering is still unstable. Ralph timeout reporting can miss
progress made through commits and remains a separate follow-up.

See ../inspector-spec/RESULTS.md, ../inspector-workflow/RESULTS.md,
../inspector-autonomy/RESULTS.md and their OPEN_QUESTIONS.md files for evidence.
Runtime runner state and transient logs stay local; committed structured evidence
and before/after displays remain available in the campaign directories.
