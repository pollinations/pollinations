"""Legacy model IDs remain valid when catalogs switch to publisher-prefixed IDs."""

import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

from floret.routing import RoutingInput, RoutingValidationError, validate_routing
from floret.tools.gen import generate_video


class ModelAliasTests(unittest.IsolatedAsyncioTestCase):
    async def test_routing_accepts_alias_without_rewriting_requested_model(self):
        catalog = {
            "publisher/image": {
                "aliases": ["old-image"],
                "category": "image",
                "input_modalities": ["text"],
                "output_modalities": ["image"],
                "supported_endpoints": ["/image/{prompt}"],
            }
        }
        with patch(
            "floret.routing.fetch_model_catalog", AsyncMock(return_value=catalog)
        ):
            for model in ["publisher/image", "old-image"]:
                preferences = await validate_routing(
                    RoutingInput(image_generation=model)
                )
                self.assertEqual(preferences.image_generation, model)
            with self.assertRaises(RoutingValidationError):
                await validate_routing(RoutingInput(image_generation="unknown-image"))
            with self.assertRaises(RoutingValidationError):
                await validate_routing(RoutingInput(video="old-image"))
        self.assertEqual(list(catalog), ["publisher/image"])

    async def test_exact_model_id_takes_precedence_over_alias(self):
        catalog = {
            "publisher/image": {"aliases": ["chosen"], "category": "image"},
            "chosen": {
                "category": "text",
                "output_modalities": ["text"],
                "supported_endpoints": ["/v1/chat/completions"],
            },
        }
        with patch(
            "floret.routing.fetch_model_catalog", AsyncMock(return_value=catalog)
        ):
            self.assertEqual(
                (await validate_routing(RoutingInput(text="chosen"))).text, "chosen"
            )

    async def test_veo_reference_frame_duration_for_legacy_and_canonical_ids(self):
        for model in ["veo", "veo-fast", "google/veo-3.1", "google/veo-3.1-fast"]:
            for requested, expected in [(4, "4"), (5, "4"), (7, "6"), (8, "8")]:
                url = await generate_video(
                    "boat drifts",
                    model=model,
                    image="https://example.com/start.jpg",
                    duration=requested,
                )
                params = parse_qs(urlparse(url).query)
                self.assertEqual(params["duration"], [expected])
                self.assertEqual(params["model"], [model])

    async def test_other_video_requests_keep_duration(self):
        for model, image in [
            ("google/veo-3.1", None),
            ("wan/wan-2.2", "https://example.com/start.jpg"),
        ]:
            url = await generate_video(
                "boat drifts", model=model, image=image, duration=5
            )
            self.assertEqual(parse_qs(urlparse(url).query)["duration"], ["5"])
