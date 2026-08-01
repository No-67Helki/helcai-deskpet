from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


FRAME_SIZE = 384
ATLAS_COLUMNS = 8
STATE_SPECS = {
    "idle": {"frames": 12, "columns": 4, "rows": 3, "fps": 8},
    "walk": {"frames": 16, "columns": 4, "rows": 4, "fps": 16},
    "sit": {"frames": 10, "columns": 5, "rows": 2, "fps": 10},
    "sleep": {"frames": 10, "columns": 5, "rows": 2, "fps": 6},
    "happy": {"frames": 16, "columns": 4, "rows": 4, "fps": 16},
    "dragged": {"frames": 8, "columns": 4, "rows": 2, "fps": 12},
}


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("frame is completely transparent")
    return bbox


def remove_green_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 245:
        return rgba

    red, green, blue, _ = rgba.split()
    distance = ImageChops.lighter(ImageChops.lighter(red, ImageChops.invert(green)), blue)
    matte = distance.point(lambda value: 0 if value <= 48 else 255 if value >= 140 else round((value - 48) / 92 * 255))
    matte = matte.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.25))

    # Despill only near the newly-created edge; preserve natural green/yellow eyes.
    pixels = rgba.load()
    matte_pixels = matte.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            edge_alpha = matte_pixels[x, y]
            r, g, b, _ = pixels[x, y]
            # Generated key backgrounds often bleed one opaque green pixel into fur.
            # Remove only strongly green-dominant spill; natural yellow-green eyes are
            # not channel-dominant enough to cross this threshold.
            if g > max(r, b) + 18:
                g = max(r, b) + 8
            pixels[x, y] = (r, g, b, edge_alpha)
    return rgba


def normalize_frame(image: Image.Image, state: str) -> Image.Image:
    transparent = remove_green_background(image)
    bbox = alpha_bbox(transparent)
    subject = transparent.crop(bbox)
    max_width = 354
    max_height = 334 if state != "dragged" else 318
    scale = min(max_width / subject.width, max_height / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    x = round((FRAME_SIZE - subject.width) / 2)
    y = round((FRAME_SIZE - subject.height) / 2) if state == "dragged" else 350 - subject.height
    canvas.alpha_composite(subject, (x, y))
    coverage = subject.width * subject.height / (FRAME_SIZE * FRAME_SIZE)
    if coverage < 0.06 or coverage > 0.86:
        raise ValueError(f"{state} frame has suspicious subject coverage {coverage:.1%}")
    return canvas


def split_grid(path: Path, state: str) -> list[Image.Image]:
    spec = STATE_SPECS[state]
    with Image.open(path) as source:
        image = source.convert("RGBA")
    columns = spec["columns"]
    rows = spec["rows"]
    if image.width < columns * 64 or image.height < rows * 64:
        raise ValueError(f"{path.name} is too small for a {columns}x{rows} grid: {image.size}")
    cell_width = image.width / columns
    cell_height = image.height / rows
    frames: list[Image.Image] = []
    for index in range(spec["frames"]):
        row, column = divmod(index, columns)
        box = (
            round(column * cell_width),
            round(row * cell_height),
            round((column + 1) * cell_width),
            round((row + 1) * cell_height),
        )
        frames.append(normalize_frame(image.crop(box), state))
    return frames


def build(source: Path, output: Path, pet_id: str, name: str) -> None:
    frames: dict[str, list[Image.Image]] = {}
    for state in STATE_SPECS:
        grid = source / f"{state}-grid.png"
        if not grid.exists():
            raise FileNotFoundError(grid)
        frames[state] = split_grid(grid, state)

    output.mkdir(parents=True, exist_ok=True)
    frame_output = output / "frames"
    if frame_output.exists():
        shutil.rmtree(frame_output)
    frame_output.mkdir()

    all_frames: list[tuple[str, Image.Image]] = []
    clips: dict[str, dict[str, int | bool]] = {}
    cursor = 0
    for state, spec in STATE_SPECS.items():
        state_frames = frames[state]
        clips[state] = {"start": cursor, "end": cursor + len(state_frames) - 1, "fps": spec["fps"], "loop": True}
        all_frames.extend((state, frame) for frame in state_frames)
        cursor += len(state_frames)

    rows = (len(all_frames) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas = Image.new("RGBA", (FRAME_SIZE * ATLAS_COLUMNS, FRAME_SIZE * rows), (0, 0, 0, 0))
    state_counts = {state: 0 for state in STATE_SPECS}
    for index, (state, frame) in enumerate(all_frames):
        column, row = index % ATLAS_COLUMNS, index // ATLAS_COLUMNS
        atlas.alpha_composite(frame, (column * FRAME_SIZE, row * FRAME_SIZE))
        state_counts[state] += 1
        frame.save(frame_output / f"{state}-{state_counts[state]:02d}.png", optimize=True)

    atlas.save(output / "sprite-sheet.png", optimize=True)
    frames["idle"][0].save(output / "preview.png", optimize=True)
    manifest = {
        "schemaVersion": 2,
        "id": pet_id,
        "name": name,
        "kind": "sprite-sheet",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "processorVersion": 3,
        "sourceImage": "sprite-sheet.png",
        "previewImage": "preview.png",
        "canvasWidth": FRAME_SIZE,
        "canvasHeight": FRAME_SIZE,
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "anchor": {"x": FRAME_SIZE // 2, "y": 350},
        "motion": {"walkDistancePerCycle": 200},
        "columns": ATLAS_COLUMNS,
        "totalFrames": len(all_frames),
        "clips": clips,
        "generation": {
            "mode": "imagegen-assisted",
            "backgroundRemoval": "local-fallback",
            "notes": [
                "Provider-neutral DeskPet prompt template 1.0.0.",
                "Six states and 72 chronological frames.",
                "Chroma removal, normalization and ground anchors were applied locally.",
            ],
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {output / 'sprite-sheet.png'} ({atlas.width}x{atlas.height}), {len(all_frames)} frames")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a validated DeskPet 72-frame package from six AI contact sheets.")
    parser.add_argument("source", nargs="?", default=".artifacts/generated-grids")
    parser.add_argument("output", nargs="?", default="assets/pets/helcai")
    parser.add_argument("--id", default="helcai")
    parser.add_argument("--name", default="赫尔财")
    args = parser.parse_args()
    build(Path(args.source).resolve(), Path(args.output).resolve(), args.id, args.name)


if __name__ == "__main__":
    main()
