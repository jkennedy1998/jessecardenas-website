#!/usr/bin/env python3
"""Export an earring gif/png into a spritesheet + JSON meta for the jelly renderer.

Output (in --out-dir):
  frames.png   grid of frames (rows x cols), transparent background
  frames.json  { sheet, fw, fh, cols, rows, count, frameMs }

The site renderer (js/dangle.js createJelly) hangs the sheet from its
top-middle point, warps it as horizontal slices, and plays frames while the
user drags. Frames are exported at --scale (default half) because the page
renders the earring much smaller than the source asset anyway.

Usage:
  python3 export-frames.py ASSET.gif --out-dir example-earring
"""
import argparse
import json
import math
import os

from PIL import Image


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--scale", type=float, default=0.5,
                    help="frame resize factor (default 0.5 = half res)")
    ap.add_argument("--cols", type=int, default=8)
    args = ap.parse_args()

    im = Image.open(args.input)
    frames = getattr(im, "n_frames", 1)
    base = im.convert("RGBA")
    fw = max(1, round(base.size[0] * args.scale))
    fh = max(1, round(base.size[1] * args.scale))
    cols = min(args.cols, frames)
    rows = math.ceil(frames / cols)

    durations = []
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for index in range(frames):
        im.seek(index)
        frame = im.convert("RGBA")
        durations.append(im.info.get("duration", 40))
        if args.scale != 1:
            frame = frame.resize((fw, fh), Image.LANCZOS)
        sheet.paste(frame, ((index % cols) * fw, (index // cols) * fh))

    os.makedirs(args.out_dir, exist_ok=True)
    sheet_path = os.path.join(args.out_dir, "frames.png")
    sheet.save(sheet_path, optimize=True)

    frame_ms = round(sum(durations) / len(durations)) or 40
    meta = {
        "sheet": "frames.png",
        "fw": fw, "fh": fh, "cols": cols, "rows": rows,
        "count": frames, "frameMs": frame_ms,
    }
    with open(os.path.join(args.out_dir, "frames.json"), "w") as handle:
        json.dump(meta, handle, indent=2)
    print(f"exported {frames} frames ({fw}x{fh} each, {cols}x{rows} grid, "
          f"{frame_ms}ms/frame) -> {sheet_path}")


if __name__ == "__main__":
    main()
