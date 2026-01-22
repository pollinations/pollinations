"""
LTX-Video 2 Modal Deployment
============================
LTX-2 19B - Lightricks' audio-video generation model.
Uses Diffusers with full precision bfloat16 for best quality.

Deploy with:
    modal deploy ltx2_video.py

Run locally:
    modal run ltx2_video.py --prompt "A cat walking through a garden" --num-inference-steps 40

Serve as web endpoint:
    modal serve ltx2_video.py

Note: Use --num-inference-steps 40 for best quality (default is 10 for speed).
"""

import os
import time
from io import BytesIO
from pathlib import Path

import modal
from fastapi import Header, HTTPException
from pydantic import BaseModel

# Modal app configuration
app = modal.App("ltx2-video")

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

# Install dependencies for LTX-2 with Diffusers
ltx2_image = (
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
        "torch>=2.5.0",
        "torchvision",
        "torchaudio",
        # Install diffusers from main branch for LTX2Pipeline support
        "git+https://github.com/huggingface/diffusers.git@main",
        "transformers>=4.44.0",
        "huggingface-hub>=0.36.0",
        "accelerate>=0.33.0",
        "safetensors>=0.4.4",
        "sentencepiece>=0.2.0",
        "imageio>=2.37.0",
        "imageio-ffmpeg>=0.5.1",
        "av",  # Required for LTX-2 video export
        "numpy<2",
        "fastapi",
        "pydantic",
        "scipy",
    )
    .env({
        "HF_HUB_CACHE": "/cache",
        "TORCHINDUCTOR_CACHE_DIR": "/root/.inductor-cache",
        "TORCHINDUCTOR_FX_GRAPH_CACHE": "1",
        # Required for FP8 transformer to work properly
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
)

MINUTES = 60


class VideoRequest(BaseModel):
    prompt: str
    width: int = 768
    height: int = 512
    num_frames: int = 97  # ~4 seconds at 24fps
    fps: int = 24
    seed: int | None = None
    num_inference_steps: int = 10  # Reduced from 20 for ~2x speedup


@app.cls(
    gpu="H200",  # H200 141GB - testing speed vs H100
    image=ltx2_image,
    scaledown_window=5 * MINUTES,
    timeout=15 * MINUTES,
    max_containers=2,
    concurrency_limit=1,  # Video is memory-intensive
    volumes={
        "/cache": modal.Volume.from_name("hf-hub-cache", create_if_missing=True),
        "/root/.nv": modal.Volume.from_name("nv-cache", create_if_missing=True),
        "/root/.triton": modal.Volume.from_name("triton-cache", create_if_missing=True),
        "/root/.inductor-cache": modal.Volume.from_name("inductor-cache", create_if_missing=True),
    },
    secrets=[
        modal.Secret.from_name("enter-token", required_keys=["ENTER_TOKEN"]),
        modal.Secret.from_name("huggingface-secret", required_keys=["HF_TOKEN"]),
    ],
)
class LTX2Video:
    """LTX-Video 2 audio-video generation using Diffusers with full precision bfloat16."""
    
    @modal.enter()
    def load_model(self):
        import torch
        from diffusers import LTX2Pipeline
        
        print("🚀 Loading LTX-2 19B FULL PRECISION (bfloat16) for best quality...")
        
        # Load the full pipeline directly - no FP8 for best quality
        # H200 has 141GB VRAM - should fit full precision single-stage
        print("🔧 Loading full pipeline (this may take a moment)...")
        self.pipe = LTX2Pipeline.from_pretrained(
            "Lightricks/LTX-2",
            torch_dtype=torch.bfloat16,
        )
        
        # Keep everything on GPU for speed
        self.pipe.to("cuda")
        
        print("✅ LTX-2 pipeline loaded with FULL PRECISION bfloat16!")
    
    @modal.method()
    def generate(
        self,
        prompt: str,
        width: int = 768,
        height: int = 512,
        num_frames: int = 97,
        fps: int = 24,
        seed: int | None = None,
        num_inference_steps: int = 10,  # Reduced from 20 for ~2x speedup
    ) -> tuple[bytes, bytes | None]:
        """Generate a video (and audio) from a text prompt.
        
        Returns:
            tuple: (video_bytes, audio_bytes or None)
        """
        import torch
        from diffusers.utils import export_to_video
        
        print(f"🎬 Generating video: {prompt[:50]}...")
        print(f"   Resolution: {width}x{height}, Frames: {num_frames}, FPS: {fps}")
        
        # Use random seed if not provided
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(seed)
        else:
            seed = torch.randint(0, 2**32, (1,)).item()
            generator = torch.Generator(device="cuda").manual_seed(seed)
        
        t0 = time.time()
        
        # Generate with LTX2Pipeline
        output = self.pipe(
            prompt=prompt,
            negative_prompt="worst quality, inconsistent motion, blurry, jittery, distorted",
            width=width,
            height=height,
            num_frames=num_frames,
            num_inference_steps=num_inference_steps,
            guidance_scale=4.0,
            generator=generator,
            output_type="np",
            return_dict=False,
        )
        
        gen_time = time.time() - t0
        print(f"⏱️ Generation took {gen_time:.2f}s")
        
        # Unpack output - LTX2Pipeline returns (video, audio)
        video, audio = output
        
        # Convert video to uint8
        video = (video * 255).round().astype("uint8")
        video = torch.from_numpy(video)
        
        # Export to video bytes
        temp_path = "/tmp/output.mp4"
        
        # Check if audio is available
        audio_bytes = None
        if audio is not None and len(audio) > 0:
            # Use the pipeline's encode_video utility
            from diffusers.pipelines.ltx2.export_utils import encode_video
            encode_video(
                video[0],
                fps=fps,
                audio=audio[0].float().cpu(),
                audio_sample_rate=self.pipe.vocoder.config.output_sampling_rate,
                output_path=temp_path,
            )
            print("🔊 Audio generated and muxed")
        else:
            # No audio, just export video
            export_to_video(video[0], temp_path, fps=fps)
        
        # Read the encoded video
        with open(temp_path, "rb") as f:
            video_bytes = f.read()
        
        print(f"📹 Video size: {len(video_bytes) / 1024:.1f} KB")
        
        return video_bytes, audio_bytes
    
    def _verify_token(self, token: str | None) -> None:
        """Verify the Enter token, raise HTTPException if invalid."""
        expected_token = os.environ.get("ENTER_TOKEN")
        if not expected_token:
            raise HTTPException(status_code=500, detail="ENTER_TOKEN not configured")
        if not token or token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid or missing x-enter-token")

    @modal.fastapi_endpoint(method="GET")
    def generate_web(
        self,
        prompt: str,
        width: int = 768,
        height: int = 512,
        num_frames: int = 97,
        fps: int = 24,
        seed: int | None = None,
        num_inference_steps: int = 10,  # Reduced for speed
        x_enter_token: str | None = Header(default=None),
    ):
        """Web endpoint for text-to-video generation (GET). Requires x-enter-token header."""
        from fastapi.responses import Response

        # Verify Enter token
        self._verify_token(x_enter_token)

        video_bytes, _ = self.generate.local(
            prompt=prompt,
            width=width,
            height=height,
            num_frames=num_frames,
            fps=fps,
            seed=seed,
            num_inference_steps=num_inference_steps,
        )

        return Response(content=video_bytes, media_type="video/mp4")

    @modal.fastapi_endpoint(method="POST")
    def generate_post(
        self,
        req: VideoRequest,
        x_enter_token: str | None = Header(default=None),
    ):
        """Web endpoint for video generation (POST). Requires x-enter-token header."""
        from fastapi.responses import Response

        # Verify Enter token
        self._verify_token(x_enter_token)

        video_bytes, _ = self.generate.local(
            prompt=req.prompt,
            width=req.width,
            height=req.height,
            num_frames=req.num_frames,
            fps=req.fps,
            seed=req.seed,
            num_inference_steps=req.num_inference_steps,
        )

        return Response(content=video_bytes, media_type="video/mp4")


@app.local_entrypoint()
def main(
    prompt: str = "A cat walking through a beautiful garden with flowers",
    width: int = 768,
    height: int = 512,
    num_frames: int = 97,
    fps: int = 24,
    seed: int | None = None,
    num_inference_steps: int = 10,  # Reduced for speed
    output: str = "/tmp/ltx2-output.mp4",
):
    """Generate a video with LTX-2 (optimized: 10 steps, torch.compile, no CPU offload)."""
    print(f"🎬 LTX-2 Video Generation (Diffusers + FP8)")
    print(f"   Prompt: {prompt}")
    print(f"   Resolution: {width}x{height}")
    print(f"   Frames: {num_frames} @ {fps}fps = {num_frames/fps:.1f}s")
    
    t0 = time.time()
    video_bytes, audio_bytes = LTX2Video().generate.remote(
        prompt=prompt,
        width=width,
        height=height,
        num_frames=num_frames,
        fps=fps,
        seed=seed,
        num_inference_steps=num_inference_steps,
    )
    
    total_time = time.time() - t0
    print(f"⏱️ Total time (including cold start): {total_time:.2f}s")
    
    output_path = Path(output)
    output_path.parent.mkdir(exist_ok=True, parents=True)
    output_path.write_bytes(video_bytes)
    print(f"💾 Saved video to {output_path}")
