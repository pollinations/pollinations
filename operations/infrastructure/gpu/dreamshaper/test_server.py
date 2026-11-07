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
        self.original_protected = server.protected_slot
        server.generation_slots = threading.BoundedSemaphore(2)
        server.protected_slot = threading.BoundedSemaphore(1)

    def tearDown(self):
        server.generation_slots = self.original_slots
        server.protected_slot = self.original_protected

    def assert_queue_full(self, protected=False):
        with self.assertRaises(HTTPException) as raised:
            with server.generation_slot(protected):
                self.fail("queue admitted a request beyond its slots")
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.detail, "Queue full")

    def test_rejects_requests_beyond_the_queue_limit(self):
        with server.generation_slot():
            with server.generation_slot():
                self.assert_queue_full()

    def test_shared_requests_never_take_the_protected_slot(self):
        with server.generation_slot():
            with server.generation_slot():
                self.assert_queue_full()
                self.assert_queue_full()
                with server.generation_slot(protected=True):
                    self.assert_queue_full(protected=True)

    def test_protected_requests_use_shared_slots_once_their_own_is_taken(self):
        with server.generation_slot(protected=True):
            with server.generation_slot(protected=True):
                with server.generation_slot():
                    self.assert_queue_full()
                    self.assert_queue_full(protected=True)

    def test_releases_slot_after_generation_failure(self):
        for protected in (False, True):
            for _ in range(3):
                with self.assertRaises(RuntimeError):
                    with server.generation_slot(protected):
                        raise RuntimeError("generation failed")

        with server.generation_slot():
            with server.generation_slot():
                with server.generation_slot(protected=True):
                    pass


if __name__ == "__main__":
    unittest.main()
