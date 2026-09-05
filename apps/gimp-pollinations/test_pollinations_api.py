#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit tests for pollinations_api — the API layer of the GIMP 3 plug-in.

Everything runs against a local in-process HTTP server (stdlib only): no
network access, no GIMP, no pip packages.

Run from this directory:

    python -m unittest test_pollinations_api -v
"""

import base64
import email
import json
import os
import socket
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pollinations_api as polli

# A tiny but valid 1x1 PNG.
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg"
    "YGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==")

FAKE_TOKEN = "sk_test_user_key_123"
FAKE_APP_KEY = "pk_test_app_key"

MODELS_FIXTURE = [
    {"name": "zimage", "title": "Z-Image Turbo", "category": "image",
     "community": False, "input_modalities": ["text"],
     "output_modalities": ["image"]},
    {"name": "flux-2-pro", "title": "FLUX.2 Pro", "category": "image",
     "community": False, "input_modalities": ["text", "image"],
     "output_modalities": ["image"], "resolutions": ["1k", "2k"]},
    {"name": "community-painter", "title": "Community Painter",
     "category": "image", "community": True,
     "input_modalities": ["text"], "output_modalities": ["image"]},
    {"name": "a-video-model", "title": "Some Video Model",
     "category": "video", "community": False,
     "input_modalities": ["text", "image"],
     "output_modalities": ["video"]},
]


class FakePollinationsHandler(BaseHTTPRequestHandler):
    """Minimal stand-in for enter.pollinations.ai + gen.pollinations.ai."""

    protocol_version = "HTTP/1.1"

    # Per-test behaviour, set on the server object:
    #   server.token_responses  list of dicts popped for each token poll
    #   server.models           catalog fixture (default MODELS_FIXTURE)
    #   server.requests         list of (method, path, headers, body)

    def log_message(self, *args):  # silence test output
        pass

    # -- helpers -------------------------------------------------------------

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def _record(self, body):
        self.server.requests.append(
            (self.command, self.path, dict(self.headers), body))

    def _base_url(self):
        return "http://" + (self.headers.get("Host") or "127.0.0.1")

    def _send_json(self, obj, status=200):
        payload = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_bytes(self, data, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # -- routing ---------------------------------------------------------------

    def do_GET(self):
        self._record(b"")
        if self.path == "/image/models":
            self._send_json(getattr(self.server, "models", MODELS_FIXTURE))
        elif self.path == "/img.png":
            self._send_bytes(PNG_BYTES, "image/png")
        elif self.path == "/api/device/userinfo":
            self._send_json({"sub": "u1", "preferred_username": "voodoohop"})
        else:
            self._send_json({"error": "not found"}, status=404)

    def do_POST(self):
        body = self._read_body()
        self._record(body)
        path = self.path
        if path == "/api/device/code":
            self._send_json({
                "device_code": "dev-code-1",
                "user_code": "ABCD-1234",
                "verification_uri": "http://x/device",
                "verification_uri_complete": "http://x/device?user_code=ABCD-1234",
                "expires_in": 1800,
                "interval": 0,   # fast polling in tests
            })
        elif path == "/api/device/token":
            queue = self.server.token_responses
            if queue:
                self._send_json(queue.pop(0))
            else:
                self._send_json({"error": "authorization_pending"})
        elif path == "/v1/images/generations":
            payload = json.loads(body.decode("utf-8"))
            self.server.last_generate_payload = payload
            if payload.get("prompt") == "trigger-401":
                self._send_json({"success": False, "error": {
                    "message": "A valid API key is required.",
                    "code": "UNAUTHORIZED"}}, status=401)
            elif payload.get("prompt") == "trigger-402":
                self._send_json({"success": False, "error": {
                    "message": "Insufficient pollen.",
                    "code": "PAYMENT_REQUIRED"}}, status=402)
            elif payload.get("prompt") == "trigger-500":
                self._send_json({"success": False, "error": {
                    "message": "Upstream exploded."}}, status=500)
            elif payload.get("prompt") == "trigger-url":
                self._send_json({"data": [{"url": self._base_url()
                                           + "/img.png"}]})
            elif payload.get("prompt") == "trigger-bad-pad":
                raw = base64.b64encode(PNG_BYTES).decode("ascii")
                self._send_json({"data": [{"b64_json": raw.rstrip("=")}]})
            elif payload.get("prompt") == "trigger-empty":
                self._send_json({"data": []})
            else:
                self._send_json({"data": [{
                    "b64_json": base64.b64encode(PNG_BYTES).decode("ascii")}]})
        elif path == "/v1/images/edits":
            # Parse the multipart body so tests can assert on it.
            content_type = self.headers.get("Content-Type", "")
            message = email.message_from_bytes(
                b"Content-Type: " + content_type.encode("ascii") + b"\r\n\r\n"
                + body)
            parts = {}
            for part in message.walk():
                name = part.get_param("name", header="content-disposition")
                if name:
                    parts[name] = part.get_payload(decode=True)
            self.server.last_edit_parts = parts
            if parts.get("prompt") == b"trigger-401":
                self._send_json({"error": {"message": "unauthorized"}},
                                status=401)
            else:
                self._send_json({"data": [{
                    "b64_json": base64.b64encode(PNG_BYTES).decode("ascii")}]})
        else:
            self._send_json({"error": "not found"}, status=404)


class BaseTestCase(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0),
                                         FakePollinationsHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever,
                                      daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        # Fresh per-test behaviour on the shared server.
        self.server.token_responses = []
        self.server.requests = []
        self.server.last_generate_payload = None
        self.server.last_edit_parts = None
        self.port = self.server.server_address[1]
        self.base = "http://127.0.0.1:%d" % self.port

    def authenticator(self):
        return polli.DeviceAuthenticator(app_key=FAKE_APP_KEY,
                                         auth_base=self.base)

    def client(self):
        return polli.PollinationsClient(FAKE_TOKEN, api_base=self.base)


class DeviceAuthTests(BaseTestCase):

    def test_request_device_code_fields(self):
        code = self.authenticator().request_device_code()
        self.assertEqual(code.device_code, "dev-code-1")
        self.assertEqual(code.user_code, "ABCD-1234")
        self.assertEqual(code.verification_uri, "http://x/device")
        self.assertEqual(
            code.verification_uri_complete, "http://x/device?user_code=ABCD-1234")
        self.assertEqual(code.expires_in, 1800)
        self.assertEqual(code.interval, 0)
        # The App Key is sent as client_id for attribution.
        method, path, headers, body = self.server.requests[0]
        self.assertEqual((method, path), ("POST", "/api/device/code"))
        self.assertEqual(json.loads(body.decode("utf-8")),
                         {"client_id": FAKE_APP_KEY})

    def test_pending_slow_down_then_approved(self):
        self.server.token_responses = [
            {"error": "authorization_pending"},
            {"error": "slow_down"},
            {"access_token": FAKE_TOKEN, "token_type": "bearer"},
        ]
        token = self.authenticator().poll_for_token("dev-code-1")
        self.assertEqual(token, FAKE_TOKEN)
        # Three polls happened before approval.
        token_calls = [r for r in self.server.requests
                       if r[1] == "/api/device/token"]
        self.assertEqual(len(token_calls), 3)

    def test_denied(self):
        self.server.token_responses = [{"error": "access_denied"}]
        with self.assertRaises(polli.AccessDeniedError):
            self.authenticator().poll_for_token("dev-code-1")

    def test_expired(self):
        self.server.token_responses = [{"error": "expired_token"}]
        with self.assertRaises(polli.DeviceAuthExpiredError):
            self.authenticator().poll_for_token("dev-code-1")

    def test_unknown_error_surfaces(self):
        self.server.token_responses = [{"error": "invalid_grant",
                                        "error_description": "Unknown code"}]
        with self.assertRaises(polli.ApiError):
            self.authenticator().poll_for_token("dev-code-1")

    def test_cancelled_before_first_poll(self):
        token = self.authenticator().poll_for_token(
            "dev-code-1", is_cancelled=lambda: True)
        self.assertIsNone(token)
        self.assertFalse(
            [r for r in self.server.requests if r[1] == "/api/device/token"])

    def test_fetch_username(self):
        username = self.authenticator().fetch_username(FAKE_TOKEN)
        self.assertEqual(username, "voodoohop")
        _method, path, headers, _body = self.server.requests[0]
        self.assertEqual(path, "/api/device/userinfo")
        self.assertEqual(headers.get("Authorization"),
                         "Bearer " + FAKE_TOKEN)

    def test_fetch_username_failure_returns_none(self):
        # A 404 (or any failure) must not raise — the username is optional.
        broken = polli.DeviceAuthenticator(app_key=FAKE_APP_KEY,
                                           auth_base=self.base + "/nope")
        self.assertIsNone(broken.fetch_username(FAKE_TOKEN))


class NetworkErrorTests(unittest.TestCase):

    def _dead_base(self):
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()
        return "http://127.0.0.1:%d" % port

    def test_device_code_network_error(self):
        auth = polli.DeviceAuthenticator(auth_base=self._dead_base())
        with self.assertRaises(polli.NetworkError):
            auth.request_device_code()

    def test_client_network_error(self):
        client = polli.PollinationsClient(FAKE_TOKEN,
                                         api_base=self._dead_base())
        with self.assertRaises(polli.NetworkError):
            client.generate_image("a cat")

    def test_error_mentions_recovery(self):
        client = polli.PollinationsClient(FAKE_TOKEN,
                                         api_base=self._dead_base())
        try:
            client.list_image_models()
        except polli.NetworkError as error:
            self.assertIn("Check your internet connection", error.user_message)
        else:
            self.fail("NetworkError not raised")


class TokenStoreTests(unittest.TestCase):

    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def test_roundtrip(self):
        store = polli.TokenStore(base_dir=self.dir)
        store.save(FAKE_TOKEN, "voodoohop")
        data = store.load()
        self.assertEqual(data["token"], FAKE_TOKEN)
        self.assertEqual(data["username"], "voodoohop")
        self.assertEqual(store.load_token(), FAKE_TOKEN)

    def test_survives_restart(self):
        polli.TokenStore(base_dir=self.dir).save(FAKE_TOKEN)
        # A brand new instance (= GIMP restart) still sees the key.
        self.assertEqual(polli.TokenStore(base_dir=self.dir).load_token(),
                         FAKE_TOKEN)

    def test_clear(self):
        store = polli.TokenStore(base_dir=self.dir)
        store.save(FAKE_TOKEN)
        store.clear()
        self.assertIsNone(store.load())
        # Clearing twice is a no-op, not an error.
        store.clear()

    def test_missing_file_is_none(self):
        self.assertIsNone(polli.TokenStore(base_dir=self.dir).load())

    def test_no_temp_files_left_behind(self):
        store = polli.TokenStore(base_dir=self.dir)
        for _ in range(3):
            store.save(FAKE_TOKEN)
        self.assertEqual(sorted(os.listdir(self.dir)), ["auth.json"])

    def test_corrupt_file_is_none(self):
        store = polli.TokenStore(base_dir=self.dir)
        with open(store.path, "w", encoding="utf-8") as file:
            file.write("{not json")
        self.assertIsNone(store.load())

    def test_token_file_is_private(self):
        store = polli.TokenStore(base_dir=self.dir)
        store.save(FAKE_TOKEN)
        if os.name == "posix":  # meaningful permission check on POSIX only
            mode = os.stat(store.path).st_mode & 0o777
            self.assertEqual(mode, 0o600)


class CatalogTests(BaseTestCase):

    def test_parses_and_includes_community(self):
        models = self.client().list_image_models()
        names = [m["name"] for m in models]
        # Community models are kept; non-image categories are dropped.
        self.assertIn("community-painter", names)
        self.assertIn("zimage", names)
        self.assertIn("flux-2-pro", names)
        self.assertNotIn("a-video-model", names)

    def test_request_authorized_and_live(self):
        self.client().list_image_models()
        method, path, headers, _body = self.server.requests[0]
        self.assertEqual((method, path), ("GET", "/image/models"))
        # The catalog is fetched with the user's key — model visibility
        # follows the connected account, nothing is hardcoded.
        self.assertEqual(headers.get("Authorization"), "Bearer " + FAKE_TOKEN)

    def test_sort_models_official_first(self):
        models = polli.catalog_models(MODELS_FIXTURE)
        sorted_models = polli.sort_models(models)
        community_flags = [bool(m.get("community")) for m in sorted_models]
        self.assertEqual(community_flags, sorted(community_flags))

    def test_supports_image_input(self):
        models = {m["name"]: m for m in MODELS_FIXTURE}
        self.assertFalse(polli.supports_image_input(models["zimage"]))
        self.assertTrue(polli.supports_image_input(models["flux-2-pro"]))

    def test_has_resolutions(self):
        models = {m["name"]: m for m in MODELS_FIXTURE}
        self.assertTrue(polli.has_resolutions(models["flux-2-pro"]))
        self.assertFalse(polli.has_resolutions(models["zimage"]))

    def test_model_label_marks_community(self):
        models = {m["name"]: m for m in MODELS_FIXTURE}
        self.assertIn("community", polli.model_label(models["community-painter"]))
        self.assertNotIn("community",
                        polli.model_label(models["zimage"]))

    def test_resolution_to_size(self):
        self.assertEqual(polli.resolution_to_size("1k"), "1024x1024")
        self.assertEqual(polli.resolution_to_size("2k"), "2048x2048")
        self.assertEqual(polli.resolution_to_size("512x512"), "512x512")
        self.assertIsNone(polli.resolution_to_size("huge"))


class GenerateTests(BaseTestCase):

    def test_payload_and_decode(self):
        result = self.client().generate_image("a red panda", model="zimage",
                                              size="768x768")
        self.assertEqual(result, PNG_BYTES)
        payload = self.server.last_generate_payload
        self.assertEqual(payload["prompt"], "a red panda")
        self.assertEqual(payload["model"], "zimage")
        self.assertEqual(payload["size"], "768x768")
        self.assertEqual(payload["response_format"], "b64_json")
        # Bearer token of the connected user is used (BYOP).
        method, path, headers, _body = self.server.requests[0]
        self.assertEqual((method, path), ("POST", "/v1/images/generations"))
        self.assertEqual(headers.get("Authorization"), "Bearer " + FAKE_TOKEN)

    def test_401_maps_to_auth_error(self):
        with self.assertRaises(polli.AuthError):
            self.client().generate_image("trigger-401")
        try:
            self.client().generate_image("trigger-401")
        except polli.AuthError as error:
            self.assertIn("Connect Account", error.user_message)

    def test_402_maps_to_insufficient_pollen(self):
        with self.assertRaises(polli.InsufficientPollenError):
            self.client().generate_image("trigger-402")

    def test_500_maps_to_api_error_with_message(self):
        with self.assertRaises(polli.ApiError) as caught:
            self.client().generate_image("trigger-500")
        self.assertEqual(caught.exception.status, 500)
        self.assertIn("Upstream exploded", caught.exception.user_message)

    def test_url_fallback_downloads(self):
        result = self.client().generate_image("trigger-url")
        self.assertEqual(result, PNG_BYTES)

    def test_missing_b64_padding_tolerated(self):
        result = self.client().generate_image("trigger-bad-pad")
        self.assertEqual(result, PNG_BYTES)

    def test_empty_data_is_api_error(self):
        with self.assertRaises(polli.ApiError):
            self.client().generate_image("trigger-empty")


class EditTests(BaseTestCase):

    def test_multipart_upload_and_decode(self):
        result = self.client().edit_image(
            "make the sky a vivid sunset", PNG_BYTES,
            model="flux-2-pro", size="1024x1024")
        self.assertEqual(result, PNG_BYTES)

        parts = self.server.last_edit_parts
        self.assertEqual(parts["prompt"], b"make the sky a vivid sunset")
        self.assertEqual(parts["model"], b"flux-2-pro")
        self.assertEqual(parts["size"], b"1024x1024")
        # The image is uploaded as a file part named "image".
        self.assertEqual(parts["image"], PNG_BYTES)

        method, path, headers, body = self.server.requests[0]
        self.assertEqual((method, path), ("POST", "/v1/images/edits"))
        self.assertEqual(headers.get("Authorization"), "Bearer " + FAKE_TOKEN)
        self.assertTrue(headers.get("Content-Type", "")
                        .startswith("multipart/form-data; boundary="))
        # Multipart body actually contains the raw PNG bytes.
        self.assertIn(PNG_BYTES, body)

    def test_edit_401_maps_to_auth_error(self):
        with self.assertRaises(polli.AuthError):
            self.client().edit_image("trigger-401", PNG_BYTES)

    def test_default_mime_is_png(self):
        body, content_type = polli.encode_multipart(
            {"prompt": "hi"}, "image", "layer.png", b"raw", "image/png")
        self.assertIn(b"Content-Type: image/png", body)
        self.assertTrue(content_type.startswith("multipart/form-data"))


if __name__ == "__main__":
    unittest.main()
