#!/usr/bin/env python3
"""Unit tests for pollinations_gimp pure core (no GIMP, no network)."""

from __future__ import annotations

import base64
import io
import json
import os
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pollinations_gimp import (
    PollinationsError,
    _build_multipart,
    _decode_b64_image,
    _map_error,
    can_edit,
    model_resolutions,
    start_device_flow,
    poll_device_token,
    save_token,
    load_token,
    clear_token,
    validate_token,
    fetch_image_models,
    generate_image,
    edit_image,
    _http_json,
    _http_bytes,
    APP_KEY,
)


# ── Mock HTTP opener ──────────────────────────────────────────────────────────


def _mock_response(data: bytes, status: int = 200) -> io.BytesIO:
    resp = io.BytesIO(data)
    resp.status = status
    return resp


def _make_json_opener(payload, status: int = 200):
    """Return a mock opener that yields a JSON response."""
    body = json.dumps(payload).encode() if isinstance(payload, (dict, list)) else payload
    resp = io.BytesIO(body)
    resp.status = status
    resp.read_orig = resp.read

    def opener(req, **kwargs):
        return _fake_ctx(resp)
    return opener


class _fake_ctx:
    def __init__(self, resp):
        self._resp = resp
    def __enter__(self):
        return self._resp
    def __exit__(self, *a):
        pass


# ── Token persistence ─────────────────────────────────────────────────────────


class TestTokenPersistence(unittest.TestCase):
    def setUp(self):
        self._tmp = Path(tempfile.mkdtemp())
        self._tok = self._tmp / "token.json"

    def tearDown(self):
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_save_load_clear(self):
        save_token("sk_test_valid_1234", path=self._tok)
        self.assertEqual(load_token(self._tok), "sk_test_valid_1234")
        clear_token(self._tok)
        self.assertIsNone(load_token(self._tok))

    def test_file_permissions(self):
        save_token("sk_test_perm_12345", path=self._tok)
        mode = os.stat(self._tok).st_mode & 0o777
        self.assertEqual(mode, 0o600)

    def test_load_returns_none_for_corrupt_file(self):
        self._tok.write_text("not json", encoding="utf-8")
        self.assertIsNone(load_token(self._tok))

    def test_load_returns_none_for_wrong_shape(self):
        self._tok.write_text(json.dumps({"wrong_key": "sk_xxx"}), encoding="utf-8")
        self.assertIsNone(load_token(self._tok))


class TestValidateToken(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(validate_token("sk_abc12345"), "sk_abc12345")

    def test_strips_whitespace(self):
        self.assertEqual(validate_token("  sk_abc12345  "), "sk_abc12345")

    def test_too_short(self):
        with self.assertRaises(PollinationsError) as ctx:
            validate_token("sk_abc")
        self.assertIn("invalid", ctx.exception.args[0].lower())

    def test_wrong_prefix(self):
        with self.assertRaises(PollinationsError):
            validate_token("ak_abcdefghij")


# ── Error mapping ──────────────────────────────────────────────────────────────


class TestMapError(unittest.TestCase):
    def test_401(self):
        err = _map_error(401, {"error": "invalid_token"})
        self.assertIn("expired", err.args[0].lower())
        self.assertEqual(err.status, 401)

    def test_402(self):
        err = _map_error(402)
        self.assertIn("pollen", err.args[0].lower())
        self.assertEqual(err.status, 402)

    def test_429(self):
        err = _map_error(429)
        self.assertIn("too many", err.args[0].lower())

    def test_500(self):
        err = _map_error(500)
        self.assertIn("unavailable", err.args[0].lower())

    def test_network(self):
        err = _map_error(None, {"error": "network"})
        self.assertIn("internet", err.args[0].lower())

    def test_timeout(self):
        err = _map_error(None, {"error": "timeout"})
        self.assertIn("timed out", err.args[0].lower())


# ── Multipart builder ─────────────────────────────────────────────────────────


class TestBuildMultipart(unittest.TestCase):
    def test_text_fields(self):
        ct, body = _build_multipart([("a", "1"), ("b", "2")])
        self.assertIn("multipart/form-data", ct)
        self.assertIn(b'"a"\r\n\r\n1\r\n', body)
        self.assertIn(b'"b"\r\n\r\n2\r\n', body)

    def test_binary_upload(self):
        ct, body = _build_multipart([
            ("file", "test.png", "image/png", b"\x89PNG\r\n"),
        ])
        self.assertIn(b'test.png', body)
        self.assertIn(b'Content-Type: image/png', body)

    def test_custom_boundary(self):
        ct, body = _build_multipart([("x", "y")], boundary="MYBOUND")
        self.assertIn("MYBOUND", ct)
        self.assertTrue(body.endswith(b"--MYBOUND--\r\n"))


# ── B64 image decoding ────────────────────────────────────────────────────────


class TestDecodeB64Image(unittest.TestCase):
    def test_valid(self):
        png = b"\x89PNG\r\n\x1a\nfake"
        payload = {"data": [{"b64_json": base64.b64encode(png).decode()}]}
        self.assertEqual(_decode_b64_image(payload), png)

    def test_missing_data_raises(self):
        with self.assertRaises(PollinationsError):
            _decode_b64_image({"data": []})

    def test_invalid_b64_raises(self):
        with self.assertRaises(PollinationsError):
            _decode_b64_image({"data": [{"b64_json": "!!!not-base64!!!"}]})


# ── Model filtering ────────────────────────────────────────────────────────────


class TestModelFiltering(unittest.TestCase):
    def test_can_edit_true(self):
        m = {
            "name": "flux-kontext",
            "input_modalities": ["text", "image"],
            "output_modalities": ["image"],
        }
        self.assertTrue(can_edit(m))

    def test_can_edit_false_no_image_input(self):
        m = {
            "name": "flux-schnell",
            "input_modalities": ["text"],
            "output_modalities": ["image"],
        }
        self.assertFalse(can_edit(m))

    def test_can_edit_false_no_image_output(self):
        m = {
            "name": "some-model",
            "input_modalities": ["text", "image"],
            "output_modalities": ["text"],
        }
        self.assertFalse(can_edit(m))

    def test_can_edit_missing_modalities(self):
        m = {"name": "unknown"}
        self.assertFalse(can_edit(m))

    def test_model_resolutions(self):
        m = {"name": "test", "resolutions": ["512x512", "1024x1024"]}
        self.assertEqual(model_resolutions(m), ["512x512", "1024x1024"])

    def test_model_resolutions_empty(self):
        self.assertEqual(model_resolutions({"name": "test"}), [])


# ── fetch_image_models filtering ───────────────────────────────────────────────


class TestFetchImageModels(unittest.TestCase):
    def _mock_opener(self, models_json):
        return _make_json_opener(models_json)

    def test_filters_out_video(self):
        models = [
            {"name": "wan-video", "category": "video", "output_modalities": ["video"]},
            {"name": "flux-schnell", "category": "image", "output_modalities": ["image"]},
            {"name": "nano-banana", "category": None, "input_modalities": ["text"], "output_modalities": ["image"]},
        ]
        opener = self._mock_opener(models)
        result = fetch_image_models("sk_test", requester=opener)
        names = [m["name"] for m in result]
        self.assertNotIn("wan-video", names)
        self.assertIn("flux-schnell", names)
        self.assertIn("nano-banana", names)

    def test_skips_non_image_non_none_category(self):
        models = [{"name": "gpt-4", "category": "chat", "output_modalities": ["text"]}]
        opener = self._mock_opener(models)
        self.assertEqual(fetch_image_models("sk_test", requester=opener), [])

    def test_normalizes_camel_case_keys(self):
        models = [{
            "name": "flux-2-pro",
            "category": "image",
            "inputModalities": ["text"],
            "outputModalities": ["image"],
            "paidOnly": True,
            "maxReferenceImages": 2,
        }]
        opener = self._mock_opener(models)
        result = fetch_image_models("sk_test", requester=opener)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["input_modalities"], ["text"])
        self.assertTrue(result[0]["paid_only"])

    def test_handles_wrapped_response(self):
        resp = {"data": [{"name": "flux-schnell", "category": "image", "output_modalities": ["image"]}]}
        opener = self._mock_opener(resp)
        result = fetch_image_models("sk_test", requester=opener)
        self.assertEqual(len(result), 1)


# ── HTTP helpers ───────────────────────────────────────────────────────────────


class TestHttpJson(unittest.TestCase):
    def test_success(self):
        opener = _make_json_opener({"ok": True})
        result = _http_json("http://example.com/api", opener=opener)
        self.assertEqual(result, {"ok": True})

    def test_http_error_raises(self):
        err_body = json.dumps({"error": {"message": "bad"}}).encode()
        resp = io.BytesIO(err_body)
        resp.status = 401

        def bad_opener(req, **kw):
            raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, io.BytesIO(err_body))
        with self.assertRaises(PollinationsError) as ctx:
            _http_json("http://example.com", opener=bad_opener)
        self.assertEqual(ctx.exception.status, 401)

    def test_network_error(self):
        def bad_opener(req, **kw):
            raise urllib.error.URLError("connection refused")
        with self.assertRaises(PollinationsError) as ctx:
            _http_json("http://example.com", opener=bad_opener)
        self.assertIn("network", ctx.exception.code)

    def test_timeout_error(self):
        def bad_opener(req, **kw):
            raise urllib.error.URLError(TimeoutError())
        with self.assertRaises(PollinationsError) as ctx:
            _http_json("http://example.com", opener=bad_opener)
        self.assertIn("timed out", str(ctx.exception).lower())


class TestHttpBytes(unittest.TestCase):
    def test_success(self):
        def fake_opener(req, **kw):
            return _fake_ctx(io.BytesIO(b"\x89PNGdata"))
        result = _http_bytes("http://example.com/image.png", opener=fake_opener)
        self.assertEqual(result, b"\x89PNGdata")

    def test_http_error(self):
        err_body = json.dumps({"error": {"code": "not_found"}}).encode()
        def bad_opener(req, **kw):
            raise urllib.error.HTTPError(req.full_url, 404, "Not Found", {}, io.BytesIO(err_body))
        with self.assertRaises(PollinationsError) as ctx:
            _http_bytes("http://example.com", opener=bad_opener)
        self.assertEqual(ctx.exception.status, 404)


# ── Device flow ────────────────────────────────────────────────────────────────


class TestDeviceFlow(unittest.TestCase):
    def test_start_device_flow(self):
        device_resp = {
            "device_code": "dc_test123",
            "user_code": "ABCD-1234",
            "verification_uri": "https://enter.pollinations.ai/device",
            "interval": 5,
            "expires_in": 600,
        }
        opener = _make_json_opener(device_resp)
        result = start_device_flow(requester=opener)
        self.assertEqual(result["device_code"], "dc_test123")
        self.assertEqual(result["user_code"], "ABCD-1234")

    def test_poll_device_token_success(self):
        device = {"device_code": "dc_xxx", "interval": 0.01, "expires_in": 5}
        approve_resp = {"access_token": "sk_approved_123456"}
        call_count = 0

        def mock_opener(req, **kw):
            nonlocal call_count
            call_count += 1
            body = json.dumps(approve_resp).encode()
            resp = io.BytesIO(body)
            resp.status = 200
            return _fake_ctx(resp)

        token = poll_device_token(device, requester=mock_opener, sleep_fn=lambda x: None)
        self.assertEqual(token, "sk_approved_123456")

    def test_poll_handles_authorization_pending(self):
        device = {"device_code": "dc_xxx", "interval": 0.001, "expires_in": 1}
        call_count = 0
        pending_resp = {"error": "authorization_pending"}

        def mock_opener(req, **kw):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                body = json.dumps(pending_resp).encode()
            else:
                body = json.dumps({"access_token": "sk_delayed_token"}).encode()
            resp = io.BytesIO(body)
            resp.status = 200
            return _fake_ctx(resp)

        token = poll_device_token(device, requester=mock_opener, sleep_fn=lambda x: None)
        self.assertEqual(token, "sk_delayed_token")

    def test_poll_handles_slow_down(self):
        device = {"device_code": "dc_xxx", "interval": 0.001, "expires_in": 2}
        call_count = 0

        def mock_opener(req, **kw):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                body = json.dumps({"error": "slow_down"}).encode()
            elif call_count == 2:
                body = json.dumps({"error": "authorization_pending"}).encode()
            else:
                body = json.dumps({"access_token": "sk_slow_token"}).encode()
            resp = io.BytesIO(body)
            resp.status = 200
            return _fake_ctx(resp)

        token = poll_device_token(device, requester=mock_opener, sleep_fn=lambda x: None)
        self.assertEqual(token, "sk_slow_token")

    def test_poll_expired(self):
        device = {"device_code": "dc_xxx", "interval": 0.001, "expires_in": 0.001}
        monotonic_val = [0.0]

        def fake_monotonic():
            return monotonic_val[0]
        def fake_sleep(d):
            monotonic_val[0] += d + 1.0

        with self.assertRaises(PollinationsError) as ctx:
            poll_device_token(
                device,
                requester=_make_json_opener({"error": "authorization_pending"}),
                sleep_fn=fake_sleep,
                monotonic=fake_monotonic,
            )
        self.assertEqual(ctx.exception.code, "expired_token")


# ── generate_image ─────────────────────────────────────────────────────────────


class TestGenerateImage(unittest.TestCase):
    def test_success(self):
        def fake_opener(req, **kw):
            return _fake_ctx(io.BytesIO(b"\x89PNG_fakedata"))
        result = generate_image("sk_test12345", "a cat", "flux-schnell", requester=fake_opener)
        self.assertEqual(result, b"\x89PNG_fakedata")

    def test_http_error_raises(self):
        err_body = json.dumps({"error": {"message": "rate limit", "code": "rate_limited"}}).encode()
        def bad_opener(req, **kw):
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many", {}, io.BytesIO(err_body))
        with self.assertRaises(PollinationsError) as ctx:
            generate_image("sk_test12345", "cat", "flux", requester=bad_opener)
        self.assertEqual(ctx.exception.status, 429)


# ── edit_image ─────────────────────────────────────────────────────────────────


class TestEditImage(unittest.TestCase):
    def test_success(self):
        fake_png = b"\x89PNG_fakedata"
        fake_resp = {"data": [{"b64_json": base64.b64encode(fake_png).decode()}]}

        def fake_opener(req, **kw):
            assert b"Content-Disposition" in req.data
            assert b"layer.png" in req.data
            assert b"image/png" in req.data
            return _fake_ctx(io.BytesIO(json.dumps(fake_resp).encode()))

        result = edit_image("sk_test12345", "make it blue", "flux-kontext", b"\x89PNGsource", requester=fake_opener)
        self.assertEqual(result, fake_png)

    def test_bad_response(self):
        def fake_opener(req, **kw):
            return _fake_ctx(io.BytesIO(json.dumps({"data": []}).encode()))
        with self.assertRaises(PollinationsError):
            edit_image("sk_test12345", "edit", "model", b"\x89PNGsrc", requester=fake_opener)

    def test_user_agent_header(self):
        captured = {}
        def fake_opener(req, **kw):
            captured["ua"] = req.headers.get("User-agent")
            return _fake_ctx(io.BytesIO(json.dumps({"data": [{"b64_json": "dGVzdA=="}]}).encode()))
        edit_image("sk_test12345", "x", "m", b"\x89PNG", requester=fake_opener)
        self.assertIn("pollinations-gimp/", captured["ua"])


if __name__ == "__main__":
    unittest.main()
