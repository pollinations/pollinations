import base64
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).parents[1]))
import pollinations_gimp as plugin

class Response:
    def __init__(self, body, status=200):
        self.body = json.dumps(body).encode()
        self.status = status

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

class RequestAndAuthTests(unittest.TestCase):
    def test_json_request_method_body_and_bearer(self):
        seen = []

        def opener(request, timeout):
            seen.append((request.full_url, request.method, request.headers, json.loads(request.data)))
            return Response({"ok": True})

        self.assertEqual(plugin.request_json("https://example.test/x", "POST", {"prompt": "hi"}, "sk_test_token", opener=opener), {"ok": True})
        url, method, headers, body = seen[0]
        self.assertEqual((url, method, body), ("https://example.test/x", "POST", {"prompt": "hi"}))
        self.assertEqual(headers["Authorization"], "Bearer sk_test_token")

    def test_device_code_uses_json_contract(self):
        seen = []

        def request(url, method, payload):
            seen.append((url, method, payload))
            return {"device_code": "d", "user_code": "U", "verification_uri_complete": "https://enter/device?user_code=U", "expires_in": 60, "interval": 5}

        device = plugin.start_device_flow(request=request)
        self.assertEqual(device["user_code"], "U")
        self.assertEqual(seen, [(plugin.AUTH_BASE + "/api/device/code", "POST", {"client_id": plugin.CLIENT_ID, "scope": plugin.SCOPE})])

    def test_pending_polling_then_success_and_slow_down(self):
        calls, waits, now = [], [], [0.0]

        def request(url, method, payload):
            calls.append((url, method, payload))
            if len(calls) == 1:
                raise plugin.APIError("pending", status=400, payload={"error": "authorization_pending"})
            if len(calls) == 2:
                raise plugin.APIError("slow", status=400, payload={"error": "slow_down"})
            return {"access_token": "sk_test_token"}

        def sleep(seconds):
            waits.append(seconds)
            now[0] += seconds

        token = plugin.poll_device_token({"device_code": "d", "expires_in": 100, "interval": 5}, request=request, sleep=sleep, clock=lambda: now[0])
        self.assertEqual(token, "sk_test_token")
        self.assertEqual(waits, [5, 5, 10])
        self.assertEqual(calls[0][0], plugin.AUTH_BASE + "/api/oauth/token")
        self.assertEqual(calls[0][1], "POST")
        self.assertEqual(calls[0][2]["grant_type"], "urn:ietf:params:oauth:grant-type:device_code")

class ModelAndPayloadTests(unittest.TestCase):
    def setUp(self):
        self.edit_model = {"name": "kontext", "category": "image", "output_modalities": ["image"], "input_modalities": ["text", "image"], "supported_endpoints": ["/v1/images/generations", "/v1/images/edits"], "resolutions": ["1k", "2k"]}

    def test_normalize_and_filter_image_models_including_community(self):
        payload = [{"id": "community/x", "category": "image", "inputModalities": ["text"], "outputModalities": ["image"], "community": True}, {"name": "video", "category": "video", "output_modalities": ["video"]}, {"name": "audio", "category": "audio", "output_modalities": ["audio"]}]
        result = plugin.image_models(payload)
        self.assertEqual([m["name"] for m in result], ["community/x"])
        self.assertEqual(result[0]["input_modalities"], ["text"])

    def test_edit_and_resolution_capabilities_control_fields(self):
        self.assertTrue(plugin.model_can_edit(self.edit_model))
        self.assertEqual(plugin.build_generation_request("p", self.edit_model, "2k"), {"prompt": "p", "model": "kontext", "resolution": "2k"})
        body = plugin.build_edit_request("p", self.edit_model, "data:image/png;base64,AA==")
        self.assertEqual(body["image"], "data:image/png;base64,AA==")
        self.assertNotIn("size", body)
        plain = {"name": "zimage", "category": "image", "output_modalities": ["image"], "input_modalities": ["text"]}
        self.assertNotIn("resolution", plugin.build_generation_request("p", plain, "1024x1024"))

    def test_generation_and_edit_call_correct_endpoints(self):
        seen = []
        response = {"data": [{"b64_json": base64.b64encode(b"png").decode()}]}

        def request(url, method, payload, token):
            seen.append((url, method, payload, token))
            return response

        plugin.generate("sk_test_token", "draw", self.edit_model, request=request)
        plugin.edit("sk_test_token", "change", self.edit_model, "data:image/png;base64,AA==", request=request)
        self.assertEqual([row[:2] for row in seen], [(plugin.GEN_BASE + "/v1/images/generations", "POST"), (plugin.GEN_BASE + "/v1/images/edits", "POST")])
        self.assertEqual(seen[1][2]["image"], "data:image/png;base64,AA==")

    def test_base64_response_is_decoded_and_invalid_is_rejected(self):
        self.assertEqual(plugin.decode_image_response({"data": [{"b64_json": base64.b64encode(b"png").decode()}]}), b"png")
        with self.assertRaises(plugin.APIError):
            plugin.decode_image_response({"data": [{"url": "https://example.test/image.png"}]})

    def test_error_mapping_is_user_safe(self):
        self.assertIn("Authentication", str(plugin.map_http_error(401)))
        self.assertIn("Pollen", str(plugin.map_http_error(402)))
        error = plugin.map_http_error(400, {"error": "access_denied"})
        self.assertIn("denied", str(error))

class GimpBoundaryTests(unittest.TestCase):
    def test_active_drawable_export_receives_selection_bounds(self):
        class Selection:
            def bounds(self):
                return (True, 3, 4, 30, 40)

        class Image:
            def get_selection(self):
                return Selection()

        captured = []
        data = plugin.active_drawable_png(Image(), object(), lambda drawable, bounds: captured.append(bounds) or b"png")
        self.assertEqual(data, b"png")
        self.assertEqual(captured, [(3, 4, 30, 40)])

    def test_token_file_is_atomic_strict_and_private(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "token.json"
            plugin.save_token("sk_test_token", path)
            self.assertEqual(plugin.load_token(path), "sk_test_token")
            self.assertEqual(set(json.loads(path.read_text())), {"access_token"})
            if os.name != "nt":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            path.write_text('{"access_token":"sk_test_token","extra":"reject"}')
            self.assertIsNone(plugin.load_token(path))

    def test_delegated_token_rejects_public_client_keys(self):
        with self.assertRaises(plugin.APIError):
            plugin.validate_token("pk_public_client")

    def test_http_error_payload_is_parsed_for_polling(self):
        error = HTTPError("https://example.test", 400, "bad", {}, io.BytesIO(b'{"error":"authorization_pending"}'))
        with patch.object(plugin.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(plugin.APIError) as raised:
                plugin.request_json("https://example.test")
        self.assertEqual(raised.exception.payload["error"], "authorization_pending")


if __name__ == "__main__":
    unittest.main()
