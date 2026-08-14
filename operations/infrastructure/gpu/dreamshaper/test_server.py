import threading
import unittest

from fastapi import HTTPException

import server


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
