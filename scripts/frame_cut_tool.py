#!/usr/bin/env python3
"""Desktop tool to set the 7x7 slicing cut lines of the card-frame PNGs by hand
(card-frames-plan.md section 5). Tkinter + Pillow only.

Left: the frame with 8 vertical + 8 horizontal lines (outer two locked to the edges), stretch
bands tinted. Right: live preview of the sliced frame at a chosen card ratio.
Mouse wheel zooms at the cursor; drag empty space (or right/middle button) to pan; drag a line to
move it; arrow keys nudge the selected line (Shift = 10 px); type an exact value in the entry.
"""
from __future__ import annotations

import json
import os
import sys
import tkinter as tk
from tkinter import messagebox, ttk

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageTk

from frame_slices import CUTS_PATH, SRC_DIR, TIERS, load_cuts, render_frame, scale_for

PREVIEW_H = 640
GRAB = 6  # px hit radius for grabbing a line


def save_cuts(data: dict) -> None:
    """Write frame_cuts.json in the existing one-line-per-tier shape (write-then-rename)."""
    lines = []
    for t in TIERS:
        v = data[t]
        lines.append(f'  "{t}": {{ "w": {v["w"]}, "h": {v["h"]}, "x": {json.dumps(v["x"])}, '
                     f'"y": {json.dumps(v["y"])} }}')
    tmp = CUTS_PATH.with_suffix(".json.tmp")
    tmp.write_text("{\n" + ",\n".join(lines) + "\n}\n")
    os.replace(tmp, CUTS_PATH)


def ts_text(data: dict) -> str:
    return "\n".join(f"  {t}: {{ w: {data[t]['w']}, h: {data[t]['h']}, x: {data[t]['x']}, "
                     f"y: {data[t]['y']} }}," for t in TIERS)


def detect_axis(blur: Image.Image, axis: str, min_run: int = 30, thresh: int = 40) -> list[int] | None:
    """Propose 8 cuts for one axis: runs where line i equals line i+8 (max channel diff < thresh)."""
    w, h = blur.size
    n = w if axis == "x" else h
    if n <= 8 + min_run:
        return None
    const = []
    for i in range(n - 8):
        if axis == "x":
            a, b = blur.crop((i, 0, i + 1, h)), blur.crop((i + 8, 0, i + 9, h))
        else:
            a, b = blur.crop((0, i, w, i + 1)), blur.crop((0, i + 8, w, i + 9))
        d = ImageChops.difference(a, b)
        const.append(max(mx for _, mx in d.getextrema()) < thresh)
    runs, start = [], None
    for i, c in enumerate(const + [False]):
        if c and start is None:
            start = i
        elif not c and start is not None:
            if i - start >= min_run:
                runs.append((start, i - 1 + 8))  # constant columns start..i-1 -> pixels start..i-1+8
            start = None
    if len(runs) < 3:
        return None
    runs = sorted(sorted(runs, key=lambda r: r[0] - r[1])[:3])
    return [0, runs[0][0], runs[0][1], runs[1][0], runs[1][1], runs[2][0], runs[2][1], n]


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Frame cut tool")
        self.geometry("1400x900")
        self.data = load_cuts()
        self.saved = json.dumps(self.data, sort_keys=True)
        self.tier = tk.StringVar(value=TIERS[0])
        self.cur_tier = TIERS[0]
        self.img: Image.Image = Image.new("RGBA", (1, 1))
        self.zoom, self.pan = 0.3, [0.0, 0.0]  # pan = source coords at canvas top-left
        self.sel: tuple[str, int] | None = None
        self.drag: tuple | None = None
        self.checker = tk.BooleanVar(value=False)
        self.ratio = tk.DoubleVar(value=0.71)
        self._tk_main = self._tk_prev = None
        self._redraw_job = self._prev_job = None
        self._build_ui()
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self.load_tier(TIERS[0], first=True)

    # ---------- UI ----------
    def _build_ui(self) -> None:
        bar = ttk.Frame(self)
        bar.pack(fill="x", padx=6, pady=4)
        for t in TIERS:
            ttk.Radiobutton(bar, text=t, value=t, variable=self.tier,
                            command=self.on_tier).pack(side="left", padx=2)
        ttk.Button(bar, text="Save", command=self.save).pack(side="left", padx=(12, 2))
        ttk.Button(bar, text="Revert", command=self.revert).pack(side="left", padx=2)
        ttk.Button(bar, text="Print TS", command=self.print_ts).pack(side="left", padx=2)
        ttk.Button(bar, text="Auto-detect", command=self.auto_detect).pack(side="left", padx=2)
        ttk.Button(bar, text="Fit", command=self.fit).pack(side="left", padx=(12, 2))
        ttk.Checkbutton(bar, text="Checker bg", variable=self.checker,
                        command=self.schedule_redraw).pack(side="left", padx=6)
        self.status = ttk.Label(bar, text="")
        self.status.pack(side="right")

        sel = ttk.Frame(self)
        sel.pack(fill="x", padx=6)
        self.sel_lbl = ttk.Label(sel, text="Selected: none", width=28)
        self.sel_lbl.pack(side="left")
        self.val = tk.StringVar()
        e = ttk.Entry(sel, textvariable=self.val, width=7)
        e.pack(side="left")
        e.bind("<Return>", lambda _e: self.apply_typed())
        ttk.Button(sel, text="Set", command=self.apply_typed).pack(side="left", padx=2)
        ttk.Label(sel, text="   Card ratio").pack(side="left")
        ttk.Scale(sel, from_=0.50, to=0.85, variable=self.ratio, length=220,
                  command=lambda _v: self.schedule_preview()).pack(side="left", padx=4)
        self.ratio_lbl = ttk.Label(sel, text="0.71", width=5)
        self.ratio_lbl.pack(side="left")
        self.pos_lbl = ttk.Label(sel, text="", font=("TkFixedFont", 9))
        self.pos_lbl.pack(side="left", padx=10)

        panes = ttk.PanedWindow(self, orient="horizontal")
        panes.pack(fill="both", expand=True, padx=6, pady=6)
        self.cv = tk.Canvas(panes, bg="#202020", highlightthickness=0, takefocus=True)
        self.pv = tk.Canvas(panes, bg="#101010", highlightthickness=0, width=520)
        panes.add(self.cv, weight=3)
        panes.add(self.pv, weight=1)
        cv = self.cv
        cv.bind("<Configure>", lambda _e: self.schedule_redraw())
        cv.bind("<ButtonPress-1>", self.on_press)
        cv.bind("<B1-Motion>", self.on_motion)
        cv.bind("<ButtonRelease-1>", lambda _e: setattr(self, "drag", None))
        for b in ("2", "3"):
            cv.bind(f"<ButtonPress-{b}>", self.on_pan_start)
            cv.bind(f"<B{b}-Motion>", self.on_pan_move)
        cv.bind("<MouseWheel>", self.on_wheel)
        cv.bind("<Button-4>", lambda e: self.zoom_at(e.x, e.y, 1.15))
        cv.bind("<Button-5>", lambda e: self.zoom_at(e.x, e.y, 1 / 1.15))
        self.bind("<Key>", self.on_key)
        self.pv.bind("<Configure>", lambda _e: self.schedule_preview())

    # ---------- data ----------
    def cuts(self, axis: str) -> list[int]:
        return self.data[self.cur_tier][axis]

    def dirty(self) -> bool:
        return json.dumps(self.data, sort_keys=True) != self.saved

    def load_tier(self, tier: str, first: bool = False) -> None:
        self.cur_tier = tier
        self.tier.set(tier)
        self.img = Image.open(SRC_DIR / f"frame_{tier}.png").convert("RGBA")
        d = self.data[tier]
        if self.img.size != (d["w"], d["h"]):
            messagebox.showwarning("Size mismatch", f"{tier}: image is {self.img.size}, "
                                   f"json says {d['w']}x{d['h']}")
        self.sel = None
        self.update_labels()
        self.after(50, self.fit)

    def on_tier(self) -> None:
        new = self.tier.get()
        if new != self.cur_tier and self.dirty():
            if not messagebox.askyesno("Unsaved changes",
                                       "You have unsaved changes (kept in memory while you "
                                       "switch tiers, but not written to disk). Switch anyway?"):
                self.tier.set(self.cur_tier)
                return
        self.load_tier(new)

    def on_close(self) -> None:
        if self.dirty() and not messagebox.askyesno("Unsaved changes",
                                                    "Close and discard unsaved changes?"):
            return
        self.destroy()

    def save(self) -> None:
        save_cuts(self.data)
        self.saved = json.dumps(self.data, sort_keys=True)
        self.update_labels()
        self.status.config(text=f"Saved {CUTS_PATH.name}")

    def revert(self) -> None:
        self.data = load_cuts()
        self.saved = json.dumps(self.data, sort_keys=True)
        self.update_labels()
        self.schedule_redraw()
        self.schedule_preview()
        self.status.config(text="Reverted from disk")

    def print_ts(self) -> None:
        print(ts_text(self.data), flush=True)
        self.status.config(text="Printed TS to stdout")

    def auto_detect(self) -> None:
        blur = self.img.convert("RGBA").filter(ImageFilter.GaussianBlur(3))
        self.config(cursor="watch")
        self.update_idletasks()
        px, py = detect_axis(blur, "x"), detect_axis(blur, "y")
        self.config(cursor="")
        if not px or not py:
            messagebox.showinfo("Auto-detect", "Could not find three constant runs on both axes; "
                                "cuts left unchanged.")
            return
        msg = (f"Proposed for {self.cur_tier}:\n x: {px}\n y: {py}\n\n"
               f"Current:\n x: {self.cuts('x')}\n y: {self.cuts('y')}\n\nApply (not saved yet)?")
        if messagebox.askyesno("Auto-detect", msg):
            self.data[self.cur_tier]["x"], self.data[self.cur_tier]["y"] = px, py
            self.after_change()

    # ---------- geometry ----------
    def fit(self) -> None:
        cw, ch = max(self.cv.winfo_width(), 50), max(self.cv.winfo_height(), 50)
        self.zoom = min(cw / self.img.width, ch / self.img.height) * 0.95
        self.pan = [-(cw / self.zoom - self.img.width) / 2, -(ch / self.zoom - self.img.height) / 2]
        self.schedule_redraw()
        self.schedule_preview()

    def to_screen(self, x: float, y: float) -> tuple[float, float]:
        return (x - self.pan[0]) * self.zoom, (y - self.pan[1]) * self.zoom

    def to_src(self, sx: float, sy: float) -> tuple[float, float]:
        return sx / self.zoom + self.pan[0], sy / self.zoom + self.pan[1]

    def zoom_at(self, sx: float, sy: float, f: float) -> None:
        bx, by = self.to_src(sx, sy)
        self.zoom = min(max(self.zoom * f, 0.05), 40)
        self.pan = [bx - sx / self.zoom, by - sy / self.zoom]
        self.schedule_redraw()

    def on_wheel(self, e: tk.Event) -> None:
        self.zoom_at(e.x, e.y, 1.15 if e.delta > 0 else 1 / 1.15)

    def hit(self, sx: float, sy: float) -> tuple[str, int] | None:
        best, bd = None, GRAB + 1
        for axis in ("x", "y"):
            for i in range(1, 7):
                v = self.cuts(axis)[i]
                p = self.to_screen(v, v)[0 if axis == "x" else 1]
                d = abs(p - (sx if axis == "x" else sy))
                if d < bd:
                    best, bd = (axis, i), d
        return best

    def on_press(self, e: tk.Event) -> None:
        self.cv.focus_set()
        h = self.hit(e.x, e.y)
        if h:
            self.sel = h
            self.drag = ("line",)
        else:
            self.drag = ("pan", e.x, e.y, self.pan[0], self.pan[1])
        self.update_labels()
        self.schedule_redraw()

    def on_motion(self, e: tk.Event) -> None:
        if not self.drag:
            return
        if self.drag[0] == "pan":
            _, x0, y0, p0, p1 = self.drag
            self.pan = [p0 - (e.x - x0) / self.zoom, p1 - (e.y - y0) / self.zoom]
            self.schedule_redraw()
        elif self.sel:
            sx, sy = self.to_src(e.x, e.y)
            self.set_line(round(sx if self.sel[0] == "x" else sy))

    def on_pan_start(self, e: tk.Event) -> None:
        self.drag = ("pan", e.x, e.y, self.pan[0], self.pan[1])

    def on_pan_move(self, e: tk.Event) -> None:
        self.on_motion(e)

    def set_line(self, v: int) -> None:
        if not self.sel:
            return
        axis, i = self.sel
        c = self.cuts(axis)
        c[i] = max(c[i - 1] + 1, min(c[i + 1] - 1, int(v)))
        self.after_change()

    def on_key(self, e: tk.Event) -> None:
        if isinstance(self.focus_get(), (ttk.Entry, tk.Entry)) or not self.sel:
            return
        step = 10 if (e.state & 0x1) else 1
        axis, i = self.sel
        d = {"Left": ("x", -1), "Right": ("x", 1), "Up": ("y", -1), "Down": ("y", 1)}.get(e.keysym)
        if d and d[0] == axis:
            self.set_line(self.cuts(axis)[i] + d[1] * step)

    def apply_typed(self) -> None:
        try:
            self.set_line(int(self.val.get()))
        except ValueError:
            pass

    def after_change(self) -> None:
        self.update_labels()
        self.schedule_redraw()
        self.schedule_preview()

    def update_labels(self) -> None:
        if self.sel:
            axis, i = self.sel
            self.sel_lbl.config(text=f"Selected: {axis.upper()} line {i}")
            self.val.set(str(self.cuts(axis)[i]))
        else:
            self.sel_lbl.config(text="Selected: none")
        self.pos_lbl.config(text=f"x={self.cuts('x')}  y={self.cuts('y')}")
        self.title(f"Frame cut tool - {self.cur_tier}{' *' if self.dirty() else ''}")

    # ---------- drawing ----------
    def schedule_redraw(self) -> None:
        if self._redraw_job is None:
            self._redraw_job = self.after(15, self.redraw)

    def schedule_preview(self) -> None:
        if self._prev_job is not None:
            self.after_cancel(self._prev_job)
        self._prev_job = self.after(60, self.draw_preview)

    def bg_image(self, w: int, h: int) -> Image.Image:
        if not self.checker.get():
            return Image.new("RGB", (w, h), "#303030")
        bg = Image.new("RGB", (w, h), "#404040")
        d = ImageDraw.Draw(bg)
        for y in range(0, h, 16):
            for x in range(0, w, 16):
                if (x // 16 + y // 16) % 2:
                    d.rectangle((x, y, x + 15, y + 15), fill="#585858")
        return bg

    def redraw(self) -> None:
        self._redraw_job = None
        cw, ch = max(self.cv.winfo_width(), 2), max(self.cv.winfo_height(), 2)
        z = self.zoom
        base = self.bg_image(cw, ch)
        x0, y0 = max(self.pan[0], 0), max(self.pan[1], 0)
        x1 = min(self.pan[0] + cw / z, self.img.width)
        y1 = min(self.pan[1] + ch / z, self.img.height)
        if x1 > x0 and y1 > y0:
            dw, dh = max(round((x1 - x0) * z), 1), max(round((y1 - y0) * z), 1)
            piece = self.img.resize((dw, dh), Image.BILINEAR if z < 1 else Image.NEAREST,
                                    box=(x0, y0, x1, y1))
            ox, oy = self.to_screen(x0, y0)
            base.paste(piece, (round(ox), round(oy)), piece)
        d = ImageDraw.Draw(base, "RGBA")
        cx, cy = self.cuts("x"), self.cuts("y")
        top, bot = self.to_screen(0, 0)[1], self.to_screen(0, self.img.height)[1]
        lef, rig = self.to_screen(0, 0)[0], self.to_screen(self.img.width, 0)[0]
        for i in (1, 3, 5):  # stretch bands
            a, b = self.to_screen(cx[i], 0)[0], self.to_screen(cx[i + 1], 0)[0]
            d.rectangle((a, top, b, bot), fill=(60, 140, 255, 70))
            a, b = self.to_screen(0, cy[i])[1], self.to_screen(0, cy[i + 1])[1]
            d.rectangle((lef, a, rig, b), fill=(255, 150, 40, 70))
        self._tk_main = ImageTk.PhotoImage(base)
        self.cv.delete("all")
        self.cv.create_image(0, 0, image=self._tk_main, anchor="nw")
        for axis in ("x", "y"):
            for i in range(8):
                v = self.cuts(axis)[i]
                locked = i in (0, 7)
                s = self.to_screen(v, v)[0 if axis == "x" else 1]
                col = "#ffd400" if self.sel == (axis, i) else ("#888888" if locked else "#00e5ff")
                if axis == "x":
                    self.cv.create_line(s, top, s, bot, fill=col, width=2 if not locked else 1)
                    self.cv.create_text(s + 3, 12 + (i % 2) * 14, text=str(v), fill=col, anchor="w")
                else:
                    self.cv.create_line(lef, s, rig, s, fill=col, width=2 if not locked else 1)
                    self.cv.create_text(6 + (i % 2) * 40, s - 8, text=str(v), fill=col, anchor="w")
        self.status.config(text=f"zoom {z:.2f}x")

    def draw_preview(self) -> None:
        self._prev_job = None
        r = round(self.ratio.get(), 2)
        self.ratio_lbl.config(text=f"{r:.2f}")
        H = min(PREVIEW_H, max(self.pv.winfo_height() - 20, 200))
        W = round(H * r)
        card = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        cd = ImageDraw.Draw(card)
        for y in range(H):  # placeholder card: vertical gradient
            t = y / H
            cd.line((0, y, W, y), fill=(int(70 + 90 * t), int(110 - 40 * t), int(170 - 90 * t), 255))
        cd.text((W // 2 - 20, H // 2), "CARD", fill=(255, 255, 255, 200))
        s = scale_for(self.cuts("x"), self.cuts("y"), W, H)
        fr = render_frame(self.img, self.cuts("x"), self.cuts("y"), W, H)
        card.alpha_composite(fr)
        pw, ph = max(self.pv.winfo_width(), W + 20), max(self.pv.winfo_height(), H + 20)
        canvas = Image.new("RGB", (pw, ph), "#101010")
        canvas.paste(card.convert("RGB"), ((pw - W) // 2, (ph - H) // 2))
        self._tk_prev = ImageTk.PhotoImage(canvas)
        self.pv.delete("all")
        self.pv.create_image(0, 0, image=self._tk_prev, anchor="nw")
        self.pv.create_text(8, 8, anchor="nw", fill="#aaaaaa",
                            text=f"{W}x{H}  scale {s:.3f}")


def main() -> None:
    if "--selftest" in sys.argv:
        app = App()
        app.after(600, lambda: (app.update(), app.print_ts(), app.destroy()))
        app.mainloop()
        return
    App().mainloop()


if __name__ == "__main__":
    main()
