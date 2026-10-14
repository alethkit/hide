# Open questions

No blocking (highest-severity) items remain.

## P2
- Memory headroom: HLS plus the editor fit on this ~2 GB machine only with `GHCRTS='-A16m -c'` and a clean RAM-backed `/tmp`. A machine with less
  free memory will lose the language server (kernel OOM kill). Next action if it matters: run HLS with a smaller `-j`/disk cache or add RAM.
- HYPOTHESIS: the stale `Inspecting <symbol>…` status text after the inspector window opens is not cleared by `adoptWindowUpdate`
  (src/Hide/SymbolInspector.hs `startHuman`/`tickSymbolInspector`); cosmetic, untouched here to keep the campaign off the render path.

## P3
- Only `src/Hide/Sidebar.hs` was exercised in a running editor; `Hide.Model`/`Hide.Render` were not tried (compile memory).
- Builds with `terminal` enabled cannot be analysed by HLS without `libghostty-vt`.
