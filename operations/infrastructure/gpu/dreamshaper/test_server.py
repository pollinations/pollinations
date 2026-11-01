import threading
import unittest
from unittest import mock

from fastapi import HTTPException

import server


@mock.patch.object(server, "MAX_DIM", 768)
@mock.patch.object(server, "MAX_PIXELS", 512 * 512)
class ClampDimsTest(unittest.TestCase):
    def test_keeps_wide_aspect_ratio_when_capping(self):
        self.assertEqual(server.clamp_dims(1280, 720), (672, 384))
        self.assertEqual(server.clamp_dims(1024, 576), (672, 384))
        self.assertEqual(server.clamp_dims(1920, 1080), (672, 384))

    def test_keeps_tall_aspect_ratio_when_capping(self):
        self.assertEqual(server.clamp_dims(576, 1024), (384, 672))

    def test_leaves_sizes_within_the_caps_unchanged(self):
        self.assertEqual(server.clamp_dims(512, 512), (512, 512))
        self.assertEqual(server.clamp_dims(512, 288), (512, 288))

    def test_squares_scale_down_to_the_pixel_cap(self):
        self.assertEqual(server.clamp_dims(1024, 1024), (512, 512))

    def test_long_side_never_exceeds_max_dim(self):
        self.assertEqual(server.clamp_dims(2048, 512), (768, 192))
        self.assertEqual(server.clamp_dims(16, 8000), (32, 768))

    def test_tiny_or_zero_sizes_floor_to_32(self):
        self.assertEqual(server.clamp_dims(0, 0), (32, 32))


class GenerationSlotTest(unittest.TestCase):
    def setUp(self):
        self.original_slots = server.generation_slots
        server.generation_slots = threading.BoundedSemaphore(2)

    def tearDown(self):
        server.generation_slots = self.original_slots

    def test_rejects_requests_beyond_the_queue_limit(self):
        with server.generation_slot():
            with server.generation_slot():
                with self.assertRaises(HTTPException) as raised:
                    with server.generation_slot():
                        self.fail("queue admitted a third request")

                self.assertEqual(raised.exception.status_code, 503)
                self.assertEqual(raised.exception.detail, "Queue full")

    def test_releases_slot_after_generation_failure(self):
        with self.assertRaises(RuntimeError):
            with server.generation_slot():
                raise RuntimeError("generation failed")

        with server.generation_slot():
            pass


if __name__ == "__main__":
    unittest.main()
