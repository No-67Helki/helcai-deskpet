from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


SUPPORTED = {".jpg", ".jpeg", ".png", ".webp"}
THUMB_SIZE = (260, 200)
LABEL_HEIGHT = 44
COLUMNS = 4
ROWS = 4


def make_contact_sheets(source: Path, output: Path) -> None:
    photos = sorted(
        item for item in source.rglob("*") if item.is_file() and item.suffix.lower() in SUPPORTED
    )
    if not photos:
        raise SystemExit(f"No supported photos found in {source}")

    output.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=16)
    records: list[dict[str, object]] = []
    page_size = COLUMNS * ROWS

    for page_index in range(math.ceil(len(photos) / page_size)):
        page = Image.new(
            "RGB",
            (COLUMNS * THUMB_SIZE[0], ROWS * (THUMB_SIZE[1] + LABEL_HEIGHT)),
            "#20242b",
        )
        draw = ImageDraw.Draw(page)
        for slot, photo in enumerate(photos[page_index * page_size : (page_index + 1) * page_size]):
            with Image.open(photo) as raw:
                image = ImageOps.exif_transpose(raw).convert("RGB")
                width, height = image.size
                thumb = ImageOps.contain(image, THUMB_SIZE)
            column = slot % COLUMNS
            row = slot // COLUMNS
            x = column * THUMB_SIZE[0]
            y = row * (THUMB_SIZE[1] + LABEL_HEIGHT)
            page.paste(
                thumb,
                (x + (THUMB_SIZE[0] - thumb.width) // 2, y + (THUMB_SIZE[1] - thumb.height) // 2),
            )
            label = f"{photo.stem[:12]}  {width}x{height}"
            draw.text((x + 8, y + THUMB_SIZE[1] + 10), label, fill="#f2f4f8", font=font)
            records.append({"file": photo.name, "width": width, "height": height})
        page.save(output / f"contact-sheet-{page_index + 1:02d}.jpg", quality=92)

    (output / "photos.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Created {math.ceil(len(photos) / page_size)} contact sheets for {len(photos)} photos")


if __name__ == "__main__":
    source_path = Path(sys.argv[1] if len(sys.argv) > 1 else "Cat_Photo").resolve()
    output_path = Path(sys.argv[2] if len(sys.argv) > 2 else ".artifacts/photo-review").resolve()
    make_contact_sheets(source_path, output_path)
