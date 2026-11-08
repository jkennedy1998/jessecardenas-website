#!/usr/bin/env python3
"""Generate compact per-frame WebP previews for progressive earring loading.

Each preview preserves one source frame's alpha and becomes the immediate
rest/near-angle image while the much larger frames.png sheet stays deferred
until the visitor interacts with that earring.
"""
import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
PREVIEW_WIDTH = 200


def main():
    graphics = json.loads((HERE / "graphics.json").read_text())
    written = 0
    for graphic in graphics.values():
        frames = graphic["frames"]
        sheet_path = HERE / frames["sheet"]
        output_dir = sheet_path.parent / "preview"
        output_dir.mkdir(exist_ok=True)
        with Image.open(sheet_path) as sheet:
            for index in range(frames["count"]):
                x = (index % frames["cols"]) * frames["fw"]
                y = (index // frames["cols"]) * frames["fh"]
                frame = sheet.crop((x, y, x + frames["fw"], y + frames["fh"]))
                height = round(frame.height * PREVIEW_WIDTH / frame.width)
                frame.resize((PREVIEW_WIDTH, height), Image.Resampling.LANCZOS).save(
                    output_dir / f"{index}.webp", "WEBP", quality=76, method=1,
                )
                written += 1
    print(f"generated {written} progressive frame previews")


if __name__ == "__main__":
    main()
