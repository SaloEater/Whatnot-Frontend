# scripts/

## build_bird_sheet.py

Builds the bird sprite sheet used by the OBS scene element (`BirdsEffect.tsx`,
`src/app/obs/layout/elements/scene/assets.ts`) from the raw AI-delivered
artwork.

The raw delivery (`birds_original.png`, kept at the monorepo root) has all
birds side by side on a transparent background but NOT on a uniform grid —
bounding boxes overlap cell edges and drift vertically frame to frame. This
script detects each bird by scanning for columns that contain any
non-transparent pixel, computes one tight bounding box per bird, then lays
all birds out into equal-size cells that share a single vertical band, so
each bird keeps its original vertical placement relative to the others (e.g.
a lower, front-facing pose stays lower instead of being re-centred).

Requires Python 3 with Pillow installed (`python3 -c "from PIL import Image"`
should succeed). No other dependencies.

### Current sheet (the command that produced the shipped `birds.png`)

From the `Whatnot-Frontend/` directory:

```
python3 scripts/build_bird_sheet.py --in ../../birds_original_v3.png --grid 210 --solidify 200
```

Output: `2100 301 10 210 301`. This third raw delivery (`<monorepo root>/birds_original_v3.png`,
2100 x 793) is, unlike the earlier ones, ALREADY a uniform grid the user hand-aligned: 10 cells
exactly 210 px wide, beak tip on the last pixel column of every cell, vertical placement chosen by
the artist (frame 5, the front view, sits lowest by design). `--grid CELL_W` is a separate, much
simpler code path for exactly this case: it skips bird detection, bbox measurement, horizontal
centring, beak alignment, and `--insert`/`--drop` entirely (combining `--grid` with `--insert` or
`--drop` is an error) — every cell is copied as-is horizontally, with frame count computed as
`width / CELL_W` (must divide evenly). Vertically, the whole sheet is cropped in one shot to the
shared opaque band (min top .. max bottom over the entire sheet, alpha > 16) plus `--pad`
above/below, so every frame keeps its exact original vertical position relative to the others.
Grid mode never runs `keep_largest_component` — the delivery's cells are already clean, and that
cleanup could wrongly delete a legitimately separate feature (e.g. a raised wingtip). `--solidify
200` still applies, same as before: it makes every bird's body fully opaque (the raw delivery sits
at ~93 % alpha across the whole bird); alpha below 200 is scaled up proportionally so anti-aliased
edges keep their ramp.

The older raw files (`birds_original.png`, `birds_mid_original.png`, `birds_9_original.png`,
`birds_original_v2.png`, all at the monorepo root) and the detection/`--insert`/`--drop` path that
built the sheets from them are superseded for this delivery, but that path still works exactly as
documented below in case a future delivery ISN'T pre-aligned to a grid and needs bird detection or
frames spliced in from another file.

Whenever this command changes, update `frames`/`w`/`h` in
`src/app/obs/layout/elements/scene/assets.ts` to the printed numbers.

### Run with defaults (base sheet only)

From the `Whatnot-Frontend/` directory:

```
python3 scripts/build_bird_sheet.py
```

This reads `<monorepo root>/birds_original.png` and writes
`public/images/scene/birds.png`. On success it prints:

```
width height frames cellW cellH
```

## trim_canvas.py

General tool: shrinks a PNG's canvas to its actual content. Used for the two `priceSign` stones
(`public/images/sign/MiddlePedestal.png`, `MiddleStoneTablo.png`), but not sign-specific.

It crops each file to the bounding box of pixels with alpha > `--threshold` (default 16, not 0 —
`MiddlePedestal.png` has a faint alpha halo over its whole canvas, so alpha > 0 would trim
nothing). The sign stones sit mostly at alpha 240-254, so the scene bleeds through unless they are
solidified; `--solidify N` (off by default) forces every pixel with alpha >= N to 255 after the crop.

Requires Python 3 with Pillow. From the `Whatnot-Frontend/` directory:

```
python3 scripts/trim_canvas.py --solidify 200 \
    public/images/sign/MiddlePedestal.png public/images/sign/MiddleStoneTablo.png
```

Writes in place and prints `name w h` per file. After re-running on new art, copy the printed sizes
(and re-measure the badge square) into `src/app/obs/layout/elements/price-sign/assets.ts`.

### Flags

- `--threshold N` — alpha cut for the content bounding box (default 16)
- `--solidify N` — after cropping, force alpha >= N to 255 (default: off)
- `--pad N` — keep N transparent px around the content (default 0)
- `--out PATH` — write here instead of in place (only valid with one FILE)

## build_shelf_assets.py

Builds the art for the `cameraShelf` OBS layout element
(`src/app/obs/layout/elements/camera-shelf/CameraShelfElement.tsx`,
`src/app/obs/layout/elements/camera-shelf/assets.ts`, obs-camera-shelf-plan.md §2) from the raw
AI-delivered artwork kept at `public/images/shelf/raw/`. Art brief: `obs-shelf-assets-brief.md`
(monorepo root).

`shelf.png` (the cabinet frame) and `shelf_glare.png` (the reflection overlay, content only inside
the window) are each cropped to their OWN opaque bbox (alpha > 16) — the delivery comes back on two
different canvases, so the two files are never overlaid 1:1; the glare's content is confined to the
window by contract, and `CameraShelfElement.tsx` stretches the cropped glare over the computed
window rect at render time instead of sharing a canvas with the frame art. Every output's
width/height is forced even (drop the last row/column if the crop came out odd), same convention as
the earlier sign asset script.

It also measures the WINDOW — the fully transparent opening the OBS camera shows through — as the
largest run of alpha == 0 pixels along the row at 50% of the cropped `shelf.png`'s height (gives
`x`/`w`) and along the column at 50% of its width (gives `y`/`h`). This is a starting rectangle,
not a guaranteed-exact one: the header/posts/ledge overlap the opening unevenly, so it only informs
the hand-pasted `SHELF_RECTS.window` value — the operator eyeballs the actual window under `?dev=1`
and the coder adjusts it by hand if it's off. `SHELF_RECTS.label` has no auto-measure (the brief's
art has no marked label region, just "a blank rectangular plate") — it stays hand-measured off the
blank header plate; the script does not print it.

Requires Python 3 with Pillow (`python3 -c "from PIL import Image"` should succeed).

From the `Whatnot-Frontend/` directory:

```
python3 scripts/build_shelf_assets.py
```

On success it prints one `name w h` line per output plus the window rect, all in the cropped
`shelf.png`'s own output coordinates:

```
shelf.png 2028 648
shelf_glare.png 1874 446
window 193 145 1644 353
```

Whenever this command is re-run against new art, copy the printed numbers into `SHELF_ASSETS`/
`SHELF_RECTS.window` in `src/app/obs/layout/elements/camera-shelf/assets.ts`. The shipped numbers
come from the raw delivery in `public/images/shelf/raw/` (`shelf_glare_no.png` there is an unused
alternate).

### Flags

- `--raw-dir PATH` — directory holding the 2 raw PNGs (default: `public/images/shelf/raw`)
- `--out-dir PATH` — directory to write the cropped PNGs to (default: `public/images/shelf`)

## feather_alpha.py

Softens the silhouette of a transparent PNG by feathering its alpha channel only (colour and
interior detail untouched; the fade only eats inward, and image borders are edge-padded so the
mountain stays opaque along the bottom). Used for the scene mountain so its ridge sits in the haze
like the cloud strips instead of reading as a hard cutout. The unfeathered source is
`<monorepo root>/mountain_original.png`.

Current mountain, from `Whatnot-Frontend/`:

```
python3 scripts/feather_alpha.py --in ../mountain_original.png \
    --out public/images/scene/mountain.png --radius 10
```

`--radius` is the Gaussian sigma in source px; the mountain renders at ~0.67× its source width, so
10 gives roughly a 15–20 px soft edge on stream. `mountain_lit.png` is not feathered (the lit
variant is currently disabled); if it is re-enabled, run the same command on it with the same
radius so the lightning crossfade does not show a ghost outline.

## build_frame_assets.py

Cleans the card-tier frame art (bronze / silver / gold, `card-frames-plan.md`) for the frontend.
Reads `scripts/frame_src/frame_{tier}.png` and writes `public/images/frames/frame_{tier}.png` with
the SAME pixel dimensions (the cut lines in `frame_cuts.json` depend on them):

- alpha >= 200 becomes 255 (the metal is delivered at alpha 251-254, which lets the card show
  through);
- alpha below `--low` (default 40) becomes 0, removing the faint reddish fringe around the outer
  edge. Values in between are untouched so edges stay anti-aliased.

Prints, per tier, the output size and the number of pixels changed by each rule. PNGs are saved
optimised. Requires Python 3 with Pillow only.

From `Whatnot-Frontend/`:

```
python3 scripts/build_frame_assets.py            # --low 40 --high 200 by default
```

## frame_cut_tool.py (and frame_slices.py)

Desktop tool (Tkinter + Pillow, no other dependencies) to set the 7x7 slicing cut lines of the
frame PNGs by hand. Bands at even index are fixed, odd-index bands stretch; the 25 inner cells are
the hole. `frame_slices.py` holds the shared slicing maths (`s = min(W/(fixedX+0.6*stretchX),
H/(fixedY+0.6*stretchY))`, whole-pixel rounding) used by the tool's live preview.

- Tier buttons load `frame_src/frame_{tier}.png` and the cuts from `frame_cuts.json`.
- Left pane: frame with 8+8 lines (outer ones locked to the edges); stretch bands tinted (blue =
  columns that stretch horizontally, orange = rows that stretch vertically). Mouse wheel zooms at
  the cursor, drag empty space (or right/middle button) to pan. Drag a line to move it (it cannot
  cross its neighbours); arrow keys nudge the selected line 1 px (Shift = 10 px); or type an exact
  value in the entry and press Enter.
- Right pane: live preview of the sliced frame at the ratio slider (0.50-0.85, default 0.71).
- Save writes `frame_cuts.json` (same shape, other tiers preserved, write-then-rename). Revert
  reloads from disk. Print TS prints the three tiers as TypeScript object entries to stdout.
  Auto-detect only proposes cuts (asks before applying); it struggles on gold because of its glints.
- Unsaved changes trigger a warning when switching tier or closing.

From `Whatnot-Frontend/`:

```
python3 scripts/frame_cut_tool.py
```

Needs a Python with Tkinter (`python3 -c "import tkinter"`). `--selftest` opens the window, prints
the TS block and exits.
