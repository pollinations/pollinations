import os
import time
import uuid
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
from diffusers import FluxPipeline
from nunchaku import NunchakuFluxTransformer2dModel
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

# Use a publicly available quantized model
QUANT_MODEL_PATH = "mit-han-lab/svdq-int4-flux.1-schnell"

class ImageRequest(BaseModel):
    prompts: List[str] = ["a photo of an astronaut riding a horse on mars"]
    width: int = 1024
    height: int = 1024
    steps: int = 4
    seed: int | None = None

pipe = None

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global pipe
    try:
        print("Loading FLUX pipeline with Nunchaku optimizations...")
        print("Note: This requires authentication for FLUX models.")
        print("For testing purposes, we'll create a mock response.")
        
        # For now, we'll create a simple mock since we need authentication
        # In production, you would need to authenticate with HuggingFace
        print("Mock pipeline loaded successfully")
        
    except Exception as e:
        logger.error(f"Error during startup: {str(e)}")
        print("Could not load FLUX model - authentication required")
        print("This is expected without HuggingFace authentication")

    try:
        yield  # Server is running
    finally:
        # Shutdown
        pass

app = FastAPI(title="FLUX Image Generation API (Test)", lifespan=lifespan)

@app.get("/")
async def root():
    return {"message": "Nunchaku FLUX Schnell API", "status": "running", "note": "Requires HuggingFace authentication for full functionality"}

@app.post("/generate")
async def generate(request: ImageRequest):
    print(f"Request: {request}")
    
    # Mock response since we don't have authentication
    return JSONResponse(content=[{
        "message": "Mock response - requires HuggingFace authentication to access FLUX models",
        "request_received": {
            "prompt": request.prompts[0],
            "width": request.width,
            "height": request.height,
            "steps": request.steps
        },
        "note": "To use this service, you need to authenticate with HuggingFace and have access to FLUX models"
    }])

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8765"))
    uvicorn.run(app, host="0.0.0.0", port=port)
