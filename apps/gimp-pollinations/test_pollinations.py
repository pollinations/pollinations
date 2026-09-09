import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import pollinations_api as api
from token_store import TokenStore


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.respond()

    def do_POST(self):
        self.respond()

    def respond(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or "null")
        self.server.requests.append((self.path, dict(self.headers), payload, time.monotonic()))
        status, body = self.server.responses.pop(0)
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.requests, self.server.responses = [], []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origins = api.ENTER, api.GEN
        api.ENTER = api.GEN = "http://127.0.0.1:" + str(self.server.server_port)

    def tearDown(self):
        api.ENTER, api.GEN = self.origins
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def reply(self, body, status=200):
        self.server.responses.append((status, body))

    def test_catalog_keeps_community_and_account_authorization(self):
        self.reply([{"name": "owner/new", "community": True, "output_modalities": ["image"]},
                    {"name": "publisher/video", "output_modalities": ["video"]}])
        self.assertEqual([m["name"] for m in api.load_models("sk_test")], ["owner/new"])
        path, headers, _, _ = self.server.requests[0]
        self.assertEqual(path, "/image/models")
        self.assertEqual(headers["Authorization"], "Bearer sk_test")
        self.assertEqual(headers["User-Agent"], "Pollinations-GIMP/1.0")

    def test_generate_and_edit_payloads(self):
        model = {"name": "owner/new", "resolutions": ["1K"], "input_modalities": ["image"]}
        for source, route in [(None, "generations"), (b"png-source", "edits")]:
            with self.subTest(route=route):
                self.reply({"data": [{"b64_json": base64.b64encode(b"image-result").decode()}]})
                self.assertEqual(api.generate("sk_test", model, "test prompt", "1K", source), b"image-result")
                path, headers, payload, _ = self.server.requests[-1]
                self.assertEqual(path, "/v1/images/" + route)
                self.assertEqual(payload["resolution"], "1K")
                self.assertEqual(headers["Authorization"], "Bearer sk_test")
                if source:
                    self.assertEqual(base64.b64decode(payload["image"].split(",")[1]), source)
                else:
                    self.assertNotIn("image", payload)

    def test_unsupported_options_do_not_send_a_request(self):
        model = {"name": "new"}
        for kwargs in [{"resolution": "4K"}, {"source": b"png"}, {"prompt": " "}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(api.ApiError):
                api.generate("sk_test", model, **({"prompt": "test"} | kwargs))
        self.assertEqual(self.server.requests, [])

    def test_generation_waits_without_deadline_but_catalog_remains_bounded(self):
        # Spy on the real localhost transport: both generation routes must
        # override urllib's default timeout, without unbounding metadata calls.
        with patch.object(api.urllib.request, "urlopen", wraps=api.urllib.request.urlopen) as opened:
            for source in (None, b"png-source"):
                self.reply({"data": [{"b64_json": base64.b64encode(b"result").decode()}]})
                self.assertEqual(api.generate("sk_test", {"name": "image", "input_modalities": ["image"]}, "prompt", source=source), b"result")
                self.assertIsNone(opened.call_args.kwargs["timeout"])
            self.reply([{"name": "image", "output_modalities": ["image"]}])
            api.load_models("sk_test")
            self.assertEqual(opened.call_args.kwargs["timeout"], 30)

    def test_errors_do_not_echo_credentials(self):
        for status in [400, 401, 402, 403, 429, 500]:
            with self.subTest(status=status):
                self.reply({"error": "sk_secret_value"}, status)
                with self.assertRaises(api.ApiError) as caught:
                    api.load_models("sk_test")
                self.assertNotIn("sk_secret_value", str(caught.exception))
                self.assertTrue(str(caught.exception))

    def test_device_code_attribution_and_approval(self):
        self.reply({"device_code": "private-code", "user_code": "ABCD-1234", "verification_uri": "/device", "verification_uri_complete": "/device?user_code=ABCD-1234", "expires_in": 60, "interval": 5})
        code = api.begin_authorization("pk_test")
        self.assertEqual(self.server.requests[0][2], {"client_id": "pk_test"})
        self.assertTrue(code["approval_url"].endswith("/device?user_code=ABCD-1234"))
        self.reply({"access_token": "sk_authorized", "token_type": "bearer"})
        self.assertEqual(api.poll_authorization(code, threading.Event()), "sk_authorized")
        self.assertEqual(self.server.requests[1][2], {"device_code": "private-code"})

    def test_device_code_does_not_require_app_attribution(self):
        self.reply({"device_code": "code", "user_code": "user", "verification_uri": "/device", "expires_in": 60})
        api.begin_authorization("")
        self.assertEqual(self.server.requests[0][2], {})

    def test_poll_pending_slow_down_and_denied(self):
        self.reply({"error": "authorization_pending"}, 400)
        self.reply({"error": "slow_down"}, 400)
        self.reply({"error": "access_denied"}, 400)
        code = {"device_code": "private-code", "deadline": time.monotonic() + 40, "interval": 5}
        with self.assertRaisesRegex(api.ApiError, "declined"):
            api.poll_authorization(code, threading.Event())
        times = [request[3] for request in self.server.requests]
        self.assertGreaterEqual(times[2] - times[1], 9.9)

    def test_cancel_expiry_and_invalid_approval_url(self):
        cancel = threading.Event()
        cancel.set()
        with self.assertRaises(api.Cancelled):
            api.poll_authorization({"deadline": time.monotonic() + 60}, cancel)
        with self.assertRaisesRegex(api.ApiError, "expired"):
            api.poll_authorization({"deadline": time.monotonic() - 1}, threading.Event())
        self.reply({"device_code": "code", "user_code": "user", "expires_in": 60, "verification_uri": "https://unexpected.example/device"})
        with self.assertRaisesRegex(api.ApiError, "Unexpected"):
            api.begin_authorization("pk_test")

    def test_empty_or_invalid_generation_is_actionable(self):
        for body in [{}, {"data": []}, {"data": [{"b64_json": "!"}]}]:
            self.reply(body)
            with self.assertRaisesRegex(api.ApiError, "no valid image"):
                api.generate("sk_test", {"name": "new"}, "prompt")


class StorageTests(unittest.TestCase):
    def test_restart_private_storage_and_disconnect(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TokenStore(directory)
            self.assertIsNone(store.load())
            store.save("sk_private_test")
            self.assertEqual(TokenStore(directory).load(), "sk_private_test")
            if os.name == "nt":
                self.assertNotIn(b"sk_private_test", store.path.read_bytes())
            else:
                self.assertEqual(store.path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
            store.clear()
            self.assertIsNone(store.load())
            store.clear()


if __name__ == "__main__":
    unittest.main()
