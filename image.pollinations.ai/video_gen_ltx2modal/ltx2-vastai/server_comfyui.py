"""
LTX-2 ComfyUI wrapper server for GH200.
Patched ComfyUI (model_management.py 1e32 fix) with two-stage upscaler.
Includes watchdog that auto-restarts ComfyUI if it crashes.
"""
import hashlib, json, os, random, subprocess, threading, time, urllib.request, urllib.parse, logging
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("ltx2")

COMFYUI_ROOT = os.environ.get("COMFYUI_ROOT", "/home/ubuntu/comfy/ComfyUI")
COMFYUI_LOG = os.environ.get("COMFYUI_LOG", "/home/ubuntu/comfy/comfyui.log")
WORKFLOW_PATH = os.environ.get("WORKFLOW_PATH", "/home/ubuntu/ltx2/workflow.json")
COMFY_BASE = "http://127.0.0.1:8188"

PROMPT_NODE = "177:109"
WIDTH_HEIGHT_NODE = "177:131"
FRAME_COUNT_NODE = "177:113"
SEED_NODES = ["177:118", "177:123"]

# I2V splice points (see workflow.json)
EMPTY_LATENT_NODE = "177:116"            # EmptyLTXVLatentVideo, consumed by 177:132.video_latent
CHECKPOINT_NODE = "177:100"              # CheckpointLoaderSimple — outputs [MODEL, CLIP, VAE]; VAE index = 2
CONDITIONING_NODE = "177:103"            # LTXVConditioning — outputs [positive, negative]
COMFY_INPUT_DIR = os.environ.get("COMFY_INPUT_DIR", "/home/ubuntu/comfy/ComfyUI/input")
I2V_LOAD_NODE = "ltx_i2v_load_image"
I2V_NODE = "ltx_i2v_img_to_video"

REGISTER_URL = os.environ.get("REGISTER_URL", "https://gen.pollinations.ai/register")
PUBLIC_IP = os.environ.get("PUBLIC_IP", "")
PUBLIC_PORT = os.environ.get("PUBLIC_PORT", "")
SERVICE_TYPE = os.environ.get("SERVICE_TYPE", "ltx2")
PLN_TOKEN = os.environ.get("PLN_GPU_TOKEN", "")
PORT = int(os.environ.get("PORT", "8765"))

comfy_proc = None

def start_comfyui():
    global comfy_proc
    if comfy_proc:
        comfy_proc.kill()
        comfy_proc.wait()
    log.info("Starting ComfyUI...")
    comfy_proc = subprocess.Popen(
        ["python3", "main.py", "--listen", "127.0.0.1", "--port", "8188"],
        cwd=COMFYUI_ROOT,
        stdout=open(COMFYUI_LOG, "a"),
        stderr=subprocess.STDOUT,
    )
    for i in range(120):
        try:
            urllib.request.urlopen("%s/system_stats" % COMFY_BASE, timeout=1)
            log.info("ComfyUI ready after %ds", i)
            return True
        except Exception:
            time.sleep(1)
    log.error("ComfyUI failed to start")
    return False

def watchdog_loop():
    while True:
        time.sleep(30)
        try:
            urllib.request.urlopen("%s/system_stats" % COMFY_BASE, timeout=2)
        except Exception:
            log.warning("ComfyUI down, restarting...")
            start_comfyui()

def heartbeat_loop():
    if not PUBLIC_IP or not PLN_TOKEN:
        log.warning("No PUBLIC_IP or PLN_GPU_TOKEN set, skipping heartbeat")
        return
    port = PUBLIC_PORT or str(PORT)
    url = "%s?port=%s&ip=%s&type=%s&token=%s" % (REGISTER_URL, port, PUBLIC_IP, SERVICE_TYPE, PLN_TOKEN)
    while True:
        try:
            urllib.request.urlopen(url, timeout=5)
            log.debug("Heartbeat sent")
        except Exception as e:
            log.warning("Heartbeat failed: %s", e)
        time.sleep(30)

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_comfyui()
    threading.Thread(target=watchdog_loop, daemon=True).start()
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    log.info("Server ready on port %d", PORT)
    yield

app = FastAPI(title="LTX-2 Video Server (ComfyUI)", lifespan=lifespan)

BACKEND_TOKEN = os.environ.get("PLN_GPU_TOKEN", "")

@app.middleware("http")
async def verify_backend_token(request: Request, call_next):
    if BACKEND_TOKEN and request.url.path not in ("/health",):
        token = request.headers.get("x-backend-token", "")
        if token != BACKEND_TOKEN:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"error": "Unauthorized"})
    return await call_next(request)

class EnqueueRequest(BaseModel):
    prompt: str
    width: int = 720
    height: int = 720
    frame_count: int = 121
    image_url: Optional[str] = None


def _download_init_image(image_url: str) -> str:
    """Download a public image URL into ComfyUI's input dir; return filename."""
    parsed = urllib.parse.urlparse(image_url)
    ext = Path(parsed.path).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        ext = ".png"
    name = hashlib.sha256(image_url.encode()).hexdigest()[:24] + ext
    Path(COMFY_INPUT_DIR).mkdir(parents=True, exist_ok=True)
    dest = Path(COMFY_INPUT_DIR) / name
    if not dest.exists():
        req = urllib.request.Request(image_url, headers={"User-Agent": "pollinations-ltx2/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            dest.write_bytes(r.read())
    return name


def _patch_workflow_for_i2v(wf: dict, image_filename: str) -> None:
    """Inject LoadImage + LTXVImgToVideo, rewire latent + conditioning consumers."""
    empty = wf.get(EMPTY_LATENT_NODE)
    if not empty:
        return
    width_in = empty["inputs"]["width"]
    height_in = empty["inputs"]["height"]
    length_in = empty["inputs"]["length"]

    wf[I2V_LOAD_NODE] = {
        "class_type": "LoadImage",
        "inputs": {"image": image_filename},
        "_meta": {"title": "Load Init Image (I2V)"},
    }
    wf[I2V_NODE] = {
        "class_type": "LTXVImgToVideo",
        "inputs": {
            "positive": [CONDITIONING_NODE, 0],
            "negative": [CONDITIONING_NODE, 1],
            "vae": [CHECKPOINT_NODE, 2],
            "image": [I2V_LOAD_NODE, 0],
            "width": width_in,
            "height": height_in,
            "length": length_in,
            "batch_size": 1,
            "strength": 1.0,
        },
        "_meta": {"title": "LTXV Image to Video (I2V)"},
    }
    # Rewire: any consumer of (EMPTY_LATENT_NODE, *) -> (I2V_NODE, 2)  (latent output index)
    # Rewire: any consumer of (CONDITIONING_NODE, 0) -> (I2V_NODE, 0)  (image-conditioned positive)
    # Rewire: any consumer of (CONDITIONING_NODE, 1) -> (I2V_NODE, 1)  (image-conditioned negative)
    for nid, node in wf.items():
        if nid in (I2V_NODE, I2V_LOAD_NODE):
            continue  # don't rewire the new nodes' own inputs
        inputs = node.get("inputs", {})
        for k, v in list(inputs.items()):
            if not (isinstance(v, list) and len(v) == 2):
                continue
            src_id, src_idx = v
            if src_id == EMPTY_LATENT_NODE:
                inputs[k] = [I2V_NODE, 2]
            elif src_id == CONDITIONING_NODE and src_idx == 0:
                inputs[k] = [I2V_NODE, 0]
            elif src_id == CONDITIONING_NODE and src_idx == 1:
                inputs[k] = [I2V_NODE, 1]


@app.post("/enqueue")
def enqueue(req: EnqueueRequest):
    wf = json.loads(Path(WORKFLOW_PATH).read_text())
    wf[PROMPT_NODE]["inputs"]["value"] = req.prompt
    wf[WIDTH_HEIGHT_NODE]["inputs"]["width"] = req.width
    wf[WIDTH_HEIGHT_NODE]["inputs"]["height"] = req.height
    wf[FRAME_COUNT_NODE]["inputs"]["value"] = req.frame_count

    if req.image_url:
        image_filename = _download_init_image(req.image_url)
        _patch_workflow_for_i2v(wf, image_filename)

    seed = random.randint(0, 2**32 - 1)
    for nid in SEED_NODES:
        if nid in wf:
            wf[nid]["inputs"]["seed"] = seed
    payload = json.dumps({"prompt": wf}).encode()
    req2 = urllib.request.Request("%s/prompt" % COMFY_BASE, data=payload, headers={"Content-Type": "application/json"})
    resp = json.loads(urllib.request.urlopen(req2).read())
    prompt_id = resp.get("prompt_id")
    if not prompt_id:
        raise HTTPException(500, "No prompt_id from ComfyUI")
    mode = "i2v" if req.image_url else "t2v"
    log.info("Enqueued %s [%s]: %dx%d %d frames", prompt_id[:8], mode, req.width, req.height, req.frame_count)
    return {"prompt_id": prompt_id}

@app.get("/status")
def status(prompt_id: str = Query(...)):
    hist = json.loads(urllib.request.urlopen("%s/history/%s" % (COMFY_BASE, prompt_id)).read())
    if prompt_id not in hist:
        return {"status": "running"}
    st = hist[prompt_id].get("status", {})
    if st.get("status_str") == "error":
        msgs = st.get("messages", [])
        err = "unknown error"
        for m in msgs:
            if len(m) > 1 and isinstance(m[1], dict):
                err = m[1].get("exception_message", err)
        raise HTTPException(500, err)
    outputs = hist[prompt_id].get("outputs", {})
    for node_out in outputs.values():
        for key in ("gifs", "images"):
            items = node_out.get(key, [])
            if items:
                fn = items[0].get("filename", "")
                if fn.endswith((".mp4", ".webm")):
                    return {"status": "done", "content_type": "video/mp4"}
    return {"status": "running"}

@app.get("/result")
def result(prompt_id: str = Query(...)):
    hist = json.loads(urllib.request.urlopen("%s/history/%s" % (COMFY_BASE, prompt_id)).read())
    if prompt_id not in hist:
        return Response("Not ready", status_code=202, media_type="text/plain")
    outputs = hist[prompt_id].get("outputs", {})
    for node_out in outputs.values():
        for key in ("gifs", "images"):
            items = node_out.get(key, [])
            if items:
                d = items[0]
                fn = d.get("filename", "")
                if fn.endswith((".mp4", ".webm")):
                    params = urllib.parse.urlencode({"filename": fn, "subfolder": d.get("subfolder", ""), "type": d.get("type", "output")})
                    with urllib.request.urlopen("%s/view?%s" % (COMFY_BASE, params)) as r:
                        data = r.read()
                    ctype = "video/webm" if fn.endswith(".webm") else "video/mp4"
                    log.info("Serving %s: %.1f MB", prompt_id[:8], len(data)/1024/1024)
                    return Response(content=data, media_type=ctype)
    return Response("Not ready", status_code=202, media_type="text/plain")

@app.get("/health")
def health():
    try:
        urllib.request.urlopen("%s/system_stats" % COMFY_BASE, timeout=2)
        return {"status": "healthy", "model": "ltx-2-comfyui"}
    except Exception as e:
        raise HTTPException(503, "ComfyUI unhealthy: %s" % e)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
