"""
HeartMuLa Music Generation Server
Runs alongside Sana Sprint on the same RTX 5090.
Uses lazy_load=True to keep VRAM usage low (~7 GB peak).
"""

import os
import sys
import time
import tempfile
import logging
import threading
import subprocess
import torch
import soundfile as sf
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("heartmula")

CKPT_DIR = os.getenv("CKPT_DIR", "/workspace/heartmula/ckpt")
PORT = int(os.getenv("PORT", "10004"))

pipe = None
pipe_lock = threading.Lock()


class MusicRequest(BaseModel):
    lyrics: str = Field(default="La la la, this is a test song\nWith a melody so bright\nSinging through the day and night")
    tags: str = Field(default="pop, female vocal, upbeat, catchy")
    max_length_ms: int = Field(default=60000, le=240000)
    temperature: float = Field(default=1.0)
    topk: int = Field(default=50)
    cfg_scale: float = Field(default=1.5)


def patched_postprocess(self, model_outputs, save_path):
    """Save audio using soundfile instead of torchaudio (which requires torchcodec/FFmpeg)."""
    frames = model_outputs["frames"].to(self.codec_device)
    wav = self.codec.detokenize(frames)
    audio_np = wav.to(torch.float32).cpu().numpy()
    if audio_np.ndim == 3:
        audio_np = audio_np[0]
    if audio_np.ndim == 2:
        audio_np = audio_np.T
    elif audio_np.ndim == 1:
        pass
    logger.info(f"Audio shape: {audio_np.shape}, saving to {save_path}")
    sf.write(save_path, audio_np, 48000)


def load_pipeline():
    global pipe
    from heartlib import HeartMuLaGenPipeline

    # Monkey-patch postprocess to avoid torchaudio.save / torchcodec
    HeartMuLaGenPipeline.postprocess = patched_postprocess

    logger.info(f"Loading HeartMuLa pipeline from {CKPT_DIR}...")
    start = time.time()

    pipe = HeartMuLaGenPipeline.from_pretrained(
        CKPT_DIR,
        device={"mula": torch.device("cuda"), "codec": torch.device("cuda")},
        dtype={"mula": torch.bfloat16, "codec": torch.bfloat16},
        version="3B",
        lazy_load=True,
    )

    elapsed = time.time() - start
    vram_used = torch.cuda.memory_allocated() / 1e9
    vram_total = torch.cuda.get_device_properties(0).total_memory / 1e9
    logger.info(f"Pipeline loaded in {elapsed:.1f}s. VRAM: {vram_used:.1f}/{vram_total:.1f} GB")


def verify_backend_token(
    x_backend_token: str = Header(None, alias="x-backend-token"),
):
    """Verify backend authentication token.
    
    Requires x-backend-token header validated against PLN_IMAGE_BACKEND_TOKEN env var.
    """
    expected_token = os.getenv("PLN_IMAGE_BACKEND_TOKEN")
    if not expected_token:
        logger.warning("PLN_IMAGE_BACKEND_TOKEN not configured - allowing request")
        return True
    
    if x_backend_token != expected_token:
        logger.warning("Invalid or missing backend token")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True


app = FastAPI(title="HeartMuLa Music Generation")


@app.on_event("startup")
async def startup():
    load_pipeline()


@app.get("/health")
async def health():
    return {
        "status": "ok" if pipe is not None else "loading",
        "model": "HeartMuLa-RL-oss-3B-20260123",
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none",
        "vram_used_gb": round(torch.cuda.memory_allocated() / 1e9, 1) if torch.cuda.is_available() else 0,
        "vram_total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1e9, 1) if torch.cuda.is_available() else 0,
        "lazy_load": True,
    }


@app.post("/generate", dependencies=[Depends(verify_backend_token)])
async def generate(req: MusicRequest):
    if pipe is None:
        return JSONResponse(status_code=503, content={"error": "Model still loading"})

    with pipe_lock:
        with tempfile.TemporaryDirectory() as tmpdir:
            lyrics_path = os.path.join(tmpdir, "lyrics.txt")
            tags_path = os.path.join(tmpdir, "tags.txt")
            output_path = os.path.join(tmpdir, "output.mp3")

            with open(lyrics_path, "w") as f:
                f.write(req.lyrics)
            with open(tags_path, "w") as f:
                f.write(req.tags)

            logger.info(f"Generating: max_length={req.max_length_ms}ms, temp={req.temperature}, topk={req.topk}")
            start = time.time()

            try:
                with torch.no_grad():
                    pipe(
                        {"lyrics": lyrics_path, "tags": tags_path},
                        max_audio_length_ms=req.max_length_ms,
                        save_path=output_path,
                        topk=req.topk,
                        temperature=req.temperature,
                        cfg_scale=req.cfg_scale,
                    )
            except Exception as e:
                logger.error(f"Generation error: {e}")
                return JSONResponse(status_code=500, content={"error": str(e)[:500]})

            elapsed = time.time() - start
            logger.info(f"Generation completed in {elapsed:.1f}s")

            if not os.path.exists(output_path):
                return JSONResponse(status_code=500, content={"error": "No output file produced"})

            with open(output_path, "rb") as f:
                audio_bytes = f.read()

            return Response(
                content=audio_bytes,
                media_type="audio/mpeg",
                headers={
                    "X-Generation-Time": f"{elapsed:.1f}s",
                    "Content-Disposition": "attachment; filename=heartmula_output.mp3",
                },
            )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
