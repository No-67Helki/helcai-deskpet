from __future__ import annotations

import unittest

from PIL import Image, ImageDraw

from tools.pet_factory.build_sprite_package import STATE_SPECS, normalize_frame, remove_green_background


class PetFactoryImageTests(unittest.TestCase):
    def test_contract_contains_exactly_72_frames(self) -> None:
        self.assertEqual(sum(spec["frames"] for spec in STATE_SPECS.values()), 72)

    def test_green_background_becomes_transparent_without_erasing_subject(self) -> None:
        source = Image.new("RGBA", (160, 160), (4, 242, 8, 255))
        draw = ImageDraw.Draw(source)
        draw.ellipse((44, 24, 116, 142), fill=(205, 200, 190, 255))
        result = remove_green_background(source)
        self.assertLessEqual(result.getpixel((0, 0))[3], 8)
        self.assertGreaterEqual(result.getpixel((80, 80))[3], 245)

    def test_normalized_grounded_frame_has_transparent_corners_and_fixed_footpoint(self) -> None:
        source = Image.new("RGBA", (160, 160), (0, 255, 0, 255))
        ImageDraw.Draw(source).rectangle((52, 24, 108, 146), fill=(190, 185, 180, 255))
        result = normalize_frame(source, "idle")
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertGreaterEqual(result.getchannel("A").getbbox()[3], 348)
        self.assertLessEqual(result.getchannel("A").getbbox()[3], 350)


if __name__ == "__main__":
    unittest.main()
