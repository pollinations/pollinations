"""
Unit tests for the pure-Python helper functions in pollinations_gimp.py.

These tests run without GIMP or a network connection.
Run with:
    python -m pytest apps/gimp-plugin/tests/ -v
    # or
    python -m unittest discover -s apps/gimp-plugin/tests -v
"""

from __future__ import annotations

import base64
import importlib.util
import json
import sys
import types
import unittest
import urllib.error
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Stub out the gi / GIMP bindings so the module can be imported without GIMP
# ---------------------------------------------------------------------------

_gi_stub = types.ModuleType("gi")
_gi_stub.require_version = lambda *a, **k: None
sys.modules["gi"] = _gi_stub

for _mod in (
    "gi.repository",
    "gi.repository.Gimp",
    "gi.repository.GimpUi",
    "gi.repository.Gtk",
    "gi.repository.GLib",
    "gi.repository.Gio",
):
    sys.modules[_mod] = MagicMock()

# GLib.get_user_config_dir must return a real string path
sys.modules["gi.repository.GLib"].get_user_config_dir = lambda: "/tmp/test_gimp_config"

# ---------------------------------------------------------------------------
# Import the module under test
# ---------------------------------------------------------------------------

_plugin_path = Path(__file__).parent.parent / "pollinations_gimp.py"
_spec = importlib.util.spec_from_file_location("pollinations_gimp", _plugin_path)
_mod = importlib.util.module_from_spec(_spec)
# Prevent Gimp.main() at module level from executing during import
with patch.object(_mod, "__name__", "pollinations_gimp"):
    # Pre-populate sys.modules so relative imports resolve
    sys.modules["pollinations_gimp"] = _mod
    _spec.loader.exec_module(_mod)

# Convenient re-exports
load_token = _mod.load_token
save_token = _mod.save_token
delete_token = _mod.delete_token
fetch_models = _mod.fetch_models
models_with_image_input = _mod.models_with_image_input
generate_image = _mod.generate_image
ENTER_BASE = _mod.ENTER_BASE
GEN_BASE = _mod.GEN_BASE
APP_KEY = _mod.APP_KEY


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestTokenPersistence(unittest.TestCase):
    """save_token / load_token / delete_token round-trip."""

    def setUp(self):
        import tempfile

        self._tmp = tempfile.mkdtemp()
        token_dir = Path(self._tmp) / "pollinations"
        # Patch the private module-level paths
        self._orig_dir = _mod._TOKEN_DIR
        self._orig_file = _mod._TOKEN_FILE
        _mod._TOKEN_DIR = token_dir
        _mod._TOKEN_FILE = token_dir / "token.json"

    def tearDown(self):
        import shutil

        shutil.rmtree(self._tmp, ignore_errors=True)
        _mod._TOKEN_DIR = self._orig_dir
        _mod._TOKEN_FILE = self._orig_file

    def test_no_token_returns_none(self):
        self.assertIsNone(load_token())

    def test_save_and_load_roundtrip(self):
        save_token("sk_test_abc123")
        self.assertEqual(load_token(), "sk_test_abc123")

    def test_delete_removes_token(self):
        save_token("sk_test_abc123")
        delete_token()
        self.assertIsNone(load_token())

    def test_delete_nonexistent_does_not_raise(self):
        delete_token()  # must not raise FileNotFoundError

    def test_token_file_contains_access_token_key(self):
        save_token("sk_hello")
        raw = json.loads(_mod._TOKEN_FILE.read_text())
        self.assertIn("access_token", raw)
        self.assertEqual(raw["access_token"], "sk_hello")

    def test_corrupted_file_returns_none(self):
        _mod._TOKEN_DIR.mkdir(parents=True, exist_ok=True)
        _mod._TOKEN_FILE.write_text("not-json{{")
        self.assertIsNone(load_token())


class TestModelFiltering(unittest.TestCase):
    """models_with_image_input filters to image-capable models."""

    _SAMPLE = [
        {"id": "flux", "title": "FLUX", "inputModalities": ["text"], "outputModalities": ["image"]},
        {"id": "kontext", "title": "FLUX Kontext", "inputModalities": ["text", "image"], "outputModalities": ["image"]},
        {"id": "flux-2-pro", "title": "FLUX.2 Pro", "inputModalities": ["text", "image"], "outputModalities": ["image"]},
        {"id": "veo", "title": "Veo", "inputModalities": ["text"], "outputModalities": ["video"]},
    ]

    def test_returns_only_image_input_models(self):
        result = models_with_image_input(self._SAMPLE)
        ids = [m["id"] for m in result]
        self.assertIn("kontext", ids)
        self.assertIn("flux-2-pro", ids)
        self.assertNotIn("flux", ids)
        self.assertNotIn("veo", ids)

    def test_empty_list_returns_empty(self):
        self.assertEqual(models_with_image_input([]), [])

    def test_no_image_input_models_returns_empty(self):
        text_only = [{"id": "flux", "inputModalities": ["text"]}]
        self.assertEqual(models_with_image_input(text_only), [])

    def test_model_without_inputModalities_key_is_excluded(self):
        models = [{"id": "mystery"}]
        self.assertEqual(models_with_image_input(models), [])


class TestFetchModels(unittest.TestCase):
    """fetch_models parses the OpenAI-compatible /image/models response."""

    _RESPONSE = {
        "object": "list",
        "data": [
            {"id": "flux", "title": "FLUX", "inputModalities": ["text"]},
            {"id": "kontext", "title": "FLUX Kontext", "inputModalities": ["text", "image"]},
        ],
    }

    def _fake_urlopen(self, req, timeout=20):
        body = json.dumps(self._RESPONSE).encode()
        resp = MagicMock()
        resp.__enter__ = lambda s: s
        resp.__exit__ = MagicMock(return_value=False)
        resp.read = lambda: body
        return resp

    def test_parses_data_array(self):
        with patch("urllib.request.urlopen", side_effect=self._fake_urlopen):
            models = fetch_models("sk_test")
        self.assertEqual(len(models), 2)
        self.assertEqual(models[0]["id"], "flux")

    def test_network_error_returns_empty_list(self):
        def _raise(*a, **k):
            raise OSError("no network")

        with patch("urllib.request.urlopen", side_effect=_raise):
            models = fetch_models("sk_test")
        self.assertEqual(models, [])

    def test_request_carries_authorization_header(self):
        captured = {}

        def _capture(req, timeout=20):
            captured["auth"] = req.get_header("Authorization")
            resp = MagicMock()
            resp.__enter__ = lambda s: s
            resp.__exit__ = MagicMock(return_value=False)
            resp.read = lambda: json.dumps(self._RESPONSE).encode()
            return resp

        with patch("urllib.request.urlopen", side_effect=_capture):
            fetch_models("sk_mytoken")
        self.assertEqual(captured["auth"], "Bearer sk_mytoken")


class TestGenerateImageRequest(unittest.TestCase):
    """generate_image builds the correct POST request."""

    def _make_fake_urlopen(self, response_bytes=b"\x89PNG\r\n"):
        def _fake(req, timeout=120):
            self._captured_req = req
            resp = MagicMock()
            resp.__enter__ = lambda s: s
            resp.__exit__ = MagicMock(return_value=False)
            resp.read = lambda: response_bytes
            return resp

        return _fake

    def test_prompt_is_url_encoded_in_path(self):
        fake = self._make_fake_urlopen()
        with patch("urllib.request.urlopen", side_effect=fake):
            generate_image("a cat & dog", "flux", "sk_tok")
        self.assertIn("a%20cat%20%26%20dog", self._captured_req.full_url)

    def test_model_in_json_body(self):
        fake = self._make_fake_urlopen()
        with patch("urllib.request.urlopen", side_effect=fake):
            generate_image("test", "kontext", "sk_tok")
        body = json.loads(self._captured_req.data)
        self.assertEqual(body["model"], "kontext")

    def test_size_included_when_provided(self):
        fake = self._make_fake_urlopen()
        with patch("urllib.request.urlopen", side_effect=fake):
            generate_image("test", "flux", "sk_tok", width=512, height=768)
        body = json.loads(self._captured_req.data)
        self.assertEqual(body["width"], 512)
        self.assertEqual(body["height"], 768)

    def test_size_omitted_when_not_provided(self):
        fake = self._make_fake_urlopen()
        with patch("urllib.request.urlopen", side_effect=fake):
            generate_image("test", "flux", "sk_tok")
        body = json.loads(self._captured_req.data)
        self.assertNotIn("width", body)
        self.assertNotIn("height", body)

    def test_data_uri_sent_for_image_input(self):
        fake = self._make_fake_urlopen()
        png_bytes = b"\x89PNG\r\n\x1a\n"
        b64 = base64.b64encode(png_bytes).decode()
        with patch("urllib.request.urlopen", side_effect=fake):
            generate_image("stylize", "kontext", "sk_tok", input_image_b64=b64)
        body = json.loads(self._captured_req.data)
        self.assertTrue(body["image"].startswith("data:image/png;base64,"))
        decoded = base64.b64decode(body["image"].split(",", 1)[1])
        self.assertEqual(decoded, png_bytes)

    def test_no_image_field_when_no_input_image(self):
        fake = self._make_fake_urlopen()
        with patch("urllib.request.urlopen", side_effect=fake):
            generate_image("test", "flux", "sk_tok")
        body = json.loads(self._captured_req.data)
        self.assertNotIn("image", body)

    def test_authorization_header_set(self):
        fake = self._make_fake_urlopen()
        with patch("urllib.request.urlopen", side_effect=fake):
            generate_image("test", "flux", "sk_mykey")
        self.assertEqual(
            self._captured_req.get_header("Authorization"), "Bearer sk_mykey"
        )

    def test_http_error_propagates(self):
        def _raise(*a, **k):
            raise urllib.error.HTTPError(
                url="x", code=402, msg="Payment Required", hdrs={}, fp=BytesIO(b"need pollen")
            )

        with patch("urllib.request.urlopen", side_effect=_raise):
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                generate_image("test", "flux", "sk_tok")
        self.assertEqual(ctx.exception.code, 402)


class TestAppKeyAndUrls(unittest.TestCase):
    """Smoke-check constants."""

    def test_enter_base_is_https(self):
        self.assertTrue(ENTER_BASE.startswith("https://"))

    def test_gen_base_is_https(self):
        self.assertTrue(GEN_BASE.startswith("https://"))

    def test_app_key_is_publishable(self):
        # Publishable keys start with pk_
        self.assertTrue(APP_KEY.startswith("pk_"), f"Expected pk_ prefix, got {APP_KEY!r}")


if __name__ == "__main__":
    unittest.main()
