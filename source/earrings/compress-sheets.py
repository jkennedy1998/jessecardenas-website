#!/usr/bin/env python3
"""Compression pass for earring sprite sheets.

Quantizes every intake frames.png down to a 256-color palette PNG (dithered,
alpha preserved). The sheets are full-color RGBA photos exported at ~400x700
per frame with dozens of frames per sheet; lossless PNG keeps them at 6-10MB
each (~167MB total), which makes the first board paint slow. A dithered
256-color pass lands each sheet around 2MB with no visible difference at the
sizes the site renders (verified by side-by-side crop comparison on intake
2026-10-15, see artifacts/compress-check.png).

In-place rewrite on purpose: intake sheets are derived from the raw MOVs in
source/earings-to-process via the pipeline, so they regenerate. Run from any
cwd; targets every intake/*/frames.png. Idempotent — an already-quantized
sheet re-quantizes to the same palette and just recompresses.

Usage: python3 compress-sheets.py [--dry]
"""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent


def quantized_size(image):
    """Quantize to an in-memory PNG and return (png_bytes, mode)."""
    palette = image.quantize(colors=256, method=Image.FASTOCTREE,
                             dither=Image.FLOYDSTEINBERG)
    buffer = io.BytesIO()
    palette.save(buffer, "PNG", optimize=True)
    return buffer.getbuffer().nbytes, palette


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry", action="store_true", help="report savings, write nothing")
    args = parser.parse_args()

    sheets = sorted(HERE.glob("intake/*/frames.png"))
    if not sheets:
        print("no intake sheets found", file=sys.stderr)
        return 1

    total_before = total_after = 0
    for path in sheets:
        image = Image.open(path)
        image.load()  # fail before touching the file
        if image.mode != "RGBA":
            print(f"skip (mode {image.mode}): {path}")
            continue
        size, palette = quantized_size(image)
        before = path.stat().st_size
        total_before += before
        total_after += size
        if args.dry:
            print(f"{before / 1e6:6.1f}MB -> {size / 1e6:6.1f}MB  {path}")
            continue
        palette.save(path, "PNG", optimize=True)
        print(f"{before / 1e6:6.1f}MB -> {path.stat().st_size / 1e6:6.1f}MB  {path}")

    print(f"total: {total_before / 1e6:.1f}MB -> {total_after / 1e6:.1f}MB "
          f"({100 - total_after * 100 // total_before}% smaller)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
