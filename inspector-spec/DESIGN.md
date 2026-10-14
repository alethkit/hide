# Design: a Haskell-native, Phlow-style inspector for hide

## Layers
1. **Typed core** — `packages/hide-plugin-api/src/Hide/Plugin/Inspect.hs`, pure and framework-free.
   * `Observe`/`Edge`/`Nav`: keyed, typed relations (getter/lens/traversal/fold) from one object to another.
   * `Subject` = `RootId` + `Revision` + keyed path + `Typeable` value. Typed objects stay typed in memory;
     discovery is by `SomeTypeRep` with `eqTypeRep` (no casts, no string dispatch).
   * `ViewDef a`/`Body`: a view is a pure function `Here a -> Body`, `Ready Doc` or `Queried` (an effectful query
     that is a registered `Command`, human-origin only). `Doc` is semantic only (`List` of `Item`s with optional
     `Target`, or `Text` of `Heading/Prose/Facts` blocks); it knows nothing of windows or colours.
   * `prepareDoc` bounds and fully forces a document on the caller's worker.
   * `Inspectors` registry with scoped `Contribution`s (`attach name [viewDefs]`) and scoped roots; withdrawing a
     contribution/root, or closing the scope, retires it. `resolve` re-walks the keyed path from the *live* root
     and returns `Fresh | Gone | RootRetired`, so stale references never retarget by list index or label.
2. **Two interpreters of the same `PreparedDoc`**
   * Human: `src/Hide/InspectorWindow.hs` renders onto hide's existing prepared rows window (rows above a readonly
     Details pane). View switching = "→ X view" rows; navigation history = a "← Back" row.
   * Agent-readable: `Hide.Plugin.Inspect.JSON` (`renderJSON`, `openJSON`, `jsonValue`, `jsonTarget`). It is a library
     function only: no tool is registered, no network service, no private window is exposed. The embedding host must
     authorize disclosure. Action ids in the JSON are **page-local row numbers**; `jsonTarget page n` returns the
     still-typed `Target` for that exact page, and a host must `resolve` it again before use. They are not globally
     replayable object identities. `openJSON` re-resolves the subject first and refuses effectful queries.
3. **Integration** — `Hide.PackageInspect` publishes views for the real `PackageSources`, `ComponentSources` and
   source declarations; the package sidebar offers Inspect on the package and each component; `Hide.InspectorMenu`
   registers the human-only `hide.inspect.open` window-row action.

## Navigation history
`Inspector` keeps per exact `WindowRef` (newest 64 pages) a table `NodeId -> RowAction` and a trail
`[(Subject, Maybe ViewId)]` (at most 32). `followInspectorRow` (human origin only) looks the row up in that exact page:
* `Navigate s` – push; the child page's trail is `(s,Nothing) : parentTrail`.
* `ShowView s v` – replace the head of the trail (a view switch is not a new history entry).
* `GoBack` – drop the head and re-enter the previous entry.
Every entry is re-`resolve`d against the live root; a removed component, retired root or expired window is a refusal,
never a retarget. History is per page, not a session-global "current object". Back consumes an entry so Back/Back cannot loop.
The "← Back" row is only present when the trail has an earlier entry (a package opened from the sidebar has none).

## Extension independence
`test/InspectorExample/{Summary,Counts}.hs` each export a `Contribution` for the existing `PackageSources` type; they
import only the public `Inspect` API and `PackageSources` and know nothing about each other, the editor or
`Hide.PackageInspect`. Each is published and withdrawn separately.

## Interaction performance
Pages are small (≤64 rows, ≤32 history entries) and built only on user action; nothing is compared deeply in the render
loop and no new `Desktop` field was added. Document forcing stays on the caller's worker.
