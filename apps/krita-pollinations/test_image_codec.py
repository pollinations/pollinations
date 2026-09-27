import os
from pathlib import Path
import sys
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

sys.path.insert(0, str(Path(__file__).resolve().parent / "pollinations_krita"))

from PyQt5.QtGui import QGuiApplication, QImage

import image_codec as codec

_app = QGuiApplication.instance() or QGuiApplication([sys.argv[0]])


def solid_bgra(width, height, b, g, r, a):
    return bytes((b, g, r, a)) * (width * height)


class ImageCodecTests(unittest.TestCase):
    def test_round_trip_preserves_pixels_at_the_same_size(self):
        width, height = 5, 4
        original = solid_bgra(width, height, 30, 20, 10, 255)
        png = codec.pixels_to_png(original, width, height)
        self.assertTrue(png.startswith(b"\x89PNG"))
        restored = codec.png_to_pixels(png, width, height)
        self.assertEqual(restored, original)

    def test_byte_order_is_bgra_as_documented_by_krita(self):
        # Node.pixelData()/setPixelData() use packed BGRA bytes; a pixel with
        # only the red channel set must therefore be encoded as (0, 0, 255, 255).
        width, height = 2, 2
        red_pixel = solid_bgra(width, height, b=0, g=0, r=255, a=255)
        png = codec.pixels_to_png(red_pixel, width, height)
        image = QImage()
        self.assertTrue(image.loadFromData(png, "PNG"))
        color = image.pixelColor(0, 0)
        self.assertEqual((color.red(), color.green(), color.blue(), color.alpha()), (255, 0, 0, 255))

    def test_png_to_pixels_scales_to_the_requested_size(self):
        source = solid_bgra(8, 8, 1, 2, 3, 255)
        png = codec.pixels_to_png(source, 8, 8)
        scaled = codec.png_to_pixels(png, 16, 12)
        self.assertEqual(len(scaled), 16 * 12 * 4)

    def test_pixels_to_png_rejects_a_short_buffer(self):
        with self.assertRaises(ValueError):
            codec.pixels_to_png(b"\x00" * 4, 2, 2)

    def test_png_to_pixels_rejects_invalid_png_data(self):
        with self.assertRaises(ValueError):
            codec.png_to_pixels(b"not a png", 2, 2)


if __name__ == "__main__":
    unittest.main()
