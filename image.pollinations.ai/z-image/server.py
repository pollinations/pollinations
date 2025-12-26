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
from diffusers import ZImagePipeline, StableDiffusionUpscalePipeline
from gfpgan import GFPGANer
import mediapipe as mp
import time
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import warnings
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor, as_completed
from utility import ( 
    StableDiffusionSafetyChecker, 
    replace_numpy_with_python, 
    replace_sets_with_lists, 
    numpy_to_pil,
    detect_faces_mediapipe,
    slice_into_non_overlapping_blocks,
    stitch_non_overlapping_blocks,
    get_subject_aware_blocks_no_padding,
    is_flat_or_smooth_block,
    enforce_upscaler_ratio,
    restore_faces_in_upscaled_image,
    upscale_block_wrapper ,
    blend_block_seams
    )
from utility import UPSCALE_FACTOR, MAX_CONCURRENT_UPSCALES, generate_lock, upscale_stats
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




MODEL_ID = "Tongyi-MAI/Z-Image-Turbo"
MODEL_CACHE = "model_cache"
UPSCALER_MODEL_ID = "stabilityai/stable-diffusion-x4-upscaler"
FACE_ENHANCER_MODEL = "model_cache/GFPGANv1.4.pth"
SAFETY_NSFW_MODEL = "CompVis/stable-diffusion-safety-checker"
MIN_GEN_SIZE = 512
MAX_GEN_SIZE = 768
BLOCK_SIZE = 128
MAX_FINAL_SIZE = 2048
ENABLE_FACE_RESTORATION = True
ENABLE_NSFW_CHECK = True
BLUR_DETECTION_THRESHOLD = 1.6
DEBUG_BLOCK_ANALYSIS = False
TARGET_LANCZOS_RATIO = 0.9
pipe = None
upscaler_pipeline = None
face_enhancer = None
face_detector = None
heartbeat_task = None
SAFETY_EXTRACTOR = None
SAFETY_MODEL = None
timing_report = {}



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
    final_w, final_h = requested_width, requested_height
    
    if final_w > MAX_FINAL_SIZE or final_h > MAX_FINAL_SIZE:
        scale = min(MAX_FINAL_SIZE / final_w, MAX_FINAL_SIZE / final_h)
        final_w = int(final_w * scale)
        final_h = int(final_h * scale)
    
    max_dim = max(final_w, final_h)
    
    if max_dim > MAX_GEN_SIZE:
        scale = MAX_GEN_SIZE / max_dim
        gen_w = int(final_w * scale)
        gen_h = int(final_h * scale)
    elif max_dim < MIN_GEN_SIZE:
        scale = MIN_GEN_SIZE / max_dim
        gen_w = int(final_w * scale)
        gen_h = int(final_h * scale)
    else:
        gen_w, gen_h = final_w, final_h
    
    gen_w = max(256, (gen_w // 16) * 16)
    gen_h = max(256, (gen_h // 16) * 16)
    
    return gen_w, gen_h, final_w, final_h



@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipe, upscaler_pipeline, face_enhancer, face_detector, heartbeat_task, SAFETY_EXTRACTOR, SAFETY_MODEL
    logger.info("Starting up...")
    load_model_time = time.time()
    try:
        pipe = ZImagePipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=MODEL_CACHE,
            low_cpu_mem_usage=False,
        ).to("cuda")
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except:
            pass
        
        upscaler_pipeline = StableDiffusionUpscalePipeline.from_pretrained(
            UPSCALER_MODEL_ID,
            torch_dtype=torch.float32,
            cache_dir=MODEL_CACHE,
        ).to("cuda")
        try:
            upscaler_pipeline.enable_xformers_memory_efficient_attention()
        except:
            upscaler_pipeline.enable_attention_slicing()
        upscaler_pipeline.vae.to(torch.float32)
        
        face_enhancer = GFPGANer(
            model_path=FACE_ENHANCER_MODEL,
            upscale=4,
            arch='clean',
            channel_multiplier=2,
            bg_upsampler=None,
            device="cuda"
        )
        
        mp_face_detection = mp.solutions.face_detection
        face_detector = mp_face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.5
        )
        
        if ENABLE_NSFW_CHECK:
            SAFETY_EXTRACTOR = AutoFeatureExtractor.from_pretrained(
                SAFETY_NSFW_MODEL,
                cache_dir="model_cache"
            )
            SAFETY_MODEL = StableDiffusionSafetyChecker.from_pretrained(
                SAFETY_NSFW_MODEL,
                cache_dir="model_cache"
            ).to("cuda")
        
        load_model_time_end = time.time()
        elapsed = load_model_time_end - load_model_time
        logger.info(f"Time to load models: {elapsed:.2f} seconds")
        logger.info("Models loaded successfully")
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


app = FastAPI(title="Z-Image-Turbo API", lifespan=lifespan)


def verify_enter_token(x_enter_token: str = Header(None, alias="x-enter-token")):
    expected_token = os.getenv("PLN_ENTER_TOKEN")
    if not expected_token:
        logger.warning("PLN_ENTER_TOKEN not configured - allowing request")
        return True
    if x_enter_token != expected_token:
        logger.warning("Invalid or missing PLN_ENTER_TOKEN")
        raise HTTPException(status_code=403, detail="Unauthorized")
    return True


def check_nsfw(image_array):
    if not ENABLE_NSFW_CHECK:
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
    
    gen_w, gen_h, final_w, final_h = calculate_generation_dimensions(request.width, request.height)
    logger.info(f"Requested: {request.width}x{request.height} -> Generation: {gen_w}x{gen_h} -> Final: {final_w}x{final_h}")
    
    try:
        with generate_lock:
            logger.info("Generating base image with Z-Image...")
            gen_start = time.time()
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
            logger.info(f"Base generation took {time.time() - gen_start:.2f}s")
            
            if ENABLE_NSFW_CHECK:
                has_nsfw, concepts = check_nsfw(image_np)
                if has_nsfw:
                    logger.warning(f"NSFW detected: {concepts}")
                    raise HTTPException(status_code=400, detail="NSFW content detected")
                else:
                    logger.info("No NSFW content detected.")
            
            faces = []
            if ENABLE_FACE_RESTORATION:
                logger.info("Detecting faces in base image...")
                faces = detect_faces_mediapipe(image_np, face_detector)
                logger.info(f"Detected {len(faces)} face(s)")
            
            logger.info("Slicing image into non-overlapping 128x128 blocks...")
            slice_start = time.time()
            blocks, block_positions, edge_regions = slice_into_non_overlapping_blocks(
                image_np, BLOCK_SIZE
            )
            logger.info(f"Block slicing took {time.time() - slice_start:.2f}s")
            upscale_stats["total_blocks"] = len(blocks)
            logger.info(f"Created {len(blocks)} blocks + {len(edge_regions)} edge regions from {image_np.shape[:2]} image")
            
            # Calculate global brightness statistics for normalization
            from utility import calculate_global_stats
            global_mean, global_std = calculate_global_stats(blocks)
            logger.info(f"Global brightness stats - Mean: {global_mean:.2f}, Std: {global_std:.2f}")
            
            logger.info("Detecting main subject using saliency analysis...")
            subject_blocks = get_subject_aware_blocks_no_padding(image_np, blocks, block_positions, BLOCK_SIZE)
            
            logger.info("Analyzing blocks for very flat areas...")
            flat_blocks = set()
            for idx, block in enumerate(blocks):
                if idx not in subject_blocks and is_flat_or_smooth_block(block):
                    flat_blocks.add(idx)
            
            logger.info(f"Block classification before ratio enforcement:")
            logger.info(f"  Subject blocks (SDXL): {len(subject_blocks)}")
            logger.info(f"  Very flat background blocks (LANCZOS): {len(flat_blocks)}")
            logger.info(f"  Detail blocks (SDXL): {len(blocks) - len(flat_blocks) - len(subject_blocks)}")
            
            sdxl_blocks_final, lanczos_blocks_final = enforce_upscaler_ratio(
                len(blocks), subject_blocks, flat_blocks, TARGET_LANCZOS_RATIO
            )
            
            logger.info(f"Upscaling {len(blocks)} blocks (max {MAX_CONCURRENT_UPSCALES} concurrent)...")
            upscale_start = time.time()
            
            upscaled_blocks = [None] * len(blocks)
            sdxl_count = 0
            lanczos_count = 0
            
            with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_UPSCALES) as executor:
                futures = {}
                for idx, block in enumerate(blocks):
                    use_simple = idx in lanczos_blocks_final
                    future = executor.submit(upscale_block_wrapper, idx, block, upscaler_pipeline, use_simple)
                    futures[future] = idx
                
                for future in as_completed(futures):
                    try:
                        idx, upscaled_block, used_simple = future.result()
                        upscaled_blocks[idx] = upscaled_block
                        if used_simple:
                            lanczos_count += 1
                        else:
                            sdxl_count += 1
                        logger.info(f"Block {idx} completed ({'LANCZOS' if used_simple else 'SDXL'})")
                    except Exception as e:
                        logger.error(f"Block {futures[future]} failed: {e}")
                        raise
            
            upscale_stats["sdxl_blocks"] = sdxl_count
            upscale_stats["lanczos_blocks"] = lanczos_count
            logger.info(f"Block upscaling took {time.time() - upscale_start:.2f}s")
            
            logger.info("Stitching blocks seamlessly...")
            stitch_start = time.time()
            upscaled_image = stitch_non_overlapping_blocks(
                upscaled_blocks, block_positions, edge_regions, 
                image_np.shape[:2], BLOCK_SIZE, UPSCALE_FACTOR
            )

            # Blend seams to smooth block transitions
            logger.info("Blending block seams...")
            upscaled_image = blend_block_seams(upscaled_image, upscaled_blocks, block_positions, BLOCK_SIZE, UPSCALE_FACTOR)
            logger.info(f"Block stitching took {time.time() - stitch_start:.2f}s")
            logger.info(f"Stitched result: {upscaled_image.shape}")
            
            if ENABLE_FACE_RESTORATION and len(faces) > 0:
                logger.info("Applying face restoration to upscaled image...")
                face_restore_start = time.time()
                result = restore_faces_in_upscaled_image(upscaled_image, faces, face_enhancer, UPSCALE_FACTOR)
                logger.info(f"Face restoration took {time.time() - face_restore_start:.2f}s")
            else:
                result = upscaled_image
            
            logger.info(f"Resizing to requested dimensions: {request.width}x{request.height}")
            result_pil = Image.fromarray(result.astype(np.uint8))
            result_pil = result_pil.resize((request.width, request.height), Image.Resampling.LANCZOS)
            
            logger.info("Encoding result image...")
            img_byte_arr = io.BytesIO()
            result_pil.save(img_byte_arr, format='JPEG', quality=95)
            img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
            
            logger.info("\n" + "="*50)
            logger.info("BLOCK UPSCALING STATISTICS")
            logger.info("="*50)
            logger.info(f"Total blocks formed...................... {upscale_stats['total_blocks']}")
            logger.info(f"Blocks upscaled via SDXL................ {upscale_stats['sdxl_blocks']}")
            logger.info(f"Blocks upscaled via LANCZOS............. {upscale_stats['lanczos_blocks']}")
            logger.info(f"Faces enhanced in final image........... {upscale_stats['face_enhanced_blocks']}")
            logger.info("="*50)
            
            response_content = [{
                "image": img_base64,
                "has_nsfw_concept": False,
                "concept": [],
                "width": result_pil.width,
                "height": result_pil.height,
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