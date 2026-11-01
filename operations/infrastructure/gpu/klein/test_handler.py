"""CPU tests; install this folder's requirements.txt plus httpx.

Repo root: python3 -m unittest operations/infrastructure/gpu/klein/test_handler.py
This folder: python3 -m unittest test_handler
"""

import base64
import os
import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock, patch

from diffusers import Flux2KleinPipeline
from diffusers.pipelines.flux2.image_processor import Flux2ImageProcessor
from fastapi.testclient import TestClient
from PIL import Image


# Keep real HTTP handling, Pillow decoding and the pinned Diffusers validator.
# Only model loading/inference is replaced so this regression runs without CUDA.
pipeline = Mock(image_processor=Flux2ImageProcessor())
pipeline.to.return_value = pipeline
with (
    patch.dict(os.environ, {"PLN_GPU_TOKEN": "local-test-token"}),
    patch.object(Flux2KleinPipeline, "from_pretrained", return_value=pipeline),
):
    if __package__:
        from . import handler
    else:
        import handler


def reference(width, height):
    buffer = BytesIO()
    Image.new("RGB", (width, height), "blue").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


class KleinInputTest(unittest.TestCase):
    def setUp(self):
        pipeline.reset_mock()

        def inference(**kwargs):
            images = kwargs["image"]
            images = images if isinstance(images, list) else [images] if images else []
            for image in images:
                pipeline.image_processor.check_image_input(image)
            return SimpleNamespace(images=[Image.new("RGB", (256, 256), "green")])

        pipeline.side_effect = inference
        self.client = TestClient(handler.app, raise_server_exceptions=False)
        generator = handler.torch.Generator
        self.generator_patch = patch.object(
            handler.torch, "Generator", side_effect=lambda **_: generator(device="cpu")
        )
        self.generator = self.generator_patch.start()
        self.addCleanup(self.generator_patch.stop)
        self.addCleanup(self.client.close)

    def generate(self, images):
        return self.client.post(
            "/generate",
            headers={"x-backend-token": "local-test-token"},
            json={
                "prompts": ["A green sphere"],
                "images": images,
                "width": 256,
                "height": 256,
                "seed": 42,
            },
        )

    def test_small_references_return_actionable_400_before_inference(self):
        for size in [(63, 52), (63, 64), (64, 63)]:
            with self.subTest(size=size):
                response = self.generate([reference(*size)])
                self.assertEqual(response.status_code, 400)
                self.assertIn("at least 64px", response.json()["detail"])
        pipeline.assert_not_called()
        self.generator.assert_not_called()

    def test_valid_first_reference_does_not_hide_invalid_later_reference(self):
        response = self.generate([reference(128, 128), reference(57, 59)])
        self.assertEqual(response.status_code, 400)
        self.assertIn("57×59", response.json()["detail"])
        pipeline.assert_not_called()

    def test_extreme_aspect_ratios_return_400(self):
        for size in [(513, 64), (64, 513)]:
            with self.subTest(size=size):
                response = self.generate([reference(*size)])
                self.assertEqual(response.status_code, 400)
                self.assertIn("Maximum allowed ratio is 8:1", response.json()["detail"])
        pipeline.assert_not_called()

    def test_valid_boundary_and_multiple_references_reach_inference_unchanged(self):
        for sizes in [[(64, 64)], [(512, 64)], [(64, 512)], [(128, 128)] * 10, []]:
            with self.subTest(sizes=sizes):
                response = self.generate([reference(*size) for size in sizes])
                self.assertEqual(response.status_code, 200)
                passed = pipeline.call_args.kwargs["image"]
                actual = passed if isinstance(passed, list) else [passed] if passed else []
                self.assertEqual([image.size for image in actual], sizes)
                output = Image.open(BytesIO(base64.b64decode(response.json()[0]["image"])))
                output.load()
                self.assertEqual(output.size, (256, 256))

    def test_malformed_reference_remains_400(self):
        response = self.generate(["not-an-image"])
        self.assertEqual(response.status_code, 400)
        pipeline.assert_not_called()

    def test_real_inference_failures_are_not_reclassified_as_bad_input(self):
        pipeline.side_effect = ValueError("Unexpected inference failure")
        self.assertEqual(self.generate([reference(64, 64)]).status_code, 500)
        pipeline.side_effect = handler.torch.OutOfMemoryError("GPU memory exhausted")
        self.assertEqual(self.generate([reference(64, 64)]).status_code, 503)

    def test_backend_authentication_still_required(self):
        response = self.client.post("/generate", json={"images": [reference(64, 64)]})
        self.assertEqual(response.status_code, 403)
        pipeline.assert_not_called()


if __name__ == "__main__":
    unittest.main()
