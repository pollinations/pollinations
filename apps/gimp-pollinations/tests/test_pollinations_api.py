"""Unit tests for pollinations_api — run with plain python3, no GIMP needed.

    python -m unittest discover -s apps/gimp-pollinations/tests -v

The device-flow tests run against a real local HTTP server (stdlib
http.server in a background thread), exercising the exact urllib code paths
the plug-in uses inside GIMP — no gi bindings involved.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pollinations_api as api  # noqa: E402


# ---------------------------------------------------------------------------
# Scripted fake Pollinations server
# ---------------------------------------------------------------------------


class FakePollinationsHandler(BaseHTTPRequestHandler):
    """Serves scripted responses keyed by (method, path)."""

    script: dict = {}  # (method, path) -> list of (status, body_dict) consumed in order
    requests: list = []

    def log_message(self, *args):  # keep test output clean
        pass

    def _handle(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        type(self).requests.append(
            {
                "method": method,
                "path": self.path,
                "authorization": self.headers.get("Authorization"),
                "body": json.loads(body) if body else None,
            }
        )
        key = (method, self.path.split("?")[0])
        queue = type(self).script.get(key)
        if not queue:
            status, payload = 404, {"error": "not_found"}
        else:
            status, payload = queue.pop(0)
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")


class ServerCase(unittest.TestCase):
    def setUp(self):
        FakePollinationsHandler.script = {}
        FakePollinationsHandler.requests = []
        self.server = HTTPServer(("127.0.0.1", 0), FakePollinationsHandler)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    @staticmethod
    def queue(method, path, *responses):
        FakePollinationsHandler.script[(method, path)] = list(responses)


class TestDeviceFlow(ServerCase):
    def test_start_device_flow_sends_app_key_as_client_id(self):
        self.queue(
            "POST",
            "/api/device/code",
            (200, {"device_code": "dc-1", "user_code": "ABCD-1234", "verification_uri": "/device"}),
        )
        session = api.start_device_flow("pk_test_app", enter_base=self.base)
        self.assertEqual(session.device_code, "dc-1")
        self.assertEqual(session.user_code, "ABCD-1234")
        # Relative verification URIs are resolved against the enter host.
        self.assertEqual(session.verification_uri, f"{self.base}/device")
        self.assertIn("user_code=ABCD-1234", session.verification_uri_complete)
        sent = FakePollinationsHandler.requests[0]
        self.assertEqual(sent["body"], {"client_id": "pk_test_app"})

    def test_poll_pending_then_approved(self):
        self.queue(
            "POST",
            "/api/device/token",
            (200, {"error": "authorization_pending"}),
            (200, {"error": "slow_down"}),
            (200, {"access_token": "sk_user_secret", "token_type": "bearer"}),
        )
        session = api.DeviceSession("dc-1", "U", "v", "v")
        self.assertIsNone(api.poll_device_token(session, enter_base=self.base))
        self.assertIsNone(api.poll_device_token(session, enter_base=self.base))
        self.assertEqual(api.poll_device_token(session, enter_base=self.base), "sk_user_secret")

    def test_poll_denied_raises(self):
        self.queue(
            "POST",
            "/api/device/token",
            (200, {"error": "access_denied", "error_description": "User declined"}),
        )
        session = api.DeviceSession("dc-1", "U", "v", "v")
        with self.assertRaises(api.DeviceFlowError) as ctx:
            api.poll_device_token(session, enter_base=self.base)
        self.assertIn("declined", str(ctx.exception))

    def test_network_failure_maps_to_network_error(self):
        self.server.shutdown()
        self.server.server_close()
        with self.assertRaises(api.NetworkError):
            api.start_device_flow("pk_x", enter_base=self.base)


class TestErrorMapping(ServerCase):
    def test_401_maps_to_auth_expired_with_recovery(self):
        self.queue("GET", "/image/models", (401, {"error": "invalid token"}))
        with self.assertRaises(api.AuthExpiredError) as ctx:
            api._json_request(f"{self.base}/image/models", token="sk_old")
        self.assertIn("Connect Account", ctx.exception.recovery)

    def test_402_maps_to_insufficient_pollen(self):
        self.queue("GET", "/image/models", (402, {"error": "not enough pollen"}))
        with self.assertRaises(api.InsufficientPollenError) as ctx:
            api._json_request(f"{self.base}/image/models", token="sk_x")
        self.assertIn("Pollen", ctx.exception.recovery)

    def test_500_maps_to_generic_api_error_with_status(self):
        self.queue("GET", "/image/models", (500, {"error": "boom"}))
        with self.assertRaises(api.APIError) as ctx:
            api._json_request(f"{self.base}/image/models")
        self.assertEqual(ctx.exception.status, 500)
        self.assertIn("boom", str(ctx.exception))


class TestModelCatalog(unittest.TestCase):
    SAMPLE = {
        "object": "list",
        "data": [
            {"id": "flux", "title": "FLUX", "inputModalities": ["text"], "outputModalities": ["image"]},
            {
                "id": "kontext",
                "title": "FLUX Kontext",
                "inputModalities": ["text", "image"],
                "outputModalities": ["image"],
                "paidOnly": True,
            },
            {
                "id": "community/artist-lora",
                "inputModalities": ["text"],
                "outputModalities": ["image"],
                "community": True,
                "resolutions": ["1024x1024", "768x1344"],
            },
            {"id": "veo", "outputModalities": ["video"], "category": "video"},
            {"id": "mystery-no-fields"},
            "garbage-row",
        ],
    }

    def test_parse_keeps_every_image_model_including_community(self):
        models = api.parse_models(self.SAMPLE)
        ids = [m.id for m in models]
        self.assertEqual(ids, ["flux", "kontext", "community/artist-lora", "mystery-no-fields"])

    def test_capability_parsing(self):
        models = {m.id: m for m in api.parse_models(self.SAMPLE)}
        self.assertFalse(models["flux"].supports_image_input)
        self.assertTrue(models["kontext"].supports_image_input)
        self.assertTrue(models["kontext"].paid_only)
        self.assertTrue(models["community/artist-lora"].community)
        self.assertEqual(models["community/artist-lora"].resolutions, ["1024x1024", "768x1344"])
        self.assertEqual([m.id for m in api.editing_models(list(models.values()))], ["kontext"])

    def test_parse_accepts_bare_list(self):
        models = api.parse_models([{"id": "x", "outputModalities": ["image"]}])
        self.assertEqual([m.id for m in models], ["x"])

    def test_malformed_payload_returns_empty(self):
        self.assertEqual(api.parse_models({"data": "not-a-list"}), [])
        self.assertEqual(api.parse_models(None), [])


class TestFetchModelsHTTP(ServerCase):
    def test_fetch_models_live_catalog(self):
        self.queue("GET", "/image/models", (200, TestModelCatalog.SAMPLE))
        # Point GEN_BASE at the fake server for this call.
        original = api.GEN_BASE
        api.GEN_BASE = self.base
        try:
            models = api.fetch_models("sk_user")
        finally:
            api.GEN_BASE = original
        self.assertEqual(len(models), 4)
        self.assertEqual(
            FakePollinationsHandler.requests[0]["authorization"], "Bearer sk_user"
        )


class TestRequestBuildingAndPayloads(ServerCase):
    KONTEXT = api.ImageModel(id="kontext", input_modalities=["text", "image"])
    FLUX = api.ImageModel(id="flux", input_modalities=["text"])

    def test_prompt_is_url_encoded_and_body_has_model(self):
        url, body = api.build_image_request("a cat & dog/ü", self.FLUX, width=512, height=768, seed=42)
        self.assertIn("a%20cat%20%26%20dog%2F%C3%BC", url)
        self.assertEqual(body, {"model": "flux", "width": 512, "height": 768, "seed": 42})

    def test_optional_fields_omitted(self):
        _, body = api.build_image_request("hi", self.FLUX)
        self.assertEqual(body, {"model": "flux"})

    def test_empty_prompt_rejected(self):
        with self.assertRaises(api.PollinationsError):
            api.build_image_request("   ", self.FLUX)

    def test_edit_payload_encodes_png_as_data_uri(self):
        png = b"\x89PNG\r\n\x1a\nfake"
        _, body = api.build_image_request("make it blue", self.KONTEXT, input_image_png=png)
        uri = body["image"]
        self.assertTrue(uri.startswith("data:image/png;base64,"))
        self.assertEqual(base64.b64decode(uri.split(",", 1)[1]), png)
        # Edit requests never carry size fields.
        self.assertNotIn("width", body)
        self.assertNotIn("height", body)

    def test_edit_rejected_for_text_only_model(self):
        with self.assertRaises(api.PollinationsError) as ctx:
            api.build_image_request("edit", self.FLUX, input_image_png=b"png")
        self.assertIn("does not accept image input", str(ctx.exception))

    def test_request_image_posts_and_returns_bytes(self):
        self.queue("POST", "/image/hello", (200, b"\x89PNG-bytes"))
        original = api.GEN_BASE
        api.GEN_BASE = self.base
        try:
            data = api.request_image("hello", self.FLUX, "sk_tok")
        finally:
            api.GEN_BASE = original
        self.assertEqual(data, b"\x89PNG-bytes")
        sent = FakePollinationsHandler.requests[0]
        self.assertEqual(sent["authorization"], "Bearer sk_tok")
        self.assertEqual(sent["body"], {"model": "flux"})

    def test_request_image_402_raises_insufficient_pollen(self):
        self.queue("POST", "/image/hello", (402, {"error": "need pollen"}))
        original = api.GEN_BASE
        api.GEN_BASE = self.base
        try:
            with self.assertRaises(api.InsufficientPollenError):
                api.request_image("hello", self.FLUX, "sk_tok")
        finally:
            api.GEN_BASE = original

    def test_decode_image_payload_roundtrip(self):
        raw = b"pngdata"
        payload = {"data": [{"b64_json": base64.b64encode(raw).decode()}]}
        self.assertEqual(api.decode_image_payload(payload), raw)
        with self.assertRaises(api.APIError):
            api.decode_image_payload({"data": [{"url": "http://x"}]})


class TestTokenPersistence(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.path = self.dir / "token.json"

    def test_roundtrip_and_permissions(self):
        api.save_token("sk_secret", self.path)
        self.assertEqual(api.load_token(self.path), "sk_secret")
        if os.name != "nt":
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_missing_and_corrupt_return_none(self):
        self.assertIsNone(api.load_token(self.path))
        self.path.write_text("{not json")
        self.assertIsNone(api.load_token(self.path))
        self.path.write_text('{"access_token": 42}')
        self.assertIsNone(api.load_token(self.path))

    def test_delete(self):
        api.save_token("sk_x", self.path)
        api.delete_token(self.path)
        self.assertIsNone(api.load_token(self.path))
        api.delete_token(self.path)  # idempotent

    def test_atomic_write_leaves_no_tempfiles(self):
        api.save_token("sk_x", self.path)
        leftovers = [p for p in self.dir.iterdir() if p.name != "token.json"]
        self.assertEqual(leftovers, [])

    def test_default_path_is_user_config_dir(self):
        path = api.default_token_path()
        self.assertEqual(path.name, "token.json")
        self.assertIn("pollinations-gimp", str(path))
        self.assertNotEqual(str(path.parent), str(Path.cwd()))


class TestConstants(unittest.TestCase):
    def test_endpoints_are_https(self):
        self.assertTrue(api.ENTER_BASE.startswith("https://"))
        self.assertTrue(api.GEN_BASE.startswith("https://"))

    def test_app_key_is_publishable(self):
        self.assertTrue(api.APP_KEY.startswith("pk_"))


if __name__ == "__main__":
    unittest.main()
