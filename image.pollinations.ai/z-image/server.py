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
from spandrel import ImageModelDescriptor, ModelLoader
import time
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, ValidationInfo
import threading
import warnings
from contextlib import asynccontextmanager
import math
from utility import StableDiffusionSafetyChecker, replace_numpy_with_python, replace_sets_with_lists, numpy_to_pil
from transformers import AutoFeatureExtractor

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
            port = int(os.getenv("PUBLIC_PORT", os.getenv("PORT", "10002")))
            url = f"http://{public_ip}:{port}"
            service_type = os.getenv("SERVICE_TYPE", "zimage")
            # Use direct EC2 endpoint to bypass Cloudflare (some io.net IPs are blocked)
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


MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
SPAN_MODEL_PATH = "model_cache/span/2x-NomosUni_span_multijpg.pth"
SAFETY_NSFW_MODEL = "CompVis/stable-diffusion-safety-checker"
UPSCALE_FACTOR = 2
MAX_GEN_PIXELS = 768 * 768  # Generate natively up to this size
MAX_FINAL_PIXELS = 768 * 768 * 4  # Max output size with 2x upscaling
ENABLE_SPAN_UPSCALER = True

generate_lock = threading.Lock()


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, ge=256, le=4096)
    height: int = Field(default=1024, ge=256, le=4096)
    seed: int | None = None
    
    @field_validator('height')
    @classmethod
    def validate_total_pixels(cls, height: int, info: ValidationInfo) -> int:
        """Validate total pixel count doesn't exceed MAX_FINAL_PIXELS"""
        if 'width' in info.data:
            width = info.data['width']
            total_pixels = width * height
            if total_pixels > MAX_FINAL_PIXELS:
                raise ValueError(
                    f"Requested {width}x{height} = {total_pixels:,} pixels exceeds limit of {MAX_FINAL_PIXELS:,} pixels. "
                    f"Max: 1536x1536 or equivalent area."
                )
        return height


def calc_time(start, end, msg):
    elapsed = end - start
    print(f"{msg} time: {elapsed:.2f} seconds")


def calculate_generation_dimensions(requested_width: int, requested_height: int) -> tuple[int, int, int, int, bool]:
    """Calculate generation dimensions with SPAN 2x upscaling support.
    
    Returns: (gen_w, gen_h, final_w, final_h, should_upscale)
    """
    # Cap final size to MAX_FINAL_PIXELS, preserving aspect ratio
    final_w, final_h = requested_width, requested_height
    total_pixels = final_w * final_h
    
    if total_pixels > MAX_FINAL_PIXELS:
        scale = math.sqrt(MAX_FINAL_PIXELS / total_pixels)
        final_w = round(final_w * scale)
        final_h = round(final_h * scale)
    
    # Determine if upscaling needed
    final_pixels = final_w * final_h
    should_upscale = final_pixels > MAX_GEN_PIXELS
    
    # Calculate generation dimensions
    if should_upscale:
        gen_w = final_w // UPSCALE_FACTOR
        gen_h = final_h // UPSCALE_FACTOR
    else:
        gen_w, gen_h = final_w, final_h
    
    # Align to 16px multiples (model requirement)
    gen_w = round(gen_w / 16) * 16
    gen_h = round(gen_h / 16) * 16
    
    # Enforce minimum generation size
    gen_w = max(gen_w, 256)
    gen_h = max(gen_h, 256)
    
    # Calculate actual final dimensions
    if should_upscale:
        final_w = gen_w * UPSCALE_FACTOR
        final_h = gen_h * UPSCALE_FACTOR
    else:
        final_w, final_h = gen_w, gen_h
    
    return gen_w, gen_h, final_w, final_h, should_upscale


# Global model instances (initialized in lifespan)
pipe = None
upscaler = None  # SPAN 2x upscaler
heartbeat_task = None
SAFETY_EXTRACTOR = None
SAFETY_MODEL = None


def upscale_with_span(image_np: np.ndarray) -> np.ndarray:
    """Upscale image using SPAN 2x model."""
    if upscaler is None:
        raise RuntimeError("Upscaler not loaded")
    
    # Convert to tensor: HWC uint8 -> CHW float [0,1] -> NCHW
    img_float = image_np.astype(np.float32) / 255.0
    tensor = torch.from_numpy(img_float).permute(2, 0, 1).unsqueeze(0).cuda()
    
    with torch.no_grad():
        output = upscaler(tensor)
    
    # Convert back: NCHW -> CHW -> HWC uint8
    result = output.squeeze(0).permute(1, 2, 0).cpu().numpy()
    result = np.clip(result * 255, 0, 255).astype(np.uint8)
    return result


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown of the application."""
    global pipe, upscaler, heartbeat_task, SAFETY_EXTRACTOR, SAFETY_MODEL
    
    logger.info("Starting up...")
    
    # Load models
    load_model_time = time.time()
    try:
        pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
            low_cpu_mem_usage=False,  # Faster loading
        ).to("cuda")
        
        # Load SPAN 2x upscaler using Spandrel (if enabled)
        if ENABLE_SPAN_UPSCALER:
            logger.info(f"Loading SPAN upscaler from {SPAN_MODEL_PATH}")
            upscaler = ModelLoader().load_from_file(SPAN_MODEL_PATH)
            assert isinstance(upscaler, ImageModelDescriptor), f"Expected ImageModelDescriptor, got {type(upscaler)}"
            upscaler.cuda().eval()
            logger.info(f"SPAN upscaler loaded: scale={upscaler.scale}x")
        else:
            logger.info("SPAN upscaler disabled")
        
        # Initialize NSFW safety checker
        if not is_safety_checker_enabled():
            logger.warning("Safety checker disabled (ENABLE_SAFETY_CHECKER env var)")
            SAFETY_EXTRACTOR = None
            SAFETY_MODEL = None
        else:
            SAFETY_EXTRACTOR = AutoFeatureExtractor.from_pretrained(
                SAFETY_NSFW_MODEL,
                cache_dir="model_cache"
            )
            SAFETY_MODEL = StableDiffusionSafetyChecker.from_pretrained(
                SAFETY_NSFW_MODEL,
                cache_dir="model_cache"
            ).to("cuda")
        
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


app = FastAPI(title="Z-Image-Turbo API", lifespan=lifespan)


def _truthy_env(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip() in {"1", "true", "TRUE", "yes", "YES"}


def is_safety_checker_enabled() -> bool:
    # Disabled by default. Can be explicitly enabled via ENABLE_SAFETY_CHECKER.
    enable_value = os.getenv("ENABLE_SAFETY_CHECKER")
    if enable_value is None:
        return False

    return _truthy_env(enable_value)


def verify_backend_token(
    x_backend_token: str = Header(None, alias="x-backend-token"),
    x_enter_token: str = Header(None, alias="x-enter-token"),  # Legacy fallback
):
    """Verify backend authentication token.
    
    Accepts either x-backend-token (new) or x-enter-token (legacy) header.
    Validates against PLN_IMAGE_BACKEND_TOKEN or PLN_ENTER_TOKEN env var.
    """
    # Get expected token - prefer PLN_IMAGE_BACKEND_TOKEN, fallback to PLN_ENTER_TOKEN
    expected_token = os.getenv("PLN_IMAGE_BACKEND_TOKEN") or os.getenv("PLN_ENTER_TOKEN")
    if not expected_token:
        logger.warning("PLN_IMAGE_BACKEND_TOKEN/PLN_ENTER_TOKEN not configured - allowing request")
        return True
    
    # Accept either header for backward compatibility
    provided_token = x_backend_token or x_enter_token
    if provided_token != expected_token:
        logger.warning("Invalid or missing backend token")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True


def check_nsfw(image_array, safety_checker_adj: float = 0.0):
    if not is_safety_checker_enabled():
        return False, {}
    if isinstance(image_array, np.ndarray):
        if image_array.max() <= 1.0:
            image_array = (image_array * 255).astype("uint8")
        else:
            image_array = image_array.astype("uint8")
        x_image = Image.fromarray(image_array)
        x_image = [x_image]
    elif isinstance(image_array, list) and not isinstance(image_array[0], Image.Image):
        x_image = numpy_to_pil(image_array)
    else:
        x_image = image_array if isinstance(image_array, list) else [image_array]
    if SAFETY_EXTRACTOR is None or SAFETY_MODEL is None:
        return False, {}
    safety_checker_input = SAFETY_EXTRACTOR(x_image, return_tensors="pt").to("cuda")
    has_nsfw_concept, concepts = SAFETY_MODEL(
        images=x_image,
        clip_input=safety_checker_input.pixel_values
    )
    has_nsfw_bool = bool(has_nsfw_concept[0])
    return (
        has_nsfw_bool,
        replace_numpy_with_python(replace_sets_with_lists(concepts[0] if isinstance(concepts, list) else concepts))
    )


@app.post("/generate")
def generate(request: ImageRequest, _auth: bool = Depends(verify_backend_token)):
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
                output = pipe(
                    prompt=request.prompts[0],
                    generator=generator,
                    width=gen_w,
                    height=gen_h,
                    num_inference_steps=9,  # Always use 9 steps for best quality
                    guidance_scale=0.0,
                )
            image = output.images[0]
            image_np = np.array(image)
            
            # Check for NSFW content
            has_nsfw, concepts = check_nsfw(image_np, safety_checker_adj=0.0)
            if has_nsfw:
                logger.warning(f"NSFW detected - bad_concepts: {concepts.get('bad_concepts', [])}, concept_scores: {concepts.get('concept_scores', {})}")
                raise HTTPException(status_code=400, detail="NSFW content detected")
            
            # Upscale with SPAN if needed and enabled
            if should_upscale and ENABLE_SPAN_UPSCALER:
                logger.info(f"Upscaling {gen_w}x{gen_h} -> {gen_w*UPSCALE_FACTOR}x{gen_h*UPSCALE_FACTOR} with SPAN")
                result = upscale_with_span(image_np)
            else:
                result = image_np
            
            upscaled_image = Image.fromarray(result)
        
        # Encode image (outside lock for faster response)
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
