from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image


REQUIRED_PREFIXES = {
    "01-front-face": "正面脸部",
    "02-left-profile": "左侧面",
    "03-right-profile": "右侧面",
    "04-standing-body": "站立全身",
    "05-sitting-body": "坐姿全身",
    "06-marking-detail": "特色花纹",
}
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
MIN_EDGE = 1500


def find_photo(root: Path, prefix: str) -> Path | None:
    candidates = [item for item in root.glob(f"{prefix}.*") if item.suffix.lower() in SUPPORTED]
    return sorted(candidates)[0] if candidates else None


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    for prefix, label in REQUIRED_PREFIXES.items():
        photo = find_photo(root, prefix)
        if photo is None:
            errors.append(f"缺少 {label}：{prefix}.*")
            continue
        try:
            with Image.open(photo) as image:
                width, height = image.size
                if max(width, height) < MIN_EDGE:
                    errors.append(f"{photo.name} 分辨率过低：{width}x{height}，最长边至少 {MIN_EDGE}px")
        except Exception as exc:  # Pillow reports codec-specific details here.
            errors.append(f"无法读取 {photo.name}：{exc}")

    metadata_path = root / "pet.json"
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if not isinstance(metadata.get("displayName"), str) or not metadata["displayName"].strip():
                errors.append("pet.json 的 displayName 不能为空")
        except Exception as exc:
            errors.append(f"pet.json 无效：{exc}")
    return errors


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "inputs/pet-photos").resolve()
    if not root.is_dir():
        print(f"照片目录不存在：{root}", file=sys.stderr)
        return 2
    errors = validate(root)
    if errors:
        print("照片集尚未达到生成要求：", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"照片集检查通过：{root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
