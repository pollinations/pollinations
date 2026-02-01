import os
import sys
import io
import base64
import logging
import asyncio
import torch
import aiohttp
import requests
import numpy as np
from PIL import Image
from diffusers import ZImagePipeline
import time
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, ValidationInfo
import threading
import warnings
from contextlib import asynccontextmanager
import math

os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TQDM_DISABLE"] = "1"
warnings.filterwarnings("ignore")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)
for noisy in ["httpx", "httpcore", "urllib3", "diffusers", "transformers", "huggingface_hub"]:
    logging.getLogger(noisy).setLevel(logging.WARNING)


def get_public_ip():
    try:
        response = requests.get('https://api.ipify.org', timeout=5)
        return response.text
    except Exception:
        return None


async def send_heartbeat():
    public_ip = os.getenv("PUBLIC_IP", "127.0.0.1")
    if public_ip:
        try:
            port = int(os.getenv("PUBLIC_PORT", os.getenv("PORT", "10002")))
            url = f"http://{public_ip}:{port}"
            service_type = os.getenv("SERVICE_TYPE", "zimage")
            register_url = os.getenv("REGISTER_URL", "http://ec2-3-80-56-235.compute-1.amazonaws.com:16384/register")
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    register_url,
                    json={'url': url, 'type': service_type}
                ) as response:
                    if response.status == 200:
                        logger.info(f"Heartbeat sent successfully. URL: {url}, type: {service_type}")
                    else:
                        logger.error(f"Failed to send heartbeat. Status: {response.status}")
        except Exception as e:
            logger.error(f"Error sending heartbeat: {e}")


async def periodic_heartbeat():
    while True:
        try:
            await send_heartbeat()
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            logger.info("Heartbeat task cancelled")
            raise
        except Exception as e:
            logger.error(f"Error in periodic heartbeat: {e}")
            await asyncio.sleep(5)


# TwinFlow-Z-Image-Turbo model (distilled for faster inference)
MODEL_ID = "inclusionAI/TwinFlow-Z-Image-Turbo"
MODEL_SUBFOLDER = "TwinFlow-Z-Image-Turbo-exp"
MODEL_CACHE = "model_cache"

# No upscaling - generate at full resolution
MAX_PIXELS = 1024 * 1024  # Max 1 megapixel (1024x1024)

# Default inference steps (4-NFE is good balance of speed/quality)
DEFAULT_NUM_STEPS = 5  # 5 steps = 4 NFE (actual forward passes)

generate_lock = threading.Lock()


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    seed: int | None = None
    
    @field_validator('height')
    @classmethod
    def validate_total_pixels(cls, height: int, info: ValidationInfo) -> int:
        """Validate total pixel count doesn't exceed MAX_PIXELS"""
        if 'width' in info.data:
            width = info.data['width']
            total_pixels = width * height
            if total_pixels > MAX_PIXELS:
                raise ValueError(
                    f"Requested {width}x{height} = {total_pixels:,} pixels exceeds limit of {MAX_PIXELS:,} pixels. "
                    f"Max: 1024x1024 or equivalent area."
                )
        return height


def calc_time(start, end, msg):
    elapsed = end - start
    print(f"{msg} time: {elapsed:.2f} seconds")


def calculate_generation_dimensions(requested_width: int, requested_height: int) -> tuple[int, int]:
    """Calculate generation dimensions (no upscaling).
    
    Returns: (gen_w, gen_h)
    """
    # Cap to MAX_PIXELS, preserving aspect ratio
    total_pixels = requested_width * requested_height
    
    if total_pixels > MAX_PIXELS:
        scale = math.sqrt(MAX_PIXELS / total_pixels)
        requested_width = round(requested_width * scale)
        requested_height = round(requested_height * scale)
    
    # Align to 16px multiples (model requirement)
    gen_w = round(requested_width / 16) * 16
    gen_h = round(requested_height / 16) * 16
    
    # Enforce minimum generation size
    gen_w = max(gen_w, 256)
    gen_h = max(gen_h, 256)
    
    return gen_w, gen_h


# Global model instances (initialized in lifespan)
pipe = None
heartbeat_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown of the application."""
    global pipe, heartbeat_task
    
    logger.info("Starting up TwinFlow-Z-Image-Turbo server...")
    
    # Load models
    load_model_time = time.time()
    try:
        # Check if model is already downloaded locally
        local_model_path = os.getenv("MODEL_PATH", "/workspace/twinflow/models/TwinFlow-Z-Image-Turbo-exp")
        
        if os.path.exists(local_model_path):
            logger.info(f"Loading model from local path: {local_model_path}")
            pipe = ZImagePipeline.from_pretrained(
                local_model_path,
                torch_dtype=torch.bfloat16,
                low_cpu_mem_usage=False,
            ).to("cuda")
        else:
            logger.info(f"Downloading model from HuggingFace: {MODEL_ID}/{MODEL_SUBFOLDER}")
            from huggingface_hub import snapshot_download
            local_path = snapshot_download(
                repo_id=MODEL_ID,
                allow_patterns=[f"{MODEL_SUBFOLDER}/**"],
                local_dir=MODEL_CACHE
            )
            model_path = f"{MODEL_CACHE}/{MODEL_SUBFOLDER}"
            pipe = ZImagePipeline.from_pretrained(
                model_path,
                torch_dtype=torch.bfloat16,
                low_cpu_mem_usage=False,
            ).to("cuda")
        
        load_model_time_end = time.time()
        calc_time(load_model_time, load_model_time_end, "Time to load model")
        logger.info("TwinFlow model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise
    
    # Start heartbeat task
    heartbeat_task = asyncio.create_task(periodic_heartbeat())
    
    yield
    
    # Cleanup
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
    
    logger.info("Shutting down...")


app = FastAPI(title="TwinFlow-Z-Image-Turbo API", lifespan=lifespan)


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


@app.post("/generate")
def generate(request: ImageRequest, _auth: bool = Depends(verify_backend_token)):
    logger.info(f"Request: {request}")
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(8), "big")
    logger.info(f"Using seed: {seed}")
    generator = torch.Generator("cuda").manual_seed(seed)
    gen_w, gen_h = calculate_generation_dimensions(request.width, request.height)
    logger.info(f"Requested: {request.width}x{request.height} -> Generation: {gen_w}x{gen_h}")
    
    num_steps = int(os.getenv("NUM_INFERENCE_STEPS", str(DEFAULT_NUM_STEPS)))
    
    try:
        with generate_lock:
            with torch.inference_mode():
                output = pipe(
                    prompt=request.prompts[0],
                    generator=generator,
                    width=gen_w,
                    height=gen_h,
                    num_inference_steps=num_steps,
                    guidance_scale=0.0,  # Must be 0 for Turbo models
                )
            image = output.images[0]
            image_np = np.array(image)
        
        # Encode image (outside lock for faster response)
        pil_image = Image.fromarray(image_np)
        img_byte_arr = io.BytesIO()
        pil_image.save(img_byte_arr, format='JPEG', quality=95)
        img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
        response_content = [{
            "image": img_base64,
            "has_nsfw_concept": False,
            "concept": [],
            "width": pil_image.width,
            "height": pil_image.height,
            "seed": seed,
            "prompt": request.prompts[0]
        }]
        return JSONResponse(content=response_content)
    except torch.cuda.OutOfMemoryError as e:
        logger.error(f"CUDA OOM Error: {e} - Exiting to trigger restart")
        sys.exit(1)


@app.get("/health")
async def health():
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": "TwinFlow-Z-Image-Turbo", "num_steps": int(os.getenv("NUM_INFERENCE_STEPS", str(DEFAULT_NUM_STEPS)))}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
