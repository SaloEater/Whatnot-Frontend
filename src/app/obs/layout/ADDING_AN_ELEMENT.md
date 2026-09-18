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
7. **[workflow]** verify with `npx tsc --noEmit -p .` + `npx eslint <files>` only — never
   `npm run build` while `next dev` is running; they share `.next/` and will corrupt each other.
