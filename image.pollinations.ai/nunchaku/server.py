import os
import time
import uuid
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException, Request, JSONResponse
from pydantic import BaseModel
import torch
from diffusers import FluxPipeline
from nunchaku.models.transformer_flux import NunchakuFluxTransformer2dModel
from safety_checker.censor import check_safety
import requests
import logging
import asyncio
import io
import base64

app = FastAPI(title="FLUX Image Generation API")

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
    num_inference_steps: int = 4
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
    public_ip = get_public_ip()
    if public_ip:
        try:
            port = int(os.getenv("PORT", "8765"))
            url = f"http://{public_ip}:{port}"
            response = requests.post('https://image.pollinations.ai/register', json={'url': url})
            if response.status_code == 200:
                logger.info(f"Heartbeat sent successfully. URL: {url}")
            else:
                logger.error(f"Failed to send heartbeat. Status code: {response.status_code}")
        except Exception as e:
            logger.error(f"Error sending heartbeat: {str(e)}")

# Periodic heartbeat function
async def periodic_heartbeat():
    while True:
        await send_heartbeat()
        await asyncio.sleep(30)  # Send heartbeat every 30 seconds

@app.on_event("startup")
async def startup_event():
    global pipe
    try:
        print("Loading FLUX pipeline...")
        transformer = NunchakuFluxTransformer2dModel.from_pretrained(QUANT_MODEL_PATH)
        pipe = FluxPipeline.from_pretrained(
            MODEL_ID,
            transformer=transformer,
            torch_dtype=torch.bfloat16
        ).to("cuda")
        print("FLUX pipeline loaded successfully")
        # Send initial heartbeat
        try:
            await send_heartbeat()
            print("Initial heartbeat sent successfully")
        except Exception as e:
            print(f"Error sending initial heartbeat: {str(e)}")
        # Start the heartbeat task
        try:
            asyncio.create_task(periodic_heartbeat())
            print("Periodic heartbeat task started")
        except Exception as e:
            print(f"Error starting periodic heartbeat: {str(e)}")
    except Exception as e:
        print(f"Error during startup: {str(e)}")
        raise

def find_nearest_valid_dimensions(width: float, height: float) -> tuple[int, int]:
    """Find the nearest dimensions that are multiples of 8 and their product is divisible by 65536."""
    start_w = round(width)
    start_h = round(height)
    
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

@app.post("/generate")
async def generate(request: ImageRequest):
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

    with torch.inference_mode():
        output = pipe(
            prompt=request.prompts[0],
            generator=generator,
            width=width,
            height=height,
            num_inference_steps=request.num_inference_steps,
        )

    # Check for NSFW content
    image = output.images[0]
    concepts, has_nsfw = check_safety([image], request.safety_checker_adj)
    
    # Convert image to base64
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='JPEG', quality=95)
    img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
    
    response_content = {
        "image": img_base64,
        "has_nsfw_concept": has_nsfw[0],
        "concept": concepts[0],
        "width": width,
        "height": height,
        "seed": seed,
        "prompt": request.prompts[0]
    }
    
    # Send heartbeat after successful generation
    await send_heartbeat()
    return JSONResponse(content=response_content)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8765"))
    uvicorn.run(app, host="0.0.0.0", port=port)