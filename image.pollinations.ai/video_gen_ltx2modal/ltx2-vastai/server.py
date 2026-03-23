"""
LTX-2 Video Generation Server for Vast.ai
Wraps ComfyUI with the same API contract as the Modal deployment.

Endpoints:
  POST /enqueue  — {prompt, width, height, frame_count} → {prompt_id}
  GET  /status   — ?prompt_id=... → {status: "running"|"done"|"error"}
  GET  /result   — ?prompt_id=... → binary video (mp4) or 202
  GET  /health   — health check
"""

import asyncio
import json
import logging
import os
import random
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

import aiohttp
import requests
import uvicorn
from fastapi import FastAPI, Header, Response
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("ltx2")

# ComfyUI config
COMFYUI_ROOT = os.getenv("COMFYUI_ROOT", "/root/ltx2/ComfyUI")
COMFY_HOST = "127.0.0.1"
COMFY_PORT = 8188
COMFY_BASE = f"http://{COMFY_HOST}:{COMFY_PORT}"

# Server config
PORT = int(os.getenv("PORT", "8765"))
PUBLIC_IP = os.getenv("PUBLIC_IP", "114.32.64.6")
PUBLIC_PORT = os.getenv("PUBLIC_PORT", "")
SERVICE_TYPE = "ltx2"
REGISTER_URL = os.getenv("REGISTER_URL", "http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register")
BACKEND_TOKEN = os.getenv("PLN_IMAGE_BACKEND_TOKEN", "")
MAX_PENDING = 10

# Workflow config
WORKFLOW_PATH = Path(os.getenv("WORKFLOW_PATH", "/root/ltx2/workflow.json"))
PROMPT_NODE_ID = "177:109"
PROMPT_INPUT_KEY = "value"
WIDTH_NODE_ID = "177:131"
WIDTH_INPUT_KEY = "width"
HEIGHT_NODE_ID = "177:131"
HEIGHT_INPUT_KEY = "height"
FRAME_COUNT_NODE_ID = "177:113"
FRAME_COUNT_INPUT_KEY = "value"

# ComfyUI process
comfy_proc = None


def start_comfyui():
    """Start ComfyUI as a subprocess."""
    global comfy_proc
    logger.info("Starting ComfyUI...")
    comfy_proc = subprocess.Popen(
        f"python main.py --listen {COMFY_HOST} --port {COMFY_PORT} --fast fp8_matrix_mult fp16_accumulation --cache-lru 0",
        shell=True,
        cwd=COMFYUI_ROOT,
    )
    # Wait for health
    for i in range(120):
        try:
            urllib.request.urlopen(f"{COMFY_BASE}/system_stats", timeout=1)
            logger.info(f"ComfyUI ready after {i+1}s")
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError("ComfyUI did not become healthy after 120s")


def queue_prompt(workflow):
    payload = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_BASE}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def get_history(prompt_id):
    with urllib.request.urlopen(f"{COMFY_BASE}/history/{prompt_id}") as r:
        return json.loads(r.read())


def get_view(filename, subfolder, folder_type):
    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": folder_type})
    with urllib.request.urlopen(f"{COMFY_BASE}/view?{params}") as r:
        return r.read()


def extract_video(history, prompt_id):
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


def get_pending_count():
    try:
        with urllib.request.urlopen(f"{COMFY_BASE}/queue") as r:
            d = json.loads(r.read())
            return len(d.get("queue_pending", []))
    except Exception:
        return 0


# Heartbeat
async def send_heartbeat():
    public_port = PUBLIC_PORT or str(PORT)
    url = f"http://{PUBLIC_IP}:{public_port}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                REGISTER_URL,
                json={"url": url, "type": SERVICE_TYPE},
                headers={"x-backend-token": BACKEND_TOKEN} if BACKEND_TOKEN else {},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    logger.debug(f"Heartbeat OK: {url}")
                else:
                    logger.warning(f"Heartbeat {resp.status}: {await resp.text()}")
    except Exception as e:
        logger.warning(f"Heartbeat failed: {e}")


async def heartbeat_loop():
    while True:
        await send_heartbeat()
        await asyncio.sleep(30)


# FastAPI app
app = FastAPI(title="LTX-2 Video Server")


class EnqueueRequest(BaseModel):
    prompt: str
    width: int = 720
    height: int = 720
    frame_count: int = 121


@app.on_event("startup")
async def startup():
    start_comfyui()
    logger.info(f"LTX-2 server ready on port {PORT}")


@app.post("/enqueue")
async def enqueue(req: EnqueueRequest, x_backend_token: str = Header(None)):
    if BACKEND_TOKEN and x_backend_token != BACKEND_TOKEN:
        return Response("Unauthorized", status_code=401)

    pending = get_pending_count()
    if pending >= MAX_PENDING:
        return Response(f"Queue full ({pending} pending)", status_code=429)

    wf = json.loads(WORKFLOW_PATH.read_text())

    wf[PROMPT_NODE_ID]["inputs"][PROMPT_INPUT_KEY] = req.prompt
    wf[WIDTH_NODE_ID]["inputs"][WIDTH_INPUT_KEY] = int(req.width)
    wf[HEIGHT_NODE_ID]["inputs"][HEIGHT_INPUT_KEY] = int(req.height)
    wf[FRAME_COUNT_NODE_ID]["inputs"][FRAME_COUNT_INPUT_KEY] = int(req.frame_count)

    seed = random.randint(0, 2**32 - 1)
    for n in wf.values():
        inp = n.get("inputs", {})
        if "seed" in inp:
            inp["seed"] = seed

    resp = queue_prompt(wf)
    prompt_id = resp["prompt_id"]
    logger.info(f"Enqueued: {prompt_id} ({req.width}x{req.height}, {req.frame_count} frames)")
    return {"prompt_id": prompt_id}


@app.get("/status")
async def status(prompt_id: str):
    try:
        hist = get_history(prompt_id)
        entry = hist.get(prompt_id, {})
        # Check for execution errors
        status_info = entry.get("status", {})
        if status_info.get("status_str") == "error":
            msgs = status_info.get("messages", [])
            error_msg = str(msgs[-1]) if msgs else "unknown error"
            logger.error(f"ComfyUI error for {prompt_id}: {error_msg}")
            return {"status": "error", "error": error_msg}
        out, ctype = extract_video(hist, prompt_id)
        if out is None:
            return {"status": "running"}
        return {"status": "done", "output": out, "content_type": ctype}
    except Exception as e:
        logger.error(f"Status error: {e}")
        return {"status": "running"}


@app.get("/result")
async def result(prompt_id: str):
    hist = get_history(prompt_id)
    out, ctype = extract_video(hist, prompt_id)
    if out is None:
        return Response("Not ready", status_code=202, media_type="text/plain")
    data = get_view(out["filename"], out.get("subfolder", ""), out.get("type", "output"))
    return Response(content=data, media_type=ctype)


@app.get("/health")
async def health():
    try:
        urllib.request.urlopen(f"{COMFY_BASE}/system_stats", timeout=2)
        return {"status": "ok", "comfyui": "running"}
    except Exception:
        return Response(json.dumps({"status": "error", "comfyui": "down"}), status_code=503, media_type="application/json")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
