"""
LTX-Video 2 ComfyUI Modal Deployment
=====================================
LTX-2 19B video generation using ComfyUI workflows on Modal.
Supports distilled model for faster generation (~8+4 steps vs 40).

Deploy with:
    modal deploy ltx2_comfyui.py

Run locally:
    modal run ltx2_comfyui.py --prompt "A cat walking through a garden"

Serve as web endpoint:
    modal serve ltx2_comfyui.py
"""

import json
import os
import subprocess
import uuid
from pathlib import Path
from typing import Dict

import modal

# Modal app configuration
app = modal.App("ltx2-comfyui")

# Expected Enter token for authentication
ENTER_TOKEN_HEADER = "x-enter-token"

MINUTES = 60

# ComfyUI installation paths
COMFYUI_ROOT = "/root/comfy/ComfyUI"
MODELS_DIR = f"{COMFYUI_ROOT}/models"

# Build the ComfyUI image with LTX-2 support
comfyui_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "git",
        "ffmpeg",
        "libgl1",
        "libglib2.0-0",
        "libsm6",
        "libxrender1",
        "libxext6",
    )
    # Install comfy-cli and web dependencies
    .pip_install(
        "comfy-cli==1.5.3",
        "fastapi[standard]==0.115.4",
        "huggingface-hub>=0.36.0",
    )
    # Install ComfyUI using comfy-cli
    .run_commands(
        "comfy --skip-prompt install --fast-deps --nvidia --version 0.3.71"
    )
    # Install ComfyUI-LTXVideo custom nodes
    .run_commands(
        "comfy node install --fast-deps comfyui-ltxvideo"
    )
    .env({
        "HF_HUB_CACHE": "/cache",
        "HF_XET_HIGH_PERFORMANCE": "1",
    })
)


def download_models():
    """Download required LTX-2 models to the cache volume."""
    from huggingface_hub import hf_hub_download
    
    print("📥 Downloading LTX-2 models...")
    
    # Model definitions: (repo_id, filename, local_dir)
    models = [
        # Main checkpoint (FP8 for memory efficiency)
        (
            "Lightricks/LTX-2",
            "ltx-2-19b-dev-fp8.safetensors",
            f"{MODELS_DIR}/checkpoints",
        ),
        # Distilled checkpoint for faster generation
        (
            "Lightricks/LTX-2",
            "ltx-2-19b-distilled-fp8.safetensors",
            f"{MODELS_DIR}/checkpoints",
        ),
        # Gemma text encoder (quantized)
        (
            "Comfy-Org/ltx-2",
            "split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
            f"{MODELS_DIR}/text_encoders",
        ),
        # Spatial upscaler
        (
            "Lightricks/LTX-2",
            "ltx-2-spatial-upscaler-x2-1.0.safetensors",
            f"{MODELS_DIR}/latent_upscale_models",
        ),
        # Distilled LoRA
        (
            "Lightricks/LTX-2",
            "ltx-2-19b-distilled-lora-384.safetensors",
            f"{MODELS_DIR}/loras",
        ),
    ]
    
    for repo_id, filename, local_dir in models:
        print(f"  Downloading {filename}...")
        Path(local_dir).mkdir(parents=True, exist_ok=True)
        
        downloaded_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            cache_dir="/cache",
        )
        
        # Create symlink to ComfyUI models directory
        target_name = Path(filename).name
        target_path = Path(local_dir) / target_name
        if not target_path.exists():
            subprocess.run(
                f"ln -s {downloaded_path} {target_path}",
                shell=True,
                check=True,
            )
            print(f"  ✓ Linked {target_name}")
    
    print("✅ All models downloaded!")


# Add model download to image build
vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
comfyui_image = comfyui_image.run_function(
    download_models,
    volumes={"/cache": vol},
)

# Add the workflow JSON to the image
comfyui_image = comfyui_image.add_local_file(
    Path(__file__).parent / "workflow_t2v.json",
    "/root/workflow_t2v.json",
)


@app.cls(
    gpu="H100",  # H100 80GB for LTX-2
    image=comfyui_image,
    scaledown_window=5 * MINUTES,
    timeout=15 * MINUTES,
    min_containers=1,
    max_containers=1,
    concurrency_limit=1,
    volumes={
        "/cache": vol,
    },
    secrets=[
        modal.Secret.from_name("enter-token", required_keys=["ENTER_TOKEN"]),
        modal.Secret.from_name("huggingface-secret", required_keys=["HF_TOKEN"]),
    ],
)
class LTX2ComfyUI:
    """LTX-Video 2 generation using ComfyUI workflows."""
    
    port: int = 8000
    
    @modal.enter()
    def launch_comfy_background(self):
        """Launch ComfyUI server in background when container starts."""
        print("🚀 Starting ComfyUI server...")
        cmd = f"comfy launch --background -- --listen 0.0.0.0 --port {self.port}"
        subprocess.run(cmd, shell=True, check=True)
        print("✅ ComfyUI server started!")
    
    def poll_server_health(self) -> None:
        """Check if ComfyUI server is healthy, stop container if not."""
        import socket
        import urllib
        
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{self.port}/system_stats")
            urllib.request.urlopen(req, timeout=5)
            print("✓ ComfyUI server healthy")
        except (socket.timeout, urllib.error.URLError) as e:
            print(f"❌ Server health check failed: {e}")
            modal.experimental.stop_fetching_inputs()
            raise Exception("ComfyUI server not healthy, stopping container")
    
    @modal.method()
    def generate(
        self,
        prompt: str,
        width: int = 768,
        height: int = 512,
        num_frames: int = 97,
        seed: int | None = None,
        use_distilled: bool = True,
    ) -> bytes:
        """Generate video from text prompt using ComfyUI workflow.
        
        Args:
            prompt: Text description of the video
            width: Video width (must be divisible by 32)
            height: Video height (must be divisible by 32)
            num_frames: Number of frames (must be divisible by 8 + 1)
            seed: Random seed for reproducibility
            use_distilled: Use distilled model for faster generation
            
        Returns:
            Video bytes (MP4)
        """
        import random
        
        self.poll_server_health()
        
        # Generate unique ID for this request
        client_id = uuid.uuid4().hex
        
        # Load and modify workflow
        workflow = json.loads(Path("/root/workflow_t2v.json").read_text())
        
        # Update workflow parameters based on node class_type
        actual_seed = seed if seed is not None else random.randint(0, 2**32 - 1)
        
        for node_id, node in workflow.items():
            if isinstance(node, dict):
                inputs = node.get("inputs", {})
                class_type = node.get("class_type", "")
                
                # Update positive prompt (node 3 in our workflow)
                if class_type == "CLIPTextEncode" and node_id == "3":
                    inputs["text"] = prompt
                
                # Update dimensions in EmptyImage node
                if class_type == "EmptyImage":
                    inputs["width"] = width
                    inputs["height"] = height
                
                # Update frame count in LTXVImgToVideo node
                if class_type == "LTXVImgToVideo":
                    inputs["length"] = num_frames
                
                # Update seed in SamplerCustom node
                if class_type == "SamplerCustom":
                    inputs["noise_seed"] = actual_seed
                
                # Update checkpoint
                if class_type == "CheckpointLoaderSimple":
                    if use_distilled:
                        inputs["ckpt_name"] = "ltx-2-19b-distilled-fp8.safetensors"
                    else:
                        inputs["ckpt_name"] = "ltx-2-19b-dev-fp8.safetensors"
                
                # Update output filename prefix
                if class_type == "SaveVideo":
                    inputs["filename_prefix"] = client_id
        
        # Save modified workflow
        workflow_path = f"/tmp/{client_id}.json"
        Path(workflow_path).write_text(json.dumps(workflow))
        
        print(f"🎬 Generating video: {prompt[:50]}...")
        print(f"   Resolution: {width}x{height}, Frames: {num_frames}")
        print(f"   Model: {'distilled' if use_distilled else 'full'}")
        
        # Run the workflow
        cmd = f"comfy run --workflow {workflow_path} --wait --timeout 1200 --verbose"
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        print(result.stdout)
        
        # Find output video
        output_dir = Path(f"{COMFYUI_ROOT}/output")
        for f in output_dir.iterdir():
            if f.name.startswith(client_id) and f.suffix == ".mp4":
                video_bytes = f.read_bytes()
                print(f"📹 Video size: {len(video_bytes) / 1024:.1f} KB")
                return video_bytes
        
        raise Exception("No output video found")
    
    def _verify_token(self, token: str | None) -> None:
        """Verify the Enter token, raise HTTPException if invalid."""
        from fastapi import HTTPException
        
        expected_token = os.environ.get("ENTER_TOKEN")
        if not expected_token:
            raise HTTPException(status_code=500, detail="ENTER_TOKEN not configured")
        if not token or token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid or missing x-enter-token")
    
    @modal.fastapi_endpoint(method="POST")
    def generate_post(
        self,
        req: Dict,
        x_enter_token: str | None = None,
    ):
        """Web endpoint for video generation (POST). Requires x-enter-token header."""
        from fastapi.responses import Response
        
        self._verify_token(x_enter_token)
        
        video_bytes = self.generate.local(
            prompt=req.get("prompt", "A beautiful sunset over the ocean"),
            width=req.get("width", 768),
            height=req.get("height", 512),
            num_frames=req.get("num_frames", 97),
            seed=req.get("seed"),
            use_distilled=req.get("use_distilled", True),
        )
        
        return Response(content=video_bytes, media_type="video/mp4")


@app.local_entrypoint()
def main(
    prompt: str = "A cat walking through a beautiful garden with flowers",
    width: int = 768,
    height: int = 512,
    num_frames: int = 97,
    seed: int | None = None,
    use_distilled: bool = True,
    output: str = "/tmp/ltx2-comfyui-output.mp4",
):
    """Generate a video with LTX-2 using ComfyUI workflows."""
    print(f"🎬 LTX-2 Video Generation (ComfyUI)")
    print(f"   Prompt: {prompt}")
    print(f"   Resolution: {width}x{height}")
    print(f"   Frames: {num_frames} @ 24fps = {num_frames/24:.1f}s")
    print(f"   Model: {'distilled (fast)' if use_distilled else 'full (quality)'}")
    
    import time
    t0 = time.time()
    
    video_bytes = LTX2ComfyUI().generate.remote(
        prompt=prompt,
        width=width,
        height=height,
        num_frames=num_frames,
        seed=seed,
        use_distilled=use_distilled,
    )
    
    total_time = time.time() - t0
    print(f"⏱️ Total time (including cold start): {total_time:.2f}s")
    
    output_path = Path(output)
    output_path.parent.mkdir(exist_ok=True, parents=True)
    output_path.write_bytes(video_bytes)
    print(f"💾 Saved video to {output_path}")
