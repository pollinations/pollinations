import os
import sys
import io
import base64
import logging
import asyncio
import threading
import warnings
from contextlib import asynccontextmanager
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["TQDM_DISABLE"] = "1"
warnings.filterwarnings("ignore")

import torch
import aiohttp
import requests
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from diffusers import ZImagePipeline
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)
for noisy in ["httpx", "httpcore", "urllib3", "diffusers", "transformers", "huggingface_hub"]:
    logging.getLogger(noisy).setLevel(logging.WARNING)


MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
UPSCALER_MODEL_x2 = "model_cache/RealESRGAN_x2plus.pth"
MAX_PIXELS = 768 * 768 
UPSCALE_FACTOR = 2  


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, le=4096)
    height: int = Field(default=1024, le=4096)
    steps: int = Field(default=9, le=50)  
    seed: int | None = None

pipe = None
upsampler = None
generate_lock = threading.Lock()


def get_public_ip():
    try:
        response = requests.get('https://api.ipify.org', timeout=5)
        return response.text
    except Exception:
        return None


async def send_heartbeat():
    public_ip = os.getenv("PUBLIC_IP")
    if not public_ip:
        public_ip = await asyncio.get_event_loop().run_in_executor(None, get_public_ip)
    if public_ip:
        try:
            port = int(os.getenv("PUBLIC_PORT", os.getenv("PORT", "10002")))
            url = f"http://{public_ip}:{port}"
            service_type = os.getenv("SERVICE_TYPE", "zimage")
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://image.pollinations.ai/register',
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe, upsampler
    heartbeat_task = None
    
    try:
        logger.info(f"Loading Z-Image-Turbo pipeline from {MODEL_ID}...")
        pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
        ).to("cuda")
        logger.info("Z-Image-Turbo pipeline loaded successfully")
        logger.info("Loading RealESRGAN x2 upscaler...")
        model_x2 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        upsampler = RealESRGANer(
            scale=2,
            model_path=UPSCALER_MODEL_x2,
            model=model_x2,
            tile=512,
            tile_pad=10,
            pre_pad=0,
            half=True,
            device="cuda"
        )
        logger.info("Upscaler loaded successfully")
        
        await send_heartbeat()
        logger.info("Initial heartbeat sent")
        heartbeat_task = asyncio.create_task(periodic_heartbeat())
        app.state.heartbeat_task = heartbeat_task
        
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        if heartbeat_task:
            heartbeat_task.cancel()
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


def find_nearest_valid_dimensions(width: int, height: int) -> tuple[int, int]:
    start_w = round(width)
    start_h = round(height)
    
    current_pixels = start_w * start_h
    if current_pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / current_pixels) ** 0.5
        start_w = round(start_w * scale)
        start_h = round(start_h * scale)
    nearest_w = round(start_w / 16) * 16
    nearest_h = round(start_h / 16) * 16
    nearest_w = max(nearest_w, 256)
    nearest_h = max(nearest_h, 256)
    
    return nearest_w, nearest_h


app = FastAPI(title="Z-Image-Turbo API", lifespan=lifespan)



def verify_enter_token(x_enter_token: str = Header(None, alias="x-enter-token")):
    expected_token = os.getenv("ENTER_TOKEN")
    if not expected_token:
        logger.warning("ENTER_TOKEN not configured - allowing request")
        return True
    if x_enter_token != expected_token:
        logger.warning("Invalid or missing ENTER_TOKEN")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True


@app.post("/generate")
def generate(request: ImageRequest, _auth: bool = Depends(verify_enter_token)):
    logger.info(f"Request: {request}")
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(8), "big")
    logger.info(f"Using seed: {seed}")
    
    generator = torch.Generator("cuda").manual_seed(seed)
    target_w, target_h = request.width, request.height
    gen_w, gen_h = find_nearest_valid_dimensions(target_w, target_h) 
    logger.info(f"Generating at {gen_w}x{gen_h}, will upscale 2x to ~{gen_w*UPSCALE_FACTOR}x{gen_h*UPSCALE_FACTOR}")
    
    try:
        with generate_lock:
            with torch.inference_mode():
                output = pipe(
                    prompt=request.prompts[0],
                    generator=generator,
                    width=gen_w,
                    height=gen_h,
                    num_inference_steps=9,
                    guidance_scale=0.0,
                )
            
            image = output.images[0]
            image_np = np.array(image)
            upscaled_np, _ = upsampler.enhance(image_np, outscale=UPSCALE_FACTOR)
            upscaled_image = Image.fromarray(upscaled_np)
        
        img_byte_arr = io.BytesIO()
        upscaled_image.save(img_byte_arr, format='JPEG', quality=95)
        img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
        
        response_content = [{
            "image": img_base64,
            "has_nsfw_concept": False,
            "concept": [],
            "width": upscaled_image.width,
            "height": upscaled_image.height,
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
    return {"status": "healthy", "model": MODEL_ID}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
