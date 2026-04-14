"""
LTX-2 ComfyUI wrapper server for Vast.ai
Exposes /enqueue, /status, /result endpoints matching the API expected by ltx2VideoModel.ts
Also handles heartbeat registration with the EC2 gateway.
"""

import json, os, random, threading, time, urllib.request, urllib.parse, subprocess, logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("ltx2")

COMFYUI_ROOT = os.environ.get("COMFYUI_ROOT", "/root/comfy/ComfyUI")
WORKFLOW_PATH = os.environ.get("WORKFLOW_PATH", "/root/ltx2/workflow.json")
COMFY_HOST = "127.0.0.1"
COMFY_PORT = 8188
COMFY_BASE = f"http://{COMFY_HOST}:{COMFY_PORT}"

# Workflow node IDs (from video_ltx2_t2v_distilled_fp4.json)
PROMPT_NODE = "177:109"
WIDTH_HEIGHT_NODE = "177:131"
FRAME_COUNT_NODE = "177:113"
SEED_NODES = ["177:118", "177:123"]

# Heartbeat config
REGISTER_URL = os.environ.get("REGISTER_URL", "http://ec2-54-147-14-220.compute-1.amazonaws.com:16384/register")
PUBLIC_IP = os.environ.get("PUBLIC_IP", "")
PUBLIC_PORT = os.environ.get("PUBLIC_PORT", "")
SERVICE_TYPE = os.environ.get("SERVICE_TYPE", "ltx2")
PLN_TOKEN = os.environ.get("PLN_GPU_TOKEN", "")
PORT = int(os.environ.get("PORT", "8765"))

comfy_proc = None

def start_comfyui():
    global comfy_proc
    log.info("Starting ComfyUI...")
    comfy_proc = subprocess.Popen(
        f"comfy launch -- --listen {COMFY_HOST} --port {COMFY_PORT} --gpu-only --disable-dynamic-vram",
        shell=True, cwd=COMFYUI_ROOT,
    )
    # Wait for health
    for i in range(120):
        try:
            urllib.request.urlopen(f"{COMFY_BASE}/system_stats", timeout=1)
            log.info("ComfyUI healthy after %ds", i)
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("ComfyUI did not start within 120s")

def heartbeat_loop():
    if not PUBLIC_IP or not PLN_TOKEN:
        log.warning("No PUBLIC_IP or PLN_GPU_TOKEN set, skipping heartbeat")
        return
    port = PUBLIC_PORT or str(PORT)
    url = f"{REGISTER_URL}?port={port}&ip={PUBLIC_IP}&type={SERVICE_TYPE}&token={PLN_TOKEN}"
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
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    log.info("Server ready on port %d", PORT)
    yield

app = FastAPI(title="LTX-2 Video Server", lifespan=lifespan)

@app.middleware("http")
async def verify_backend_token(request: Request, call_next):
    if PLN_TOKEN and request.url.path not in ("/health",):
        token = request.headers.get("x-backend-token", "")
        if token != PLN_TOKEN:
            return JSONResponse(status_code=403, content={"error": "Unauthorized"})
    return await call_next(request)

class EnqueueRequest(BaseModel):
    prompt: str
    width: int = 720
    height: int = 720
    frame_count: int = 121

def queue_prompt(workflow: dict) -> dict:
    payload = json.dumps({"prompt": workflow}).encode()
    req = urllib.request.Request(f"{COMFY_BASE}/prompt", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def get_history(prompt_id: str) -> dict:
    with urllib.request.urlopen(f"{COMFY_BASE}/history/{prompt_id}") as r:
        return json.loads(r.read())

def extract_video(history: dict, prompt_id: str):
    outputs = history.get(prompt_id, {}).get("outputs", {})
    for node_out in outputs.values():
        for key in ("gifs", "images"):
            items = node_out.get(key, [])
            if items:
                d = items[0]
                fn = d.get("filename", "")
                if fn.endswith((".mp4", ".webm")) or key == "gifs":
                    ctype = "video/webm" if fn.endswith(".webm") else "video/mp4"
                    return d, ctype
    return None, None

@app.post("/enqueue")
def enqueue(req: EnqueueRequest):
    wf = json.loads(Path(WORKFLOW_PATH).read_text())

    wf[PROMPT_NODE]["inputs"]["value"] = req.prompt
    wf[WIDTH_HEIGHT_NODE]["inputs"]["width"] = req.width
    wf[WIDTH_HEIGHT_NODE]["inputs"]["height"] = req.height
    wf[FRAME_COUNT_NODE]["inputs"]["value"] = req.frame_count

    seed = random.randint(0, 2**32 - 1)
    for nid in SEED_NODES:
        if nid in wf:
            wf[nid]["inputs"]["seed"] = seed

    resp = queue_prompt(wf)
    prompt_id = resp.get("prompt_id")
    if not prompt_id:
        raise HTTPException(500, "No prompt_id from ComfyUI")
    log.info("Enqueued %s: %dx%d %d frames", prompt_id[:8], req.width, req.height, req.frame_count)
    return {"prompt_id": prompt_id}

@app.get("/status")
def status(prompt_id: str = Query(...)):
    hist = get_history(prompt_id)
    out, ctype = extract_video(hist, prompt_id)
    if out is None:
        return {"status": "running"}
    return {"status": "done", "output": out, "content_type": ctype}

@app.get("/result")
def result(prompt_id: str = Query(...)):
    hist = get_history(prompt_id)
    out, ctype = extract_video(hist, prompt_id)
    if out is None:
        return Response("Not ready", status_code=202, media_type="text/plain")
    params = urllib.parse.urlencode({"filename": out["filename"], "subfolder": out.get("subfolder", ""), "type": out.get("type", "output")})
    with urllib.request.urlopen(f"{COMFY_BASE}/view?{params}") as r:
        data = r.read()
    log.info("Serving result %s: %.1f MB", prompt_id[:8], len(data)/1024/1024)
    return Response(content=data, media_type=ctype)

@app.get("/health")
def health():
    try:
        urllib.request.urlopen(f"{COMFY_BASE}/system_stats", timeout=2)
        return {"status": "healthy", "model": "ltx-2"}
    except Exception as e:
        raise HTTPException(503, f"ComfyUI unhealthy: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
