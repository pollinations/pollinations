"""
Flux Klein Modal Deployment
===========================
FLUX.2 [klein] 4B - Black Forest Labs' fastest image generation model.

Deploy with:
    modal deploy flux_klein.py

Run locally:
    modal run flux_klein.py --prompt "A cat holding a sign that says hello world"

Serve as web endpoint:
    modal serve flux_klein.py
"""

import time
from io import BytesIO
from pathlib import Path

import modal
from fastapi import Header, HTTPException

# Modal app configuration - uses myceli-ai workspace
app = modal.App("flux-klein")

# Expected Enter token for authentication (set via Modal secret)
# Create secret: modal secret create enter-token ENTER_TOKEN=your_token_here
ENTER_TOKEN_HEADER = "x-enter-token"

# CUDA base image with Python
cuda_version = "12.4.0"
flavor = "devel"
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

cuda_dev_image = modal.Image.from_registry(
    f"nvidia/cuda:{tag}", add_python="3.11"
).entrypoint([])

# Install dependencies - Flux2KleinPipeline requires diffusers from main branch (not yet released)
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
        "git+https://github.com/huggingface/diffusers.git",  # Flux2KleinPipeline only in main branch
        "numpy<2",
        "fastapi",
        force_build=True,  # Force rebuild to get latest diffusers from git
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "HF_HUB_CACHE": "/cache",
        "TORCHINDUCTOR_CACHE_DIR": "/root/.inductor-cache",
        "TORCHINDUCTOR_FX_GRAPH_CACHE": "1",
    })
)

# Model variants
KLEIN_VARIANTS = {
    "4b": "black-forest-labs/FLUX.2-klein-4B",           # Distilled, fastest
    "4b-base": "black-forest-labs/FLUX.2-klein-base-4B", # Undistilled, best for fine-tuning
    "9b": "black-forest-labs/FLUX.2-klein-9B",           # Higher quality (non-commercial)
}

MINUTES = 60


# GPU options with pricing (per second)
# L40S chosen for best speed/cost balance: ~2.9s inference, $0.0016/image
GPU_OPTIONS = {
    "L4": "L4",           # $0.000222/s - Budget option, 24GB VRAM, ~5.8s inference
    "L40S": "L40S",       # $0.000542/s - Best balance, 48GB VRAM, ~2.9s inference
    "A100": "A100",       # $0.000583/s - High-end, 40GB VRAM
    "H100": "H100",       # $0.001097/s - Fastest, 80GB VRAM, ~2.4s inference
}


@app.cls(
    gpu="L40S",  # Best speed/cost balance: ~2.9s @ $0.008/image (15s avg)
    image=flux_klein_image,
    scaledown_window=5 * MINUTES,  # Scale down after 5 min idle
    timeout=10 * MINUTES,
    # Autoscaling: max 2 containers, each handles 2 concurrent requests
    # Total capacity: 4 concurrent requests (2 GPUs × 2 requests each)
    max_containers=2,
    # min_containers=1,  # Uncomment to keep 1 warm container (avoids cold starts)
    concurrency_limit=2,  # Each container handles up to 2 concurrent requests
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
        "/root/.nv": modal.Volume.from_name("nv-cache", create_if_missing=True),
        "/root/.triton": modal.Volume.from_name("triton-cache", create_if_missing=True),
        "/root/.inductor-cache": modal.Volume.from_name("inductor-cache", create_if_missing=True),
    },
    secrets=[modal.Secret.from_name("enter-token", required_keys=["ENTER_TOKEN"])],
)
class FluxKlein:
    """Flux Klein image generation model."""
    
    variant: str = modal.parameter(default="4b")
    compile: bool = modal.parameter(default=False)
    
    @modal.enter()
    def load_model(self):
        import torch
        from diffusers import Flux2KleinPipeline
        
        model_id = KLEIN_VARIANTS.get(self.variant, KLEIN_VARIANTS["4b"])
        print(f"🚀 Loading {model_id}...")
        
        self.pipe = Flux2KleinPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        
        # Optional: Enable CPU offload to save VRAM
        # self.pipe.enable_model_cpu_offload()
        
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
        num_inference_steps: int = 4,  # Klein is fast - 4 steps is often enough
        seed: int | None = None,
        image_bytes_list: list[bytes] | None = None,  # Optional reference images for editing (up to 10)
    ) -> bytes:
        """Generate an image from a text prompt, optionally with reference images for editing.
        
        FLUX.2 Klein supports up to 10 reference images. Reference them in the prompt by:
        - Index: "image 1", "image 2", etc.
        - Description: "the cat", "the landscape", etc.
        """
        import torch
        from PIL import Image
        
        print(f"🎨 Generating: {prompt[:50]}...")
        
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(seed)
        
        # Load reference images if provided (supports multiple images)
        reference_images = None
        if image_bytes_list and len(image_bytes_list) > 0:
            reference_images = []
            for i, img_bytes in enumerate(image_bytes_list[:10]):  # Max 10 images
                img = Image.open(BytesIO(img_bytes)).convert("RGB")
                reference_images.append(img)
                print(f"📷 Reference image {i+1}: {img.size}")
            # If only one image, pass it directly (not as list) for backward compatibility
            if len(reference_images) == 1:
                reference_images = reference_images[0]
        
        t0 = time.time()
        image = self.pipe(
            image=reference_images,  # Reference image(s) for editing (None for T2I)
            prompt=prompt,  # Must be keyword arg
            height=height,
            width=width,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
            generator=generator,
        ).images[0]
        
        print(f"⏱️ Generation took {time.time() - t0:.2f}s")
        
        # Convert to bytes
        byte_stream = BytesIO()
        image.save(byte_stream, format="PNG")
        return byte_stream.getvalue()
    
    def _verify_token(self, token: str | None) -> None:
        """Verify the Enter token, raise HTTPException if invalid."""
        import os
        expected_token = os.environ.get("ENTER_TOKEN")
        if not expected_token:
            print("⚠️ ENTER_TOKEN not configured, allowing request")
            return
        
        if not token:
            print("❌ No Enter token provided")
            raise HTTPException(status_code=401, detail="Missing x-enter-token header")
        
        if token != expected_token:
            print("❌ Invalid Enter token")
            raise HTTPException(status_code=401, detail="Invalid x-enter-token")
    
    @modal.fastapi_endpoint(method="GET")
    def generate_web(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 4.0,
        num_inference_steps: int = 4,
        seed: int | None = None,
        x_enter_token: str | None = Header(default=None),
    ):
        """Web endpoint for text-to-image generation (GET). Requires x-enter-token header."""
        from fastapi.responses import Response
        
        # Verify Enter token
        self._verify_token(x_enter_token)
        
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
        prompt: str,
        images: list[str] | None = None,  # base64-encoded images (up to 10)
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 4.0,
        num_inference_steps: int = 4,
        seed: int | None = None,
        x_enter_token: str | None = Header(default=None),
    ):
        """Web endpoint for image editing (POST). Requires x-enter-token header.
        
        Pass images as list of base64-encoded strings (up to 10).
        Reference images in the prompt by index ("image 1", "image 2") or description.
        """
        from fastapi.responses import Response
        import base64
        
        # Verify Enter token
        self._verify_token(x_enter_token)
        
        # Decode base64 images if provided
        ref_image_bytes_list = None
        if images and len(images) > 0:
            ref_image_bytes_list = []
            for i, img_b64 in enumerate(images[:10]):  # Max 10 images
                try:
                    # Handle data URL format (data:image/png;base64,...) or raw base64
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
    variant: str = "4b",
    compile: bool = False,
    output: str = "/tmp/flux-klein-output.png",
):
    """Generate an image with Flux Klein."""
    print(f"🎨 Flux Klein [{variant}] - Generating image...")
    
    t0 = time.time()
    image_bytes = FluxKlein(variant=variant, compile=compile).generate.remote(
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
