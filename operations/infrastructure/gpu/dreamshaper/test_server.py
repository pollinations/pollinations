import asyncio
import os
import threading
import time
import unittest
from unittest import mock

from fastapi import HTTPException
from aiohttp import web

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


class HeartbeatTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.requests = []
        self.release = asyncio.Event()
        self.received = asyncio.Event()
        self.status = 200
        self.hang = False
        app = web.Application()
        app.router.add_post("/register", self.register)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = self.runner.addresses[0][1]
        self.env = mock.patch.dict(os.environ, {
            "REGISTER_URL": f"http://127.0.0.1:{port}/register",
            "PUBLIC_HOSTNAME": "heartbeat-test.invalid",
            "PLN_GPU_TOKEN": "local-test-only",
            "HEARTBEAT_ENABLED": "true",
            "SERVICE_TYPE": "sana",
        })
        self.env.start()

    async def asyncTearDown(self):
        self.release.set()
        await self.runner.cleanup()
        self.env.stop()

    async def register(self, request):
        self.requests.append((time.monotonic(), await request.json(), request.headers.get("Authorization")))
        self.received.set()
        if self.hang:
            await self.release.wait()
        return web.Response(status=self.status)

    async def test_registers_expected_pool_and_auth(self):
        await server.send_heartbeat()
        _, body, authorization = self.requests[0]
        self.assertEqual(body, {"url": "https://heartbeat-test.invalid", "type": "sana"})
        self.assertEqual(authorization, "Bearer local-test-only")

    async def test_failed_first_attempt_retries_after_five_seconds(self):
        self.status = 503
        task = asyncio.create_task(server.periodic_heartbeat())
        try:
            await asyncio.wait_for(self.received.wait(), 2)
            # Wait until the first response has been consumed before recovering.
            await asyncio.sleep(0.1)
            self.status = 200
            self.received.clear()
            await asyncio.wait_for(self.received.wait(), 7)
            elapsed = self.requests[1][0] - self.requests[0][0]
            self.assertGreaterEqual(elapsed, 5)
            self.assertLess(elapsed, 7)
        finally:
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

    async def test_hung_request_times_out_before_registry_expiry(self):
        self.hang = True
        started = time.monotonic()
        # The outer timeout fails this test if aiohttp's five-minute default returns.
        with self.assertRaises(TimeoutError):
            async with asyncio.timeout(13) as deadline:
                await server.send_heartbeat()
        self.assertFalse(deadline.expired(), "heartbeat exceeded its own timeout")
        self.assertGreaterEqual(time.monotonic() - started, 10)

    async def test_isolated_canary_does_not_register(self):
        os.environ["HEARTBEAT_ENABLED"] = "false"
        await server.send_heartbeat()
        self.assertEqual(self.requests, [])


if __name__ == "__main__":
    unittest.main()
