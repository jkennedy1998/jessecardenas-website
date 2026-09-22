#!/usr/bin/env python3
"""Split an earring asset (gif/png/webp) into top + bottom pieces at the pivot.

The pivot is the point where the hardware (hook) meets the earring body. For
the example asset the wire passes through the hole in the pendant tab, so the
horizontal cut runs through the hole and the seam is hidden.

Both pieces keep the same canvas width (a window centered on --pivot-x) so
their image centers align on the site: CSS centers each piece with
translateX(-50%) and stacks the bottom piece at the top piece's natural
height (js/components.js sets --pivot-y from the top image's naturalHeight).

Usage:
  python3 split-earring-asset.py ASSET.gif --out-dir example-earring \
      --pivot-x 285 --pivot-y 175

Notes:
- Default output is a static split of a single frame (top.png/bottom.png),
  which is what the site physics wants. If the source animation bakes a
  swing into the whole earring (hook + pendant move together), a static
  frame is REQUIRED — an animated split would fight js/dangle.js.
- --animated writes top.gif/bottom.gif cropping every frame; only use it if
  the source animation moves the pendant relative to the hook.
"""
import argparse
import os

from PIL import Image


def crop_boxes(size, pivot_x, pivot_y, half_window):
    w, h = size
    left = max(0, pivot_x - half_window)
    right = min(w, pivot_x + half_window)
    top_box = (left, 0, right, pivot_y)
    bottom_box = (left, pivot_y, right, h)
    return top_box, bottom_box


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--pivot-x", type=int, required=True,
                    help="attachment x (hardware wire center) in source px")
    ap.add_argument("--pivot-y", type=int, required=True,
                    help="attachment y (cut line) in source px")
    ap.add_argument("--half-window", type=int, default=115,
                    help="half width of the shared crop window (source px)")
    ap.add_argument("--frame", type=int, default=0,
                    help="source frame to use for the static split")
    ap.add_argument("--animated", action="store_true",
                    help="crop every frame into animated top.gif/bottom.gif")
    args = ap.parse_args()

    im = Image.open(args.input)
    animated = getattr(im, "is_animated", False)
    top_box, bottom_box = crop_boxes(im.size, args.pivot_x, args.pivot_y,
                                     args.half_window)
    os.makedirs(args.out_dir, exist_ok=True)

    if not args.animated or not animated:
        im.seek(args.frame)
        frame = im.convert("RGBA")
        frame.crop(top_box).save(os.path.join(args.out_dir, "top.png"))
        frame.crop(bottom_box).save(os.path.join(args.out_dir, "bottom.png"))
        print(f"static split of frame {args.frame}: "
              f"top {top_box[2]-top_box[0]}x{top_box[3]-top_box[1]}, "
              f"bottom {bottom_box[2]-bottom_box[0]}x{bottom_box[3]-bottom_box[1]}")
        return

    durations = []
    tops, bottoms = [], []
    for index in range(im.n_frames):
        im.seek(index)
        frame = im.convert("RGBA")
        durations.append(im.info.get("duration", 40))
        tops.append(frame.crop(top_box).quantize(method=Image.FASTOCTREE))
        bottoms.append(frame.crop(bottom_box).quantize(method=Image.FASTOCTREE))
    tops[0].save(os.path.join(args.out_dir, "top.gif"), save_all=True,
                 append_images=tops[1:], duration=durations, loop=0,
                 disposal=2)
    bottoms[0].save(os.path.join(args.out_dir, "bottom.gif"), save_all=True,
                    append_images=bottoms[1:], duration=durations, loop=0,
                    disposal=2)
    print(f"animated split: {len(tops)} frames, durations {durations[0]}ms")


if __name__ == "__main__":
    main()
