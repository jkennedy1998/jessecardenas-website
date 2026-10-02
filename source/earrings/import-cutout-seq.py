#!/usr/bin/env python3
"""Import a pre-keyed png sequence (already-transparent RGBA cutouts, e.g.
the cutout zips from photo-intake) into a spritesheet.

Companion to export-frames-seq.py: same union-bbox crop, scale, packing and
frames.json conventions, but no keying — the input pngs are expected to
carry their own alpha. All frames are cropped to the union content bbox so
the sheet hangs correctly from its top-middle in the jelly renderer.

Output (in --out-dir):
  frames.png   grid of frames (rows x cols), transparent background
  frames.json  { sheet, fw, fh, cols, rows, count, frameMs }
  preview.png  first selected frame, for eyeballing the cut

Usage:
  python3 import-cutout-seq.py CUTOUT_DIR --out-dir OUT_DIR \
      [--stride 2] [--fps 60] [--scale 0.5] [--cols 8]
"""
import argparse
import json
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def rowfill(mask, maxgap=150):
    """Bridge horizontal transparent runs between solid pixels (row-wise
    convex fill). Catches wide soft bands the closing pass can't, e.g. a
    backdrop-colored stripe across the piece that opens to its edges."""
    w, h = mask.size
    px = mask.load()
    for y in range(h):
        x = 0
        while x < w:
            if not px[x, y]:
                x += 1
                continue
            while x < w and px[x, y]:
                x += 1
            start = x
            while x < w and not px[x, y]:
                x += 1
            if x < w and x - start <= maxgap:
                for xx in range(start, x):
                    px[xx, y] = 255
    return mask


def repair_alpha(frame, solid=96, close=11):
    """Reconnect a fragmented cutout: the photo-intake keyer can drop alpha
    below threshold at bad swing angles, splitting the piece into blobs that
    flicker as the dial shifts frames. Morphological close bridges thin
    gaps, a row-wise span fill bridges wide ones, then enclosed holes are
    filled and the original alpha is maxed with the repaired silhouette
    (near-noop on already-clean frames)."""
    alpha = frame.getchannel("A")
    solid_m = alpha.point(lambda v: 255 if v >= solid else 0)
    solid_m = solid_m.filter(ImageFilter.MedianFilter(3))
    closed = (solid_m.filter(ImageFilter.MaxFilter(close))
                    .filter(ImageFilter.MinFilter(close)))
    closed = rowfill(closed)
    # enclosed holes: complement regions not reachable from the border
    inv = closed.point(lambda v: 255 - v)
    w, h = inv.size
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                 (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)):
        if inv.getpixel(seed) == 255:
            ImageDraw.floodfill(inv, seed, 128)
    holes = inv.point(lambda v: 255 if v == 255 else 0)
    filled = ImageChops.lighter(closed, holes)
    return ImageChops.lighter(alpha, filled)


def solid_bbox(frame, solid=96):
    """Content bbox from solid alpha only, so faint haze far from the piece
    cannot inflate the crop."""
    mask = frame.split()[3].point(lambda v: 255 if v >= solid else 0)
    return mask.getbbox()


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input_dir")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--stride", type=int, default=2,
                    help="use every Nth frame (default 2)")
    ap.add_argument("--fps", type=float, default=60,
                    help="source capture fps, for frameMs timing")
    ap.add_argument("--scale", type=float, default=0.5)
    ap.add_argument("--cols", type=int, default=8)
    ap.add_argument("--pad", type=int, default=8,
                    help="transparent margin around the union content bbox "
                         "(source-scale px); raise it so swung frames and "
                         "the hook never touch the sheet cell edges")
    ap.add_argument("--repair-alpha", action="store_true",
                    help="reconnect fragmented alpha (close + hole fill) — "
                         "for cutouts that split into blobs at some frames")
    args = ap.parse_args()

    names = sorted(n for n in os.listdir(args.input_dir)
                   if n.lower().endswith(".png"))
    if not names:
        raise SystemExit(f"no pngs in {args.input_dir}")
    print(f"{len(names)} frames, loading...")
    keyed = []
    for name in names:
        with Image.open(os.path.join(args.input_dir, name)) as im:
            frame = im.convert("RGBA")
            if frame.getextrema()[3][0] == 255:
                print(f"warning: {name} has no transparency; is this a mask?")
            if args.repair_alpha:
                frame.putalpha(repair_alpha(frame))
            keyed.append(frame)

    # union content bbox across all frames (solid alpha only) -> one crop
    left, top, right, bottom = keyed[0].size[0], keyed[0].size[1], 0, 0
    for frame in keyed:
        box = solid_bbox(frame)
        if box is None:
            continue
        left = min(left, box[0])
        top = min(top, box[1])
        right = max(right, box[2])
        bottom = max(bottom, box[3])
    pad = args.pad
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(keyed[0].size[0], right + pad)
    bottom = min(keyed[0].size[1], bottom + pad)
    print(f"union content bbox: ({left}, {top}, {right}, {bottom})")
    keyed = [frame.crop((left, top, right, bottom)) for frame in keyed]

    selected = keyed[::args.stride]
    fw = max(1, round((right - left) * args.scale))
    fh = max(1, round((bottom - top) * args.scale))
    cols = min(args.cols, len(selected))
    rows = math.ceil(len(selected) / cols)

    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for index, frame in enumerate(selected):
        if args.scale != 1:
            frame = frame.resize((fw, fh), Image.LANCZOS)
        sheet.paste(frame, ((index % cols) * fw, (index // cols) * fh))

    os.makedirs(args.out_dir, exist_ok=True)
    sheet_path = os.path.join(args.out_dir, "frames.png")
    sheet.save(sheet_path, optimize=True)
    selected[0].resize((fw, fh), Image.LANCZOS).save(
        os.path.join(args.out_dir, "preview.png"))

    frame_ms = round(1000 * args.stride / args.fps) or 40
    meta = {
        "sheet": "frames.png",
        "fw": fw, "fh": fh, "cols": cols, "rows": rows,
        "count": len(selected), "frameMs": frame_ms,
    }
    with open(os.path.join(args.out_dir, "frames.json"), "w") as fh_json:
        json.dump(meta, fh_json, indent=2)
        fh_json.write("\n")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
