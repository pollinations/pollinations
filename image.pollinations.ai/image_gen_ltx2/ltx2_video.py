"""
LTX-Video 2 Modal Deployment
============================
LTX-2 19B - Lightricks' audio-video generation model.
Uses DistilledPipeline for fastest inference (8 steps).

Deploy with:
    modal deploy ltx2_video.py

Run locally:
    modal run ltx2_video.py --prompt "A cat walking through a garden"

Serve as web endpoint:
    modal serve ltx2_video.py
"""

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

# Install dependencies for LTX-2
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
        "transformers>=4.44.0",
        "huggingface-hub>=0.36.0",
        "accelerate>=0.33.0",
        "safetensors>=0.4.4",
        "sentencepiece>=0.2.0",
        "imageio>=2.37.0",
        "imageio-ffmpeg>=0.5.1",
        "einops",
        "rotary-embedding-torch",
        "numpy<2",
        "fastapi",
        "pydantic",
        # LTX-2 packages from GitHub
        "git+https://github.com/Lightricks/LTX-2.git#subdirectory=packages/ltx-core",
        "git+https://github.com/Lightricks/LTX-2.git#subdirectory=packages/ltx-pipelines",
        force_build=True,
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "HF_HUB_CACHE": "/cache",
        "TORCHINDUCTOR_CACHE_DIR": "/root/.inductor-cache",
        "TORCHINDUCTOR_FX_GRAPH_CACHE": "1",
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
    with_audio: bool = True


# GPU options with pricing (per second)
GPU_OPTIONS = {
    "L40S": "L40S",       # $0.000542/s - 48GB VRAM
    "A100": "A100-80GB",  # $0.000694/s - 80GB VRAM
    "H100": "H100",       # $0.001097/s - 80GB VRAM, fastest
    "H200": "H200",       # $0.001261/s - 141GB VRAM, newest
}


@app.cls(
    gpu="H100",  # Fastest GPU for speed testing
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
    """LTX-Video 2 audio-video generation model using DistilledPipeline."""
    
    @modal.enter()
    def load_model(self):
        import torch
        from ltx_pipelines import DistilledPipeline
        
        print("🚀 Loading LTX-2 19B DistilledPipeline...")
        
        # Load the distilled pipeline for fastest inference
        self.pipe = DistilledPipeline.from_pretrained(
            "Lightricks/LTX-2",
            torch_dtype=torch.bfloat16,
        )
        self.pipe.to("cuda")
        
        print("✅ LTX-2 model loaded and ready!")
    
    @modal.method()
    def generate(
        self,
        prompt: str,
        width: int = 768,
        height: int = 512,
        num_frames: int = 97,
        fps: int = 24,
        seed: int | None = None,
        with_audio: bool = True,
    ) -> tuple[bytes, bytes | None]:
        """Generate a video (and optionally audio) from a text prompt.
        
        Returns:
            tuple: (video_bytes, audio_bytes or None)
        """
        import torch
        import imageio
        
        print(f"🎬 Generating video: {prompt[:50]}...")
        print(f"   Resolution: {width}x{height}, Frames: {num_frames}, FPS: {fps}")
        
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(seed)
        
        t0 = time.time()
        
        # Generate with DistilledPipeline (8 steps, fastest)
        result = self.pipe(
            prompt=prompt,
            height=height,
            width=width,
            num_frames=num_frames,
            generator=generator,
        )
        
        gen_time = time.time() - t0
        print(f"⏱️ Generation took {gen_time:.2f}s")
        
        # Extract video frames
        frames = result.frames[0]  # Shape: (num_frames, height, width, 3)
        
        # Convert to video bytes
        video_buffer = BytesIO()
        imageio.mimwrite(video_buffer, frames, format='mp4', fps=fps)
        video_bytes = video_buffer.getvalue()
        
        # Extract audio if available and requested
        audio_bytes = None
        if with_audio and hasattr(result, 'audio') and result.audio is not None:
            audio_buffer = BytesIO()
            # Audio is typically returned as numpy array
            import scipy.io.wavfile as wavfile
            wavfile.write(audio_buffer, 16000, result.audio)
            audio_bytes = audio_buffer.getvalue()
            print("🔊 Audio generated")
        
        print(f"📹 Video size: {len(video_bytes) / 1024:.1f} KB")
        
        return video_bytes, audio_bytes
    
    def _verify_token(self, token: str | None) -> None:
        """Verify the Enter token, raise HTTPException if invalid."""
        import os
        expected_token = os.environ.get("ENTER_TOKEN")
        if not expected_token:
            raise HTTPException(status_code=500, detail="ENTER_TOKEN not configured")
        
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
        width: int = 768,
        height: int = 512,
        num_frames: int = 97,
        fps: int = 24,
        seed: int | None = None,
        with_audio: bool = True,
        x_enter_token: str | None = Header(default=None),
    ):
        """Web endpoint for text-to-video generation (GET). Requires x-enter-token header."""
        from fastapi.responses import Response

        # Verify Enter token
        self._verify_token(x_enter_token)

        video_bytes, audio_bytes = self.generate.local(
            prompt=prompt,
            width=width,
            height=height,
            num_frames=num_frames,
            fps=fps,
            seed=seed,
            with_audio=with_audio,
        )

        # For now, return just the video
        # TODO: Return combined video+audio or separate endpoints
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

        video_bytes, audio_bytes = self.generate.local(
            prompt=req.prompt,
            width=req.width,
            height=req.height,
            num_frames=req.num_frames,
            fps=req.fps,
            seed=req.seed,
            with_audio=req.with_audio,
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
    with_audio: bool = True,
    output: str = "/tmp/ltx2-output.mp4",
):
    """Generate a video with LTX-2."""
    print(f"🎬 LTX-2 Video Generation")
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
        with_audio=with_audio,
    )
    
    total_time = time.time() - t0
    print(f"⏱️ Total time (including cold start): {total_time:.2f}s")
    
    output_path = Path(output)
    output_path.parent.mkdir(exist_ok=True, parents=True)
    output_path.write_bytes(video_bytes)
    print(f"💾 Saved video to {output_path}")
    
    if audio_bytes:
        audio_path = output_path.with_suffix(".wav")
        audio_path.write_bytes(audio_bytes)
        print(f"🔊 Saved audio to {audio_path}")
