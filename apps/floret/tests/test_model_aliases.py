"""Legacy model IDs remain valid when catalogs switch to publisher-prefixed IDs."""

import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

from floret import registry
from floret.routing import RoutingInput, RoutingValidationError, validate_routing
from floret.tools.gen import generate_video, supports_end_frame


class ModelAliasTests(unittest.IsolatedAsyncioTestCase):
    async def test_alias_keeps_video_capabilities_and_requested_route(self):
        canonical = "bytedance/seedance-2.0-fast"
        alias = "seedance-2.0-fast"
        cache = registry._normalize(
            {
                "data": [
                    {
                        "id": canonical,
                        "aliases": [alias],
                        "category": "video",
                        "output_modalities": ["video"],
                        "video_capabilities": ["start_frame", "end_frame"],
                    }
                ]
            }
        )
        with patch.object(registry, "_registry_cache", cache):
            for model in [canonical, alias]:
                self.assertEqual(registry.get_modalities_for_model(model), ["video"])
                self.assertEqual(registry.get_model_meta(model)["id"], canonical)
                self.assertTrue(supports_end_frame(model))
                url = await generate_video(
                    "boat drifts",
                    model=model,
                    image="https://example.com/start.jpg",
                    end_image="https://example.com/end.jpg",
                )
                self.assertEqual(parse_qs(urlparse(url).query)["model"], [model])
            self.assertEqual(registry.get_model_meta("missing"), {})
            self.assertEqual(registry.get_model_params("missing"), {})
            self.assertEqual(registry.get_modalities_for_model("missing"), [])
            self.assertFalse(supports_end_frame("missing"))

    async def test_registry_exact_id_beats_an_alias(self):
        cache = registry._normalize(
            {
                "data": [
                    {
                        "id": "publisher/video",
                        "aliases": ["chosen"],
                        "category": "video",
                        "output_modalities": ["video"],
                        "video_capabilities": ["end_frame"],
                    },
                    {"id": "chosen", "category": "text", "output_modalities": ["text"]},
                ]
            }
        )
        with patch.object(registry, "_registry_cache", cache):
            self.assertEqual(registry.get_model_meta("chosen")["id"], "chosen")
            self.assertEqual(registry.get_modalities_for_model("chosen"), ["text"])
            self.assertFalse(supports_end_frame("chosen"))

    async def test_typography_priority_survives_catalog_rename(self):
        for renamed in [False, True]:
            preferred = "openai/gpt-image-1" if renamed else "gptimage"
            cache = registry._normalize(
                {
                    "data": [
                        {
                            "id": "z-image",
                            "category": "image",
                            "output_modalities": ["image"],
                            "supported_endpoints": ["/image/{prompt}"],
                        },
                        {
                            "id": preferred,
                            "aliases": ["gptimage"] if renamed else [],
                            "category": "image",
                            "output_modalities": ["image"],
                            "supported_endpoints": ["/image/{prompt}"],
                        },
                    ]
                }
            )
            with patch.object(registry, "_registry_cache", cache):
                self.assertEqual(
                    registry.pick_model("image", prompt="poster with text"), preferred
                )
                self.assertEqual(
                    registry.pick_model("image", prompt="a flower"), "z-image"
                )
                self.assertEqual(len(registry.get_model_catalog()), 2)
                # Resolving preferences must not bypass the existing paid filter.
                cache["models"][preferred]["pricing"] = {"completion": 1}
                self.assertEqual(
                    registry.pick_model("image", prompt="poster with text", paid=False),
                    "z-image",
                )

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
