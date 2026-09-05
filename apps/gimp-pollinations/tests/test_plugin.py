"""Unit tests for the Pollinations GIMP plug-in.

Run without GIMP or a network connection:

    python3 -m unittest discover -s apps/gimp-pollinations/tests -v
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
import urllib.error
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

# ── Stub gi/GIMP bindings so the plug-in module imports headlessly ──────────
_gi = types.ModuleType("gi")
_gi.require_version = lambda *a, **k: None
sys.modules["gi"] = _gi

_glib = MagicMock()
_glib.get_user_config_dir = lambda: tempfile.mkdtemp(prefix="gimp-cfg-")
for _name, _obj in (
    ("gi.repository", MagicMock(GLib=_glib)),
    ("gi.repository.GLib", _glib),
    ("gi.repository.Gimp", MagicMock()),
    ("gi.repository.GimpUi", MagicMock()),
    ("gi.repository.Gtk", MagicMock()),
    ("gi.repository.Gio", MagicMock()),
):
    sys.modules[_name] = _obj

_PLUGIN = Path(__file__).resolve().parent.parent / "pollinations_gimp.py"
_spec = importlib.util.spec_from_file_location("pollinations_gimp", _PLUGIN)
pg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pg)


def _http_error(code: int, payload: dict | str) -> urllib.error.HTTPError:
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return urllib.error.HTTPError(
        "https://example.test", code, "err", {}, BytesIO(body))


class AuthStoreTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.patch = patch.object(pg, "TOKEN_FILE", Path(self.dir) / "auth.json")
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_roundtrip_and_clear(self):
        self.assertIsNone(pg.load_auth())
        pg.save_auth("sk_test", "alice")
        self.assertEqual(pg.load_auth(), {"token": "sk_test", "user": "alice"})
        pg.clear_auth()
        self.assertIsNone(pg.load_auth())

    def test_corrupt_file_is_not_connected(self):
        pg.TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        pg.TOKEN_FILE.write_text("{not json")
        self.assertIsNone(pg.load_auth())

    def test_token_file_is_private(self):
        pg.save_auth("sk_test", None)
        self.assertEqual(pg.TOKEN_FILE.stat().st_mode & 0o777, 0o600)


class ErrorClassificationTests(unittest.TestCase):
    def test_expired_or_missing_authorization(self):
        for code in (401, 403):
            msg = pg.error_message(_http_error(code, {"error": {"code": "UNAUTHORIZED"}}))
            self.assertIn("Connect Account", msg)

    def test_insufficient_pollen_shows_cost(self):
        err = {"error": {"code": "PAYMENT_REQUIRED",
                         "message": "Insufficient balance. This request costs ~0.04 pollen"}}
        msg = pg.error_message(_http_error(402, err))
        self.assertIn("Top up", msg)
        self.assertIn("0.04", msg)

    def test_network_failure(self):
        msg = pg.error_message(urllib.error.URLError("no route to host"))
        self.assertIn("Network error", msg)

    def test_generic_api_error(self):
        msg = pg.error_message(_http_error(400, {"error": {"code": "BAD_REQUEST",
                                                           "message": "width too small"}}))
        self.assertIn("BAD_REQUEST", msg)
        self.assertIn("width too small", msg)

    def test_non_json_body_still_reported(self):
        msg = pg.error_message(_http_error(500, b"boom"))
        self.assertIn("500", msg)


class DeviceFlowTests(unittest.TestCase):
    def test_request_sends_app_key(self):
        with patch.object(pg, "json_request", return_value={"user_code": "ABCD-1234",
                                                            "device_code": "dc"}) as mock:
            resp = pg.request_device_code()
        self.assertEqual(resp["user_code"], "ABCD-1234")
        url, kwargs = mock.call_args[0][0], mock.call_args[1]
        self.assertTrue(url.startswith(pg.ENTER_BASE))
        self.assertEqual(json.loads(kwargs["body"])["client_id"], pg.APP_KEY)

    def test_poll_returns_none_while_pending(self):
        exc = _http_error(400, {"error": "authorization_pending"})
        with patch.object(pg, "json_request", side_effect=exc):
            self.assertIsNone(pg.poll_device_token("dc"))

    def test_poll_returns_token_when_approved(self):
        with patch.object(pg, "json_request", return_value={"access_token": "sk_x"}):
            self.assertEqual(pg.poll_device_token("dc"), "sk_x")

    def test_poll_raises_on_denied(self):
        exc = _http_error(400, {"error": "access_denied",
                                "error_description": "user said no"})
        with patch.object(pg, "json_request", side_effect=exc):
            with self.assertRaises(RuntimeError):
                pg.poll_device_token("dc")


class CatalogTests(unittest.TestCase):
    MODELS = [
        {"name": "flux", "title": "FLUX.1", "output_modalities": ["image"],
         "input_modalities": ["text"], "pricing": {"completionImageTokens": "0.005"}},
        {"name": "kontext", "title": "FLUX Kontext", "output_modalities": ["image"],
         "input_modalities": ["text", "image"]},
        {"name": "wan-pro", "output_modalities": ["video"], "input_modalities": ["text"]},
    ]

    def test_only_image_output_models(self):
        with patch.object(pg, "json_request", return_value=self.MODELS):
            got = [m["name"] for m in pg.fetch_models("sk")]
        self.assertEqual(got, ["flux", "kontext"])

    def test_editing_pool_uses_input_modalities(self):
        editable = [m for m in self.MODELS if pg.supports_image_input(m)]
        self.assertEqual([m["name"] for m in editable], ["kontext"])

    def test_label_shows_price_when_present(self):
        self.assertIn("0.005", pg.model_label(self.MODELS[0]))
        self.assertEqual(pg.model_label(self.MODELS[1]), "FLUX Kontext")


class RequestShapeTests(unittest.TestCase):
    def test_generate_url_encodes_prompt_and_params(self):
        url = pg.build_generate_url("a cat & a dog", "flux", 1024, 512)
        self.assertIn("a%20cat%20%26%20a%20dog", url)
        self.assertIn("model=flux", url)
        self.assertIn("width=1024", url)
        self.assertIn("height=512", url)

    def test_generate_url_omits_missing_size(self):
        url = pg.build_generate_url("x", "flux", None, None)
        self.assertNotIn("width", url)
        self.assertTrue(url.startswith(pg.GEN_BASE + "/image/x?model=flux"))


if __name__ == "__main__":
    unittest.main()
