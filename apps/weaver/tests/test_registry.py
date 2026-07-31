from __future__ import annotations

import pytest

from weaver import registry


@pytest.mark.parametrize(
    ("inputs", "outputs", "endpoints", "expected"),
    [
        (
            ["text"],
            ["text"],
            ["/v1/chat/completions"],
            ["text"],
        ),
        (
            ["text"],
            ["image"],
            ["/image/{prompt}"],
            ["image"],
        ),
        (
            ["text", "image"],
            ["video", "audio"],
            ["/image/{prompt}"],
            ["video"],
        ),
        (
            ["text"],
            ["audio"],
            ["/audio/{text}"],
            ["audio"],
        ),
        (
            ["audio"],
            ["text"],
            ["/audio/{text}"],
            ["transcript"],
        ),
        (
            ["text", "audio"],
            ["text", "audio"],
            ["/v1/chat/completions"],
            ["text", "audio", "transcript"],
        ),
        (
            ["text"],
            ["embedding"],
            ["/v1/embeddings"],
            ["embedding"],
        ),
        (
            ["audio"],
            ["audio"],
            ["/v1/audio/voice-changer"],
            [],
        ),
    ],
)
def test_model_modalities_follow_gateway_metadata(inputs, outputs, endpoints, expected):
    item = {
        "input_modalities": inputs,
        "output_modalities": outputs,
        "supported_endpoints": endpoints,
    }
    assert registry._model_modalities(item) == expected


def test_model_names_do_not_override_declared_modalities():
    normalized = registry._normalize(
        {
            "data": [
                {
                    "id": "wan-image",
                    "input_modalities": ["text", "image"],
                    "output_modalities": ["image"],
                    "supported_endpoints": ["/image/{prompt}"],
                },
                {
                    "id": "community-model-with-no-video-keyword",
                    "input_modalities": ["text", "image"],
                    "output_modalities": ["video"],
                    "supported_endpoints": ["/image/{prompt}"],
                },
            ]
        }
    )

    assert set(normalized["by_modality"]["image"]) == {"wan-image"}
    assert set(normalized["by_modality"]["video"]) == {
        "community-model-with-no-video-keyword"
    }
