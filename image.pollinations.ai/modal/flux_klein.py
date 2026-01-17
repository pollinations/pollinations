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

# Modal app configuration - uses myceli-ai workspace
app = modal.App("flux-klein")

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
    gpu="L40S",  # Best speed/cost balance: ~2.9s @ $0.0016/image
    image=flux_klein_image,
    scaledown_window=5 * MINUTES,  # Scale down after 5 min idle
    timeout=10 * MINUTES,
    # Autoscaling: Modal automatically scales containers for concurrent requests
    # Each container handles 1 request at a time (GPU-bound), new containers spin up for parallel requests
    # max_containers limits total parallel capacity, min_containers keeps warm pool
    max_containers=10,  # Max 10 parallel requests (adjust based on budget)
    # min_containers=1,  # Uncomment to keep 1 warm container (avoids cold starts, costs ~$0.16/hr)
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
        "/root/.nv": modal.Volume.from_name("nv-cache", create_if_missing=True),
        "/root/.triton": modal.Volume.from_name("triton-cache", create_if_missing=True),
        "/root/.inductor-cache": modal.Volume.from_name("inductor-cache", create_if_missing=True),
    },
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
        image_bytes: bytes | None = None,  # Optional reference image for editing
    ) -> bytes:
        """Generate an image from a text prompt, optionally with a reference image for editing."""
        import torch
        from PIL import Image
        
        print(f"🎨 Generating: {prompt[:50]}...")
        
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(seed)
        
        # Load reference image if provided
        reference_image = None
        if image_bytes is not None:
            reference_image = Image.open(BytesIO(image_bytes)).convert("RGB")
            print(f"📷 Using reference image: {reference_image.size}")
        
        t0 = time.time()
        image = self.pipe(
            image=reference_image,  # Reference image for editing (None for T2I)
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
    
    @modal.fastapi_endpoint(method="GET")
    def generate_web(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 4.0,
        num_inference_steps: int = 4,
        seed: int | None = None,
    ):
        """Web endpoint for text-to-image generation (GET)."""
        from fastapi.responses import Response
        
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
        image_url: str | None = None,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 4.0,
        num_inference_steps: int = 4,
        seed: int | None = None,
    ):
        """Web endpoint for image editing (POST). Pass image_url to edit an existing image."""
        from fastapi.responses import Response
        import requests as http_requests
        
        # Fetch reference image if URL provided
        ref_image_bytes = None
        if image_url:
            print(f"📥 Fetching reference image from: {image_url[:50]}...")
            resp = http_requests.get(image_url, timeout=30)
            resp.raise_for_status()
            ref_image_bytes = resp.content
        
        image_bytes = self.generate.local(
            prompt=prompt,
            width=width,
            height=height,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
            seed=seed,
            image_bytes=ref_image_bytes,
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
