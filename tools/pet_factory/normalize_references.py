from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps


def normalize(source: Path, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for path in source:
        with Image.open(path) as raw:
            image = ImageOps.exif_transpose(raw).convert("RGB")
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            target = output / f"{path.stem}.png"
            image.save(target, format="PNG", optimize=True)
            print(target)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit("Usage: normalize_references.py OUTPUT_DIR IMAGE...")
    normalize([Path(item).resolve() for item in sys.argv[2:]], Path(sys.argv[1]).resolve())
