import os
import sys
import time
import io
import base64
import logging
import asyncio
from typing import List
from contextlib import asynccontextmanager

import torch
import aiohttp
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from diffusers import ZImagePipeline

from safety_checker import check_safety

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"


class ImageRequest(BaseModel):
    prompts: List[str] = ["a photo of an astronaut riding a horse on mars"]
    width: int = 1024
    height: int = 1024
    steps: int = 9  # Z-Image-Turbo uses 9 steps (8 NFEs)
    seed: int | None = None
    safety_checker_adj: float = 0.5


pipe = None


def get_public_ip():
    try:
        response = requests.get('https://api.ipify.org')
        return response.text
    except:
        return None


async def send_heartbeat():
    public_ip = os.getenv("PUBLIC_IP")
    if not public_ip:
        public_ip = await asyncio.get_event_loop().run_in_executor(None, get_public_ip)
    if public_ip:
        try:
            public_port = os.getenv("PUBLIC_PORT")
            if public_port:
                port = int(public_port)
            else:
                port = int(os.getenv("PORT", "10002"))
            url = f"http://{public_ip}:{port}"
            service_type = os.getenv("SERVICE_TYPE", "zimage")
            async with aiohttp.ClientSession() as session:
                async with session.post('https://image.pollinations.ai/register', json={'url': url, 'type': service_type}) as response:
                    if response.status == 200:
                        logger.info(f"Heartbeat sent successfully. URL: {url}")
                    else:
                        logger.error(f"Failed to send heartbeat. Status code: {response.status}")
        except Exception as e:
            logger.error(f"Error sending heartbeat: {str(e)}")


async def periodic_heartbeat():
    while True:
        try:
            await send_heartbeat()
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            logger.info("Heartbeat task cancelled")
            raise
        except Exception as e:
            logger.error(f"Error in periodic heartbeat: {str(e)}")
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe
    heartbeat_task = None
    try:
        logger.info(f"Loading Z-Image-Turbo pipeline from {MODEL_ID}...")
        pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        logger.info("Z-Image-Turbo pipeline loaded successfully")

        # Start heartbeat
        try:
            await send_heartbeat()
            logger.info("Initial heartbeat sent successfully")
            heartbeat_task = asyncio.create_task(periodic_heartbeat())
            app.state.heartbeat_task = heartbeat_task
            logger.info("Periodic heartbeat task started")
        except Exception as e:
            logger.error(f"Error in heartbeat initialization: {str(e)}")
            if heartbeat_task:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
            raise
    except Exception as e:
        logger.error(f"Error during startup: {str(e)}")
        if heartbeat_task:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        raise

    try:
        yield
    finally:
        if hasattr(app.state, "heartbeat_task"):
            app.state.heartbeat_task.cancel()
            try:
                await app.state.heartbeat_task
            except asyncio.CancelledError:
                pass


def find_nearest_valid_dimensions(width: float, height: float) -> tuple[int, int]:
    """Find the nearest dimensions that are multiples of 8."""
    # Z-Image supports up to 2048x2048, cap at reasonable limit
    MAX_PIXELS = 1024 * 1024
    start_w = round(width)
    start_h = round(height)

    # Scale down if too large
    current_pixels = start_w * start_h
    if current_pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / current_pixels) ** 0.5
        start_w = round(start_w * scale)
        start_h = round(start_h * scale)

    # Round to nearest multiple of 8
    nearest_w = round(start_w / 8) * 8
    nearest_h = round(start_h / 8) * 8

    # Ensure minimum size
    nearest_w = max(nearest_w, 256)
    nearest_h = max(nearest_h, 256)

    return nearest_w, nearest_h


app = FastAPI(title="Z-Image-Turbo Image Generation API", lifespan=lifespan)


@app.post("/generate")
async def generate(request: ImageRequest):
    logger.info(f"Request: {request}")
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(2), "big")
    logger.info(f"Using seed: {seed}")

    generator = torch.Generator("cuda").manual_seed(seed)

    # Find nearest valid dimensions
    width, height = find_nearest_valid_dimensions(request.width, request.height)
    logger.info(f"Original dimensions: {request.width}x{request.height}")
    logger.info(f"Adjusted dimensions: {width}x{height}")

    try:
        with torch.inference_mode():
            output = pipe(
                prompt=request.prompts[0],
                generator=generator,
                width=width,
                height=height,
                num_inference_steps=request.steps,
                guidance_scale=0.0,  # Must be 0 for Turbo models
            )

        # Check for NSFW content
        image = output.images[0]
        concepts, has_nsfw = check_safety([image], request.safety_checker_adj)

        # Convert image to base64
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=95)
        img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

        response_content = [{
            "image": img_base64,
            "has_nsfw_concept": has_nsfw[0],
            "concept": concepts[0],
            "width": width,
            "height": height,
            "seed": seed,
            "prompt": request.prompts[0]
        }]

        # Send heartbeat after successful generation
        await send_heartbeat()
        return JSONResponse(content=response_content)

    except torch.cuda.OutOfMemoryError as e:
        logger.error(f"CUDA OOM Error: {str(e)} - Exiting to trigger systemd restart")
        sys.exit(1)


@app.get("/health")
async def health():
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": MODEL_ID}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
