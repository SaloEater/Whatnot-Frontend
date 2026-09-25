# Adding a layout element

Which files to touch, and why the compiler won't remind you for the ones it can't. Not what each
file contains — that rots; the code and its WHY-comments are the source for that.

1. **[compiler]** `schema.ts` — add the kind to `ElementKind` and to whichever id array it needs
   (`BOARD_VARIANTS`, `WIDGET_IDS`, `ANIMATION_IDS`, `FRAME_VARIANTS`, `IMAGE_FITS`, …), and add the
   variant to the `Element` union. Everything below tagged **[compiler]** fails to build until
   done: `registryIdOf` (`elementId.ts`, `never` default), `makeElement` (`registry.ts`, `never`
   default), `KIND_VALIDATORS` (`config.ts`, `satisfies Record<ElementKind, …>`), `NEEDS_BY_ID`
   (`needs.ts`, `satisfies Record<RegistryId, …>`), `SETTINGS_PANELS`
   (`ElementSettings.tsx`, `satisfies Record<RegistryId, …>`).
2. **[convention]** `registry.ts`'s new `REGISTRY` entry — fields the types allow but nothing
   checks: `preload` (static art only; combinatorial skins are resolved at runtime, not preloaded),
   `hasBox` (boxless elements position themselves via `useResolvedBox`, default true), `wideBlock`
   (only for a settings panel too wide for a narrow controls column), `reactsTo` (native scene-event
   reactions this element type implements), `singleton`/`singletonGroup` (one-each kinds share a
   group; a kind that allows multiple instances gets its own group so `singleton: false` alone is
   what permits that).
3. **[convention]** add the kind to `MIRRORABLE_KINDS` (`schema.ts`) if it may be mirrored
   (`mirrorOf`) — nothing else needs to change for that.
4. **[convention]** the component under `layout/elements/<name>/` — reads data only from
   `useLayoutData()`, never polls on its own; sizes from `box`, never `vw`/`vh`/`rem`; no
   `body`/`html` CSS; a class prefix unique to this element (siblings' CSS is unscoped); a ported
   route's code is copied into the new component, never moved out of the old page.
5. **[convention]** the settings panel (`controls/elements/`) — every backend write goes through
   `useSettingWrite` with a real `LayoutDataSourceKey`, or an explicit `null` if nothing needs
   pushing to OBS (the push-to-OBS rule).
6. **[convention]** add a per-element section to `obs-layout-plan.md`, with a **Test** paragraph.
7. **[convention]** a board that paints inside its box (inset by a margin, centred, clipped, …)
   should declare `anchors` in its `registry.ts` entry and publish them with `usePublishAnchors`, in
   canvas coordinates — see `anchors.tsx` and `board:sport_style`/`SportStyleBoard.tsx` for the
   pattern (board-anchors-plan.md). Nothing checks that a declared anchor is actually published; a
   board that paints edge-to-edge (flat/classic/cobra/cobra_flat today) has nothing to gain from one.
8. **[workflow]** verify with `npx tsc --noEmit -p .` + `npx eslint <files>` only — never
   `npm run build` while `next dev` is running; they share `.next/` and will corrupt each other.
9. **[convention]** `mount` stage hooks (`stageHooks.ts`, `registry.ts`'s `RegistryEntry.mount`,
   `controls/useStageHooks.ts`, obs-camera-shelf-plan.md §5) — an element type that needs to run
   code when a stage is left/entered (e.g. `obsToggle` enabling/disabling a list of OBS sources,
   obs-visibility-toggle-plan.md) adds a `mount: MountFn` to its registry entry instead of storing
   anything in the config. It runs on the CONTROLS page only, receives a small per-element event
   bus, and returns an optional teardown.
   Nothing checks that a `mount` actually unsubscribes — a leaked handler fires on every stage
   change until reload.
