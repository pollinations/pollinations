import os
import sys
import time
import uuid
from typing import List, Dict, Any
from dotenv import load_dotenv
load_dotenv()  # Load .env file
from fastapi import FastAPI, HTTPException, Request, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
from diffusers import FluxPipeline
from nunchaku.models import NunchakuFluxTransformer2dModel
from safety_checker.censor import check_safety
import requests
import logging
import asyncio
import aiohttp
import io
import base64
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_ID = "black-forest-labs/FLUX.1-schnell"
MODEL_CACHE = "model-cache"
QUANT_MODEL_PATH = "mit-han-lab/svdq-int4-flux.1-schnell"

class ImageRequest(BaseModel):
    prompts: List[str] = ["a photo of an astronaut riding a horse on mars"]
    width: int = 1024
    height: int = 1024
    steps: int = 4
    seed: int | None = None
    safety_checker_adj: float = 0.5  # Controls sensitivity of NSFW detection

pipe = None

# Function to get public IP address
def get_public_ip():
    try:
        response = requests.get('https://api.ipify.org')
        return response.text
    except:
        return None

# Heartbeat function
async def send_heartbeat():
    # Check for PUBLIC_IP environment variable first, otherwise auto-detect
    public_ip = os.getenv("PUBLIC_IP")
    if not public_ip:
        public_ip = await asyncio.get_event_loop().run_in_executor(None, get_public_ip)
    if public_ip:
        try:
            # Use PUBLIC_PORT if set, otherwise use PORT
            public_port = os.getenv("PUBLIC_PORT")
            if public_port:
                port = int(public_port)
            else:
                port = int(os.getenv("PORT", "10001"))
            url = f"http://{public_ip}:{port}"
            service_type = os.getenv("SERVICE_TYPE", "flux")  # Get service type from environment variable
            async with aiohttp.ClientSession() as session:
                async with session.post('https://image.pollinations.ai/register', json={'url': url, 'type': service_type}) as response:
                    if response.status == 200:
                        logger.info(f"Heartbeat sent successfully. URL: {url}")
                    else:
                        logger.error(f"Failed to send heartbeat. Status code: {response.status}")
        except Exception as e:
            logger.error(f"Error sending heartbeat: {str(e)}")

# Periodic heartbeat function
async def periodic_heartbeat():
    while True:
        try:
            await send_heartbeat()
            await asyncio.sleep(30)  # Send heartbeat every 30 seconds
        except asyncio.CancelledError:
            logger.info("Heartbeat task cancelled")
            raise
        except Exception as e:
            logger.error(f"Error in periodic heartbeat: {str(e)}")
            await asyncio.sleep(5)  # Wait a bit before retrying

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global pipe
    heartbeat_task = None
    try:
        print("Loading FLUX pipeline...")
        transformer = NunchakuFluxTransformer2dModel.from_pretrained(QUANT_MODEL_PATH)
        pipe = FluxPipeline.from_pretrained(
            MODEL_ID,
            transformer=transformer,
            torch_dtype=torch.bfloat16
        ).to("cuda")
        print("FLUX pipeline loaded successfully")
        
        # Send initial heartbeat and start periodic task
        try:
            await send_heartbeat()
            logger.info("Initial heartbeat sent successfully")
            # Store the task in app.state to prevent garbage collection
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
        yield  # Server is running
    finally:
        # Shutdown
        if hasattr(app.state, "heartbeat_task"):
            app.state.heartbeat_task.cancel()
            try:
                await app.state.heartbeat_task
            except asyncio.CancelledError:
                pass

def find_nearest_valid_dimensions(width: float, height: float) -> tuple[int, int]:
    """Find the nearest dimensions that are multiples of 8 and their product is divisible by 65536.
    Also enforces a maximum total pixel count to prevent CUDA OOM errors."""
    # Cap total pixels to prevent CUDA OOM with quantized models (1024x1024 = 1,048,576)
    MAX_PIXELS = 768 * 768
    start_w = round(width)
    start_h = round(height)
    
    # Scale down proportionally if total pixels exceed limit
    current_pixels = start_w * start_h
    if current_pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / current_pixels) ** 0.5
        start_w = round(start_w * scale)
        start_h = round(start_h * scale)
    
    def is_valid(w: int, h: int) -> bool:
        return w % 8 == 0 and h % 8 == 0 and (w * h) % 65536 == 0
    
    # Find nearest multiple of 8 for each dimension
    nearest_w = round(start_w / 8) * 8
    nearest_h = round(start_h / 8) * 8
    
    # Search in a spiral pattern from the nearest multiples of 8
    offset = 0
    while offset < 100:  # Limit search to reasonable range
        for w in range(nearest_w - offset * 8, nearest_w + offset * 8 + 1, 8):
            if w <= 0:
                continue
            for h in range(nearest_h - offset * 8, nearest_h + offset * 8 + 1, 8):
                if h <= 0:
                    continue
                if is_valid(w, h):
                    return w, h
        offset += 1
    
    # If no valid dimensions found, return the nearest multiples of 8
    return nearest_w, nearest_h

app = FastAPI(title="FLUX Image Generation API", lifespan=lifespan)

# Auth verification
def verify_enter_token(x_enter_token: str = Header(None, alias="x-enter-token")):
    expected_token = os.getenv("ENTER_TOKEN")
    if not expected_token:
        logger.warning("ENTER_TOKEN not configured - allowing request")
        return True
    if x_enter_token != expected_token:
        logger.warning(f"Invalid or missing ENTER_TOKEN")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True

@app.post("/generate")
async def generate(request: ImageRequest, _auth: bool = Depends(verify_enter_token)):
    print(f"Request: {request}")
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
        
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(2), "big")
    print(f"Using seed: {seed}")

    generator = torch.Generator("cuda").manual_seed(seed)
    
    # Find nearest valid dimensions
    width, height = find_nearest_valid_dimensions(request.width, request.height)
    print(f"Original dimensions: {request.width}x{request.height}")
    print(f"Adjusted dimensions: {width}x{height}")

    try:
        with torch.inference_mode():
            output = pipe(
                prompt=request.prompts[0],
                generator=generator,
                width=width,
                height=height,
                num_inference_steps=request.steps,
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
        # Exit with non-zero status to trigger systemd restart
        sys.exit(1)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10001"))
    uvicorn.run(app, host="0.0.0.0", port=port)