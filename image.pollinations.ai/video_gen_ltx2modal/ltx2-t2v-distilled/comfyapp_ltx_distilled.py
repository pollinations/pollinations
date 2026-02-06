import json
import os
import random
import subprocess
import time
import uuid
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import modal
from fastapi import Response  # just for Response object

APP_NAME = "ltx2-comfyui-api-distilled"
HF_CACHE_VOLUME_NAME = "hf-hub-cache-distilled"

CACHE_MOUNT = "/cache"
COMFYUI_ROOT = "/root/comfy/ComfyUI"

COMFY_HOST = "127.0.0.1"
COMFY_PORT = 8188
COMFY_BASE = f"http://{COMFY_HOST}:{COMFY_PORT}"

WORKFLOW_FILENAME = "video_ltx2_t2v_distilled.json"
WORKFLOW_LOCAL_PATH = Path(__file__).parent / WORKFLOW_FILENAME
WORKFLOW_CONTAINER_PATH = Path("/root") / WORKFLOW_FILENAME

# update these to match your exported API workflow
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
            local_files_only=False,  # Allow downloading if not cached
        )
        target = models_dir / item["dest"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() or target.is_symlink():
            try:
                target.unlink()
            except FileNotFoundError:
                pass
        os.symlink(cached_path, target)


def _poll_health() -> None:
    for _ in range(90):
        try:
            urllib.request.urlopen(f"{COMFY_BASE}/system_stats", timeout=1)
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("ComfyUI did not become healthy.")


def _queue_prompt(workflow: Dict[str, Any]) -> Dict[str, Any]:
    payload = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_BASE}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def _get_history(prompt_id: str) -> Dict[str, Any]:
    with urllib.request.urlopen(f"{COMFY_BASE}/history/{prompt_id}") as r:
        return json.loads(r.read())


def _get_view(filename: str, subfolder: str, folder_type: str) -> bytes:
    import urllib.parse
    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": folder_type})
    with urllib.request.urlopen(f"{COMFY_BASE}/view?{params}") as r:
        return r.read()


def _extract_video(history: Dict[str, Any], prompt_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Returns (output_entry, content_type) or (None, None) if not ready / not found yet.
    """
    outputs = history.get(prompt_id, {}).get("outputs", {})
    for node_out in outputs.values():
        if "gifs" in node_out and node_out["gifs"]:
            d = node_out["gifs"][0]
            fn = d.get("filename", "")
            return d, ("video/webm" if fn.endswith(".webm") else "video/mp4")
        if "images" in node_out and node_out["images"]:
            d = node_out["images"][0]
            fn = d.get("filename", "")
            if fn.endswith((".mp4", ".webm")):
                return d, ("video/webm" if fn.endswith(".webm") else "video/mp4")
    return None, None


@app.cls(
    gpu="H200",
    volumes={CACHE_MOUNT: vol},
    min_containers=0,
    max_containers=1,
    scaledown_window=90,   # low idle hold
    timeout=3600,
)
@modal.concurrent(max_inputs=1)  # single-tenant per container is simplest
class ComfyRunner:
    proc: Optional[subprocess.Popen] = None

    @modal.enter()
    def start(self):
        _setup_models_from_cache()
        self.proc = subprocess.Popen(
            f"comfy launch -- --listen {COMFY_HOST} --port {COMFY_PORT}",
            shell=True,
            cwd=COMFYUI_ROOT,
        )
        _poll_health()

    @modal.method()
    def enqueue(self, prompt: str, width: int, height: int, frame_count: int) -> str:
        wf = json.loads(WORKFLOW_CONTAINER_PATH.read_text())

        wf[PROMPT_NODE_ID]["inputs"][PROMPT_INPUT_KEY] = prompt
        wf[WIDTH_NODE_ID]["inputs"][WIDTH_INPUT_KEY] = int(width)
        wf[HEIGHT_NODE_ID]["inputs"][HEIGHT_INPUT_KEY] = int(height)
        wf[FRAME_COUNT_NODE_ID]["inputs"][FRAME_COUNT_INPUT_KEY] = int(frame_count)

        seed = random.randint(0, 2**32 - 1)
        for n in wf.values():
            inp = n.get("inputs", {})
            if "seed" in inp:
                inp["seed"] = seed

        resp = _queue_prompt(wf)
        return resp["prompt_id"]

    @modal.method()
    def status(self, prompt_id: str) -> Dict[str, Any]:
        hist = _get_history(prompt_id)
        out, ctype = _extract_video(hist, prompt_id)
        if out is None:
            return {"status": "running"}
        return {"status": "done", "output": out, "content_type": ctype}

    @modal.method()
    def result(self, prompt_id: str) -> Tuple[Optional[bytes], Optional[str]]:
        hist = _get_history(prompt_id)
        out, ctype = _extract_video(hist, prompt_id)
        if out is None:
            return None, None
        data = _get_view(out["filename"], out.get("subfolder", ""), out.get("type", "output"))
        return data, ctype


# --------------------
# Protected endpoints (require Modal Proxy Auth Token)
# --------------------

@app.function(timeout=1800, max_containers=1)  # 30 min for model download on first run
@modal.web_endpoint(method="POST", requires_proxy_auth=True)
def enqueue(item: Dict[str, Any]):
    prompt = (item or {}).get("prompt")
    if not prompt:
        return Response("Missing 'prompt'", status_code=400, media_type="text/plain")

    width = int(item.get("width", 720))
    height = int(item.get("height", 720))
    frame_count = int(item.get("frame_count", 121))

    pid = ComfyRunner().enqueue.remote(prompt, width, height, frame_count)
    return {"prompt_id": pid}


@app.function(timeout=60, max_containers=1)
@modal.web_endpoint(method="GET", requires_proxy_auth=True)
def status(prompt_id: str):
    return ComfyRunner().status.remote(prompt_id)


@app.function(timeout=600, max_containers=1)
@modal.web_endpoint(method="GET", requires_proxy_auth=True)
def result(prompt_id: str):
    data, ctype = ComfyRunner().result.remote(prompt_id)
    if data is None:
        return Response("Not ready", status_code=202, media_type="text/plain")
    return Response(content=data, media_type=ctype)
