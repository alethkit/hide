---
max_iterations: 12
timeout: 1800
completion_promise: WORKFLOW_COMPLETE
completion_gate: required
stop_on_error: false
required_outputs:
  - DESIGN.md
  - RESULTS.md
  - OPEN_QUESTIONS.md
  - evidence.json
commands:
  - name: build
    run: cabal build all --offline -j2 -f-window -f-web -f-terminal
    timeout: 900
    acceptance: true
  - name: inspector_regressions
    run: timeout --signal=TERM --kill-after=10s 180s cabal test hide:test:inspector-checks --offline -j2 -f-window -f-web -f-terminal --test-show-details=direct
    timeout: 210
    acceptance: true
  - name: package_ui_regression
    run: node test/inspector-ui-smoke.mjs
    timeout: 90
    acceptance: true
  - name: symbol_workflow
    run: THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper GHC_BIN=/home/node/.ghcup/bin/ghc PATH=/sandbox/hls-ghcup/bin:/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH node test/inspector-symbol-workflow.mjs
    timeout: 240
    acceptance: true
  - name: committed_evidence
    run: node /sandbox/ralph-validation/workflow-deliverables.mjs
    timeout: 30
    acceptance: true
guardrails:
  block_commands:
    - 'git\s+push'
  protected_files:
    - 'policy:secret-bearing-paths'
---
# A useful symbol-inspection workflow for humans and agents

Work autonomously in /sandbox/hide in the EXISTING hide-phlow sandbox. The user
wants the next product increment toward a Haskell-native spiritual successor to
Glamorous Toolkit, and wants Pi/Ralph to plan, implement, debug, test and finish
without routine intervention from the user or Codex. This task starts with an
outcome and acceptance criteria, NOT a nearly finished implementation.

## Outcome
A user selects a Haskell symbol in an open source buffer, inspects it, follows
its definition and references, and navigates back. An agent can investigate the
same symbol through authorized tools returning the same semantic views, follow
those relationships, and produce an explanation grounded in source locations.
This is a focused vertical slice, not a replacement editor or a full GT clone.

## Start here
Read AGENTS.md and inspector-spec/{DESIGN,RESULTS,OPEN_QUESTIONS}.md. Baseline
4aebd35 completed the package inspector, typed core, JSON library and Back history.
Inspect the existing architecture before choosing implementation details.
Useful starting points: src/Hide/Tooling.hs already owns HLS and agent operations
lsp_hover/lsp_definition/lsp_references/lsp_document_symbols; test/ToolingCheck.hs,
test/HLSLive.hs; existing agent access/admission checks and tool registration;
Hide.Plugin.Inspect, Inspect.JSON, InspectorWindow, InspectorMenu, PackageInspect.
Reuse existing workers, request lifetimes, buffer revisions and access policies.
Do not create a second language-server client or duplicate tool framework.

## Required behaviors
1. Discoverable Inspect Symbol action at the selected symbol/caret in a Haskell
   source buffer. Show available type/hover information and definition/reference
   views. Handle no symbol, no result, unavailable HLS and errors clearly.
2. Definition/reference rows navigate to the precise source location using existing
   admission. Back restores meaningful inspection history, including view choices.
   Location identities must not silently jump to unrelated data after edits.
3. Human UI and agent JSON derive from the same semantic inspection descriptions.
   Add a usable agent tool through existing registration/admission, not just a
   JSON library or test helper. Expose discovery, inspection and follow-up actions
   sufficient for the investigation. Document schemas and examples.
4. Respect workspace/private-buffer/path restrictions and tool capabilities.
   Bind actions to their originating page/session/revision; reject stale, forged,
   cross-session and expired references. Changing a buffer to private must revoke
   access. Do not authorize all effectful inspector queries to solve this task.
   Make HLS queries explicit, bounded and cancellable on existing workers.
5. Demonstrate one real investigation: choose a small Haskell fixture or existing
   symbol with definition and references, enter from the UI, follow a relation and
   Back; invoke the registered agent tool through the real tool dispatch/admission
   path, follow a relation, and record a concise explanation with actual source
   locations derived from tool results. No direct JSON-helper call substituted
   for the agent path. A scripted tool client is acceptable; label it accurately
   rather than claiming a separate autonomous LLM session occurred.
6. Add focused automated coverage including empty/error responses, cancellation,
   revisions, private/unauthorized access and stale action rejection. Existing
   package inspector behavior must remain green. Document the new user workflow.

## Runtime acceptance, implemented by you
Create test/inspector-symbol-workflow.mjs as a bounded, repeatable acceptance
entry point. It must exercise the built editor and actual registered tool path,
check expected outcomes, exit nonzero on missing prerequisites or failures, and
clean up owned processes/temp state. Reuse the existing remote display protocol
and smoke harness where appropriate. It may call focused compiled Haskell checks
for admission/tool dispatch, but include actual rendered UI evidence as well.
Use an installed compatible real HLS for the live symbol investigation. HLS was
not found on the default PATH during setup; locate existing installations using
normal allowed filesystem access and inspect existing launcher configuration.
No downloads or installs. Deterministic fake-LSP regression tests are useful but
MUST NOT count as a real-HLS runtime pass. If live HLS is genuinely unavailable,
finish and test all independent work, record the precise blocker and one concrete
next action, do not emit WORKFLOW_COMPLETE, and avoid repeating identical probes.

The runtime acceptance command must generate inspector-workflow/evidence.json:
{
  "realHls": true,
  "renderedSymbolUI": true,
  "registeredAgentTool": true,
  "definitionFollowed": true,
  "referencesFollowed": true,
  "backVerified": true,
  "accessChecksPassed": true,
  "investigation": {"symbol": "actual name", "explanation": "grounded finding", "locations": ["actual file:line"]}
}
Use true only after checking the behavior. Additional evidence fields encouraged,
especially commands, server version, fixture identity and observed responses.
Keep generated evidence deterministic where possible and separate noisy logs.
The external gate checks required fields and committed deliverables. Do not edit
/sandbox/ralph-validation/workflow-deliverables.mjs or weaken acceptance to pass.

## Autonomous work and reports
Maintain task-local inspector-workflow/RALPH_PROGRESS.md each iteration: done,
current failure evidence, next action. Fresh iterations must resume from it.
Write inspector-workflow/DESIGN.md, RESULTS.md, OPEN_QUESTIONS.md. Map every
requirement to concrete code/tests/runtime evidence and distinguish simulated
regression coverage from live results. Record any genuine P0/P1 blocker honestly.
Choose routine implementation details yourself. Diagnose failures rather than
asking for pasted output. Make small local commits at successful milestones;
commit final implementation/tests/docs/evidence. Preserve all existing commits
and dirty runner/config files. Do not add old .ralph-runner logs to commits.

## Constraints
No sandbox recreation, security/policy/network changes, dependency installation,
pushes, destructive git resets/clean, or unrelated refactors. Do not read secrets.
Use HOME=/home/node and PATH=/home/node/.ghcup/bin:/home/node/.cabal/bin:$PATH.
Build offline with -j2 or -j1; never cabal install. No XDG overrides for Cabal.
Runtime launches use hide_datadir=/sandbox/hide and isolated XDG dirs under
/sandbox, as the existing smoke does. Full editor-tests has uncached dependencies
at baseline; add new checks to the offline inspector-checks suite as needed,
without removing existing coverage. Do not repeatedly attempt the full suite.
If needed, use per-command git identity Overnight Agent / overnight@localhost;
do not change global configuration. Stop test subprocesses you own.

Emit <promise>WORKFLOW_COMPLETE</promise> only when every required behavior is
implemented, live evidence exists, required checks pass, work is committed, and
there are no unresolved P0/P1 issues. Ralph reruns acceptance after the claim;
use any rejection evidence to continue fixing. One iteration ending is not a
reason to abandon ordinary implementation work.

## HLS prerequisite resolved by the user-authorized installation
HLS 2.14.0.0 from GHCup standard metadata, Debian ARM64 build, has been checksum-verified and installed under /sandbox/hls-ghcup. The GHC-specific launcher passes its ABI check and reports GHC 9.14.1. Use THC_EDIT_HLS=/sandbox/hls-ghcup/bin/haskell-language-server-wrapper, GHC_BIN=/home/node/.ghcup/bin/ghc, and prepend /sandbox/hls-ghcup/bin to PATH. The symbol_workflow acceptance command now sets these explicitly. The former missing-HLS blocker is resolved; diagnose actual live-run failures from fresh evidence instead of repeating installation searches. No further downloads/installations or policy changes are authorized by this task. Preserve all previous work. Update reports when real evidence supersedes the simulated-only findings.

## First real-HLS run after installation
HLS is installed and the GHC-specific launcher reports HLS 2.14.0.0 with GHC 9.14.1 after passing its ABI checks. A real acceptance run passed the focused checks and rendered the area Summary inspector, then reported No handler for SMethod_TextDocumentReferences; its retry crashed with TypeError reading x at test/inspector-symbol-workflow.mjs:229. Fresh evidence.json and logs/run.log contain the run. Fix the actual initialization/capability issue and the harness retry robustness without weakening the real-HLS acceptance. The wrapper --version prints its own build GHC 9.10.3; that is not the selected server, whose explicit GHC 9.14.1 launcher was verified. Do not repeat missing-HLS probes.
