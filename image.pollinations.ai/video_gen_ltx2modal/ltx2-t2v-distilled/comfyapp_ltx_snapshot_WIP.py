"""
LTX-2 ComfyUI on Modal with CPU memory snapshotting for fast cold starts.

Uses ExperimentalComfyServer pattern to run ComfyUI in-process (no subprocess),
monkeypatching torch.cuda during init so Modal can snapshot CPU memory.
Subsequent cold starts restore from snapshot in ~3s instead of ~60-100s.
"""

import json
import os
import sys
import random
import time
import asyncio
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from contextlib import contextmanager

import modal
from fastapi import Response

APP_NAME = "ltx2-comfyui-snapshot-v5"
HF_CACHE_VOLUME_NAME = "hf-hub-cache-distilled"

CACHE_MOUNT = "/cache"
COMFYUI_ROOT = "/root/comfy/ComfyUI"

WORKFLOW_FILENAME = "video_ltx2_t2v_distilled.json"
WORKFLOW_LOCAL_PATH = Path(__file__).parent / WORKFLOW_FILENAME
WORKFLOW_CONTAINER_PATH = Path("/root") / WORKFLOW_FILENAME

# Workflow node IDs (must match exported API workflow)
PROMPT_NODE_ID = "177:109"
PROMPT_INPUT_KEY = "value"
WIDTH_NODE_ID = "177:131"
WIDTH_INPUT_KEY = "width"
HEIGHT_NODE_ID = "177:131"
HEIGHT_INPUT_KEY = "height"
FRAME_COUNT_NODE_ID = "177:113"
FRAME_COUNT_INPUT_KEY = "value"

DEFAULT_TIMEOUT_SECS = 1200

MODEL_MAP = [
    {"repo": "Lightricks/LTX-2", "filename": "ltx-2-19b-distilled.safetensors", "dest": "checkpoints/ltx-2-19b-distilled.safetensors"},
    {"repo": "Comfy-Org/ltx-2", "filename": "split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors", "dest": "text_encoders/gemma_3_12B_it_fp4_mixed.safetensors"},
    {"repo": "Comfy-Org/ltx-2", "filename": "split_files/text_encoders/gemma_3_12B_it.safetensors", "dest": "text_encoders/gemma_3_12B_it.safetensors"},
    {"repo": "Lightricks/LTX-2", "filename": "ltx-2-spatial-upscaler-x2-1.0.safetensors", "dest": "latent_upscale_models/ltx-2-spatial-upscaler-x2-1.0.safetensors"},
    {"repo": "Lightricks/LTX-2", "filename": "ltx-2-19b-distilled-lora-384.safetensors", "dest": "loras/ltx-2-19b-distilled-lora-384.safetensors"},
    {"repo": "Lightricks/LTX-2-19b-LoRA-Camera-Control-Dolly-Left", "filename": "ltx-2-19b-lora-camera-control-dolly-left.safetensors", "dest": "loras/ltx-2-19b-lora-camera-control-dolly-left.safetensors"},
]


def build_image() -> modal.Image:
    img = (
        modal.Image.debian_slim(python_version="3.11")
        .apt_install("git", "ffmpeg")
        .uv_pip_install(
            "comfy-cli==1.5.4",
            "huggingface-hub==0.36.0",
            "websocket-client==1.8.0",
            "fastapi[standard]==0.115.4",
        )
        .run_commands("comfy --skip-prompt install --nvidia --version 0.8.1")
        .run_commands("pip uninstall -y utils python-utils 2>/dev/null; true")
        .add_local_file(
            str(Path(__file__).parent / "debug_utils2.py"),
            "/root/debug_utils.py",
        )
    )
    if WORKFLOW_LOCAL_PATH.exists():
        img = img.add_local_file(str(WORKFLOW_LOCAL_PATH), str(WORKFLOW_CONTAINER_PATH))
    return img


image = build_image()
app = modal.App(name=APP_NAME, image=image)
vol = modal.Volume.from_name(HF_CACHE_VOLUME_NAME, create_if_missing=True)


def _setup_models_from_cache() -> None:
    from huggingface_hub import hf_hub_download

    models_dir = Path(COMFYUI_ROOT) / "models"
    for sub in ["checkpoints", "loras", "text_encoders", "latent_upscale_models"]:
        (models_dir / sub).mkdir(parents=True, exist_ok=True)

    for item in MODEL_MAP:
        cached_path = hf_hub_download(
            repo_id=item["repo"],
            filename=item["filename"],
            cache_dir=CACHE_MOUNT,
            local_files_only=False,
        )
        target = models_dir / item["dest"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() or target.is_symlink():
            try:
                target.unlink()
            except FileNotFoundError:
                pass
        os.symlink(cached_path, target)


# ---------------------------------------------------------------------------
# Vendored ExperimentalComfyServer (adapted from modal-comfy-worker)
# Runs ComfyUI in-process so we can use @enter(snap=True) for snapshotting.
# ---------------------------------------------------------------------------

@contextmanager
def force_cpu_during_snapshot():
    """Monkeypatch torch CUDA checks so ComfyUI initializes without GPU."""
    import torch
    original_is_available = torch.cuda.is_available
    original_current_device = torch.cuda.current_device
    torch.cuda.is_available = lambda: False
    torch.cuda.current_device = lambda: torch.device("cpu")
    try:
        yield
    finally:
        torch.cuda.is_available = original_is_available
        torch.cuda.current_device = original_current_device


def _setup_comfyui_path():
    """Set up sys.path and cwd for ComfyUI imports.
    
    Root cause of the import conflict:
    ComfyUI has both comfy/utils.py (a file) and utils/ (a package directory).
    When 'import nodes' loads comfy.utils, Python caches it. Later when
    server.py does 'from utils.install_util import ...', Python finds the
    cached comfy/utils.py (a file, not a package) and fails.
    
    Fix: Pre-register the top-level utils/ package in sys.modules BEFORE
    any other ComfyUI imports, so it can't be shadowed.
    """
    os.chdir(COMFYUI_ROOT)
    while COMFYUI_ROOT in sys.path:
        sys.path.remove(COMFYUI_ROOT)
    sys.path.insert(0, COMFYUI_ROOT)
    sys.stdout.reconfigure(line_buffering=True)

    # Pre-register ComfyUI's top-level utils/ and app/ packages
    # This MUST happen before any other ComfyUI import (especially nodes/comfy)
    import importlib.util
    for pkg_name in ("utils", "app"):
        pkg_dir = os.path.join(COMFYUI_ROOT, pkg_name)
        init_file = os.path.join(pkg_dir, "__init__.py")
        if os.path.isfile(init_file):
            spec = importlib.util.spec_from_file_location(
                pkg_name,
                init_file,
                submodule_search_locations=[pkg_dir],
            )
            mod = importlib.util.module_from_spec(spec)
            sys.modules[pkg_name] = mod
            spec.loader.exec_module(mod)
            print(f"[snapshot] Pre-registered {pkg_name} -> {init_file}")

    print(f"[snapshot] CWD = {os.getcwd()}")


def _init_comfyui_and_create_executor():
    """Initialize ComfyUI in-process and create a PromptExecutor."""
    _setup_comfyui_path()

    # Import server FIRST (needs utils.install_util which we pre-registered)
    print("[snapshot] Importing ComfyUI server module...")
    import server as server_mod
    print("[snapshot] Importing ComfyUI execution module...")
    import execution as execution_mod
    print("[snapshot] Importing ComfyUI nodes module...")
    import nodes

    # Initialize custom nodes
    start = time.time()
    result = nodes.init_extra_nodes()
    if asyncio.iscoroutine(result):
        loop = asyncio.new_event_loop()
        loop.run_until_complete(result)
        loop.close()
    print(f"[snapshot] Node init took {time.time() - start:.2f}s")

    # Create event loop and executor
    event_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(event_loop)

    class DummyServer(server_mod.PromptServer):
        def __init__(self, loop):
            super().__init__(loop)
            server_mod.PromptServer.instance = self
            self.prompt_queue = execution_mod.PromptQueue(self)
            self.client_id = "snapshot-worker"

        def send_sync(self, event, data, sid=None):
            pass  # No websocket clients

    dummy = DummyServer(event_loop)
    executor = execution_mod.PromptExecutor(dummy, cache_args={"ram": 16.0, "lru": 0})
    return executor, dummy


def _find_video_output(prompt_id: str) -> Tuple[Optional[bytes], Optional[str]]:
    """Find the generated video file in ComfyUI output directory."""
    output_dir = Path(COMFYUI_ROOT) / "output" / "video"
    if not output_dir.exists():
        output_dir = Path(COMFYUI_ROOT) / "output"

    # Look for recently created video files
    video_files = []
    for ext in ("*.mp4", "*.webm"):
        video_files.extend(output_dir.rglob(ext))

    if not video_files:
        return None, None

    # Get the most recently modified video
    latest = max(video_files, key=lambda f: f.stat().st_mtime)
    content_type = "video/webm" if latest.suffix == ".webm" else "video/mp4"
    return latest.read_bytes(), content_type


# ---------------------------------------------------------------------------
# Modal class with snapshotting
# ---------------------------------------------------------------------------

@app.cls(
    gpu="H200",
    volumes={CACHE_MOUNT: vol},
    min_containers=0,
    max_containers=1,
    scaledown_window=90,
    timeout=3600,
    enable_memory_snapshot=True,
)
@modal.concurrent(max_inputs=1)
class ComfyRunner:
    executor: Any = None

    @modal.enter(snap=True)
    def snapshot_init(self):
        """Runs once to create the snapshot. No GPU needed here."""
        print("[snapshot] Setting up models from cache...")
        _setup_models_from_cache()

        print("[snapshot] Initializing ComfyUI in-process (CPU only)...")
        with force_cpu_during_snapshot():
            self.executor, self.server = _init_comfyui_and_create_executor()

        print("[snapshot] Snapshot init complete. Ready for snapshotting.")

    @modal.enter(snap=False)
    def post_restore(self):
        """Runs after snapshot restore. GPU is now available."""
        print("[restore] GPU available, ready to execute workflows.")

    @modal.method()
    def generate(self, prompt: str, width: int, height: int, frame_count: int) -> Tuple[Optional[bytes], Optional[str]]:
        """Execute workflow and return video bytes + content_type."""
        import importlib
        execution = importlib.import_module("execution")
        import torch

        wf = json.loads(WORKFLOW_CONTAINER_PATH.read_text())

        # Set workflow parameters
        wf[PROMPT_NODE_ID]["inputs"][PROMPT_INPUT_KEY] = prompt
        wf[WIDTH_NODE_ID]["inputs"][WIDTH_INPUT_KEY] = int(width)
        wf[HEIGHT_NODE_ID]["inputs"][HEIGHT_INPUT_KEY] = int(height)
        wf[FRAME_COUNT_NODE_ID]["inputs"][FRAME_COUNT_INPUT_KEY] = int(frame_count)

        seed = random.randint(0, 2**32 - 1)
        for n in wf.values():
            inp = n.get("inputs", {})
            if "seed" in inp:
                inp["seed"] = seed

        prompt_id = str(uuid.uuid4())
        print(f"[generate] Starting workflow {prompt_id}: '{prompt}' {width}x{height} {frame_count}f")

        # Validate (async in ComfyUI 0.8.1)
        loop = asyncio.new_event_loop()
        is_valid, error, outputs_to_execute, node_errors = loop.run_until_complete(
            execution.validate_prompt(prompt_id, wf, None)
        )
        if not is_valid:
            raise RuntimeError(f"Workflow validation failed: {error}")

        # Execute in-process
        start = time.time()
        with torch.inference_mode():
            self.executor.execute(
                prompt=wf,
                prompt_id=prompt_id,
                extra_data={"client_id": prompt_id},
                execute_outputs=outputs_to_execute,
            )
        elapsed = time.time() - start
        print(f"[generate] Execution took {elapsed:.1f}s")

        # Find the output video
        data, ctype = _find_video_output(prompt_id)
        if data is None:
            raise RuntimeError("No video output found after execution")

        print(f"[generate] Video ready: {len(data) / 1024 / 1024:.2f} MB ({ctype})")
        return data, ctype


# --------------------
# Protected endpoints (require Modal Proxy Auth Token)
# --------------------

@app.function(timeout=1800, max_containers=1)
@modal.web_endpoint(method="POST", requires_proxy_auth=True)
def enqueue(item: Dict[str, Any]):
    """Synchronous generation — returns video directly."""
    prompt = (item or {}).get("prompt")
    if not prompt:
        return Response("Missing 'prompt'", status_code=400, media_type="text/plain")

    width = int(item.get("width", 720))
    height = int(item.get("height", 720))
    frame_count = int(item.get("frame_count", 121))

    # Generate synchronously and return prompt_id for compatibility
    # The actual generation happens when result is fetched
    pid = str(uuid.uuid4())

    # Store params for later retrieval (use a simple approach: generate immediately)
    data, ctype = ComfyRunner().generate.remote(prompt, width, height, frame_count)
    if data is None:
        return Response("Generation failed", status_code=500, media_type="text/plain")

    # For backward compatibility, return the video directly
    return Response(content=data, media_type=ctype)


