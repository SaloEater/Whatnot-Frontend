#!/usr/bin/env python3
"""Clean the card-frame source art (card-frames-plan.md) for use in the frontend.

Reads scripts/frame_src/frame_{tier}.png and writes public/images/frames/frame_{tier}.png with
the SAME pixel dimensions (frame_cuts.json depends on them):
    alpha >= 200          -> 255   (the metal is alpha 251-254, which lets the card show through)
    alpha <  --low (40)   -> 0     (removes the faint reddish fringe around the outer edge)
Values in between are left alone so edges stay anti-aliased.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
SRC = SCRIPTS / "frame_src"
OUT = SCRIPTS.parent / "public" / "images" / "frames"
TIERS = ("bronze", "silver", "gold")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--low", type=int, default=40, help="alpha below this becomes 0 (default 40)")
    ap.add_argument("--high", type=int, default=200, help="alpha at/above this becomes 255 (default 200)")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for tier in TIERS:
        im = Image.open(SRC / f"frame_{tier}.png").convert("RGBA")
        r, g, b, a = im.split()
        hist = a.histogram()
        n_high = sum(hist[args.high:255])  # pixels actually changed (255 already is not)
        n_low = sum(hist[1:args.low])      # 0 already is not a change
        lut = [0 if v < args.low else 255 if v >= args.high else v for v in range(256)]
        out = Image.merge("RGBA", (r, g, b, a.point(lut)))
        out.save(OUT / f"frame_{tier}.png", optimize=True)
        print(f"{tier}: {out.size[0]}x{out.size[1]}  alpha>={args.high}->255: {n_high}  "
              f"alpha<{args.low}->0: {n_low}")


if __name__ == "__main__":
    main()
