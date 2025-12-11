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
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
from gfpgan import GFPGANer
import mediapipe as mp
import time
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import threading
import warnings
from contextlib import asynccontextmanager
import math


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

MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
UPSCALER_MODEL_x2 = "model_cache/RealESRGAN_x2plus.pth"
FACE_ENHANCER_MODEL = "model_cache/GFPGANv1.4.pth"
UPSCALE_FACTOR = 2
MAX_W, MAX_H = 4096, 4096
MAX_PIXELS = MAX_W * MAX_H

generate_lock = threading.Lock()

class ImageRequest(BaseModel):
    prompts: list[str] = Field(default=["a photo of an astronaut riding a horse on mars"], min_length=1)
    width: int = Field(default=1024, le=4096)
    height: int = Field(default=1024, le=4096)
    steps: int = Field(default=9, le=50)
    seed: int | None = None

def calc_time(start, end, msg):
    elapsed = end - start
    print(f"{msg} time: {elapsed:.2f} seconds")
def calculate_generation_dimensions(requested_width: int, requested_height: int) -> tuple[int, int, int, int]:
    gen_w = requested_width // UPSCALE_FACTOR
    gen_h = requested_height // UPSCALE_FACTOR
    if gen_w > MAX_W or gen_h > MAX_H:
        scale = min(MAX_W / gen_w, MAX_H / gen_h)
        gen_w = int(gen_w * scale)
        gen_h = int(gen_h * scale)
    if gen_w % 16 != 0:
        gen_w = math.ceil(gen_w / 16) * 16
    if gen_h % 16 != 0:
        gen_h = math.ceil(gen_h / 16) * 16
    
    gen_w = max(gen_w, 256)
    gen_h = max(gen_h, 256)
    
    # Return requested dimensions as final target
    return gen_w, gen_h, requested_width, requested_height

def detect_faces_mediapipe(image_np):
    mp_face_detection = mp.solutions.face_detection
    face_detector = mp_face_detection.FaceDetection(
        model_selection=1,
        min_detection_confidence=0.5
    )
    results = face_detector.process(image_np)
    if not results.detections:
        return []
    h, w = image_np.shape[:2]
    faces = []
    for detection in results.detections:
        bbox = detection.location_data.relative_bounding_box
        x = int(bbox.xmin * w)
        y = int(bbox.ymin * h)
        w_box = int(bbox.width * w)
        h_box = int(bbox.height * h)
        x = max(0, x)
        y = max(0, y)
        w_box = min(w_box, w - x)
        h_box = min(h_box, h - y)
        faces.append((x, y, w_box, h_box))
    return faces

def upscale_face_region(face_img_np, face_enhancer):
    _, _, face_restored = face_enhancer.enhance(
        face_img_np,
        has_aligned=False,
        only_center_face=False,
        paste_back=True
    )
    return face_restored

def upscale_background(image_np, upsampler, outscale=UPSCALE_FACTOR):
    upscaled_np, _ = upsampler.enhance(image_np, outscale=outscale)
    return upscaled_np

# Model loading
load_model_time = time.time()
pipe = ZImagePipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
    cache_dir=MODEL_CACHE,
).to("cuda")
model_x2 = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
upsampler = RealESRGANer(
    scale=2,
    model_path=UPSCALER_MODEL_x2,
    model=model_x2,
    tile=768,
    tile_pad=0,
    pre_pad=0,
    half=False,
    device="cuda"
)
face_enhancer = GFPGANer(
    model_path=FACE_ENHANCER_MODEL,
    upscale=2,
    arch='clean',
    channel_multiplier=2,
    bg_upsampler=upsampler,
    device="cuda"
)
load_model_time_end = time.time()
calc_time(load_model_time, load_model_time_end, "Time to load model")

heartbeat_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global heartbeat_task
    heartbeat_task = asyncio.create_task(periodic_heartbeat())
    yield
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass


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
    gen_w, gen_h, final_w, final_h = calculate_generation_dimensions(request.width, request.height)
    logger.info(f"Requested: {request.width}x{request.height} -> Generation: {gen_w}x{gen_h} -> Final: {final_w}x{final_h}")
    try:
        with generate_lock:
            with torch.inference_mode():
                output = pipe(
                    prompt=request.prompts[0],
                    generator=generator,
                    width=gen_w,
                    height=gen_h,
                    num_inference_steps=request.steps,
                    guidance_scale=0.0,
                )
            image = output.images[0]
            image_np = np.array(image)
            faces = detect_faces_mediapipe(image_np)
            if len(faces) > 0:
                logger.info(f"Detected {len(faces)} face(s). Using face-aware upscaling...")
                base_upscaled = upscale_background(image_np, upsampler)
                for idx, (x, y, w, h) in enumerate(faces):
                    padding = int(max(w, h) * 0.3)
                    x1 = max(0, x - padding)
                    y1 = max(0, y - padding)
                    x2 = min(image_np.shape[1], x + w + padding)
                    y2 = min(image_np.shape[0], y + h + padding)
                    face_region = image_np[y1:y2, x1:x2]
                    if face_region.shape[0] < 10 or face_region.shape[1] < 10:
                        logger.info(f"Skipping face {idx + 1} (too small)")
                        continue
                    face_upscaled = upscale_face_region(face_region, face_enhancer)
                    x1_up = x1 * UPSCALE_FACTOR
                    y1_up = y1 * UPSCALE_FACTOR
                    h_face, w_face = face_upscaled.shape[:2]
                    y2_up = min(y1_up + h_face, base_upscaled.shape[0])
                    x2_up = min(x1_up + w_face, base_upscaled.shape[1])
                    h_face = y2_up - y1_up
                    w_face = x2_up - x1_up
                    base_upscaled[y1_up:y2_up, x1_up:x2_up] = face_upscaled[:h_face, :w_face]
                result = base_upscaled
            else:
                logger.info("No faces detected. Using standard RealESRGAN upscaling...")
                result = upscale_background(image_np, upsampler)
            h_current, w_current = result.shape[:2]
            if h_current > final_h or w_current > final_w:
                y_start = (h_current - final_h) // 2
                x_start = (w_current - final_w) // 2
                result = result[y_start:y_start + final_h, x_start:x_start + final_w]
            upscaled_image = Image.fromarray(result)
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