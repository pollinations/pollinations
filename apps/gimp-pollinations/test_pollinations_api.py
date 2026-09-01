"""
Focused tests for pollinations_api.py — no GIMP needed.
Run: python -m pytest apps/gimp-pollinations/test_pollinations_api.py -v
"""

import json
import urllib.error
from unittest.mock import MagicMock, patch

import pollinations_api as api


def _mock_response(data: dict, status: int = 200, ctype: str = "application/json"):
    mock = MagicMock()
    mock.status = status
    mock.headers = {"Content-Type": ctype}
    mock.read.return_value = json.dumps(data).encode()
    mock.__enter__ = lambda s: s
    mock.__exit__ = lambda *a: False
    return mock


def test_request_device_code_parses():
    with patch("pollinations_api._request_json") as mock:
        mock.return_value = {
            "device_code": "dc123",
            "user_code": "ABCD-1234",
            "verification_uri": "https://enter.pollinations.ai/device",
            "verification_uri_complete": "https://enter.pollinations.ai/device?user_code=ABCD-1234",
            "expires_in": 300,
            "interval": 5,
        }
        dc = api.request_device_code("pk_test")
        assert dc.device_code == "dc123"
        assert dc.user_code == "ABCD-1234"
        assert dc.interval == 5


def test_poll_for_token_success():
    with patch("pollinations_api._request_json") as mock:
        mock.side_effect = [
            {"error": "authorization_pending"},
            {"access_token": "sk_test123"},
        ]
        token = api.poll_for_token("dc123", interval=0, timeout=10)
        assert token == "sk_test123"


def test_list_models_parses():
    with patch("pollinations_api._request_json") as mock:
        mock.return_value = {
            "data": [
                {"id": "turbo", "name": "Turbo", "input_modalities": ["text"]},
                {"id": "kontext", "name": "Kontext", "input_modalities": ["text", "image"]},
            ]
        }
        models = api.list_image_models("sk_test")
        assert len(models) == 2
        assert models[0].id == "turbo"
        assert models[1].id == "kontext"
        assert api.model_supports_image_input(models[1]) is True
        assert api.model_supports_image_input(models[0]) is False


def test_model_supports_image_input():
    m_yes = api.ModelInfo(id="a", name="a", description="", input_modalities=["image", "text"])
    m_no = api.ModelInfo(id="b", name="b", description="", input_modalities=["text"])
    assert api.model_supports_image_input(m_yes) is True
    assert api.model_supports_image_input(m_no) is False


def test_pollinations_error_has_hint():
    err = api.PollinationsError("Expired", hint="Reconnect")
    assert "Expired" in str(err)
    assert err.hint == "Reconnect"


def test_generate_image_handles_401():
    with patch("pollinations_api._request_json") as mock:
        # Simulate 401
        e = urllib.error.HTTPError(
            "https://gen.pollinations.ai/v1/images/generations",
            401,
            "Unauthorized",
            {},
            None,
        )
        e.read = lambda: b'{"error": "unauthorized"}'
        e.fp = MagicMock(read=lambda: b'{"error": "unauthorized"}')
        mock.side_effect = e
        try:
            api.generate_image("sk_bad", "turbo", "hello")
            assert False, "should have raised"
        except api.PollinationsError as err:
            assert "expired" in str(err).lower() or "unauthorized" in str(err).lower()


if __name__ == "__main__":
    test_request_device_code_parses()
    print("PASS test_request_device_code_parses")
    test_poll_for_token_success()
    print("PASS test_poll_for_token_success")
    test_list_models_parses()
    print("PASS test_list_models_parses")
    test_model_supports_image_input()
    print("PASS test_model_supports_image_input")
    test_pollinations_error_has_hint()
    print("PASS test_pollinations_error_has_hint")
    test_generate_image_handles_401()
    print("PASS test_generate_image_handles_401")
    print("All focused tests passed.")
