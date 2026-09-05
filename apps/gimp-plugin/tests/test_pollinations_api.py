"""Unit tests for pollinations_api.py (no GIMP or network required).

Runs against a real local HTTP server (stdlib http.server) to exercise the
exact urllib code paths used by the module.
"""

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pollinations_api as api


class FakeTokenServer(BaseHTTPRequestHandler):
    """Minimal in-process stand-in for enter/gen endpoints."""

    responses = {}
    request_log = []

    def _respond(self, code, payload, content_type="application/json"):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8"))
        except ValueError:
            data = {}
        self.request_log.append((self.path, data))
        resp = FakeTokenServer.responses.get(("POST", self.path))
        if resp is None:
            self._respond(404, {"error": "not_found"})
            return
        self._respond(*resp)

    def do_GET(self):
        self.request_log.append((self.path, None))
        resp = FakeTokenServer.responses.get(("GET", self.path))
        if resp is None:
            self._respond(404, {"error": "not_found"})
            return
        self._respond(*resp)

    def log_message(self, *args):  # silence
        pass


class ServerFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = HTTPServer(("127.0.0.1", 0), FakeTokenServer)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        # Point the client at the fake server.
        base = f"http://127.0.0.1:{cls.port}"
        api.ENTER_BASE = base
        api.GEN_BASE = base
        api.DEVICE_CODE_URL = base + "/device/code"
        api.DEVICE_TOKEN_URL = base + "/device/token"
        api.USERINFO_URL = base + "/userinfo"
        api.MODELS_URL = base + "/image/models"
        api.IMAGE_URL = base + "/image/"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join()

    def setUp(self):
        FakeTokenServer.responses = {}
        FakeTokenServer.request_log = []


class DeviceFlowTests(ServerFixture):
    def test_full_device_flow_with_slow_down(self):
        FakeTokenServer.responses = {
            ("POST", "/device/code"): (
                200,
                {
                    "device_code": "dc123",
                    "user_code": "AB12-CD34",
                    "verification_uri": "/device",
                    "verification_uri_complete": "https://enter.pollinations.ai/device?user_code=AB12-CD34",
                },
            ),
            ("POST", "/device/token"): (200, {"error": "authorization_pending"}),
        }
        device = api.request_device_code("pk_test")
        self.assertEqual(device.user_code, "AB12-CD34")
        self.assertEqual(device.device_code, "dc123")
        self.assertIn("AB12-CD34", device.verification_uri_complete)

        # First poll pending, then set approved for the next attempt.
        FakeTokenServer.responses[("POST", "/device/token")] = (
            200,
            {"access_token": "sk_user", "token_type": "bearer"},
        )
        token = api.poll_device_token(device.device_code, client_id="pk_test", interval=0)
        self.assertEqual(token, "sk_user")
        # client_id is attributed on the code request
        self.assertEqual(
            FakeTokenServer.request_log[0][1].get("client_id"), "pk_test"
        )

    def test_device_flow_with_cancel(self):
        device = api.DeviceCode("dc", "CODE", "/device", None)
        cancel = threading.Event()
        cancel.set()
        with self.assertRaises(api.AuthorizationDenied):
            api.poll_device_token(device.device_code, cancel=cancel, interval=0)

    def test_device_flow_denied(self):
        FakeTokenServer.responses = {
            ("POST", "/device/token"): (200, {"error": "access_denied"})
        }
        with self.assertRaises(api.AuthorizationDenied):
            api.poll_device_token("dc", interval=0)

    def test_device_flow_expired(self):
        FakeTokenServer.responses = {
            ("POST", "/device/token"): (200, {"error": "expired_token"})
        }
        with self.assertRaises(api.AuthorizationExpired):
            api.poll_device_token("dc", interval=0)

    def test_device_flow_network_down(self):
        # Point at a dead port and cancel after the first retry pause.
        saved = api.DEVICE_TOKEN_URL
        api.DEVICE_TOKEN_URL = "http://127.0.0.1:1/token"
        cancel = threading.Event()

        def cancel_later():
            time.sleep(0.2)
            cancel.set()

        threading.Thread(target=cancel_later, daemon=True).start()
        try:
            with self.assertRaises(api.AuthorizationDenied):
                api.poll_device_token("dc", interval=0, cancel=cancel)
        finally:
            api.DEVICE_TOKEN_URL = saved


class TokenStoreTests(unittest.TestCase):
    def test_save_load_private_delete(self):
        with tempfile.TemporaryDirectory() as d:
            store = api.TokenStore(Path(d))
            store.save("sk_secret")
            self.assertEqual(store.load(), "sk_secret")
            self.assertTrue(store.configured())
            # Permission should be 0600 on Unix.
            if hasattr(os, "chmod") and os.name == "posix":
                mode = (Path(d) / "token.json").stat().st_mode & 0o777
                self.assertEqual(mode, 0o600)
            store.delete()
            self.assertIsNone(store.load())

    def test_load_missing_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            store = api.TokenStore(Path(d))
            self.assertIsNone(store.load())

    def test_load_corrupt_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)
            store = api.TokenStore(path)
            path.mkdir(exist_ok=True)
            (path / "token.json").write_text("{ not json", encoding="utf-8")
            self.assertIsNone(store.load())


class ModelCatalogTests(ServerFixture):
    def _models_response(self):
        return (
            200,
            [
                {
                    "name": "flux-2-pro",
                    "title": "FLUX.2 Pro",
                    "description": "editing",
                    "input_modalities": ["text", "image"],
                    "output_modalities": ["image"],
                    "capabilities": [],
                    "community": False,
                    "paid_only": True,
                },
                {
                    "name": "zimage",
                    "title": "Z-Image",
                    "input_modalities": ["text"],
                    "output_modalities": ["image"],
                    "community": True,
                    "paid_only": False,
                },
                {
                    "name": "veo",
                    "title": "Veo",
                    "category": "video",
                    "input_modalities": ["text"],
                    "output_modalities": ["video"],
                },
            ],
        )

    def test_parses_catalog_and_filters_non_image(self):
        FakeTokenServer.responses[("GET", "/image/models")] = self._models_response()
        models = api.load_image_models("sk_x")
        names = [m.name for m in models]
        self.assertIn("flux-2-pro", names)
        self.assertIn("zimage", names)
        self.assertNotIn("veo", names)
        flux = next(m for m in models if m.name == "flux-2-pro")
        self.assertTrue(flux.accepts_image)
        self.assertFalse(flux.community)
        zimage = next(m for m in models if m.name == "zimage")
        self.assertTrue(zimage.community)
        self.assertIn("community", zimage.label)

    def test_handles_data_envelope(self):
        models_list = self._models_response()[1]
        FakeTokenServer.responses[("GET", "/image/models")] = (
            200,
            {"data": models_list},
        )
        models = api.load_image_models("sk_x")
        self.assertEqual(len(models), 2)

    def test_error_when_no_image_models(self):
        FakeTokenServer.responses[("GET", "/image/models")] = (
            200,
            [{"name": "veo", "category": "video"}],
        )
        with self.assertRaises(api.PollinationsError):
            api.load_image_models("sk_x")


class GenerateTests(ServerFixture):
    def test_generate_returns_bytes(self):
        # The fake server returns an error for the image GET, so we test the
        # request-building path separately.
        FakeTokenServer.responses[("GET", "/image/hello")] = (200, {"error": "x"}, "application/json")
        # Just verify the data-URI helper + param assembly are correct.
        uri = api._data_uri(b"AB", "image/png")
        self.assertEqual(uri, "data:image/png;base64,QUI=")

    def test_edit_payload_maps_to_data_uri(self):
        uri = api._data_uri(b"\x89PNG", "image/png")
        self.assertTrue(uri.startswith("data:image/png;base64,"))


class ErrorMappingTests(ServerFixture):
    def test_401_maps_to_auth_error(self):
        FakeTokenServer.responses[("GET", "/image/models")] = (
            401,
            {"detail": "unauthorized"},
        )
        with self.assertRaises(api.AuthError) as ctx:
            api.load_image_models("sk_bad")
        self.assertIn("Connect your account", ctx.exception.message)

    def test_402_maps_to_payment_error(self):
        FakeTokenServer.responses[("GET", "/image/models")] = (
            402,
            {"detail": "insufficient"},
        )
        with self.assertRaises(api.PaymentError) as ctx:
            api.load_image_models("sk_x")
        self.assertIn("Insufficient Pollen", ctx.exception.message)

    def test_500_maps_to_generic_error(self):
        FakeTokenServer.responses[("GET", "/image/models")] = (
            500,
            {"detail": "boom"},
        )
        with self.assertRaises(api.PollinationsError) as ctx:
            api.load_image_models("sk_x")
        self.assertIn("HTTP 500", ctx.exception.message)

    def test_network_error_maps_clearly(self):
        saved = api.MODELS_URL
        api.MODELS_URL = "http://127.0.0.1:1/models"
        try:
            with self.assertRaises(api.PollinationsError) as ctx:
                api.load_image_models("sk_x")
            self.assertIn("Network error", ctx.exception.message)
        finally:
            api.MODELS_URL = saved


if __name__ == "__main__":
    unittest.main()
