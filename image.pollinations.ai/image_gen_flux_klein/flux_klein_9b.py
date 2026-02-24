"""
Flux Klein 9B Modal Deployment
==============================
FLUX.2 [klein] 9B - Higher quality version (non-commercial license).

Deploy with:
    modal deploy flux_klein_9b.py

Run locally:
    modal run flux_klein_9b.py --prompt "A cat holding a sign that says hello world"

Serve as web endpoint:
    modal serve flux_klein_9b.py
"""

import time
from io import BytesIO
from pathlib import Path

import modal
from fastapi import Header, HTTPException
from pydantic import BaseModel

# Modal app configuration - uses myceli-ai workspace
# Different app name to avoid conflicts with 4B deployment
app = modal.App("flux-klein-9b")

# Expected Backend token for authentication (set via Modal secret)
ENTER_TOKEN_HEADER = "x-backend-token"

# CUDA base image with Python
cuda_version = "12.4.0"
flavor = "devel"
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

cuda_dev_image = modal.Image.from_registry(
    f"nvidia/cuda:{tag}", add_python="3.11"
).entrypoint([])

# Install dependencies
flux_klein_image = (
    cuda_dev_image.apt_install(
        "git",
        "libglib2.0-0",
        "libsm6",
        "libxrender1",
        "libxext6",
        "ffmpeg",
        "libgl1",
    )
    .pip_install(
        "invisible_watermark==0.2.0",
        "transformers>=4.44.0",
        "huggingface-hub>=0.36.0",
        "accelerate>=0.33.0",
        "safetensors>=0.4.4",
        "sentencepiece>=0.2.0",
        "torch>=2.5.0",
        "git+https://github.com/huggingface/diffusers.git",
        "numpy<2",
        "fastapi",
        force_build=True,
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "HF_HUB_CACHE": "/cache",
        "TORCHINDUCTOR_CACHE_DIR": "/root/.inductor-cache",
        "TORCHINDUCTOR_FX_GRAPH_CACHE": "1",
    })
)

# 9B model - higher quality, non-commercial license
MODEL_ID = "black-forest-labs/FLUX.2-klein-9B"

MINUTES = 60

# Maximum resolution to prevent OOM - 9B model is memory-hungry
MAX_TOTAL_PIXELS = 1024 * 1024  # 1 megapixel max

def clamp_dimensions(width: int, height: int) -> tuple[int, int]:
    """Scale down dimensions while maintaining aspect ratio to prevent OOM errors."""
    # Scale down proportionally if total pixels exceed max
    total_pixels = width * height
    if total_pixels > MAX_TOTAL_PIXELS:
        scale = (MAX_TOTAL_PIXELS / total_pixels) ** 0.5
        width = int(width * scale)
        height = int(height * scale)
    
    # Ensure divisible by 16 (required by model)
    width = (width // 16) * 16
    height = (height // 16) * 16
    
    return max(width, 256), max(height, 256)


class EditRequest(BaseModel):
    prompt: str
    images: list[str] | None = None
    width: int = 1024
    height: int = 1024
    guidance_scale: float = 4.0
    num_inference_steps: int = 4
    seed: int | None = None


@app.cls(
    gpu="L40S",  # 48GB VRAM needed for 9B model
    image=flux_klein_image,
    scaledown_window=5 * MINUTES,
    timeout=10 * MINUTES,
    max_containers=2,
    concurrency_limit=1,  # Reduced from 2 - 9B model uses ~44GB VRAM, can't handle concurrent requests
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
        "/root/.nv": modal.Volume.from_name("nv-cache", create_if_missing=True),
        "/root/.triton": modal.Volume.from_name("triton-cache", create_if_missing=True),
        "/root/.inductor-cache": modal.Volume.from_name("inductor-cache", create_if_missing=True),
    },
    secrets=[
        modal.Secret.from_name("backend-token", required_keys=["PLN_IMAGE_BACKEND_TOKEN"]),
        modal.Secret.from_name("huggingface-secret", required_keys=["HF_TOKEN"]),
    ],
)
class FluxKlein9B:
    """Flux Klein 9B image generation model - higher quality variant."""
    
    compile: bool = modal.parameter(default=False)
    
    @modal.enter()
    def load_model(self):
        import torch
        from diffusers import Flux2KleinPipeline
        
        print(f"🚀 Loading {MODEL_ID}...")
        
        self.pipe = Flux2KleinPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        
        if self.compile:
            print("⚡ Compiling model with torch.compile...")
            self.pipe.transformer = torch.compile(
                self.pipe.transformer,
                mode="reduce-overhead",
                fullgraph=True,
            )
        
        print("✅ Model loaded and ready!")
    
    @modal.method()
    def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 4.0,
        num_inference_steps: int = 4,
        seed: int | None = None,
        image_bytes_list: list[bytes] | None = None,
    ) -> bytes:
        """Generate an image from a text prompt, optionally with reference images."""
        import gc
        import torch
        from PIL import Image
        
        # Clamp dimensions to prevent OOM
        width, height = clamp_dimensions(width, height)
        print(f"🎨 Generating: {prompt[:50]}... (clamped to {width}x{height})")
        
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(seed)
        
        # Load reference images if provided
        reference_images = None
        if image_bytes_list and len(image_bytes_list) > 0:
            reference_images = []
            for i, img_bytes in enumerate(image_bytes_list[:10]):
                img = Image.open(BytesIO(img_bytes)).convert("RGB")
                reference_images.append(img)
                print(f"📷 Reference image {i+1}: {img.size}")
            if len(reference_images) == 1:
                reference_images = reference_images[0]
        
        t0 = time.time()
        image = self.pipe(
            image=reference_images,
            prompt=prompt,
            height=height,
            width=width,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
            generator=generator,
        ).images[0]
        
        print(f"⏱️ Generation took {time.time() - t0:.2f}s")
        
        byte_stream = BytesIO()
        image.save(byte_stream, format="PNG")
        
        # Clean up to prevent memory fragmentation
        del image
        if reference_images is not None:
            del reference_images
        gc.collect()
        torch.cuda.empty_cache()
        
        return byte_stream.getvalue()
    
    def _verify_token(self, token: str | None) -> None:
        """Verify the Backend token."""
        import os
        expected_token = os.environ.get("PLN_IMAGE_BACKEND_TOKEN")
        if not expected_token:
            raise HTTPException(status_code=500, detail="PLN_IMAGE_BACKEND_TOKEN not configured")
        
        if not token:
            print("❌ No Backend token provided")
            raise HTTPException(status_code=401, detail="Missing x-backend-token header")
        
        if token != expected_token:
            print("❌ Invalid Backend token")
            raise HTTPException(status_code=401, detail="Invalid x-backend-token")

    @modal.fastapi_endpoint(method="GET")
    def generate_web(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 4.0,
        num_inference_steps: int = 4,
        seed: int | None = None,
        x_backend_token: str | None = Header(default=None),
    ):
        """Web endpoint for text-to-image generation (GET)."""
        from fastapi.responses import Response

        self._verify_token(x_backend_token)

        image_bytes = self.generate.local(
            prompt=prompt,
            width=width,
            height=height,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
            seed=seed,
        )

        return Response(content=image_bytes, media_type="image/png")

    @modal.fastapi_endpoint(method="POST")
    def edit_web(
        self,
        images: list[str],
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 4.0,
        num_inference_steps: int = 4,
        seed: int | None = None,
        x_backend_token: str | None = Header(default=None),
    ):
        """Web endpoint for image editing (POST).
        
        Query params: prompt, width, height, guidance_scale, num_inference_steps, seed
        Body: JSON array of base64-encoded images (up to 10)
        """
        from fastapi.responses import Response
        import base64

        self._verify_token(x_backend_token)

        ref_image_bytes_list = None
        if images and len(images) > 0:
            ref_image_bytes_list = []
            for i, img_b64 in enumerate(images[:10]):
                try:
                    if img_b64.startswith("data:"):
                        img_b64 = img_b64.split(",", 1)[1]
                    img_bytes = base64.b64decode(img_b64)
                    ref_image_bytes_list.append(img_bytes)
                    print(f"📷 Decoded reference image {i+1}: {len(img_bytes)} bytes")
                except Exception as e:
                    print(f"⚠️ Failed to decode image {i+1}: {e}")

        image_bytes = self.generate.local(
            prompt=prompt,
            width=width,
            height=height,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
            seed=seed,
            image_bytes_list=ref_image_bytes_list,
        )

        return Response(content=image_bytes, media_type="image/png")


@app.local_entrypoint()
def main(
    prompt: str = "A cat holding a sign that says hello world",
    width: int = 1024,
    height: int = 1024,
    guidance_scale: float = 4.0,
    num_inference_steps: int = 4,
    seed: int | None = None,
    compile: bool = False,
    output: str = "/tmp/flux-klein-9b-output.png",
):
    """Generate an image with Flux Klein 9B."""
    print(f"🎨 Flux Klein 9B - Generating image...")
    
    t0 = time.time()
    image_bytes = FluxKlein9B(compile=compile).generate.remote(
        prompt=prompt,
        width=width,
        height=height,
        guidance_scale=guidance_scale,
        num_inference_steps=num_inference_steps,
        seed=seed,
    )
    
    print(f"⏱️ Total time (including cold start): {time.time() - t0:.2f}s")
    
    output_path = Path(output)
    output_path.parent.mkdir(exist_ok=True, parents=True)
    output_path.write_bytes(image_bytes)
    print(f"💾 Saved to {output_path}")
