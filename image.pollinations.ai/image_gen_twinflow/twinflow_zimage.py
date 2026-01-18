"""
TwinFlow Z-Image-Turbo Modal Deployment
=======================================
TwinFlow-distilled Z-Image-Turbo - 6B parameter model for fast 2-4 step image generation.

Deploy with:
    modal deploy twinflow_zimage.py

Run locally:
    modal run twinflow_zimage.py --prompt "A cat holding a sign that says hello world"

Serve as web endpoint:
    modal serve twinflow_zimage.py
"""

import time
from io import BytesIO
from pathlib import Path

import modal
from fastapi import Header, HTTPException
from pydantic import BaseModel

# Modal app configuration
app = modal.App("twinflow-zimage")

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

# Install dependencies
twinflow_image = (
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
        # Core ML dependencies
        "torch>=2.5.0",
        "transformers>=4.44.0",
        "diffusers>=0.36.0",  # ComfyUI TwinFlow patches fix RMSNorm/attention issues in newer versions
        "accelerate>=0.33.0",
        "safetensors>=0.4.4",
        # TwinFlow/ComfyUI TwinFlow dependencies
        "einops",  # Required by ComfyUI TwinFlow transformer
        "omegaconf",  # Required for config loading in modeling_z_image.py
        "peft",  # Required for LoRA support in modeling_z_image.py
        "gguf",  # Required for GGUF quantization support
        # HuggingFace and utilities
        "huggingface-hub>=0.36.0",
        "sentencepiece>=0.2.0",
        "invisible_watermark==0.2.0",
        "tqdm",
        # API and other
        "numpy<2",
        "fastapi",
        "pillow",
        force_build=True,
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "HF_HUB_CACHE": "/cache",
        "TORCHINDUCTOR_CACHE_DIR": "/root/.inductor-cache",
        "TORCHINDUCTOR_FX_GRAPH_CACHE": "1",
    })
)

# Model ID on HuggingFace
MODEL_ID = "inclusionAI/TwinFlow-Z-Image-Turbo"
MODEL_SUBFOLDER = "TwinFlow-Z-Image-Turbo-exp"

MINUTES = 60


class GenerateRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024
    guidance_scale: float = 0.0  # TwinFlow uses cfg_scale=0 for few-step
    num_inference_steps: int = 2  # 2-4 NFE recommended
    seed: int | None = None


# GPU: L40S offers best cost/performance for 6B model
# - 48GB VRAM (plenty for bf16 + VAE + text encoder)
# - $0.000542/sec vs A100 $0.000583/sec
# - ~2-3s inference with TwinFlow 2-step
@app.cls(
    image=twinflow_image,
    gpu="L40S",
    timeout=10 * MINUTES,
    scaledown_window=5 * MINUTES,  # renamed from container_idle_timeout
    secrets=[
        modal.Secret.from_name("huggingface-secret"),
        modal.Secret.from_name("enter-token"),
    ],
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
    },
)
class TwinFlowZImage:
    @modal.enter()
    def load_model(self):
        """Load model on container startup."""
        import os
        import torch
        from functools import partial
        
        print("🚀 Loading TwinFlow Z-Image-Turbo model...")
        start = time.time()
        
        # Clone ComfyUI TwinFlow repo - has fixes for diffusers >0.36.0 compatibility
        # (original TwinFlow repo has RMSNorm/attention mask issues with newer diffusers)
        comfyui_repo_path = Path("/root/ComfyUI_TwinFlow")
        if not comfyui_repo_path.exists():
            import subprocess
            print("📦 Cloning ComfyUI_TwinFlow repository (has diffusers compatibility fixes)...")
            subprocess.run([
                "git", "clone", "--depth", "1",
                "https://github.com/smthemex/ComfyUI_TwinFlow.git",
                str(comfyui_repo_path)
            ], check=True)
        
        # Add to Python path - ComfyUI TwinFlow first for patched transformer
        import sys
        sys.path.insert(0, str(comfyui_repo_path))
        
        # Create stub for services.tools (not needed for inference)
        import types
        services_module = types.ModuleType("services")
        tools_module = types.ModuleType("services.tools")
        tools_module.create_logger = lambda name: type('Logger', (), {
            'info': lambda self, *args: print(*args),
            'warning': lambda self, *args: print("WARN:", *args),
            'error': lambda self, *args: print("ERROR:", *args),
            'debug': lambda self, *args: None,
        })()
        sys.modules["services"] = services_module
        sys.modules["services.tools"] = tools_module
        
        # Clone the original TwinFlow repo for ZImage class
        original_repo_path = Path("/root/TwinFlow")
        if not original_repo_path.exists():
            import subprocess
            print("📦 Cloning original TwinFlow repository for ZImage class...")
            subprocess.run([
                "git", "clone", "--depth", "1",
                "https://github.com/inclusionAI/TwinFlow.git",
                str(original_repo_path)
            ], check=True)
        
        # Add original TwinFlow to path FIRST for proper package imports
        sys.path.insert(0, str(original_repo_path))
        
        # Import the patched transformer from ComfyUI TwinFlow
        # We need to add ComfyUI to path temporarily for this import
        sys.path.insert(0, str(comfyui_repo_path))
        from diffusers_patch.z_image.transformer_z_image import ZImageTransformer2DModel as PatchedTransformer
        # Remove ComfyUI from path after import
        sys.path.remove(str(comfyui_repo_path))
        
        # Patch diffusers BEFORE importing ZImage from original TwinFlow
        import diffusers
        import diffusers.models.transformers.transformer_z_image
        
        # Replace the transformer class in diffusers with the patched version
        diffusers.ZImageTransformer2DModel = PatchedTransformer
        diffusers.models.transformers.transformer_z_image.ZImageTransformer2DModel = PatchedTransformer
        
        # Now clear any cached imports of diffusers_patch to force reimport from original TwinFlow
        modules_to_remove = [k for k in sys.modules.keys() if k.startswith('diffusers_patch')]
        for mod in modules_to_remove:
            del sys.modules[mod]
        
        # Import ZImage from original TwinFlow (now first in path)
        from diffusers_patch.z_image.modeling_z_image import ZImage
        
        # Import UnifiedSampler from ComfyUI TwinFlow
        sys.path.insert(0, str(comfyui_repo_path))
        from unified_sampler import UnifiedSampler
        sys.path.remove(str(comfyui_repo_path))
        
        # Download model from HuggingFace
        from huggingface_hub import snapshot_download
        model_path = snapshot_download(
            MODEL_ID,
            allow_patterns=[f"{MODEL_SUBFOLDER}/*"],
            cache_dir="/cache",
        )
        full_model_path = f"{model_path}/{MODEL_SUBFOLDER}"
        
        print(f"📁 Model path: {full_model_path}")
        
        # Load the model using the original TwinFlow ZImage class
        # (which now uses the patched transformer via our diffusers monkey-patch)
        self.device = torch.device("cuda")
        print("📦 Loading ZImage model with TwinFlow sampler support...")
        self.model = ZImage(
            full_model_path,
            aux_time_embed=True,
            device=self.device,
        )
        self.model.eval()
        
        # Store sampler config for 2 NFE (fastest)
        self.sampler_config_2nfe = {
            "sampling_steps": 2,
            "stochast_ratio": 1.0,
            "extrapol_ratio": 0.0,
            "sampling_order": 1,
            "time_dist_ctrl": [1.0, 1.0, 1.0],
            "rfba_gap_steps": [0.001, 0.6],
        }
        
        # 4 NFE config (better quality)
        self.sampler_config_4nfe = {
            "sampling_steps": 4,
            "stochast_ratio": 1.0,
            "extrapol_ratio": 0.0,
            "sampling_order": 1,
            "time_dist_ctrl": [1.0, 1.0, 1.0],
            "rfba_gap_steps": [0.001, 0.5],
        }
        
        self.UnifiedSampler = UnifiedSampler
        
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
        guidance_scale: float = 0.0,
        num_inference_steps: int = 2,
        seed: int | None = None,
    ) -> bytes:
        """Generate an image from a text prompt."""
        import torch
        from functools import partial
        from torchvision.utils import save_image
        
        print(f"🎨 Generating: '{prompt[:50]}...' @ {width}x{height}, steps={num_inference_steps}")
        start = time.time()
        
        # Set seed
        if seed is None:
            seed = torch.randint(0, 2**32 - 1, (1,)).item()
        torch.manual_seed(seed)
        
        # Select sampler config based on steps
        if num_inference_steps <= 2:
            sampler_config = self.sampler_config_2nfe.copy()
            sampler_config["sampling_steps"] = num_inference_steps
        else:
            sampler_config = self.sampler_config_4nfe.copy()
            sampler_config["sampling_steps"] = num_inference_steps
        
        sampler = partial(self.UnifiedSampler().sampling_loop, **sampler_config)
        
        # Generate
        with torch.no_grad():
            image = self.model.sample(
                [prompt],
                cfg_scale=guidance_scale,
                seed=seed,
                height=height,
                width=width,
                sampler=sampler,
                return_traj=False,
            )
        
        # Convert to PNG bytes
        image = image.squeeze(0)  # [C, H, W]
        image = (image + 1) / 2  # [-1, 1] -> [0, 1]
        image = image.clamp(0, 1)
        
        # Save to bytes
        from PIL import Image
        import numpy as np
        
        image_np = (image.permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8)
        pil_image = Image.fromarray(image_np)
        
        buffer = BytesIO()
        pil_image.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()
        
        elapsed = time.time() - start
        print(f"✅ Generated in {elapsed:.2f}s, size: {len(image_bytes)} bytes")
        
        return image_bytes

    @modal.fastapi_endpoint(method="GET")
    def generate_web(
        self,
        request,
        prompt: str,
        width: int = 1024,
        height: int = 1024,
        guidance_scale: float = 0.0,
        num_inference_steps: int = 2,
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
        
        image_bytes = self.generate(
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
        
        image_bytes = self.generate(
            prompt=prompt,
            width=body.get("width", 1024),
            height=body.get("height", 1024),
            guidance_scale=body.get("guidance_scale", 0.0),
            num_inference_steps=body.get("num_inference_steps", 2),
            seed=body.get("seed"),
        )
        
        return Response(content=image_bytes, media_type="image/png")


@app.local_entrypoint()
def main(
    prompt: str = "A beautiful sunset over mountains, highly detailed, 8k",
    width: int = 1024,
    height: int = 1024,
    steps: int = 2,
    seed: int = 42,
):
    """Local entrypoint for testing."""
    print(f"🎨 Generating image with TwinFlow Z-Image-Turbo...")
    print(f"   Prompt: {prompt}")
    print(f"   Size: {width}x{height}")
    print(f"   Steps: {steps}")
    print(f"   Seed: {seed}")
    
    # Use the class method directly with .remote()
    image_bytes = TwinFlowZImage().generate.remote(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=steps,
        seed=seed,
    )
    
    output_path = Path("twinflow_output.png")
    output_path.write_bytes(image_bytes)
    print(f"✅ Saved to {output_path}")
