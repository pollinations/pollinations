import unittest

from fastapi import HTTPException

from generation_queue import GenerationQueue


class GenerationQueueTest(unittest.TestCase):
    def test_rejects_requests_beyond_the_limit(self):
        queue = GenerationQueue(3)

        with queue.slot():
            with queue.slot():
                with queue.slot():
                    with self.assertRaises(HTTPException) as raised:
                        with queue.slot():
                            self.fail("queue admitted a fourth request")

                    self.assertEqual(raised.exception.status_code, 503)
                    self.assertEqual(raised.exception.detail, "Queue full")

    def test_releases_slot_after_generation_failure(self):
        queue = GenerationQueue(1)

        with self.assertRaises(RuntimeError):
            with queue.slot():
                raise RuntimeError("generation failed")

        with queue.slot():
            pass

    def test_rejects_invalid_limit(self):
        with self.assertRaisesRegex(ValueError, "at least 1"):
            GenerationQueue(0)


if __name__ == "__main__":
    unittest.main()
