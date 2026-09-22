#!/usr/bin/env python3
"""Export a static-camera png sequence (flat backdrop) into a spritesheet.

Companion to export-frames.py (which takes an already-transparent gif).
This one takes raw footage frames: the backdrop is modeled per row (median
of the left/right frame margins, linearly interpolated across — handles the
vignette), and per-pixel color distance from that model becomes alpha via a
soft threshold. All frames are cropped to the union content bbox so the
sheet hangs correctly from its top-middle in the jelly renderer.

Output (in --out-dir):
  frames.png   grid of frames (rows x cols), transparent background
  frames.json  { sheet, fw, fh, cols, rows, count, frameMs }
  preview.png  first selected frame, for eyeballing the key

Usage:
  python3 export-frames-seq.py FRAMES_DIR --out-dir OUT_DIR \
      [--stride 2] [--fps 30] [--scale 0.5] [--cols 8]
"""
import argparse
import json
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def background_model(im, margin=24):
    w, h = im.size
    bg = Image.new("RGB", (w, h))
    grad = Image.new("RGB", (2, 1))
    for y in range(h):
        ls = [im.getpixel((x, y)) for x in range(margin)]
        rs = [im.getpixel((w - 1 - x, y)) for x in range(margin)]
        left = tuple(sorted(c[i] for c in ls)[margin // 2] for i in range(3))
        right = tuple(sorted(c[i] for c in rs)[margin // 2] for i in range(3))
        grad.putpixel((0, 0), left)
        grad.putpixel((1, 0), right)
        bg.paste(grad.resize((w, 1), Image.BILINEAR), (0, y))
    return bg


def key_frame(im, lo, hi):
    rgb = im.convert("RGB")
    dist = ImageChops.difference(rgb, background_model(rgb)).convert("L")
    lut = [0 if v <= lo else 255 if v >= hi else round((v - lo) * 255 / (hi - lo))
           for v in range(256)]
    # median filter kills isolated video-noise specks in the alpha
    alpha = dist.point(lut).filter(ImageFilter.MedianFilter(3))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def solid_bbox(frame, solid=96):
    """Content bbox from solid alpha only, so faint noise haze far from the
    piece cannot inflate the crop."""
    mask = frame.split()[3].point(lambda v: 255 if v >= solid else 0)
    return mask.getbbox()


def fill_silhouette(frame, solid=96):
    """Make the piece read as one solid cutout on backdrops close to its own
    color: everything flood-reachable from the frame border through low alpha
    is outside (hard 0), everything else is the piece (opaque). Interior
    pockets that genuinely show backdrop stay as keyed (they sit on the
    boundary of the silhouette, not enclosed by it)."""
    alpha = frame.split()[3]
    mask = alpha.point(lambda v: 255 if v >= solid else 0)
    w, h = mask.size
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if mask.getpixel(seed) == 0:
            ImageDraw.floodfill(mask, seed, 128, thresh=0)
    filled = mask.point(lambda v: 0 if v == 128 else 255)
    # feather the hard silhouette edge a touch
    filled = filled.filter(ImageFilter.GaussianBlur(0.6))
    out = frame.copy()
    out.putalpha(filled)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input_dir")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--stride", type=int, default=2,
                    help="use every Nth frame (default 2)")
    ap.add_argument("--fps", type=float, default=30,
                    help="source capture fps, for frameMs timing")
    ap.add_argument("--scale", type=float, default=0.5)
    ap.add_argument("--cols", type=int, default=8)
    ap.add_argument("--lo", type=float, default=18,
                    help="color distance below this = fully transparent")
    ap.add_argument("--hi", type=float, default=44,
                    help="color distance above this = fully opaque")
    ap.add_argument("--no-fill", action="store_true",
                    help="skip the flood-fill silhouette fill (for "
                         "high-contrast backdrops where keying alone is clean)")
    args = ap.parse_args()

    names = sorted(n for n in os.listdir(args.input_dir)
                   if n.lower().endswith(".png"))
    if not names:
        raise SystemExit(f"no pngs in {args.input_dir}")
    print(f"{len(names)} frames, keying...")
    keyed = []
    for name in names:
        with Image.open(os.path.join(args.input_dir, name)) as im:
            frame = key_frame(im, args.lo, args.hi)
            if not args.no_fill:
                frame = fill_silhouette(frame)
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
    pad = 8
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
