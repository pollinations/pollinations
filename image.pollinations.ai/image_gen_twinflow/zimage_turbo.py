"""
Z-Image-Turbo Modal Deployment (Standard Pipeline)
===================================================
Uses the official ZImagePipeline from diffusers - simpler and more stable
than the custom TwinFlow patches.

Deploy with:
    modal deploy zimage_turbo.py

Run locally:
    modal run zimage_turbo.py --prompt "A cat holding a sign that says hello world"

Serve as web endpoint:
    modal serve zimage_turbo.py
"""

import time
from io import BytesIO
from pathlib import Path

import modal

# Modal app configuration
app = modal.App("zimage-turbo")

# Expected Enter token for authentication
ENTER_TOKEN_HEADER = "x-enter-token"

# CUDA base image with Python
cuda_version = "12.4.0"
flavor = "devel"
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

cuda_dev_image = modal.Image.from_registry(
    f"nvidia/cuda:{tag}", add_python="3.11"
).entrypoint([])

# Install dependencies - use diffusers from git for ZImagePipeline support
zimage_image = (
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
        "git+https://github.com/huggingface/diffusers.git",  # ZImagePipeline in main
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

# Model ID on HuggingFace - use official Z-Image-Turbo
MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"

MINUTES = 60


# GPU: L40S offers best cost/performance for 6B model
# - 48GB VRAM (plenty for bf16 + VAE + text encoder)
# - $0.000542/sec vs A100 $0.000583/sec
# - ~2-4s inference with 8-9 steps
@app.cls(
    image=zimage_image,
    gpu="L40S",
    timeout=10 * MINUTES,
    scaledown_window=5 * MINUTES,
    secrets=[
        modal.Secret.from_name("huggingface-secret"),
        modal.Secret.from_name("enter-token"),
    ],
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
    },
)
class ZImageTurbo:
    @modal.enter()
    def load_model(self):
        """Load model on container startup."""
        import torch
        from diffusers import ZImagePipeline
        
        print("🚀 Loading Z-Image-Turbo model...")
        start = time.time()
        
        # Load the standard ZImagePipeline
        self.pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=False,
        )
        self.pipe.to("cuda")
        
        # Optimization 1: Enable native flash attention (faster than default SDPA)
        try:
            self.pipe.transformer.set_attention_backend("_native_flash")
            print("✅ Native Flash Attention enabled")
        except Exception as e:
            print(f"⚠️ Native Flash Attention not available: {e}")
        
        # Optimization 2: torch.compile for faster inference
        # First inference will be slower due to compilation, but subsequent ones faster
        try:
            import torch
            print("🔧 Compiling transformer and VAE with torch.compile...")
            self.pipe.transformer = torch.compile(self.pipe.transformer, dynamic=False)
            self.pipe.vae = torch.compile(self.pipe.vae, dynamic=False, mode='max-autotune')
            print("✅ torch.compile enabled")
        except Exception as e:
            print(f"⚠️ torch.compile failed: {e}")
        
        elapsed = time.time() - start
        print(f"✅ Model loaded in {elapsed:.1f}s")

    def _verify_enter_token(self, request) -> bool:
        """Verify the x-enter-token header."""
        import os
        expected_token = os.environ.get("ENTER_TOKEN", "")
        if not expected_token:
            print("⚠️ ENTER_TOKEN not configured, allowing request")
            return True
        
        provided_token = request.headers.get(ENTER_TOKEN_HEADER, "")
        return provided_token == expected_token

    @modal.method()
    def generate(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 0.0,  # Must be 0 for Turbo models
        num_inference_steps: int = 9,  # 8-9 steps recommended for Z-Image-Turbo
        seed: int | None = None,
    ) -> bytes:
        """Generate an image from a text prompt using Z-Image-Turbo."""
        import torch
        
        print(f"🎨 Generating: '{prompt[:50]}...' @ {width}x{height}, steps={num_inference_steps}")
        start = time.time()
        
        # Set seed
        generator = None
        if seed is not None:
            generator = torch.Generator("cuda").manual_seed(seed)
        else:
            seed = torch.randint(0, 2**32 - 1, (1,)).item()
            generator = torch.Generator("cuda").manual_seed(seed)
        
        # Generate image
        image = self.pipe(
            prompt=prompt,
            height=height,
            width=width,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,  # Must be 0 for Turbo
            generator=generator,
        ).images[0]
        
        # Convert to PNG bytes
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()
        
        elapsed = time.time() - start
        print(f"✅ Generated in {elapsed:.2f}s, size: {len(image_bytes)} bytes, seed: {seed}")
        
        return image_bytes

    @modal.fastapi_endpoint(method="GET")
    def generate_web(
        self,
        request,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 0.0,
        num_inference_steps: int = 9,
        seed: int | None = None,
    ):
        """Web endpoint for text-to-image generation (GET). Requires x-enter-token header."""
        from fastapi.responses import Response, JSONResponse
        
        # Verify Enter token
        if not self._verify_enter_token(request):
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "message": "Invalid or missing x-enter-token header"}
            )
        
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
    async def generate_post(self, request):
        """Web endpoint for generation (POST). Requires x-enter-token header."""
        from fastapi.responses import Response, JSONResponse
        
        # Verify Enter token
        if not self._verify_enter_token(request):
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "message": "Invalid or missing x-enter-token header"}
            )
        
        # Parse JSON body
        try:
            body = await request.json()
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"error": "Bad Request", "message": f"Invalid JSON body: {e}"}
            )
        
        prompt = body.get("prompt")
        if not prompt:
            return JSONResponse(
                status_code=400,
                content={"error": "Bad Request", "message": "prompt is required"}
            )
        
        image_bytes = self.generate.local(
            prompt=prompt,
            width=body.get("width", 1024),
            height=body.get("height", 1024),
            guidance_scale=body.get("guidance_scale", 0.0),
            num_inference_steps=body.get("num_inference_steps", 9),
            seed=body.get("seed"),
        )
        
        return Response(content=image_bytes, media_type="image/png")


@app.local_entrypoint()
def main(
    prompt: str = "A beautiful sunset over mountains, highly detailed, 8k",
    width: int = 1024,
    height: int = 1024,
    steps: int = 9,
    seed: int = 42,
):
    """Local entrypoint for testing."""
    print(f"🎨 Generating image with Z-Image-Turbo...")
    print(f"   Prompt: {prompt}")
    print(f"   Size: {width}x{height}")
    print(f"   Steps: {steps}")
    print(f"   Seed: {seed}")
    
    t0 = time.time()
    image_bytes = ZImageTurbo().generate.remote(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=steps,
        seed=seed,
    )
    
    print(f"⏱️ Total time (including cold start): {time.time() - t0:.2f}s")
    
    output_path = Path("zimage_output.png")
    output_path.write_bytes(image_bytes)
    print(f"💾 Saved to {output_path}")
