import os
import sys
import io
import base64
import logging
import asyncio
from huggingface_hub import login 
from dotenv import load_dotenv
load_dotenv()
login (token = os.getenv("HF_TOKEN"))

# Disable Flash Attention to avoid ABI mismatch errors
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


MODEL_ID = "black-forest-labs/FLUX.1-dev"
MODEL_CACHE = "model_cache"
SANA_MODEL_PATH = "model_cache/sana/sana_1600m_1024_diffusion_fp16.safetensors"  # 2x upscaler
UPSCALE_FACTOR = 2

# Generation constraints
MAX_GEN_RESOLUTION = 768  # Always generate at 768x768
MAX_FINAL_PIXELS = 2_359_296  # 1536 × 1536 max
MAX_DIMENSION = 2048  # Max single dimension

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
    """Calculate generation dimensions with SANA 2x upscaling support.
    
    Rules:
    - Square: 1536×1536 (maximum square output)
    - Landscape: 2048×1152 (wide output)
    - Portrait: 1152×2048 (tall output)
    - Any ratio: As long as width × height ≤ 2,359,296
    
    Returns: (gen_w, gen_h, final_w, final_h, should_upscale)
    - Always generate at 768x768
    - If request > 768x768, upscale output to final dimensions
    """
    # Validate and cap dimensions
    final_w = min(requested_width, MAX_DIMENSION)
    final_h = min(requested_height, MAX_DIMENSION)
    
    # Cap to max pixels
    total_pixels = final_w * final_h
    if total_pixels > MAX_FINAL_PIXELS:
        scale = math.sqrt(MAX_FINAL_PIXELS / total_pixels)
        final_w = int(final_w * scale)
        final_h = int(final_h * scale)
    
    # Align to 16px multiples for generation
    final_w = (final_w // 16) * 16
    final_h = (final_h // 16) * 16
    
    # Generate at 768x768
    gen_w = MAX_GEN_RESOLUTION
    gen_h = MAX_GEN_RESOLUTION
    
    # Determine if upscaling is needed
    should_upscale = (final_w > gen_w or final_h > gen_h)
    
    return gen_w, gen_h, final_w, final_h, should_upscale


# Global model instances (initialized in lifespan)
pipe = None
upscaler = None  # SANA 2x upscaler
heartbeat_task = None


def upscale_with_sana(image_tensor: torch.Tensor) -> torch.Tensor:
    """Upscale image using SANA 2x model.
    
    Args:
        image_tensor: NCHW tensor in [0, 1] range
    
    Returns:
        Upscaled NCHW tensor in [0, 1] range
    """
    if upscaler is None:
        raise RuntimeError("Upscaler not loaded")
    
    with torch.no_grad():
        output = upscaler(image_tensor)
    
    return output


def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    """Convert PIL Image to NCHW tensor [0, 1]."""
    image_np = np.array(image).astype(np.float32) / 255.0
    tensor = torch.from_numpy(image_np).permute(2, 0, 1).unsqueeze(0)  # HWC -> CHW -> NCHW
    return tensor


def tensor_to_pil(tensor: torch.Tensor) -> Image.Image:
    """Convert NCHW tensor [0, 1] to PIL Image."""
    tensor = tensor.squeeze(0).permute(1, 2, 0).cpu()  # NCHW -> CHW -> HWC
    image_np = torch.clamp(tensor * 255, 0, 255).numpy().astype(np.uint8)
    return Image.fromarray(image_np)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown of the application."""
    global pipe, upscaler, heartbeat_task
    
    logger.info("Starting up...")
    
    # Load models
    load_model_time = time.time()
    try:
        pipe = FluxPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
        ).to("cuda")
        
        # Load SANA 2x upscaler using Spandrel
        logger.info(f"Loading SANA upscaler from {SANA_MODEL_PATH}")
        if os.path.exists(SANA_MODEL_PATH):
            upscaler = ModelLoader().load_from_file(SANA_MODEL_PATH)
            assert isinstance(upscaler, ImageModelDescriptor), f"Expected ImageModelDescriptor, got {type(upscaler)}"
            upscaler.cuda().eval()
            logger.info(f"SANA upscaler loaded: scale={upscaler.scale}x")
        else:
            logger.warning(f"SANA model not found at {SANA_MODEL_PATH} - upscaling disabled")
            upscaler = None
        
        load_model_time_end = time.time()
        calc_time(load_model_time, load_model_time_end, "Time to load models")
        logger.info("Models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
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
        # Lock entire pipeline: generation + upscaling (to prevent concurrent GPU ops)
        with generate_lock:
            with torch.inference_mode():
                # Generate image at 768x768
                output = pipe(
                    prompt=request.prompts[0],
                    generator=generator,
                    width=gen_w,
                    height=gen_h,
                    num_inference_steps=8,  # 8 steps for turbo
                    guidance_scale=3.5,
                )
            
            image = output.images[0]
            logger.info(f"Generated image: {image.size}")
            
            # Upscale with SANA if needed
            if should_upscale and upscaler is not None:
                logger.info(f"Upscaling {gen_w}x{gen_h} -> {final_w}x{final_h} with SANA")
                
                # Convert PIL to tensor
                image_tensor = pil_to_tensor(image).cuda()
                
                # Upscale
                upscaled_tensor = upscale_with_sana(image_tensor)
                
                # Convert back to PIL
                image = tensor_to_pil(upscaled_tensor)
                logger.info(f"Upscaled image: {image.size}")
            
            # Crop/resize to exact final dimensions if needed
            if image.size != (final_w, final_h):
                # Center crop or resize to final dimensions
                if image.size[0] > final_w or image.size[1] > final_h:
                    # Center crop
                    left = (image.size[0] - final_w) // 2
                    top = (image.size[1] - final_h) // 2
                    image = image.crop((left, top, left + final_w, top + final_h))
                else:
                    # Resize maintaining aspect ratio, then pad
                    image.thumbnail((final_w, final_h), Image.Resampling.LANCZOS)
                    new_image = Image.new("RGB", (final_w, final_h), (255, 255, 255))
                    offset = ((final_w - image.size[0]) // 2, (final_h - image.size[1]) // 2)
                    new_image.paste(image, offset)
                    image = new_image
        
        # Encode image (outside lock for faster response)
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
