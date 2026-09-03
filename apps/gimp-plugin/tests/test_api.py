import json
import urllib.error
from unittest.mock import MagicMock, patch

import pytest
from pollinations_core.api import (
    ModelInfo,
    PollinationsAPIClient,
    PollinationsAuthError,
)


def test_model_info_capabilities_parsing():
    txt_model = ModelInfo({
        "name": "flux",
        "title": "FLUX.1 Schnell",
        "description": "Text to image model",
        "input_modalities": ["text"],
        "output_modalities": ["image"],
        "community": False,
    })
    assert txt_model.name == "flux"
    assert txt_model.supports_image_input is False

    edit_model = ModelInfo({
        "name": "kontext",
        "title": "FLUX.1 Kontext Pro",
        "description": "Image editing model",
        "input_modalities": ["text", "image"],
        "output_modalities": ["image"],
        "community": False,
        "supported_endpoints": ["/v1/images/edits"]
    })
    assert edit_model.name == "kontext"
    assert edit_model.supports_image_input is True

    community_model = ModelInfo({
        "name": "MarcosFRG/flux-2-klein-4b",
        "title": "FLUX.2 Klein 4B",
        "input_modalities": ["text", "image"],
        "output_modalities": ["image"],
        "community": True,
    })
    assert community_model.community is True
    assert community_model.supports_image_input is True


@patch("urllib.request.urlopen")
def test_fetch_image_models(mock_urlopen):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps([
        {
            "name": "flux",
            "title": "FLUX.1 Schnell",
            "category": "image",
            "input_modalities": ["text"],
            "output_modalities": ["image"],
        },
        {
            "name": "klein",
            "title": "FLUX.2 Klein",
            "category": "image",
            "input_modalities": ["text", "image"],
            "output_modalities": ["image"],
        },
        {
            "name": "wan",
            "title": "Wan 2.6",
            "category": "video",
            "input_modalities": ["text"],
            "output_modalities": ["video"],
        }
    ]).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    client = PollinationsAPIClient(token="sk_test")
    models = client.fetch_image_models()

    assert len(models) == 2
    assert models[0].name == "flux"
    assert models[1].name == "klein"


@patch("urllib.request.urlopen")
def test_generate_image_b64_response(mock_urlopen):
    mock_resp = MagicMock()
    # Mock base64 response for 1x1 image
    b64_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    mock_resp.read.return_value = json.dumps({
        "data": [{"b64_json": b64_data}]
    }).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    client = PollinationsAPIClient(token="sk_test")
    img_bytes = client.generate_image(prompt="a glowing flower", model="flux", seed=42)

    assert len(img_bytes) > 0
    assert img_bytes.startswith(b"\x89PNG")


@patch("urllib.request.urlopen")
def test_generate_image_auth_error(mock_urlopen):
    http_err = urllib.error.HTTPError(
        url="https://gen.pollinations.ai/v1/images/generations",
        code=401,
        msg="Unauthorized",
        hdrs={},
        fp=MagicMock(read=MagicMock(return_value=b"Invalid API key"))
    )
    mock_urlopen.side_effect = http_err

    client = PollinationsAPIClient(token="sk_invalid")
    with pytest.raises(PollinationsAuthError):
        client.generate_image(prompt="test", model="flux")


@patch("urllib.request.urlopen")
def test_edit_image_request(mock_urlopen):
    mock_resp = MagicMock()
    b64_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    mock_resp.read.return_value = json.dumps({
        "data": [{"b64_json": b64_data}]
    }).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp
    mock_urlopen.return_value = mock_resp

    client = PollinationsAPIClient(token="sk_test")
    input_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
    edited_bytes = client.edit_image(
        image_bytes=input_png,
        prompt="make it cyberpunk",
        model="kontext",
        seed=123
    )

    assert len(edited_bytes) > 0
    assert edited_bytes.startswith(b"\x89PNG")
