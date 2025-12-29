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
# UPSCALING DISABLED - commented out for direct resolution generation
# from basicsr.archs.rrdbnet_arch import RRDBNet
# from realesrgan import RealESRGANer
# from gfpgan import GFPGANer
# import mediapipe as mp
import time
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import threading
import warnings
from contextlib import asynccontextmanager
import math
# from scipy import ndimage  # UPSCALING DISABLED - not needed without upscaling
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


MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
# UPSCALING DISABLED - commented out upscaler model paths
# UPSCALER_MODEL_x2 = "model_cache/RealESRGAN_xfsafe2plus.pth"
# FACE_ENHANCER_MODEL = "model_cache/GFPGANv1.4.pth"
SAFETY_NSFW_MODEL = "CompVis/stable-diffusion-safety-checker"
# UPSCALING DISABLED - commented out upscaling constants
# UPSCALE_FACTOR = 2
# MIN_GEN_PIXELS = 512 * 512  # Upscale when generating at 512x512 or larger (final size >= 1024x1024)
MAX_FINAL_PIXELS = 1280 * 1280  # ~1.64M pixels

generate_lock = threading.Lock()


class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, le=4096)
    height: int = Field(default=1024, le=4096)
    seed: int | None = None


def calc_time(start, end, msg):
    elapsed = end - start
    print(f"{msg} time: {elapsed:.2f} seconds")


def calculate_generation_dimensions(requested_width: int, requested_height: int) -> tuple[int, int, int, int, bool]:
    """Calculate generation dimensions.
    
    UPSCALING DISABLED - now generates directly at requested resolution.
    Returns: (gen_w, gen_h, final_w, final_h, should_upscale)
    - Cap final size to MAX_FINAL_SIZE (preserving aspect ratio)
    - Generate at requested resolution (no upscaling)
    """
    # Cap final dimensions by total pixel count, preserving aspect ratio
    final_w, final_h = requested_width, requested_height
    current_pixels = final_w * final_h
    if current_pixels > MAX_FINAL_PIXELS:
        scale = math.sqrt(MAX_FINAL_PIXELS / current_pixels)
        final_w = int(final_w * scale)
        final_h = int(final_h * scale)
    
    # UPSCALING DISABLED - generate at full resolution directly
    # Old upscaling logic commented out:
    # halved_w = final_w // UPSCALE_FACTOR
    # halved_h = final_h // UPSCALE_FACTOR
    # halved_pixels = halved_w * halved_h
    # 
    # if halved_pixels >= MIN_GEN_PIXELS:
    #     # Large request: generate at half resolution, then upscale
    #     gen_w, gen_h = halved_w, halved_h
    #     should_upscale = True
    # else:
    #     # Small request: generate at full resolution, no upscaling
    #     gen_w, gen_h = final_w, final_h
    #     should_upscale = False
    
    # Generate at full resolution, no upscaling
    gen_w, gen_h = final_w, final_h
    should_upscale = False
    
    # Align to 16px multiples (required by model)
    if gen_w % 16 != 0:
        gen_w = math.ceil(gen_w / 16) * 16
    if gen_h % 16 != 0:
        gen_h = math.ceil(gen_h / 16) * 16
    
    # Minimum generation size
    gen_w = max(gen_w, 256)
    gen_h = max(gen_h, 256)
    
    return gen_w, gen_h, final_w, final_h, should_upscale


# UPSCALING DISABLED - All upscaling helper functions commented out
# def detect_faces_mediapipe(image_np, face_detector):
#     """Detect faces using pre-initialized MediaPipe detector."""
#     results = face_detector.process(image_np)
#     if not results.detections:
#         return []
#     h, w = image_np.shape[:2]
#     faces = []
#     for detection in results.detections:
#         bbox = detection.location_data.relative_bounding_box
#         x = int(bbox.xmin * w)
#         y = int(bbox.ymin * h)
#         w_box = int(bbox.width * w)
#         h_box = int(bbox.height * h)
#         x = max(0, x)
#         y = max(0, y)
#         w_box = min(w_box, w - x)
#         h_box = min(h_box, h - y)
#         # Skip invalid face regions
#         if w_box > 0 and h_box > 0:
#             faces.append((x, y, w_box, h_box))
#     return faces
#
#
# def upscale_face_region(face_img_np, face_enhancer):
#     _, _, face_restored = face_enhancer.enhance(
#         face_img_np,
#         has_aligned=False,
#         only_center_face=False,
#         paste_back=True
#     )
#     return face_restored
#
#
# def upscale_background(image_np, upsampler, outscale=UPSCALE_FACTOR):
#     upscaled_np, _ = upsampler.enhance(image_np, outscale=outscale)
#     return upscaled_np
#
#
# def blend_face_region(base_image, face_image, y1, x1, y2, x2, feather_width=20):
#     """Blend face region into base image with feathering to avoid hard edges."""
#     # Ensure bounds are valid
#     y1, x1 = max(0, y1), max(0, x1)
#     y2 = min(base_image.shape[0], y2)
#     x2 = min(base_image.shape[1], x2)
#     
#     h_target = y2 - y1
#     w_target = x2 - x1
#     
#     if h_target <= 0 or w_target <= 0:
#         return
#     
#     # Resize face image to match target region
#     face_resized = face_image[:h_target, :w_target]
#     if face_resized.shape[:2] != (h_target, w_target):
#         face_pil = Image.fromarray(face_resized)
#         face_pil = face_pil.resize((w_target, h_target), Image.Resampling.LANCZOS)
#         face_resized = np.array(face_pil)
#     
#     # Create feathering mask (Gaussian blur on edges)
#     mask = np.ones((h_target, w_target), dtype=np.float32)
#     feather_width = min(feather_width, h_target // 4, w_target // 4)
#     
#     if feather_width > 0:
#         # Create gradient edges
#         for i in range(feather_width):
#             alpha = i / feather_width
#             mask[i, :] *= alpha
#             mask[-(i+1), :] *= alpha
#             mask[:, i] *= alpha
#             mask[:, -(i+1)] *= alpha
#     
#     # Apply alpha blending
#     mask = mask[:, :, np.newaxis]
#     base_image[y1:y2, x1:x2] = (
#         face_resized * mask + 
#         base_image[y1:y2, x1:x2] * (1 - mask)
#     ).astype(np.uint8)


# Global model instances (initialized in lifespan)
pipe = None
# UPSCALING DISABLED - commented out upscaler globals
# upsampler = None
# face_enhancer = None
# face_detector = None
heartbeat_task = None
SAFETY_EXTRACTOR = None
SAFETY_MODEL = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown of the application."""
    # UPSCALING DISABLED - removed upsampler, face_enhancer, face_detector from globals
    global pipe, heartbeat_task, SAFETY_EXTRACTOR, SAFETY_MODEL
    
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
        
        # UPSCALING DISABLED - commented out upscaler initialization
        # model_x2 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        # upsampler = RealESRGANer(
        #     scale=2,
        #     model_path=UPSCALER_MODEL_x2,
        #     model=model_x2,
        #     tile=768,
        #     tile_pad=0,
        #     pre_pad=0,
        #     half=True,
        #     device="cuda"
        # )
        # 
        # face_enhancer = GFPGANer(
        #     model_path=FACE_ENHANCER_MODEL,
        #     upscale=2,
        #     arch='clean',
        #     channel_multiplier=2,
        #     bg_upsampler=upsampler,
        #     device="cuda"
        # )
        # 
        # # Initialize MediaPipe face detector once
        # mp_face_detection = mp.solutions.face_detection
        # face_detector = mp_face_detection.FaceDetection(
        #     model_selection=1,
        #     min_detection_confidence=0.5
        # )
        
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
    # UPSCALING DISABLED - face_detector cleanup commented out
    # if face_detector:
    #     face_detector.close()


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


def verify_enter_token(x_enter_token: str = Header(None, alias="x-enter-token")):
    expected_token = os.getenv("PLN_ENTER_TOKEN")
    if not expected_token:
        logger.warning("PLN_ENTER_TOKEN not configured - allowing request")
        return True
    if x_enter_token != expected_token:
        logger.warning("Invalid or missing PLN_ENTER_TOKEN")
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
            
            # Check for NSFW content
            has_nsfw, concepts = check_nsfw(image_np, safety_checker_adj=0.0)
            if has_nsfw:
                logger.warning(f"NSFW detected - bad_concepts: {concepts.get('bad_concepts', [])}, concept_scores: {concepts.get('concept_scores', {})}")
                raise HTTPException(status_code=400, detail="NSFW content detected")
            
            # UPSCALING DISABLED - use generated image directly
            result = image_np
            
            # Old upscaling logic commented out:
            # if should_upscale:
            #     # Detect faces for face-aware upscaling
            #     faces = detect_faces_mediapipe(image_np, face_detector)
            #     
            #     if len(faces) > 0:
            #         logger.info(f"Detected {len(faces)} face(s). Using face-aware upscaling...")
            #         base_upscaled = upscale_background(image_np, upsampler)
            #         
            #         for idx, (x, y, w, h) in enumerate(faces):
            #             padding = int(max(w, h) * 0.3)
            #             x1 = max(0, x - padding)
            #             y1 = max(0, y - padding)
            #             x2 = min(image_np.shape[1], x + w + padding)
            #             y2 = min(image_np.shape[0], y + h + padding)
            #             
            #             face_region = image_np[y1:y2, x1:x2]
            #             if face_region.shape[0] < 10 or face_region.shape[1] < 10:
            #                 logger.info(f"Skipping face {idx + 1} (too small)")
            #                 continue
            #             
            #             face_upscaled = upscale_face_region(face_region, face_enhancer)
            #             
            #             # Blend with feathering instead of hard paste
            #             x1_up = x1 * UPSCALE_FACTOR
            #             y1_up = y1 * UPSCALE_FACTOR
            #             x2_up = (x2) * UPSCALE_FACTOR
            #             y2_up = (y2) * UPSCALE_FACTOR
            #             
            #             blend_face_region(base_upscaled, face_upscaled, y1_up, x1_up, y2_up, x2_up, feather_width=20)
            #         
            #         result = base_upscaled
            #     else:
            #         logger.info("No faces detected. Using standard RealESRGAN upscaling...")
            #         result = upscale_background(image_np, upsampler)
            # else:
            #     # No upscaling needed - use generated image directly
            #     logger.info("Small resolution - skipping upscaling")
            #     result = image_np
            
            # Crop to final dimensions
            h_current, w_current = result.shape[:2]
            if h_current > final_h or w_current > final_w:
                y_start = (h_current - final_h) // 2
                x_start = (w_current - final_w) // 2
                result = result[y_start:y_start + final_h, x_start:x_start + final_w]
            
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
