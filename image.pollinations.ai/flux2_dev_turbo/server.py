import os
import sys
import io
import base64
import logging
import asyncio
from huggingface_hub import login, snapshot_download
from dotenv import load_dotenv
load_dotenv()
login(token=os.getenv("HF_TOKEN"))

os.environ['FLASH_ATTENTION_SKIP_CUDA_BUILD'] = '1'

import torch
import aiohttp
import requests
import numpy as np
from PIL import Image
from diffusers import FluxPipeline
from spandrel import ImageModelDescriptor, ModelLoader
import time
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
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
    public_ip = os.getenv("PUBLIC_IP")
    if not public_ip:
        public_ip = await asyncio.get_event_loop().run_in_executor(None, get_public_ip)
    if public_ip:
        try:
            port = int(os.getenv("PUBLIC_PORT", os.getenv("PORT", "10003")))
            url = f"http://{public_ip}:{port}"
            service_type = os.getenv("SERVICE_TYPE", "flux2-dev-turbo")
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


MODEL_ID = "fal/FLUX.2-dev-Turbo"
SANA_MODEL_ID = "Efficient-Large-Model/Sana_1600M_1024px_diffusers"
MODEL_CACHE = "model_cache"
UPSCALE_FACTOR = 2

MAX_GEN_RESOLUTION = 768
MAX_FINAL_PIXELS = 2_359_296
MAX_DIMENSION = 2048

generate_lock = threading.Lock()


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, le=2048)
    height: int = Field(default=1024, le=2048)
    seed: int | None = None


def calc_time(start, end, msg):
    elapsed = end - start
    print(f"{msg} time: {elapsed:.2f} seconds")


def calculate_generation_dimensions(requested_width: int, requested_height: int) -> tuple[int, int, int, int, bool]:
    final_w = min(requested_width, MAX_DIMENSION)
    final_h = min(requested_height, MAX_DIMENSION)
    
    total_pixels = final_w * final_h
    if total_pixels > MAX_FINAL_PIXELS:
        scale = math.sqrt(MAX_FINAL_PIXELS / total_pixels)
        final_w = int(final_w * scale)
        final_h = int(final_h * scale)
    
    final_w = (final_w // 16) * 16
    final_h = (final_h // 16) * 16
    
    gen_w = MAX_GEN_RESOLUTION
    gen_h = MAX_GEN_RESOLUTION
    
    should_upscale = (final_w > gen_w or final_h > gen_h)
    
    return gen_w, gen_h, final_w, final_h, should_upscale


pipe = None
upscaler = None
heartbeat_task = None


def upscale_with_sana(image_tensor: torch.Tensor) -> torch.Tensor:
    if upscaler is None:
        raise RuntimeError("Upscaler not loaded")
    
    with torch.no_grad():
        output = upscaler(image_tensor)
    
    return output


def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    image_np = np.array(image).astype(np.float32) / 255.0
    tensor = torch.from_numpy(image_np).permute(2, 0, 1).unsqueeze(0)
    return tensor


def tensor_to_pil(tensor: torch.Tensor) -> Image.Image:
    tensor = tensor.squeeze(0).permute(1, 2, 0).cpu()
    image_np = torch.clamp(tensor * 255, 0, 255).numpy().astype(np.uint8)
    return Image.fromarray(image_np)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe, upscaler, heartbeat_task
    
    logger.info("Starting up...")
    
    load_model_time = time.time()
    try:
        logger.info(f"Loading FLUX model: {MODEL_ID}")
        pipe = FluxPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
        ).to("cuda")
        logger.info("FLUX model loaded successfully")
        
        logger.info(f"Downloading SANA upscaler: {SANA_MODEL_ID}")
        sana_path = snapshot_download(
            repo_id=SANA_MODEL_ID,
            cache_dir=MODEL_CACHE,
            repo_type="model"
        )
        logger.info(f"SANA model downloaded to: {sana_path}")
        
        sana_safetensors = None
        for root, dirs, files in os.walk(sana_path):
            for file in files:
                if file.endswith('.safetensors') and 'diffusion' in file.lower():
                    sana_safetensors = os.path.join(root, file)
                    break
            if sana_safetensors:
                break
        
        if sana_safetensors:
            logger.info(f"Loading SANA upscaler from {sana_safetensors}")
            upscaler = ModelLoader().load_from_file(sana_safetensors)
            assert isinstance(upscaler, ImageModelDescriptor), f"Expected ImageModelDescriptor, got {type(upscaler)}"
            upscaler.cuda().eval()
            logger.info(f"SANA upscaler loaded: scale={upscaler.scale}x")
        else:
            logger.warning(f"SANA model files not found in {sana_path} - upscaling disabled")
            upscaler = None
        
        load_model_time_end = time.time()
        calc_time(load_model_time, load_model_time_end, "Time to load models")
        logger.info("All models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise
    
    heartbeat_task = asyncio.create_task(periodic_heartbeat())
    
    yield
    
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
    
    logger.info("Shutting down...")


app = FastAPI(title="FLUX.2-dev-Turbo API", lifespan=lifespan)


def _truthy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip() in {"1", "true", "TRUE", "yes", "YES"}


def verify_enter_token(x_enter_token: str = Header(None, alias="x-enter-token")):
    expected_token = os.getenv("PLN_ENTER_TOKEN")
    if not expected_token:
        logger.warning("PLN_ENTER_TOKEN not configured - allowing request")
        return True
    if x_enter_token != expected_token:
        logger.warning("Invalid or missing PLN_ENTER_TOKEN")
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
    
    gen_w, gen_h, final_w, final_h, should_upscale = calculate_generation_dimensions(request.width, request.height)
    logger.info(f"Requested: {request.width}x{request.height} -> Generation: {gen_w}x{gen_h} -> Final: {final_w}x{final_h} (upscale: {should_upscale})")
    
    try:
        with generate_lock:
            with torch.inference_mode():
                output = pipe(
                    prompt=request.prompts[0],
                    generator=generator,
                    width=gen_w,
                    height=gen_h,
                    num_inference_steps=8,
                    guidance_scale=3.5,
                )
            
            image = output.images[0]
            logger.info(f"Generated image: {image.size}")
            
            if should_upscale and upscaler is not None:
                logger.info(f"Upscaling {gen_w}x{gen_h} -> {final_w}x{final_h} with SANA")
                
                image_tensor = pil_to_tensor(image).cuda()
                
                upscaled_tensor = upscale_with_sana(image_tensor)
                
                image = tensor_to_pil(upscaled_tensor)
                logger.info(f"Upscaled image: {image.size}")
            
            if image.size != (final_w, final_h):
                if image.size[0] > final_w or image.size[1] > final_h:
                    left = (image.size[0] - final_w) // 2
                    top = (image.size[1] - final_h) // 2
                    image = image.crop((left, top, left + final_w, top + final_h))
                else:
                    image.thumbnail((final_w, final_h), Image.Resampling.LANCZOS)
                    new_image = Image.new("RGB", (final_w, final_h), (255, 255, 255))
                    offset = ((final_w - image.size[0]) // 2, (final_h - image.size[1]) // 2)
                    new_image.paste(image, offset)
                    image = new_image
        
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG', quality=95)
        img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
        
        response_content = [{
            "image": img_base64,
            "width": image.width,
            "height": image.height,
            "seed": seed,
            "prompt": request.prompts[0]
        }]
        return JSONResponse(content=response_content)
    
    except torch.cuda.OutOfMemoryError as e:
        logger.error(f"CUDA OOM Error: {e} - Exiting to trigger restart")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": MODEL_ID}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
