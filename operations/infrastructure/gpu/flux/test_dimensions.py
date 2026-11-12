import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import dimensions

MAX_PIXELS = 810_000
FULL_RES_PIXELS = 1_048_576


class AspectRatioTest(unittest.TestCase):
    def assert_size(self, requested, expected, max_pixels=MAX_PIXELS):
        width, height = dimensions.nearest_valid_dimensions(*requested, max_pixels)
        self.assertEqual((width, height), expected)

    def test_scales_a_two_to_one_request_instead_of_squaring_it(self):
        self.assert_size((256, 128), (512, 256))

    def test_keeps_portrait_and_landscape_orientation(self):
        self.assert_size((192, 256), (384, 512))
        self.assert_size((384, 192), (512, 256))
        self.assert_size((320, 256), (640, 512))

    def test_leaves_an_already_valid_size_alone(self):
        self.assert_size((1024, 1024), (1024, 1024), FULL_RES_PIXELS)
        self.assert_size((512, 256), (512, 256))
        self.assert_size((512, 128), (512, 128))

    def test_caps_a_full_res_square_on_a_smaller_gpu(self):
        self.assert_size((1024, 1024), (768, 768))

    def test_keeps_the_ratio_when_capping_pixels(self):
        # 1.6:1 must stay 1.6:1 instead of becoming 1280x768 (1.67:1).
        width, height = dimensions.nearest_valid_dimensions(1280, 800, MAX_PIXELS)
        self.assertAlmostEqual(width / height, 1.6, places=3)
        self.assertLessEqual(width * height, MAX_PIXELS)

        # 4:3 must stay 4:3 instead of becoming 1280x768.
        width, height = dimensions.nearest_valid_dimensions(1200, 900, MAX_PIXELS)
        self.assertAlmostEqual(width / height, 4 / 3, places=3)
        self.assertLessEqual(width * height, MAX_PIXELS)

    def test_small_squares_grow_to_the_smallest_valid_square(self):
        self.assert_size((64, 64), (256, 256))

    def test_keeps_common_sizes_large_instead_of_shrinking_them(self):
        # 800x600 fits 4:3 at 1024x768 under the cap; the old score preferred
        # the smaller 512x384 and threw away 59% of the pixels.
        self.assert_size((800, 600), (1024, 768))
        # 1280x720 is above the cap, so it takes the largest valid 16:9 size.
        self.assert_size((1280, 720), (1024, 576))
        # Treat ratios within 5% as equal: a larger near-ratio size must beat
        # a smaller exact one at both caps.
        self.assert_size((1536, 1024), (1024, 704))
        self.assert_size((1080, 1350), (512, 640))
        self.assert_size((1536, 1024), (1024, 704), FULL_RES_PIXELS)
        self.assert_size((1080, 1350), (832, 1024), FULL_RES_PIXELS)

    def test_never_returns_a_side_below_the_minimum(self):
        # A narrow request used to snap to 48x4096, below MIN_DIMENSION.
        for requested in [(64, 5461), (5461, 64), (64, 8192), (8192, 64)]:
            width, height = dimensions.nearest_valid_dimensions(
                *requested, MAX_PIXELS
            )
            self.assertGreaterEqual(width, dimensions.MIN_DIMENSION)
            self.assertGreaterEqual(height, dimensions.MIN_DIMENSION)

    def test_result_always_satisfies_the_backend_invariant(self):
        for requested in [
            (256, 128),
            (192, 256),
            (384, 192),
            (320, 256),
            (1280, 800),
            (1200, 900),
            (64, 64),
            (1024, 512),
            (800, 600),
            (1280, 720),
            (1536, 1024),
            (1080, 1350),
            (64, 5461),
            (5461, 64),
        ]:
            width, height = dimensions.nearest_valid_dimensions(*requested, MAX_PIXELS)
            self.assertEqual(width % 8, 0)
            self.assertEqual(height % 8, 0)
            self.assertEqual((width * height) % 65536, 0)
            self.assertLessEqual(width * height, MAX_PIXELS)

    def test_rejects_sizes_outside_the_backend_bounds(self):
        with self.assertRaises(ValueError):
            dimensions.nearest_valid_dimensions(32, 32, MAX_PIXELS)
        with self.assertRaises(ValueError):
            dimensions.nearest_valid_dimensions(9000, 1024, MAX_PIXELS)


if __name__ == "__main__":
    unittest.main()
