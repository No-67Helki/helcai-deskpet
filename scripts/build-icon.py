from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "branding" / "helcai-icon-source.png"
PNG_OUTPUT = ROOT / "assets" / "icon.png"
ICO_OUTPUT = ROOT / "assets" / "icon.ico"


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing icon source: {SOURCE}")
    with Image.open(SOURCE) as image:
        image = image.convert("RGBA")
        side = min(image.size)
        left = (image.width - side) // 2
        top = (image.height - side) // 2
        icon = image.crop((left, top, left + side, top + side)).resize((512, 512), Image.Resampling.LANCZOS)
        icon.save(PNG_OUTPUT, format="PNG", optimize=True)
        icon.save(ICO_OUTPUT, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"Icons generated: {PNG_OUTPUT}, {ICO_OUTPUT}")


if __name__ == "__main__":
    main()
