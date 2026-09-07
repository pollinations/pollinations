#!/usr/bin/env python3
"""
Unit tests for the Pollinations GIMP plug-in API layer.

Run with: python -m unittest test_pollinations_api -v
"""

import base64
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from http.server import HTTPServer, BaseHTTPRequestHandler
from unittest.mock import patch

# Import the module under test
from pollinations_gimp import (
    APP_KEY,
    CLIENT_ID,
    DEVICE_CODE_ENDPOINT,
    DEVICE_TOKEN_ENDPOINT,
    GEN_BASE,
    IMAGE_EDIT_ENDPOINT,
    IMAGE_GEN_ENDPOINT,
    MODELS_ENDPOINT,
    ApiError,
    AuthError,
    InsufficientPollenError,
    NetworkError,
    PollinationsError,
    _json_request,
    clear_token,
    edit_image,
    fetch_models,
    generate_image,
    get_model_by_id,
    load_token,
    poll_device_token,
    request_device_code,
    save_token,
    supports_image_input,
)


class MockDeviceFlowHandler(BaseHTTPRequestHandler):
    """Mock server for device flow testing."""

    device_code = "test-device-code"
    user_code = "ABCD-EFGH"
    verification_uri = "https://enter.pollinations.ai/device"
    approved = False
    slow_down_count = 0

    def log_message(self, format, *args):
        pass  # Suppress logs

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")

        if self.path == "/api/device/code":
            response = {
                "device_code": self.device_code,
                "user_code": self.user_code,
                "verification_uri": self.verification_uri,
                "verification_uri_complete": f"{self.verification_uri}?user_code={self.user_code}",
                "interval": 1,
                "expires_in": 300,
            }
            self._send_json(200, response)

        elif self.path == "/api/device/token":
            if self.approved:
                response = {"access_token": "sk-test-token-12345", "token_type": "Bearer"}
                self._send_json(200, response)
            elif self.slow_down_count > 0:
                self.slow_down_count -= 1
                response = {"error": "slow_down", "error_description": "Slow down"}
                self._send_json(400, response)
            else:
                response = {"error": "authorization_pending", "error_description": "Still waiting"}
                self._send_json(400, response)
        else:
            self._send_json(404, {"error": "not found"})

    def do_GET(self):
        if self.path == "/image/models":
            response = {
                "data": [
                    {"name": "flux", "category": "image", "inputModalities": ["text"], "outputModalities": ["image"]},
                    {"name": "flux-kontext-pro", "category": "image", "inputModalities": ["text", "image"], "outputModalities": ["image"]},
                    {"name": "openai", "category": "text", "inputModalities": ["text"], "outputModalities": ["text"]},
                ]
            }
            self._send_json(200, response)
        else:
            self._send_json(404, {"error": "not found"})

    def _send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class TestTokenStorage(unittest.TestCase):
    """Test token save/load/clear operations."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.original_get_config_dir = sys.modules["pollinations_gimp"]._get_config_dir
        sys.modules["pollinations_gimp"]._get_config_dir = lambda: self.temp_dir

    def tearDown(self):
        sys.modules["pollinations_gimp"]._get_config_dir = self.original_get_config_dir
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_save_and_load_token(self):
        save_token("test-token-123")
        token = load_token()
        self.assertEqual(token, "test-token-123")

    def test_load_no_token(self):
        token = load_token()
        self.assertIsNone(token)

    def test_clear_token(self):
        save_token("test-token")
        clear_token()
        token = load_token()
        self.assertIsNone(token)

    def test_clear_nonexistent_token(self):
        clear_token()  # Should not raise

    def test_token_file_permissions(self):
        save_token("secret-token")
        path = os.path.join(self.temp_dir, "token.json")
        if os.name == "posix":
            mode = os.stat(path).st_mode
            self.assertEqual(mode & 0o777, 0o600)

    def test_corrupt_token_file(self):
        path = os.path.join(self.temp_dir, "token.json")
        with open(path, "w") as f:
            f.write("not valid json{{{")
        token = load_token()
        self.assertIsNone(token)


class TestDeviceFlow(unittest.TestCase):
    """Test device authorization flow."""

    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), MockDeviceFlowHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        MockDeviceFlowHandler.approved = False
        MockDeviceFlowHandler.slow_down_count = 0

    def _patch_endpoints(self):
        return {
            "DEVICE_CODE_ENDPOINT": f"http://127.0.0.1:{self.port}/api/device/code",
            "DEVICE_TOKEN_ENDPOINT": f"http://127.0.0.1:{self.port}/api/device/token",
        }

    def test_request_device_code(self):
        with patch.dict("os.environ", self._patch_endpoints()):
            result = request_device_code()
            self.assertEqual(result["device_code"], "test-device-code")
            self.assertIn("verification_uri", result)

    def test_poll_approved(self):
        MockDeviceFlowHandler.approved = True
        with patch.dict("os.environ", self._patch_endpoints()):
            token = poll_device_token("test-device-code")
            self.assertEqual(token, "sk-test-token-12345")

    def test_poll_pending(self):
        MockDeviceFlowHandler.approved = False
        with patch.dict("os.environ", self._patch_endpoints()):
            token = poll_device_token("test-device-code")
            self.assertIsNone(token)


class TestModelCatalog(unittest.TestCase):
    """Test model catalog fetching and filtering."""

    def test_fetch_models_filters_non_image(self):
        with patch("pollinations_gimp._json_request") as mock:
            mock.return_value = {
                "data": [
                    {"name": "flux", "category": "image", "inputModalities": ["text"], "outputModalities": ["image"]},
                    {"name": "openai", "category": "text", "inputModalities": ["text"], "outputModalities": ["text"]},
                ]
            }
            models = fetch_models("test-token")
            self.assertEqual(len(models), 1)
            self.assertEqual(models[0]["name"], "flux")

    def test_fetch_models_empty(self):
        with patch("pollinations_gimp._json_request") as mock:
            mock.return_value = {"data": []}
            models = fetch_models("test-token")
            self.assertEqual(len(models), 0)

    def test_supports_image_input_true(self):
        model = {"name": "flux-kontext-pro", "inputModalities": ["text", "image"]}
        self.assertTrue(supports_image_input(model))

    def test_supports_image_input_false(self):
        model = {"name": "flux", "inputModalities": ["text"]}
        self.assertFalse(supports_image_input(model))

    def test_get_model_by_id_found(self):
        models = [{"name": "flux", "id": "flux"}, {"name": "openai", "id": "openai"}]
        result = get_model_by_id(models, "flux")
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "flux")

    def test_get_model_by_id_not_found(self):
        models = [{"name": "flux"}]
        result = get_model_by_id(models, "nonexistent")
        self.assertIsNone(result)


class TestImageGeneration(unittest.TestCase):
    """Test image generation."""

    def test_generate_image_b64(self):
        fake_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        fake_b64 = base64.b64encode(fake_bytes).decode("utf-8")
        with patch("pollinations_gimp._json_request") as mock:
            mock.return_value = {"data": [{"b64_json": fake_b64}]}
            result = generate_image("test prompt", model="flux", token="test-token")
            self.assertEqual(result, fake_bytes)

    def test_generate_image_url_fallback(self):
        fake_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        with patch("pollinations_gimp._json_request") as mock_json, \
             patch("pollinations_gimp._request") as mock_req:
            mock_json.return_value = {"data": [{"url": "https://example.com/img.png"}]}
            mock_req.return_value = (200, fake_bytes, {})
            result = generate_image("test prompt", model="flux", token="test-token")
            self.assertEqual(result, fake_bytes)

    def test_generate_image_no_data(self):
        with patch("pollinations_gimp._json_request") as mock:
            mock.return_value = {"data": []}
            with self.assertRaises(ApiError):
                generate_image("test prompt", model="flux", token="test-token")


class TestImageEditing(unittest.TestCase):
    """Test image editing."""

    def test_edit_image_b64(self):
        fake_input = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
        fake_output = b"\x89PNG\r\n\x1a\n" + b"\xff" * 50
        fake_b64 = base64.b64encode(fake_output).decode("utf-8")
        with patch("pollinations_gimp._json_request") as mock:
            mock.return_value = {"data": [{"b64_json": fake_b64}]}
            result = edit_image("make it blue", fake_input, model="flux-kontext-pro", token="test-token")
            self.assertEqual(result, fake_output)


class TestErrorHandling(unittest.TestCase):
    """Test error mapping."""

    def test_401_raises_auth_error(self):
        with patch("pollinations_gimp._request") as mock:
            mock.return_value = (401, b'{"error": "unauthorized"}', {})
            with self.assertRaises(AuthError):
                _json_request("https://example.com/test", token="bad-token")

    def test_402_raises_insufficient_pollen(self):
        with patch("pollinations_gimp._request") as mock:
            mock.return_value = (402, b'{"error": "insufficient balance"}', {})
            with self.assertRaises(InsufficientPollenError):
                _json_request("https://example.com/test", token="test-token")

    def test_500_raises_api_error(self):
        with patch("pollinations_gimp._request") as mock:
            mock.return_value = (500, b'{"message": "Internal server error"}', {})
            with self.assertRaises(ApiError) as ctx:
                _json_request("https://example.com/test", token="test-token")
            self.assertEqual(ctx.exception.status, 500)

    def test_network_error(self):
        import urllib.error
        with patch("pollinations_gimp._request") as mock:
            mock.side_effect = NetworkError("Connection refused")
            with self.assertRaises(NetworkError):
                _json_request("https://example.com/test", token="test-token")


class TestConfiguration(unittest.TestCase):
    """Test configuration constants."""

    def test_app_key_format(self):
        self.assertTrue(APP_KEY.startswith("pk_"))

    def test_client_id_format(self):
        self.assertEqual(CLIENT_ID, "gimp-pollinations-plugin")

    def test_endpoints_https(self):
        self.assertTrue(DEVICE_CODE_ENDPOINT.startswith("https://"))
        self.assertTrue(DEVICE_TOKEN_ENDPOINT.startswith("https://"))
        self.assertTrue(MODELS_ENDPOINT.startswith("https://"))
        self.assertTrue(IMAGE_GEN_ENDPOINT.startswith("https://"))
        self.assertTrue(IMAGE_EDIT_ENDPOINT.startswith("https://"))


if __name__ == "__main__":
    unittest.main()
