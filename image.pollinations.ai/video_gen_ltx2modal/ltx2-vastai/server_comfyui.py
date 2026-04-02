"""
LTX-2 ComfyUI wrapper server for GH200.
Patched ComfyUI (model_management.py 1e32 fix) with two-stage upscaler.
Includes watchdog that auto-restarts ComfyUI if it crashes.
"""
import json, os, random, subprocess, threading, time, urllib.request, urllib.parse, logging
from pathlib import Path
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

REGISTER_URL = os.environ.get("REGISTER_URL", "http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register")
PUBLIC_IP = os.environ.get("PUBLIC_IP", "")
PUBLIC_PORT = os.environ.get("PUBLIC_PORT", "")
SERVICE_TYPE = os.environ.get("SERVICE_TYPE", "ltx2")
PLN_TOKEN = os.environ.get("PLN_IMAGE_BACKEND_TOKEN", "")
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
        log.warning("No PUBLIC_IP or PLN_IMAGE_BACKEND_TOKEN set, skipping heartbeat")
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

BACKEND_TOKEN = os.environ.get("PLN_IMAGE_BACKEND_TOKEN", "")

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
    payload = json.dumps({"prompt": wf}).encode()
    req2 = urllib.request.Request("%s/prompt" % COMFY_BASE, data=payload, headers={"Content-Type": "application/json"})
    resp = json.loads(urllib.request.urlopen(req2).read())
    prompt_id = resp.get("prompt_id")
    if not prompt_id:
        raise HTTPException(500, "No prompt_id from ComfyUI")
    log.info("Enqueued %s: %dx%d %d frames", prompt_id[:8], req.width, req.height, req.frame_count)
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
